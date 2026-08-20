"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import styles from "@/app/partner-admin/partnerAdmin.module.css";

type AdminBookingCalendar = {
  serviceId: string;
  slug: string;
  name: string;
  shortDescription: string;
  imageUrl: string;
  imageAlt: string;
  price: number;
  currency: string;
  depositType: "percentage" | "fixed";
  depositValue: number;
  calendarId: string;
  publicKey: string;
  calendarStatus: string;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  activePartnerCount: number;
  coverageAreaCount: number;
  partners: Array<{
    id: string;
    applicationId: string;
    displayName: string;
    businessName: string;
    profilePhotoUrl: string;
    websiteStatus: string;
    coverageAreaCount: number;
    priceOverride: number | null;
    activatedAt: string | null;
  }>;
};

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "MD";
}

function displayDeposit(calendar: AdminBookingCalendar) {
  return calendar.depositType === "percentage"
    ? `${calendar.depositValue}% deposit`
    : `${money(calendar.depositValue, calendar.currency)} deposit`;
}

export function PartnerCalendarClient() {
  const [calendars, setCalendars] = useState<AdminBookingCalendar[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [embedCopied, setEmbedCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/calendars", { cache: "no-store" });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json() as { ok?: boolean; calendars?: AdminBookingCalendar[]; error?: string };
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load booking calendars.");
      const next = payload.calendars || [];
      setCalendars(next);
      setSelectedId((current) => next.some((calendar) => calendar.serviceId === current) ? current : next[0]?.serviceId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load booking calendars.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return calendars.filter((calendar) => !query || calendar.name.toLowerCase().includes(query) || calendar.slug.includes(query));
  }, [calendars, search]);

  const selected = useMemo(
    () => calendars.find((calendar) => calendar.serviceId === selectedId) || filtered[0] || calendars[0] || null,
    [calendars, filtered, selectedId],
  );

  const activeServices = calendars.filter((calendar) => calendar.calendarStatus === "active").length;
  const totalPartners = new Set(calendars.flatMap((calendar) => calendar.partners.map((partner) => partner.id))).size;
  const totalAssignments = calendars.reduce((sum, calendar) => sum + calendar.activePartnerCount, 0);
  const bookingUrl = selected?.publicKey.startsWith("mdn-")
    ? `https://care.mydripnurse.com/booking/${selected.publicKey}`
    : "";
  const embedCode = bookingUrl && selected
    ? `<div id="mdn-calendar-${selected.slug}" style="width:min(100%,1200px);margin:0 auto"></div>
<script>
(() => {
  const host = document.getElementById("mdn-calendar-${selected.slug}");
  if (!host) return;
  const bookingUrl = new URL(${JSON.stringify(bookingUrl)});
  bookingUrl.searchParams.set("embed", "1");
  new URLSearchParams(window.location.search).forEach((value, key) => bookingUrl.searchParams.set(key, value));
  bookingUrl.searchParams.set("returnTo", window.location.href);
  const iframe = document.createElement("iframe");
  iframe.src = bookingUrl.toString();
  iframe.title = ${JSON.stringify(`${selected.name} booking calendar`)};
  iframe.loading = "lazy";
  iframe.allow = "payment";
  iframe.scrolling = "no";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = "display:block;width:100%;height:520px;border:0;border-radius:20px;background:#ebf2f9;overflow:hidden";
  host.appendChild(iframe);
  window.addEventListener("message", (event) => {
    if (event.source !== iframe.contentWindow) return;
    if (event.data?.type === "mdn-booking-auth-return" && String(event.data.url || "") === window.location.href) {
      window.location.assign(window.location.href);
      return;
    }
    if (event.data?.type === "mdn-booking-resize") {
      const height = Math.max(420, Math.min(12000, Number(event.data.height) || 0));
      iframe.style.height = Math.ceil(height) + "px";
    }
  });
})();
</script>`
    : "Save this service first to generate its booking embed code.";

  async function copyEmbedCode() {
    if (!bookingUrl) return;
    await navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    window.setTimeout(() => setEmbedCopied(false), 2200);
  }

  return (
    <PartnerAdminShell
      title="Booking calendars"
      actions={<button type="button" className={styles.secondaryButton} onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh calendars"}</button>}
    >
      <div className={styles.frame}>
        <section className={styles.moduleHeader}>
          <div>
            <span className={styles.eyebrow}>Admin-owned booking engine</span>
            <h1>Calendars, connected to Partners.</h1>
            <p>Each service has one calendar managed by My Drip Nurse. This screen shows the Partners currently assigned to receive appointments—no GHL calendar discovery required.</p>
          </div>
          <div className={styles.moduleSummary}>
            <strong>{calendars.length}</strong><span>service calendars</span>
            <strong>{totalPartners}</strong><span>active Partners</span>
            <strong>{totalAssignments}</strong><span>service assignments</span>
            <strong>{activeServices}</strong><span>booking-ready</span>
          </div>
        </section>

        {error ? <div className={styles.notice} role="alert">{error}</div> : null}
        {loading ? <section className={styles.panel}><div className={styles.loading}>Loading Admin booking calendars…</div></section> : null}

        {!loading ? (
          <div className={styles.catalogLayout}>
            <aside className={styles.catalogList}>
              <div className={styles.catalogListHeader}>
                <span className={styles.eyebrow}>Service calendar list</span>
                <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a service" aria-label="Find a booking calendar" />
              </div>
              <div className={styles.catalogItems}>
                {filtered.map((calendar) => (
                  <button key={calendar.serviceId} type="button" className={`${styles.catalogItem} ${selected?.serviceId === calendar.serviceId ? styles.catalogItemActive : ""}`} onClick={() => setSelectedId(calendar.serviceId)}>
                    <span className={styles.calendarGlyph}>▦</span>
                    <span><strong>{calendar.name}</strong><small>{calendar.activePartnerCount} active Partner{calendar.activePartnerCount === 1 ? "" : "s"} · {calendar.calendarStatus}</small></span>
                    <span className={styles.itemChevron}>›</span>
                  </button>
                ))}
                {!filtered.length ? <div className={styles.empty}>No service calendars match this search.</div> : null}
              </div>
            </aside>

            <section className={styles.catalogEditor}>
              {selected ? (
                <>
                  <header className={styles.editorHeader}>
                    <div className={styles.calendarServiceTitle}>
                      <div className={styles.calendarServiceImage}>
                        {selected.imageUrl ? <Image src={selected.imageUrl} alt={selected.imageAlt || selected.name} fill sizes="72px" unoptimized /> : <span>{initials(selected.name)}</span>}
                      </div>
                      <div><span className={styles.eyebrow}>Canonical service calendar</span><h2>{selected.name}</h2><p>{selected.shortDescription || "Service booking managed by the My Drip Nurse availability engine."}</p></div>
                    </div>
                    <span className={`${styles.badge} ${selected.calendarStatus === "active" ? styles.good : styles.warn}`}>{selected.calendarStatus}</span>
                  </header>

                  <div className={styles.calendarSetupStrip}>
                    <div><span>Service price</span><strong>{money(selected.price, selected.currency)}</strong></div>
                    <div><span>Booking deposit</span><strong>{displayDeposit(selected)}</strong></div>
                    <div><span>Minimum notice</span><strong>{Math.max(120, selected.minimumNoticeMinutes) / 60} hours</strong></div>
                    <div><span>Appointment length</span><strong>{selected.durationMinutes} min</strong></div>
                  </div>

                  <section className={styles.editorNotice}>
                    <div><strong>One source of truth</strong><p>Edit price, deposit, image or booking rules from the Services catalog. Partner assignment changes are made from each Partner profile and appear here automatically.</p></div>
                    <Link href="/services" className={styles.secondaryButton}>Open Services catalog →</Link>
                  </section>

                  <section className={styles.serviceMediaCard} aria-labelledby="calendar-embed-title">
                    <div className={styles.bulkFormHeading}>
                      <div><span className={styles.eyebrow}>GHL page embed</span><h3 id="calendar-embed-title">Embed this service calendar</h3></div>
                      <span className={styles.badge}>No GHL calendar</span>
                    </div>
                    <p className={styles.helperText}>Paste this code into the GHL booking page that follows the service survey. It uses this service calendar, checks Partner coverage by the appointment address, and forwards survey URL params such as name, email, phone and date of birth.</p>
                    <label className={styles.formField}><span>Public booking URL</span><input className={styles.input} value={bookingUrl || "Generated after the service calendar is saved"} readOnly /></label>
                    <label className={styles.formField}><span>Embed code</span><textarea className={styles.textarea} value={embedCode} readOnly rows={8} /></label>
                    <button type="button" className={styles.secondaryButton} onClick={() => void copyEmbedCode()} disabled={!bookingUrl}>{embedCopied ? "Copied ✓" : "Copy embed code"}</button>
                  </section>

                  <section className={styles.partnerDirectoryPanel} aria-labelledby="active-partners-title">
                    <div className={styles.partnerDirectoryHeader}>
                      <div><span className={styles.eyebrow}>Assignment directory</span><h3 id="active-partners-title">Partners in this calendar</h3><p>These active Partners can be selected by the availability engine when a patient books this service.</p></div>
                      <span className={styles.partnerCountPill}>{selected.activePartnerCount} active</span>
                    </div>
                    {selected.partners.length ? (
                      <div className={styles.calendarPartnerGrid}>
                        {selected.partners.map((partner) => (
                          <article className={styles.calendarPartnerCard} key={partner.id}>
                            <div className={`${styles.calendarPartnerAvatar} ${partner.profilePhotoUrl ? styles.calendarPartnerAvatarImage : ""}`} style={partner.profilePhotoUrl ? { backgroundImage: `url(${partner.profilePhotoUrl})` } : undefined}>{partner.profilePhotoUrl ? "" : initials(partner.displayName)}</div>
                            <div className={styles.calendarPartnerCopy}><strong>{partner.displayName}</strong><span>{partner.businessName || "My Drip Nurse Partner"}</span><small>{partner.coverageAreaCount} coverage {partner.coverageAreaCount === 1 ? "area" : "areas"}{partner.priceOverride !== null ? ` · ${money(partner.priceOverride, selected.currency)} Partner price` : ""}</small></div>
                            <Link href={`/applications/${partner.applicationId}`} className={styles.textButton}>View profile →</Link>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className={styles.calendarEmptyState}><span className={styles.calendarPanelIcon}>◌</span><div><strong>No active Partners yet</strong><p>Activate this service from a Partner profile to make it available for booking.</p></div></div>
                    )}
                  </section>
                </>
              ) : (
                <div className={styles.empty}>Create a service in the Services catalog to generate its booking calendar.</div>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </PartnerAdminShell>
  );
}
