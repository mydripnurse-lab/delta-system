"use client";

import { useEffect, useMemo, useState } from "react";

import type { SupportTicket } from "@/lib/partnerSupport";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type SupportAgent = { id: string; name: string; email: string };

export function PartnerSupportAdminClient() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"]>("open");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/support", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to load support inbox.");
      setTickets(payload.tickets || []);
      setAgents(payload.agents || []);
      setSelectedId((current) => current || payload.tickets?.[0]?.id || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load support inbox.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filteredTickets = useMemo(() => tickets.filter((ticket) => {
    const matchesFilter = filter === "all" || ticket.status === filter;
    const term = search.trim().toLowerCase();
    return matchesFilter && (!term || `${ticket.subject} ${ticket.partnerName} ${ticket.partnerEmail}`.toLowerCase().includes(term));
  }), [filter, search, tickets]);
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedId) || filteredTickets[0] || null;

  useEffect(() => {
    if (!selectedTicket) return;
    setStatus(selectedTicket.status);
    setAssignedUserId(selectedTicket.assignedUserId);
  }, [selectedTicket?.id, selectedTicket?.status, selectedTicket?.assignedUserId]);

  async function updateTicket() {
    if (!selectedTicket) return;
    if (!reply.trim() && status === selectedTicket.status && assignedUserId === selectedTicket.assignedUserId) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/support", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticketId: selectedTicket.id, message: reply.trim(), status, assignedUserId }) });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) throw new Error(payload?.error || "Unable to update ticket.");
      setTickets(payload.tickets || []);
      setAgents(payload.agents || []);
      setReply("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update ticket.");
    } finally { setSaving(false); }
  }

  return <div className={styles.supportAdminPage}>
    <header className={styles.moduleHeader}>
      <div><span className={styles.eyebrow}>Partner Support</span><h1>Support inbox</h1><p>Keep every Partner conversation organized, assign ownership and close requests with a complete history.</p></div>
      <div className={styles.supportAdminStats}><span><strong>{tickets.filter((ticket) => ticket.status === "open").length}</strong> open</span><span><strong>{tickets.filter((ticket) => ticket.status === "pending").length}</strong> waiting</span><span><strong>{tickets.length}</strong> total</span></div>
    </header>
    {error ? <div className={styles.noticeError}>{error}</div> : null}
    <section className={styles.supportAdminLayout}>
      <div className={styles.supportAdminListPanel}>
        <div className={styles.supportAdminFilters}><input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets or Partners" /><select className={styles.select} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="open">Open</option><option value="pending">Waiting on Partner</option><option value="closed">Closed</option><option value="all">All tickets</option></select></div>
        {loading ? <p className={styles.emptyState}>Loading support conversations…</p> : null}
        {!loading && !filteredTickets.length ? <p className={styles.emptyState}>No tickets match this view.</p> : null}
        <div className={styles.supportAdminTicketList}>{filteredTickets.map((ticket) => <button type="button" key={ticket.id} className={`${styles.supportAdminTicketRow} ${selectedTicket?.id === ticket.id ? styles.supportAdminTicketRowActive : ""}`} onClick={() => setSelectedId(ticket.id)}><span className={styles.supportAdminAvatar}>{ticket.partnerName.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span><span className={styles.supportAdminTicketCopy}><strong>{ticket.subject}</strong><small>{ticket.partnerName} · {ticket.category}</small><em>{ticket.messages[ticket.messages.length - 1]?.body || "No messages"}</em></span><span className={`${styles.supportAdminStatus} ${styles[`supportAdminStatus_${ticket.status}`]}`}>{ticket.status}</span></button>)}</div>
      </div>
      <div className={styles.supportAdminDetailPanel}>
        {selectedTicket ? <>
          <div className={styles.supportAdminDetailHeader}><div><span className={styles.eyebrow}>{selectedTicket.category} · {selectedTicket.priority} priority</span><h2>{selectedTicket.subject}</h2><p>{selectedTicket.partnerName} · {selectedTicket.partnerEmail}</p></div><span className={`${styles.supportAdminStatus} ${styles[`supportAdminStatus_${selectedTicket.status}`]}`}>{selectedTicket.status}</span></div>
          <div className={styles.supportAdminControls}><label>Status<select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as SupportTicket["status"])}><option value="open">Open</option><option value="pending">Waiting on Partner</option><option value="closed">Closed</option></select></label><label>Assigned to<select className={styles.select} value={assignedUserId || ""} onChange={(event) => setAssignedUserId(event.target.value || null)}><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div>
          <div className={styles.supportAdminMessages}>{selectedTicket.messages.map((message) => <article className={`${styles.supportAdminMessage} ${message.authorType === "admin" ? styles.supportAdminMessageAdmin : ""}`} key={message.id}><div><strong>{message.authorName}</strong><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time></div><p>{message.body}</p></article>)}</div>
          <div className={styles.supportAdminReply}><textarea className={styles.textarea} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to the Partner…" /><div><button type="button" className={styles.button} onClick={() => void updateTicket()} disabled={saving || (!reply.trim() && status === selectedTicket.status && assignedUserId === selectedTicket.assignedUserId)}>{saving ? "Saving…" : "Save & reply"}</button><small>Partners see the reply instantly in their portal.</small></div></div>
        </> : <div className={styles.supportAdminEmpty}><span>✦</span><h2>Select a ticket</h2><p>Choose a conversation to review its history and respond.</p></div>}
      </div>
    </section>
  </div>;
}
