"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { AppointmentAnalyticsMap } from "@/components/partner-admin/AppointmentAnalyticsMap";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import type { AppointmentGeoPoint, AppointmentMapLossReason, AppointmentMapPerson, BusinessCoverageArea } from "@/lib/adminAppointmentAnalytics";

type LostReasons = Record<AppointmentMapLossReason, number>;

type AnalyticsPayload = {
  summary: { total: number; contacts: number; completed: number; active: number; cancelled: number; appointmentIntents: number; bookingAttempts: number; lostOpportunities: number; lostOpportunityValue: number; lostPlatformRevenue: number; lostPartnerEarnings: number; lostOpportunityRate: number; lostWithCurrentCoverage: number; lostWithoutCurrentCoverage: number; lostReasons: LostReasons; conversionRate: number; completionRate: number; completedValue: number; partnerEarnings: number; platformRevenue: number; markets: number; coveredCounties: number };
  points: AppointmentGeoPoint[];
  people: AppointmentMapPerson[];
  coverageAreas: BusinessCoverageArea[];
  markets: Array<Omit<AppointmentGeoPoint, "latitude" | "longitude">>;
  trend: TrendPoint[];
};

type TrendPoint = { date: string; total: number; completed: number; intents: number; lost: number };
type Granularity = "week" | "month" | "year";

const STATUS_OPTIONS = [["", "All activity"], ["lost_opportunity", "Lost opportunities"], ["payment_pending", "Payment pending"], ["confirmed", "Confirmed"], ["partner_acknowledged", "Accepted by Partner"], ["in_progress", "In progress"], ["completed", "Completed"], ["partner_declined", "Partner declined"], ["cancelled", "Cancelled"], ["refunded", "Refunded"], ["failed", "Failed"]] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function bucketLabel(value: string, granularity: Granularity) {
  const date = new Date(`${value}T00:00:00`);
  if (granularity === "year") return String(date.getFullYear());
  if (granularity === "month") return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date);
}

