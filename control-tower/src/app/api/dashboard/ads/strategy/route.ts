import { NextResponse } from "next/server";
import OpenAI from "openai";
import fs from "node:fs/promises";
import path from "node:path";
import { getDbPool } from "@/lib/db";
import { googleAdsGenerateKeywordIdeas } from "@/lib/ads/adsRest";

export const runtime = "nodejs";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

type LandingService = {
  id: string;
  landingPath?: string;
  formPath?: string;
  bookingPath?: string;
};

type LandingMap = {
  services?: LandingService[];
};

type GeoIndex = {
  rootDomain: string;
  states: Map<string, string>;
  counties: Map<string, string>;
  cities: Map<string, string>;
};

type GeoHit = {
  level: "city" | "county" | "state" | "root";
  name: string;
  key: string;
  domain: string;
};

type PlannerRow = {
  text: string;
  avgMonthlySearches: number;
  competition: string;
  competitionIndex: number;
  lowTopOfPageBidMicros: number;
  highTopOfPageBidMicros: number;
};

type KeywordAgg = {
  keyword: string;
  theme: string;
  geoLevel: "city" | "county" | "state" | "unscoped";
  geoLabel: string;
  geoKey: string;
  geoDomain: string;
  gscImpressions: number;
  gscClicks: number;
  gscCtr: number;
  gscPosition: number;
  adsImpressions: number;
  adsClicks: number;
  adsCost: number;
  adsConversions: number;
  adsConvValue: number;
  searchTermClicks: number;
  searchTermCost: number;
  searchTermConversions: number;
  plannerAvgMonthlySearches: number;
  plannerCompetition: string;
  plannerCompetitionIndex: number;
  plannerLowTopBid: number;
  plannerHighTopBid: number;
  score: number;
  action: "scale" | "test" | "pause" | "negative" | "monitor";
  reason: string;
};

let landingMapCache: LandingMap | null = null;

