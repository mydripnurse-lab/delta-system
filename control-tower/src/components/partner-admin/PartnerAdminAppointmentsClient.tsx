"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { AdminBookingAppointment } from "@/lib/adminBookingAppointments";
import type { AdminAppointmentCandidate } from "@/lib/adminBookingOperations";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

const STATUS_OPTIONS = [
  ["", "All statuses"],
  ["payment_pending", "Payment pending"],
  ["confirmed", "Confirmed"],
  ["partner_acknowledged", "Accepted by Partner"],
  ["in_progress", "In progress"],
  ["completed", "Completed"],
  ["partner_declined", "Partner declined"],
  ["cancelled", "Cancelled"],
  ["refunded", "Refunded"],
  ["failed", "Failed"],
] as const;

function date(value: string, timezone: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: timezone || undefined }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(value);
}

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateOfBirth(value: string) {
  if (!value) return "Not provided";
  const dateValue = new Date(`${value}T00:00:00`);
  return Number.isNaN(dateValue.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(dateValue);
}

function mapUrl(provider: "google" | "apple", address: string) {
  const query = encodeURIComponent(address);
  return provider === "apple"
    ? `https://maps.apple.com/?address=${query}`
    : `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function tone(value: string) {
  if (["completed", "confirmed", "partner_acknowledged", "in_progress"].includes(value)) return styles.good;
  if (["failed", "partner_declined", "cancelled", "refunded"].includes(value)) return styles.bad;
  return styles.warn;
}

type ReminderAction = "accept" | "start" | "complete";

const APPOINTMENT_PROGRESS = [
  { key: "payment", label: "Payment confirmed", detail: "Deposit or payment completed" },
  { key: "accept", label: "Partner accepted", detail: "Partner confirmed the visit" },
  { key: "start", label: "Visit started", detail: "Partner began the appointment" },
  { key: "complete", label: "Visit completed", detail: "Partner closed the visit" },
] as const;

function completedProgressSteps(appointment: AdminBookingAppointment) {
  if (appointment.status === "completed") return 4;
  if (appointment.status === "in_progress") return 3;
  if (appointment.status === "partner_acknowledged") return 2;
  if (appointment.status === "confirmed" || ["paid", "refunded", "partially_refunded"].includes(appointment.paymentStatus)) return 1;
  return 0;
}

function nextReminderAction(status: string): ReminderAction | null {
  if (status === "confirmed") return "accept";
  if (status === "partner_acknowledged") return "start";
  if (status === "in_progress") return "complete";
  return null;
}

function reminderLabel(action: ReminderAction) {
  if (action === "accept") return "Send acceptance reminder";
  if (action === "start") return "Send start reminder";
  return "Send completion reminder";
}

export function PartnerAdminAppointmentsClient() {
  const [appointments, setAppointments] = useState<AdminBookingAppointment[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [candidates, setCandidates] = useState<AdminAppointmentCandidate[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [actionReason, setActionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [reminderBusy, setReminderBusy] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ limit: "250" });
      if (search.trim()) query.set("search", search.trim());
      if (status) query.set("status", status);
      const response = await fetch(`/api/partner-admin/appointments?${query.toString()}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load internal appointments.");
      setAppointments(payload.appointments || []);
      setSelectedId((current) => (payload.appointments || []).some((item: AdminBookingAppointment) => item.id === current) ? current : "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load internal appointments.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selectedId) {
      setCandidates([]);
      setSelectedPartnerId("");
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    setActionError("");
    setActionMessage("");
    void fetch(`/api/partner-admin/appointments/${encodeURIComponent(selectedId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load appointment details.");
        if (!cancelled) setCandidates(payload.candidates || []);
      })
      .catch((detailError) => {
        if (!cancelled) setActionError(detailError instanceof Error ? detailError.message : "Could not load appointment details.");
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedId]);

  const runAction = useCallback(async (action: "reassign" | "refund") => {
    if (!selectedId || actionBusy) return;
    if (action === "reassign" && !selectedPartnerId) {
      setActionError("Choose an available Partner first.");
      return;
    }
    if (!actionReason.trim()) {
      setActionError("Add a short reason before continuing.");
      return;
    }
    if (action === "refund" && !window.confirm("Refund the paid deposit and close this appointment?")) return;
    setActionBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/partner-admin/appointments/${encodeURIComponent(selectedId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, partnerProfileId: selectedPartnerId || undefined, reason: actionReason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not update this appointment.");
      setActionMessage(action === "reassign" ? `Appointment reassigned to ${payload.result?.partnerName || "the selected Partner"}.` : "Appointment closed and the deposit refund was requested.");
      setActionReason("");
      setSelectedPartnerId("");
      await load();
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : "Could not update this appointment.");
    } finally {
      setActionBusy(false);
    }
  }, [actionBusy, actionReason, load, selectedId, selectedPartnerId]);

  const sendReminder = useCallback(async (reminderAction: ReminderAction) => {
    if (!selectedId || reminderBusy) return;
    setReminderBusy(true);
    setActionError("");
    setActionMessage("");
    try {
      const response = await fetch(`/api/partner-admin/appointments/${encodeURIComponent(selectedId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remind", reminderAction }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not send the Partner reminder.");
      const delivered = Number(payload.result?.sent || 0);
      const configured = payload.result?.configured !== false;
      setActionMessage(!configured
        ? "The reminder was saved, but Web Push is not configured in this environment."
        : delivered > 0
          ? `Reminder delivered to ${delivered} Partner device${delivered === 1 ? "" : "s"}.`
          : "The reminder was saved in the Partner Portal, but no active device received the push.");
      await load();
    } catch (reminderError) {
      setActionError(reminderError instanceof Error ? reminderError.message : "Could not send the Partner reminder.");
    } finally {
      setReminderBusy(false);
    }
  }, [load, reminderBusy, selectedId]);

  const selected = useMemo(() => appointments.find((appointment) => appointment.id === selectedId) || null, [appointments, selectedId]);
  const selectedProgress = selected ? completedProgressSteps(selected) : 0;
  const selectedReminderAction = selected ? nextReminderAction(selected.status) : null;
  const selectedClosed = selected ? ["partner_declined", "cancelled", "refunded", "failed"].includes(selected.status) : false;
  const stats = useMemo(() => ({
    total: appointments.length,
    upcoming: appointments.filter((appointment) => new Date(appointment.startsAt).getTime() >= Date.now() && ["confirmed", "partner_acknowledged", "in_progress"].includes(appointment.status)).length,
    completed: appointments.filter((appointment) => appointment.status === "completed").length,
    attention: appointments.filter((appointment) => ["payment_pending", "partner_declined", "failed"].includes(appointment.status)).length,
  }), [appointments]);

  return (
    <PartnerAdminShell title="Appointments" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh appointments"}</button>}>
      <div className={`${styles.frame} ${styles.appointmentsFrame}`}>
        <section className={styles.moduleHeader}>
          <div><span className={styles.eyebrow}>Internal booking operations</span><h1>Appointments</h1><p>Review appointments created by the My Drip Nurse booking engine. This view reads the internal database and does not depend on GHL calendars.</p></div>
          <div className={styles.moduleSummary}><strong>{stats.total}</strong><span>visible appointments</span><strong>{stats.upcoming}</strong><span>upcoming</span><strong>{stats.completed}</strong><span>completed</span><strong>{stats.attention}</strong><span>needs attention</span></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <h2>Booking activity</h2>
            <span className={styles.subtle}>Search by reference, patient, Partner, service or coverage area.</span>
            <div className={styles.filters}>
              <input className={`${styles.input} ${styles.search}`} aria-label="Search appointments" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search patient, Partner, service, city or reference" />
              <select className={styles.select} aria-label="Filter appointment status" value={status} onChange={(event) => setStatus(event.target.value)}>
                {STATUS_OPTIONS.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
              </select>
            </div>
          </div>
          {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
          {loading ? <div className={styles.loading}>Loading internal appointments…</div> : null}
          {!loading && !error && !appointments.length ? <div className={styles.resultsEmpty}><strong>0 results</strong><span>No appointments match this view.</span></div> : null}
          {!loading && appointments.length ? (
            <div className={styles.tableWrap}><table className={styles.table}>
              <thead><tr><th>Appointment</th><th>Patient</th><th>Partner</th><th>When</th><th>Payment</th><th>Status</th><th /></tr></thead>
              <tbody>{appointments.map((appointment) => (
                <tr key={appointment.id}>
                  <td><strong>{appointment.serviceName}</strong><span className={styles.tableSubtle}>{appointment.reference}</span>{appointment.bookedFromDirectory ? <span className={styles.tableSubtle}>Directory attributed</span> : null}</td>
                  <td><strong>{appointment.customerName}</strong><span className={styles.tableSubtle}>{appointment.customerEmail}</span></td>
                  <td>{appointment.partnerName || "Unassigned"}<span className={styles.tableSubtle}>{appointment.city}, {appointment.state}</span></td>
                  <td>{date(appointment.startsAt, appointment.timezone)}</td>
                  <td>{money(appointment.depositAmount, appointment.currency)} <span className={styles.tableSubtle}>{appointment.paymentStatus}</span></td>
                  <td><span className={`${styles.badge} ${tone(appointment.status)}`}>{label(appointment.status)}</span></td>
                  <td><button type="button" className={styles.textButton} onClick={() => setSelectedId(appointment.id)}>View details →</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          ) : null}
        </section>

        {selected ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>{selected.serviceName}</h2><span className={styles.subtle}>{selected.reference} · {label(selected.status)}</span></div>
            <div className={styles.appointmentProgressBlock}>
              <div className={styles.appointmentProgressHeader}>
                <div><span className={styles.eyebrow}>Appointment progress</span><strong>{selectedProgress === 4 ? "All steps completed" : selectedReminderAction ? `Waiting for Partner to ${selectedReminderAction}` : label(selected.status)}</strong></div>
                <span>{selectedProgress}/4 complete</span>
              </div>
              <ol className={styles.appointmentProgress}>
                {APPOINTMENT_PROGRESS.map((step, index) => {
                  const stepNumber = index + 1;
                  const complete = selectedProgress >= stepNumber;
                  const current = !selectedClosed && selectedProgress + 1 === stepNumber && selectedProgress < 4;
                  return <li key={step.key} data-complete={complete ? "true" : "false"} data-current={current ? "true" : "false"}><span>{complete ? "✓" : stepNumber}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></li>;
                })}
              </ol>
            </div>
            <div className={styles.detailGrid}>
              <div><span className={styles.eyebrow}>Primary patient</span><strong>{selected.customerName}</strong><span>Date of birth · {dateOfBirth(selected.customerDateOfBirth)}</span><span>{selected.customerEmail}</span><span>{selected.customerPhone}</span></div>
              <div><span className={styles.eyebrow}>Appointment</span><strong>{date(selected.startsAt, selected.timezone)}</strong><span>{selected.timezone}</span><span>{selected.address}, {selected.city}, {selected.state} {selected.postalCode}</span><div className={styles.mapActions}><a href={mapUrl("google", [selected.address, selected.city, selected.state, selected.postalCode].filter(Boolean).join(", "))} target="_blank" rel="noopener noreferrer">Google Maps ↗</a><a href={mapUrl("apple", [selected.address, selected.city, selected.state, selected.postalCode].filter(Boolean).join(", "))} target="_blank" rel="noopener noreferrer">Apple Maps ↗</a></div></div>
              <div><span className={styles.eyebrow}>Partner assignment</span><strong>{selected.partnerName || "Unassigned"}</strong><span>{selected.partnerEmail || "Awaiting selection"}</span><span>{label(selected.selectionMode)}</span></div>
              <div><span className={styles.eyebrow}>Payment</span><strong>{money(selected.depositAmount, selected.currency)} deposit</strong><span>{money(selected.servicePrice, selected.currency)} service total</span><span>{label(selected.paymentStatus)}</span></div>
              <div><span className={styles.eyebrow}>Booking source</span><strong>{selected.bookedFromDirectory ? "Partner directory" : "Direct or other source"}</strong><span>{selected.bookedFromDirectory ? "The patient opened this Partner profile in the directory before booking." : "No valid directory attribution was attached to this appointment."}</span>{selected.directoryAttributedAt ? <span>Profile journey started · {date(selected.directoryAttributedAt, selected.timezone)}</span> : null}</div>
              {selected.additionalPatients.length ? <div className={styles.detailFull}><span className={styles.eyebrow}>Additional patients</span><div className={styles.additionalPatientList}>{selected.additionalPatients.map((patient, index) => <div className={styles.additionalPatientDetail} key={`${patient.email}-${index}`}><strong>{patient.fullName}</strong><span>Date of birth · {dateOfBirth(patient.dateOfBirth)}</span><span>{patient.email || "Email not provided"}</span><span>{patient.phone || "Phone not provided"}</span></div>)}</div></div> : null}
              {selected.partnerDeclineReason ? <div className={styles.detailFull}><span className={styles.eyebrow}>Partner decline reason</span><p className={styles.appointmentReason}>{selected.partnerDeclineReason}</p></div> : null}
            </div>
            <div className={styles.adminAppointmentActions}>
              <div className={styles.partnerReminderCard}>
                <div>
                  <span className={styles.eyebrow}>Partner notification</span>
                  <strong>{selectedReminderAction ? `Next required step: ${selectedReminderAction}` : "No Partner action pending"}</strong>
                  <p>{selected.pushDeviceCount > 0
                    ? `${selected.pushDeviceCount} subscribed device${selected.pushDeviceCount === 1 ? "" : "s"}. The push opens this appointment directly in the Partner Portal.`
                    : "This Partner has not enabled appointment alerts on a device yet."}</p>
                  {selected.lastReminderAt ? <small>Last Admin reminder · {date(selected.lastReminderAt, selected.timezone)}</small> : null}
                </div>
                {selectedReminderAction ? <button type="button" className={styles.button} disabled={reminderBusy || selected.pushDeviceCount < 1} onClick={() => void sendReminder(selectedReminderAction)}>{reminderBusy ? "Sending…" : reminderLabel(selectedReminderAction)}</button> : null}
              </div>
              <div>
                <span className={styles.eyebrow}>Admin actions</span>
                <p className={styles.subtle}>Reassign only to an active Partner who covers this location and has no overlapping appointment. Refunds use the internal Stripe payment.</p>
              </div>
              {detailLoading ? <div className={styles.loading}>Checking eligible Partners…</div> : null}
              {!detailLoading && !actionError && ["confirmed", "partner_acknowledged"].includes(selected.status) && !candidates.length ? (
                <div className={styles.resultsEmpty}><strong>0 eligible partners</strong><span>No active coverage matches this appointment.</span></div>
              ) : null}
              {!detailLoading && candidates.length > 0 && ["confirmed", "partner_acknowledged"].includes(selected.status) ? (
                <div className={styles.adminAppointmentActionGrid}>
                  <label className={styles.field}><span>Available Partner</span><select className={styles.select} value={selectedPartnerId} onChange={(event) => setSelectedPartnerId(event.target.value)}><option value="">Choose a Partner…</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name} · {candidate.email}</option>)}</select></label>
                  <label className={styles.field}><span>Reason</span><input className={styles.input} value={actionReason} onChange={(event) => setActionReason(event.target.value)} placeholder="Why is Admin changing this appointment?" /></label>
                  <div className={styles.adminAppointmentActionButtons}><button type="button" className={styles.button} disabled={actionBusy || !selectedPartnerId} onClick={() => void runAction("reassign")}>{actionBusy ? "Working…" : "Reassign appointment"}</button><button type="button" className={styles.dangerButton} disabled={actionBusy} onClick={() => void runAction("refund")}>Refund deposit</button></div>
                </div>
              ) : null}
              {actionError ? <div className={`${styles.empty} ${styles.error}`}>{actionError}</div> : null}
              {actionMessage ? <div className={styles.successNotice}>{actionMessage}</div> : null}
            </div>
          </section>
        ) : null}
      </div>
    </PartnerAdminShell>
  );
}
