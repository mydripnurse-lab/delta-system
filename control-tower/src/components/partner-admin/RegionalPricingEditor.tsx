"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyRegionalPrice, isPricingDescendant, resolveRegionalPrice, type DescendantPricePolicy, type PricingRegion, type RegionalPrice, type PricingLevel } from "@/lib/regionalPricing";
import styles from "./serviceCatalog.module.css";

type Snapshot = { syncedAt: string; regions: PricingRegion[]; warnings: string[] };
export function RegionalPricingEditor({ active, rules, basePrice, currency, onChange }: {
  active: boolean; rules: RegionalPrice[]; basePrice: number; currency: string; onChange: (rules: RegionalPrice[]) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ syncedAt: "", regions: [], warnings: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<PricingLevel>("state");
  const [state, setState] = useState("");
  const [county, setCounty] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [amount, setAmount] = useState("");
  const [descendantPolicy, setDescendantPolicy] = useState<DescendantPricePolicy>("preserve");
  const [draftNotice, setDraftNotice] = useState("");
  const loaded = useRef(false);
  const editingRef = useRef<HTMLInputElement>(null);
  const money = (price: number) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
  async function load(sync = false) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/partner-admin/services/regions", { method: sync ? "POST" : "GET", cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Could not load locations.");
      setSnapshot(data);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load locations."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    if (active && !loaded.current) { loaded.current = true; void load(); }
  }, [active]);
  const states = useMemo(() => [...new Set(snapshot.regions.filter(region => region.active !== false).map(region => region.state))].sort(), [snapshot.regions]);
  const counties = useMemo(() => [...new Set(snapshot.regions.filter(region => region.active !== false && region.state === state && region.county).map(region => region.county))].sort(), [snapshot.regions, state]);
  const options = useMemo(() => snapshot.regions.filter(region => region.active !== false && region.level === level && region.state === state && (level !== "city" || region.county === county)), [snapshot.regions, level, state, county]);
  const selected = snapshot.regions.find(region => region.id === selectedId);
  const descendants = selected ? rules.filter(rule => isPricingDescendant(selected, rule.region)) : [];
  const existing = rules.find(rule => rule.region.id === selectedId);
  const inherited = selected ? resolveRegionalPrice(basePrice, rules.filter(rule => rule.region.id !== selected.id), selected) : null;
  const effective = selected ? resolveRegionalPrice(basePrice, rules, selected) : null;
  const validAmount = amount.trim() !== "" && Number.isFinite(Number(amount)) && Number(amount) >= 0 && Number(amount) <= 1_000_000 && Math.abs(Number(amount) * 100 - Math.round(Number(amount) * 100)) < 0.00001;
  function choose(id: string) {
    setDescendantPolicy("preserve"); setDraftNotice("");
    setSelectedId(id);
    const rule = rules.find(item => item.region.id === id);
    setAmount(rule ? String(rule.price) : "");
  }
  function edit(rule: RegionalPrice) {
    setLevel(rule.region.level); setState(rule.region.state); setCounty(rule.region.county); choose(rule.region.id);
    editingRef.current?.focus();
  }
  function apply() {
    if (!selected || !validAmount) return;
    onChange(applyRegionalPrice(rules, selected, Number(amount), descendantPolicy));
    setDraftNotice(`${selected.label}: ${money(Number(amount))} added to the draft. ${descendants.length ? `${descendants.length} lower-level exception${descendants.length === 1 ? "" : "s"} ${descendantPolicy === "inherit" ? "removed so those locations inherit this price" : "kept unchanged"}. ` : ""}Save changes to publish.`);
    setDescendantPolicy("preserve");
  }
  const activeIds = new Set(snapshot.regions.filter(region => region.active !== false).map(region => region.id));
  return <div className={styles.regionalPricing}>
    <div className={styles.regionalHeading}><div><span className={styles.eyebrow}>Location exceptions</span><h3>Regional pricing</h3><p>One default price. A different price only where you choose.</p></div><button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void load(true)}>{loading ? "Loading locations…" : "Sync locations"}</button></div>
    <div className={styles.pricingHierarchy}><span>City / municipality</span><span aria-hidden="true">→</span><span>County / parish</span><span aria-hidden="true">→</span><span>State / territory</span><span aria-hidden="true">→</span><strong>Default</strong></div>
    <p className={styles.helperText}>An existing professional-specific price takes priority at booking. Tips are separate and collected by the professional.</p>
    {error ? <p role="alert" className={styles.regionalError}>{error} <button type="button" className={styles.backButton} onClick={() => void load()}>Retry</button></p> : null}
    {!snapshot.syncedAt ? <div className={styles.regionEmpty}><strong>Connect your active locations</strong><p>Sync the project’s location catalog with its configured Google Sheet to enable regional prices. Your default price continues to apply.</p></div> : <p className={styles.helperText}>{snapshot.regions.filter(region => region.active !== false).length.toLocaleString()} active locations · Last synced {new Date(snapshot.syncedAt).toLocaleString("en-US")}.</p>}
    {snapshot.warnings.map(warning => <p className={styles.helperText} key={warning}>{warning}</p>)}
    {snapshot.regions.length > 0 ? <div className={styles.regionComposer}>
      <div className={styles.serviceFieldGrid}>
        <label className={styles.formField}><span>Region level</span><select className={styles.select} value={level} onChange={event => { setLevel(event.target.value as PricingLevel); choose(""); }}><option value="state">State / territory</option><option value="county">County / parish</option><option value="city">City / municipality</option></select></label>
        <label className={styles.formField}><span>State / territory</span><select className={styles.select} value={state} onChange={event => { setState(event.target.value); setCounty(""); choose(""); }}><option value="">Choose a state</option>{states.map(name => <option key={name}>{name}</option>)}</select></label>
        {level === "city" && state !== "Puerto Rico" ? <label className={styles.formField}><span>{state === "Louisiana" ? "Parish" : "County"}</span><select className={styles.select} value={county} onChange={event => { setCounty(event.target.value); choose(""); }}><option value="">Choose a region</option>{counties.map(name => <option key={name}>{name}</option>)}</select></label> : null}
        <label className={styles.formField}><span>Location</span><select className={styles.select} value={selectedId} onChange={event => choose(event.target.value)}><option value="">Choose a location</option>{options.map(region => <option value={region.id} key={region.id}>{region.label}</option>)}</select></label>
        <label className={styles.formField}><span>Regional price ({currency})</span><input ref={editingRef} className={styles.numberInput} type="number" min="0" max="1000000" step="0.01" value={amount} placeholder={inherited ? String(inherited.price) : "0.00"} onChange={event => { setAmount(event.target.value); setDraftNotice(""); }} /></label>
      </div>
      {selected && effective && inherited ? <div className={styles.pricePreview} aria-live="polite"><div><span>Current price for this location</span><strong>{money(effective.price)}</strong><small>{effective.source} · Without this exception: {money(inherited.price)} from {inherited.source}</small></div>{selected.urls[0] ? <a href={selected.urls[0]} target="_blank" rel="noreferrer">View location ↗</a> : <small>No state landing URL confirmed.</small>}</div> : null}
      {selected && selected.level !== "city" ? <fieldset className={styles.inheritanceOptions}>
        <legend>Prices within {selected.label}</legend>
        <p>Locations without their own exception inherit this price automatically, including cities within counties, parishes and municipalities.</p>
        {descendants.length ? <>
          <label className={styles.inheritanceChoice}><input type="radio" name="descendant-price-policy" checked={descendantPolicy === "preserve"} onChange={() => { setDescendantPolicy("preserve"); setDraftNotice(""); }} /><span><strong>Keep existing exceptions</strong><small>Recommended · Preserve {descendants.length} lower-level price{descendants.length === 1 ? "" : "s"}.</small></span></label>
          <label className={styles.inheritanceChoice}><input type="radio" name="descendant-price-policy" checked={descendantPolicy === "inherit"} onChange={() => { setDescendantPolicy("inherit"); setDraftNotice(""); }} /><span><strong>Use this price for every location below</strong><small>Remove {descendants.length} lower-level exception{descendants.length === 1 ? "" : "s"} so those locations inherit this price, including future changes.</small></span></label>
          <details className={styles.inheritanceDetails}><summary>Review {descendants.length} {descendants.length === 1 ? "exception" : "exceptions"} to {descendantPolicy === "inherit" ? "replace" : "keep"}</summary><ul>{descendants.map(rule => <li key={rule.region.id}><span>{rule.region.label}</span><strong>{money(rule.price)}{descendantPolicy === "inherit" && validAmount ? ` → ${money(Number(amount))}` : ""}</strong></li>)}</ul></details>
        </> : <p>No lower-level exceptions. All locations below will inherit this price.</p>}
      </fieldset> : null}
      <div className={styles.regionActions}><span className={styles.helperText}>Changes take effect when you save the service. Public pages may take up to 6 minutes to refresh.</span><button type="button" className={styles.button} disabled={!selected || !validAmount || loading} onClick={apply}>{existing ? "Update regional price" : "Add regional price"}</button></div>
      {draftNotice ? <p role="status" className={styles.helperText}>{draftNotice}</p> : null}
    </div> : null}
    {rules.length ? <ul className={styles.regionList}>{rules.map(rule => <li key={rule.region.id}><div><strong>{rule.region.label}</strong><small>{rule.region.level === "city" && rule.region.state === "Puerto Rico" ? "Municipality" : rule.region.level}{snapshot.syncedAt && !activeIds.has(rule.region.id) ? " · Not in the latest active catalog; review before saving" : ""}</small></div><strong>{money(rule.price)}</strong><div><button type="button" className={styles.backButton} disabled={!activeIds.has(rule.region.id)} onClick={() => edit(rule)} aria-label={`Edit price for ${rule.region.label}`}>Edit</button><button type="button" className={styles.backButton} onClick={() => onChange(rules.filter(item => item.region.id !== rule.region.id))} aria-label={`Use inherited price for ${rule.region.label}`}>Use inherited price</button></div></li>)}</ul> : <p className={styles.helperText}>No exceptions yet. All locations use the default price.</p>}
  </div>;
}
