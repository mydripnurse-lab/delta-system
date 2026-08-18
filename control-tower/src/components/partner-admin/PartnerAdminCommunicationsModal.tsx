"use client";

import { Fragment } from "react";
import type {
  PartnerAdminCommunicationRouter,
  PartnerAdminNotificationSettings,
  PartnerAdminWebhookTarget,
} from "@/lib/partnerAdminSettings";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type Props = {
  settings: PartnerAdminNotificationSettings[];
  selectedSettings: PartnerAdminNotificationSettings | null;
  selectedTenantId: string;
  settingsLoading: boolean;
  settingsSaving: boolean;
  settingsError: string;
  settingsNotice: string;
  testingTarget: PartnerAdminWebhookTarget | "";
  editingRouter: PartnerAdminCommunicationRouter | "";
  routerDraft: string;
  onTenantChange: (tenantId: string) => void;
  onRouterDraftChange: (value: string) => void;
  onEdit: (router: PartnerAdminCommunicationRouter, webhookUrl: string) => void;
  onCancelEdit: () => void;
  onSave: (router: PartnerAdminCommunicationRouter, clear?: boolean) => void;
  onTest: (target: PartnerAdminWebhookTarget) => void;
  onClose: () => void;
};

export function PartnerAdminCommunicationsModal({
  settings,
  selectedSettings,
  selectedTenantId,
  settingsLoading,
  settingsSaving,
  settingsError,
  settingsNotice,
  testingTarget,
  editingRouter,
  routerDraft,
  onTenantChange,
  onRouterDraftChange,
  onEdit,
  onCancelEdit,
  onSave,
  onTest,
  onClose,
}: Props) {
  const locked = settingsSaving || Boolean(testingTarget);

  return (
    <div
      className={styles.modalBackdrop}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className={`${styles.modal} ${styles.communicationsModal}`} role="dialog" aria-modal="true" aria-labelledby="communications-title">
        <header className={`${styles.modalHeader} ${styles.communicationsHeader}`}>
          <div>
            <span className={styles.eyebrow}>My Drip Nurse · GHL</span>
            <h2 id="communications-title">Communications</h2>
            <p>One dedicated endpoint for every GHL email, SMS and lifecycle workflow.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close communications" disabled={locked}>×</button>
        </header>

        <div className={`${styles.modalBody} ${styles.communicationsBody}`}>
          {settingsLoading ? <div className={styles.loading}>Loading secure communication routes…</div> : null}
          {!settingsLoading && !settings.length && !settingsError ? (
            <div className={styles.empty}>No communication workspace is available yet.</div>
          ) : null}

          {!settingsLoading && selectedSettings ? (
            <div className={styles.communicationsLayout}>
              <div className={styles.workspaceCard}>
                <div className={styles.logo} aria-hidden="true">MDN</div>
                <div>
                  <span>Workspace</span>
                  <strong>{selectedSettings.tenantName || "My Drip Nurse"}</strong>
                  <small>Secure routing for Partner, patient and internal communications</small>
                </div>
                {settings.length > 1 ? (
                  <select className={styles.select} aria-label="Select communication workspace" value={selectedTenantId} onChange={(event) => onTenantChange(event.target.value)} disabled={locked}>
                    {settings.map((item) => <option value={item.tenantId} key={item.tenantId}>{item.tenantName}</option>)}
                  </select>
                ) : null}
              </div>

              <div className={styles.communicationIntro}>
                <span className={styles.communicationPulse} aria-hidden="true" />
                <div>
                  <strong>Independent, event-specific webhooks</strong>
                  <p>Each workflow now has its own endpoint and Safe Test. The test sends the same event contract and mapping fields as production without creating a real lead, booking or appointment.</p>
                </div>
              </div>

              {settingsError ? <div className={`${styles.inlineStatus} ${styles.error}`}>{settingsError}</div> : null}
              {settingsNotice ? <div className={`${styles.inlineStatus} ${styles.successNotice}`}>{settingsNotice}</div> : null}

              <div className={styles.communicationsGrid}>
                {selectedSettings.communications.map((communication, index) => {
                  const isEditing = editingRouter === communication.id;
                  const selectedEvent = communication.events[0];
                  const startsCategory = index === 0 || selectedSettings.communications[index - 1]?.category !== communication.category;

                  return (
                    <Fragment key={communication.id}>
                    {startsCategory ? (
                      <div className={styles.communicationCategory}>
                        <span>{communication.category}</span>
                        <i aria-hidden="true" />
                      </div>
                    ) : null}
                    <article className={`${styles.communicationCard} ${communication.configured ? styles.communicationCardActive : ""}`}>
                      <div className={styles.communicationCardTop}>
                        <span className={styles.communicationIndex}>{String(index + 1).padStart(2, "0")}</span>
                        <div className={styles.communicationIdentity}>
                          <span>{communication.workflowName}</span>
                          <h3>{communication.name}</h3>
                        </div>
                        <span className={`${styles.routerStatus} ${communication.configured ? styles.routerStatusActive : styles.routerStatusInactive}`}>
                          <i aria-hidden="true" />
                          {communication.configured ? "Active" : "Inactive"}
                        </span>
                      </div>

                      <p className={styles.communicationDescription}>{communication.description}</p>

                      <div className={styles.communicationEndpoint}>
                        <span>GHL endpoint</span>
                        <strong>{communication.configured ? communication.endpoint : "Not connected"}</strong>
                      </div>

                      <div className={styles.communicationEventLine}>
                        <span>Payload event</span>
                        <code>{selectedEvent.event}</code>
                      </div>

                      {isEditing ? (
                        <div className={styles.communicationEditor}>
                          <label className={styles.formField}>
                            <span>GHL inbound webhook URL</span>
                            <input
                              className={styles.input}
                              type="url"
                              autoComplete="off"
                              value={routerDraft}
                              onChange={(event) => onRouterDraftChange(event.target.value)}
                              placeholder="https://services.leadconnectorhq.com/hooks/..."
                              autoFocus
                            />
                            <small>Saving activates only this GHL workflow and the event{communication.events.length === 1 ? "" : "s"} shown above.</small>
                          </label>
                          <div className={styles.communicationActions}>
                            <button type="button" className={styles.button} onClick={() => onSave(communication.id)} disabled={locked || !routerDraft.trim()}>
                              {settingsSaving ? "Saving…" : "Save & activate"}
                            </button>
                            {communication.configured ? (
                              <button type="button" className={styles.dangerQuietButton} onClick={() => onSave(communication.id, true)} disabled={locked}>Disable</button>
                            ) : null}
                            <button type="button" className={styles.secondaryButton} onClick={onCancelEdit} disabled={locked}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className={styles.communicationActions}>
                          <button type="button" className={styles.secondaryButton} onClick={() => onEdit(communication.id, communication.webhookUrl)} disabled={locked}>
                            Edit
                          </button>
                          <div className={`${styles.communicationTest} ${styles.communicationTestSingle}`}>
                            <button
                              type="button"
                              className={styles.button}
                              onClick={() => selectedEvent && onTest(selectedEvent.target)}
                              disabled={!communication.configured || locked || !selectedEvent}
                            >
                              {testingTarget && selectedEvent?.target === testingTarget ? "Sending…" : "Send Safe Test"}
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                    </Fragment>
                  );
                })}
              </div>

              <div className={styles.helpText}>
                Safe Tests contain non-production IDs and the same event-specific fields used by live delivery. Save a live, published GHL inbound webhook URL before testing.
              </div>
            </div>
          ) : null}
        </div>

        <footer className={`${styles.modalFooter} ${styles.communicationsFooter}`}>
          <span>Webhook tokens remain private outside edit mode.</span>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={locked}>Close</button>
        </footer>
      </section>
    </div>
  );
}
