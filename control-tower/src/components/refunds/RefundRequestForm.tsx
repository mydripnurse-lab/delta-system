"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { RefundRequestContext } from "@/lib/appointmentRefundRequests";
import { REFUND_REASON_OPTIONS } from "@/lib/refundRequestPolicy";
import styles from "@/app/refund-request/refundRequest.module.css";

type Receipt = {
  reference: string;
  appointmentReference: string;
  status: "submitted";
  policyAssessment: string;
  assessmentHeadline: string;
  assessmentExplanation: string;
  policyUrl: string;
  createdAt: string;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount || 0);
}

function appointmentDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: timezone || "America/New_York",
  }).format(new Date(value));
}

function statusLabel(status: string) {
  return ({
    submitted: "Submitted",
    under_review: "Under review",
    approved: "Approved",
    declined: "Not approved",
    completed: "Refund processed",
    cancelled: "Closed",
  } as Record<string, string>)[status] || status.replaceAll("_", " ");
}

export default function RefundRequestForm({ initialContext, embedded }: { initialContext: RefundRequestContext; embedded: boolean }) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState(initialContext);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState(
    initialContext.appointments.find((item) => !item.request && item.paymentStatus !== "refunded")?.id || "",
  );
  const [reasonCode, setReasonCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [returnTo, setReturnTo] = useState("");
  const selected = useMemo(
    () => context.appointments.find((item) => item.id === selectedAppointmentId) || null,
    [context.appointments, selectedAppointmentId],
  );

  useEffect(() => {
    if (embedded && document.referrer) setReturnTo(document.referrer);
  }, [embedded]);

  useEffect(() => {
    if (!embedded || !shellRef.current) return;
    const publishHeight = () => window.parent.postMessage({ type: "mdn-refund-resize", height: Math.ceil(shellRef.current?.scrollHeight || document.documentElement.scrollHeight) }, "*");
    publishHeight();
    const observer = new ResizeObserver(publishHeight);
    observer.observe(shellRef.current);
    window.addEventListener("load", publishHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("load", publishHeight);
    };
  }, [embedded, context, receipt, error]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/public/refund-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          appointmentId: selectedAppointmentId,
          appointmentReference: data.get("appointmentReference"),
          email: data.get("email"),
          phone: data.get("phone"),
          reasonCode: data.get("reasonCode"),
          details: data.get("details"),
          sourceUrl: embedded ? document.referrer || window.location.href : window.location.href,
        }),
      });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; result?: Receipt };
      if (!response.ok || !payload.result) throw new Error(payload.error || "We could not submit this request.");
      setReceipt(payload.result);
      const refreshed = await fetch("/api/public/refund-requests", { cache: "no-store" }).then((item) => item.json()).catch(() => null);
      if (refreshed?.ok) setContext(refreshed);
      shellRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not submit this request.");
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <div ref={shellRef} className={`${styles.experience} ${embedded ? styles.embedded : ""}`}>
        <section className={styles.receipt} aria-live="polite">
          <div className={styles.receiptMark} aria-hidden="true">✓</div>
          <p className={styles.eyebrow}>Request received</p>
          <h1>{receipt.assessmentHeadline}</h1>
          <p className={styles.receiptLead}>{receipt.assessmentExplanation}</p>
          <div className={styles.receiptGrid}>
            <div><span>Request</span><strong>{receipt.reference}</strong></div>
            <div><span>Appointment</span><strong>{receipt.appointmentReference}</strong></div>
            <div><span>Status</span><strong>Under review</strong></div>
          </div>
          <div className={styles.policyNotice}>
            <strong>No action is needed right now.</strong>
            <p>This submission does not guarantee approval. We will verify the appointment and payment, then contact you using the booking email. Approved refunds return to the original payment method. If you requested a cancellation, the appointment remains scheduled until we confirm it.</p>
          </div>
          <a className={styles.secondaryButton} href={receipt.policyUrl} target="_blank" rel="noreferrer">Read the Appointment &amp; Deposit Policy ↗</a>
        </section>
      </div>
    );
  }

  return (
    <div ref={shellRef} className={`${styles.experience} ${embedded ? styles.embedded : ""}`}>
      {!embedded ? (
        <header className={styles.header}>
          <Link href="/" aria-label="My Drip Nurse Care home"><img src="/mdn-logo.png" alt="My Drip Nurse" /></Link>
          <a href="https://policy.mydripnurse.com" target="_blank" rel="noreferrer">Deposit policy</a>
        </header>
      ) : null}

      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Appointment support</p>
          <h1>Request a deposit refund.</h1>
          <p>Choose the appointment, tell us what happened, and receive a clear policy-based receipt. Every request is verified before money moves.</p>
        </div>
        <div className={styles.policyPill}><span>24h</span><p><strong>Standard cancellation window</strong><small>Exceptional circumstances are reviewed individually.</small></p></div>
      </section>

      <form className={styles.form} onSubmit={submit}>
        <section className={styles.step}>
          <div className={styles.stepHeading}><span>01</span><div><h2>Find your appointment</h2><p>We only show the details needed to process this request.</p></div></div>

          {context.authenticated ? (
            <div className={styles.connectedBlock}>
              <div className={styles.connectedLine}><span className={styles.connectedCheck}>✓</span><p><strong>Care account connected</strong><small>{context.account?.fullName} · {context.account?.email}</small></p></div>
              {context.appointments.length ? (
                <div className={styles.appointmentList} role="radiogroup" aria-label="Choose appointment">
                  {context.appointments.map((appointment) => {
                    const disabled = Boolean(appointment.request) || appointment.paymentStatus === "refunded";
                    return (
                      <label key={appointment.id} className={`${styles.appointmentCard} ${selectedAppointmentId === appointment.id ? styles.appointmentSelected : ""} ${disabled ? styles.appointmentDisabled : ""}`}>
                        <input type="radio" name="appointmentId" value={appointment.id} checked={selectedAppointmentId === appointment.id} disabled={disabled} onChange={() => setSelectedAppointmentId(appointment.id)} />
                        <span className={styles.serviceImage}><img src={appointment.serviceImageUrl} alt="" /></span>
                        <span className={styles.appointmentCopy}>
                          <strong>{appointment.serviceName}</strong>
                          <small>{appointmentDate(appointment.startsAt, appointment.timezone)}</small>
                          <small>{appointment.reference} · Deposit {money(appointment.depositAmount, appointment.currency)}</small>
                        </span>
                        <span className={styles.appointmentState}>{appointment.request ? statusLabel(appointment.request.status) : appointment.paymentStatus === "refunded" ? "Refunded" : "Select"}</span>
                      </label>
                    );
                  })}
                </div>
              ) : <div className={styles.emptyState}><strong>No paid appointments are connected yet.</strong><p>Use the manual option below if you booked with another email.</p></div>}
              <details className={styles.manualDetails} open={!selectedAppointmentId}>
                <summary onClick={() => setSelectedAppointmentId("")}>Use a different booking reference</summary>
                <div className={styles.fieldGrid}>
                  <label><span>Appointment reference</span><input name="appointmentReference" placeholder="MDN-..." required={!selectedAppointmentId} /></label>
                  <label><span>Booking email</span><input name="email" type="email" placeholder="you@example.com" required={!selectedAppointmentId} /></label>
                  <label><span>Booking phone</span><input name="phone" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" required={!selectedAppointmentId} /></label>
                </div>
              </details>
            </div>
          ) : (
            <div className={styles.guestBlock}>
              <div className={styles.signInCard}>
                <p><strong>Already use My Drip Nurse Care?</strong><small>Sign in to securely choose from your appointments.</small></p>
                <a href={`/login?next=/refund-request${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ""}`} target={embedded ? "_top" : undefined}>Sign in</a>
              </div>
              <div className={styles.orDivider}><span>or locate one booking</span></div>
              <div className={styles.fieldGrid}>
                <label><span>Appointment reference</span><input name="appointmentReference" placeholder="MDN-..." required /></label>
                <label><span>Booking email</span><input name="email" type="email" placeholder="you@example.com" required /></label>
                <label><span>Booking phone</span><input name="phone" inputMode="tel" autoComplete="tel" placeholder="(555) 123-4567" required /></label>
              </div>
            </div>
          )}
        </section>

        <section className={styles.step}>
          <div className={styles.stepHeading}><span>02</span><div><h2>Tell us what happened</h2><p>Choose the closest reason. Avoid including medical details.</p></div></div>
          <div className={styles.reasonLayout}>
            <label className={styles.fullField}><span>Reason for the request</span><select name="reasonCode" value={reasonCode} onChange={(event) => setReasonCode(event.target.value)} required><option value="">Choose one</option>{REFUND_REASON_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className={styles.fullField}><span>Anything else we need to verify? <small>Optional</small></span><textarea name="details" maxLength={1000} rows={4} placeholder="Share only billing or scheduling details relevant to this request. Do not include diagnoses or medical history." /></label>
          </div>
          {reasonCode ? (
            <div className={styles.livePolicyNote}>
              <span>Policy check</span>
              <p>{reasonCode === "cancel_24_hours" ? "The system will compare the submission time with the scheduled visit and apply the 24-hour rule." : reasonCode === "exceptional_circumstance" ? "Exceptional circumstances always receive individual review." : "Our team will verify this reason against the appointment and payment record."}</p>
            </div>
          ) : null}
        </section>

        <section className={styles.reviewBar}>
          <label className={styles.acknowledgement}><input type="checkbox" required /><span>I confirm these details are accurate and understand this is a request—not an automatic approval. Review follows the <a href="https://policy.mydripnurse.com" target="_blank" rel="noreferrer">Appointment &amp; Deposit Policy</a>.</span></label>
          {selected ? <div className={styles.reviewAmount}><span>Deposit under review</span><strong>{money(Math.max(selected.depositAmount - selected.refundedAmount, 0), selected.currency)}</strong></div> : null}
          <button className={styles.submitButton} type="submit" disabled={busy}>{busy ? "Submitting securely…" : "Submit refund request →"}</button>
        </section>
        {error ? <p className={styles.error} role="alert">{error}</p> : null}
      </form>
    </div>
  );
}
