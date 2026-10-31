"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyRegionalPrices, isPricingDescendant, resolveRegionalPrice, type DescendantPricePolicy, type PricingRegion, type RegionalPrice, type PricingLevel } from "@/lib/regionalPricing";
import { RegionalLocationPicker } from "./RegionalLocationPicker";
import styles from "./serviceCatalog.module.css";

type Snapshot = { syncedAt: string; regions: PricingRegion[]; warnings: string[] };
export function RegionalPricingEditor({ active, rules, basePrice, currency, onChange, clinicMode = false }: {
  clinicMode?: boolean; active: boolean; rules: RegionalPrice[]; basePrice: number; currency: string; onChange: (rules: RegionalPrice[]) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot>({ syncedAt: "", regions: [], warnings: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [level, setLevel] = useState<PricingLevel>("state");
  const [state, setState] = useState("");
  const [countyFilters, setCountyFilters] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [pickerRevision, setPickerRevision] = useState(0);
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
  const regionIndex = useMemo(() => new Map(snapshot.regions.map(region => [region.id, region])), [snapshot.regions]);
  const counties = useMemo(() => [...new Set(snapshot.regions.filter(region => region.active !== false && region.level === "city" && region.state === state && region.county).map(region => region.county))].sort().map(county => ({ id: county, label: county })), [snapshot.regions, state]);
  const options = useMemo(() => snapshot.regions.filter(region => region.active !== false && region.level === level && region.state === state && (level !== "city" || !countyFilters.length || countyFilters.includes(region.county))).sort((a, b) => a.label.localeCompare(b.label)).map(region => ({ id: region.id, label: region.city || region.county || region.label, detail: region.level === "city" ? [region.county, region.state].filter(Boolean).join(" · ") : region.state })), [snapshot.regions, level, state, countyFilters]);
  const selectedRegions = useMemo(() => selectedIds.map(id => regionIndex.get(id)).filter((region): region is PricingRegion => !!region && region.active !== false && region.level === level && region.state === state), [selectedIds, regionIndex, level, state]);
  const selected = selectedRegions.length === 1 ? selectedRegions[0] : undefined;
  const descendants = useMemo(() => rules.filter(rule => selectedRegions.some(parent => isPricingDescendant(parent, rule.region))), [rules, selectedRegions]);
  const existing = selected ? rules.find(rule => rule.region.id === selected.id) : undefined;
  const inherited = selected ? resolveRegionalPrice(basePrice, rules.filter(rule => rule.region.id !== selected.id), selected) : null;
  const effective = selected ? resolveRegionalPrice(basePrice, rules, selected) : null;
  const validAmount = amount.trim() !== "" && Number.isFinite(Number(amount)) && Number(amount) >= 0 && Number(amount) <= 1_000_000 && Math.abs(Number(amount) * 100 - Math.round(Number(amount) * 100)) < 0.00001;
  const nextRules = useMemo(() => applyRegionalPrices(rules, selectedRegions, Number(amount), descendantPolicy), [rules, selectedRegions, amount, descendantPolicy]);
  const overLimit = nextRules.length > 500;
  const areaTitle = state === "Puerto Rico" ? "Municipalities" : level === "city" ? "Cities" : state === "Louisiana" ? "Parishes" : "Counties";
  function changeSelection(ids: string[]) {
    setDescendantPolicy("preserve"); setDraftNotice("");
    setSelectedIds(ids);
  }
  function choose(id: string) {
    changeSelection(id ? [id] : []);
    const rule = rules.find(item => item.region.id === id);
    setAmount(rule ? String(rule.price) : "");
  }
  function changeScope(nextLevel: PricingLevel, nextState: string) {
    setLevel(nextLevel); setState(nextState); setCountyFilters([]);
    choose(nextLevel === "state" ? snapshot.regions.find(region => region.active !== false && region.level === "state" && region.state === nextState)?.id || "" : "");
  }
  function edit(rule: RegionalPrice) {
    setLevel(rule.region.level); setState(rule.region.state); setCountyFilters([]); choose(rule.region.id);
    setPickerRevision(value => value + 1);
    editingRef.current?.focus();
  }
  function apply() {
    if (!selectedRegions.length || !validAmount || overLimit || loading) return;
    onChange(nextRules);
    setDraftNotice(`${selected ? selected.label : `${selectedRegions.length} locations`}: ${money(Number(amount))} added to the draft. ${descendants.length ? `${descendants.length} lower-level exception${descendants.length === 1 ? "" : "s"} ${descendantPolicy === "inherit" ? "removed so those locations inherit this price" : "kept unchanged"}. ` : ""}Save changes to publish.`);
    setDescendantPolicy("preserve");
  }
  const activeIds = new Set(snapshot.regions.filter(region => region.active !== false).map(region => region.id));
  return <div className={styles.regionalPricing}>
    <div className={styles.regionalHeading}><div><span className={styles.eyebrow}>Location exceptions</span><h3>Regional pricing</h3><p>One default price. A different price only where you choose.</p></div><button type="button" className={styles.secondaryButton} disabled={loading} onClick={() => void load(true)}>{loading ? "Loading locations…" : "Sync locations"}</button></div>
    <div className={styles.pricingHierarchy}><span>City / municipality</span><span aria-hidden="true">→</span><span>County / parish</span><span aria-hidden="true">→</span><span>State / territory</span><span aria-hidden="true">→</span><strong>Default</strong></div>
    <p className={styles.helperText}>{clinicMode ? "Clinic prices apply only to clinic bookings. The clinic collects the remaining balance and voluntary tips." : "An existing professional-specific price takes priority at booking. Tips are separate and collected by the professional."}</p>
    {error ? <p role="alert" className={styles.regionalError}>{error} <button type="button" className={styles.backButton} onClick={() => void load()}>Retry</button></p> : null}
    {!snapshot.syncedAt ? <div className={styles.regionEmpty}><strong>Connect your active locations</strong><p>Sync the project’s location catalog with its configured Google Sheet to enable regional prices. Your default price continues to apply.</p></div> : <p className={styles.helperText}>{snapshot.regions.filter(region => region.active !== false).length.toLocaleString()} active locations · Last synced {new Date(snapshot.syncedAt).toLocaleString("en-US")}.</p>}
    {snapshot.warnings.map(warning => <p className={styles.helperText} key={warning}>{warning}</p>)}
    {snapshot.regions.length > 0 ? <div className={styles.regionComposer}>
      <div className={styles.serviceFieldGrid}>
        <label className={styles.formField}><span>Region level</span><select className={styles.select} value={level} disabled={loading} onChange={event => changeScope(event.target.value as PricingLevel, state)}><option value="state">State / territory</option><option value="county">County / parish</option><option value="city">City / municipality</option></select></label>
        <label className={styles.formField}><span>State / territory</span><select className={styles.select} value={state} disabled={loading} onChange={event => changeScope(level, event.target.value)}><option value="">Choose a state</option>{states.map(name => <option key={name}>{name}</option>)}</select></label>
      </div>
      {level !== "state" && state ? <>
        {level === "city" && counties.length ? <details className={styles.countyFilter} key={`filters-${state}`}><summary>Filter by {state === "Louisiana" ? "parish" : "county"}<span>{countyFilters.length ? `${countyFilters.length} selected` : "All included"}</span></summary><RegionalLocationPicker key={`counties-${state}`} title={state === "Louisiana" ? "Parish filters" : "County filters"} options={counties} selectedIds={countyFilters} onChange={setCountyFilters} emptyText="No county filters available." disabled={loading} /></details> : null}
        <RegionalLocationPicker key={`${state}-${level}-${countyFilters.join("|")}-${pickerRevision}`} title={areaTitle} options={options} selectedIds={selectedIds} onChange={changeSelection} emptyText="No active locations in this scope. Try another level or state." disabled={loading} getPrice={id => money(resolveRegionalPrice(basePrice, rules, regionIndex.get(id)).price)} />
        {selectedRegions.length ? <details className={styles.selectionReview}><summary>Review {selectedRegions.length} selected {selectedRegions.length === 1 ? "location" : "locations"}</summary><ul>{selectedRegions.map(region => <li key={region.id}><span>{region.label}</span><button type="button" className={styles.backButton} onClick={() => changeSelection(selectedIds.filter(id => id !== region.id))} aria-label={`Remove ${region.label} from selection`}>Remove</button></li>)}</ul></details> : null}
      </> : !state ? <p className={styles.helperText}>Choose a state or territory to see its active locations.</p> : null}
      <div className={styles.bulkPriceInput}>
        <label className={styles.formField}><span>Regional price ({currency})</span><input ref={editingRef} className={styles.numberInput} type="number" min="0" max="1000000" step="0.01" value={amount} placeholder={inherited ? String(inherited.price) : "0.00"} onChange={event => { setAmount(event.target.value); setDraftNotice(""); }} /></label>
        <div role="status"><strong>{selectedRegions.length ? `${selectedRegions.length} ${selectedRegions.length === 1 ? "location" : "locations"} selected` : "Select your locations"}</strong><span>{validAmount && selectedRegions.length ? `${money(Number(amount))} per visit at each selected location` : "One price, applied together when you save."}</span></div>
      </div>
      {selected && effective && inherited ? <div className={styles.pricePreview} aria-live="polite"><div><span>Current price for this location</span><strong>{money(effective.price)}</strong><small>{effective.source} · Without this exception: {money(inherited.price)} from {inherited.source}</small></div>{selected.urls[0] ? <a href={selected.urls[0]} target="_blank" rel="noreferrer">View location ↗</a> : <small>No state landing URL confirmed.</small>}</div> : null}
      {selectedRegions.length > 0 && level !== "city" ? <fieldset className={styles.inheritanceOptions}>
        <legend>Prices within {selected ? selected.label : `${selectedRegions.length} selected locations`}</legend>
        <p>Locations without their own exception inherit this price automatically, including cities within counties, parishes and municipalities.</p>
        {descendants.length ? <>
          <label className={styles.inheritanceChoice}><input type="radio" name="descendant-price-policy" checked={descendantPolicy === "preserve"} onChange={() => { setDescendantPolicy("preserve"); setDraftNotice(""); }} /><span><strong>Keep existing exceptions</strong><small>Recommended · Preserve {descendants.length} lower-level price{descendants.length === 1 ? "" : "s"}.</small></span></label>
          <label className={styles.inheritanceChoice}><input type="radio" name="descendant-price-policy" checked={descendantPolicy === "inherit"} onChange={() => { setDescendantPolicy("inherit"); setDraftNotice(""); }} /><span><strong>Use this price for every location below</strong><small>Remove {descendants.length} lower-level exception{descendants.length === 1 ? "" : "s"} so those locations inherit this price, including future changes.</small></span></label>
          <details className={styles.inheritanceDetails}><summary>Review {descendants.length} {descendants.length === 1 ? "exception" : "exceptions"} to {descendantPolicy === "inherit" ? "replace" : "keep"}</summary><ul>{descendants.map(rule => <li key={rule.region.id}><span>{rule.region.label}</span><strong>{money(rule.price)}{descendantPolicy === "inherit" && validAmount ? ` → ${money(Number(amount))}` : ""}</strong></li>)}</ul></details>
        </> : <p>No lower-level exceptions. All locations below will inherit this price.</p>}
      </fieldset> : null}
      {overLimit ? <p role="alert" className={styles.regionalError}>This selection would create {nextRules.length.toLocaleString()} exceptions. The limit is 500 per service. Select fewer locations or set a county/state price so its locations inherit it.</p> : null}
      <div className={styles.regionActions}><span className={styles.helperText}>Changes take effect when you save the service. Public pages may take up to 6 minutes to refresh.</span><button type="button" className={styles.button} disabled={!selectedRegions.length || !validAmount || loading || overLimit} onClick={apply}>{selectedRegions.length > 1 ? `Apply to ${selectedRegions.length} locations` : existing ? "Update regional price" : "Add regional price"}</button></div>
      {draftNotice ? <p role="status" className={styles.helperText}>{draftNotice}</p> : null}
    </div> : null}
    {rules.length ? <ul className={styles.regionList}>{rules.map(rule => <li key={rule.region.id}><div><strong>{rule.region.label}</strong><small>{rule.region.level === "city" && rule.region.state === "Puerto Rico" ? "Municipality" : rule.region.level}{snapshot.syncedAt && !activeIds.has(rule.region.id) ? " · Not in the latest active catalog; review before saving" : ""}</small></div><strong>{money(rule.price)}</strong><div><button type="button" className={styles.backButton} disabled={!activeIds.has(rule.region.id)} onClick={() => edit(rule)} aria-label={`Edit price for ${rule.region.label}`}>Edit</button><button type="button" className={styles.backButton} onClick={() => onChange(rules.filter(item => item.region.id !== rule.region.id))} aria-label={`Use inherited price for ${rule.region.label}`}>Use inherited price</button></div></li>)}</ul> : <p className={styles.helperText}>No exceptions yet. All locations use the default price.</p>}
  </div>;
}
