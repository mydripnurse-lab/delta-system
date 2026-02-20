"use client";

import { useEffect, useMemo, useState } from "react";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";
import DashboardTopbar from "@/components/DashboardTopbar";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import type { DashboardRangePreset } from "@/lib/dateRangePresets";

type RangePreset = DashboardRangePreset;

type OverviewResponse = {
  ok: boolean;
  error?: string;
  range?: { start: string; end: string; preset: string; adsRange: string };
  executive?: {
    leadsNow: number;
    appointmentsNow: number;
    appointmentsLostNow: number;
    appointmentsLostValueNow: number;
    transactionsRevenueNow: number;
  };
  topOpportunitiesGeo?: {
    states: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
    counties: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
    cities: Array<{ name: string; opportunities: number; value: number; uniqueContacts: number }>;
  };
  attribution?: {
    topSources: Array<{
      source: string;
      leads: number;
      appointments: number;
      revenue: number;
      leadToAppointmentRate: number;
    }>;
  };
  actionCenter?: {
    playbooks: Array<{
      id: string;
      priority: "P1" | "P2" | "P3";
      title: string;
      why: string;
    }>;
  };
};

type FacebookPlaybook = {
  region: string;
  objective: "Leads" | "Bookings" | "Retargeting";
  dailyBudget: number;
  audience: string;
  offer: string;
  copyPrimary: string;
  headline: string;
  cta: string;
  funnel: string;
};

type FbAiPlaybookItem = {
  region: string;
  objective: string;
  budget_daily_usd: number;
  audience: string;
  creative_angle: string;
  ad_copy: string;
  funnel_plan: string;
  expected_impact: "low" | "medium" | "high";
};

type FbAiInsights = {
  executive_summary?: string;
  scorecard?: { primary_risk?: string; primary_opportunity?: string };
  playbook?: FbAiPlaybookItem[];
};

function fmtInt(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toLocaleString();
}

