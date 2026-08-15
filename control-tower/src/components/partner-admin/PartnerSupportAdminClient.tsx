"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { SupportTicket } from "@/lib/partnerSupport";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type SupportAgent = { id: string; name: string; email: string };

const FILTERS = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "pending", label: "Waiting" },
  { value: "closed", label: "Closed" },
] as const;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "MD";
}

function ticketDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusLabel(value: SupportTicket["status"]) {
  if (value === "pending") return "Waiting";
  return value[0].toUpperCase() + value.slice(1);
}

export function PartnerSupportAdminClient() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [agents, setAgents] = useState<SupportAgent[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState<SupportTicket["status"]>("open");
  const [assignedUserId, setAssignedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const detailPanelRef = useRef<HTMLElement | null>(null);

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
  const selectedTicket = filteredTickets.find((ticket) => ticket.id === selectedId) || filteredTickets[0] || null;
  const openCount = tickets.filter((ticket) => ticket.status === "open").length;
  const pendingCount = tickets.filter((ticket) => ticket.status === "pending").length;
  const unassignedCount = tickets.filter((ticket) => ticket.status !== "closed" && !ticket.assignedUserId).length;

  useEffect(() => {
    if (!selectedTicket) return;
    setStatus(selectedTicket.status);
    setAssignedUserId(selectedTicket.assignedUserId);
  }, [selectedTicket]);

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

  function selectTicket(ticketId: string) {
    setSelectedId(ticketId);
    if (window.innerWidth <= 900) {
      window.requestAnimationFrame(() => detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }

  return <div className={styles.supportAdminPage}>
    <header className={`${styles.moduleHeader} ${styles.supportAdminHero}`}>
      <div><span className={styles.eyebrow}>Partner operations</span><h1>Support inbox</h1><p>Review every Partner request, keep ownership clear, and respond from one organized workspace.</p></div>
      <button type="button" className={styles.supportRefreshButton} onClick={() => void load()} disabled={loading}><span aria-hidden="true">↻</span>{loading ? "Refreshing…" : "Refresh inbox"}</button>
    </header>

    <section className={styles.supportAdminStats} aria-label="Support inbox summary">
      <article><span className={styles.supportStatIcon}>↗</span><div><small>Needs response</small><strong>{openCount}</strong><p>Open Partner requests</p></div></article>
      <article><span className={styles.supportStatIcon}>◷</span><div><small>Waiting</small><strong>{pendingCount}</strong><p>Pending Partner reply</p></div></article>
      <article><span className={styles.supportStatIcon}>○</span><div><small>Unassigned</small><strong>{unassignedCount}</strong><p>Needs an owner</p></div></article>
      <article><span className={styles.supportStatIcon}>✓</span><div><small>All tickets</small><strong>{tickets.length}</strong><p>Complete support history</p></div></article>
    </section>

    {error ? <div className={styles.noticeError}>{error}</div> : null}

    <section className={styles.supportAdminLayout}>
      <aside className={styles.supportAdminListPanel} aria-label="Support tickets">
        <div className={styles.supportAdminListHeader}><div><span className={styles.eyebrow}>Inbox</span><h2>All tickets</h2></div><span>{filteredTickets.length} shown</span></div>
        <div className={styles.supportAdminFilters}>
          <label className={styles.supportSearch}><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Partner, subject or email" aria-label="Search support tickets" /></label>
          <div className={styles.supportFilterTabs} role="group" aria-label="Filter tickets by status">{FILTERS.map((item) => <button type="button" key={item.value} className={filter === item.value ? styles.supportFilterActive : ""} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span>{item.value === "all" ? tickets.length : tickets.filter((ticket) => ticket.status === item.value).length}</span></button>)}</div>
        </div>
        {loading ? <div className={styles.supportAdminLoading}><span /><span /><span /></div> : null}
        {!loading && !filteredTickets.length ? <div className={styles.supportAdminListEmpty}><span>✓</span><strong>No tickets found</strong><p>Try another search or status filter.</p></div> : null}
        <div className={styles.supportAdminTicketList}>{filteredTickets.map((ticket) => {
          const lastMessage = ticket.messages[ticket.messages.length - 1];
          return <button type="button" key={ticket.id} className={`${styles.supportAdminTicketRow} ${selectedTicket?.id === ticket.id ? styles.supportAdminTicketRowActive : ""}`} onClick={() => selectTicket(ticket.id)} aria-label={`Open ticket: ${ticket.subject}`}>
            <span className={styles.supportAdminAvatar}>{initials(ticket.partnerName)}</span>
            <span className={styles.supportAdminTicketCopy}>
              <span className={styles.supportAdminTicketTitle}><strong>{ticket.subject}</strong>{ticket.priority === "urgent" || ticket.priority === "high" ? <b>{ticket.priority}</b> : null}</span>
              <small>{ticket.partnerName} · {ticket.category}</small>
              <em>{lastMessage?.body || "No messages"}</em>
              <span className={styles.supportAdminTicketMeta}><time>{ticketDate(ticket.lastMessageAt)}</time><span>{ticket.assignedUserName || "Unassigned"}</span></span>
            </span>
            <span className={styles.supportAdminTicketState}><span className={`${styles.supportAdminStatus} ${styles[`supportAdminStatus_${ticket.status}`]}`}>{statusLabel(ticket.status)}</span><b aria-hidden="true">›</b></span>
          </button>;
        })}</div>
      </aside>

      <section ref={detailPanelRef} className={styles.supportAdminDetailPanel} aria-label="Ticket conversation">
        {selectedTicket ? <>
          <div className={styles.supportAdminDetailHeader}>
            <div><span className={styles.eyebrow}>{selectedTicket.category} · Ticket {selectedTicket.id.slice(0, 8)}</span><h2>{selectedTicket.subject}</h2><p><strong>{selectedTicket.partnerName}</strong><a href={`mailto:${selectedTicket.partnerEmail}`}>{selectedTicket.partnerEmail}</a></p></div>
            <span className={`${styles.supportAdminStatus} ${styles[`supportAdminStatus_${selectedTicket.status}`]}`}>{statusLabel(selectedTicket.status)}</span>
          </div>
          <div className={styles.supportAdminContext}>
            <div><small>Priority</small><strong className={styles[`supportPriority_${selectedTicket.priority}`]}>{selectedTicket.priority}</strong></div>
            <div><small>Created</small><strong>{ticketDate(selectedTicket.createdAt)}</strong></div>
            <div><small>Owner</small><strong>{selectedTicket.assignedUserName || "Unassigned"}</strong></div>
          </div>
          <div className={styles.supportAdminControls}><label>Status<select className={styles.select} value={status} onChange={(event) => setStatus(event.target.value as SupportTicket["status"])}><option value="open">Open</option><option value="pending">Waiting on Partner</option><option value="closed">Closed</option></select></label><label>Assigned to<select className={styles.select} value={assignedUserId || ""} onChange={(event) => setAssignedUserId(event.target.value || null)}><option value="">Unassigned</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label></div>
          <div className={styles.supportAdminConversationHeading}><div><span className={styles.eyebrow}>Conversation</span><strong>{selectedTicket.messages.length} message{selectedTicket.messages.length === 1 ? "" : "s"}</strong></div><span>Updated {ticketDate(selectedTicket.lastMessageAt)}</span></div>
          <div className={styles.supportAdminMessages}>{selectedTicket.messages.map((message) => <article className={`${styles.supportAdminMessage} ${message.authorType === "admin" ? styles.supportAdminMessageAdmin : message.authorType === "system" ? styles.supportAdminMessageSystem : ""}`} key={message.id}><div><strong>{message.authorName}</strong><time>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(message.createdAt))}</time></div><p>{message.body}</p></article>)}</div>
          <div className={styles.supportAdminReply}><label><span>Reply to {selectedTicket.partnerName}</span><textarea className={styles.textarea} rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a clear, helpful response…" maxLength={5000} /></label><div><button type="button" className={styles.button} onClick={() => void updateTicket()} disabled={saving || (!reply.trim() && status === selectedTicket.status && assignedUserId === selectedTicket.assignedUserId)}>{saving ? "Saving…" : reply.trim() ? "Send reply" : "Save changes"}</button><small>Replies appear immediately in the Partner Portal.</small></div></div>
        </> : <div className={styles.supportAdminEmpty}><span>✦</span><h2>Select a ticket</h2><p>Choose a conversation to review its complete history and respond.</p></div>}
      </section>
    </section>
  </div>;
}
