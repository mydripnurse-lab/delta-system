"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import type { PartnerDirectoryAdminAnalytics } from "@/lib/partnerDirectoryAnalytics";

type Range = 7 | 30 | 90;

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
}

function changeLabel(value: number | null, suffix = "%") {
  if (value === null) return "New activity";
  if (!value) return "No change";
  return `${value > 0 ? "+" : ""}${value}${suffix} vs prior period`;
}

function DirectoryTrend({ analytics }: { analytics: PartnerDirectoryAdminAnalytics }) {
  const points = analytics.trend;
  const max = Math.max(1, ...points.flatMap((point) => [point.impressions, point.profileClicks, point.bookingClicks]));
  const plot = { left: 18, right: 982, top: 14, bottom: 236 };
  const polyline = (key: "impressions" | "profileClicks" | "bookingClicks") => points.map((point, index) => {
    const x = points.length === 1
      ? (plot.left + plot.right) / 2
      : plot.left + (index / (points.length - 1)) * (plot.right - plot.left);
    const y = plot.bottom - (point[key] / max) * (plot.bottom - plot.top);
    return `${x},${y}`;
  }).join(" ");
  return <div className={styles.directoryAdminTrend}>
    <svg viewBox="0 0 1000 250" preserveAspectRatio="none" role="img" aria-label={`Directory activity for the last ${analytics.days} days`}>
      <defs>
        <clipPath id="directory-trend-plot">
          <rect x="8" y="6" width="984" height="238" rx="8" />
        </clipPath>
      </defs>
      <g className={styles.directoryTrendGrid}>
        {[14, 88, 162, 236].map((y) => <line key={y} x1={plot.left} x2={plot.right} y1={y} y2={y} />)}
      </g>
      <g clipPath="url(#directory-trend-plot)" className={styles.directoryTrendSeries}>
        <polyline className={styles.directoryLineImpressions} points={polyline("impressions")} />
        <polyline className={styles.directoryLineProfiles} points={polyline("profileClicks")} />
        <polyline className={styles.directoryLineBookings} points={polyline("bookingClicks")} />
      </g>
    </svg>
    <div><span>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${points[0]?.date}T00:00:00`))}</span><span>Today</span></div>
  </div>;
}

export function PartnerDirectoryAnalyticsClient() {
  const [range, setRange] = useState<Range>(30);
  const [analytics, setAnalytics] = useState<PartnerDirectoryAdminAnalytics | null>(null);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<"all" | "published" | "hidden">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/directory-analytics?days=${range}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load directory analytics.");
      setAnalytics(payload.analytics);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load directory analytics.");
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const partners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (analytics?.partners || []).filter((partner) => {
      const matchesSearch = !query || `${partner.displayName} ${partner.businessName} ${partner.slug}`.toLowerCase().includes(query);
      const matchesVisibility = visibility === "all" || partner.directoryStatus === visibility;
      return matchesSearch && matchesVisibility;
    });
  }, [analytics, search, visibility]);

  const summary = analytics?.summary;
  const topPartner = analytics?.partners.find((partner) => partner.impressions > 0);

  return <PartnerAdminShell title="Directory analytics" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh data"}</button>}>
    <div className={styles.frame}>
      <section className={`${styles.moduleHeader} ${styles.directoryAnalyticsHero}`}>
        <div><span className={styles.eyebrow}>Patient discovery</span><h1>Directory analytics</h1><p>Understand how patients find the network, which Partner profiles earn attention, and where discovery advances toward a booking.</p></div>
        <div className={styles.directoryRange} aria-label="Analytics period">{([7, 30, 90] as Range[]).map((days) => <button type="button" key={days} aria-pressed={range === days} className={range === days ? styles.directoryRangeActive : ""} onClick={() => setRange(days)}>{days} days</button>)}</div>
      </section>

      {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
      {loading && !analytics ? <div className={styles.loading}>Loading directory performance…</div> : null}
      {analytics ? <>
        <section className={styles.directoryAdminKpis}>
          <article><span>Visible appearances</span><strong>{summary?.impressions.toLocaleString()}</strong><small>{changeLabel(analytics.change.impressions)}</small></article>
          <article><span>Profile opens</span><strong>{summary?.profileClicks.toLocaleString()}</strong><small>{changeLabel(analytics.change.profileClicks)}</small></article>
          <article><span>Directory CTR</span><strong>{summary?.clickThroughRate}%</strong><small>{changeLabel(analytics.change.clickThroughRate, " pts")}</small></article>
          <article><span>Booking starts</span><strong>{summary?.bookingClicks.toLocaleString()}</strong><small>{changeLabel(analytics.change.bookingClicks)}</small></article>
          <article><span>Profile → booking</span><strong>{summary?.profileToBookingRate}%</strong><small>Booking starts from profile opens</small></article>
          <article><span>Profiles visible</span><strong>{summary?.visiblePartners}/{summary?.totalPartners}</strong><small>Published in the public directory</small></article>
        </section>

        <section className={styles.directoryAdminGrid}>
          <article className={styles.directoryAdminChartCard}>
            <header><div><span className={styles.eyebrow}>Network trend</span><h2>Discovery momentum</h2><p>Daily public directory activity across every Partner profile.</p></div><div className={styles.directoryAdminLegend}><span><i className={styles.directoryLegendImpressions} />Appearances</span><span><i className={styles.directoryLegendProfiles} />Profile opens</span><span><i className={styles.directoryLegendBookings} />Booking starts</span></div></header>
            <DirectoryTrend analytics={analytics} />
          </article>
          <article className={styles.directoryFunnelCard}>
            <span className={styles.eyebrow}>Discovery funnel</span><h2>From visibility to intent</h2>
            <div className={styles.directoryFunnel}>
              <div><strong>{summary?.impressions.toLocaleString()}</strong><span>Visible appearances</span><i style={{ width: "100%" }} /></div>
              <div><strong>{summary?.profileClicks.toLocaleString()}</strong><span>Profile opens</span><i style={{ width: `${Math.max(5, summary?.clickThroughRate || 0)}%` }} /></div>
              <div><strong>{summary?.bookingClicks.toLocaleString()}</strong><span>Booking starts</span><i style={{ width: `${Math.max(5, summary?.profileToBookingRate || 0)}%` }} /></div>
            </div>
            <p>{topPartner ? <><strong>{topPartner.displayName}</strong> currently leads visibility with {topPartner.impressions.toLocaleString()} appearances.</> : "Activity will appear here as patients discover published profiles."}</p>
          </article>
        </section>

        <section className={`${styles.panel} ${styles.directoryPartnerPanel}`}>
          <div className={styles.panelHeader}>
            <div><span className={styles.eyebrow}>Partner comparison</span><h2>Profile performance</h2><p className={styles.subtle}>Compare discovery, engagement, booking intent, visibility and readiness signals.</p></div>
            <div className={styles.directoryPartnerFilters}><input className={styles.input} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Partner or business" aria-label="Search directory performance" /><select className={styles.select} value={visibility} onChange={(event) => setVisibility(event.target.value as typeof visibility)}><option value="all">All profiles</option><option value="published">Visible</option><option value="hidden">Hidden</option></select></div>
          </div>
          {!partners.length ? <div className={styles.empty}>No Partner profile matches these filters.</div> : <div className={styles.tableWrap}><table className={`${styles.table} ${styles.directoryPerformanceTable}`}>
            <thead><tr><th>Partner</th><th>Visibility</th><th>Appearances</th><th>Profile opens</th><th>CTR</th><th>Booking starts</th><th>Profile → booking</th><th>Readiness</th><th /></tr></thead>
            <tbody>{partners.map((partner) => <tr key={partner.id}>
              <td><div className={styles.applicant}><div className={styles.avatar}>{partner.profilePhotoUrl ? <Image src={partner.profilePhotoUrl} alt="" width={40} height={40} unoptimized /> : initials(partner.displayName)}</div><div><strong>{partner.displayName}</strong><span>{partner.businessName || partner.slug}</span></div></div></td>
              <td><span className={`${styles.badge} ${partner.directoryStatus === "published" ? styles.good : styles.warn}`}>{partner.directoryStatus === "published" ? "Visible" : "Hidden"}</span></td>
              <td><strong>{partner.impressions.toLocaleString()}</strong></td>
              <td>{partner.profileClicks.toLocaleString()}</td>
              <td>{partner.clickThroughRate}%</td>
              <td>{partner.bookingClicks.toLocaleString()}</td>
              <td>{partner.profileToBookingRate}%</td>
              <td><div className={styles.directoryReadiness}><span><i style={{ width: `${partner.organicScore}%` }} /></span><small>{partner.organicScore}% · {partner.availabilityConfigured ? "Schedule ready" : "No availability"}</small></div></td>
              <td><div className={styles.rowActions}><a className={styles.textButton} href={`https://partners.mydripnurse.com/${partner.slug}`} target="_blank" rel="noreferrer">View profile ↗</a><Link className={styles.textButton} href={`/applications/${partner.applicationId}`}>Manage →</Link></div></td>
            </tr>)}</tbody>
          </table></div>}
        </section>
      </> : null}
    </div>
  </PartnerAdminShell>;
}
