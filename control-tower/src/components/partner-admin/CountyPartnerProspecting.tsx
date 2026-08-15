"use client";

import { useEffect, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import type { PartnerAdminProspect, PartnerAdminProspectRun } from "@/lib/prospectingStore";

type ProspectResponse = {
  ok: boolean;
  configured?: boolean;
  error?: string;
  prospects?: PartnerAdminProspect[];
  savedCount?: number;
  lastRun?: PartnerAdminProspectRun | null;
};

export function CountyPartnerProspecting({ county, state }: { county: string; state: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "searching" | "error">("loading");
  const [configured, setConfigured] = useState(true);
  const [prospects, setProspects] = useState<PartnerAdminProspect[]>([]);
  const [savedCount, setSavedCount] = useState(0);
  const [lastRun, setLastRun] = useState<PartnerAdminProspectRun | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!county || !state) return;
    const controller = new AbortController();
    setStatus("loading");
    setMessage("");
    void fetch(`/api/partner-admin/prospects?county=${encodeURIComponent(county)}&state=${encodeURIComponent(state)}`, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json() as ProspectResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Partner opportunities.");
      setConfigured(Boolean(payload.configured));
      setProspects(payload.prospects || []);
      setSavedCount(Number(payload.savedCount || 0));
      setLastRun(payload.lastRun || null);
      setStatus("ready");
    }).catch((error) => {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "Could not load Partner opportunities.");
      setStatus("error");
    });
    return () => controller.abort();
  }, [county, state]);

  async function searchCounty() {
    setStatus("searching");
    setMessage("");
    try {
      const response = await fetch("/api/partner-admin/prospects", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ county, state }),
      });
      const payload = await response.json() as ProspectResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Google could not complete the search.");
      setConfigured(true);
      setProspects(payload.prospects || []);
      setSavedCount(Number(payload.savedCount || 0));
      setLastRun(payload.lastRun || null);
      setStatus("ready");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Google could not complete the search.";
      setConfigured(!text.toLowerCase().includes("not configured"));
      setMessage(text);
      setStatus("error");
    }
  }

  return <section className={styles.analyticsProspecting} aria-label={`Partner opportunities in ${county}, ${state}`}>
    <header>
      <div>
        <span>Partner prospecting</span>
        <strong>Find businesses across {county}</strong>
        <p>Google business results ranked by their operational fit for mobile IV therapy and wellness.</p>
      </div>
      <button type="button" onClick={searchCounty} disabled={status === "loading" || status === "searching" || !configured}>
        {status === "searching" ? "Searching Google…" : prospects.length ? "Search county again" : "Find 10 prospects"}
      </button>
    </header>

    {!configured ? <div className={styles.analyticsProspectingNotice} data-tone="setup">
      <strong>Google setup required</strong>
      <span>Add the server-side Places API key in Vercel to activate county prospecting.</span>
    </div> : null}
    {message ? <div className={styles.analyticsProspectingNotice} data-tone="error"><strong>Search unavailable</strong><span>{message}</span></div> : null}
    {status === "loading" ? <div className={styles.analyticsProspectingLoading}>Loading saved opportunities…</div> : null}

    {prospects.length ? <details className={`${styles.analyticsDisclosure} ${styles.analyticsProspectingDisclosure}`}>
      <summary className={styles.analyticsDisclosureSummary}>
        <span className={styles.analyticsDisclosureTitle}>
          <strong>Prospecting results</strong>
          <small>Top {prospects.length} shown · {savedCount} saved{lastRun?.createdAt ? ` · Updated ${shortDate(lastRun.createdAt)}${lastRun.newProspects ? ` · ${lastRun.newProspects} new` : ""}` : ""}</small>
        </span>
        <span className={styles.analyticsDisclosureAction} aria-hidden="true">
          <span className={styles.analyticsDisclosureShow}>Show all</span>
          <span className={styles.analyticsDisclosureHide}>Hide</span>
          <i />
        </span>
      </summary>
      <div className={styles.analyticsDisclosureContent}>
        <div className={styles.analyticsProspectList}>
          {prospects.map((prospect, index) => <article key={prospect.placeId} className={styles.analyticsProspectCard}>
            <div className={styles.analyticsProspectRank} aria-hidden="true">{String(index + 1).padStart(2, "0")}</div>
            <div className={styles.analyticsProspectContent}>
              <header>
                <div><strong>{prospect.businessName}</strong><span>{prospect.category || "Business category unavailable"}</span></div>
                <b data-score={scoreTone(prospect.fitScore)}>{prospect.fitScore}% fit</b>
              </header>
              <p>{prospect.formattedAddress || `${county}, ${state}`}</p>
              <div className={styles.analyticsProspectFacts}>
                <span>{prospect.fitLabel}</span>
                {prospect.rating ? <span>{prospect.rating.toFixed(1)} ★ · {prospect.userRatingCount} reviews</span> : null}
                {prospect.serviceAreaBusiness ? <span>Service-area business</span> : null}
              </div>
              {prospect.fitReasons.length ? <small>{prospect.fitReasons.join(" · ")}</small> : null}
              <div className={styles.analyticsProspectLinks}>
                {prospect.phone ? <a href={`tel:${prospect.phone}`}>{prospect.phone}</a> : <span>Phone unavailable</span>}
                {prospect.email ? <a href={`mailto:${prospect.email}`}>{prospect.email}</a> : <span>Email not publicly available</span>}
                {prospect.website ? <a href={prospect.website} target="_blank" rel="noreferrer">Website ↗</a> : null}
                {prospect.googleMapsUrl ? <a href={prospect.googleMapsUrl} target="_blank" rel="noreferrer">Google Maps ↗</a> : null}
              </div>
            </div>
          </article>)}
        </div>
        <p className={styles.analyticsProspectingFootnote}>Fit scores are operational estimates based on category, services, mobility signals, public contactability and Google business data. Google does not provide business emails.</p>
      </div>
    </details> : status === "ready" && configured ? <div className={styles.analyticsProspectingEmpty}>
      <strong>No saved prospects yet.</strong>
      <span>Run the county search to build a reusable prospect list.</span>
    </div> : null}
  </section>;
}

function scoreTone(score: number) {
  return score >= 80 ? "excellent" : score >= 65 ? "strong" : score >= 50 ? "possible" : "low";
}

function shortDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}
