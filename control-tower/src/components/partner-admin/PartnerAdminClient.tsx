"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StaffAdminApplication } from "@/lib/staffAdmin";
import type {
  PartnerAdminNotificationSettings,
  PartnerAdminWebhookTarget,
} from "@/lib/partnerAdminSettings";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
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
  ["deactivated", "Deactivated"],
];

function tone(status: string) {
  if (["completed", "staff_ready", "ready_to_complete", "complete"].includes(status)) return styles.good;
  if (["failed", "rejected", "deactivated"].includes(status)) return styles.bad;
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

export function PartnerAdminClient({ initialSettingsOpen = false }: { initialSettingsOpen?: boolean }) {
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
  const [partnerWebhookUrl, setPartnerWebhookUrl] = useState("");
  const [leadCaptureWebhookUrl, setLeadCaptureWebhookUrl] = useState("");
  const [appointmentCreatedWebhookUrl, setAppointmentCreatedWebhookUrl] = useState("");
  const [newBookingWebhookUrl, setNewBookingWebhookUrl] = useState("");
  const [partnerConfirmationRequiredWebhookUrl, setPartnerConfirmationRequiredWebhookUrl] = useState("");
  const [partnerRescheduledWebhookUrl, setPartnerRescheduledWebhookUrl] = useState("");
  const [appointmentAcceptedWebhookUrl, setAppointmentAcceptedWebhookUrl] = useState("");
  const [appointmentDeclinedWebhookUrl, setAppointmentDeclinedWebhookUrl] = useState("");
  const [appointmentReassignedWebhookUrl, setAppointmentReassignedWebhookUrl] = useState("");
  const [appointmentCompletedWebhookUrl, setAppointmentCompletedWebhookUrl] = useState("");
  const [appointmentRefundedWebhookUrl, setAppointmentRefundedWebhookUrl] = useState("");
  const [adminBaseUrl, setAdminBaseUrl] = useState("https://admin.mydripnurse.com");
  const [affiliateCommissionRate, setAffiliateCommissionRate] = useState("2");
  const [clearApplicantWebhook, setClearApplicantWebhook] = useState(false);
  const [clearAdminWebhook, setClearAdminWebhook] = useState(false);
  const [clearPartnerWebhook, setClearPartnerWebhook] = useState(false);
  const [clearLeadCaptureWebhook, setClearLeadCaptureWebhook] = useState(false);
  const [clearAppointmentCreatedWebhook, setClearAppointmentCreatedWebhook] = useState(false);
  const [clearNewBookingWebhook, setClearNewBookingWebhook] = useState(false);
  const [clearPartnerConfirmationRequiredWebhook, setClearPartnerConfirmationRequiredWebhook] = useState(false);
  const [clearPartnerRescheduledWebhook, setClearPartnerRescheduledWebhook] = useState(false);
  const [clearAppointmentAcceptedWebhook, setClearAppointmentAcceptedWebhook] = useState(false);
  const [clearAppointmentDeclinedWebhook, setClearAppointmentDeclinedWebhook] = useState(false);
  const [clearAppointmentReassignedWebhook, setClearAppointmentReassignedWebhook] = useState(false);
  const [clearAppointmentCompletedWebhook, setClearAppointmentCompletedWebhook] = useState(false);
  const [clearAppointmentRefundedWebhook, setClearAppointmentRefundedWebhook] = useState(false);
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

  useEffect(() => {
    if (initialSettingsOpen) openSettings();
  }, [initialSettingsOpen, openSettings]);

  const closeSettings = useCallback(() => {
    if (settingsSaving || testingTarget) return;
    setSettingsOpen(false);
    if (window.location.pathname === "/partner-admin/automations") {
      window.location.assign("/partner-admin");
      return;
    }
    if (window.location.pathname === "/automations") window.location.assign("/");
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
    setAffiliateCommissionRate(String(selectedSettings.affiliateCommissionRate ?? 2));
    setApplicantWebhookUrl(selectedSettings.applicantReceivedWebhookUrl || "");
    setAdminWebhookUrl(selectedSettings.adminNotificationWebhookUrl || "");
    setPartnerWebhookUrl(selectedSettings.partnerNotificationWebhookUrl || "");
    setLeadCaptureWebhookUrl(selectedSettings.leadCaptureWebhookUrl || "");
    setAppointmentCreatedWebhookUrl(selectedSettings.appointmentCreatedWebhookUrl || "");
    setNewBookingWebhookUrl(selectedSettings.newBookingWebhookUrl || "");
    setPartnerConfirmationRequiredWebhookUrl(selectedSettings.partnerConfirmationRequiredWebhookUrl || "");
    setPartnerRescheduledWebhookUrl(selectedSettings.partnerRescheduledWebhookUrl || "");
    setAppointmentAcceptedWebhookUrl(selectedSettings.appointmentAcceptedWebhookUrl || "");
    setAppointmentDeclinedWebhookUrl(selectedSettings.appointmentDeclinedWebhookUrl || "");
    setAppointmentReassignedWebhookUrl(selectedSettings.appointmentReassignedWebhookUrl || "");
    setAppointmentCompletedWebhookUrl(selectedSettings.appointmentCompletedWebhookUrl || "");
    setAppointmentRefundedWebhookUrl(selectedSettings.appointmentRefundedWebhookUrl || "");
    setClearApplicantWebhook(false);
    setClearAdminWebhook(false);
    setClearPartnerWebhook(false);
    setClearLeadCaptureWebhook(false);
    setClearAppointmentCreatedWebhook(false);
    setClearNewBookingWebhook(false);
    setClearPartnerConfirmationRequiredWebhook(false);
    setClearPartnerRescheduledWebhook(false);
    setClearAppointmentAcceptedWebhook(false);
    setClearAppointmentDeclinedWebhook(false);
    setClearAppointmentReassignedWebhook(false);
    setClearAppointmentCompletedWebhook(false);
    setClearAppointmentRefundedWebhook(false);
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
          partnerNotificationWebhookUrl: partnerWebhookUrl,
          leadCaptureWebhookUrl,
          appointmentCreatedWebhookUrl,
          newBookingWebhookUrl,
          partnerConfirmationRequiredWebhookUrl,
          partnerRescheduledWebhookUrl,
          appointmentAcceptedWebhookUrl,
          appointmentDeclinedWebhookUrl,
          appointmentReassignedWebhookUrl,
          appointmentCompletedWebhookUrl,
          appointmentRefundedWebhookUrl,
          adminBaseUrl,
          affiliateCommissionRate: Number(affiliateCommissionRate),
          clearApplicantWebhook,
          clearAdminWebhook,
          clearPartnerWebhook,
          clearLeadCaptureWebhook,
          clearAppointmentCreatedWebhook,
          clearNewBookingWebhook,
          clearPartnerConfirmationRequiredWebhook,
          clearPartnerRescheduledWebhook,
          clearAppointmentAcceptedWebhook,
          clearAppointmentDeclinedWebhook,
          clearAppointmentReassignedWebhook,
          clearAppointmentCompletedWebhook,
          clearAppointmentRefundedWebhook,
        }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save notification settings.");
      const saved = payload.settings as PartnerAdminNotificationSettings;
      setSettings((current) => current.map((item) => item.tenantId === saved.tenantId ? saved : item));
      setApplicantWebhookUrl("");
      setAdminWebhookUrl("");
      setPartnerWebhookUrl("");
      setLeadCaptureWebhookUrl("");
      setAppointmentCreatedWebhookUrl("");
      setNewBookingWebhookUrl("");
      setPartnerConfirmationRequiredWebhookUrl("");
      setPartnerRescheduledWebhookUrl("");
      setAppointmentAcceptedWebhookUrl("");
      setAppointmentDeclinedWebhookUrl("");
      setAppointmentReassignedWebhookUrl("");
      setAppointmentCompletedWebhookUrl("");
      setAppointmentRefundedWebhookUrl("");
      setClearApplicantWebhook(false);
      setClearAdminWebhook(false);
      setClearPartnerWebhook(false);
      setClearLeadCaptureWebhook(false);
      setClearAppointmentCreatedWebhook(false);
      setClearNewBookingWebhook(false);
      setClearPartnerConfirmationRequiredWebhook(false);
      setClearPartnerRescheduledWebhook(false);
      setClearAppointmentAcceptedWebhook(false);
      setClearAppointmentDeclinedWebhook(false);
      setClearAppointmentReassignedWebhook(false);
      setClearAppointmentCompletedWebhook(false);
      setClearAppointmentRefundedWebhook(false);
      setSettingsNotice("Notification settings saved securely.");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not save notification settings.");
    } finally {
      setSettingsSaving(false);
    }
  }, [
    adminBaseUrl,
    adminWebhookUrl,
    partnerWebhookUrl,
    leadCaptureWebhookUrl,
    applicantWebhookUrl,
    clearAdminWebhook,
    clearPartnerWebhook,
    clearApplicantWebhook,
    clearLeadCaptureWebhook,
    clearAppointmentCreatedWebhook,
    clearNewBookingWebhook,
    clearPartnerConfirmationRequiredWebhook,
    clearPartnerRescheduledWebhook,
    clearAppointmentAcceptedWebhook,
    clearAppointmentDeclinedWebhook,
    clearAppointmentReassignedWebhook,
    clearAppointmentCompletedWebhook,
    clearAppointmentRefundedWebhook,
    selectedTenantId,
    affiliateCommissionRate,
    appointmentCreatedWebhookUrl,
    newBookingWebhookUrl,
    partnerConfirmationRequiredWebhookUrl,
    partnerRescheduledWebhookUrl,
    appointmentAcceptedWebhookUrl,
    appointmentDeclinedWebhookUrl,
    appointmentReassignedWebhookUrl,
    appointmentCompletedWebhookUrl,
    appointmentRefundedWebhookUrl,
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
      const targetLabel = {
        applicant_received: "Applicant",
        admin_notification: "Administrator",
        partner_notification: "Partner appointment",
        appointment_created: "Appointment-created",
        lead_capture: "Lead capture",
        new_booking: "New booking",
        partner_confirmation_required: "Partner confirmation required",
        partner_rescheduled: "Partner rescheduled",
        appointment_accepted: "Appointment accepted",
        appointment_declined: "Appointment declined",
        appointment_reassigned: "Appointment reassigned",
        appointment_completed: "Appointment completed",
        appointment_refunded: "Appointment refunded",
      }[target];
      setSettingsNotice(`${targetLabel} webhook test delivered successfully (HTTP ${payload.result.status}).`);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "The webhook test failed.");
    } finally {
      setTestingTarget("");
    }
  }, [selectedTenantId]);

  const stats = useMemo(() => ({
    total: applications.length,
    newCount: applications.filter((item) => item.status === "submitted").length,
    inProgress: applications.filter((item) => !["submitted", "completed", "rejected", "deactivated"].includes(item.status)).length,
    complete: applications.filter((item) => item.status === "completed").length,
  }), [applications]);

  const lifecycleWebhookFields: Array<{
    target: PartnerAdminWebhookTarget;
    label: string;
    value: string;
    setValue: (value: string) => void;
    clear: boolean;
    setClear: (value: boolean) => void;
    configured: boolean;
  }> = [
    { target: "new_booking", label: "New booking", value: newBookingWebhookUrl, setValue: setNewBookingWebhookUrl, clear: clearNewBookingWebhook, setClear: setClearNewBookingWebhook, configured: Boolean(selectedSettings?.newBookingWebhookConfigured) },
    { target: "partner_confirmation_required", label: "Partner confirmation required", value: partnerConfirmationRequiredWebhookUrl, setValue: setPartnerConfirmationRequiredWebhookUrl, clear: clearPartnerConfirmationRequiredWebhook, setClear: setClearPartnerConfirmationRequiredWebhook, configured: Boolean(selectedSettings?.partnerConfirmationRequiredWebhookConfigured) },
    { target: "partner_rescheduled", label: "Partner rescheduled", value: partnerRescheduledWebhookUrl, setValue: setPartnerRescheduledWebhookUrl, clear: clearPartnerRescheduledWebhook, setClear: setClearPartnerRescheduledWebhook, configured: Boolean(selectedSettings?.partnerRescheduledWebhookConfigured) },
    { target: "appointment_accepted", label: "Appointment accepted", value: appointmentAcceptedWebhookUrl, setValue: setAppointmentAcceptedWebhookUrl, clear: clearAppointmentAcceptedWebhook, setClear: setClearAppointmentAcceptedWebhook, configured: Boolean(selectedSettings?.appointmentAcceptedWebhookConfigured) },
    { target: "appointment_declined", label: "Appointment declined", value: appointmentDeclinedWebhookUrl, setValue: setAppointmentDeclinedWebhookUrl, clear: clearAppointmentDeclinedWebhook, setClear: setClearAppointmentDeclinedWebhook, configured: Boolean(selectedSettings?.appointmentDeclinedWebhookConfigured) },
    { target: "appointment_reassigned", label: "Appointment reassigned", value: appointmentReassignedWebhookUrl, setValue: setAppointmentReassignedWebhookUrl, clear: clearAppointmentReassignedWebhook, setClear: setClearAppointmentReassignedWebhook, configured: Boolean(selectedSettings?.appointmentReassignedWebhookConfigured) },
    { target: "appointment_completed", label: "Appointment completed", value: appointmentCompletedWebhookUrl, setValue: setAppointmentCompletedWebhookUrl, clear: clearAppointmentCompletedWebhook, setClear: setClearAppointmentCompletedWebhook, configured: Boolean(selectedSettings?.appointmentCompletedWebhookConfigured) },
    { target: "appointment_refunded", label: "Appointment refunded", value: appointmentRefundedWebhookUrl, setValue: setAppointmentRefundedWebhookUrl, clear: clearAppointmentRefundedWebhook, setClear: setClearAppointmentRefundedWebhook, configured: Boolean(selectedSettings?.appointmentRefundedWebhookConfigured) },
  ];

  return (
    <PartnerAdminShell
      title="Applications overview"
      actions={
        <button type="button" className={styles.secondaryButton} onClick={load} disabled={loading}>Refresh queue</button>
      }
    >
      <div className={styles.frame}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>My Drip Nurse · Partner Network</span>
            <h1>Partner onboarding,<br /><em>beautifully organized.</em></h1>
            <p>Review new partners, activate their locations and finish every operational step from one clean workspace.</p>
          </div>
          <div className={styles.heroPill}><span />Private internal workspace</div>
        </section>

        <section className={styles.stats} aria-label="Application summary">
          <article className={styles.stat}><span>All applications</span><strong>{stats.total}</strong><small>Current queue</small></article>
          <article className={styles.stat}><span>Needs review</span><strong>{stats.newCount}</strong><small>New submissions</small></article>
          <article className={styles.stat}><span>In progress</span><strong>{stats.inProgress}</strong><small>Activation underway</small></article>
          <article className={styles.stat}><span>Completed</span><strong>{stats.complete}</strong><small>Partners activated</small></article>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Partner applications</h2>
            <span className={styles.subtle}>Select an applicant to continue their activation workflow.</span>
            <div className={styles.filters}>
              <input
                className={`${styles.input} ${styles.search}`}
                aria-label="Search partner applications"
                placeholder="Search name, email, business or county"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <select aria-label="Filter applications by status" className={styles.select} value={status} onChange={(event) => setStatus(event.target.value)}>
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
                          <Link className={styles.textButton} href={`/applications/${application.id}`}>Review application →</Link>
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
                <span className={styles.eyebrow}>My Drip Nurse automations</span>
                <h2 id="notification-settings-title">Partner communication</h2>
                <p>Connect the GHL workflows used to acknowledge new applicants and alert the internal team.</p>
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
                  <div className={styles.workspaceCard}>
                    <div className={styles.logo} aria-hidden="true">MDN</div>
                    <div>
                      <span>Workspace</span>
                      <strong>{selectedSettings?.tenantName || "My Drip Nurse"}</strong>
                      <small>Dedicated Partner Admin environment</small>
                    </div>
                  </div>

                  <div className={styles.settingsSummary}>
                    <div><span>Applicant receipt workflow</span><strong className={selectedSettings?.applicantReceivedWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.applicantReceivedWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                    <div><span>Administrator alert workflow</span><strong className={selectedSettings?.adminNotificationWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.adminNotificationWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                    <div><span>Partner appointment workflow</span><strong className={selectedSettings?.partnerNotificationWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.partnerNotificationWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                    <div><span>Single lead capture webhook</span><strong className={selectedSettings?.leadCaptureWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.leadCaptureWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                    <div><span>Appointment-created webhook</span><strong className={selectedSettings?.appointmentCreatedWebhookConfigured ? styles.configured : styles.notConfigured}>{selectedSettings?.appointmentCreatedWebhookConfigured ? "Configured" : "Not configured"}</strong></div>
                  </div>

                  <article className={styles.settingCard}>
                    <div className={styles.settingCardHeader}>
                      <div><span className={styles.eyebrow}>Automation directory</span><h3>Saved webhooks</h3></div>
                      <span className={`${styles.badge} ${styles.good}`}>
                        {selectedSettings?.webhooks.filter((webhook) => webhook.configured).length || 0} stored
                      </span>
                    </div>
                    <p>Every outbound workflow is listed here. Secret URL tokens stay hidden; use the cards below only when you need to replace or remove an endpoint.</p>
                    <div className={styles.webhookDirectory}>
                      {selectedSettings?.webhooks.map((webhook) => (
                        <div className={styles.webhookRow} key={webhook.target}>
                          <div>
                            <strong>{webhook.label}</strong>
                            <small>{webhook.configured ? webhook.endpoint : "No endpoint saved"}</small>
                          </div>
                          <span className={webhook.configured ? styles.configured : styles.notConfigured}>
                            {webhook.configured ? "Stored" : "Not configured"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </article>

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

                  <article className={styles.settingCard}>
                    <div className={styles.settingCardHeader}>
                      <div><span className={styles.eyebrow}>Affiliate program</span><h3>Default commission rate</h3></div>
                      <span className={`${styles.badge} ${styles.good}`}>{selectedSettings?.affiliateCommissionRate ?? 2}% default</span>
                    </div>
                    <p>This percentage is earned by the referring Partner for every confirmed appointment generated by a referred Partner. A profile-level override can be set from each application.</p>
                    <label className={styles.formField}>
                      <span>Global commission percentage</span>
                      <input className={styles.input} type="number" min="0" max="100" step="0.01" value={affiliateCommissionRate} onChange={(event) => setAffiliateCommissionRate(event.target.value)} />
                      <small>Use 2% to keep the initial affiliate program rate requested for launch.</small>
                    </label>
                  </article>

                  <div className={styles.modalGrid}>
                    <article className={styles.settingCard}>
                      <div className={styles.settingCardHeader}>
                        <div><span className={styles.eyebrow}>Booking lead</span><h3>Single lead capture</h3></div>
                        <span className={`${styles.badge} ${selectedSettings?.leadCaptureWebhookConfigured ? styles.good : styles.warn}`}>
                          {selectedSettings?.leadCaptureWebhookConfigured ? "Stored" : "Required"}
                        </span>
                      </div>
                      <p>Receives one complete lead for every booking flow after screening, patient details and location are verified—even when no Partner or time is available. Duplicate requests are blocked by an idempotency key.</p>
                      <label className={styles.formField}>
                        <span>Lead capture webhook URL</span>
                        <input
                          className={`${styles.input} ${styles.sensitiveInput}`}
                          type="password"
                          autoComplete="new-password"
                          value={leadCaptureWebhookUrl}
                          onChange={(event) => setLeadCaptureWebhookUrl(event.target.value)}
                          placeholder={selectedSettings?.leadCaptureWebhookConfigured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                        />
                      </label>
                      <label className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={clearLeadCaptureWebhook}
                          disabled={!selectedSettings?.leadCaptureWebhookConfigured}
                          onChange={(event) => setClearLeadCaptureWebhook(event.target.checked)}
                        />
                        Remove the stored webhook
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!selectedSettings?.leadCaptureWebhookConfigured || Boolean(testingTarget) || settingsSaving}
                        onClick={() => void testWebhook("lead_capture")}
                      >
                        {testingTarget === "lead_capture" ? "Sending test…" : "Send safe test"}
                      </button>
                    </article>
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

                    <article className={styles.settingCard}>
                      <div className={styles.settingCardHeader}>
                        <div><span className={styles.eyebrow}>Workflow 3</span><h3>Appointment lifecycle + refunds</h3></div>
                        <span className={`${styles.badge} ${selectedSettings?.partnerNotificationWebhookConfigured ? styles.good : styles.warn}`}>
                          {selectedSettings?.partnerNotificationWebhookConfigured ? "Stored" : "Optional"}
                        </span>
                      </div>
                      <p>One webhook for new bookings, acceptance, reassignment, decline, completion, and customer deposit refunds. Your GHL workflow can route email and SMS notifications.</p>
                      <label className={styles.formField}>
                        <span>Replace webhook URL</span>
                        <input
                          className={`${styles.input} ${styles.sensitiveInput}`}
                          type="password"
                          autoComplete="new-password"
                          value={partnerWebhookUrl}
                          onChange={(event) => setPartnerWebhookUrl(event.target.value)}
                          placeholder={selectedSettings?.partnerNotificationWebhookConfigured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                        />
                      </label>
                      <label className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={clearPartnerWebhook}
                          disabled={!selectedSettings?.partnerNotificationWebhookConfigured}
                          onChange={(event) => setClearPartnerWebhook(event.target.checked)}
                        />
                        Remove the stored webhook
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!selectedSettings?.partnerNotificationWebhookConfigured || Boolean(testingTarget) || settingsSaving}
                        onClick={() => void testWebhook("partner_notification")}
                      >
                        {testingTarget === "partner_notification" ? "Sending test…" : "Send safe test"}
                      </button>
                    </article>

                    <article className={styles.settingCard}>
                      <div className={styles.settingCardHeader}>
                        <div><span className={styles.eyebrow}>Booking event</span><h3>Appointment created for GHL</h3></div>
                        <span className={`${styles.badge} ${selectedSettings?.appointmentCreatedWebhookConfigured ? styles.good : styles.warn}`}>
                          {selectedSettings?.appointmentCreatedWebhookConfigured ? "Stored" : "Optional"}
                        </span>
                      </div>
                      <p>Receives one complete appointment payload immediately after a booking is reserved. It includes the appointment reference and status, local time and timezone, service price and amount due at visit, address, source, patient and additional-patient details, screening answers, selected coverage and assigned provider. Stripe secrets are never sent.</p>
                      <label className={styles.formField}>
                        <span>Appointment-created webhook URL</span>
                        <input
                          className={`${styles.input} ${styles.sensitiveInput}`}
                          type="password"
                          autoComplete="new-password"
                          value={appointmentCreatedWebhookUrl}
                          onChange={(event) => setAppointmentCreatedWebhookUrl(event.target.value)}
                          placeholder={selectedSettings?.appointmentCreatedWebhookConfigured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                        />
                      </label>
                      <label className={styles.checkboxRow}>
                        <input
                          type="checkbox"
                          checked={clearAppointmentCreatedWebhook}
                          disabled={!selectedSettings?.appointmentCreatedWebhookConfigured}
                          onChange={(event) => setClearAppointmentCreatedWebhook(event.target.checked)}
                        />
                        Remove the stored webhook
                      </label>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        disabled={!selectedSettings?.appointmentCreatedWebhookConfigured || Boolean(testingTarget) || settingsSaving}
                        onClick={() => void testWebhook("appointment_created")}
                      >
                        {testingTarget === "appointment_created" ? "Sending test…" : "Send safe test"}
                      </button>
                    </article>

                    {lifecycleWebhookFields.map((field) => (
                      <article key={field.target} className={styles.settingCard}>
                        <div className={styles.settingCardHeader}>
                          <div><span className={styles.eyebrow}>Appointment lifecycle</span><h3>{field.label}</h3></div>
                          <span className={`${styles.badge} ${field.configured ? styles.good : styles.warn}`}>
                            {field.configured ? "Stored" : "Optional"}
                          </span>
                        </div>
                        <p>Sent once for this lifecycle event with the appointment, patient and additional-patient details, BMI, screening, payment, address, timezone, partner assignment, source and an idempotency key for GHL routing.</p>
                        <label className={styles.formField}>
                          <span>Webhook URL</span>
                          <input
                            className={`${styles.input} ${styles.sensitiveInput}`}
                            type="password"
                            autoComplete="new-password"
                            value={field.value}
                            onChange={(event) => field.setValue(event.target.value)}
                            placeholder={field.configured ? "Paste only to replace the saved URL" : "https://services.leadconnectorhq.com/hooks/..."}
                          />
                        </label>
                        <label className={styles.checkboxRow}>
                          <input
                            type="checkbox"
                            checked={field.clear}
                            disabled={!field.configured}
                            onChange={(event) => field.setClear(event.target.checked)}
                          />
                          Remove the stored webhook
                        </label>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={!field.configured || Boolean(testingTarget) || settingsSaving}
                          onClick={() => void testWebhook(field.target)}
                        >
                          {testingTarget === field.target ? "Sending test…" : "Send safe test"}
                        </button>
                      </article>
                    ))}
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
    </PartnerAdminShell>
  );
}