function s(v: unknown) {
  return String(v ?? "").trim();
}
function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}
function normKeyword(v: unknown) {
  return s(v).toLowerCase().replace(/\s+/g, " ").trim();
}
function normGeo(v: unknown) {
  return s(v)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function ensureHttp(urlStr: string) {
  const raw = s(urlStr);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `https://${raw}`;
}
function joinUrl(base: string, pth: string) {
  const b = ensureHttp(base).replace(/\/+$/g, "");
  const p = `/${s(pth).replace(/^\/+|\/+$/g, "")}`;
  return `${b}${p === "/" ? "" : p}`;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function adsRangeToOverview(range: string) {
  if (range === "last_7_days") return "7d";
  if (range === "last_28_days") return "28d";
  if (range === "last_month") return "1m";
  if (range === "last_quarter") return "3m";
  if (range === "last_6_months") return "6m";
  if (range === "last_year") return "1y";
  return "28d";
}
function themeFromKeyword(keyword: string) {
  const k = keyword.toLowerCase();
  if (k.includes("my drip nurse") || k.includes("drip nurse")) return "brand";
  if (k.includes("hangover")) return "hangover";
  if (k.includes("hydration")) return "hydration";
  if (k.includes("immunity")) return "immunity";
  if (k.includes("myers")) return "myers";
  if (k.includes("weight") || k.includes("lean") || k.includes("glp-1") || k.includes("semaglutide") || k.includes("tirzepatide")) return "weight";
  if (k.includes("mobile") || k.includes("near me")) return "local_intent";
  return "core_iv";
}
function themeLabel(theme: string) {
  if (theme === "brand") return "Brand Defense";
  if (theme === "hangover") return "Hangover Recovery";
  if (theme === "hydration") return "Hydration Therapy";
  if (theme === "immunity") return "Immunity Support";
  if (theme === "myers") return "Myers Cocktail";
  if (theme === "weight") return "Weight & Wellness";
  if (theme === "local_intent") return "Local Intent";
  return "Mobile IV Core";
}
function serviceIdFromTheme(theme: string) {
  if (theme === "hangover") return "hangover_jetlag";
  if (theme === "hydration") return "hydration";
  if (theme === "immunity") return "immunity_coldflu";
  if (theme === "myers") return "myers_cocktail";
  if (theme === "weight") return "get_lean";
  return "services_overview";
}
function tokenize(x: string) {
  return normGeo(x)
    .split(" ")
    .filter((t) => t.length >= 3 && !["for", "and", "the", "with", "near", "mobile", "therapy", "drip"].includes(t));
}
function overlapScore(a: string, b: string) {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return (2 * inter) / (ta.size + tb.size);
}

async function loadLandingMap() {
  if (landingMapCache) return landingMapCache;
  try {
    const p = path.resolve(process.cwd(), "..", "resources", "config", "campaign-landing-map.json");
    const raw = await fs.readFile(p, "utf8");
    landingMapCache = JSON.parse(raw) as LandingMap;
    return landingMapCache;
  } catch {
    landingMapCache = { services: [] };
    return landingMapCache;
  }
}

async function loadGeoIndex(tenantId: string): Promise<GeoIndex> {
  const pool = getDbPool();
  const rootQ = await pool.query<{ root_domain: string | null }>(
    "select root_domain from app.organization_settings where organization_id = $1 limit 1",
    [tenantId],
  );
  const stateQ = await pool.query<{ state_name: string; payload: Record<string, unknown> }>(
    "select state_name, payload from app.organization_state_files where organization_id = $1",
    [tenantId],
  );

  const rootDomain = ensureHttp(s(rootQ.rows[0]?.root_domain || ""));
  const states = new Map<string, string>();
  const counties = new Map<string, string>();
  const cities = new Map<string, string>();

  for (const row of stateQ.rows || []) {
    const stateName = s(row.state_name);
    const payload = row.payload || {};
    const stateDomain = ensureHttp(s((payload as Record<string, unknown>).stateDomain || rootDomain));
    if (stateName && stateDomain) states.set(normGeo(stateName), stateDomain);

    const countiesArr = Array.isArray((payload as Record<string, unknown>).counties)
      ? ((payload as Record<string, unknown>).counties as Array<Record<string, unknown>>)
      : [];

    for (const county of countiesArr) {
      const countyName = s(county.countyName || county.county || county.name);
      const countyDomain = ensureHttp(s(county.countyDomain || county.domain || stateDomain));
      if (countyName && countyDomain) counties.set(normGeo(countyName), countyDomain);

      const citiesArr = Array.isArray(county.cities)
        ? (county.cities as Array<Record<string, unknown>>)
        : [];
      for (const city of citiesArr) {
        const cityName = s(city.cityName || city.city || city.name);
        const cityDomain = ensureHttp(s(city.cityDomain || city.domain || countyDomain));
        if (cityName && cityDomain) cities.set(normGeo(cityName), cityDomain);
      }
    }
  }

  return { rootDomain, states, counties, cities };
}

function detectGeo(text: string, geo: GeoIndex): GeoHit {
  const hay = ` ${normGeo(text)} `;
  let best: GeoHit = { level: "root", name: "Core Market", key: "root", domain: geo.rootDomain };
  let bestLen = 0;

  const probe = (level: "city" | "county" | "state", map: Map<string, string>) => {
    for (const [k, domain] of map.entries()) {
      if (!k || k.length < 4) continue;
      const needle = ` ${k} `;
      if (!hay.includes(needle)) continue;
      const len = k.length;
      if (len > bestLen || (len === bestLen && level === "city" && best.level !== "city")) {
        bestLen = len;
        best = {
          level,
          name: k.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
          key: `${level}:${k}`,
          domain,
        };
      }
    }
  };

  probe("city", geo.cities);
  probe("county", geo.counties);
  probe("state", geo.states);
  return best;
}

function bestPlannerMatch(keyword: string, plannerRows: PlannerRow[]) {
  const exact = plannerRows.find((r) => normKeyword(r.text) === keyword);
  if (exact) return exact;

  let best: PlannerRow | null = null;
  let score = 0;
  for (const row of plannerRows) {
    const s0 = overlapScore(keyword, row.text);
    if (s0 > score) {
      score = s0;
      best = row;
    }
  }
  return score >= 0.34 ? best : null;
}

function pickCtaUrl(input: {
  theme: string;
  geoHit: GeoHit;
  geo: GeoIndex;
  landing: LandingMap;
}) {
  const serviceId = serviceIdFromTheme(input.theme);
  const service =
    (input.landing.services || []).find((x) => x.id === serviceId) ||
    (input.landing.services || []).find((x) => x.id === "services_overview") ||
    null;
  const pathCandidate =
    s(service?.formPath) || s(service?.bookingPath) || s(service?.landingPath) || "/";

  const domain =
    ensureHttp(input.geoHit.domain) ||
    ensureHttp(input.geo.rootDomain) ||
    "";

  return {
    ctaUrl: domain ? joinUrl(domain, pathCandidate) : "",
    geoMatch: input.geoHit.level,
    serviceId,
  };
}

async function maybeAiSummary(input: {
  summary: Record<string, unknown>;
  revenue: number;
  keywordStrategy: KeywordAgg[];
  campaignDrafts: Array<Record<string, unknown>>;
  plannerStatus: Record<string, unknown>;
}) {
  if (!openaiClient) return null;
  try {
    const schema = {
      type: "object",
      additionalProperties: false,
      properties: {
        executive_summary: { type: "string" },
        kpi_focus: { type: "array", maxItems: 6, items: { type: "string" } },
        next_actions: { type: "array", maxItems: 8, items: { type: "string" } },
      },
      required: ["executive_summary", "kpi_focus", "next_actions"],
    };

    const resp = await openaiClient.responses.create({
      model: "gpt-5.2",
      reasoning: { effort: "medium" },
      input: [
        {
          role: "system",
          content:
            "You are simultaneously: (1) a senior Google Ads specialist, " +
            "(2) a conversion rate optimization expert, and (3) a marketing data analyst. " +
            "You must use only provided data, avoid hallucinations, and make recommendations with numeric rationale. " +
            "Prioritize profitable growth: conversion volume quality, CPA, ROAS, search demand, and geo relevance.",
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ads_strategy_summary",
          schema,
        },
      },
    });

    const outText = s((resp as any)?.output_text || "");
    if (!outText) return null;
    return JSON.parse(outText);
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const origin = url.origin;
    const range = s(url.searchParams.get("range")) || "last_28_days";
    const start = s(url.searchParams.get("start"));
    const end = s(url.searchParams.get("end"));
    const tenantId = s(url.searchParams.get("tenantId"));
    const integrationKey = s(url.searchParams.get("integrationKey")) || "default";
    const integrationKeyForRevenue =
      integrationKey.toLowerCase() === "default" ? "owner" : integrationKey;

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    const [landing, geo] = await Promise.all([loadLandingMap(), loadGeoIndex(tenantId)]);

    const baseParams = new URLSearchParams();
    baseParams.set("range", range);
    if (range === "custom" && start && end) {
      baseParams.set("start", start);
      baseParams.set("end", end);
    }
    baseParams.set("tenantId", tenantId);
    baseParams.set("integrationKey", integrationKey);
    baseParams.set("compare", "1");

    await Promise.all([
      fetch(`${origin}/api/dashboard/ads/sync?${baseParams.toString()}`, { cache: "no-store" }),
      fetch(`${origin}/api/dashboard/gsc/sync?${baseParams.toString()}`, { cache: "no-store" }),
    ]);

    const overviewParams = new URLSearchParams();
    overviewParams.set("range", adsRangeToOverview(range));
    overviewParams.set("tenantId", tenantId);
    overviewParams.set("integrationKey", integrationKey);
    overviewParams.set("compare", "1");

    const [adsRes, gscRes, overviewRes] = await Promise.all([
      fetch(`${origin}/api/dashboard/ads/join?${baseParams.toString()}`, { cache: "no-store" }),
      fetch(`${origin}/api/dashboard/gsc/join?${baseParams.toString()}`, { cache: "no-store" }),
      fetch(`${origin}/api/dashboard/overview?${overviewParams.toString()}`, { cache: "no-store" }),
    ]);

    const [adsJson, gscJson, overviewJson] = await Promise.all([
      adsRes.json().catch(() => ({})),
      gscRes.json().catch(() => ({})),
      overviewRes.json().catch(() => ({})),
    ]);

    if (!adsRes.ok || !adsJson?.ok) {
      return NextResponse.json(
        { ok: false, error: s(adsJson?.error) || "Ads data unavailable" },
        { status: 502 },
      );
    }

    const summary = (adsJson?.summaryOverall || {}) as Record<string, unknown>;
    const topKeywords = Array.isArray(adsJson?.topKeywords) ? adsJson.topKeywords : [];
    const searchTerms = Array.isArray(adsJson?.searchTerms) ? adsJson.searchTerms : [];
    const gscKeywords = Array.isArray(gscJson?.topKeywordsOverall)
      ? gscJson.topKeywordsOverall
      : Array.isArray(gscJson?.topKeywordsFiltered)
        ? gscJson.topKeywordsFiltered
        : [];

    const plannerSeeds = Array.from(
      new Set(
        [
          ...gscKeywords.slice(0, 30).map((r: Record<string, unknown>) => s(r.query)),
          ...topKeywords.slice(0, 25).map((r: Record<string, unknown>) => s(r.keyword)),
        ].filter(Boolean),
      ),
    ).slice(0, 40);

    let plannerError: string | null = null;
    let plannerRows: PlannerRow[] = [];
    try {
      const planner = await googleAdsGenerateKeywordIdeas({
        tenantId,
        integrationKey,
        keywords: plannerSeeds,
        pageSize: 400,
      });
      plannerRows = (planner.results || []) as PlannerRow[];
    } catch (e: unknown) {
      plannerError = e instanceof Error ? e.message : "Keyword Planner unavailable";
    }

    const selectedStart = s(summary.startDate) || start;
    const selectedEnd = s(summary.endDate) || end;

    let txRevenueNow = 0;
    let txRevenueError = "";
    if (selectedStart && selectedEnd) {
      try {
        const txQ = new URLSearchParams();
        txQ.set("start", selectedStart);
        txQ.set("end", selectedEnd);
        txQ.set("tenantId", tenantId);
        txQ.set("integrationKey", integrationKeyForRevenue);
        const txRes = await fetch(`${origin}/api/dashboard/transactions?${txQ.toString()}`, {
          cache: "no-store",
        });
        const txJson = await txRes.json().catch(() => ({}));
        if (txRes.ok && txJson?.ok) {
          txRevenueNow = n(txJson?.kpis?.grossAmount);
        } else {
          txRevenueError = s(txJson?.error) || `HTTP ${txRes.status}`;
        }
      } catch (e: unknown) {
        txRevenueError = e instanceof Error ? e.message : "transactions fetch failed";
      }
    }

    const overviewRevenueNow = n(overviewJson?.executive?.transactionsRevenueNow);
    const revenueNow = txRevenueNow > 0 ? txRevenueNow : overviewRevenueNow;
    const byKeyword = new Map<string, KeywordAgg>();

    const ensure = (keywordRaw: unknown) => {
      const keyword = normKeyword(keywordRaw);
      if (!keyword) return null;
      const prev = byKeyword.get(keyword);
      if (prev) return prev;

      const planner = bestPlannerMatch(keyword, plannerRows);
      const geoHit = detectGeo(keyword, geo);

      const created: KeywordAgg = {
        keyword,
        theme: themeFromKeyword(keyword),
        geoLevel: geoHit.level === "root" ? "unscoped" : geoHit.level,
        geoLabel: geoHit.name,
        geoKey: geoHit.key,
        geoDomain: geoHit.domain,
        gscImpressions: 0,
        gscClicks: 0,
        gscCtr: 0,
        gscPosition: 0,
        adsImpressions: 0,
        adsClicks: 0,
        adsCost: 0,
        adsConversions: 0,
        adsConvValue: 0,
        searchTermClicks: 0,
        searchTermCost: 0,
        searchTermConversions: 0,
        plannerAvgMonthlySearches: n(planner?.avgMonthlySearches),
        plannerCompetition: s(planner?.competition || "UNSPECIFIED"),
        plannerCompetitionIndex: n(planner?.competitionIndex),
        plannerLowTopBid: n(planner?.lowTopOfPageBidMicros) / 1_000_000,
        plannerHighTopBid: n(planner?.highTopOfPageBidMicros) / 1_000_000,
        score: 0,
        action: "monitor",
        reason: "",
      };

      byKeyword.set(keyword, created);
      return created;
    };

    for (const row of gscKeywords) {
      const item = ensure((row as Record<string, unknown>).query);
      if (!item) continue;
      item.gscImpressions += n((row as Record<string, unknown>).impressions);
      item.gscClicks += n((row as Record<string, unknown>).clicks);
      item.gscCtr = item.gscImpressions > 0 ? item.gscClicks / item.gscImpressions : item.gscCtr;
      item.gscPosition = n((row as Record<string, unknown>).position) || item.gscPosition;
    }

    for (const row of topKeywords) {
      const item = ensure((row as Record<string, unknown>).keyword);
      if (!item) continue;
      item.adsImpressions += n((row as Record<string, unknown>).impressions);
      item.adsClicks += n((row as Record<string, unknown>).clicks);
      item.adsCost += n((row as Record<string, unknown>).cost);
      item.adsConversions += n((row as Record<string, unknown>).conversions);
      item.adsConvValue += n((row as Record<string, unknown>).conversionValue);
    }

    for (const row of searchTerms) {
      const item = ensure((row as Record<string, unknown>).term);
      if (!item) continue;
      item.searchTermClicks += n((row as Record<string, unknown>).clicks);
      item.searchTermCost += n((row as Record<string, unknown>).cost);
      item.searchTermConversions += n((row as Record<string, unknown>).conversions);
    }

    const negativesLexicon = ["free", "jobs", "career", "training", "certification", "diy", "cheap"];
    const words = Array.from(byKeyword.values());

    for (const item of words) {
      const ctrPenaltyOpportunity = item.gscImpressions >= 180 && item.gscCtr > 0 && item.gscCtr < 0.02;
      const rankOpportunity = item.gscImpressions >= 180 && item.gscPosition >= 6 && item.gscPosition <= 20;
      const profitableAds = item.adsConversions > 0 && item.adsCost > 0 && item.adsConvValue / item.adsCost >= 1;
      const adLeak = item.adsClicks >= 10 && item.adsConversions <= 0;
      const likelyNegative = negativesLexicon.some((x) => item.keyword.includes(x));

      const plannerVolume = item.plannerAvgMonthlySearches;
      const plannerCompIdx = item.plannerCompetitionIndex;

      let lowBid = item.plannerLowTopBid;
      let highBid = item.plannerHighTopBid;
      if ((lowBid <= 0 || highBid <= 0) && item.adsClicks > 0) {
        const cpc = item.adsCost / item.adsClicks;
        lowBid = lowBid > 0 ? lowBid : clamp(cpc * 0.8, 0, 999);
        highBid = highBid > 0 ? highBid : clamp(cpc * 1.3, 0, 999);
      }
      item.plannerLowTopBid = lowBid;
      item.plannerHighTopBid = highBid;
      const plannerBidMid = (lowBid + highBid) / 2;

      let score = 0;
      score += clamp(item.gscImpressions / 40, 0, 35);
      score += clamp(plannerVolume / 250, 0, 22);
      score += rankOpportunity ? 14 : 0;
      score += ctrPenaltyOpportunity ? 10 : 0;
      score += clamp(item.adsConversions * 8, 0, 40);
      score += profitableAds ? 18 : 0;
      score -= adLeak ? 22 : 0;
      score -= likelyNegative && item.adsConversions <= 0 ? 24 : 0;
      score -= clamp(plannerCompIdx / 35, 0, 12);
      score -= clamp(plannerBidMid / 5, 0, 8);
      score += clamp(revenueNow / 5000, 0, 8);
      score = clamp(Math.round(score), -30, 100);
      item.score = score;

      if (likelyNegative && item.adsConversions <= 0 && item.searchTermClicks >= 3) {
        item.action = "negative";
        item.reason = "Intent de bajo valor detectado; sugerido como negativo.";
      } else if (item.adsConversions >= 2 && profitableAds) {
        item.action = "scale";
        item.reason = "Keyword rentable en Ads; escalar presupuesto y cobertura.";
      } else if (adLeak && item.searchTermCost > 8) {
        item.action = "pause";
        item.reason = "Gasto sin conversión; pausar o aislar en ad group test.";
      } else if (item.gscImpressions >= 140 || plannerVolume >= 250) {
        item.action = "test";
        item.reason = "Demanda orgánica/planner detectada; probar en Search con control de CPC.";
      } else {
        item.action = "monitor";
        item.reason = "Mantener monitoreo hasta acumular más señal.";
      }
    }

    const keywordStrategy = words
      .sort((a, b) => b.score - a.score || b.adsConversions - a.adsConversions || b.gscImpressions - a.gscImpressions)
      .slice(0, 60);

    const budgetDailyCurrent = (() => {
      const totalCost = n(summary.cost);
      const startMs = Date.parse(`${s(summary.startDate)}T00:00:00Z`);
      const endMs = Date.parse(`${s(summary.endDate)}T00:00:00Z`);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return Math.max(50, totalCost / 28);
      const days = Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1);
      return totalCost / days;
    })();

    const prioritized = keywordStrategy.filter((k) => k.action === "scale" || k.action === "test");

    const grouped = new Map<string, { theme: string; geoKey: string; geoLabel: string; geoLevel: GeoHit["level"]; geoDomain: string; rows: KeywordAgg[] }>();
    for (const row of prioritized) {
      const key = `${row.theme}::${row.geoKey || "unscoped"}`;
      const prev = grouped.get(key) || {
        theme: row.theme,
        geoKey: row.geoKey || "unscoped",
        geoLabel: row.geoLabel || "Core Market",
        geoLevel: row.geoLevel === "unscoped" ? "root" : row.geoLevel,
        geoDomain: row.geoDomain || geo.rootDomain,
        rows: [],
      };
      prev.rows.push(row);
      grouped.set(key, prev);
    }

    const orderedGroups = Array.from(grouped.values())
      .sort((a, b) => (b.rows[0]?.score || 0) - (a.rows[0]?.score || 0))
      .slice(0, 6);

    const totalSuggestedBudget = Math.max(80, Math.round(budgetDailyCurrent * 1.25));
    const weightDen = orderedGroups.reduce((acc, g) => acc + Math.max(1, g.rows[0]?.score || 1), 0) || 1;

    const campaignDrafts = orderedGroups.map((g, idx) => {
      const weight = Math.max(1, g.rows[0]?.score || 1);
      const budgetDaily = Math.max(20, Math.round((totalSuggestedBudget * weight) / weightDen));
      const mainKeywords = g.rows.slice(0, 14).map((r) => r.keyword);

      const negatives = keywordStrategy
        .filter((r) => (r.action === "negative" || r.action === "pause") && (r.geoKey === g.geoKey || r.geoLevel === "unscoped"))
        .slice(0, 20)
        .map((r) => r.keyword);

      const cta = pickCtaUrl({
        theme: g.theme,
        geoHit: {
          level: g.geoLevel,
          key: g.geoKey,
          name: g.geoLabel,
          domain: g.geoDomain,
        },
        geo,
        landing,
      });

      return {
        id: `draft_${idx + 1}`,
        status: "draft",
        campaignName: `MDN | ${themeLabel(g.theme)} | ${g.geoLabel}`,
        objective: g.rows.some((r) => r.action === "scale") ? "Scale" : "Test",
        channel: "SEARCH",
        budgetDailyUsd: budgetDaily,
        bidding: g.rows.some((r) => r.action === "scale")
          ? "MAXIMIZE_CONVERSIONS_WITH_TCPA_GUARDRAIL"
          : "MAXIMIZE_CLICKS_WITH_CPC_CAP",
        targeting: {
          regions: [g.geoLabel],
          geoLevel: g.geoLevel,
          language: "en",
          schedule: "Mon-Sun 7:00-22:00 local",
          devices: ["mobile", "desktop"],
        },
        ctaLink: cta.ctaUrl,
        ctaGeoMatch: cta.geoMatch,
        ctaServiceId: cta.serviceId,
        adGroups: [
          {
            name: `${themeLabel(g.theme)} - High Intent`,
            matchType: "phrase+exact",
            keywords: mainKeywords.slice(0, 8),
            negatives: negatives.slice(0, 12),
            ads: [
              {
                headline1: `${themeLabel(g.theme)} in ${g.geoLabel}`,
                headline2: "Same-Day Mobile IV Service",
                headline3: "Licensed Nurses, Fast Booking",
                description: "Mobile IV therapy with transparent pricing and fast response. Book online in under 1 minute.",
                cta: "Book Now",
                finalUrl: cta.ctaUrl,
              },
            ],
          },
          {
            name: `${themeLabel(g.theme)} - Symptom Intent`,
            matchType: "phrase",
            keywords: mainKeywords.slice(8, 16),
            negatives: negatives.slice(12, 20),
            ads: [
              {
                headline1: "Hydration & Recovery IV Options",
                headline2: `Trusted in ${g.geoLabel}`,
                headline3: "At-Home Appointment Available",
                description: "Get IV therapy options tailored to your goals. Fast dispatch, secure booking, and real nurse support.",
                cta: "Get Started",
                finalUrl: cta.ctaUrl,
              },
            ],
          },
        ],
        extensions: {
          sitelinks: ["Pricing", "Services", "Book Appointment", "Coverage Area"],
          callouts: ["Mobile Service", "Licensed Nurses", "Same-Day Availability"],
          structuredSnippets: ["Hydration", "Immunity", "Recovery", "Myers Cocktail"],
        },
        tracking: {
          utmTemplate: "utm_source=google&utm_medium=cpc&utm_campaign={campaignid}&utm_term={keyword}",
          conversionGoal: "booked_appointment",
        },
        rationale: g.rows.slice(0, 4).map((r) => r.reason),
      };
    });

    const plannerStatus = {
      ok: !plannerError,
      seeds: plannerSeeds.length,
      ideas: plannerRows.length,
      mappedKeywords: keywordStrategy.filter((k) => k.plannerAvgMonthlySearches > 0 || k.plannerLowTopBid > 0 || k.plannerHighTopBid > 0).length,
      error: plannerError,
    };

    const aiSummary = await maybeAiSummary({
      summary,
      revenue: revenueNow,
      keywordStrategy: keywordStrategy.slice(0, 25),
      campaignDrafts,
      plannerStatus,
    });

    return NextResponse.json({
      ok: true,
      meta: {
        range,
        tenantId,
        integrationKey,
        generatedAt: new Date().toISOString(),
      },
      dataSources: {
        ads: {
          ok: true,
          range,
          keywords: topKeywords.length,
          terms: searchTerms.length,
        },
        gsc: {
          ok: !!gscJson?.ok,
          keywords: gscKeywords.length,
          error: gscJson?.ok ? null : s(gscJson?.error) || "GSC unavailable",
        },
        overview: {
          ok: !!overviewJson?.ok,
          revenueNow: overviewRevenueNow,
          error: overviewJson?.ok ? null : s(overviewJson?.error) || "Overview unavailable",
        },
        transactions: {
          ok: txRevenueNow > 0 || !txRevenueError,
          revenueNow: txRevenueNow,
          sourceRange: selectedStart && selectedEnd ? `${selectedStart}..${selectedEnd}` : null,
          integrationKey: integrationKeyForRevenue,
          error: txRevenueError || null,
        },
        keywordPlanner: plannerStatus,
      },
      scorecard: {
        revenueNow,
        adsCost: n(summary.cost),
        adsConversions: n(summary.conversions),
        adsRoas: n(summary.roas),
        candidateKeywords: byKeyword.size,
        strategicKeywords: keywordStrategy.length,
        campaignDrafts: campaignDrafts.length,
      },
      keywordStrategy,
      campaignDrafts,
      aiSummary,
      publish: {
        mode: "draft_only",
        message: "Drafts listos para revisión. Próxima fase: endpoint de publish a Google Ads API con approval gate.",
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to build ads strategy" },
      { status: 500 },
    );
  }
}
