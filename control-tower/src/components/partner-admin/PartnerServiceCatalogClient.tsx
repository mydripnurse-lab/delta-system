"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import sharedStyles from "@/app/partner-admin/partnerAdmin.module.css";
import catalogStyles from "./serviceCatalog.module.css";
import { PartnerAdminShell } from "@/components/partner-admin/PartnerAdminShell";
import { buildBookingEmbedCode } from "@/lib/bookingEmbedCode";
import type { AdminService, PartnerServiceSuggestion } from "@/lib/myDripNurseServiceCatalog";

const styles = { ...sharedStyles, ...catalogStyles };
const SECTIONS = ["Details", "Pricing", "Booking", "Publishing"] as const;
type Section = typeof SECTIONS[number];

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
  depositValue: 40,
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
  const [section, setSection] = useState<Section>("Details");
  const [statusFilter, setStatusFilter] = useState("all");
  const [baseline, setBaseline] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<string>("");
  const [draft, setDraft] = useState<AdminService | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [embedCopied, setEmbedCopied] = useState(false);
  const [suggestions, setSuggestions] = useState<PartnerServiceSuggestion[]>([]);

  const load = useCallback(async () => {
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
      (statusFilter === "all" || (statusFilter === "active" ? service.isActive : !service.isActive)) &&
      (!query || service.name.toLowerCase().includes(query) || service.slug.toLowerCase().includes(query))
    ));
  }, [search, services, statusFilter]);

  function selectService(service: AdminService) {
    setBaseline(JSON.stringify(service));
    setSection("Details");
    setDraft(cloneService(service));
    setError("");
    setNotice("");
    setEmbedCopied(false);
  }

  function startNewService() {
    setBaseline(JSON.stringify(EMPTY_SERVICE));
    setSection("Details");
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
      service.ingredients = listFromText(service.ingredients.join("\n"));
      service.benefits = listFromText(service.benefits.join("\n"));
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

      const saved = nextServices.find((item) => item.id === savedId);
      if (saved) { setDraft(cloneService(saved)); setBaseline(JSON.stringify(saved)); }
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
    ? `https://care.mydripnurse.com/booking/${draft.calendar.publicKey}`
    : "";
  const embedCode = bookingUrl && draft
    ? buildBookingEmbedCode({ bookingUrl, serviceName: draft.name, slug: draft.slug })
    : "Save the service first to generate its booking embed code.";

  async function copyEmbedCode() {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(embedCode);
      setEmbedCopied(true);
    } catch {
      setError("Could not copy the code. Select the code and copy it manually.");
    }
  }

  const dirty = draft !== null && JSON.stringify(draft) !== baseline;
  const editing = draft !== null;
  useEffect(() => {
    if (editing) headingRef.current?.focus();
  }, [editing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function backToList() {
    if (saving || (dirty && !window.confirm("Discard your unsaved changes and return to services?"))) return;
    setDraft(null);
    setError("");
    setNotice("");
    requestAnimationFrame(() => document.getElementById(returnFocusRef.current || "add-service")?.focus());
  }


  return (
    <PartnerAdminShell title="Services">
      <div className={`${styles.frame} ${styles.workspace}`}>
        {!draft ? <>
          <header className={styles.listHeader}>
            <div><span className={styles.eyebrow}>MY DRIP NURSE · CATALOG</span><h1>Services</h1><p>A thoughtful experience, down to every detail.</p>
              {!loading && <div className={styles.counts}>{services.length} services <span>·</span> {activeCount} active <span>·</span> {readyCount} approved or published</div>}
            </div>
            <button type="button" className={styles.button} disabled={loading || saving} id="add-service" onClick={() => { returnFocusRef.current = "add-service"; startNewService(); }}><span aria-hidden="true">＋</span> Add service</button>
          </header>
        </> : <header className={styles.detailHeader}>
          <div><button type="button" className={styles.backButton} disabled={saving} onClick={backToList}><span aria-hidden="true">←</span> All services</button>
            <h1 ref={headingRef} tabIndex={-1}>{draft.name || "New service"}</h1>
            <p>{draft.id ? "Refine your service, pricing and booking experience." : "Create a service that feels like My Drip Nurse."}</p>
          </div>
          <div className={styles.saveGroup}><span role="status">{saving ? "Saving changes…" : dirty ? "Unsaved changes" : draft.id ? "All changes saved" : "New service"}</span>
            <button type="button" className={styles.button} onClick={() => void save()} disabled={saving || !draft.name.trim() || !draft.slug.trim() || (!!draft.id && !dirty)}>{saving ? "Saving…" : draft.id ? "Save changes" : "Create service"}</button>
          </div>
        </header>}
        {error ? <div className={styles.notice} role="alert">{error}{!draft && <button type="button" className={styles.backButton} onClick={() => void load()}>Try again</button>}</div> : null}
        {notice ? <div className={styles.successNotice} role="status">{notice}</div> : null}
        {!draft ? <section className={styles.listCard} aria-label="Service catalog" aria-busy={loading}>
          <div className={styles.listToolbar}>
            <label className={styles.searchField}><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search services…" aria-label="Search services" /></label>
            <select className={styles.filter} aria-label="Filter by availability" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All services</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
          </div>
          <div className={styles.listColumns} aria-hidden="true"><span>Service</span><span>Price</span><span>Duration (minutes)</span><span>Status</span><span /></div>
          {loading ? <div className={styles.empty} role="status">Loading your services…</div> : filtered.length ? <ul className={styles.serviceList}>{filtered.map((service) => (
            <li key={service.id}><button type="button" className={styles.serviceRow} id={`service-${service.id}`} onClick={(event) => { returnFocusRef.current = event.currentTarget.id; selectService(service); }}>
              <span className={styles.serviceIdentity}><span className={styles.thumbnail}>{service.imageUrl && previewableImage(service.imageUrl) ? <Image src={service.imageUrl} alt="" fill sizes="48px" /> : <span aria-hidden="true">✦</span>}</span><span className={styles.rowName}><strong>{service.name}</strong><small>{service.shortDescription || service.slug}</small></span></span>
              <span className={styles.rowPrice}>{new Intl.NumberFormat("en-US", { style: "currency", currency: service.currency }).format(service.price)}</span>
              <span className={styles.rowDuration}>{service.calendar.durationMinutes} min</span>
              <span className={styles.rowStatus}><span className={service.isActive ? styles.activeBadge : styles.inactiveBadge}>{service.isActive ? "Active" : "Inactive"}</span><small>{service.editorialStatus}</small></span>
              <span className={styles.chevron} aria-hidden="true">↗</span>
            </button></li>
          ))}</ul> : <div className={styles.empty}><strong>{services.length ? "No matching services" : "Your catalog starts here"}</strong><p>{services.length ? "Try another search or availability filter." : "Add your first service to set up its content and calendar."}</p>{services.length > 0 && <button className={styles.secondaryButton} onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</button>}</div>}
          {!loading && <footer className={styles.listFooter}>{filtered.length} of {services.length} services</footer>}
        </section> : <section className={styles.editorCard} aria-label="Service editor">
          <nav className={styles.sectionNav} aria-label="Service sections">{SECTIONS.map((item) => <button type="button" key={item} aria-current={section === item ? "page" : undefined} onClick={() => setSection(item)}>{item}</button>)}</nav>
          <fieldset className={styles.editorFields} disabled={saving}>
            <div className={`${styles.serviceEditorGrid} ${section !== "Details" ? styles.wideEditor : ""}`}>
              <div className={styles.serviceFormStack}>
                    <section hidden={section !== "Details"} className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Identity</span><h3>Service content</h3></div><span>{draft.editorialStatus}</span></div>
                      <div className={styles.serviceFieldGrid}>
                        <label className={styles.formField}><span>Service name</span><input className={styles.input} value={draft.name} onChange={(event) => { const name = event.target.value; update("name", name); if (!draft.id) update("slug", slugify(name)); }} /></label>
                        <label className={styles.formField}><span>Slug</span><input className={styles.input} value={draft.slug} onChange={(event) => update("slug", slugify(event.target.value))} /></label>
                      </div>
                      <label className={styles.formField}><span>Short description</span><textarea className={styles.textarea} value={draft.shortDescription} onChange={(event) => update("shortDescription", event.target.value)} maxLength={500} /></label>
                      <label className={styles.formField}><span>Full description</span><textarea className={styles.textarea} value={draft.fullDescription} onChange={(event) => update("fullDescription", event.target.value)} maxLength={12000} /></label>
                      <div className={styles.serviceFieldGrid}>
                        <label className={styles.formField}><span>Ingredients</span><textarea className={styles.textarea} value={draft.ingredients.join("\n")} onChange={(event) => update("ingredients", event.target.value.split("\n"))} placeholder="One ingredient per line" /></label>
                        <label className={styles.formField}><span>Approved benefits</span><textarea className={styles.textarea} value={draft.benefits.join("\n")} onChange={(event) => update("benefits", event.target.value.split("\n"))} placeholder="One approved benefit per line" /></label>
                      </div>
                    </section>

                    <section hidden={section !== "Pricing"} className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Revenue</span><h3>Price and deposit</h3></div><span>{draft.currency}</span></div>
                      <div className={styles.bulkFields}>
                        <label className={styles.formField}><span>Service price</span><input className={styles.numberInput} type="number" min="0" step="0.01" value={draft.price} onChange={(event) => update("price", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Deposit type</span><select className={styles.select} value={draft.depositType} onChange={(event) => update("depositType", event.target.value as AdminService["depositType"])}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>
                        <label className={styles.formField}><span>{draft.depositType === "percentage" ? "Deposit percentage" : "Deposit amount"}</span><input className={styles.numberInput} type="number" min="0" max={draft.depositType === "percentage" ? 100 : undefined} step={draft.depositType === "percentage" ? 1 : 0.01} value={draft.depositValue} onChange={(event) => update("depositValue", Number(event.target.value))} /></label>
                      </div>
                    </section>

                    <section hidden={section !== "Booking"} className={styles.bulkForm}>
                      <div className={styles.bulkFormHeading}><div><span className={styles.eyebrow}>Own calendar</span><h3>Booking rules</h3></div><span>{draft.calendar.status}</span></div>
                      <label className={styles.formField}><span>Calendar ID</span><input className={styles.input} value={draft.calendar.publicKey} disabled /><small>Your service’s dedicated booking calendar. Created automatically when you save.</small></label>
                      <div className={styles.serviceFieldGridThree}>
                        <label className={styles.formField}><span>Duration (minutes)</span><input className={styles.numberInput} type="number" min="5" value={draft.calendar.durationMinutes} onChange={(event) => updateCalendar("durationMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Slot interval (minutes)</span><input className={styles.numberInput} type="number" min="5" value={draft.calendar.slotIntervalMinutes} onChange={(event) => updateCalendar("slotIntervalMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Buffer after (minutes)</span><input className={styles.numberInput} type="number" min="0" value={draft.calendar.bufferAfterMinutes} onChange={(event) => updateCalendar("bufferAfterMinutes", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Minimum notice (minutes)</span><input className={styles.numberInput} type="number" min="120" step="15" value={draft.calendar.minimumNoticeMinutes} onChange={(event) => updateCalendar("minimumNoticeMinutes", Math.max(120, Number(event.target.value)))} /><small>Every service requires at least 2 hours of notice.</small></label>
                        <label className={styles.formField}><span>Advance window (days)</span><input className={styles.numberInput} type="number" min="1" value={draft.calendar.maximumAdvanceDays} onChange={(event) => updateCalendar("maximumAdvanceDays", Number(event.target.value))} /></label>
                        <label className={styles.formField}><span>Daily capacity</span><input className={styles.numberInput} type="number" min="1" value={draft.calendar.dailyCapacity ?? ""} onChange={(event) => updateCalendar("dailyCapacity", event.target.value ? Number(event.target.value) : null)} placeholder="No limit" /></label>
                      </div>
                    </section>
                  </div>

                  <aside className={styles.serviceAside}>
                    <section hidden={section !== "Details"} className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Service image</span>
                      <div className={styles.serviceImagePreview}>
                        {draft.imageUrl && previewableImage(draft.imageUrl) ? <Image src={draft.imageUrl} alt={draft.imageAlt || draft.name} fill sizes="(max-width: 620px) 100vw, 320px" /> : <span>Add a product image</span>}
                      </div>
                      <label className={styles.formField}><span>Image URL</span><input className={styles.input} value={draft.imageUrl} onChange={(event) => update("imageUrl", event.target.value)} /></label>
                      <label className={styles.formField}><span>Alternative text</span><input className={styles.input} value={draft.imageAlt} onChange={(event) => update("imageAlt", event.target.value)} /></label>
                      <label className={styles.formField}><span>Image title</span><input className={styles.input} value={draft.imageTitle} onChange={(event) => update("imageTitle", event.target.value)} /></label>
                    </section>

                    <section hidden={section !== "Publishing"} className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Page routing</span>
                      <label className={styles.formField}><span>Landing page</span><input className={styles.input} value={draft.landingPageUrl} onChange={(event) => update("landingPageUrl", event.target.value)} /></label>
                      <label className={styles.formField}><span>Survey CTA from Sheet</span><input className={styles.input} value={draft.surveyCtaUrl} onChange={(event) => update("surveyCtaUrl", event.target.value)} /><small>This destination must be checked against the service row before a landing page is generated.</small></label>
                    </section>

                    <section hidden={section !== "Booking"} className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Snapshot embed</span>
                      <h3>Own booking calendar</h3>
                      <p className={styles.helperText}>Copy this responsive calendar embed into the GHL page that follows the service survey. It uses the Admin availability engine, not a GHL calendar. The snippet forwards the survey URL params (name, email, phone and date of birth) into the booking experience.</p>
                      <label className={styles.formField}><span>Booking URL</span><input className={styles.input} value={bookingUrl || "Generated after saving"} readOnly /></label>
                      <label className={styles.formField}><span>Iframe code</span><textarea className={styles.textarea} value={embedCode} readOnly rows={6} /></label>
                      <button type="button" className={styles.secondaryButton} onClick={() => void copyEmbedCode()} disabled={!bookingUrl}>{embedCopied ? "Copied ✓" : "Copy embed code"}</button>
                    </section>

                    <section hidden={section !== "Publishing"} className={styles.serviceMediaCard}>
                      <span className={styles.eyebrow}>Publishing</span>
                      <label className={styles.formField}><span>Editorial status</span><select className={styles.select} value={draft.editorialStatus} onChange={(event) => update("editorialStatus", event.target.value as AdminService["editorialStatus"])}><option value="draft">Draft</option><option value="review">In review</option><option value="approved">Approved</option><option value="published">Published</option><option value="archived">Archived</option></select></label>
                      <label className={styles.formField}><span>Calendar status</span><select className={styles.select} value={draft.calendar.status} onChange={(event) => updateCalendar("status", event.target.value as AdminService["calendar"]["status"])}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label>
                      <label className={styles.checkboxRow}><input type="checkbox" checked={draft.isActive} onChange={(event) => update("isActive", event.target.checked)} /><span>Service is available for partner assignment.</span></label>

                    </section>
                  </aside>
                </div>
          </fieldset>
        </section>}

        {!draft && <details className={styles.suggestions}>
          <summary>Partner suggestions <span>{suggestions.filter((item) => item.status === "pending").length} pending</span></summary>
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
        </details>}
      </div>
    </PartnerAdminShell>
  );
}
