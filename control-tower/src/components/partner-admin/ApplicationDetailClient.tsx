"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { StaffAdminApplication } from "@/lib/staffAdmin";
import { ApplicationAvailabilityPanel } from "@/components/partner-admin/ApplicationAvailabilityPanel";
import { ApplicationCalendarsPanel } from "@/components/partner-admin/ApplicationCalendarsPanel";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";

import styles from "@/app/partner-admin/partnerAdmin.module.css";

type ApiResponse = {
  ok?: boolean;
  application?: StaffAdminApplication;
  error?: string;
};
type CommissionSettings = { globalRate: number; overrideRate: number | null; effectiveRate: number };

function statusTone(status: string) {
  if (["complete", "completed", "approved", "active", "published", "not_required", "ready_to_complete"].includes(status)) {
    return styles.good;
  }
  if (["failed", "rejected", "deactivated"].includes(status)) return styles.bad;
  if (["processing", "provisioning"].includes(status)) return styles.info;
  return styles.warn;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not completed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

export function ApplicationDetailClient({ applicationId }: { applicationId: string }) {
  const [application, setApplication] = useState<StaffAdminApplication | null>(null);
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [commission, setCommission] = useState<CommissionSettings | null>(null);
  const [commissionDraft, setCommissionDraft] = useState("");
  const [commissionSaving, setCommissionSaving] = useState(false);

  const loadApplication = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, {
        cache: "no-store",
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "Unable to load this application.");
      }
      setApplication(payload.application);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load this application.");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/partner-admin/applications/${applicationId}/commission`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (active && payload?.ok) {
          setCommission(payload.commission);
          setCommissionDraft(payload.commission.overrideRate === null ? "" : String(payload.commission.overrideRate));
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [applicationId]);

  useEffect(() => {
    if (!application?.locations.length) return;
    setOpenLocationId((current) =>
      application.locations.some((location) => location.locationId === current)
        ? current
        : application.locations[0].locationId,
    );
  }, [application]);

  const allStaffReady = useMemo(
    () =>
      Boolean(application?.locations.length) &&
      application!.locations.every(
        (location) => location.staffStatus === "complete" && location.calendarsStatus === "complete",
      ),
    [application],
  );

  async function updateApplication(body: Record<string, unknown>, actionName: string, message: string) {
    setBusyAction(actionName);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "The application could not be updated.");
      }
      setApplication(payload.application);
      setSuccess(message);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "The application could not be updated.");
    } finally {
      setBusyAction("");
    }
  }

  async function saveCommission() {
    setCommissionSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/commission`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: commissionDraft.trim() === "" ? null : Number(commissionDraft) }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to save commission rate.");
      setCommission(payload.commission);
      setCommissionDraft(payload.commission.overrideRate === null ? "" : String(payload.commission.overrideRate));
      setSuccess("Affiliate commission override saved for this Partner.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save commission rate.");
    } finally {
      setCommissionSaving(false);
    }
  }

  async function provisionStaff() {
    setBusyAction("provision");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/provision`, {
        method: "POST",
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "Staff provisioning failed.");
      }
      setApplication(payload.application);
      setSuccess(
        "The internal Partner profile, services, availability, and Stripe deposit policy are ready. Review the website before publishing.",
      );
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : "Staff provisioning failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function removeStaffAccess() {
    if (!application) return;
    const confirmation = window.prompt(
      `This deactivates ${application.email} from the My Drip Nurse booking platform and hides the Partner website.\n\nType the email to continue:`,
    );
    if (confirmation === null) return;
    if (confirmation.trim().toLowerCase() !== application.email.toLowerCase()) {
      setError("The email did not match. Staff access was not removed.");
      setSuccess("");
      return;
    }

    setBusyAction("deactivate");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}/staff`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "Staff access removal failed.");
      }
      setApplication(payload.application);
      setSuccess("Partner access was deactivated in the My Drip Nurse booking platform.");
    } catch (removalError) {
      setError(removalError instanceof Error ? removalError.message : "Staff access removal failed.");
    } finally {
      setBusyAction("");
    }
  }

  async function deleteApplicationRecord() {
    if (!application) return;
    const confirmationEmail = window.prompt(
      `This permanently deletes the application and its internal workflow records. It does not affect any external CRM.\n\nType ${application.email} to continue:`,
    );
    if (confirmationEmail === null) return;
    if (confirmationEmail.trim().toLowerCase() !== application.email.toLowerCase()) {
      setError("The email did not match. The application was not deleted.");
      setSuccess("");
      return;
    }
    setBusyAction("delete-application");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationEmail }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The application could not be deleted.");
      window.location.assign("/");
    } catch (deletionError) {
      setError(deletionError instanceof Error ? deletionError.message : "The application could not be deleted.");
      setBusyAction("");
    }
  }

  if (loading) {
    return (
      <PartnerAdminShell title="Application profile">
        <div className={styles.frame}>
          <div className={styles.loading}>Loading partner application…</div>
        </div>
      </PartnerAdminShell>
    );
  }

  if (!application) {
    return (
      <PartnerAdminShell title="Application profile">
        <div className={styles.frame}>
          <div className={styles.empty}>
            <p>{error || "This partner application was not found."}</p>
            <Link className={styles.secondaryButton} href="/">
              Return to applications
            </Link>
          </div>
        </div>
      </PartnerAdminShell>
    );
  }

  const fullName = `${application.firstName} ${application.lastName}`.trim();
  const isFinished = ["completed", "rejected", "deactivated"].includes(application.status);
  const completedAt = application.status === "completed" ? application.updatedAt : null;
  const finalWebhook =
    application.result.finalWebhook &&
    typeof application.result.finalWebhook === "object" &&
    !Array.isArray(application.result.finalWebhook)
      ? (application.result.finalWebhook as Record<string, unknown>)
      : application.result.webhook &&
          typeof application.result.webhook === "object" &&
          !Array.isArray(application.result.webhook)
        ? (application.result.webhook as Record<string, unknown>)
      : null;
  const finalWebhookSent = application.result.finalWebhookSent === true || finalWebhook?.status === "sent";
  const platformStripeReady = Boolean(
    application.locations.length && application.locations.every((location) => location.stripeStatus === "complete"),
  );
  const partnerWebsite = application.partnerWebsite;

  return (
    <PartnerAdminShell
      title="Application profile"
      actions={<Link className={styles.secondaryButton} href="/">← All applications</Link>}
    >
      <div className={styles.frame}>
        <section className={styles.detailHeader}>
          <div>
            <span className={`${styles.badge} ${statusTone(application.status)}`}>
              {statusLabel(application.status)}
            </span>
            <h1>{fullName}</h1>
            <p>
              Review the application, activate the internal booking profile, preview the website, and publish when ready.
            </p>
          </div>
          <div className={styles.progressRow}>
            <span className={`${styles.badge} ${application.reviewedAt ? styles.good : styles.warn}`}>
              Review {application.reviewedAt ? "complete" : "pending"}
            </span>
            <span className={`${styles.badge} ${platformStripeReady ? styles.good : styles.warn}`}>
              Platform Stripe {platformStripeReady ? "ready" : "pending"}
            </span>
            <span className={`${styles.badge} ${allStaffReady ? styles.good : styles.warn}`}>
              Staff {allStaffReady ? "ready" : "pending"}
            </span>
            <span className={`${styles.badge} ${partnerWebsite?.status === "published" ? styles.good : styles.warn}`}>
              Website {partnerWebsite?.status ? statusLabel(partnerWebsite.status) : "pending"}
            </span>
            <span className={`${styles.badge} ${finalWebhookSent ? styles.good : styles.warn}`}>
              Welcome {finalWebhookSent ? "sent" : "pending"}
            </span>
            <span className={`${styles.badge} ${allStaffReady ? styles.good : styles.warn}`}>
              Deposits {allStaffReady ? "from service setup" : "pending"}
            </span>
          </div>
        </section>

        {error ? <div className={styles.notice}>{error}</div> : null}
        {success ? <div className={styles.successNotice}>{success}</div> : null}

        <ApplicationCalendarsPanel applicationId={applicationId} />
        <ApplicationAvailabilityPanel applicationId={applicationId} />

        <div className={styles.detailGrid}>
          <div className={styles.mainColumn}>
            <section className={styles.identityCard}>
              <div className={styles.stepHeader}>
                <div>
                  <span className={styles.eyebrow}>Applicant profile</span>
                  <h2>Registration details</h2>
                </div>
                <span className={`${styles.badge} ${statusTone(application.status)}`}>
                  {statusLabel(application.status)}
                </span>
              </div>
              <div className={styles.identityGrid}>
                <div className={styles.dataItem}>
                  <span>Email</span>
                  <a href={`mailto:${application.email}`}>{application.email}</a>
                </div>
                <div className={styles.dataItem}>
                  <span>Phone</span>
                  <a href={`tel:${application.phone}`}>{application.phone}</a>
                </div>
                <div className={styles.dataItem}>
                  <span>Business</span>
                  <strong>{application.company || "Individual partner"}</strong>
                </div>
                <div className={styles.dataItem}>
                  <span>Submitted</span>
                  <strong>{formatDate(application.submittedAt)}</strong>
                </div>
                <div className={styles.dataItem}>
                  <span>Application ID</span>
                  <strong>{application.id}</strong>
                </div>
                <div className={styles.dataItem}>
                  <span>Last error</span>
                  <strong>{application.lastError || "None"}</strong>
                </div>
              </div>
            </section>

            <section className={styles.identityCard}>
              <div className={styles.stepHeader}>
                <div><span className={styles.eyebrow}>Affiliate program</span><h2>Commission for this Partner</h2></div>
                {commission ? <span className={`${styles.badge} ${styles.good}`}>{commission.effectiveRate}% effective</span> : null}
              </div>
              <p className={styles.stepCopy}>Set an optional override for the commission this Partner receives on every confirmed appointment referred by them. Leave it blank to use the global default.</p>
              <div className={styles.identityGrid}>
                <div className={styles.dataItem}><span>Global default</span><strong>{commission ? `${commission.globalRate}%` : "Loading…"}</strong></div>
                <label className={styles.dataItem}><span>Partner override (%)</span><input className={styles.input} type="number" min="0" max="100" step="0.01" value={commissionDraft} onChange={(event) => setCommissionDraft(event.target.value)} placeholder="Use global default" /></label>
                <div className={styles.dataItem}><span>Effective rate</span><strong>{commission ? `${commission.effectiveRate}% per confirmed appointment` : "—"}</strong></div>
              </div>
              <div className={styles.formActions}><button type="button" className={styles.button} onClick={() => void saveCommission()} disabled={commissionSaving}>{commissionSaving ? "Saving…" : "Save commission"}</button></div>
            </section>

            <section className={styles.locations}>
              {application.locations.map((location) => {
                const isOpen = openLocationId === location.locationId;
                return (
                  <article className={styles.locationCard} key={location.locationId}>
                    <button
                      aria-expanded={isOpen}
                      className={styles.locationAccordionTrigger}
                      onClick={() => setOpenLocationId((current) => current === location.locationId ? null : location.locationId)}
                      type="button"
                    >
                      <div className={styles.locationTitle}>
                        <div>
                          <span className={styles.eyebrow}>{location.state}</span>
                          <h2>{location.county}</h2>
                          {partnerWebsite?.primaryLocationId === location.locationId ? (
                            <span className={`${styles.badge} ${styles.info}`}>Primary website county</span>
                          ) : null}
                          <p>My Drip Nurse {location.county}, {location.state}</p>
                        </div>
                        <span className={styles.locationId}>Location ID · {location.locationId}</span>
                      </div>
                      <div className={styles.locationAccordionMeta}>
                        <div className={styles.locationStatusSummary} aria-label="County activation status">
                          <span className={`${styles.badge} ${statusTone(location.calendarsStatus)}`}>
                            Booking engine · {statusLabel(location.calendarsStatus)}
                          </span>
                          <span className={`${styles.badge} ${statusTone(location.depositStatus)}`}>
                            Stripe deposit · {statusLabel(location.depositStatus)}
                          </span>
                        </div>
                        <span aria-hidden="true" className={`${styles.accordionChevron} ${isOpen ? styles.accordionChevronOpen : ""}`}>
                          ↓
                        </span>
                      </div>
                    </button>

                    {isOpen ? <div className={styles.steps}>
                      <section className={styles.step}>
                        <div className={styles.stepHeader}>
                          <div>
                            <span className={styles.eyebrow}>Internal booking setup</span>
                            <h3>Services, availability, deposits</h3>
                          </div>
                          <div className={styles.progressRow}>
                            <span className={`${styles.badge} ${statusTone(location.staffStatus)}`}>
                              Profile: {statusLabel(location.staffStatus)}
                            </span>
                            <span className={`${styles.badge} ${statusTone(location.calendarsStatus)}`}>
                              Booking: {statusLabel(location.calendarsStatus)}
                            </span>
                            <span className={`${styles.badge} ${statusTone(location.depositStatus)}`}>
                              Deposit: {statusLabel(location.depositStatus)}
                            </span>
                          </div>
                        </div>
                        <p>
                          The platform creates the Partner profile, activates the catalog services, applies the 35%
                          deposit policy, and stores availability in the internal booking engine. Nothing is created
                          or activated in any external CRM.
                        </p>
                      </section>
                    </div> : null}
                  </article>
                );
              })}
            </section>
          </div>

          <aside className={styles.sideColumn}>
            <section className={styles.sideCard}>
              <span className={styles.eyebrow}>Workflow controls</span>
              <h2>Activation sequence</h2>
              <div className={styles.stack}>
                <button
                  className={styles.button}
                  disabled={Boolean(busyAction) || Boolean(application.reviewedAt) || isFinished}
                  onClick={() =>
                    void updateApplication(
                      { action: "review" },
                      "review",
                      "Application review started. Platform Stripe and internal booking setup are ready for activation.",
                    )
                  }
                  type="button"
                >
                      {busyAction === "review"
                        ? "Saving…"
                        : application.reviewedAt
                          ? "Review completed"
                      : "1. Start application review"}
                </button>
                <button
                  className={styles.button}
                  disabled={
                    Boolean(busyAction) || !application.reviewedAt || allStaffReady || isFinished
                  }
                  onClick={() => void provisionStaff()}
                  type="button"
                >
                  {busyAction === "provision"
                    ? "Provisioning…"
                    : allStaffReady
                      ? "Internal booking profile ready"
                    : "2. Activate internal booking profile"}
                </button>
                <button
                  className={styles.button}
                  disabled={
                    Boolean(busyAction) ||
                    !allStaffReady ||
                    !finalWebhookSent ||
                    isFinished
                  }
                  onClick={() => {
                    if (!window.confirm("Complete this partner application?")) return;
                    void updateApplication(
                      { action: "complete" },
                      "complete",
                      "Partner activation marked complete.",
                    );
                  }}
                  type="button"
                >
                  {busyAction === "complete"
                    ? "Completing…"
                    : application.status === "completed"
                      ? "Activation completed"
                      : "4. Finish Partner activation"}
                </button>
              </div>
              <div className={styles.divider} />
              <div className={styles.dataItem}>
                <span>Reviewed</span>
                <strong>{formatDate(application.reviewedAt)}</strong>
              </div>
              <div className={styles.dataItem}>
                <span>Provisioned</span>
                <strong>{formatDate(application.provisionedAt)}</strong>
              </div>
              <div className={styles.dataItem}>
                <span>Completed</span>
                <strong>{formatDate(completedAt)}</strong>
              </div>
            </section>

            <section className={styles.sideCard}>
              <div className={styles.stepHeader}>
                <div>
                  <span className={styles.eyebrow}>Step 3 · Website review</span>
                  <h2>Partner website</h2>
                </div>
                <span className={`${styles.badge} ${statusTone(partnerWebsite?.status || "pending")}`}>
                  {partnerWebsite?.status ? statusLabel(partnerWebsite.status) : "pending"}
                </span>
              </div>
              <p>
                Preview the complete branded website before publishing. Publishing makes the URL public,
                submits the sitemap update, and only then sends the final Partner welcome webhook.
              </p>
              {partnerWebsite ? (
                <div className={styles.stack}>
                  <a className={styles.secondaryButton} href={partnerWebsite.previewUrl} target="_blank" rel="noreferrer">
                    Preview website ↗
                  </a>
                  {partnerWebsite.status === "published" ? (
                    <button
                      className={styles.secondaryButton}
                      disabled={Boolean(busyAction)}
                      onClick={() => void updateApplication(
                        { action: "hide_website" },
                        "hide-website",
                        "Partner website hidden from the public directory and public URL.",
                      )}
                      type="button"
                    >
                      {busyAction === "hide-website" ? "Hiding…" : "Hide website"}
                    </button>
                  ) : (
                    <button
                      className={styles.button}
                      disabled={Boolean(busyAction) || !allStaffReady}
                      onClick={() => {
                        if (!window.confirm("Publish this Partner website and send the final welcome webhook?")) return;
                        void updateApplication(
                          { action: partnerWebsite.status === "hidden" ? "republish_website" : "publish_website" },
                          "publish-website",
                          partnerWebsite.status === "hidden"
                            ? "Partner website republished."
                            : "Partner website published and welcome webhook delivered.",
                        );
                      }}
                      type="button"
                    >
                      {busyAction === "publish-website"
                        ? "Publishing…"
                        : partnerWebsite.status === "hidden"
                          ? "Republish website"
                          : "Publish website & send welcome"}
                    </button>
                  )}
                  <div className={styles.dataItem}>
                    <span>Primary county Location ID</span>
                    <code className={styles.readonlyId}>{partnerWebsite.primaryLocationId || "Not selected"}</code>
                  </div>
                </div>
              ) : (
                <div className={styles.notice}>Create the staff account and calendars to generate the website preview.</div>
              )}
            </section>

            <section className={styles.sideCard}>
              <span className={styles.eyebrow}>Applicant communication</span>
              <h2>Webhook boundary</h2>
              <p>
                The account-ready webhook is held until the website has been reviewed and published. It includes
                the live website URL, onboarding URL, internal service catalog, and Partner Portal URL.
              </p>
              <span className={`${styles.badge} ${finalWebhookSent ? styles.good : styles.warn}`}>
                {finalWebhookSent ? "Final webhook sent" : "Final webhook pending"}
              </span>
              {finalWebhookSent ? (
                <div className={styles.dataItem}>
                  <span>Delivered</span>
                  <strong>{formatDate(stringValue(finalWebhook?.sentAt))}</strong>
                </div>
              ) : (
                <div className={styles.notice}>
                  Deposits remain locked until the account-ready webhook has been delivered successfully.
                </div>
              )}
            </section>

            <section className={styles.sideCard}>
              <span className={styles.eyebrow}>Internal record</span>
              <h2>Admin notes</h2>
              <textarea
                className={styles.textarea}
                rows={7}
                value={application.adminNotes || ""}
                onChange={(event) =>
                  setApplication((current) => (current ? { ...current, adminNotes: event.target.value } : current))
                }
              />
              <button
                className={styles.secondaryButton}
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void updateApplication(
                    { action: "notes", notes: application.adminNotes || "" },
                    "notes",
                    "Admin notes saved.",
                  )
                }
                type="button"
              >
                {busyAction === "notes" ? "Saving…" : "Save notes"}
              </button>
            </section>

            <section className={styles.sideCard}>
              <span className={styles.eyebrow}>Exception handling</span>
              <h2>Reject application</h2>
              <p>Reject only after documenting the reason in the admin notes.</p>
              <button
                className={styles.dangerButton}
                disabled={Boolean(busyAction) || isFinished}
                onClick={() => {
                  if (!window.confirm("Reject this partner application?")) return;
                  void updateApplication(
                    { action: "reject", notes: application.adminNotes || "Application rejected by administrator." },
                    "reject",
                    "Application rejected.",
                  );
                }}
                type="button"
              >
                {busyAction === "reject" ? "Rejecting…" : "Reject application"}
              </button>
              {["failed", "rejected"].includes(application.status) ? (
                <>
                  <div className={styles.divider} />
                  <p>Permanently remove this failed record and its associated internal workflow data.</p>
                  <button
                    className={styles.dangerButton}
                    disabled={Boolean(busyAction)}
                    onClick={() => void deleteApplicationRecord()}
                    type="button"
                  >
                    {busyAction === "delete-application" ? "Deleting…" : "Delete application permanently"}
                  </button>
                </>
              ) : null}
            </section>

            <section className={styles.sideCard}>
              <span className={styles.eyebrow}>Access lifecycle</span>
              <h2>Remove staff access</h2>
              <p>
                Removes the Partner from the internal booking engine, deactivates their services and availability,
                and hides the Partner website. Shared service calendars remain available to other Partners.
              </p>
              {application.deactivatedAt ? (
                <div className={`${styles.notice} ${styles.successNotice}`}>
                  Staff access removed {formatDate(application.deactivatedAt)}.
                </div>
              ) : null}
              <button
                className={styles.dangerButton}
                disabled={Boolean(busyAction) || !application.provisionedAt || application.status === "deactivated"}
                onClick={() => void removeStaffAccess()}
                type="button"
              >
                {busyAction === "deactivate"
                  ? "Removing staff…"
                  : application.status === "deactivated"
                    ? "Staff access removed"
                    : "Remove staff access"}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </PartnerAdminShell>
  );
}