function TrendChart({ points, type, granularity }: { points: TrendPoint[]; type: "bar" | "line"; granularity: Granularity }) {
  const max = Math.max(1, ...points.flatMap((point) => [point.total, point.completed, point.lost]));
  if (!points.length) return <div className={styles.trendEmpty}>No appointment or lead activity in this period.</div>;
  if (type === "bar") return <div className={styles.trendBars}>{points.map((point) => <div key={point.date} title={`${bucketLabel(point.date, granularity)}: ${point.total} appointments, ${point.completed} completed, ${point.lost} lost opportunities`}><span className={styles.trendBarGroup}><i className={styles.trendTotal} style={{ height: `${Math.max(3, (point.total / max) * 100)}%` }} /><i className={styles.trendCompleted} style={{ height: `${Math.max(3, (point.completed / max) * 100)}%` }} /><i className={styles.trendLost} style={{ height: `${Math.max(3, (point.lost / max) * 100)}%` }} /></span><small>{bucketLabel(point.date, granularity)}</small></div>)}</div>;
  const width = 720; const height = 250; const padX = 18; const padY = 20;
  const coordinates = (key: "total" | "completed" | "lost") => points.map((point, index) => `${padX + (index * (width - padX * 2)) / Math.max(1, points.length - 1)},${height - padY - (point[key] / max) * (height - padY * 2)}`).join(" ");
  return <div className={styles.trendLineWrap}><svg className={styles.trendLine} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${granularity} appointments, completions and lost opportunities`}><line x1="0" x2={width} y1={height - padY} y2={height - padY} /><polyline className={styles.lineTotal} points={coordinates("total")} /><polyline className={styles.lineCompleted} points={coordinates("completed")} /><polyline className={styles.lineLost} points={coordinates("lost")} /></svg><div className={styles.trendLabels}>{points.map((point) => <small key={point.date}>{bucketLabel(point.date, granularity)}</small>)}</div></div>;
}

export function PartnerAdminAnalyticsClient() {
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [period, setPeriod] = useState("90");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [chartType, setChartType] = useState<"bar" | "line">("line");
  const [granularity, setGranularity] = useState<Granularity>("week");
  const [dimension, setDimension] = useState<"city" | "county" | "state">("county");
  const [coverageVisible, setCoverageVisible] = useState(true);
  const [coverageGapsVisible, setCoverageGapsVisible] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const layersRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ period, granularity }); if (status) query.set("status", status); if (search.trim()) query.set("search", search.trim()); if (from) query.set("from", from); if (to) query.set("to", to);
      const response = await fetch(`/api/partner-admin/analytics?${query}`, { cache: "no-store" });
      if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load analytics.");
      setAnalytics(payload.analytics);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load analytics."); }
    finally { setLoading(false); }
  }, [from, granularity, period, search, status, to]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 250); return () => window.clearTimeout(timer); }, [load]);

  useEffect(() => {
    if (!layersOpen) return;
    const closeLayers = (event: PointerEvent) => {
      if (!layersRef.current?.contains(event.target as Node)) setLayersOpen(false);
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLayersOpen(false);
    };
    document.addEventListener("pointerdown", closeLayers);
    document.addEventListener("keydown", closeWithEscape);
    return () => {
      document.removeEventListener("pointerdown", closeLayers);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [layersOpen]);

  const rankedMarkets = useMemo(() => {
    const grouped = new Map<string, { label: string; context: string; total: number; completed: number; active: number; cancelled: number; lost: number; activity: number; completedValue: number }>();
    for (const market of analytics?.markets || []) {
      const key = dimension === "state" ? market.state : dimension === "county" ? `${market.county}|${market.state}` : `${market.city}|${market.state}`;
      const label = dimension === "state" ? market.state : dimension === "county" ? market.county : market.city;
      const context = dimension === "state" ? "United States" : market.state;
      const current = grouped.get(key) || { label, context, total: 0, completed: 0, active: 0, cancelled: 0, lost: 0, activity: 0, completedValue: 0 };
      current.total += market.total; current.completed += market.completed; current.active += market.active; current.cancelled += market.cancelled; current.lost += market.lost; current.activity += market.activity; current.completedValue += market.completedValue;
      grouped.set(key, current);
    }
    return [...grouped.values()].sort((a, b) => b.activity - a.activity).slice(0, 30);
  }, [analytics, dimension]);

  const summary = analytics?.summary;
  const activeMapLayerCount = Number(coverageVisible) + Number(coverageGapsVisible);

  return <PartnerAdminShell title="Business Analytics" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>}>
    <div className={styles.frame}>
      <section className={`${styles.moduleHeader} ${styles.analyticsHero}`}>
        <div><span className={styles.eyebrow}>Growth intelligence</span><h1>Business Analytics</h1><p>Connect demand, completed visits, lost opportunities and active coverage to understand where the business can grow.</p></div>
        <div className={styles.analyticsFilters}><label className={styles.analyticsSearch}><span>Search</span><input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Market, ZIP, service or lead" /></label><label><span>Preset</span><select className={styles.select} value={period} onChange={(event) => { setPeriod(event.target.value); setFrom(""); setTo(""); }}><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option><option value="all">All time</option></select></label><label><span>From</span><input className={styles.input} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label><label><span>To</span><input className={styles.input} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label><label><span>Activity</span><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}>{STATUS_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{(search || from || to || status) ? <button type="button" className={styles.filterReset} onClick={() => { setSearch(""); setFrom(""); setTo(""); setStatus(""); setPeriod("90"); }}>Clear</button> : null}</div>
      </section>
      {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
      {loading && !analytics ? <div className={styles.loading}>Building geographic intelligence…</div> : null}
      {analytics ? <>
        <section className={styles.analyticsKpis}>
          <article><span>Total appointments</span><strong>{summary?.total || 0}</strong><small>{summary?.contacts || 0} unique contacts</small></article>
          <article><span>Appointment intents</span><strong>{summary?.appointmentIntents || 0}</strong><small>{summary?.bookingAttempts || 0} booking attempts · unique people</small></article>
          <article className={styles.lostKpi}>
            <span>Lost opportunity value</span>
            <strong>{money(summary?.lostOpportunityValue || 0)}</strong>
            <div className={styles.lostKpiBreakdown}>
              <div><small>My Drip Nurse</small><b>{money(summary?.lostPlatformRevenue || 0)}</b></div>
              <div><small>Partners</small><b>{money(summary?.lostPartnerEarnings || 0)}</b></div>
            </div>
            <small>{summary?.lostOpportunities || 0} lost opportunities · {summary?.lostOpportunityRate || 0}% of intents</small>
          </article>
          <article><span>Completed</span><strong>{summary?.completed || 0}</strong><small>{summary?.completionRate || 0}% completion rate</small></article>
          <article><span>Active pipeline</span><strong>{summary?.active || 0}</strong><small>Scheduled or in progress</small></article>
          <article className={styles.partnerRevenueKpi}><span>Generated for Partners</span><strong>{money(summary?.partnerEarnings || 0)}</strong><small>Service earnings from completed visits</small></article>
          <article className={styles.platformRevenueKpi}><span>My Drip Nurse revenue</span><strong>{money(summary?.platformRevenue || 0)}</strong><small>Gross deposit revenue from completed visits</small></article>
          <article><span>Markets reached</span><strong>{summary?.markets || 0}</strong><small>Unique city and county combinations</small></article>
        </section>
        <section className={styles.analyticsCausePanel}>
          <header><div><span className={styles.eyebrow}>Opportunity diagnosis</span><h2>Why bookings were not completed</h2><p>Exact diagnostics are recorded for new leads. Earlier leads remain clearly marked when coverage and availability cannot be safely separated.</p></div><div className={styles.analyticsCoverageSummary}><span><strong>{summary?.coveredCounties || 0}</strong> covered counties</span><span><strong>{summary?.lostWithCurrentCoverage || 0}</strong> recoverable with coverage now</span><span data-gap="true"><strong>{summary?.lostWithoutCurrentCoverage || 0}</strong> current coverage gaps</span></div></header>
          <div className={styles.analyticsCauseGrid}>
            <article><i className={styles.causeCoverage} /><span>No coverage</span><strong>{summary?.lostReasons.no_coverage || 0}</strong><small>The service and location did not match an active Partner.</small></article>
            <article><i className={styles.causeAvailability} /><span>No availability</span><strong>{summary?.lostReasons.no_availability || 0}</strong><small>Coverage existed, but the requested date had no open time.</small></article>
            <article><i className={styles.causeDropoff} /><span>Booking drop-off</span><strong>{summary?.lostReasons.booking_not_completed || 0}</strong><small>Options existed, but the patient did not complete the booking.</small></article>
            <article><i className={styles.causeScreening} /><span>Screening review</span><strong>{summary?.lostReasons.screening || 0}</strong><small>Screening answers prevented online booking.</small></article>
            <article><i className={styles.causeLegacy} /><span>Needs classification</span><strong>{(summary?.lostReasons.coverage_or_availability || 0) + (summary?.lostReasons.unclassified || 0)}</strong><small>Earlier events without enough diagnostic evidence.</small></article>
          </div>
        </section>
        <section className={styles.analyticsMapPanel}>
          <header>
            <div><span className={styles.eyebrow}>Live market map</span><h2>Demand and coverage across the network</h2><p>Appointment activity appears as bubbles. Use Layers to compare demand with the counties currently covered by active Partners.</p></div>
            <div className={styles.analyticsMapHeaderTools}>
              <div className={styles.analyticsLegend} aria-label="Appointment activity legend"><span><i className={styles.legendLow} />Low completion</span><span><i className={styles.legendMid} />Developing</span><span><i className={styles.legendHigh} />High completion</span></div>
              <div className={styles.analyticsLayers} ref={layersRef}>
                <button type="button" className={styles.analyticsLayersTrigger} aria-expanded={layersOpen} aria-haspopup="menu" onClick={() => setLayersOpen((open) => !open)}>
                  <span className={styles.analyticsLayersIcon} aria-hidden="true"><i /><i /></span>
                  <span>Layers</span>
                  <small>{activeMapLayerCount ? `${activeMapLayerCount} on` : "All off"}</small>
                  <b aria-hidden="true">⌄</b>
                </button>
                {layersOpen ? <div className={styles.analyticsLayersMenu} role="menu" aria-label="Map layers">
                  <div className={styles.analyticsLayersMenuHeader}><strong>Map layers</strong><span>Choose what appears over demand.</span></div>
                  <button type="button" role="menuitemcheckbox" aria-checked={coverageVisible} onClick={() => setCoverageVisible((visible) => !visible)}>
                    <i className={styles.legendCoverage} aria-hidden="true" />
                    <span><strong>Active coverage</strong><small>{analytics.coverageAreas.length} covered {analytics.coverageAreas.length === 1 ? "county" : "counties"}</small></span>
                    <span className={styles.analyticsLayerSwitch} data-active={coverageVisible ? "true" : "false"} aria-hidden="true"><i /></span>
                  </button>
                  <button type="button" role="menuitemcheckbox" aria-checked={coverageGapsVisible} onClick={() => setCoverageGapsVisible((visible) => !visible)}>
                    <i className={styles.legendCoverageGap} aria-hidden="true" />
                    <span><strong>Coverage gaps</strong><small>Uncovered counties across USA &amp; Puerto Rico</small></span>
                    <span className={styles.analyticsLayerSwitch} data-active={coverageGapsVisible ? "true" : "false"} aria-hidden="true"><i /></span>
                  </button>
                </div> : null}
              </div>
            </div>
          </header>
          <AppointmentAnalyticsMap points={analytics.points} people={analytics.people || []} coverageAreas={analytics.coverageAreas || []} coverageVisible={coverageVisible} coverageGapsVisible={coverageGapsVisible} />
        </section>
        <section className={styles.analyticsLowerGrid}>
          <article className={styles.analyticsTrend}><header><div><h2>Appointment momentum</h2><span>{granularity === "week" ? "Weekly" : granularity === "month" ? "Monthly" : "Yearly"} appointments, completions and lost opportunities</span></div><div className={styles.chartTools}><div className={styles.trendLegend}><span><i className={styles.legendAppointments} />Appointments</span><span><i className={styles.legendCompleted} />Completed</span><span><i className={styles.legendLost} />Lost</span></div><div className={styles.chartSwitches}><div className={styles.dimensionSwitch} aria-label="Chart interval">{(["week", "month", "year"] as Granularity[]).map((item) => <button type="button" aria-pressed={granularity === item} className={granularity === item ? styles.dimensionActive : ""} onClick={() => setGranularity(item)} key={item}>{item === "week" ? "Weekly" : item === "month" ? "Monthly" : "Yearly"}</button>)}</div><div className={styles.dimensionSwitch} aria-label="Chart style"><button type="button" aria-pressed={chartType === "line"} className={chartType === "line" ? styles.dimensionActive : ""} onClick={() => setChartType("line")}>Line</button><button type="button" aria-pressed={chartType === "bar"} className={chartType === "bar" ? styles.dimensionActive : ""} onClick={() => setChartType("bar")}>Bars</button></div></div></div></header><TrendChart points={analytics.trend} type={chartType} granularity={granularity} /></article>
          <article className={styles.marketRanking}><header><div><h2>Market opportunities</h2><span>Appointments and unconverted intent by location</span></div><div className={styles.dimensionSwitch}>{(["city", "county", "state"] as const).map((item) => <button type="button" className={dimension === item ? styles.dimensionActive : ""} onClick={() => setDimension(item)} key={item}>{item}</button>)}</div></header><div className={styles.marketRows}>{rankedMarkets.length ? rankedMarkets.map((market, index) => <div key={`${market.label}-${market.context}`}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{market.label}</strong><small>{market.context}</small></span><span><strong>{market.activity}</strong><small>{market.total} appointments · {market.lost} lost</small></span></div>) : <p>No markets match this view.</p>}</div></article>
        </section>
      </> : null}
    </div>
  </PartnerAdminShell>;
}
