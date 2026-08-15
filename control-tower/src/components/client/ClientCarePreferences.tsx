"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { ClientAccount } from "@/lib/clientPortalAuth";
import type { ClientProfileSectionId } from "@/lib/clientProfileSections";

import portalStyles from "@/app/client-portal/clientPortal.module.css";
import styles from "./clientCarePreferences.module.css";

const SCREENING_OPTIONS = [
  ["chf", "Congestive heart failure (CHF)"], ["hemophilia", "Hemophilia"], ["kidney-failure", "Kidney/renal failure or chronic kidney disease"],
  ["dialysis", "Currently on dialysis"], ["pah", "Pulmonary arterial hypertension (PAH)"], ["uncontrolled-bleeding", "History of uncontrolled bleeding"],
  ["consent-impairment", "An impairment that prevents independent medical consent"], ["fluid-buildup", "Current fluid buildup in feet, legs or abdomen"],
  ["diuretic", "Medication for fluid retention (diuretic)"], ["none", "None of these apply to me"],
] as const;

type Suggestion = { id: string; label: string; addressLine1: string; city: string; county: string; state: string; postalCode: string; countryCode: string };

function SectionHeader({
  id,
  number,
  title,
  description,
  status,
  activeSection,
  onToggle,
}: {
  id: ClientProfileSectionId;
  number: string;
  title: string;
  description: string;
  status: string;
  activeSection: ClientProfileSectionId | null;
  onToggle: (section: ClientProfileSectionId) => void;
}) {
  const open = activeSection === id;
  return <button
    type="button"
    className={portalStyles.profileAccordionTrigger}
    aria-expanded={open}
    aria-controls={`profile-section-${id}`}
    onClick={() => onToggle(id)}
  >
    <span className={portalStyles.profileAccordionNumber}>{number}</span>
    <span className={portalStyles.profileAccordionTitle}><b>{title}</b><small>{description}</small></span>
    <span className={portalStyles.profileAccordionStatus}>{status}</span>
    <span className={`${portalStyles.profileAccordionChevron} ${open ? portalStyles.profileAccordionChevronOpen : ""}`} aria-hidden="true">⌄</span>
  </button>;
}

