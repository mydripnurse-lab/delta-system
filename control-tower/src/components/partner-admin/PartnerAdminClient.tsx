"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { StaffAdminApplication } from "@/lib/staffAdmin";
import type {
  PartnerAdminCommunicationRouter,
  PartnerAdminNotificationSettings,
  PartnerAdminWebhookTarget,
} from "@/lib/partnerAdminSettings";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import { PartnerAdminCommunicationsModal } from "@/components/partner-admin/PartnerAdminCommunicationsModal";
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
  ["completed_with_warnings", "Completed — webhook warning"],
  ["failed", "Needs attention"],
  ["rejected", "Rejected"],
  ["deactivated", "Deactivated"],
];

function tone(status: string) {
  if (["completed", "staff_ready", "ready_to_complete", "complete"].includes(status)) return styles.good;
  if (status === "completed_with_warnings") return styles.warn;
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
  const [editingRouter, setEditingRouter] = useState<PartnerAdminCommunicationRouter | "">("");
  const [routerDraft, setRouterDraft] = useState("");
  const [selectedTestTargets, setSelectedTestTargets] = useState<Record<PartnerAdminCommunicationRouter, PartnerAdminWebhookTarget>>({
    application_received: "applicant_received",
    account_ready: "account_ready",
    booking_appointments: "lead_capture",
    care_rewards: "client_referral",
  });
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
    setEditingRouter("");
    setRouterDraft("");
    setSettingsNotice("");
    setSettingsError("");
  }, [selectedSettings]);

  const saveCommunication = useCallback(async (router: PartnerAdminCommunicationRouter, clear = false) => {
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
          router,
          webhookUrl: routerDraft,
          clear,
        }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save notification settings.");
      const saved = payload.settings as PartnerAdminNotificationSettings;
      setSettings((current) => current.map((item) => item.tenantId === saved.tenantId ? saved : item));
      setEditingRouter("");
      setRouterDraft("");
      setSettingsNotice(clear
        ? "Communication disabled. No future events will be sent through this router."
        : "Communication active. Safe tests and live events now use this GHL endpoint.");
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Could not save notification settings.");
    } finally {
      setSettingsSaving(false);
    }
  }, [routerDraft, selectedTenantId]);

  const editCommunication = useCallback((router: PartnerAdminCommunicationRouter, webhookUrl: string) => {
    setEditingRouter(router);
    setRouterDraft(webhookUrl);
    setSettingsError("");
    setSettingsNotice("");
  }, []);

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
        account_ready: "Account-ready welcome",
        applicant_received: "Applicant",
        admin_notification: "Administrator",
        partner_notification: "Partner appointment",
        additional_patient_invitation: "Additional patient invitation",
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
        client_referral: "Client referral invitations",
      }[target];
      if (target === "account_ready" && payload.result.testReceiver === true) {
        setSettingsError(
          "GHL received the sample in test/mapping mode, but this URL will not run the welcome workflow. Publish or activate the GHL workflow, copy its live webhook URL, replace Account-ready welcome, save, and test again.",
        );
      } else {
        setSettingsNotice(`${targetLabel} webhook test delivered successfully (HTTP ${payload.result.status}).`);
      }
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "The webhook test failed.");
    } finally {
      setTestingTarget("");
    }
  }, [selectedTenantId]);

  const stats = useMemo(() => ({
    total: applications.length,
    newCount: applications.filter((item) => item.status === "submitted").length,
    inProgress: applications.filter((item) => !["submitted", "completed", "completed_with_warnings", "rejected", "deactivated"].includes(item.status)).length,
    complete: applications.filter((item) => ["completed", "completed_with_warnings"].includes(item.status)).length,
  }), [applications]);

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
                <thead><tr><th>Applicant</th><th>Status</th><th>Requested coverage</th><th>Company</th><th>Website</th><th>Submitted</th><th /></tr></thead>
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
                      <td>{application.partnerWebsite ? (
                        <div className={`${styles.applicationWebsiteState} ${application.partnerWebsite.status === "published" ? styles.applicationWebsiteActive : styles.applicationWebsiteInactive}`}>
                          <i aria-hidden="true" />
                          <span><strong>{application.partnerWebsite.status === "published" ? "Website active" : "Website not active"}</strong><small>{application.partnerWebsite.status === "published" ? "Public and available to patients" : "Manage publishing inside the profile"}</small></span>
                        </div>
                      ) : <div className={`${styles.applicationWebsiteState} ${styles.applicationWebsitePending}`}><i aria-hidden="true" /><span><strong>Not created yet</strong><small>Created after approval</small></span></div>}</td>
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
        <PartnerAdminCommunicationsModal
          settings={settings}
          selectedSettings={selectedSettings}
          selectedTenantId={selectedTenantId}
          settingsLoading={settingsLoading}
          settingsSaving={settingsSaving}
          settingsError={settingsError}
          settingsNotice={settingsNotice}
          testingTarget={testingTarget}
          editingRouter={editingRouter}
          routerDraft={routerDraft}
          selectedTestTargets={selectedTestTargets}
          onTenantChange={setSelectedTenantId}
          onRouterDraftChange={setRouterDraft}
          onEdit={editCommunication}
          onCancelEdit={() => {
            setEditingRouter("");
            setRouterDraft("");
          }}
          onSave={(router, clear) => void saveCommunication(router, clear)}
          onTestTargetChange={(router, target) => setSelectedTestTargets((current) => ({ ...current, [router]: target }))}
          onTest={(target) => void testWebhook(target)}
          onClose={closeSettings}
        />
      ) : null}

    </PartnerAdminShell>
  );
}
