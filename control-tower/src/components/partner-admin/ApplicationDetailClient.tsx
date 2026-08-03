"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { StaffAdminApplication } from "@/lib/staffAdmin";
import { PartnerAdminLogout } from "@/components/partner-admin/PartnerAdminLogout";

import styles from "@/app/partner-admin/partnerAdmin.module.css";

type DepositDraft = {
  percentage: string;
  policyUrl: string;
  message: string;
};

type ApiResponse = {
  ok?: boolean;
  application?: StaffAdminApplication;
  error?: string;
};

const DEFAULT_POLICY_URL = "https://policy.mydripnurse.com";
const DEFAULT_DEPOSIT_MESSAGE =
  "A 30% deposit reserves the appointment. The remaining balance is collected by the nurse at the appointment. Deposit terms: https://policy.mydripnurse.com";

function statusTone(status: string) {
  if (["complete", "completed", "approved", "active", "not_required", "ready_to_complete"].includes(status)) {
    return styles.good;
  }
  if (["failed", "rejected"].includes(status)) return styles.bad;
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

function isComplete(status: string) {
  return status === "complete" || status === "not_required";
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
  const [depositDrafts, setDepositDrafts] = useState<Record<string, DepositDraft>>({});
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
    if (!application) return;
    setDepositDrafts((current) => {
      const next = { ...current };
      for (const location of application.locations) {
        if (next[location.locationId]) continue;
        next[location.locationId] = {
          percentage: String(location.depositConfig?.percentage ?? 30),
          policyUrl: stringValue(location.depositConfig?.policyUrl, DEFAULT_POLICY_URL),
          message: stringValue(location.depositConfig?.message, DEFAULT_DEPOSIT_MESSAGE),
        };
      }
      return next;
    });
  }, [application]);

  const allStripeReady = useMemo(
    () =>
      Boolean(application?.locations.length) &&
      application!.locations.every((location) => isComplete(location.stripeStatus)),
    [application],
  );
  const allStaffReady = useMemo(
    () =>
      Boolean(application?.locations.length) &&
      application!.locations.every(
        (location) => location.staffStatus === "complete" && location.calendarsStatus === "complete",
      ),
    [application],
  );
  const allDepositsReady = useMemo(
    () =>
      Boolean(application?.locations.length) &&
      application!.locations.every((location) => isComplete(location.depositStatus)),
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
        "The staff account, required calendars, and final partner welcome webhook were completed.",
      );
    } catch (provisionError) {
      setError(provisionError instanceof Error ? provisionError.message : "Staff provisioning failed.");
    } finally {
      setBusyAction("");
    }
  }

  function updateDepositDraft(locationId: string, field: keyof DepositDraft, value: string) {
    setDepositDrafts((current) => ({
      ...current,
      [locationId]: {
        ...(current[locationId] || {
          percentage: "30",
          policyUrl: DEFAULT_POLICY_URL,
          message: DEFAULT_DEPOSIT_MESSAGE,
        }),
        [field]: value,
      },
    }));
  }

  if (loading) {
    return (
      <main className={styles.shell}>
        <div className={styles.frame}>
          <div className={styles.panel}>Loading partner application…</div>
        </div>
      </main>
    );
  }

  if (!application) {
    return (
      <main className={styles.shell}>
        <div className={styles.frame}>
          <div className={styles.panel}>
            <p>{error || "This partner application was not found."}</p>
            <Link className={styles.secondaryButton} href="/">
              Return to applications
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const fullName = `${application.firstName} ${application.lastName}`.trim();
  const isFinished = application.status === "completed" || application.status === "rejected";
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

  return (
    <main className={styles.shell}>
      <div className={styles.frame}>
        <header className={styles.topbar}>
          <div>
            <div className={styles.progressRow}>
              <span className={styles.brandMark}>MDN</span>
              <strong>Partner Admin</strong>
            </div>
            <p>Controlled activation workflow</p>
          </div>
          <div className={styles.topbarActions}>
            <Link className={styles.secondaryButton} href="/">
              ← All applications
            </Link>
            <PartnerAdminLogout className={styles.secondaryButton} />
          </div>
        </header>

        <section className={styles.detailHeader}>
          <div>
            <span className={`${styles.badge} ${statusTone(application.status)}`}>
              {statusLabel(application.status)}
            </span>
            <h1>{fullName}</h1>
            <p>
              Review every requested county in order. Stripe must be confirmed before staff creation, and
              deposits are configured only after calendar assignment is complete.
            </p>
          </div>
          <div className={styles.progressRow}>
            <span className={`${styles.badge} ${application.reviewedAt ? styles.good : styles.warn}`}>
              Review {application.reviewedAt ? "complete" : "pending"}
            </span>
            <span className={`${styles.badge} ${allStripeReady ? styles.good : styles.warn}`}>
              Stripe {allStripeReady ? "ready" : "pending"}
            </span>
            <span className={`${styles.badge} ${allStaffReady ? styles.good : styles.warn}`}>
              Staff {allStaffReady ? "ready" : "pending"}
            </span>
            <span className={`${styles.badge} ${finalWebhookSent ? styles.good : styles.warn}`}>
              Welcome {finalWebhookSent ? "sent" : "pending"}
            </span>
            <span className={`${styles.badge} ${allDepositsReady ? styles.good : styles.warn}`}>
              Deposits {allDepositsReady ? "ready" : "pending"}
            </span>
          </div>
        </section>

        {error ? <div className={styles.notice}>{error}</div> : null}
        {success ? <div className={styles.successNotice}>{success}</div> : null}

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

            <section className={styles.locations}>
              {application.locations.map((location) => {
                const stripeUrl = `https://app.devasks.com/v2/location/${encodeURIComponent(location.locationId)}/settings/lc-integrations`;
                const calendarsUrl = `https://app.devasks.com/v2/location/${encodeURIComponent(location.locationId)}/settings/calendars`;
                const draft = depositDrafts[location.locationId] || {
                  percentage: "30",
                  policyUrl: DEFAULT_POLICY_URL,
                  message: DEFAULT_DEPOSIT_MESSAGE,
                };
                const depositCanBeCompleted =
                  location.staffStatus === "complete" &&
                  location.calendarsStatus === "complete" &&
                  finalWebhookSent;

                return (
                  <article className={styles.locationCard} key={location.locationId}>
                    <div className={styles.locationTitle}>
                      <div>
                        <span className={styles.eyebrow}>{location.state}</span>
                        <h2>{location.county}</h2>
                        <p>My Drip Nurse {location.county}, {location.state}</p>
                      </div>
                      <span className={styles.badge}>Location ID · {location.locationId}</span>
                    </div>

                    <div className={styles.steps}>
                      <section className={styles.step}>
                        <div className={styles.stepHeader}>
                          <div>
                            <span className={styles.eyebrow}>Step 1 · Manual</span>
                            <h3>Connect My Drip Nurse Stripe</h3>
                          </div>
                          <span className={`${styles.badge} ${statusTone(location.stripeStatus)}`}>
                            {statusLabel(location.stripeStatus)}
                          </span>
                        </div>
                        <p>
                          Open the subaccount integration screen, connect Stripe, verify it is live, then mark
                          this checkpoint complete.
                        </p>
                        <div className={styles.actionRow}>
                          <a className={styles.secondaryButton} href={stripeUrl} target="_blank" rel="noreferrer">
                            Open Stripe integration ↗
                          </a>
                          <button
                            className={styles.button}
                            disabled={Boolean(busyAction) || isFinished}
                            onClick={() =>
                              void updateApplication(
                                {
                                  action: "stripe",
                                  locationId: location.locationId,
                                  status: isComplete(location.stripeStatus) ? "pending" : "complete",
                                },
                                `stripe-${location.locationId}`,
                                isComplete(location.stripeStatus)
                                  ? "Stripe checkpoint reopened."
                                  : "Stripe connection confirmed.",
                              )
                            }
                            type="button"
                          >
                            {busyAction === `stripe-${location.locationId}`
                              ? "Saving…"
                              : isComplete(location.stripeStatus)
                                ? "Reopen Stripe step"
                                : "Mark Stripe complete"}
                          </button>
                        </div>
                      </section>

                      <section className={styles.step}>
                        <div className={styles.stepHeader}>
                          <div>
                            <span className={styles.eyebrow}>Step 2 · Automated</span>
                            <h3>Create staff and assign calendars</h3>
                          </div>
                          <div className={styles.progressRow}>
                            <span className={`${styles.badge} ${statusTone(location.staffStatus)}`}>
                              Staff: {statusLabel(location.staffStatus)}
                            </span>
                            <span className={`${styles.badge} ${statusTone(location.calendarsStatus)}`}>
                              Calendars: {statusLabel(location.calendarsStatus)}
                            </span>
                          </div>
                        </div>
                        <p>
                          The global provision action creates or reuses the user and assigns all required My Drip
                          Nurse calendars for every approved location.
                        </p>
                        <a className={styles.textButton} href={calendarsUrl} target="_blank" rel="noreferrer">
                          Open calendar settings ↗
                        </a>
                      </section>

                      <section className={styles.step}>
                        <div className={styles.stepHeader}>
                          <div>
                            <span className={styles.eyebrow}>Step 3 · Final operations</span>
                            <h3>Configure appointment deposit</h3>
                          </div>
                          <span className={`${styles.badge} ${statusTone(location.depositStatus)}`}>
                            {statusLabel(location.depositStatus)}
                          </span>
                        </div>
                        <p>
                          The default deposit is 30%. Confirm payment mode and the deposit inside each required
                          calendar, then record the configuration here.
                        </p>
                        <div className={styles.depositFields}>
                          <label className={styles.fieldLabel}>
                            Deposit percentage
                            <input
                              className={styles.numberInput}
                              min="0"
                              max="100"
                              type="number"
                              value={draft.percentage}
                              onChange={(event) =>
                                updateDepositDraft(location.locationId, "percentage", event.target.value)
                              }
                            />
                          </label>
                          <label className={styles.fieldLabel}>
                            Policy URL
                            <input
                              className={styles.input}
                              type="url"
                              value={draft.policyUrl}
                              onChange={(event) =>
                                updateDepositDraft(location.locationId, "policyUrl", event.target.value)
                              }
                            />
                          </label>
                        </div>
                        <label className={styles.fieldLabel}>
                          Patient-facing deposit message
                          <textarea
                            className={styles.textarea}
                            rows={3}
                            value={draft.message}
                            onChange={(event) =>
                              updateDepositDraft(location.locationId, "message", event.target.value)
                            }
                          />
                        </label>
                        {!depositCanBeCompleted ? (
                          <div className={styles.notice}>
                            Staff creation, calendar assignment, and the final partner welcome webhook must all be
                            complete before this deposit can be confirmed.
                          </div>
                        ) : null}
                        <div className={styles.actionRow}>
                          <a className={styles.secondaryButton} href={calendarsUrl} target="_blank" rel="noreferrer">
                            Configure deposits ↗
                          </a>
                          <button
                            className={styles.button}
                            disabled={Boolean(busyAction) || !depositCanBeCompleted || isFinished}
                            onClick={() =>
                              void updateApplication(
                                {
                                  action: "deposit",
                                  locationId: location.locationId,
                                  status: isComplete(location.depositStatus) ? "pending" : "complete",
                                  percentage: Number(draft.percentage || 30),
                                  policyUrl: draft.policyUrl,
                                  message: draft.message,
                                },
                                `deposit-${location.locationId}`,
                                isComplete(location.depositStatus)
                                  ? "Deposit checkpoint reopened."
                                  : "Deposit configuration confirmed.",
                              )
                            }
                            type="button"
                          >
                            {busyAction === `deposit-${location.locationId}`
                              ? "Saving…"
                              : isComplete(location.depositStatus)
                                ? "Reopen deposit step"
                                : "Mark deposit complete"}
                          </button>
                        </div>
                      </section>
                    </div>
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
                      "Application review started. Complete Stripe for every requested county next.",
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
                    Boolean(busyAction) || !application.reviewedAt || !allStripeReady || allStaffReady || isFinished
                  }
                  onClick={() => void provisionStaff()}
                  type="button"
                >
                  {busyAction === "provision"
                    ? "Provisioning…"
                    : allStaffReady
                      ? "Staff and calendars ready"
                      : "2. Create staff and assign calendars"}
                </button>
                <button
                  className={styles.button}
                  disabled={
                    Boolean(busyAction) ||
                    !allStaffReady ||
                    !finalWebhookSent ||
                    !allDepositsReady ||
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
                      : "3. Finish internal activation"}
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
              <span className={styles.eyebrow}>Applicant communication</span>
              <h2>Webhook boundary</h2>
              <p>
                The existing account-creation webhook is sent during staff provisioning. It remains the final
                applicant-facing message. Deposit work and internal completion do not send another partner
                webhook.
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
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
