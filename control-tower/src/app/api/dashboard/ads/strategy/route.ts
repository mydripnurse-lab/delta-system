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
    return s(v).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}
function ensureHttp(urlStr: string) {
    const raw = s(urlStr);
    if (!raw) return "";
    if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
    return `https://${raw}`;
}
function joinUrl(base: string, pth: string) {
    const b = ensureHttp(base).replace(/\/+$/g, "");
    const p = `/${s(pth).replace(/^\/+/g, "")}`;
    return b + p;
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
    if (k.includes("weight") || k.includes("lean")) return "weight";
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
function regionFromCampaignName(name: string) {
    const raw = s(name);
    if (!raw) return "";
    const m = raw.match(/my\s+drip\s+nurse\s+(.+?)\s*-\s*/i);
    if (m?.[1]) return s(m[1]);
    const chunks = raw.split("-");
    return s(chunks[0]);
}

type KeywordAgg = {
    keyword: string;
    theme: string;
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
        `select root_domain from app.organization_settings where organization_id = $1 limit 1`,
        [tenantId],
    );
    const stateQ = await pool.query<{ state_name: string; payload: Record<string, unknown> }>(
        `select state_name, payload from app.organization_state_files where organization_id = $1`,
        [tenantId],
    );
    const rootDomain = ensureHttp(s(rootQ.rows[0]?.root_domain || ""));
    const states = new Map<string, string>();
    const counties = new Map<string, string>();
    const cities = new Map<string, string>();

    for (const row of stateQ.rows || []) {
        const stateName = s(row.state_name);
        if (stateName && rootDomain) states.set(normGeo(stateName), rootDomain);
        const payload = row.payload || {};
        const payloadStateDomain = ensureHttp(s((payload as Record<string, unknown>).stateDomain));
        if (stateName && payloadStateDomain) states.set(normGeo(stateName), payloadStateDomain);
        const countiesArr = Array.isArray((payload as Record<string, unknown>).counties)
            ? ((payload as Record<string, unknown>).counties as Array<Record<string, unknown>>)
            : [];
        for (const county of countiesArr) {
            const countyName = s(county.countyName || county.county || county.name);
            const countyDomain = ensureHttp(s(county.countyDomain || county.domain));
            if (countyName && countyDomain) counties.set(normGeo(countyName), countyDomain);
            const citiesArr = Array.isArray(county.cities) ? (county.cities as Array<Record<string, unknown>>) : [];
            for (const city of citiesArr) {
                const cityName = s(city.cityName || city.city || city.name);
                const cityDomain = ensureHttp(s(city.cityDomain || city.domain));
                if (cityName && cityDomain) cities.set(normGeo(cityName), cityDomain);
            }
        }
    }

    return { rootDomain, states, counties, cities };
}

function pickCtaUrl(input: {
    theme: string;
    regionHint: string;
    keywords: string[];
    geo: GeoIndex;
    landing: LandingMap;
}) {
    const serviceId = serviceIdFromTheme(input.theme);
    const service = (input.landing.services || []).find((x) => x.id === serviceId)
        || (input.landing.services || []).find((x) => x.id === "services_overview")
        || null;
    const pathCandidate = s(service?.formPath) || s(service?.bookingPath) || s(service?.landingPath) || "/";

    const haystack = normGeo([input.regionHint, ...(input.keywords || [])].join(" "));
    const stateHit = Array.from(input.geo.states.entries()).find(([k]) => haystack.includes(k));
    const countyHit = Array.from(input.geo.counties.entries()).find(([k]) => haystack.includes(k));
    const cityHit = Array.from(input.geo.cities.entries()).find(([k]) => haystack.includes(k));

    const domain = cityHit?.[1] || countyHit?.[1] || stateHit?.[1] || input.geo.rootDomain || "";
    return {
        ctaUrl: domain ? joinUrl(domain, pathCandidate) : "",
        geoMatch: cityHit ? "city" : countyHit ? "county" : stateHit ? "state" : "root",
        serviceId,
    };
}

