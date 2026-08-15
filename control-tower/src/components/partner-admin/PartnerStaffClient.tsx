"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import styles from "@/app/partner-admin/partnerAdmin.module.css";
import type { PartnerAdminDirectoryItem } from "@/lib/partnerServiceAssignments";

function date(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "P";
}

export function PartnerStaffClient() {
  const [partners, setPartners] = useState<PartnerAdminDirectoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/partners", { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Partners.");
      setPartners(payload.partners || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Partners.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const visiblePartners = useMemo(() => {
    const query = search.trim().toLowerCase();
    return partners.filter((item) => {
      const haystack = `${item.displayName} ${item.email} ${item.businessName} ${item.websiteStatus}`.toLowerCase();
      return !query || haystack.includes(query);
    });
  }, [partners, search]);
  const activeServices = partners.reduce((total, item) => total + item.activeServiceCount, 0);

  return (
    <PartnerAdminShell title="Partners" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>Refresh partners</button>}>
      <div className={styles.frame}>
        <section className={styles.moduleHeader}>
          <div><span className={styles.eyebrow}>Partner network</span><h1>Partners</h1><p>Manage real Partner profiles, service access and coverage without depending on GHL calendars.</p></div>
          <div className={styles.moduleSummary}><strong>{partners.length}</strong><span>partner profiles</span><strong>{activeServices}</strong><span>active service assignments</span></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>My Drip Nurse Partners</h2>
            <span className={styles.subtle}>Open a profile to activate services, edit Partner pricing and manage approved coverage.</span>
            <div className={styles.filters}><input className={`${styles.input} ${styles.search}`} aria-label="Search Partners" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Partner, email, business or website status" /></div>
          </div>
          {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
          {loading ? <div className={styles.loading}>Loading Partners…</div> : null}
          {!loading && !error && !visiblePartners.length ? <div className={styles.empty}>No Partner profile matches this view.</div> : null}
          {!loading && visiblePartners.length ? (
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>Partner</th><th>Services</th><th>Coverage</th><th>Website</th><th>Activated</th><th /></tr></thead>
              <tbody>{visiblePartners.map((item) => (
                <tr key={item.id}>
                  <td><div className={styles.applicant}>
                    <div className={styles.avatar}>
                      {item.profilePhotoUrl ? <Image src={item.profilePhotoUrl} alt="" width={44} height={44} unoptimized /> : initials(item.displayName)}
                    </div>
                    <div><strong>{item.displayName}</strong><span>{item.businessName || item.email}</span></div>
                  </div></td>
                  <td><span className={`${styles.badge} ${item.activeServiceCount ? styles.good : styles.warn}`}>{item.activeServiceCount} active</span></td>
                  <td>{item.coverageAreaCount} {item.coverageAreaCount === 1 ? "assignment" : "assignments"}</td>
                  <td>
                    <div className={`${styles.websiteSummary} ${item.websiteStatus === "published" ? styles.websiteSummaryLive : styles.websiteSummaryPreview}`}>
                      <span><i aria-hidden="true" />{item.websiteStatus === "published" ? "Live" : "Not live"}</span>
                      <a href={item.websiteStatus === "published" ? item.websiteUrl : item.websitePreviewUrl} rel="noreferrer" target="_blank">
                        {item.websiteStatus === "published" ? "View live" : "Preview site"}<span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </td>
                  <td>{date(item.activatedAt)}</td>
                  <td><div className={styles.rowActions}><Link className={styles.textButton} href={`/applications/${item.applicationId}`}>Open profile →</Link></div></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : null}
        </section>
      </div>
    </PartnerAdminShell>
  );
}
