"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import type { AdminService, PartnerServiceSuggestion } from "@/lib/myDripNurseServiceCatalog";

type CatalogResponse = {
  ok: boolean;
  services?: AdminService[];
  suggestions?: PartnerServiceSuggestion[];
  serviceId?: string;
  error?: string;
};

const EMPTY_SERVICE: AdminService = {
  id: "",
  slug: "",
  name: "",
  shortDescription: "",
  fullDescription: "",
  ingredients: [],
  benefits: [],
  medicalDisclaimer: "",
  price: 0,
  currency: "USD",
  depositType: "percentage",
  depositValue: 35,
  imageUrl: "",
  imageAlt: "",
  imageTitle: "",
  landingPageUrl: "",
  surveyCtaUrl: "",
  editorialStatus: "draft",
  isActive: true,
  updatedAt: "",
  calendar: {
    id: "",
    publicKey: "Created automatically after saving",
    status: "draft",
    durationMinutes: 60,
    slotIntervalMinutes: 30,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    minimumNoticeMinutes: 120,
    maximumAdvanceDays: 60,
    dailyCapacity: null,
  },
};

function redirectOnUnauthorized(response: Response) {
  if (response.status !== 401) return false;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  return true;
}

function cloneService(service: AdminService) {
  return structuredClone(service);
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function listFromText(value: string) {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}

function previewableImage(url: string) {
  return /^https:\/\/(?:assets\.cdn\.filesafe\.space|storage\.googleapis\.com)\//i.test(url);
}

export function PartnerServiceCatalogClient() {
  const [services, setServices] = useState<AdminService[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<AdminService | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [embedCopied, setEmbedCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<PartnerServiceSuggestion[]>([]);

  const load = useCallback(async (preferredId = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/partner-admin/services", { cache: "no-store" });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json() as CatalogResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not load services.");
      const nextServices = payload.services || [];
      setServices(nextServices);
      setSuggestions(payload.suggestions || []);
      const nextId = preferredId || nextServices[0]?.id || "";
      setSelectedId(nextId);
      const selected = nextServices.find((service) => service.id === nextId) || nextServices[0];
      setDraft(selected ? cloneService(selected) : null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load services.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return services.filter((service) => (
      !query || service.name.toLowerCase().includes(query) || service.slug.includes(query)
    ));
  }, [search, services]);

  function selectService(service: AdminService) {
    setSelectedId(service.id);
    setDraft(cloneService(service));
    setError("");
    setNotice("");
    setEmbedCopied(false);
  }

  function startNewService() {
    setSelectedId("");
    setDraft(cloneService(EMPTY_SERVICE));
    setError("");
    setNotice("");
    setEmbedCopied(false);
  }

  function update<K extends keyof AdminService>(key: K, value: AdminService[K]) {
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function updateCalendar<K extends keyof AdminService["calendar"]>(key: K, value: AdminService["calendar"][K]) {
    setDraft((current) => current ? { ...current, calendar: { ...current.calendar, [key]: value } } : current);
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const { id, updatedAt, ...service } = draft;
      void updatedAt;
      const response = await fetch("/api/partner-admin/services", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(id ? { serviceId: id, service } : service),
      });
      if (redirectOnUnauthorized(response)) return;
      const payload = await response.json() as CatalogResponse;
      if (!response.ok || !payload.ok) throw new Error(payload.error || "Could not save the service.");
      const nextServices = payload.services || [];
      const savedId = id || payload.serviceId || "";
      setServices(nextServices);
      setSelectedId(savedId);
      const saved = nextServices.find((item) => item.id === savedId);
      if (saved) setDraft(cloneService(saved));
      setNotice(id ? "Service and calendar settings saved." : "Service and its calendar were created.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the service.");
    } finally {
      setSaving(false);
    }
  }

  const activeCount = services.filter((service) => service.isActive).length;
  const readyCount = services.filter((service) => ["approved", "published"].includes(service.editorialStatus)).length;
  const bookingUrl = draft?.id && draft.calendar.publicKey.startsWith("mdn-")
    ? `https://partners.mydripnurse.com/booking/${draft.calendar.publicKey}`
    : "";
  const embedCode = bookingUrl && draft
    ? `<div id="mdn-calendar-${draft.slug}" style="width:100%"></div>
<script>
(() => {
  const host = document.getElementById("mdn-calendar-${draft.slug}");
  if (!host) return;
  const bookingUrl = new URL(${JSON.stringify(bookingUrl)});
  bookingUrl.searchParams.set("embed", "1");
  new URLSearchParams(window.location.search).forEach((value, key) => bookingUrl.searchParams.set(key, value));
  const iframe = document.createElement("iframe");
  iframe.src = bookingUrl.toString();
  iframe.title = ${JSON.stringify(`${draft.name} booking calendar`)};
  iframe.loading = "lazy";
  iframe.allow = "payment";
  iframe.referrerPolicy = "strict-origin-when-cross-origin";
  iframe.style.cssText = "display:block;width:100%;min-height:1180px;border:0;border-radius:20px;background:#edf8fa";
  host.appendChild(iframe);
})();
</script>`
    : "Save the service first to generate its booking embed code.";

  async function copyEmbedCode() {
    if (!bookingUrl) return;
    await navigator.clipboard.writeText(embedCode);
    setEmbedCopied(true);
    window.setTimeout(() => setEmbedCopied(false), 2200);
  }

  return (
    <PartnerAdminShell
      title="Services"
      actions={<button type="button" className={styles.secondaryButton} onClick={startNewService}>New service</button>}
    >
      <div className={styles.frame}>
        <section className={styles.moduleHeader}>
          <div>
            <span className={styles.eyebrow}>Single source of truth</span>
            <h1>Services & booking setup</h1>
            <p>Manage the facts, price, image and dedicated calendar used by every My Drip Nurse landing page and booking experience.</p>
          </div>
          <div className={styles.moduleSummary}>
            <strong>{services.length}</strong><span>services</span>
            <strong>{activeCount}</strong><span>active</span>
            <strong>{readyCount}</strong><span>approved or published</span>
          </div>
        </section>

        {error ? <div className={styles.notice} role="alert">{error}</div> : null}
        {notice ? <div className={styles.successNotice} role="status">{notice}</div> : null}

        <div className={styles.catalogLayout}>
          <aside className={styles.catalogList}>
            <div className={styles.catalogListHeader}>
              <span className={styles.eyebrow}>Service catalog</span>
              <input className={styles.input} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a service" aria-label="Find a service" />
            </div>
            <div className={styles.catalogItems}>
              {loading ? <div className={styles.loading}>Loading services…</div> : null}
              {filtered.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className={`${styles.catalogItem} ${selectedId === service.id ? styles.catalogItemActive : ""}`}
                  onClick={() => selectService(service)}
                >
                  <span className={styles.calendarGlyph}>✦</span>
                  <span><strong>{service.name}</strong><small>${service.price.toLocaleString("en-US")} · {service.editorialStatus}</small></span>
                  <span className={styles.itemChevron}>›</span>
                </button>
              ))}
            </div>
          </aside>

          <section className={styles.catalogEditor}>
            {draft ? (
              <>
                <header className={styles.editorHeader}>
                  <div><span className={styles.eyebrow}>{draft.id ? "Service record" : "New service"}</span><h2>{draft.name || "Untitled service"}</h2></div>
                  <span className={`${styles.badge} ${draft.isActive ? styles.good : styles.warn}`}>{draft.isActive ? "Active" : "Inactive"}</span>
                </header>

                <div className={styles.serviceEditorGrid}>
                  <div className={styles.serviceFormStack}>
                    <section className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Identity</span><h3>Service content</h3></div><span>{draft.editorialStatus}</span></div>
                      <div className={styles.serviceFieldGrid}>
                        <label className={styles.formField}><span>Service name</span><input className={styles.input} value={draft.name} onChange={(event) => { const name = event.target.value; update("name", name); if (!draft.id) update("slug", slugify(name)); }} /></label>
                        <label className={styles.formField}><span>Slug</span><input className={styles.input} value={draft.slug} onChange={(event) => update("slug", slugify(event.target.value))} /></label>
                      </div>
                      <label className={styles.formField}><span>Short description</span><textarea className={styles.textarea} value={draft.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} maxLength={500} /></label>
                      <label className={styles.formField}><span>Full description</span><textarea className={styles.textarea} value={draft.fullDescription} onChange={(event) => update("fullDescription", event.target.value)} maxLength={12000} /></label>
                      <div className={styles.serviceFieldGrid}>
                        <label className={styles.formField}><span>Ingredients</span><textarea className={styles.textarea} value={draft.ingredients.join("\n")} onChange={(event) => update("ingredients", listFromText(event.target.value))} placeholder="One ingredient per line" /></label>
                        <label className={styles.formField}><span>Approved benefits</span><textarea className={styles.textarea} value={draft.benefits.join("\n")} onChange={(event) => update("benefits", listFromText(event.target.value))} placeholder="One approved benefit per line" /></label>
                      </div>
                    </section>

                    <section className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Revenue</span><h3>Price and deposit</h3></div><span>{draft.currency}</span></div>
                      <div className={styles.bulkFields}>
                        <label className={styles.formField}><span>Service price</span><input className={styles.numberInput} type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Deposit type</span><select className={styles.select} value={draft.depositType} onChange={(event) => update("depositType", event.target.value as AdminService["depositType"])}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
                        <label className={styles.formField}><span>{draft.depositType === "percentage" ? "Deposit percentage" : "Deposit amount"}</span><input className={styles.numberInput} type="number" min="0" max={draft.depositType === "percentage" ? 100 : undefined} step={draft.depositType === "percentage" ? 1 : 0.01} value={draft.depositValue} onChange={(event) => update("depositValue", Number(event.target.value))} /></label>
                      </div>
                    </section>

                    <section className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Own calendar</span><h3>Booking rules</h3></div><span>{draft.calendar.status}</span></div>
                      <label className={styles.formField}><span>Calendar ID</span><input className={styles.input} value={draft.calendar.publicKey} disabled /><small>Generated from the service. Booking pages will use this ID explicitly and will not infer the service from the URL.</small></label>
                      <div className={styles.serviceFieldGridThree}>
                        <label className={styles.formField}><span>Duration</span><input className={styles.numberInput} type="number" min="5" value={draft.calendar.durationMinutes} onChange={(event) => updateCalendar("durationMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Slot interval</span><input className={styles.numberInput} type="number" min="5" value={draft.calendar.slotIntervalMinutes} onChange={(event) => updateCalendar("slotIntervalMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Buffer after</span><input className={styles.numberInput} type="number" min="0" value={draft.calendar.bufferAfterMinutes} onChange={(event) => updateCalendar("bufferAfterMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Minimum notice</span><input className={styles.numberInput} type="number" min="120" step="15" value={draft.calendar.minimumNoticeMinutes} onChange={(event) => updateCalendar("minimumNoticeMinutes", Math.max(120, Number(event.target.value)))} /><small>Every service requires at least 2 hours of notice.</small></label>
                        <label className={styles.formField}><span>Advance window</span><input className={styles.numberInput} type="number" min="1" value={draft.calendar.maximumAdvanceDays} onChange={(event) => updateCalendar("maximumAdvanceDays", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Daily capacity</span><input className={styles.numberInput} type="number" min="1" value={draft.calendar.dailyCapacity ?? ""} onChange={(event) => updateCalendar("dailyCapacity", event.target.value ? Number(event.target.value) : null)} placeholder="No limit" /></label>
                      </div>
                    </section>
                  </div>

                  <aside className={styles.serviceAside}>
                    <section className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Service image</span>
                      <div className={styles.serviceImagePreview}>
                        {draft.imageUrl && previewableImage(draft.imageUrl) ? <Image src={draft.imageUrl} alt={draft.imageAlt || draft.name} fill sizes="(max-width: 620px) 100vw, 320px" /> : <span>Upload pipeline pending</span>}
                      </div>
                      <label className={styles.formField}><span>Image URL</span><input className={styles.input} value={draft.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} /></label>
                      <label className={styles.formField}><span>Image alt</span><input className={styles.input} value={draft.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} /></label>
                      <label className={styles.formField}><span>Image title</span><input className={styles.input} value={draft.imageTitle} onChange={(event) => update("imageTitle", event.target.value)} /></label>
                    </section>

                    <section className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Page routing</span>
                      <label className={styles.formField}><span>Landing page</span><input className={styles.input} value={draft.landingPageUrl} onChange={(event) => update("landingPageUrl", event.target.value)} /></label>
                      <label className={styles.formField}><span>Survey CTA from Sheet</span><input className={styles.input} value={draft.surveyCtaUrl} onChange={(event) => update("surveyCtaUrl", event.target.value)} /><small>This destination must be checked against the service row before a landing page is generated.</small></label>
                    </section>

                    <section className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Snapshot embed</span>
                      <h3>Own booking calendar</h3>
                      <p className={styles.helperText}>Copy this responsive calendar embed into the GHL page that follows the service survey. It uses the Admin availability engine, not a GHL calendar. The snippet forwards the survey URL params (name, email, phone and date of birth) into the booking experience.</p>
                      <label className={styles.formField}><span>Booking URL</span><input className={styles.input} value={bookingUrl || "Generated after saving"} readOnly /></label>
                      <label className={styles.formField}><span>Iframe code</span><textarea className={styles.textarea} value={embedCode} readOnly rows={6} /></label>
                      <button type="button" className={styles.secondaryButton} onClick={() => void copyEmbedCode()} disabled={!bookingUrl}>{embedCopied ? "Copied ✓" : "Copy embed code"}</button>
                    </section>

                    <section className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Publishing</span>
                      <label className={styles.formField}><span>Editorial status</span><select className={styles.select} value={draft.editorialStatus} onChange={(event) => update("editorialStatus", event.target.value as AdminService["editorialStatus"])}><option value="draft">Draft</option><option value="review">In review</option><option value="approved">Approved</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
                      <label className={styles.formField}><span>Calendar status</span><select className={styles.select} value={draft.calendar.status} onChange={(event) => updateCalendar("status", event.target.value as AdminService["calendar"]["status"])}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
                      <label className={styles.checkboxRow}><input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} /><span>Service is available for partner assignment.</span></label>
                      <button type="button" className={styles.button} onClick={() => void save()} disabled={saving || !draft.name.trim() || !draft.slug.trim()}>{saving ? "Saving…" : draft.id ? "Save service" : "Create service & calendar"}</button>
                    </section>
                  </aside>
                </div>
              </>
            ) : !loading ? <div className={styles.loading}>Create the first service to continue.</div> : null}
          </section>
        </div>

        <section className={styles.partnerSuggestionsPanel} aria-labelledby="partner-suggestions-title">
          <div className={styles.partnerSuggestionsHeader}>
            <div><span className={styles.eyebrow}>Partner feedback</span><h2 id="partner-suggestions-title">Suggested services & recipes</h2><p>Ideas submitted from Partner Portals for the My Drip Nurse team to review.</p></div>
            <strong>{suggestions.filter((suggestion) => suggestion.status === "pending").length} pending</strong>
          </div>
          {suggestions.length ? <div className={styles.partnerSuggestionsList}>{suggestions.map((suggestion) => <article className={styles.partnerSuggestionCard} key={suggestion.id}>
            <div className={styles.partnerSuggestionTop}><span className={styles.partnerSuggestionType}>{suggestion.type}</span><span className={`${styles.badge} ${suggestion.status === "pending" ? styles.warn : styles.good}`}>{suggestion.status}</span></div>
            <h3>{suggestion.name}</h3>
            <p>{suggestion.details || "No additional details provided."}</p>
            {suggestion.ingredients.length ? <div className={styles.partnerSuggestionIngredients}>{suggestion.ingredients.map((ingredient) => <span key={ingredient}>{ingredient}</span>)}</div> : null}
            <small>Submitted by {suggestion.partnerName} · {suggestion.partnerEmail} · {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(suggestion.createdAt))}</small>
          </article>)}</div> : <div className={styles.loading}>No service suggestions yet.</div>}
        </section>
      </div>
    </PartnerAdminShell>
  );
}
