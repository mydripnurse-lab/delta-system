"use client";

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
  selectedTestTargets: Record<PartnerAdminCommunicationRouter, PartnerAdminWebhookTarget>;
  onTenantChange: (tenantId: string) => void;
  onRouterDraftChange: (value: string) => void;
  onEdit: (router: PartnerAdminCommunicationRouter, webhookUrl: string) => void;
  onCancelEdit: () => void;
  onSave: (router: PartnerAdminCommunicationRouter, clear?: boolean) => void;
  onTestTargetChange: (router: PartnerAdminCommunicationRouter, target: PartnerAdminWebhookTarget) => void;
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
  selectedTestTargets,
  onTenantChange,
  onRouterDraftChange,
  onEdit,
  onCancelEdit,
  onSave,
  onTestTargetChange,
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
            <p>Independent Partner onboarding endpoints and optimized lifecycle routers power every GHL email and SMS workflow.</p>
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
                  <strong>One endpoint per GHL workflow</strong>
                  <p>Application Received and Account-ready Welcome are configured and tested independently. Booking and rewards keep optimized routers; use <code>event</code>, <code>workflowRouter</code> and <code>primaryAudience</code> inside GHL. Safe Tests use the live contract without creating production records.</p>
                </div>
              </div>

              {settingsError ? <div className={`${styles.inlineStatus} ${styles.error}`}>{settingsError}</div> : null}
              {settingsNotice ? <div className={`${styles.inlineStatus} ${styles.successNotice}`}>{settingsNotice}</div> : null}

              <div className={styles.communicationsGrid}>
                {selectedSettings.communications.map((communication, index) => {
                  const isEditing = editingRouter === communication.id;
                  const selectedTarget = selectedTestTargets[communication.id];
                  const selectedEvent = communication.events.find((event) => event.target === selectedTarget) || communication.events[0];

                  return (
                    <article className={`${styles.communicationCard} ${communication.configured ? styles.communicationCardActive : ""}`} key={communication.id}>
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

                      <details className={styles.communicationEvents}>
                        <summary>{communication.events.length} routed {communication.events.length === 1 ? "event" : "events"} <span>View payload events</span></summary>
                        <div className={styles.communicationEventList}>
                          {communication.events.map((event) => (
                            <span className={styles.communicationEventChip} key={`${communication.id}-${event.target}`}>
                              <strong>{event.label}</strong>
                              <code>{event.event}</code>
                            </span>
                          ))}
                        </div>
                      </details>

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
                          <div className={styles.communicationTest}>
                            <label>
                              <span>Safe Test event</span>
                              <select
                                className={styles.select}
                                value={selectedEvent?.target || ""}
                                onChange={(event) => onTestTargetChange(communication.id, event.target.value as PartnerAdminWebhookTarget)}
                                disabled={!communication.configured || locked}
                              >
                                {communication.events.map((event) => <option value={event.target} key={event.target}>{event.label}</option>)}
                              </select>
                            </label>
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
