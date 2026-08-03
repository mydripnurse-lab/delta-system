"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StaffAdminApplication } from "@/lib/staffAdmin";
import type {
  PartnerAdminNotificationSettings,
  PartnerAdminWebhookTarget,
} from "@/lib/partnerAdminSettings";
import { PartnerAdminLogout } from "@/components/partner-admin/PartnerAdminLogout";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

const STATUS_OPTIONS = [
  ["all", "All applications"],
  ["submitted", "New submissions"],
  ["stripe_pending", "Stripe pending"],
  ["staff_ready", "Ready for staff"],
  ["staff_processing", "Staff processing"],
  ["calendar_deposit_pending", "Deposit pending"],
  ["ready_to_complete", "Ready to finish"],
  ["completed", "Completed"],
  ["failed", "Needs attention"],
  ["rejected", "Rejected"],
];

function tone(status: string) {
  if (["completed", "staff_ready", "ready_to_complete", "complete"].includes(status)) return styles.good;
  if (["failed", "rejected"].includes(status)) return styles.bad;
  if (["submitted", "under_review", "stripe_pending", "calendar_deposit_pending"].includes(status)) return styles.warn;
  return styles.info;
}

function label(status: string) {
  return status.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function date(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

export function PartnerAdminClient() {
  const [applications, setApplications] = useState<StaffAdminApplication[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<PartnerAdminNotificationSettings[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [applicantWebhookUrl, setApplicantWebhookUrl] = useState("");
  const [adminWebhookUrl, setAdminWebhookUrl] = useState("");
  const [adminBaseUrl, setAdminBaseUrl] = useState("https://admin.mydripnurse.com");
  const [clearApplicantWebhook, setClearApplicantWebhook] = useState(false);
  const [clearAdminWebhook, setClearAdminWebhook] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [settingsNotice, setSettingsNotice] = useState("");
  const [testingTarget, setTestingTarget] = useState<PartnerAdminWebhookTarget | "">("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status });
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/partner-admin/applications?${params.toString()}`, { cache: "no-store" });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load applications.");
      setApplications(payload.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load applications.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timeout = window.setTimeout(load, 250);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError("");
    try {
      const response = await fetch("/api/partner-admin/settings", { cache: "no-store" });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load notification settings.");
      const nextSettings = (payload.settings || []) as PartnerAdminNotificationSettings[];
      setSettings(nextSettings);
      setSelectedTenantId((current) => (
        nextSettings.some((item) => item.tenantId === current) ? current : nextSettings[0]?.tenantId || ""
      ));
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not load notification settings.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const openSettings = useCallback(() => {
    setSettingsOpen(true);
    setSettingsNotice("");
    setSettingsError("");
    void loadSettings();
  }, [loadSettings]);

  const closeSettings = useCallback(() => {
    if (settingsSaving || testingTarget) return;
    setSettingsOpen(false);
  }, [settingsSaving, testingTarget]);

  useEffect(() => {
    if (!settingsOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [closeSettings, settingsOpen]);

  const selectedSettings = useMemo(
    () => settings.find((item) => item.tenantId === selectedTenantId) || null,
    [selectedTenantId, settings],
  );

  useEffect(() => {
    if (!selectedSettings) return;
    setAdminBaseUrl(selectedSettings.adminBaseUrl || "https://admin.mydripnurse.com");
    setApplicantWebhookUrl("");
    setAdminWebhookUrl("");
    setClearApplicantWebhook(false);
    setClearAdminWebhook(false);
    setSettingsNotice("");
    setSettingsError("");
  }, [selectedSettings]);

  const saveSettings = useCallback(async () => {
    if (!selectedTenantId) return;
    setSettingsSaving(true);
    setSettingsError("");
    setSettingsNotice("");
    try {
      const response = await fetch("/api/partner-admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: selectedTenantId,
          applicantReceivedWebhookUrl: applicantWebhookUrl,
          adminNotificationWebhookUrl: adminWebhookUrl,
          adminBaseUrl,
          clearApplicantWebhook,
          clearAdminWebhook,
        }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save notification settings.");
      const saved = payload.settings as PartnerAdminNotificationSettings;
      setSettings((current) => current.map((item) => item.tenantId === saved.tenantId ? saved : item));
      setApplicantWebhookUrl("");
      setAdminWebhookUrl("");
      setClearApplicantWebhook(false);
      setClearAdminWebhook(false);
      setSettingsNotice("Notification settings saved securely.");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not save notification settings.");
    } finally {
      setSettingsSaving(false);
    }
  }, [
    adminBaseUrl,
    adminWebhookUrl,
    applicantWebhookUrl,
    clearAdminWebhook,
    clearApplicantWebhook,
    selectedTenantId,
  ]);

  const testWebhook = useCallback(async (target: PartnerAdminWebhookTarget) => {
    if (!selectedTenantId) return;
    setTestingTarget(target);
    setSettingsError("");
    setSettingsNotice("");
    try {
      const response = await fetch("/api/partner-admin/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: selectedTenantId, target }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The webhook test failed.");
      setSettingsNotice(`${target === "applicant_received" ? "Applicant" : "Administrator"} webhook test delivered successfully (HTTP ${payload.result.status}).`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "The webhook test failed.");
    } finally {
      setTestingTarget("");
    }
  }, [selectedTenantId]);

  const stats = useMemo(() => ({
    total: applications.length,
    newCount: applications.filter((item) => item.status === "submitted").length,
    inProgress: applications.filter((item) => !["submitted", "completed", "rejected"].includes(item.status)).length,
    complete: applications.filter((item) => item.status === "completed").length,
  }), [applications]);

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div className={styles.brand}>
            <div className={styles.logo}>MDN</div>
            <div className={styles.brandCopy}>
              <strong>My Drip Nurse</strong>
              <span>Partner operations</span>
            </div>
          </div>
          <div className={styles.topbarActions}>
            <button type="button" className={styles.secondaryButton} onClick={openSettings}>Notification settings</button>
            <button type="button" className={styles.secondaryButton} onClick={load} disabled={loading}>Refresh</button>
            <PartnerAdminLogout className={styles.secondaryButton} />
          </div>
        </header>

        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Partner administration</span>
            <h1>Registrations, reviewed with control.</h1>
            <p>Review every applicant, connect Stripe manually, create staff access, assign calendars, and confirm the appointment deposit in the required order.</p>
          </div>
        </section>

        <section className={styles.stats} aria-label="Application summary">
          <article className={styles.stat}><span>Visible applications</span><strong>{stats.total}</strong></article>
          <article className={styles.stat}><span>New</span><strong>{stats.newCount}</strong></article>
          <article className={styles.stat}><span>In progress</span><strong>{stats.inProgress}</strong></article>
          <article className={styles.stat}><span>Completed</span><strong>{stats.complete}</strong></article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Partner applications</h2>
            <span className={styles.subtle}>Every application and county remains auditable from submission to final deposit setup.</span>
            <div className={styles.filters}>
              <input
                className={`${styles.input} ${styles.search}`}
                placeholder="Search name, email, company, county, or location ID"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map(([value, text]) => <option value={value} key={value}>{text}</option>)}
              </select>
            </div>
          </div>

          {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
          {loading ? <div className={styles.loading}>Loading partner applications…</div> : null}
          {!loading && !error && !applications.length ? <div className={styles.empty}>No applications match this view yet.</div> : null}
          {!loading && applications.length ? (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead><tr><th>Applicant</th><th>Status</th><th>Requested coverage</th><th>Company</th><th>Submitted</th><th /></tr></thead>
                <tbody>
                  {applications.map((application) => (
                    <tr key={application.id}>
                      <td>
                        <div className={styles.applicant}>
                          <div className={styles.avatar}>{application.firstName.slice(0, 1)}{application.lastName.slice(0, 1)}</div>
                          <div><strong>{application.fullName}</strong><span>{application.email}</span></div>
                        </div>
                      </td>
                      <td><span className={`${styles.badge} ${tone(application.status)}`}>{label(application.status)}</span></td>
                      <td>{application.locations.length} {application.locations.length === 1 ? "county" : "counties"}</td>
                      <td>{application.company || "—"}</td>
                      <td>{date(application.submittedAt)}</td>
                      <td>
                        <div className={styles.rowActions}>
                          <Link className={styles.textButton} href={`/applications/${application.id}`}>Open profile →</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </div>

      {settingsOpen ? (
        <div
          className={styles.modalBackdrop}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeSettings();
          }}
        >
          <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="notification-settings-title">
            <header className={styles.modalHeader}>
              <div>
                <span className={styles.eyebrow}>Secure workflow configuration</span>
                <h2 id="notification-settings-title">Partner notification settings</h2>
                <p>Saved webhook URLs remain server-side and are never returned to this browser after saving.</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeSettings} aria-label="Close notification settings">×</button>
            </header>

            <div className={styles.modalBody}>
              {settingsLoading ? <div className={styles.loading}>Loading secure configuration…</div> : null}
              {!settingsLoading && !settings.length && !settingsError ? (
                <div className={styles.empty}>No partner form configuration is available yet.</div>
              ) : null}

              {!settingsLoading && settings.length ? (
                <div className={styles.settingsForm}>
                  <label className={styles.formField}>
                    <span>Tenant</span>
                    <select
                      className={styles.select}
                      value={selectedTenantId}
                      onChange={(event) => setSelectedTenantId(event.target.value)}
                    >
                      {settings.map((item) => (
                        <option key={item.tenantId} value={item.tenantId}>{item.tenantName} · {item.formKey}</option>
                      ))}
                    </select>
                  </label>

                  <div className={styles.settingsSummary}>
                    <div><span>Applicant receipt workflow</span><strong className={selectedSettings?.applicantReceivedWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.applicantReceivedWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                    <div><span>Administrator alert workflow</span><strong className={selectedSettings?.adminNotificationWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.adminNotificationWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                  </div>

                  <label className={styles.formField}>
                    <span>Admin dashboard base URL</span>
                    <input
                      className={styles.input}
                      type="url"
                      value={adminBaseUrl}
                      onChange={(event) => setAdminBaseUrl(event.target.value)}
                      placeholder="https://admin.mydripnurse.com"
                    />
                    <small>Used to create the direct application profile link in administrator alerts.</small>
                  </label>

                  <div className={styles.modalGrid}>
                    <article className={styles.settingCard}>
                      <div className={styles.settingCardHeader}>
                        <div><span className={styles.eyebrow}>Workflow 1</span><h3>Application received</h3></div>
                        <span className={`${styles.badge} ${selectedSettings?.applicantReceivedWebhookConfigured ? styles.good : styles.warn}`}>
                          {selectedSettings?.applicantReceivedWebhookConfigured ? "Stored" : "Required"}
                        </span>
                      </div>
                      <p>Runs immediately after the application is accepted so GHL can tell the applicant that onboarding is being prepared.</p>
                      <label className={styles.formField}>
                        <span>Replace webhook URL</span>
                        <input
                          className={`${styles.input} ${styles.sensitiveInput}`}
                          type="password"
                          autoComplete="new-password"
                          value={applicantWebhookUrl}
                          onChange={(event) => setApplicantWebhookUrl(event.target.value)}
                          placeholder={selectedSettings?.applicantReceivedWebhookConfigured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                        />
                      </label>
                      <label className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={clearApplicantWebhook}
                          disabled={!selectedSettings?.applicantReceivedWebhookConfigured}
                          onChange={(event) => setClearApplicantWebhook(event.target.checked)}
                        />
                        Remove the stored webhook
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!selectedSettings?.applicantReceivedWebhookConfigured || Boolean(testingTarget) || settingsSaving}
                        onClick={() => void testWebhook("applicant_received")}
                      >
                        {testingTarget === "applicant_received" ? "Sending test…" : "Send safe test"}
                      </button>
                    </article>

                    <article className={styles.settingCard}>
                      <div className={styles.settingCardHeader}>
                        <div><span className={styles.eyebrow}>Workflow 2</span><h3>Administrator alert</h3></div>
                        <span className={`${styles.badge} ${selectedSettings?.adminNotificationWebhookConfigured ? styles.good : styles.warn}`}>
                          {selectedSettings?.adminNotificationWebhookConfigured ? "Stored" : "Required"}
                        </span>
                      </div>
                      <p>Sends the complete applicant summary, requested counties, and a direct link to the administrative profile.</p>
                      <label className={styles.formField}>
                        <span>Replace webhook URL</span>
                        <input
                          className={`${styles.input} ${styles.sensitiveInput}`}
                          type="password"
                          autoComplete="new-password"
                          value={adminWebhookUrl}
                          onChange={(event) => setAdminWebhookUrl(event.target.value)}
                          placeholder={selectedSettings?.adminNotificationWebhookConfigured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                        />
                      </label>
                      <label className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={clearAdminWebhook}
                          disabled={!selectedSettings?.adminNotificationWebhookConfigured}
                          onChange={(event) => setClearAdminWebhook(event.target.checked)}
                        />
                        Remove the stored webhook
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!selectedSettings?.adminNotificationWebhookConfigured || Boolean(testingTarget) || settingsSaving}
                        onClick={() => void testWebhook("admin_notification")}
                      >
                        {testingTarget === "admin_notification" ? "Sending test…" : "Send safe test"}
                      </button>
                    </article>
                  </div>

                  <div className={styles.helpText}>
                    The existing account-ready webhook remains unchanged and is still sent only after the staff account is created successfully. Unsaved URLs cannot be tested; save first, then use the safe test action.
                  </div>
                </div>
              ) : null}

              {settingsError ? <div className={`${styles.inlineStatus} ${styles.error}`}>{settingsError}</div> : null}
              {settingsNotice ? <div className={`${styles.inlineStatus} ${styles.successNotice}`}>{settingsNotice}</div> : null}
            </div>

            <footer className={styles.modalFooter}>
              <button type="button" className={styles.secondaryButton} onClick={closeSettings} disabled={settingsSaving || Boolean(testingTarget)}>Cancel</button>
              <button
                type="button"
                className={styles.button}
                onClick={() => void saveSettings()}
                disabled={!selectedSettings || settingsSaving || Boolean(testingTarget)}
              >
                {settingsSaving ? "Saving securely…" : "Save settings"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
