"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import styles from "@/app/partner-admin/refunds/refunds.module.css";

type RefundRequest = {
  id: string; reference: string; appointmentId: string; appointmentReference: string; serviceName: string;
  appointmentStartsAt: string; appointmentStatus: string; depositAmount: number; currency: string; paymentStatus: string;
  requesterName: string; requesterEmail: string; requesterPhone: string; reasonCode: string; reasonLabel: string; details: string;
  status: string; policyAssessment: string; createdAt: string; resolutionNote: string;
};

const assessmentCopy: Record<string, string> = {
  likely_eligible: "Likely eligible",
  manual_review: "Manual review",
  outside_standard_window: "Outside 24h window",
  already_refunded: "Already refunded",
  no_payment: "No paid deposit",
  not_eligible: "Not eligible",
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(amount || 0);
}

export function PartnerAdminRefundRequestsClient() {
  const [items, setItems] = useState<RefundRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("open");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const filtered = useMemo(
    () => items.filter((item) => status === "all" || (status === "open" && ["submitted", "under_review", "approved"].includes(item.status)) || item.status === status),
    [items, status],
  );
  const selected = useMemo(
    () => filtered.find((item) => item.id === selectedId) || filtered[0] || null,
    [filtered, selectedId],
  );

  const load = useCallback(async () => {
    const response = await fetch("/api/partner-admin/refund-requests", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load refund requests.");
    setItems(payload.requests || []);
    setSelectedId((current) => current || payload.requests?.[0]?.id || "");
  }, []);

  useEffect(() => { void load().catch((error) => setMessage(error.message)); }, [load]);
  useEffect(() => { setNote(selected?.resolutionNote || ""); }, [selected?.id, selected?.resolutionNote]);

  async function act(action: "review" | "decline" | "approve") {
    if (!selected) return;
    if (action === "approve" && !window.confirm(`Approve ${selected.reference} and refund ${money(selected.depositAmount, selected.currency)} to the original payment method?`)) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/partner-admin/refund-requests", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ requestId: selected.id, action, note }) });
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not update this request.");
      setMessage(action === "approve" ? "Refund sent to the original payment method." : action === "decline" ? "Request closed with the recorded policy reason." : "Request marked for review.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PartnerAdminShell title="Refund requests">
      <section className={styles.hero}><div><p>Payment operations</p><h1>Refund requests</h1><span>Review policy eligibility, preserve the audit trail, and return approved deposits through Stripe.</span></div><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="open">Open requests</option><option value="submitted">Submitted</option><option value="under_review">Under review</option><option value="completed">Completed</option><option value="declined">Not approved</option><option value="all">All requests</option></select></section>
      <section className={styles.workspace}>
        <div className={styles.list}>
          {filtered.length ? filtered.map((item) => <button key={item.id} type="button" className={selected?.id === item.id ? styles.active : ""} onClick={() => setSelectedId(item.id)}><span><b>{item.reference}</b><small>{item.requesterName} · {item.serviceName}</small></span><span><strong>{money(item.depositAmount, item.currency)}</strong><small>{assessmentCopy[item.policyAssessment] || item.policyAssessment}</small></span></button>) : <div className={styles.empty}>No refund requests in this view.</div>}
        </div>
        {selected ? <article className={styles.detail}>
          <header><div><p>{selected.reference}</p><h2>{selected.serviceName}</h2><span>{selected.appointmentReference} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selected.appointmentStartsAt))}</span></div><b>{assessmentCopy[selected.policyAssessment] || selected.policyAssessment}</b></header>
          <div className={styles.facts}><div><span>Customer</span><strong>{selected.requesterName}</strong><small>{selected.requesterEmail}<br />{selected.requesterPhone}</small></div><div><span>Deposit</span><strong>{money(selected.depositAmount, selected.currency)}</strong><small>{selected.paymentStatus}</small></div><div><span>Request status</span><strong>{selected.status.replaceAll("_", " ")}</strong><small>Appointment: {selected.appointmentStatus.replaceAll("_", " ")}</small></div></div>
          <section className={styles.reason}><span>Customer reason</span><h3>{selected.reasonLabel}</h3><p>{selected.details || "No additional details provided."}</p></section>
          <label><span>Internal decision note</span><textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Record the policy basis and any payment verification." rows={4} /></label>
          <div className={styles.actions}><button type="button" disabled={busy || !["submitted", "under_review"].includes(selected.status)} onClick={() => void act("review")}>Mark under review</button><button type="button" disabled={busy || !note.trim() || !["submitted", "under_review", "approved"].includes(selected.status)} onClick={() => void act("decline")}>Not approved</button><button type="button" className={styles.approve} disabled={busy || !note.trim() || ["duplicate_charge", "incorrect_charge"].includes(selected.reasonCode) || !["submitted", "under_review", "approved"].includes(selected.status) || !["paid", "partially_refunded"].includes(selected.paymentStatus)} onClick={() => void act("approve")}>{busy ? "Processing…" : "Approve & refund"}</button></div>
          {message ? <p className={styles.message}>{message}</p> : null}
        </article> : null}
      </section>
    </PartnerAdminShell>
  );
}