function fmtMoney(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function s(v: unknown) {
  return String(v ?? "").trim();
}

function geoName(v: string | undefined | null) {
  const raw = s(v);
  if (!raw || raw === "__unknown") return "Unknown";
  return raw;
}

function csvCell(v: unknown) {
  const x = String(v ?? "");
  return `"${x.replace(/"/g, '""')}"`;
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

export default function FacebookAdsDashboardPage() {
  const searchParams = useBrowserSearchParams();
  const { tenantId } = useResolvedTenantId(searchParams);
  const integrationKey = String(searchParams?.get("integrationKey") || "owner").trim() || "owner";
  const backHref = tenantId
    ? `/dashboard?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard";
  const notificationsHref = tenantId
    ? `/dashboard/notification-hub?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`
    : "/dashboard/notification-hub";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const [aiPlaybook, setAiPlaybook] = useState<FbAiInsights | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [preset, setPreset] = useState<RangePreset>("28d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  async function load(force?: boolean) {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      qs.set("range", preset);
      if (preset === "custom") {
        if (start) qs.set("start", start);
        if (end) qs.set("end", end);
      }
      qs.set("compare", "1");
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/dashboard/overview?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as OverviewResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load Facebook Ads dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (preset !== "custom") load(false);
    else if (start && end) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, start, end]);

  const playbooks = useMemo<FacebookPlaybook[]>(() => {
    const states = (data?.topOpportunitiesGeo?.states || []).slice(0, 6);
    return states.map((st, idx) => {
      const opps = Number(st.opportunities || 0);
      const val = Number(st.value || 0);
      const objective: FacebookPlaybook["objective"] = opps >= 8 ? "Bookings" : idx < 2 ? "Leads" : "Retargeting";
      const baseBudget = Math.max(20, Math.round((val / Math.max(1, opps)) * 0.15));
      const offer = objective === "Bookings"
        ? "Book same-day IV visit"
        : objective === "Leads"
          ? "Get personalized IV plan"
          : "Complete your booking";
      return {
        region: geoName(st.name),
        objective,
        dailyBudget: baseBudget,
        audience: `People in ${geoName(st.name)} + lookalike from high-intent leads + retarget 30d site visitors`,
        offer,
        copyPrimary: `Serving ${geoName(st.name)} with mobile IV therapy. Fast response, licensed nurses, and clear pricing. ${offer}.`,
        headline: `${offer} in ${geoName(st.name)}`,
        cta: objective === "Retargeting" ? "Finish Booking" : "Book Now",
        funnel: `Ad -> County landing page -> short form -> booking calendar -> follow-up CRM. Optimize to ${objective.toLowerCase()} objective.`,
      };
    });
  }, [data]);

  const stats = {
    leads: Number(data?.executive?.leadsNow || 0),
    appts: Number(data?.executive?.appointmentsNow || 0),
    lost: Number(data?.executive?.appointmentsLostNow || 0),
    lostValue: Number(data?.executive?.appointmentsLostValueNow || 0),
    revenue: Number(data?.executive?.transactionsRevenueNow || 0),
  };

  function exportPlaybooksCsv() {
    const headers = [
      "region",
      "objective",
      "daily_budget_usd",
      "audience",
      "offer",
      "primary_text",
      "headline",
      "cta",
      "funnel",
    ];
    const rows = playbooks.map((pb) => [
      pb.region,
      pb.objective,
      pb.dailyBudget,
      pb.audience,
      pb.offer,
      pb.copyPrimary,
      pb.headline,
      pb.cta,
      pb.funnel,
    ]);
    const dt = new Date().toISOString().slice(0, 10);
    downloadCsv(`facebook-ads-playbooks-${dt}.csv`, headers, rows);
  }

  async function generateAiPlaybook() {
    setAiLoading(true);
    setAiErr("");
    try {
      const payload = {
        range: data?.range,
        executive: data?.executive,
        topOpportunitiesGeo: data?.topOpportunitiesGeo,
        attribution: data?.attribution,
        actionCenter: data?.actionCenter,
        draftPlaybooks: playbooks,
      };
      const res = await fetch("/api/dashboard/facebook-ads/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to generate AI playbook");
      setAiPlaybook(json.insights || null);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Failed to generate AI playbook");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="shell callsDash gaDash">
      <DashboardTopbar
        title="My Drip Nurse — Facebook Ads Strategy Dashboard"
        subtitle="Planner de campanas por region con setup de funnel y copy listo para ejecutar."
        backHref={backHref}
        tenantId={tenantId}
        notificationsHref={notificationsHref}
        liveLabel="Planning Mode"
      />

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Executive Filters</h2>
            <div className="cardSubtitle">Afecta KPI y recomendaciones de campañas.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={() => load(true)} disabled={loading}>
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="filtersBar">
            <div className="rangePills">
              {(["today", "24h", "7d", "28d", "1m", "3m", "6m", "1y"] as RangePreset[]).map((p) => (
                <button key={p} className={`smallBtn ${preset === p ? "smallBtnOn" : ""}`} type="button" onClick={() => setPreset(p)}>
                  {p === "today"
                    ? "Today"
                    : p === "24h"
                      ? "24hr"
                      : p === "7d"
                        ? "7 days"
                        : p === "28d"
                          ? "28 days"
                          : p === "1m"
                            ? "Last month"
                            : p === "3m"
                              ? "Last quarter"
                              : p === "6m"
                                ? "Last 6 months"
                                : "Last year"}
                </button>
              ))}
              <button className={`smallBtn ${preset === "custom" ? "smallBtnOn" : ""}`} type="button" onClick={() => setPreset("custom")}>Custom</button>
            </div>
            <div className="dateInputs">
              <input className="input" type="date" value={start} onChange={(e) => setStart(e.target.value)} disabled={preset !== "custom"} />
              <input className="input" type="date" value={end} onChange={(e) => setEnd(e.target.value)} disabled={preset !== "custom"} />
              {preset === "custom" ? (
                <button className="btn btnPrimary" type="button" onClick={() => load(true)} disabled={!start || !end || loading}>Apply</button>
              ) : null}
            </div>
          </div>
          {error ? <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>X {error}</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Facebook Ads KPI Snapshot</h2>
            <div className="cardSubtitle">Diagnóstico para asignación de presupuesto y priorización geo.</div>
          </div>
          <div className="badge">Range {data?.range?.start ? new Date(data.range.start).toLocaleDateString() : "-"} → {data?.range?.end ? new Date(data.range.end).toLocaleDateString() : "-"}</div>
        </div>
        <div className="cardBody">
          <div className="kpiRow kpiRowWide">
            <div className="kpi"><p className="n">{fmtInt(stats.leads)}</p><p className="l">Leads</p></div>
            <div className="kpi"><p className="n">{fmtInt(stats.appts)}</p><p className="l">Appointments</p></div>
            <div className="kpi"><p className="n">{fmtInt(stats.lost)}</p><p className="l">Lost bookings</p></div>
            <div className="kpi"><p className="n">{fmtMoney(stats.lostValue)}</p><p className="l">Lost value</p></div>
            <div className="kpi"><p className="n">{fmtMoney(stats.revenue)}</p><p className="l">Revenue</p></div>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }} id="ai-playbook">
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Playbook (Facebook Ads Expert)</h2>
            <div className="cardSubtitle">Playbook generado por AI experto en campañas Meta por geo.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn aiBtn" type="button" onClick={generateAiPlaybook} disabled={aiLoading || loading || !playbooks.length}>
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
                aiPlaybook.playbook.slice(0, 6).map((p: FbAiPlaybookItem, idx: number) => (
                  <div className="moduleCard" key={`fb-ai-pb-${idx}`}>
                    <div className="moduleTop">
                      <p className="l moduleTitle">{String(p.region || "Region")}</p>
                      <span className={`mini aiImpact ${String(p.expected_impact || "medium")}`}>
                        {String(p.expected_impact || "medium").toUpperCase()}
                      </span>
                    </div>
                    <p className="mini moduleLine"><b>Objective:</b> {String(p.objective || "-")}</p>
                    <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(p.budget_daily_usd)}</p>
                    <p className="mini moduleLine"><b>Audience:</b> {String(p.audience || "-")}</p>
                    <p className="mini moduleLine"><b>Creative angle:</b> {String(p.creative_angle || "-")}</p>
                    <p className="mini moduleLine"><b>Ad copy:</b> {String(p.ad_copy || "-")}</p>
                    <p className="mini moduleLine"><b>Funnel:</b> {String(p.funnel_plan || "-")}</p>
                  </div>
                ))}
            </div>
          ) : (
            <div className="aiPlaceholder mini">
              Generate AI Playbook para crear campañas Meta por región con copy y funnel.
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Campaign Planner (Facebook Ads)</h2>
            <div className="cardSubtitle">Playbooks por estado con objetivo, audiencia, presupuesto y funnel copy.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={exportPlaybooksCsv} disabled={!playbooks.length}>
              Export CSV
            </button>
            <div className="badge">{playbooks.length} playbooks</div>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid">
            {playbooks.map((pb, idx) => (
              <div className="moduleCard" key={`${pb.region}-${idx}`}>
                <div className="moduleTop">
                  <p className="l moduleTitle">{pb.region}</p>
                  <span className="mini moduleDelta">{pb.objective}</span>
                </div>
                <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(pb.dailyBudget)}</p>
                <p className="mini moduleLine"><b>Audience:</b> {pb.audience}</p>
                <p className="mini moduleLine"><b>Offer:</b> {pb.offer}</p>
                <p className="mini moduleLine"><b>Primary text:</b> {pb.copyPrimary}</p>
                <p className="mini moduleLine"><b>Headline:</b> {pb.headline}</p>
                <p className="mini moduleLine"><b>CTA:</b> {pb.cta}</p>
                <p className="mini moduleLine"><b>Funnel:</b> {pb.funnel}</p>
              </div>
            ))}
          </div>
          {!playbooks.length ? <div className="mini" style={{ opacity: 0.8 }}>No hay data suficiente para generar playbooks.</div> : null}
          <div className="mini" style={{ marginTop: 10, opacity: 0.78 }}>
            Próximo upgrade: conectar Meta Marketing API para audiencias, campañas activas, spend real, CTR, CPL y ROAS automático.
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Strategist (Facebook Ads)</h2>
            <div className="cardSubtitle">Agente para planear estructura, presupuesto y copy por geo con memoria compartida.</div>
          </div>
          <div className="badge">shared memory</div>
        </div>
        <div className="cardBody">
          <AiAgentChatPanel
            agent="facebook_ads"
            title="Facebook Ads Agent Chat"
            context={{
              preset,
              start,
              end,
              range: data?.range,
              executive: data?.executive,
              topOpportunitiesGeo: data?.topOpportunitiesGeo,
              attribution: data?.attribution,
              actionCenter: data?.actionCenter,
              campaignPlaybooks: playbooks,
            }}
          />
        </div>
      </section>
    </div>
  );
}