export default function ClientCarePreferences({
  account,
  nextPath = "",
  activeSection,
  onToggle,
}: {
  account: ClientAccount;
  nextPath?: string;
  activeSection: ClientProfileSectionId | null;
  onToggle: (section: ClientProfileSectionId) => void;
}) {
  const router = useRouter();
  const [screening, setScreening] = useState<string[]>(account.screeningSelections);
  const [screeningMessage, setScreeningMessage] = useState("");
  const [screeningBusy, setScreeningBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("Home");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [addressMessage, setAddressMessage] = useState("");
  const [addressBusy, setAddressBusy] = useState(false);

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    const query = addressLine1.trim();
    if (!adding || !token || query.length < 4 || selected) { setSuggestions([]); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?autocomplete=true&limit=5&types=address&country=us,pr&language=en&access_token=${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal });
        const payload = await response.json() as { features?: Array<{ id?: string; address?: string; text?: string; place_name?: string; context?: Array<{ id?: string; text?: string; short_code?: string }> }> };
        const next = (payload.features || []).flatMap((feature): Suggestion[] => {
          const context = feature.context || [];
          const find = (prefixes: string[]) => context.find((item) => prefixes.some((prefix) => item.id?.startsWith(prefix)));
          const line1 = [feature.address, feature.text].filter(Boolean).join(" ");
          if (!feature.id || !line1) return [];
          return [{ id: feature.id, label: feature.place_name || line1, addressLine1: line1, city: find(["place", "locality", "municipality"])?.text || "", county: find(["district", "county"])?.text || "", state: find(["region"])?.text || "", postalCode: find(["postcode"])?.text || "", countryCode: (find(["country"])?.short_code || "US").toUpperCase() }];
        });
        setSuggestions(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]);
      } finally { setSearching(false); }
    }, 280);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [adding, addressLine1, selected]);

  async function saveScreening() {
    setScreeningMessage("");
    setScreeningBusy(true);
    try {
      const response = await fetch("/api/client-account/profile", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "medical_screening", screeningSelections: screening }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Your safety profile could not be saved.");
      setScreeningMessage("Safety answers saved. We will still ask you to confirm them for every new visit.");
      router.refresh();
    } catch (error) { setScreeningMessage(error instanceof Error ? error.message : "Your safety profile could not be saved."); }
    finally { setScreeningBusy(false); }
  }

  function chooseAddress(item: Suggestion) {
    setSelected(item);
    setAddressLine1(item.addressLine1);
    setSuggestions([]);
    setAddressMessage("");
  }

  async function addAddress() {
    if (!selected) { setAddressMessage("Choose the complete address from the verified suggestions."); return; }
    setAddressBusy(true); setAddressMessage("");
    try {
      const response = await fetch("/api/client-account/addresses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ label, addressLine1: selected.addressLine1, addressLine2, city: selected.city, state: selected.state, postalCode: selected.postalCode, countryCode: selected.countryCode, addressFeatureId: selected.id, isDefault: account.addresses.length === 0 }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The address could not be saved.");
      setAdding(false); setAddressLine1(""); setAddressLine2(""); setSelected(null); setSuggestions([]); setAddressMessage("Address saved securely.");
      if (nextPath) router.push(nextPath);
      else router.refresh();
    } catch (error) { setAddressMessage(error instanceof Error ? error.message : "The address could not be saved."); }
    finally { setAddressBusy(false); }
  }

  async function updateAddress(id: string, operation: "default" | "delete") {
    setAddressBusy(true); setAddressMessage("");
    try {
      const response = await fetch("/api/client-account/addresses", { method: operation === "delete" ? "DELETE" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(operation === "delete" ? { id } : { id, isDefault: true }) });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "The address could not be updated.");
      router.refresh();
    } catch (error) { setAddressMessage(error instanceof Error ? error.message : "The address could not be updated."); }
    finally { setAddressBusy(false); }
  }

  return <div className={portalStyles.profileAccordionGroup}>
    <article className={`${portalStyles.profileAccordionItem} ${activeSection === "address" ? portalStyles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="address" number="04" title="Address" description="Verified locations where care can come to you" status={account.addresses.length ? `${account.addresses.length} saved` : "Add address"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "address" ? <div id="profile-section-address" className={portalStyles.profileAccordionPanel}>
        <div className={portalStyles.profileAccordionIntro}>
          <div><b>Saved care locations</b><p>Keep more than one verified address and choose the right one whenever you book.</p></div>
          <button type="button" onClick={() => setAdding((value) => !value)}>{adding ? "Cancel" : "+ Add address"}</button>
        </div>
        <div className={styles.addressGrid}>{account.addresses.map((address) => <article key={address.id} className={address.isDefault ? styles.defaultAddress : ""}><div><small>{address.label}{address.isDefault ? " · Preferred" : ""}</small><strong>{address.addressLine1}{address.addressLine2 ? `, ${address.addressLine2}` : ""}</strong><p>{address.city}, {address.state} {address.postalCode}<br />{address.county}</p></div><div>{!address.isDefault ? <button type="button" disabled={addressBusy} onClick={() => void updateAddress(address.id, "default")}>Make preferred</button> : null}<button type="button" disabled={addressBusy} onClick={() => void updateAddress(address.id, "delete")}>Remove</button></div></article>)}</div>
        {!account.addresses.length && !adding ? <div className={styles.empty}>No saved addresses yet. You can still enter one during booking.</div> : null}
        {adding ? <div className={styles.addForm}>
          <label>Label<select value={label} onChange={(event) => setLabel(event.target.value)}><option>Home</option><option>Work</option><option>Family</option><option>Other</option></select></label>
          <div className={styles.fieldGroup}>
            <label htmlFor="client-address-search">Street address</label>
            <div className={styles.search}>
              <input
                id="client-address-search"
                value={addressLine1}
                onChange={(event) => { setAddressLine1(event.target.value); setSelected(null); setAddressMessage(""); }}
                placeholder="Start typing a complete address"
                autoComplete="street-address"
                aria-autocomplete="list"
                aria-expanded={suggestions.length > 0}
                aria-controls="client-address-suggestions"
              />
              {searching ? <i>Searching…</i> : null}
              {suggestions.length ? <div id="client-address-suggestions" className={styles.suggestionList} role="listbox" aria-label="Verified address suggestions">
                {suggestions.map((item) => <button
                  type="button"
                  key={item.id}
                  role="option"
                  aria-selected={selected?.id === item.id}
                  onPointerDown={(event) => { event.preventDefault(); chooseAddress(item); }}
                  onClick={() => chooseAddress(item)}
                >
                  <strong>{item.addressLine1}</strong>
                  <small>{item.label.replace(`${item.addressLine1}, `, "")}</small>
                </button>)}
              </div> : null}
              {selected ? <div className={styles.verifiedSelection} role="status">
                <span aria-hidden="true">✓</span>
                <div><strong>Verified address</strong><small>{selected.label}</small></div>
              </div> : null}
            </div>
          </div>
          <label>Apartment or suite <small>Optional</small><input value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} /></label>
          <button className={styles.saveAddressButton} type="button" disabled={addressBusy || !selected} onClick={() => void addAddress()}>{addressBusy ? "Saving…" : "Save verified address"}</button>
        </div> : null}
        {addressMessage ? <p className={styles.message} role="status">{addressMessage}</p> : null}
      </div> : null}
    </article>

    <article className={`${portalStyles.profileAccordionItem} ${activeSection === "screening" ? portalStyles.profileAccordionItemOpen : ""}`}>
      <SectionHeader id="screening" number="05" title="Medical Screening" description="Safety questions reviewed for every appointment" status={screening.length ? "Saved" : "For appointments"} activeSection={activeSection} onToggle={onToggle} />
      {activeSection === "screening" ? <div id="profile-section-screening" className={portalStyles.profileAccordionPanel}>
        <div className={portalStyles.profileAccordionAppointmentNote}>
          <span aria-hidden="true">✦</span>
          <div><b>Used for appointment safety</b><p>Save your usual answers here. You will review and confirm them again before every appointment.</p></div>
        </div>
        <div className={styles.screening}>
          {SCREENING_OPTIONS.map(([id, text]) => {
            const checked = screening.includes(id);
            return <label key={id}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => setScreening((current) => id === "none"
                  ? (checked ? [] : ["none"])
                  : checked
                    ? current.filter((value) => value !== id)
                    : [...current.filter((value) => value !== "none"), id])}
              />
              <span>{text}</span>
            </label>;
          })}
        </div>
        <div className={styles.saveRow}><p role="status">{screeningMessage}</p><button type="button" disabled={screeningBusy || !screening.length} onClick={() => void saveScreening()}>{screeningBusy ? "Saving…" : "Save screening answers"}</button></div>
      </div> : null}
    </article>
  </div>;
}
