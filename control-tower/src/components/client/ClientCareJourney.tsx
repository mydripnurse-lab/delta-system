import styles from "./ClientCareJourney.module.css";

type Props = {
  status: string;
  partnerAccepted: boolean;
  compact?: boolean;
};

const STEPS = [
  { key: "secured", label: "Visit secured", detail: "Your appointment details are protected." },
  { key: "matching", label: "Care matching", detail: "We coordinate an available verified professional." },
  { key: "confirmed", label: "Professional confirmed", detail: "Their verified profile is now available." },
  { key: "care", label: "Wellness visit", detail: "Your care is delivered and completed." },
] as const;

function activeIndex(status: string, partnerAccepted: boolean) {
  if (status === "completed") return 3;
  if (status === "in_progress") return 3;
  if (partnerAccepted || status === "partner_acknowledged") return 2;
  if (status === "confirmed") return 1;
  return 0;
}

function headline(status: string, partnerAccepted: boolean) {
  if (status === "completed") return "Your wellness visit is complete.";
  if (status === "in_progress") return "Your wellness visit is in progress.";
  if (partnerAccepted) return "Your care professional confirmed.";
  if (status === "confirmed") return "We’re coordinating your care professional.";
  return "Secure your appointment to continue.";
}

export default function ClientCareJourney({ status, partnerAccepted, compact = false }: Props) {
  const current = activeIndex(status, partnerAccepted);

  return (
    <section className={`${styles.journey} ${compact ? styles.compact : ""}`} aria-label="Appointment progress">
      <div className={styles.heading}>
        <div>
          <span>Care journey</span>
          <h3>{headline(status, partnerAccepted)}</h3>
        </div>
        <span className={styles.liveSignal}><i aria-hidden="true" /> Live status</span>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((step, index) => {
          const state = index < current ? "complete" : index === current ? "current" : "upcoming";
          return (
            <li key={step.key} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className={styles.marker}>{state === "complete" ? "✓" : String(index + 1).padStart(2, "0")}</span>
              <div><b>{step.label}</b><small>{step.detail}</small></div>
            </li>
          );
        })}
      </ol>
      <p className={styles.privacy}>For privacy, your professional’s live location, route and home address are never shared.</p>
    </section>
  );
}
