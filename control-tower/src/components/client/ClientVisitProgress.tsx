import styles from "@/app/client-portal/clientPortal.module.css";

const steps = [
  { key: "confirmed", label: "Booked" },
  { key: "partner_acknowledged", label: "Care professional ready" },
  { key: "in_progress", label: "Visit in progress" },
  { key: "completed", label: "Completed" },
];

const rank: Record<string, number> = {
  payment_pending: 0,
  confirmed: 0,
  partner_acknowledged: 1,
  in_progress: 2,
  completed: 3,
};

export function clientVisitStatusLabel(status: string) {
  if (status === "payment_pending") return "Payment pending";
  if (status === "confirmed") return "Appointment confirmed";
  if (status === "partner_acknowledged") return "Care professional confirmed";
  if (status === "in_progress") return "Visit in progress";
  if (status === "completed") return "Visit completed";
  if (status === "partner_declined") return "Reassignment in progress";
  if (status === "cancelled") return "Cancelled";
  if (status === "refunded") return "Refunded";
  return status.replaceAll("_", " ");
}

export default function ClientVisitProgress({ status }: { status: string }) {
  const cancelled = ["cancelled", "refunded", "failed", "partner_declined"].includes(status);
  const current = rank[status] ?? 0;
  return (
    <div className={styles.visitProgress} aria-label={`Appointment status: ${clientVisitStatusLabel(status)}`}>
      {steps.map((step, index) => <div key={step.key} className={index <= current && !cancelled ? styles.progressStepActive : styles.progressStep}>
        <i>{index < current && !cancelled ? "✓" : ""}</i>
        <span>{step.label}</span>
      </div>)}
    </div>
  );
}
