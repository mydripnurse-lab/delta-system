"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import type { AdminBookingContact } from "@/lib/adminBookingContacts";

function date(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(value));
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MD";
}

function sourceLabel(contact: AdminBookingContact) {
  if (contact.appointmentCount) return "Customer";
  if (contact.lostOpportunity) return "Lost opportunity";
  if (contact.source === "demand") return "Demand request";
  return "Appointment intent";
}

export function PartnerAdminContactsClient() {
  const [contacts, setContacts] = useState<AdminBookingContact[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [relationship, setRelationship] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const query = new URLSearchParams({ limit: "500" });
      if (search.trim()) query.set("search", search.trim());
      if (from) query.set("from", from);
      if (to) query.set("to", to);
      if (relationship !== "all") query.set("relationship", relationship);
      const response = await fetch(`/api/partner-admin/contacts?${query}`, { cache: "no-store" });
      if (response.status === 401) {
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load contacts.");
      setContacts(payload.contacts || []);
      setSelectedId((current) => (payload.contacts || []).some((contact: AdminBookingContact) => contact.id === current) ? current : "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load contacts.");
    } finally { setLoading(false); }
  }, [from, relationship, search, to]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 220);
    return () => window.clearTimeout(timer);
  }, [load]);

  const selected = contacts.find((contact) => contact.id === selectedId) || null;
  const stats = useMemo(() => {
    const markets = new Set(contacts.flatMap((contact) => contact.locations.map((location) => `${location.county}|${location.state}`)).filter((value) => value !== "|"));
    return {
      total: contacts.length,
      customers: contacts.filter((contact) => contact.appointmentCount > 0).length,
      repeat: contacts.filter((contact) => contact.appointmentCount > 1).length,
      lost: contacts.filter((contact) => contact.lostOpportunity).length,
      markets: markets.size,
    };
  }, [contacts]);

  return (
    <PartnerAdminShell title="Contacts" actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>}>
      <div className={styles.frame}>
        <section className={styles.moduleHeader}>
          <div><span className={styles.eyebrow}>Customer intelligence</span><h1>Contacts</h1><p>One internal view of every patient, booking lead and demand request collected by My Drip Nurse. Geographic history comes directly from the appointment and request locations.</p></div>
          <div className={styles.moduleSummary}><strong>{stats.total}</strong><span>contacts</span><strong>{stats.customers}</strong><span>customers</span><strong>{stats.lost}</strong><span>lost opportunities</span><strong>{stats.repeat}</strong><span>repeat customers</span><strong>{stats.markets}</strong><span>county markets</span></div>
        </section>

        <section className={`${styles.panel} ${styles.contactsPanel}`}>
          <div className={styles.panelHeader}>
            <div><h2>Contact directory</h2><span className={styles.subtle}>Search leads and customers, then narrow the view by activity date or relationship.</span></div>
            <div className={styles.contactFilters}>
              <label className={styles.filterSearch}><span>Search</span><input className={`${styles.input} ${styles.search}`} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, phone or market" aria-label="Search contacts" /></label>
              <label><span>From</span><input className={styles.input} type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} /></label>
              <label><span>To</span><input className={styles.input} type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} /></label>
              <label><span>Relationship</span><select className={styles.select} value={relationship} onChange={(event) => setRelationship(event.target.value)}><option value="all">All contacts</option><option value="lost">Lost opportunities</option><option value="customer">Customers</option><option value="lead">Appointment intents</option><option value="demand">Demand requests</option></select></label>
              {(search || from || to || relationship !== "all") ? <button type="button" className={styles.filterReset} onClick={() => { setSearch(""); setFrom(""); setTo(""); setRelationship("all"); }}>Clear</button> : null}
            </div>
          </div>
          {error ? <div className={`${styles.empty} ${styles.error}`}>{error}</div> : null}
          {loading ? <div className={styles.loading}>Loading contacts…</div> : null}
          {!loading && !error && !contacts.length ? <div className={styles.resultsEmpty}><strong>0 contacts</strong><span>No contacts match this view.</span></div> : null}
          {!loading && contacts.length ? <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th>Contact</th><th>Market</th><th>Relationship</th><th>Appointments</th><th>Completed value</th><th>Last activity</th><th /></tr></thead>
            <tbody>{contacts.map((contact) => {
              const primary = contact.locations[0];
              return <tr key={contact.id}>
                <td><div className={styles.contactIdentity}><span>{initials(contact.fullName)}</span><div><strong>{contact.fullName}</strong><small>{contact.email || contact.phone}</small></div></div></td>
                <td><strong>{primary?.city || "Unknown city"}</strong><span className={styles.tableSubtle}>{[primary?.county, primary?.state].filter(Boolean).join(", ") || "No market recorded"}</span></td>
                <td><span className={`${styles.badge} ${contact.lostOpportunity ? styles.bad : contact.appointmentCount ? styles.good : styles.warn}`}>{sourceLabel(contact)}</span></td>
                <td><strong>{contact.appointmentCount}</strong><span className={styles.tableSubtle}>{contact.leadIntentCount} intent{contact.leadIntentCount === 1 ? "" : "s"} · {contact.completedCount} completed</span></td>
                <td>{money(contact.lifetimeValue, contact.currency)}</td><td>{date(contact.lastSeenAt)}</td>
                <td><button type="button" className={styles.tableAction} onClick={() => setSelectedId(contact.id)}>View profile</button></td>
              </tr>;
            })}</tbody>
          </table></div> : null}
        </section>
      </div>

      {selected ? <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedId(""); }}>
        <section className={`${styles.profileModal} ${styles.contactModal}`} role="dialog" aria-modal="true" aria-labelledby="contact-profile-title">
          <header className={styles.profileModalHeader}>
            <div className={styles.contactProfileTitle}><span>{initials(selected.fullName)}</span><div><span className={styles.eyebrow}>Contact profile</span><h2 id="contact-profile-title">{selected.fullName}</h2><p>{sourceLabel(selected)} · first seen {date(selected.firstSeenAt)}</p></div></div>
            <button type="button" className={styles.closeButton} onClick={() => setSelectedId("")} aria-label="Close contact profile">×</button>
          </header>
          <div className={styles.profileModalBody}>
            <div className={styles.contactKpis}><div><span>Appointment intents</span><strong>{selected.leadIntentCount}</strong></div><div><span>Appointments</span><strong>{selected.appointmentCount}</strong></div><div><span>Completed</span><strong>{selected.completedCount}</strong></div><div><span>Upcoming</span><strong>{selected.upcomingCount}</strong></div><div><span>Completed value</span><strong>{money(selected.lifetimeValue, selected.currency)}</strong></div></div>
            {selected.lostOpportunity ? <section className={styles.lostOpportunityNote}><strong>Lost opportunity</strong><span>This contact submitted the Single Lead Captured form but did not complete an appointment booking.</span></section> : null}
            <section className={styles.contactDetailSection}><h3>Contact information</h3><div className={styles.contactDetailGrid}><div><span>Email</span><a href={selected.email ? `mailto:${selected.email}` : undefined}>{selected.email || "Not provided"}</a></div><div><span>Phone</span><a href={selected.phone ? `tel:${selected.phone}` : undefined}>{selected.phone || "Not provided"}</a></div><div><span>Date of birth</span><strong>{selected.dateOfBirth || "Not provided"}</strong></div><div><span>Last activity</span><strong>{date(selected.lastSeenAt)}</strong></div></div></section>
            <section className={styles.contactDetailSection}><h3>Geographic history</h3><div className={styles.locationList}>{selected.locations.length ? selected.locations.map((location, index) => <article key={`${location.city}-${location.postalCode}-${index}`}><strong>{[location.city, location.state].filter(Boolean).join(", ")}</strong><span>{[location.county, location.postalCode].filter(Boolean).join(" · ")}</span><small>{location.address || "Area-level request"}</small></article>) : <p>No location has been recorded.</p>}</div></section>
            <section className={styles.contactDetailSection}><h3>Services</h3><div className={styles.contactTags}>{selected.services.length ? selected.services.map((service) => <span key={service}>{service}</span>) : <span>No booked service yet</span>}</div></section>
          </div>
          <footer className={styles.modalFooter}><button type="button" className={styles.secondaryButton} onClick={() => setSelectedId("")}>Close</button>{selected.email ? <a className={styles.button} href={`mailto:${selected.email}`}>Email contact</a> : null}</footer>
        </section>
      </div> : null}
    </PartnerAdminShell>
  );
}
