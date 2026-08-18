"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import type { AdminCareAccount, AdminCareSummary } from "@/lib/adminCareAccounts";

const EMPTY_SUMMARY: AdminCareSummary = { total: 0, active30Days: 0, dormant: 0, neverSignedIn: 0, verified: 0, locked: 0 };

function formatDate(value: string, withTime = false) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

function initials(name: string, email: string) {
  return (name || email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "CA";
}

function statusCopy(status: AdminCareAccount["status"]) {
  if (status === "active") return "Active · 30 days";
  if (status === "dormant") return "Dormant";
  if (status === "locked") return "Locked";
  return "Never signed in";
}

function statusClass(status: AdminCareAccount["status"]) {
  if (status === "active") return styles.good;
  if (status === "locked") return styles.bad;
  return styles.warn;
}

export function PartnerAdminCareClient() {
  const [accounts, setAccounts] = useState<AdminCareAccount[]>([]);
  const [summary, setSummary] = useState<AdminCareSummary>(EMPTY_SUMMARY);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [provider, setProvider] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "250", status, provider });
      if (search.trim()) query.set("search", search.trim());
      const response = await fetch(`/api/partner-admin/care?${query}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load Care accounts.");
      setAccounts(payload.accounts || []);
      setSummary(payload.summary || EMPTY_SUMMARY);
      setSelectedId((current) => (payload.accounts || []).some((account: AdminCareAccount) => account.id === current) ? current : "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load Care accounts.");
    } finally {
      setLoading(false);
    }
  }, [provider, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = accounts.find((account) => account.id === selectedId) || null;

  return (
    <PartnerAdminShell title="Care" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>}>
      <div className={`${styles.frame} ${styles.careFrame}`}>
        <section className={`${styles.moduleHeader} ${styles.careHero}`}>
          <div><span className={styles.eyebrow}>Client app intelligence</span><h1>Care</h1><p>A focused view of every registered client account—access health, recent app activity and the care relationship behind each profile.</p></div>
          <div className={styles.careHeroSignal}><span>Active in the last 30 days</span><strong>{summary.active30Days}</strong><small>{summary.total ? Math.round((summary.active30Days / summary.total) * 100) : 0}% of registered accounts</small></div>
        </section>

        <section className={styles.careKpis} aria-label="Care account summary">
          <article><span>Registered accounts</span><strong>{summary.total}</strong><small>All client app profiles</small></article>
          <article className={styles.careKpiActive}><span>Active · 30 days</span><strong>{summary.active30Days}</strong><small>Recently signed in</small></article>
          <article><span>Verified</span><strong>{summary.verified}</strong><small>Verified email accounts</small></article>
          <article><span>Dormant</span><strong>{summary.dormant}</strong><small>No login in 30+ days</small></article>
          <article><span>Never signed in</span><strong>{summary.neverSignedIn}</strong><small>Registered without activity</small></article>
          <article className={summary.locked ? styles.careKpiAlert : ""}><span>Locked</span><strong>{summary.locked}</strong><small>Needs access attention</small></article>
        </section>

        <section className={`${styles.panel} ${styles.careDirectory}`}>
          <div className={styles.panelHeader}>
            <div><h2>Client accounts</h2><span className={styles.subtle}>{accounts.length} account{accounts.length === 1 ? "" : "s"} in this view</span></div>
            <div className={styles.careFilters}>
              <label className={styles.filterSearch}><span>Search</span><input className={`${styles.input} ${styles.search}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone or city" /></label>
              <label><span>Activity</span><select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">All activity</option><option value="active">Active · 30 days</option><option value="dormant">Dormant</option><option value="never_signed_in">Never signed in</option><option value="verified">Verified</option><option value="locked">Locked</option></select></label>
              <label><span>Sign-in</span><select className={styles.select} value={provider} onChange={(event) => setProvider(event.target.value)}><option value="all">All methods</option><option value="email">Email</option><option value="google">Google</option><option value="hybrid">Email + Google</option></select></label>
              {(search || status !== "all" || provider !== "all") ? <button type="button" className={styles.filterReset} onClick={() => { setSearch(""); setStatus("all"); setProvider("all"); }}>Clear</button> : null}
            </div>
          </div>

          {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
          {loading ? <div className={styles.loading}>Loading Care accounts…</div> : null}
          {!loading && !error && !accounts.length ? <div className={styles.resultsEmpty}><strong>0 accounts</strong><span>No registered accounts match this view.</span></div> : null}
          {!loading && accounts.length ? <div className={styles.careAccountList}>{accounts.map((account) => (
            <article className={styles.careAccountRow} key={account.id}>
              <div className={styles.careAccountIdentity}>
                <span className={styles.careAvatar}>{account.profilePhotoUrl ? <img src={account.profilePhotoUrl} alt="" /> : initials(account.fullName, account.email)}</span>
                <div><strong>{account.fullName || "Client account"}</strong><span>{account.email}</span><small>{account.phone || "No phone added"}</small></div>
              </div>
              <div className={styles.careAccountStatus}><span className={`${styles.badge} ${statusClass(account.status)}`}>{statusCopy(account.status)}</span><small>Last login · {formatDate(account.lastLoginAt)}</small></div>
              <div className={styles.careAccountMetric}><span>Profile</span><strong>{account.profileCompletion}%</strong><div><i style={{ width: `${account.profileCompletion}%` }} /></div></div>
              <div className={styles.careAccountMetric}><span>Care activity</span><strong>{account.appointmentCount} visit{account.appointmentCount === 1 ? "" : "s"}</strong><small>{account.upcomingCount} upcoming · {account.completedCount} completed</small></div>
              <button type="button" className={styles.tableAction} onClick={() => setSelectedId(account.id)}>View account</button>
            </article>
          ))}</div> : null}
        </section>
      </div>

      {selected ? <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(""); }}>
        <section className={`${styles.profileModal} ${styles.contactModal}`} role="dialog" aria-modal="true" aria-labelledby="care-account-title">
          <header className={styles.profileModalHeader}>
            <div className={styles.contactProfileTitle}><span className={styles.careModalAvatar}>{selected.profilePhotoUrl ? <img src={selected.profilePhotoUrl} alt="" /> : initials(selected.fullName, selected.email)}</span><div><span className={styles.eyebrow}>Care account</span><h2 id="care-account-title">{selected.fullName || "Client account"}</h2><p>Registered {formatDate(selected.createdAt)}</p></div></div>
            <button type="button" className={styles.closeButton} onClick={() => setSelectedId("")} aria-label="Close account">×</button>
          </header>
          <div className={styles.profileModalBody}>
            <div className={styles.contactKpis}><div><span>Profile</span><strong>{selected.profileCompletion}%</strong></div><div><span>Appointments</span><strong>{selected.appointmentCount}</strong></div><div><span>Upcoming</span><strong>{selected.upcomingCount}</strong></div><div><span>Completed</span><strong>{selected.completedCount}</strong></div><div><span>Completed value</span><strong>{money(selected.lifetimeValue, selected.currency)}</strong></div></div>
            <section className={styles.contactDetailSection}><h3>Account access</h3><div className={styles.contactDetailGrid}><div><span>Status</span><strong>{statusCopy(selected.status)}</strong></div><div><span>Sign-in method</span><strong>{selected.authProvider === "hybrid" ? "Email + Google" : selected.authProvider}</strong></div><div><span>Email verification</span><strong>{selected.emailVerified ? "Verified" : "Pending"}</strong></div><div><span>Last login</span><strong>{formatDate(selected.lastLoginAt, true)}</strong></div></div></section>
            <section className={styles.contactDetailSection}><h3>Client information</h3><div className={styles.contactDetailGrid}><div><span>Email</span><a href={`mailto:${selected.email}`}>{selected.email}</a></div><div><span>Phone</span>{selected.phone ? <a href={`tel:${selected.phone}`}>{selected.phone}</a> : <strong>Not provided</strong>}</div><div><span>Primary market</span><strong>{[selected.city, selected.state].filter(Boolean).join(", ") || "Not provided"}</strong></div><div><span>Saved addresses</span><strong>{selected.savedAddressCount}</strong></div></div></section>
            <section className={styles.contactDetailSection}><h3>Care relationship</h3><div className={styles.contactDetailGrid}><div><span>Last scheduled visit</span><strong>{formatDate(selected.lastAppointmentAt)}</strong></div><div><span>Referrals</span><strong>{selected.referralCount}</strong></div><div><span>Available rewards</span><strong>{selected.availableRewardCount}</strong></div><div><span>Account ID</span><strong>{selected.id}</strong></div></div></section>
          </div>
          <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setSelectedId("")}>Close</button><a className={styles.button} href={`mailto:${selected.email}`}>Email client</a></footer>
        </section>
      </div> : null}
    </PartnerAdminShell>
  );
}
