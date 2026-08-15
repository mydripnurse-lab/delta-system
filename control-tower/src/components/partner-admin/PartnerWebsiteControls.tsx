"use client";

import { useState } from "react";

import type { StaffAdminApplication, StaffPartnerOperationalReadiness, StaffPartnerWebsite } from "@/lib/staffAdmin";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type WebsiteAction = "publish_website" | "republish_website" | "hide_website";
type VisibilityTarget = "both" | "website" | "directory";

type Props = {
  applicationId: string;
  website: Pick<StaffPartnerWebsite, "status" | "directoryStatus" | "url" | "previewUrl">;
  readiness: StaffPartnerOperationalReadiness;
  compact?: boolean;
  onUpdated?: (application: StaffAdminApplication) => void;
};

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

export function PartnerWebsiteControls({ applicationId, website, readiness, compact = false, onUpdated }: Props) {
  const [busyAction, setBusyAction] = useState<WebsiteAction | "">("");
  const [publishTarget, setPublishTarget] = useState<VisibilityTarget>("both");
  const [hideTarget, setHideTarget] = useState<VisibilityTarget>("both");
  const [error, setError] = useState("");

  async function updateWebsite(action: WebsiteAction, target: VisibilityTarget = "website") {
    if (busyAction) return;
    if (action === "publish_website" && !readiness.publishReady) return;
    const targetLabel = target === "both" ? "website and directory listing" : target === "website" ? "website" : "directory listing";
    if (action === "hide_website" && !window.confirm(`Hide the Partner ${targetLabel}?`)) return;
    if (action === "publish_website" && !window.confirm(`Publish the Partner ${targetLabel}?`)) return;

    setBusyAction(action);
    setError("");
    try {
      const response = await fetch(`/api/partner-admin/applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, target }),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = (await response.json()) as { ok?: boolean; application?: StaffAdminApplication; error?: string };
      if (!response.ok || !payload.application) throw new Error(payload.error || "The website could not be updated.");
      onUpdated?.(payload.application);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The website could not be updated.");
    } finally {
      setBusyAction("");
    }
  }

  const websitePublished = website.status === "published";
  const directoryPublished = website.directoryStatus === "published";
  const canPublish = !websitePublished || !directoryPublished;
  const canHide = websitePublished || directoryPublished;
  const publishBlocked = canPublish && !readiness.publishReady;
  const missingRequirements = [
    !readiness.accountActivated ? "account activation" : "",
    !readiness.availabilityConfigured ? "working hours" : "",
  ].filter(Boolean);

  return (
    <div className={`${styles.websiteControls} ${compact ? styles.websiteControlsCompact : ""}`}>
      <div className={styles.websiteControlActions}>
        <a
          className={styles.textButton}
          href={websitePublished ? website.url : website.previewUrl}
          rel="noreferrer"
          target="_blank"
        >
          {websitePublished ? "View live ↗" : "Preview ↗"}
        </a>
        {canPublish ? (
          <div className={styles.websiteActionGroup}>
            <select aria-label="Choose what to publish" disabled={Boolean(busyAction) || publishBlocked} value={publishTarget} onChange={(event) => setPublishTarget(event.target.value as VisibilityTarget)}>
              <option value="both">Website + Directory</option>
              <option value="website">Website only</option>
              <option value="directory">Directory only</option>
            </select>
            <button className={styles.button} disabled={Boolean(busyAction) || publishBlocked} onClick={() => void updateWebsite("publish_website", publishTarget)} type="button">
              {busyAction === "publish_website" ? "Publishing…" : "Publish"}
            </button>
          </div>
        ) : null}
        {websitePublished ? (
          <button className={styles.secondaryButton} disabled={Boolean(busyAction)} onClick={() => void updateWebsite("republish_website", "website")} type="button">
            {busyAction === "republish_website" ? "Republishing…" : "Republish website"}
          </button>
        ) : null}
        {canHide ? (
          <>
            <div className={styles.websiteActionGroup}>
              <select aria-label="Choose what to hide" disabled={Boolean(busyAction)} value={hideTarget} onChange={(event) => setHideTarget(event.target.value as VisibilityTarget)}>
                <option value="both">Website + Directory</option>
                <option value="website">Website only</option>
                <option value="directory">Directory only</option>
              </select>
              <button className={styles.dangerButton} disabled={Boolean(busyAction)} onClick={() => void updateWebsite("hide_website", hideTarget)} type="button">
                {busyAction === "hide_website" ? "Hiding…" : "Hide"}
              </button>
            </div>
          </>
        ) : null}
      </div>
      {publishBlocked ? (
        <span className={styles.websiteControlRequirement} role="status">
          Publishing unlocks after the Partner completes {missingRequirements.join(" and ")}.
        </span>
      ) : null}
      {error ? <span className={styles.websiteControlError} role="alert">{error}</span> : null}
    </div>
  );
}
