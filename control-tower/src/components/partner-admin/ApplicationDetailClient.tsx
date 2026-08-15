"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import { ApplicationAvailabilityPanel } from "@/components/partner-admin/ApplicationAvailabilityPanel";
import { PartnerWebsiteControls } from "@/components/partner-admin/PartnerWebsiteControls";
import type { StaffAdminApplication } from "@/lib/staffAdmin";

import styles from "@/app/partner-admin/partnerAdmin.module.css";

type ApiResponse = {
  ok?: boolean;
  application?: StaffAdminApplication;
  error?: string;
};

function value(input: unknown, fallback = "Not provided") {
  return typeof input === "string" && input.trim() ? input.trim() : fallback;
}

function formatDate(input: string | null | undefined) {
  if (!input) return "Not available";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function label(input: string) {
  return input.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

function initials(application: StaffAdminApplication) {
  return `${application.firstName.charAt(0)}${application.lastName.charAt(0)}`.toUpperCase() || "MDN";
}

export function ApplicationDetailClient({ applicationId }: { applicationId: string }) {
  const [application, setApplication] = useState<StaffAdminApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState("");

  const loadApplication = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, { cache: "no-store" });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as ApiResponse;
      if (!response.ok || !payload.application) {
        throw new Error(payload.error || "Unable to load this application.");
      }
      setApplication(payload.application);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load this application.");
    } finally {
      setLoading(false);
    }
  }, [applicationId]);

  useEffect(() => {
    void loadApplication();
  }, [loadApplication]);

  const requestedCounties = useMemo(() => {
    if (!application) return [];
    const payloadCounties = Array.isArray(application.requestPayload.counties)
      ? application.requestPayload.counties
      : [];
    if (application.locations.length) {
      return application.locations.map((location) => ({
        state: location.state,
        county: location.county,
        locationId: location.locationId,
      }));
    }
    return payloadCounties.map((entry) => {
      const county = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
      return {
        state: value(county.state, ""),
        county: value(county.county, ""),
        locationId: value(county.locationId, ""),
      };
    });
  }, [application]);

  async function request(path: string, init: RequestInit) {
    const response = await fetch(path, init);
    if (redirectOnUnauthorized(response)) throw new Error("Your session has expired.");
    const payload = (await response.json()) as ApiResponse;
    if (!response.ok || !payload.application) {
      throw new Error(payload.error || "The application could not be updated.");
    }
    setApplication(payload.application);
    return payload.application;
  }

  async function acceptApplication() {
    if (!application || application.provisionedAt) return;
    if (!window.confirm(`Accept ${application.fullName}'s application and create their Partner account?`)) return;

    setBusyAction("accept");
    setError("");
    setSuccess("");
    try {
      let current = application;
      if (!current.reviewedAt) {
        current = await request(`/api/partner-admin/applications/${applicationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "review" }),
        });
      }
      if (!current.provisionedAt) {
        current = await request(`/api/partner-admin/applications/${applicationId}/provision`, { method: "POST" });
      }
      setApplication(current);
      setSuccess(current.result.finalWebhookSent === true
        ? "Application accepted. The Partner account is ready and the welcome email/SMS workflow was triggered."
        : "Application accepted. The Partner account is ready, but the account-ready webhook needs attention.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Partner account could not be created.");
    } finally {
      setBusyAction("");
    }
  }

  async function deletePartner() {
    if (!application?.provisionedAt || busyAction) return;
    const confirmationEmail = deleteConfirmationEmail.trim().toLowerCase();
    if (confirmationEmail !== application.email.toLowerCase()) {
      setError("The confirmation email did not match. Nothing was deleted.");
      return;
    }

    setBusyAction("delete");
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationEmail,
          deleteProvisionedPartner: true,
        }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "The Partner could not be removed.");
      window.location.assign("/applications?partnerRemoved=1");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The Partner could not be removed.");
      setBusyAction("");
    }
  }

  if (loading) {
    return (
      <PartnerAdminShell title="Application profile">
        <div className={styles.frame}><div className={styles.loading}>Loading partner application…</div></div>
      </PartnerAdminShell>
    );
  }

  if (!application) {
    return (
      <PartnerAdminShell title="Application profile">
        <div className={styles.frame}>
          <div className={styles.empty}>
            <p>{error || "This partner application was not found."}</p>
            <Link className={styles.secondaryButton} href="/">Return to applications</Link>
          </div>
        </div>
      </PartnerAdminShell>
    );
  }

  const payload = application.requestPayload;
  const fullName = application.fullName || `${application.firstName} ${application.lastName}`.trim();
  const photoUrl = value(payload.profilePhotoUrl, "");
  const publicTitle = value(payload.publicTitle);
  const credentials = value(payload.professionalCredentials, "None listed");
  const biography = value(payload.biography);
  const referralCode = value(payload.referralCode, "None");
  const consentAt = value(payload.profileConsentAt, "");
  const primaryLocationId = value(payload.primaryLocationId, "");
  const accountCreated = Boolean(application.provisionedAt);
  const readiness = application.operationalReadiness;
  const isRejected = application.status === "rejected";
  const canAccept = !accountCreated && !isRejected && application.status !== "deactivated";

  return (
    <PartnerAdminShell
      title="Application profile"
      actions={<Link className={styles.secondaryButton} href="/">← All applications</Link>}
    >
      <main className={`${styles.frame} ${styles.applicationProfile}`}>
        <section className={styles.applicationHero}>
          <div className={styles.applicationPortrait}>
            {photoUrl ? (
              <Image alt={`${fullName} profile`} fill sizes="112px" src={photoUrl} unoptimized />
            ) : (
              <span>{initials(application)}</span>
            )}
          </div>
          <div className={styles.applicationHeroCopy}>
            <div className={styles.applicationStatusLine}>
              <span className={styles.eyebrow}>Partner application</span>
              <span className={`${styles.applicationStatus} ${accountCreated ? styles.applicationStatusAccepted : isRejected ? styles.applicationStatusRejected : ""}`}>
                {accountCreated ? "Accepted" : isRejected ? "Declined" : "Ready for review"}
              </span>
            </div>
            <h1>{fullName}</h1>
            <p>{publicTitle}{credentials !== "None listed" ? ` · ${credentials}` : ""}</p>
            <div className={styles.applicationContactRow}>
              <a href={`mailto:${application.email}`}>{application.email}</a>
              <span aria-hidden="true">•</span>
              <a href={`tel:${application.phone}`}>{application.phone}</a>
              <span aria-hidden="true">•</span>
              <span>{application.company || "Independent Partner"}</span>
            </div>
          </div>
          <div className={styles.applicationDecision}>
            <span>Submitted {formatDate(application.submittedAt)}</span>
            <button
              className={styles.applicationAcceptButton}
              disabled={!canAccept || Boolean(busyAction)}
              onClick={() => void acceptApplication()}
              type="button"
            >
              {busyAction === "accept" ? "Creating account…" : accountCreated ? "Application accepted ✓" : "Accept application"}
            </button>
            {accountCreated ? (
              <button
                className={styles.applicationDeleteButton}
                disabled={Boolean(busyAction)}
                onClick={() => {
                  setDeleteConfirmationOpen(true);
                  setDeleteConfirmationEmail("");
                  setError("");
                }}
                type="button"
              >
                Remove partner
              </button>
            ) : null}
            {accountCreated && deleteConfirmationOpen ? (
              <div className={styles.applicationDeleteConfirm}>
                <strong>Remove this Partner permanently?</strong>
                <p>Portal access, profile and application will be removed. Historical appointments remain unassigned.</p>
                <label>
                  <span>Type {application.email} to confirm</span>
                  <input
                    aria-label="Confirm partner email"
                    autoComplete="off"
                    onChange={(event) => setDeleteConfirmationEmail(event.target.value)}
                    value={deleteConfirmationEmail}
                  />
                </label>
                <div>
                  <button
                    className={styles.applicationDeleteCancel}
                    disabled={Boolean(busyAction)}
                    onClick={() => setDeleteConfirmationOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    className={styles.applicationDeleteSubmit}
                    disabled={Boolean(busyAction) || deleteConfirmationEmail.trim().toLowerCase() !== application.email.toLowerCase()}
                    onClick={() => void deletePartner()}
                    type="button"
                  >
                    {busyAction === "delete" ? "Removing…" : "Permanently remove"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        {error ? <div className={styles.notice}>{error}</div> : null}
        {success ? <div className={styles.successNotice}>{success}</div> : null}

        <div className={styles.applicationContent}>
          <div className={styles.applicationMain}>
            <section className={styles.applicationSection}>
              <div className={styles.applicationSectionHeader}>
                <span>01</span>
                <div><h2>Professional profile</h2><p>Information patients will use to understand who will care for them.</p></div>
              </div>
              <div className={styles.applicationFacts}>
                <div><span>Professional title</span><strong>{publicTitle}</strong></div>
                <div><span>Licenses &amp; credentials</span><strong>{credentials}</strong></div>
                <div><span>Business or practice</span><strong>{application.company || "Independent Partner"}</strong></div>
                <div><span>Website profile consent</span><strong>{consentAt ? `Confirmed ${formatDate(consentAt)}` : "Not confirmed"}</strong></div>
              </div>
              <div className={styles.applicationBiography}>
                <span>Professional biography</span>
                <p>{biography}</p>
              </div>
            </section>

            <section className={styles.applicationSection}>
              <div className={styles.applicationSectionHeader}>
                <span>02</span>
                <div><h2>Requested coverage</h2><p>Counties where this Partner is requesting to receive appointments.</p></div>
              </div>
              <div className={styles.applicationCoverageList}>
                {requestedCounties.map((county) => (
                  <div key={`${county.locationId}-${county.county}`}>
                    <div>
                      <strong>{county.county}, {county.state}</strong>
                      <span>{county.locationId === primaryLocationId ? "Primary service area" : "Additional service area"}</span>
                    </div>
                    {county.locationId === primaryLocationId ? <b>Primary</b> : null}
                  </div>
                ))}
              </div>
            </section>

            {accountCreated ? (
              <ApplicationAvailabilityPanel
                accountActivated={readiness.accountActivated}
                applicationId={application.id}
                onSaved={loadApplication}
              />
            ) : null}
          </div>

          <aside className={styles.applicationAside}>
            {accountCreated ? (
              <section className={`${styles.applicationSection} ${styles.applicationReadiness}`}>
                <div className={styles.applicationReadinessHeader} data-ready={readiness.publishReady ? "yes" : "no"}>
                  <div>
                    <span className={styles.eyebrow}>Launch readiness</span>
                    <h2>{readiness.publishReady ? "Ready for patients" : "Partner action needed"}</h2>
                    <p>{readiness.publishReady
                      ? "The account and schedule are ready. You can publish the website and directory."
                      : "Complete the pending Partner steps before making this profile public."}</p>
                  </div>
                  <span aria-label={readiness.publishReady ? "Ready" : "Pending"}>{readiness.publishReady ? "✓" : "!"}</span>
                </div>
                <div className={styles.applicationReadinessGrid}>
                  <div data-ready={readiness.accountActivated ? "yes" : "no"}>
                    <span>Portal account</span>
                    <strong>{readiness.accountActivated ? "Activated" : "Activation pending"}</strong>
                    <small>{readiness.accountActivated ? "The Partner completed secure account activation." : "The Partner has not activated their account yet."}</small>
                  </div>
                  <div data-ready={readiness.availabilityConfigured ? "yes" : "no"}>
                    <span>Availability</span>
                    <strong>{readiness.availabilityConfigured ? `${readiness.availabilityDayCount} working ${readiness.availabilityDayCount === 1 ? "day" : "days"}` : "Not configured"}</strong>
                    <small>{readiness.availabilityConfigured ? "Weekly booking hours are active." : "No weekly booking hours have been saved."}</small>
                  </div>
                </div>
              </section>
            ) : null}
            {application.partnerWebsite ? (
              <section className={styles.applicationSection}>
                <span className={styles.eyebrow}>Publishing</span>
                <h2>Partner website &amp; directory</h2>
                <p className={styles.websiteDescription}>Review the public page, then publish or hide the website and directory listing together or independently.</p>
                <div className={styles.websiteStatusGrid}>
                  <div><span>Website</span><strong>{label(application.partnerWebsite.status)}</strong></div>
                  <div><span>Directory</span><strong>{label(application.partnerWebsite.directoryStatus)}</strong></div>
                </div>
                <PartnerWebsiteControls applicationId={application.id} readiness={readiness} website={application.partnerWebsite} onUpdated={setApplication} />
              </section>
            ) : null}
            <section className={styles.applicationSection}>
              <span className={styles.eyebrow}>Account summary</span>
              <h2>Created after approval</h2>
              <ul className={styles.applicationChecklist}>
                <li data-ready={readiness.accountActivated ? "yes" : "no"}><span>{readiness.accountActivated ? "✓" : "!"}</span><div><strong>Partner Portal access</strong><small>{readiness.accountActivated ? "Account activated and ready" : "Waiting for the Partner to activate their account"}</small></div></li>
                <li><span>✓</span><div><strong>Professional profile</strong><small>Photo, credentials and biography</small></div></li>
                <li><span>✓</span><div><strong>Service catalog</strong><small>Active My Drip Nurse services</small></div></li>
                <li data-ready={readiness.availabilityConfigured ? "yes" : "no"}><span>{readiness.availabilityConfigured ? "✓" : "!"}</span><div><strong>Coverage and availability</strong><small>{requestedCounties.length} service {requestedCounties.length === 1 ? "area" : "areas"}; {readiness.availabilityConfigured ? `${readiness.availabilityDayCount} working ${readiness.availabilityDayCount === 1 ? "day" : "days"} configured` : "weekly availability is still pending"}</small></div></li>
                <li><span>✓</span><div><strong>Partner website</strong><small>{application.partnerWebsite ? `${label(application.partnerWebsite.status)} website · ${label(application.partnerWebsite.directoryStatus)} directory` : "Prepared after approval"}</small></div></li>
              </ul>
              <div className={styles.applicationBoundary}>Everything is created inside My Drip Nurse. No GHL staff account, calendar or subaccount is created.</div>
            </section>

            <section className={styles.applicationSection}>
              <span className={styles.eyebrow}>Application details</span>
              <dl className={styles.applicationMeta}>
                <div><dt>Referral code</dt><dd>{referralCode}</dd></div>
                <div><dt>Application ID</dt><dd>{application.id}</dd></div>
                <div><dt>Account created</dt><dd>{accountCreated ? formatDate(application.provisionedAt) : "Pending approval"}</dd></div>
                {application.adminNotes ? <div><dt>Admin note</dt><dd>{application.adminNotes}</dd></div> : null}
              </dl>
            </section>
          </aside>
        </div>
      </main>
    </PartnerAdminShell>
  );
}
