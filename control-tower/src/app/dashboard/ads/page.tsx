"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AdsTrendChart from "@/components/AdsTrendChart";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";

type RangePreset =
  | "last_7_days"
  | "last_28_days"
  | "last_month"
  | "last_quarter"
  | "last_6_months"
  | "last_year"
  | "custom";

type AdsMetric =
  | "impressions"
  | "clicks"
  | "conversions"
  | "cost"
  | "avgCpc"
  | "ctr";

type CampaignPlaybook = {
  region: string;
  campaign: string;
  objective: "Scale" | "Efficiency" | "Recovery";
  budgetDaily: number;
  score: number;
  setup: {
    bidStrategy: string;
    adGroups: string[];
    negativeSeeds: string[];
    audienceHint: string;
  };
  funnel: {
    headline1: string;
    headline2: string;
    description: string;
    cta: string;
    landingAngle: string;
  };
};

function norm(v: any) {
  return String(v ?? "").trim();
}
function num(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtInt(v: any) {
  const n = num(v);
  return n.toLocaleString();
}
function fmtPct01(v: any) {
  // expects 0..1
  const n = num(v);
  return `${(n * 100).toFixed(2)}%`;
}
function fmtPct100(v: any) {
  // expects 0..100
  const n = num(v);
  return `${n.toFixed(2)}%`;
}
function fmtMoney(v: any) {
  const n = num(v);
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function fmtDeltaPct(x: any) {
  const n = Number(x);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}
function deltaClass(pct: any, opts?: { invert?: boolean }) {
  const n = Number(pct);
  if (!Number.isFinite(n)) return "";
  const invert = !!opts?.invert;
  if (!invert) return n < 0 ? "deltaDown" : "deltaUp";
  return n > 0 ? "deltaDown" : "deltaUp";
}

function metricLabel(m: AdsMetric) {
  if (m === "impressions") return "Impressions";
  if (m === "clicks") return "Clicks";
  if (m === "conversions") return "Conversions";
  if (m === "cost") return "Cost";
  if (m === "avgCpc") return "Avg CPC";
  return "CTR";
}
function metricUnitHint(m: AdsMetric) {
  if (m === "cost" || m === "avgCpc") return "$";
  if (m === "ctr") return "%";
  return "count";
}

function csvCell(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<unknown>>) {
  const lines = [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function extractRegionFromCampaignName(name: string) {
  const raw = norm(name);
  if (!raw) return "Unknown region";
  const direct = raw.match(/my\s+drip\s+nurse\s+(.+?)\s*-\s*/i);
  if (direct?.[1]) return norm(direct[1]);
  const county = raw.match(/([a-z\s]+county,\s*[a-z\s]+)/i);
  if (county?.[1]) return norm(county[1]);
  const cityState = raw.match(/([a-z\s]+,\s*[a-z]{2,})/i);
  if (cityState?.[1]) return norm(cityState[1]);
  return raw.split("-")[0]?.trim() || "Unknown region";
}

export default function AdsDashboardPage() {
  const searchParams = useBrowserSearchParams();
  const [loading, setLoading] = useState(false);
  const [hardRefreshing, setHardRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const [preset, setPreset] = useState<RangePreset>("last_28_days");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [compareOn, setCompareOn] = useState(true);

  const [trendMode, setTrendMode] = useState<"day" | "week" | "month">("day");
  const [metric, setMetric] = useState<AdsMetric>("cost");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiPlaybook, setAiPlaybook] = useState<any>(null);
  const [strategyLoading, setStrategyLoading] = useState(false);
  const [strategyErr, setStrategyErr] = useState("");
  const [strategyData, setStrategyData] = useState<any>(null);

  const [data, setData] = useState<any>(null);

  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);
  const integrationKeyRaw =
    String(searchParams?.get("integrationKey") || "").trim() || "default";
  const integrationKey =
    integrationKeyRaw.toLowerCase() === "owner" ? "default" : integrationKeyRaw;
  const backHref = tenantId
    ? `/dashboard?tenantId=${encodeURIComponent(tenantId)}`
    : "/dashboard";

  function attachTenantScope(p: URLSearchParams) {
    if (!tenantId) return;
    p.set("tenantId", tenantId);
    p.set("integrationKey", integrationKey);
  }

  function buildParams(force: boolean) {
    const p = new URLSearchParams();
    p.set("range", preset);

    if (preset === "custom") {
      if (customStart) p.set("start", customStart);
      if (customEnd) p.set("end", customEnd);
    }

    if (compareOn) p.set("compare", "1");
    if (force) p.set("force", "1");
    p.set("v", String(Date.now()));
    attachTenantScope(p);
    return p.toString();
  }

  async function load(opts?: { force?: boolean }) {
    if (!tenantReady) return;
    const force = !!opts?.force;
    if (!tenantId) {
      setErr(
        "Missing tenant context. Open from Control Tower or use a mapped project domain.",
      );
      return;
    }
    setErr("");
    setLoading(true);

    try {
      const syncRes = await fetch(
        `/api/dashboard/ads/sync?${buildParams(force)}`,
        {
          cache: "no-store",
        },
      );
      const syncJson = await syncRes.json();
      if (!syncRes.ok || !syncJson?.ok) {
        throw new Error(syncJson?.error || `SYNC HTTP ${syncRes.status}`);
      }

      const joinRes = await fetch(
        `/api/dashboard/ads/join?${buildParams(false)}`,
        {
          cache: "no-store",
        },
      );
      const joinJson = await joinRes.json();
      if (!joinRes.ok || !joinJson?.ok) {
        throw new Error(joinJson?.error || `JOIN HTTP ${joinRes.status}`);
      }

      setData(joinJson);
    } catch (e: any) {
      setData(null);
      setErr(e?.message || "Failed to load Google Ads dashboard");
    } finally {
      setLoading(false);
      setHardRefreshing(false);
    }
  }

  useEffect(() => {
    if (!tenantReady) return;
    if (!tenantId) {
      setErr(
        "Missing tenant context. Open from Control Tower or use a mapped project domain.",
      );
      return;
    }
    if (preset !== "custom") load();
    else if (customStart && customEnd) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, customStart, customEnd, compareOn, tenantReady, tenantId]);

  async function generateKeywordStrategyAndCampaigns() {
    if (!tenantId) {
      setStrategyErr("Missing tenant context.");
      return;
    }
    setStrategyLoading(true);
    setStrategyErr("");
    try {
      const p = new URLSearchParams();
      p.set("range", preset);
      if (preset === "custom") {
        if (customStart) p.set("start", customStart);
        if (customEnd) p.set("end", customEnd);
      }
      attachTenantScope(p);
      const res = await fetch(`/api/dashboard/ads/strategy?${p.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to generate keyword strategy");
      }
      setStrategyData(json);
    } catch (e: unknown) {
      setStrategyErr(
        e instanceof Error ? e.message : "Failed to generate keyword strategy",
      );
    } finally {
      setStrategyLoading(false);
    }
  }

  const summary = data?.summaryOverall || {
    impressions: 0,
    clicks: 0,
    cost: 0,
    conversions: 0,
    convValue: 0,
    ctr: 0, // could be 0..1 or 0..100 depending on your join
    avgCpc: 0,
    cpa: 0,
    roas: 0,
    generatedAt: null,
    startDate: null,
    endDate: null,
  };

  const compare = data?.compare || null;

  // Normalize CTR display:
  // If your backend returns ctr in 0..1 => use fmtPct01
  // If returns 0..100 => use fmtPct100
  // We'll auto-detect: if ctr > 1.5 assume it's 0..100.
  const ctrText = useMemo(() => {
    const c = num(summary.ctr);
    return c > 1.5 ? fmtPct100(c) : fmtPct01(c);
  }, [summary.ctr]);

  const startDate = summary?.startDate || data?.meta?.startDate || null;
  const endDate = summary?.endDate || data?.meta?.endDate || null;

  const trend = (data?.trend || []) as any[];
  const topCampaigns = (data?.topCampaigns || []) as any[];
  const topKeywords = (data?.topKeywords || []) as any[];
  const searchTerms = (data?.searchTerms || []) as any[];

  const opportunities = data?.opportunities || {
    winners: [],
    losers: [],
    kwLeaks: [],
    negativeIdeas: [],
    ctrProblems: [],
  };

  // -------------------------
  // Chart adapter (generic)
  // -------------------------
  const trendForChart = useMemo(() => {
    return (trend || []).map((r: any) => {
      const imps = num(r.impressions);
      const clicks = num(r.clicks);
      const cost = num(r.cost);
      const conv = num(r.conversions);
      const avgCpc = num(r.avgCpc);
      const ctr = num(r.ctr);

      const value =
        metric === "impressions"
          ? imps
          : metric === "clicks"
            ? clicks
            : metric === "conversions"
              ? conv
              : metric === "cost"
                ? cost
                : metric === "avgCpc"
                  ? avgCpc
                  : ctr;

      return {
        date: norm(r.date),
        value,
      };
    });
  }, [trend, metric]);

  // -------------------------
  // KPI helpers
  // -------------------------
  const kpi = useMemo(() => {
    const clicks = num(summary.clicks);
    const cost = num(summary.cost);
    const conv = num(summary.conversions);
    const convValue = num(summary.convValue);

    const avgCpc = clicks ? cost / clicks : 0;
    const cpa = conv ? cost / conv : 0;
    const roas = cost ? convValue / cost : 0;

    return { avgCpc, cpa, roas };
  }, [summary.clicks, summary.cost, summary.conversions, summary.convValue]);

  // Compare pills (expect backend compare.pct fields as deltas in 0..1)
  const comparePills = useMemo(() => {
    if (!compareOn || !compare?.pct) return null;
    const pct = compare.pct || {};
    return {
      impressions: pct.impressions ?? null,
      clicks: pct.clicks ?? null,
      cost: pct.cost ?? null,
      conversions: pct.conversions ?? null,
      avgCpc: pct.avgCpc ?? null,
      ctr: pct.ctr ?? null,
      roas: pct.roas ?? null,
    };
  }, [compareOn, compare]);

  const campaignPlaybooks = useMemo<CampaignPlaybook[]>(() => {
    const baseRows = (topCampaigns || [])
      .slice(0, 40)
      .map((r: any) => {
        const campaign = norm(r.campaign || "Unnamed campaign");
        const region = extractRegionFromCampaignName(campaign);
        const cost = num(r.cost);
        const clicks = num(r.clicks);
        const conv = num(r.conversions);
        const ctr = num(r.ctr);
        const cpa = conv > 0 ? cost / conv : cost;
        const perfScore = conv * 30 + clicks * 0.3 + Math.max(0, 6 - cpa) * 8 + ctr;
        return { campaign, region, cost, clicks, conv, cpa, perfScore };
      })
      .filter((r) => r.campaign);

    const byRegion = new Map<string, typeof baseRows>();
    for (const row of baseRows) {
      const arr = byRegion.get(row.region) || [];
      arr.push(row);
      byRegion.set(row.region, arr);
    }

    const leakTerms = (opportunities?.negativeIdeas || [])
      .slice(0, 12)
      .map((x: any) => norm(x.term))
      .filter(Boolean);
    const defaultNegatives = ["free", "jobs", "cheap", "DIY", "training"];

    const ranked = Array.from(byRegion.entries())
      .map(([region, rows]) => {
        const cost = rows.reduce((a, b) => a + b.cost, 0);
        const conv = rows.reduce((a, b) => a + b.conv, 0);
        const clicks = rows.reduce((a, b) => a + b.clicks, 0);
        const score = rows.reduce((a, b) => a + b.perfScore, 0) / Math.max(1, rows.length);
        const cpa = conv > 0 ? cost / conv : cost;
        const objective: CampaignPlaybook["objective"] =
          conv >= 3 ? "Scale" : clicks >= 25 ? "Efficiency" : "Recovery";
        const budgetDaily = Math.max(25, Number(((cost / Math.max(7, (trend || []).length || 28)) * 1.2).toFixed(0)));
        const topCampaign = rows.sort((a, b) => b.perfScore - a.perfScore)[0]?.campaign || `My Drip Nurse ${region} - Search`;
        return { region, score, cpa, conv, clicks, budgetDaily, topCampaign, objective };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    return ranked.map((r) => ({
      region: r.region,
      campaign: r.topCampaign,
      objective: r.objective,
      budgetDaily: r.budgetDaily,
      score: Number(r.score.toFixed(1)),
      setup: {
        bidStrategy:
          r.objective === "Scale"
            ? "Maximize conversions (with tCPA guardrail)"
            : r.objective === "Efficiency"
              ? "Maximize conversion value (with ROAS floor)"
              : "Manual CPC + exact intent isolation",
        adGroups: [
          "High intent IV therapy",
          "Symptom intent (hydration / immunity / recovery)",
          "Competitor & alternative intent",
        ],
        negativeSeeds: [...defaultNegatives, ...leakTerms].slice(0, 8),
        audienceHint:
          "Geo radius around service area + in-market health/wellness + remarketing of high-intent visitors",
      },
      funnel: {
        headline1: `Mobile IV Therapy in ${r.region}`,
        headline2: "Same-Day Booking Available",
        description:
          "Licensed nurses, transparent pricing, and fast response. Book in under 60 seconds.",
        cta: "Book Your IV Appointment",
        landingAngle:
          "Use county/city specific page with proof, FAQs, service menu, and one clear booking CTA above the fold.",
      },
    }));
  }, [topCampaigns, opportunities?.negativeIdeas, trend]);

  async function generateAiPlaybook() {
    setAiLoading(true);
    setAiErr("");
    try {
      const payload = {
        range: { startDate, endDate },
        summary,
        compare: compareOn ? compare : null,
        opportunities,
        topCampaigns: (topCampaigns || []).slice(0, 20),
        topKeywords: (topKeywords || []).slice(0, 20),
        searchTerms: (searchTerms || []).slice(0, 20),
      };
      const res = await fetch("/api/dashboard/ads/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "Failed to generate AI playbook");
      }
      setAiPlaybook(json.insights || null);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Failed to generate AI playbook");
    } finally {
      setAiLoading(false);
    }
  }

  function exportPlaybooksCsv() {
    const headers = [
      "region",
      "campaign",
      "objective",
      "daily_budget_usd",
      "score",
      "bid_strategy",
      "ad_groups",
      "negative_seeds",
      "audience_hint",
      "headline_1",
      "headline_2",
      "description",
      "cta",
      "landing_angle",
    ];
    const rows = campaignPlaybooks.map((pb) => [
      pb.region,
      pb.campaign,
      pb.objective,
      pb.budgetDaily,
      pb.score,
      pb.setup.bidStrategy,
      pb.setup.adGroups.join(" | "),
      pb.setup.negativeSeeds.join(" | "),
      pb.setup.audienceHint,
      pb.funnel.headline1,
      pb.funnel.headline2,
      pb.funnel.description,
      pb.funnel.cta,
      pb.funnel.landingAngle,
    ]);
    const dt = new Date().toISOString().slice(0, 10);
    downloadCsv(`google-ads-playbooks-${dt}.csv`, headers, rows);
  }

  return (
    <div className="shell callsDash gaDash">
      <header className="topbar">
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>My Drip Nurse — Google Ads Dashboard</h1>
            <div className="mini" style={{ opacity: 0.8, marginTop: 4 }}>
              Performance + budget efficiency + keyword leakage + Delta
              opportunities. Customer:{" "}
              <b className="mono">{data?.meta?.customerId || "—"}</b>
            </div>
            {data?.meta?.warning ? (
              <div
                className="mini"
                style={{ color: "var(--warning)", marginTop: 6 }}
              >
                ⚠️ {String(data.meta.warning)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="pills">
          <Link
            className="pill"
            href={backHref}
            style={{ textDecoration: "none" }}
          >
            ← Back
          </Link>

          <div className="pill">
            <span className="dot" />
            <span>Live</span>
          </div>

          <div className="pill">
            <span style={{ color: "var(--muted)" }}>Created by</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Axel Castro</span>
            <span style={{ opacity: 0.55 }}>•</span>
            <span>Devasks</span>
          </div>
        </div>
      </header>

      {/* Filters */}
      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Filters</h2>
            <div className="cardSubtitle">
              Este filtro afecta KPIs, trend y tablas. Cache se regenera
              automáticamente (stale ≤ 10 min).
            </div>
          </div>

          <div
            className="cardHeaderActions"
            style={{ display: "flex", gap: 10, alignItems: "center" }}
          >
            <button
              className={`smallBtn ${compareOn ? "smallBtnOn" : ""}`}
              onClick={() => setCompareOn((v) => !v)}
              disabled={loading}
              type="button"
              title="Compara contra la ventana previa"
            >
              Compare: {compareOn ? "On" : "Off"}
            </button>

            <button
              className="smallBtn"
              onClick={() => {
                setHardRefreshing(true);
                load({ force: true });
              }}
              disabled={loading}
              type="button"
              title="Forza refresh y recachea Ads"
            >
              {loading && hardRefreshing ? "Hard refresh..." : "Refresh"}
            </button>
          </div>
        </div>

        <div className="cardBody">
          <div className="filtersBar">
            <div className="filtersGroup">
              <div className="filtersLabel">Range</div>
              <div className="rangePills">
                <button
                  className={`smallBtn ${preset === "last_7_days" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_7_days")}
                  type="button"
                >
                  7 days
                </button>
                <button
                  className={`smallBtn ${preset === "last_28_days" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_28_days")}
                  type="button"
                >
                  28 days
                </button>

                <span className="filtersDivider" />

                <button
                  className={`smallBtn ${preset === "last_month" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_month")}
                  type="button"
                >
                  Last month
                </button>
                <button
                  className={`smallBtn ${preset === "last_quarter" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_quarter")}
                  type="button"
                >
                  Last quarter
                </button>
                <button
                  className={`smallBtn ${preset === "last_6_months" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_6_months")}
                  type="button"
                >
                  Last 6 months
                </button>
                <button
                  className={`smallBtn ${preset === "last_year" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("last_year")}
                  type="button"
                >
                  Last year
                </button>

                <span className="filtersDivider" />

                <button
                  className={`smallBtn ${preset === "custom" ? "smallBtnOn" : ""}`}
                  onClick={() => setPreset("custom")}
                  type="button"
                >
                  Custom
                </button>
              </div>
            </div>

            <div className="filtersGroup dateGroup">
              <div className="filtersLabel">Custom dates</div>
              <div className="dateInputs">
                <div className="dateField">
                  <label
                    className="mini"
                    style={{ marginBottom: 6, display: "block" }}
                  >
                    Start
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    disabled={preset !== "custom"}
                  />
                </div>
                <div className="dateField">
                  <label
                    className="mini"
                    style={{ marginBottom: 6, display: "block" }}
                  >
                    End
                  </label>
                  <input
                    className="input"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    disabled={preset !== "custom"}
                  />
                </div>

                {preset === "custom" && (
                  <button
                    className="btn btnPrimary applyBtn"
                    onClick={() => load({ force: true })}
                    disabled={!customStart || !customEnd || loading}
                    type="button"
                    title="Aplica el rango manual y forza refresh"
                  >
                    {loading ? "Applying..." : "Apply"}
                  </button>
                )}
              </div>

              <div className="mini" style={{ marginTop: 8, opacity: 0.85 }}>
                {preset !== "custom"
                  ? "Tip: Usa presets para velocidad. Custom es para rangos manuales."
                  : "Custom activo: selecciona Start/End y Apply."}
              </div>
            </div>
          </div>

          <div className="filtersRow2">
            <div className="filtersChips">
              <button
                className={`smallBtn ${metric === "cost" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("cost")}
                type="button"
              >
                Cost
              </button>
              <button
                className={`smallBtn ${metric === "conversions" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("conversions")}
                type="button"
              >
                Conversions
              </button>
              <button
                className={`smallBtn ${metric === "avgCpc" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("avgCpc")}
                type="button"
              >
                Avg CPC
              </button>
              <button
                className={`smallBtn ${metric === "ctr" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("ctr")}
                type="button"
              >
                CTR
              </button>

              <span className="filtersDivider" />

              <button
                className={`smallBtn ${metric === "clicks" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("clicks")}
                type="button"
              >
                Clicks
              </button>
              <button
                className={`smallBtn ${metric === "impressions" ? "smallBtnOn" : ""}`}
                onClick={() => setMetric("impressions")}
                type="button"
              >
                Impressions
              </button>

              <span className="filtersDivider" />

              <div className="seg">
                <button
                  className={`segBtn ${trendMode === "day" ? "segOn" : ""}`}
                  onClick={() => setTrendMode("day")}
                  type="button"
                >
                  Day
                </button>
                <button
                  className={`segBtn ${trendMode === "week" ? "segOn" : ""}`}
                  onClick={() => setTrendMode("week")}
                  type="button"
                >
                  Week
                </button>
                <button
                  className={`segBtn ${trendMode === "month" ? "segOn" : ""}`}
                  onClick={() => setTrendMode("month")}
                  type="button"
                >
                  Month
                </button>
              </div>

              {summary.generatedAt && (
                <span className="mini" style={{ opacity: 0.8, marginLeft: 8 }}>
                  Last Update:{" "}
                  <b>{new Date(summary.generatedAt).toLocaleString()}</b>
                </span>
              )}
            </div>

            {err ? (
              <div className="mini" style={{ color: "var(--danger)" }}>
                ❌ {err}
              </div>
            ) : (
              <div className="filtersFooter">
                <div className="deltaRow">
                  <span className="deltaHint">
                    <div className="mini" style={{ opacity: 0.9 }}>
                      Range: <b>{summary.startDate || "—"}</b> →{" "}
                      <b>{summary.endDate || "—"}</b> • Impr:{" "}
                      <b>{fmtInt(summary.impressions)}</b> • Clicks:{" "}
                      <b>{fmtInt(summary.clicks)}</b> • Cost:{" "}
                      <b>{fmtMoney(summary.cost)}</b> • CTR: <b>{ctrText}</b> •
                      Conv: <b>{fmtInt(summary.conversions)}</b>
                    </div>
                  </span>

                  {compareOn && comparePills ? (
                    <span className="deltaPills">
                      <span
                        className={`deltaPill ${deltaClass(comparePills.impressions)}`}
                        title="Δ Impressions vs previous window"
                      >
                        Impr:{" "}
                        {comparePills.impressions == null
                          ? "—"
                          : fmtDeltaPct(comparePills.impressions)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.clicks)}`}
                        title="Δ Clicks vs previous window"
                      >
                        Clicks:{" "}
                        {comparePills.clicks == null
                          ? "—"
                          : fmtDeltaPct(comparePills.clicks)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.cost, { invert: true })}`}
                        title="Δ Cost vs previous window (lower is better)"
                      >
                        Cost:{" "}
                        {comparePills.cost == null
                          ? "—"
                          : fmtDeltaPct(comparePills.cost)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.conversions)}`}
                        title="Δ Conversions vs previous window"
                      >
                        Conv:{" "}
                        {comparePills.conversions == null
                          ? "—"
                          : fmtDeltaPct(comparePills.conversions)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.avgCpc, { invert: true })}`}
                        title="Δ Avg CPC vs previous window (lower is better)"
                      >
                        CPC:{" "}
                        {comparePills.avgCpc == null
                          ? "—"
                          : fmtDeltaPct(comparePills.avgCpc)}
                      </span>
                      <span
                        className={`deltaPill ${deltaClass(comparePills.ctr)}`}
                        title="Δ CTR vs previous window"
                      >
                        CTR:{" "}
                        {comparePills.ctr == null
                          ? "—"
                          : fmtDeltaPct(comparePills.ctr)}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Summary */}
      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Summary</h2>
            <div className="cardSubtitle">
              Aquí medimos eficiencia. El objetivo no es “más clicks”, es “más
              conversiones por $”.
            </div>
          </div>
          <div className="badge">{loading ? "loading…" : "ready"}</div>
        </div>

        <div className="cardBody">
          <div className="kpiGrid32">
            <div className="kpi">
              <p className="n">{fmtMoney(summary.cost)}</p>
              <p className="l">Cost</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtInt(summary.clicks)}</p>
              <p className="l">Clicks</p>
            </div>

            <div className="kpi">
              <p className="n">{ctrText}</p>
              <p className="l">CTR</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtMoney(kpi.avgCpc)}</p>
              <p className="l">Avg CPC</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtInt(summary.conversions)}</p>
              <p className="l">Conversions</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtMoney(kpi.cpa)}</p>
              <p className="l">CPA</p>
            </div>

            <div className="kpi">
              <p className="n">{fmtMoney(summary.convValue)}</p>
              <p className="l">Conv. Value</p>
            </div>

            <div className="kpi">
              <p className="n">{kpi.roas.toFixed(2)}x</p>
              <p className="l">ROAS</p>
            </div>
          </div>

          {compareOn && compare ? (
            <div className="mini" style={{ marginTop: 10, opacity: 0.85 }}>
              Compare window: <b>{compare.previous.startDate}</b> →{" "}
              <b>{compare.previous.endDate}</b> vs current{" "}
              <b>{compare.current.startDate}</b> →{" "}
              <b>{compare.current.endDate}</b>
            </div>
          ) : null}

          <div className="mini" style={{ marginTop: 10 }}>
            Lectura Delta: si <b>ROAS</b> sube y <b>CPA</b> baja → escala. Si{" "}
            <b>Cost</b> sube con <b>Conv</b> flat → hay leakage
            (keywords/terms/ads/landing).
          </div>

          <div style={{ marginTop: 14 }}>
            <AdsTrendChart
              trend={trendForChart}
              mode={trendMode}
              startDate={startDate}
              endDate={endDate}
              seriesLabel={metricLabel(metric)}
              unitHint={metricUnitHint(metric)}
            />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }} id="ai-playbook">
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Playbook (Google Ads Expert)</h2>
            <div className="cardSubtitle">
              Plan generado por AI especialista en Google Ads por región, estructura y funnel.
            </div>
          </div>
          <div className="cardHeaderActions">
            <button
              className="smallBtn aiBtn"
              onClick={generateAiPlaybook}
              disabled={aiLoading || loading || !topCampaigns.length}
              type="button"
            >
              {aiLoading ? "Generating..." : "Generate AI Playbook"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          {aiErr ? <div className="mini" style={{ color: "var(--danger)" }}>X {aiErr}</div> : null}
          {aiPlaybook ? (
            <div className="moduleGrid">
              <div className="moduleCard">
                <p className="l moduleTitle">Executive summary</p>
                <p className="mini moduleLine">{String(aiPlaybook.executive_summary || "")}</p>
                <p className="mini moduleLine"><b>Primary risk:</b> {String(aiPlaybook?.scorecard?.primary_risk || "-")}</p>
                <p className="mini moduleLine"><b>Primary opportunity:</b> {String(aiPlaybook?.scorecard?.primary_opportunity || "-")}</p>
              </div>
              {Array.isArray(aiPlaybook.playbook) &&
                aiPlaybook.playbook.slice(0, 6).map((p: any, idx: number) => (
                  <div className="moduleCard" key={`ads-ai-pb-${idx}`}>
                    <div className="moduleTop">
                      <p className="l moduleTitle">{String(p.region || "Region")}</p>
                      <span className={`mini aiImpact ${String(p.expected_impact || "medium")}`}>
                        {String(p.expected_impact || "medium").toUpperCase()}
                      </span>
                    </div>
                    <p className="mini moduleLine"><b>Objective:</b> {String(p.objective || "-")}</p>
                    <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(p.budget_daily_usd)}</p>
                    <p className="mini moduleLine"><b>Structure:</b> {String(p.campaign_structure || "-")}</p>
                    <p className="mini moduleLine"><b>Audience:</b> {String(p.audience || "-")}</p>
                    <p className="mini moduleLine"><b>Ad copy:</b> {String(p.ad_copy || "-")}</p>
                    <p className="mini moduleLine"><b>Landing:</b> {String(p.landing_plan || "-")}</p>
                  </div>
                ))}
            </div>
          ) : (
            <div className="aiPlaceholder mini">
              Generate AI Playbook para construir campañas con estructura experta por región.
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Campaign Planner (Google Ads)</h2>
            <div className="cardSubtitle">
              Recomendaciones por región con setup de campaña y copy de funnel listas para ejecutar.
            </div>
          </div>
          <div className="cardHeaderActions">
            <button
              className="smallBtn"
              type="button"
              onClick={exportPlaybooksCsv}
              disabled={!campaignPlaybooks.length}
            >
              Export CSV
            </button>
            <div className="badge">{campaignPlaybooks.length} playbooks</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid">
            {campaignPlaybooks.map((pb, i) => (
              <div className="moduleCard" key={`${pb.region}-${i}`}>
                <div className="moduleTop">
                  <p className="l moduleTitle">{pb.region}</p>
                  <span className="mini moduleDelta">Score {pb.score}</span>
                </div>
                <p className="mini moduleLine"><b>Objective:</b> {pb.objective}</p>
                <p className="mini moduleLine"><b>Daily budget:</b> {fmtMoney(pb.budgetDaily)}</p>
                <p className="mini moduleLine"><b>Campaign:</b> {pb.campaign}</p>
                <p className="mini moduleLine"><b>Bid strategy:</b> {pb.setup.bidStrategy}</p>
                <p className="mini moduleLine"><b>Ad groups:</b> {pb.setup.adGroups.join(" · ")}</p>
                <p className="mini moduleLine"><b>Negative seeds:</b> {pb.setup.negativeSeeds.join(", ")}</p>
                <p className="mini moduleLine"><b>Audience:</b> {pb.setup.audienceHint}</p>
                <div className="moduleStat" style={{ marginTop: 8 }}>
                  <div className="mini moduleStatLabel">Funnel copy pack</div>
                  <div className="mini moduleLine"><b>H1:</b> {pb.funnel.headline1}</div>
                  <div className="mini moduleLine"><b>H2:</b> {pb.funnel.headline2}</div>
                  <div className="mini moduleLine"><b>Description:</b> {pb.funnel.description}</div>
                  <div className="mini moduleLine"><b>CTA:</b> {pb.funnel.cta}</div>
                  <div className="mini moduleLine"><b>Landing angle:</b> {pb.funnel.landingAngle}</div>
                </div>
              </div>
            ))}
          </div>
          {!campaignPlaybooks.length ? (
            <div className="mini" style={{ marginTop: 8, opacity: 0.8 }}>
              No hay suficiente data en este rango para armar playbooks. Amplía el rango o haz refresh.
            </div>
          ) : null}
          <div className="mini" style={{ marginTop: 10, opacity: 0.78 }}>
            Próximo upgrade: conectar Keyword Planner + bids estimados + competencia para auto-priorizar presupuesto por geo.
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Strategist (Ads)</h2>
            <div className="cardSubtitle">
              Conversa con el agente de Google Ads para optimizar gasto, CPA, ROAS y expansión por geo-intent.
            </div>
          </div>
          <div className="badge">shared memory</div>
        </div>
        <div className="cardBody">
          <AiAgentChatPanel
            agent="ads"
            title="Ads Agent Chat"
            context={{
              preset,
              customStart,
              customEnd,
              compareOn,
              trendMode,
              metric,
              summary,
              compare,
              opportunities,
              topCampaigns: (topCampaigns || []).slice(0, 20),
              topKeywords: (topKeywords || []).slice(0, 20),
              searchTerms: (searchTerms || []).slice(0, 20),
            }}
          />
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Keyword Strategy + Campaign Generator</h2>
            <div className="cardSubtitle">
              Cruza Google Ads + GSC + revenue para recomendar keywords y generar campañas completas en draft.
            </div>
          </div>
          <div className="cardHeaderActions">
            <button
              className="smallBtn aiBtn"
              onClick={generateKeywordStrategyAndCampaigns}
              disabled={strategyLoading || loading}
              type="button"
            >
              {strategyLoading ? "Generating..." : "Generate Strategy"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          {strategyErr ? (
            <div className="mini" style={{ color: "var(--danger)" }}>
              X {strategyErr}
            </div>
          ) : null}

          {strategyData ? (
            <>
              <div className="mini" style={{ marginBottom: 12, opacity: 0.86 }}>
                Revenue (range actual):{" "}
                <b>{fmtMoney(strategyData?.scorecard?.revenueNow || 0)}</b> •
                Candidate keywords:{" "}
                <b>{fmtInt(strategyData?.scorecard?.candidateKeywords || 0)}</b> •
                Draft campaigns:{" "}
                <b>{fmtInt(strategyData?.scorecard?.campaignDrafts || 0)}</b>
              </div>

              {strategyData?.aiSummary?.executive_summary ? (
                <div className="moduleCard" style={{ marginBottom: 12 }}>
                  <p className="l moduleTitle">AI Executive Summary</p>
                  <p className="mini moduleLine">
                    {String(strategyData.aiSummary.executive_summary)}
                  </p>
                </div>
              ) : null}

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Keyword</th>
                      <th className="th">Action</th>
                      <th className="th">Score</th>
                      <th className="th">GSC Impr</th>
                      <th className="th">Ads Conv</th>
                      <th className="th">Cost</th>
                      <th className="th">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(strategyData?.keywordStrategy || [])
                      .slice(0, 20)
                      .map((k: any, i: number) => (
                        <tr key={`kws-${i}`} className="tr">
                          <td className="td mono">{String(k.keyword || "")}</td>
                          <td className="td">{String(k.action || "monitor")}</td>
                          <td className="td">{fmtInt(k.score || 0)}</td>
                          <td className="td">{fmtInt(k.gscImpressions || 0)}</td>
                          <td className="td">{fmtInt(k.adsConversions || 0)}</td>
                          <td className="td">{fmtMoney(k.adsCost || 0)}</td>
                          <td className="td mini">{String(k.reason || "")}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>

              <div className="moduleGrid" style={{ marginTop: 12 }}>
                {(strategyData?.campaignDrafts || []).map((c: any, idx: number) => (
                  <div className="moduleCard" key={`draft-${idx}`}>
                    <div className="moduleTop">
                      <p className="l moduleTitle">{String(c.campaignName || "Draft campaign")}</p>
                      <span className="mini moduleDelta">{String(c.status || "draft")}</span>
                    </div>
                    <p className="mini moduleLine"><b>Objective:</b> {String(c.objective || "-")}</p>
                    <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(c.budgetDailyUsd || 0)}</p>
                    <p className="mini moduleLine"><b>Bidding:</b> {String(c.bidding || "-")}</p>
                    <p className="mini moduleLine"><b>Region:</b> {String(c?.targeting?.regions?.join(", ") || "-")}</p>
                    <p className="mini moduleLine">
                      <b>Keywords:</b>{" "}
                      {String(
                        c?.adGroups?.flatMap((g: any) => g.keywords || []).slice(0, 8).join(", ") || "-",
                      )}
                    </p>
                    <p className="mini moduleLine">
                      <b>Negatives:</b>{" "}
                      {String(
                        c?.adGroups?.flatMap((g: any) => g.negatives || []).slice(0, 8).join(", ") || "-",
                      )}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mini" style={{ marginTop: 10, opacity: 0.8 }}>
                Publish mode actual: <b>{String(strategyData?.publish?.mode || "draft_only")}</b>.{" "}
                {String(strategyData?.publish?.message || "")}
              </div>
            </>
          ) : (
            <div className="aiPlaceholder mini">
              Genera el strategy para obtener keywords priorizadas y campañas listas para revisión.
            </div>
          )}
        </div>
      </section>

      {/* Opportunities */}
      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Opportunities (Delta-Aware)</h2>
            <div className="cardSubtitle">
              Winners/Losers + leakage + negativos sugeridos. Esto es lo primero
              que arreglas antes de “subir presupuesto”.
            </div>
          </div>
          <div className="badge">ops</div>
        </div>

        <div className="cardBody">
          <div className="gscTopGrid">
            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Winners (scale candidates)</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Campaign</th>
                      <th className="th">Cost</th>
                      <th className="th">Conv</th>
                      <th className="th">CPA</th>
                      <th className="th">ROAS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(opportunities.winners || [])
                      .slice(0, 15)
                      .map((r: any, i: number) => (
                        <tr key={i} className="tr">
                          <td className="td">
                            <b className="mono">{r.campaign}</b>
                            <div className="mini" style={{ opacity: 0.7 }}>
                              clicks {fmtInt(r.clicks)} • impr{" "}
                              {fmtInt(r.impressions)}
                            </div>
                          </td>
                          <td className="td">{fmtMoney(r.cost)}</td>
                          <td className="td">{fmtInt(r.conversions)}</td>
                          <td className="td">
                            {r.cpa == null ? "—" : fmtMoney(r.cpa)}
                          </td>
                          <td className="td">
                            {r.roas == null
                              ? "—"
                              : `${Number(r.roas).toFixed(2)}x`}
                          </td>
                        </tr>
                      ))}
                    {!(opportunities.winners || []).length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No winners detectados en este rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">
                  Losers (fix / pause / tighten)
                </div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Campaign</th>
                      <th className="th">Cost</th>
                      <th className="th">Clicks</th>
                      <th className="th">Conv</th>
                      <th className="th">Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(opportunities.losers || [])
                      .slice(0, 15)
                      .map((r: any, i: number) => (
                        <tr key={i} className="tr">
                          <td className="td">
                            <b className="mono">{r.campaign}</b>
                            <div className="mini" style={{ opacity: 0.7 }}>
                              impr {fmtInt(r.impressions)} • CTR{" "}
                              {num(r.ctr) > 1.5
                                ? fmtPct100(r.ctr)
                                : fmtPct01(r.ctr)}
                            </div>
                          </td>
                          <td className="td">{fmtMoney(r.cost)}</td>
                          <td className="td">{fmtInt(r.clicks)}</td>
                          <td className="td">{fmtInt(r.conversions)}</td>
                          <td className="td" style={{ opacity: 0.8 }}>
                            tighten terms • test landing • split adgroup
                          </td>
                        </tr>
                      ))}
                    {!(opportunities.losers || []).length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No losers detectados en este rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="gscTopGrid" style={{ marginTop: 14 }}>
            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Keyword leaks (spend no conv)</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Keyword</th>
                      <th className="th">Cost</th>
                      <th className="th">Clicks</th>
                      <th className="th">Conv</th>
                      <th className="th">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(opportunities.kwLeaks || [])
                      .slice(0, 20)
                      .map((r: any, i: number) => (
                        <tr key={i} className="tr">
                          <td className="td mono">{r.keyword}</td>
                          <td className="td">{fmtMoney(r.cost)}</td>
                          <td className="td">{fmtInt(r.clicks)}</td>
                          <td className="td">{fmtInt(r.conversions)}</td>
                          <td className="td" style={{ opacity: 0.8 }}>
                            add negatives • change match • split intent
                          </td>
                        </tr>
                      ))}
                    {!(opportunities.kwLeaks || []).length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No keyword leaks detectados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Negative ideas (search terms)</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Search term</th>
                      <th className="th">Cost</th>
                      <th className="th">Clicks</th>
                      <th className="th">Conv</th>
                      <th className="th">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(opportunities.negativeIdeas || [])
                      .slice(0, 20)
                      .map((r: any, i: number) => (
                        <tr key={i} className="tr">
                          <td className="td mono">{r.term}</td>
                          <td className="td">{fmtMoney(r.cost)}</td>
                          <td className="td">{fmtInt(r.clicks)}</td>
                          <td className="td">{fmtInt(r.conversions)}</td>
                          <td className="td" style={{ opacity: 0.8 }}>
                            irrelevant / low-intent
                          </td>
                        </tr>
                      ))}
                    {!(opportunities.negativeIdeas || []).length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No negative ideas detectadas.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mini" style={{ marginTop: 10, opacity: 0.75 }}>
            Próximo nivel: combinar <b>GSC (queries por estado)</b> +{" "}
            <b>Keyword Planner (CPC/competition/volume)</b> para generar “Delta
            Expansion Plans” por estado/county/ciudad.
          </div>
        </div>
      </section>

      {/* Tables */}
      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Campaigns, Keywords, Search Terms</h2>
            <div className="cardSubtitle">
              Aquí ves el inventario real de performance. Lo usamos para crear
              “estructura Delta” (campaña → adgroups → intents → landing).
            </div>
          </div>
          <div className="badge">top</div>
        </div>

        <div className="cardBody">
          <div className="gscTopGrid">
            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Top Campaigns</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Campaign</th>
                      <th className="th">Cost</th>
                      <th className="th">Impr</th>
                      <th className="th">Clicks</th>
                      <th className="th">CTR</th>
                      <th className="th">Conv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCampaigns.slice(0, 30).map((r: any, i: number) => (
                      <tr key={i} className="tr">
                        <td className="td mono">{r.campaign}</td>
                        <td className="td">{fmtMoney(r.cost)}</td>
                        <td className="td">{fmtInt(r.impressions)}</td>
                        <td className="td">{fmtInt(r.clicks)}</td>
                        <td className="td">
                          {num(r.ctr) > 1.5
                            ? fmtPct100(r.ctr)
                            : fmtPct01(r.ctr)}
                        </td>
                        <td className="td">{fmtInt(r.conversions)}</td>
                      </tr>
                    ))}
                    {!topCampaigns.length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={6}
                          style={{ opacity: 0.75 }}
                        >
                          No campaign data en este rango. Pulsa Refresh.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Top Keywords</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Keyword</th>
                      <th className="th">Cost</th>
                      <th className="th">Clicks</th>
                      <th className="th">Conv</th>
                      <th className="th">Avg CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topKeywords.slice(0, 30).map((r: any, i: number) => (
                      <tr key={i} className="tr">
                        <td className="td mono">{r.keyword}</td>
                        <td className="td">{fmtMoney(r.cost)}</td>
                        <td className="td">{fmtInt(r.clicks)}</td>
                        <td className="td">{fmtInt(r.conversions)}</td>
                        <td className="td">{fmtMoney(r.avgCpc)}</td>
                      </tr>
                    ))}
                    {!topKeywords.length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No keyword data en este rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="gscTopGrid" style={{ marginTop: 14 }}>
            <div className="gscTopCard">
              <div className="gscTopHead">
                <div className="gscTopTitle">Top Search Terms</div>
              </div>

              <div className="tableWrap tableScrollX">
                <table className="table">
                  <thead>
                    <tr>
                      <th className="th">Term</th>
                      <th className="th">Cost</th>
                      <th className="th">Clicks</th>
                      <th className="th">Conv</th>
                      <th className="th">Hint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchTerms.slice(0, 40).map((r: any, i: number) => (
                      <tr key={i} className="tr">
                        <td className="td mono">{r.term}</td>
                        <td className="td">{fmtMoney(r.cost)}</td>
                        <td className="td">{fmtInt(r.clicks)}</td>
                        <td className="td">{fmtInt(r.conversions)}</td>
                        <td className="td" style={{ opacity: 0.8 }}>
                          {num(r.conversions)
                            ? "keep / expand"
                            : "negative candidate"}
                        </td>
                      </tr>
                    ))}
                    {!searchTerms.length ? (
                      <tr className="tr">
                        <td
                          className="td"
                          colSpan={5}
                          style={{ opacity: 0.75 }}
                        >
                          No search term data en este rango.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>

              <div className="mini" style={{ marginTop: 10, opacity: 0.75 }}>
                Nota: Search Terms es donde más rápido limpias el ROAS. Si esto
                no existe aún en tu sync, lo añadimos con GAQL.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