async function maybeAiSummary(input: {
    summary: Record<string, unknown>;
    revenue: number;
    keywordStrategy: KeywordAgg[];
    campaignDrafts: Array<Record<string, unknown>>;
}) {
    if (!openaiClient) return null;
    try {
        const schema = {
            type: "object",
            additionalProperties: false,
            properties: {
                executive_summary: { type: "string" },
                kpi_focus: { type: "array", maxItems: 5, items: { type: "string" } },
                next_actions: { type: "array", maxItems: 7, items: { type: "string" } },
            },
            required: ["executive_summary", "kpi_focus", "next_actions"],
        };
        const resp = await openaiClient.responses.create({
            model: "gpt-5.2",
            reasoning: { effort: "low" },
            input: [
                {
                    role: "system",
                    content:
                        "You are a performance marketing strategist for Google Ads. " +
                        "Use only provided numeric data, prioritize ROI, and keep actions executable this week.",
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

        if (!tenantId) {
            return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
        }

        const [landing, geo] = await Promise.all([
            loadLandingMap(),
            loadGeoIndex(tenantId),
        ]);

        const baseParams = new URLSearchParams();
        baseParams.set("range", range);
        if (range === "custom" && start && end) {
            baseParams.set("start", start);
            baseParams.set("end", end);
        }
        baseParams.set("tenantId", tenantId);
        baseParams.set("integrationKey", integrationKey);
        baseParams.set("compare", "1");

        const adsSyncUrl = `${origin}/api/dashboard/ads/sync?${baseParams.toString()}`;
        const gscSyncUrl = `${origin}/api/dashboard/gsc/sync?${baseParams.toString()}`;
        await Promise.all([
            fetch(adsSyncUrl, { cache: "no-store" }),
            fetch(gscSyncUrl, { cache: "no-store" }),
        ]);

        const adsJoinUrl = `${origin}/api/dashboard/ads/join?${baseParams.toString()}`;
        const gscJoinUrl = `${origin}/api/dashboard/gsc/join?${baseParams.toString()}`;
        const overviewParams = new URLSearchParams();
        overviewParams.set("range", adsRangeToOverview(range));
        overviewParams.set("tenantId", tenantId);
        overviewParams.set("integrationKey", integrationKey);
        overviewParams.set("compare", "1");
        const overviewUrl = `${origin}/api/dashboard/overview?${overviewParams.toString()}`;

        const [adsRes, gscRes, overviewRes] = await Promise.all([
            fetch(adsJoinUrl, { cache: "no-store" }),
            fetch(gscJoinUrl, { cache: "no-store" }),
            fetch(overviewUrl, { cache: "no-store" }),
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
        const topCampaigns = Array.isArray(adsJson?.topCampaigns) ? adsJson.topCampaigns : [];
        const gscKeywords = Array.isArray(gscJson?.topKeywordsOverall)
            ? gscJson.topKeywordsOverall
            : Array.isArray(gscJson?.topKeywordsFiltered)
                ? gscJson.topKeywordsFiltered
                : [];

        const plannerSeeds = Array.from(
            new Set([
                ...gscKeywords.slice(0, 25).map((r: Record<string, unknown>) => s(r.query)),
                ...topKeywords.slice(0, 15).map((r: Record<string, unknown>) => s(r.keyword)),
            ].filter(Boolean)),
        ).slice(0, 20);

        let plannerError: string | null = null;
        let plannerResults: Array<Record<string, unknown>> = [];
        try {
            const planner = await googleAdsGenerateKeywordIdeas({
                tenantId,
                integrationKey,
                keywords: plannerSeeds,
                pageSize: 120,
            });
            plannerResults = planner.results as Array<Record<string, unknown>>;
        } catch (e: unknown) {
            plannerError = e instanceof Error ? e.message : "Keyword planner unavailable";
        }
        const plannerByKeyword = new Map<string, Record<string, unknown>>();
        for (const r of plannerResults) {
            plannerByKeyword.set(normKeyword(r.text), r);
        }

        const revenueNow = n(overviewJson?.executive?.transactionsRevenueNow);
        const byKeyword = new Map<string, KeywordAgg>();
        const ensure = (keywordRaw: unknown) => {
            const keyword = normKeyword(keywordRaw);
            if (!keyword) return null;
            const prev = byKeyword.get(keyword);
            if (prev) return prev;
            const planner = plannerByKeyword.get(keyword) || {};
            const created: KeywordAgg = {
                keyword,
                theme: themeFromKeyword(keyword),
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
                plannerAvgMonthlySearches: n(planner.avgMonthlySearches),
                plannerCompetition: s(planner.competition || "UNSPECIFIED"),
                plannerCompetitionIndex: n(planner.competitionIndex),
                plannerLowTopBid: n(planner.lowTopOfPageBidMicros) / 1_000_000,
                plannerHighTopBid: n(planner.highTopOfPageBidMicros) / 1_000_000,
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
            const profitableAds = item.adsConversions > 0 && item.adsCost > 0 && (item.adsConvValue / item.adsCost) >= 1;
            const adLeak = item.adsClicks >= 10 && item.adsConversions <= 0;
            const likelyNegative = negativesLexicon.some((x) => item.keyword.includes(x));
            const plannerVolume = item.plannerAvgMonthlySearches;
            const plannerCompIdx = item.plannerCompetitionIndex;
            const plannerBidMid = (item.plannerLowTopBid + item.plannerHighTopBid) / 2;

            let score = 0;
            score += clamp(item.gscImpressions / 40, 0, 35);
            score += clamp(plannerVolume / 200, 0, 20);
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
            .slice(0, 50);

        const budgetDailyCurrent = (() => {
            const totalCost = n(summary.cost);
            const startMs = Date.parse(`${s(summary.startDate)}T00:00:00Z`);
            const endMs = Date.parse(`${s(summary.endDate)}T00:00:00Z`);
            if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return Math.max(50, totalCost / 28);
            const days = Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1);
            return totalCost / days;
        })();

        const prioritized = keywordStrategy.filter((k) => k.action === "scale" || k.action === "test");
        const regions = topCampaigns
            .map((x: Record<string, unknown>) => regionFromCampaignName(s(x.campaign)))
            .filter(Boolean);
        const regionHint = regions[0] || "Core Markets";

        const themes = new Map<string, KeywordAgg[]>();
        for (const row of prioritized) {
            const arr = themes.get(row.theme) || [];
            arr.push(row);
            themes.set(row.theme, arr);
        }
        const orderedThemes = Array.from(themes.entries())
            .sort((a, b) => (b[1][0]?.score || 0) - (a[1][0]?.score || 0))
            .slice(0, 4);

        const totalSuggestedBudget = Math.max(80, Math.round(budgetDailyCurrent * 1.25));
        const weightDen = orderedThemes.reduce((acc, [, rows]) => acc + Math.max(1, rows[0]?.score || 1), 0) || 1;

        const campaignDrafts = orderedThemes.map(([theme, rows], idx) => {
            const weight = Math.max(1, rows[0]?.score || 1);
            const budgetDaily = Math.max(20, Math.round((totalSuggestedBudget * weight) / weightDen));
            const mainKeywords = rows.slice(0, 12).map((r) => r.keyword);
            const negatives = keywordStrategy
                .filter((r) => r.action === "negative" || r.action === "pause")
                .slice(0, 15)
                .map((r) => r.keyword);
            const cta = pickCtaUrl({
                theme,
                regionHint,
                keywords: mainKeywords,
                geo,
                landing,
            });

            return {
                id: `draft_${idx + 1}`,
                status: "draft",
                campaignName: `MDN | ${themeLabel(theme)} | ${regionHint}`,
                objective: rows.some((r) => r.action === "scale") ? "Scale" : "Test",
                channel: "SEARCH",
                budgetDailyUsd: budgetDaily,
                bidding: rows.some((r) => r.action === "scale")
                    ? "MAXIMIZE_CONVERSIONS_WITH_TCPA_GUARDRAIL"
                    : "MAXIMIZE_CLICKS_WITH_CPC_CAP",
                targeting: {
                    regions: [regionHint],
                    language: "en",
                    schedule: "Mon-Sun 7:00-22:00 local",
                    devices: ["mobile", "desktop"],
                },
                ctaLink: cta.ctaUrl,
                ctaGeoMatch: cta.geoMatch,
                ctaServiceId: cta.serviceId,
                adGroups: [
                    {
                        name: `${themeLabel(theme)} - High Intent`,
                        matchType: "phrase+exact",
                        keywords: mainKeywords.slice(0, 8),
                        negatives: negatives.slice(0, 10),
                        ads: [
                            {
                                headline1: `${themeLabel(theme)} in ${regionHint}`,
                                headline2: "Same-Day Mobile IV Service",
                                headline3: "Licensed Nurses, Fast Booking",
                                description:
                                    "Mobile IV therapy with transparent pricing and fast response. Book online in under 1 minute.",
                                cta: "Book Now",
                                finalUrl: cta.ctaUrl,
                            },
                        ],
                    },
                    {
                        name: `${themeLabel(theme)} - Symptom Intent`,
                        matchType: "phrase",
                        keywords: mainKeywords.slice(8, 16),
                        negatives: negatives.slice(10, 15),
                        ads: [
                            {
                                headline1: "Hydration & Recovery IV Options",
                                headline2: `Trusted in ${regionHint}`,
                                headline3: "At-Home Appointment Available",
                                description:
                                    "Get IV therapy options tailored to your goals. Fast dispatch, secure booking, and real nurse support.",
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
                rationale: rows.slice(0, 3).map((r) => r.reason),
            };
        });

        const aiSummary = await maybeAiSummary({
            summary,
            revenue: revenueNow,
            keywordStrategy: keywordStrategy.slice(0, 20),
            campaignDrafts,
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
                ads: { ok: true, range, campaigns: topCampaigns.length, keywords: topKeywords.length, terms: searchTerms.length },
                gsc: { ok: !!gscJson?.ok, keywords: gscKeywords.length, error: gscJson?.ok ? null : s(gscJson?.error) || "GSC unavailable" },
                overview: { ok: !!overviewJson?.ok, revenueNow, error: overviewJson?.ok ? null : s(overviewJson?.error) || "Overview unavailable" },
                keywordPlanner: {
                    ok: !plannerError,
                    seeds: plannerSeeds.length,
                    ideas: plannerResults.length,
                    error: plannerError,
                },
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
