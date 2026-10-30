"use client";

import { useId, useMemo, useState } from "react";
import { locationToken } from "@/lib/regionalPricing";
import styles from "./serviceCatalog.module.css";

export type LocationOption = { id: string; label: string; detail?: string; price?: string };
const PAGE_SIZE = 40;

/** Search and selection stay in the browser; only one page of rows is rendered. */
export function RegionalLocationPicker({ title, options, selectedIds, onChange, emptyText, getPrice, disabled = false }: {
  title: string;
  options: LocationOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  emptyText: string;
  getPrice?: (id: string) => string;
  disabled?: boolean;
}) {
  const searchId = useId();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [onlySelected, setOnlySelected] = useState(false);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const indexed = useMemo(() => options.map(option => ({ ...option, search: locationToken(`${option.label} ${option.detail || ""}`) })), [options]);
  const matches = useMemo(() => {
    const terms = locationToken(search).split(" ").filter(Boolean);
    return indexed.filter(option => (!onlySelected || selected.has(option.id)) && terms.every(term => option.search.includes(term)));
  }, [indexed, search, onlySelected, selected]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visible = matches.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const allMatchedSelected = matches.length > 0 && matches.every(option => selected.has(option.id));
  const selectedInMatches = matches.filter(option => selected.has(option.id)).length;
  function toggle(id: string) {
    onChange(selected.has(id) ? selectedIds.filter(value => value !== id) : [...selectedIds, id]);
  }
  function selectMatches() {
    onChange([...new Set([...selectedIds, ...matches.map(option => option.id)])]);
  }
  return <fieldset className={styles.locationPicker} disabled={disabled}>
    <legend>{title}</legend>
    <div className={styles.locationSearch}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      <label htmlFor={searchId} className={styles.visuallyHidden}>Search {title.toLowerCase()}</label>
      <input id={searchId} type="search" placeholder={`Search ${title.toLowerCase()}…`} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} />
    </div>
    <div className={styles.locationToolbar}>
      <span role="status">{matches.length.toLocaleString()} {matches.length === 1 ? "result" : "results"} <span aria-hidden="true">·</span> <strong>{selectedIds.length.toLocaleString()} selected</strong></span>
      <div>
        <button type="button" className={styles.backButton} disabled={!matches.length || allMatchedSelected} onClick={selectMatches}>Select all {matches.length.toLocaleString()} {matches.length === 1 ? "result" : "results"}</button>
        <button type="button" className={styles.backButton} disabled={!selectedIds.length} onClick={() => onChange([])}>Clear selection</button>
      </div>
    </div>
    <label className={styles.locationSelectedFilter}><input type="checkbox" checked={onlySelected} onChange={event => { setOnlySelected(event.target.checked); setPage(0); }} /> Show selected only</label>
    {selectedIds.length > selectedInMatches ? <p className={styles.locationSelectionHint}>{selectedIds.length - selectedInMatches} selected outside this search or filter. Your selection is kept.</p> : null}
    <div className={styles.locationRows}>
      {visible.length ? visible.map(option => <label key={option.id} className={styles.locationRow} data-selected={selected.has(option.id) || undefined}>
        <input type="checkbox" checked={selected.has(option.id)} onChange={() => toggle(option.id)} aria-label={`Select ${option.label}${option.detail ? `, ${option.detail}` : ""}`} />
        <span><strong>{option.label}</strong>{option.detail ? <small>{option.detail}</small> : null}</span>
        {getPrice || option.price ? <span className={styles.locationRowPrice}>{getPrice ? getPrice(option.id) : option.price}<small>Current price</small></span> : null}
      </label>) : <p className={styles.locationNoResults}>{options.length ? "No matches. Try another search or turn off “Show selected only”." : emptyText}</p>}
    </div>
    {pages > 1 ? <div className={styles.locationPagination}><span>Page {currentPage + 1} of {pages}</span><div><button type="button" className={styles.backButton} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label={`Previous page of ${title.toLowerCase()}`}>← Previous</button><button type="button" className={styles.backButton} disabled={currentPage === pages - 1} onClick={() => setPage(currentPage + 1)} aria-label={`Next page of ${title.toLowerCase()}`}>Next →</button></div></div> : null}
  </fieldset>;
}
