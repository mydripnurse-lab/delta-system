"use client";

import { useEffect, useMemo, useState } from "react";
import AiAgentChatPanel from "@/components/AiAgentChatPanel";
import DashboardTopbar from "@/components/DashboardTopbar";
import { useBrowserSearchParams } from "@/lib/useBrowserSearchParams";
import { useResolvedTenantId } from "@/lib/useResolvedTenantId";
import { computeDashboardRange, type DashboardRangePreset } from "@/lib/dateRangePresets";

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

type YoutubePlaybook = {
  region: string;
  objective: "Leads" | "Bookings" | "Retargeting";
  dailyBudget: number;
  audience: string;
  hook: string;
  script15s: string;
  script30s: string;
  cta: string;
  runwayPrompt: string;
};

type YoutubeAiPlaybookItem = {
  region: string;
  objective: string;
  budget_daily_usd: number;
  audience: string;
  video_hook: string;
  script_15s: string;
  script_30s: string;
  cta: string;
  runway_prompt: string;
  expected_impact: "low" | "medium" | "high";
};

type YoutubeAiInsights = {
  executive_summary?: string;
  scorecard?: { primary_risk?: string; primary_opportunity?: string };
  playbook?: YoutubeAiPlaybookItem[];
};

type RunwayVideoResponse = {
  ok: boolean;
  error?: string;
  id?: string;
  status?: string;
  model?: string;
  outputUrl?: string;
  outputPreviewUrl?: string;
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

export default function YoutubeAdsDashboardPage() {
  const searchParams = useBrowserSearchParams();
  const { tenantId, tenantReady } = useResolvedTenantId(searchParams);
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
  const [aiPlaybook, setAiPlaybook] = useState<YoutubeAiInsights | null>(null);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [preset, setPreset] = useState<RangePreset>("28d");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const [runwayPrompt, setRunwayPrompt] = useState("");
  const [runwayModel, setRunwayModel] = useState("gen4.5");
  const [runwayRatio, setRunwayRatio] = useState("1280:720");
  const [runwayDuration, setRunwayDuration] = useState("10");
  const [seedImageUrl, setSeedImageUrl] = useState("");
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoErr, setVideoErr] = useState("");
  const [videoGen, setVideoGen] = useState<RunwayVideoResponse | null>(null);

  async function load(force?: boolean) {
    if (!tenantReady) return;
    if (!tenantId) {
      setError("Missing tenant context. Open from Control Tower or use a mapped project domain.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const range = computeDashboardRange(preset, start, end);
      if (!range.start || !range.end) {
        throw new Error("Missing start/end range values.");
      }
      const qs = new URLSearchParams();
      qs.set("preset", preset);
      qs.set("start", range.start);
      qs.set("end", range.end);
      qs.set("tenantId", tenantId);
      qs.set("integrationKey", integrationKey);
      qs.set("compare", "1");
      if (force) qs.set("force", "1");
      const res = await fetch(`/api/dashboard/overview?${qs.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as OverviewResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json);
    } catch (e: unknown) {
      setData(null);
      setError(e instanceof Error ? e.message : "Failed to load YouTube Ads dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!tenantReady) return;
    if (preset !== "custom") load(false);
    else if (start && end) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, start, end, tenantReady, tenantId]);

  const playbooks = useMemo<YoutubePlaybook[]>(() => {
    const states = (data?.topOpportunitiesGeo?.states || []).slice(0, 6);
    return states.map((st, idx) => {
      const opps = Number(st.opportunities || 0);
      const val = Number(st.value || 0);
      const objective: YoutubePlaybook["objective"] = opps >= 8 ? "Bookings" : idx < 2 ? "Leads" : "Retargeting";
      const baseBudget = Math.max(25, Math.round((val / Math.max(1, opps)) * 0.18));
      const region = geoName(st.name);
      const hook =
        objective === "Bookings"
          ? `Need IV therapy in ${region} today?`
          : objective === "Leads"
            ? `Feeling low energy in ${region}?`
            : `Still thinking about booking your IV treatment?`;
      const script15s = `${hook} My Drip Nurse sends licensed nurses to your location. Same-day support, transparent pricing. Book now.`;
      const script30s = `${hook} My Drip Nurse serves ${region} with mobile IV therapy for hydration, recovery, and wellness goals. Licensed nurses, easy scheduling, and fast response. Click to get your personalized IV plan and book in minutes.`;
      const cta = objective === "Retargeting" ? "Finish booking today" : "Book your IV visit";
      const runwayPrompt =
        `Cinematic YouTube ad, ${region}, healthcare wellness tone, mobile IV nurse arrival, clean daylight, realistic people, subtle motion graphics, headline "${hook}", CTA "${cta}", 16:9, premium commercial style.`;
      return {
        region,
        objective,
        dailyBudget: baseBudget,
        audience: `Adults in ${region} with wellness, hydration, recovery, and premium healthcare intent`,
        hook,
        script15s,
        script30s,
        cta,
        runwayPrompt,
      };
    });
  }, [data]);

  useEffect(() => {
    if (!runwayPrompt && playbooks[0]?.runwayPrompt) {
      setRunwayPrompt(playbooks[0].runwayPrompt);
    }
  }, [playbooks, runwayPrompt]);

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
      "hook",
      "script_15s",
      "script_30s",
      "cta",
      "runway_prompt",
    ];
    const rows = playbooks.map((pb) => [
      pb.region,
      pb.objective,
      pb.dailyBudget,
      pb.audience,
      pb.hook,
      pb.script15s,
      pb.script30s,
      pb.cta,
      pb.runwayPrompt,
    ]);
    const dt = new Date().toISOString().slice(0, 10);
    downloadCsv(`youtube-ads-playbooks-${dt}.csv`, headers, rows);
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
      const res = await fetch("/api/dashboard/youtube-ads/insights", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to generate AI playbook");
      const insights = (json.insights || null) as YoutubeAiInsights | null;
      setAiPlaybook(insights);
      const topPrompt = s(insights?.playbook?.[0]?.runway_prompt);
      if (topPrompt) setRunwayPrompt(topPrompt);
    } catch (e: unknown) {
      setAiErr(e instanceof Error ? e.message : "Failed to generate AI playbook");
    } finally {
      setAiLoading(false);
    }
  }

  async function refreshVideoStatus() {
    const id = s(videoGen?.id);
    if (!id) return;
    setVideoErr("");
    try {
      const res = await fetch(`/api/dashboard/youtube-ads/video?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = (await res.json()) as RunwayVideoResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to get video status");
      setVideoGen(json);
    } catch (e: unknown) {
      setVideoErr(e instanceof Error ? e.message : "Failed to refresh video status");
    }
  }

  async function createRunwayVideo() {
    setVideoBusy(true);
    setVideoErr("");
    try {
      const res = await fetch("/api/dashboard/youtube-ads/video", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: runwayModel,
          ratio: runwayRatio,
          durationSeconds: Number(runwayDuration || 10),
          prompt: runwayPrompt,
          seedImageUrl,
        }),
      });
      const json = (await res.json()) as RunwayVideoResponse;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Runway generation failed");
      setVideoGen(json);
    } catch (e: unknown) {
      setVideoErr(e instanceof Error ? e.message : "Runway generation failed");
    } finally {
      setVideoBusy(false);
    }
  }

  useEffect(() => {
    const status = s(videoGen?.status).toLowerCase();
    const id = s(videoGen?.id);
    if (!id) return;
    if (status.includes("succeed") || status.includes("complete") || status.includes("fail") || status.includes("error")) {
      return;
    }
    const t = window.setTimeout(() => {
      void refreshVideoStatus();
    }, 7000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoGen?.id, videoGen?.status]);

  return (
    <div className="shell callsDash gaDash">
      <DashboardTopbar
        title="My Drip Nurse — YouTube Ads + Runway Studio"
        subtitle="Delta System + Geo opportunity data para crear y renderizar videos publicitarios con Runway Gen 4.5."
        backHref={backHref}
        tenantId={tenantId}
        notificationsHref={notificationsHref}
        liveLabel="Planning + Render Mode"
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
            <h2 className="cardTitle">YouTube Ads KPI Snapshot</h2>
            <div className="cardSubtitle">Diagnóstico para distribución de presupuesto por geo y potencial de video.</div>
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
            <h2 className="cardTitle">AI Playbook (YouTube Ads Expert)</h2>
            <div className="cardSubtitle">Guiones de 15s/30s + prompts para Runway basados en Delta System.</div>
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
                aiPlaybook.playbook.slice(0, 6).map((p: YoutubeAiPlaybookItem, idx: number) => (
                  <div className="moduleCard" key={`yt-ai-pb-${idx}`}>
                    <div className="moduleTop">
                      <p className="l moduleTitle">{String(p.region || "Region")}</p>
                      <span className={`mini aiImpact ${String(p.expected_impact || "medium")}`}>
                        {String(p.expected_impact || "medium").toUpperCase()}
                      </span>
                    </div>
                    <p className="mini moduleLine"><b>Objective:</b> {String(p.objective || "-")}</p>
                    <p className="mini moduleLine"><b>Budget/day:</b> {fmtMoney(p.budget_daily_usd)}</p>
                    <p className="mini moduleLine"><b>Audience:</b> {String(p.audience || "-")}</p>
                    <p className="mini moduleLine"><b>Hook:</b> {String(p.video_hook || "-")}</p>
                    <p className="mini moduleLine"><b>Script 15s:</b> {String(p.script_15s || "-")}</p>
                    <p className="mini moduleLine"><b>Script 30s:</b> {String(p.script_30s || "-")}</p>
                    <p className="mini moduleLine"><b>CTA:</b> {String(p.cta || "-")}</p>
                    <p className="mini moduleLine"><b>Runway prompt:</b> {String(p.runway_prompt || "-")}</p>
                    <div style={{ marginTop: 8 }}>
                      <button className="smallBtn" type="button" onClick={() => setRunwayPrompt(String(p.runway_prompt || ""))}>
                        Use Prompt in Video Lab
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <div className="aiPlaceholder mini">
              Generate AI Playbook para crear guiones de YouTube Ads y prompts listos para Runway.
            </div>
          )}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Campaign Planner (YouTube Ads)</h2>
            <div className="cardSubtitle">Playbooks por estado con hook creativo y guion para video ad.</div>
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
                <p className="mini moduleLine"><b>Hook:</b> {pb.hook}</p>
                <p className="mini moduleLine"><b>Script 15s:</b> {pb.script15s}</p>
                <p className="mini moduleLine"><b>Script 30s:</b> {pb.script30s}</p>
                <p className="mini moduleLine"><b>CTA:</b> {pb.cta}</p>
                <p className="mini moduleLine"><b>Runway prompt:</b> {pb.runwayPrompt}</p>
              </div>
            ))}
          </div>
          {!playbooks.length ? <div className="mini" style={{ opacity: 0.8 }}>No hay data suficiente para generar playbooks.</div> : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">Runway Gen-4.5 Video Lab</h2>
            <div className="cardSubtitle">Genera el video creativo y visualízalo directamente en este dashboard.</div>
          </div>
          <div className="cardHeaderActions">
            <button className="smallBtn" type="button" onClick={refreshVideoStatus} disabled={!videoGen?.id || videoBusy}>
              Refresh Status
            </button>
            <button className="smallBtn aiBtn" type="button" onClick={createRunwayVideo} disabled={videoBusy || !runwayPrompt.trim()}>
              {videoBusy ? "Generating..." : "Generate Video"}
            </button>
          </div>
        </div>
        <div className="cardBody">
          <div className="moduleGrid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            <div className="moduleCard">
              <p className="l moduleTitle">Model</p>
              <input className="input" value={runwayModel} onChange={(e) => setRunwayModel(e.target.value)} />
              <p className="mini" style={{ marginTop: 8, opacity: 0.8 }}>Default recomendado: `gen4.5`.</p>
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Aspect Ratio</p>
              <input className="input" value={runwayRatio} onChange={(e) => setRunwayRatio(e.target.value)} placeholder="1280:720" />
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Duration (sec)</p>
              <input className="input" type="number" min={5} max={30} value={runwayDuration} onChange={(e) => setRunwayDuration(e.target.value)} />
            </div>
            <div className="moduleCard">
              <p className="l moduleTitle">Seed Image URL (optional)</p>
              <input
                className="input"
                value={seedImageUrl}
                onChange={(e) => setSeedImageUrl(e.target.value)}
                placeholder="https://.../frame.jpg"
              />
              <p className="mini" style={{ marginTop: 8, opacity: 0.8 }}>
                Use this if selected model requires image-to-video.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <p className="l moduleTitle">Runway Prompt</p>
            <textarea
              className="input"
              rows={5}
              value={runwayPrompt}
              onChange={(e) => setRunwayPrompt(e.target.value)}
              placeholder="Describe the shot, style, camera movement, scene details, and CTA overlay..."
            />
          </div>

          {videoErr ? <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>X {videoErr}</div> : null}
          {videoGen ? (
            <div style={{ marginTop: 10 }}>
              <div className="mini" style={{ marginBottom: 8 }}>
                Generation ID: <b>{s(videoGen.id) || "-"}</b> · Status: <b>{s(videoGen.status) || "queued"}</b> · Model: <b>{s(videoGen.model) || runwayModel}</b>
              </div>
              {s(videoGen.outputUrl) ? (
                <video
                  src={s(videoGen.outputUrl)}
                  controls
                  style={{ width: "100%", maxHeight: 520, borderRadius: 12, border: "1px solid rgba(148,163,184,.25)" }}
                />
              ) : (
                <div className="mini" style={{ opacity: 0.82 }}>Video aún en proceso. Usa `Refresh Status` o espera auto-refresh.</div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle">AI Strategist (YouTube Ads)</h2>
            <div className="cardSubtitle">Agente con memoria compartida para estrategia, scripts y mejoras creativas.</div>
          </div>
          <div className="badge">shared memory</div>
        </div>
        <div className="cardBody">
          <AiAgentChatPanel
            agent="youtube_ads"
            title="YouTube Ads Agent Chat"
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
              aiPlaybook,
              runwayPrompt,
              runwayModel,
              runwayRatio,
              runwayDuration,
              seedImageUrl,
              runwayGeneration: videoGen,
            }}
          />
        </div>
      </section>
    </div>
  );
}
