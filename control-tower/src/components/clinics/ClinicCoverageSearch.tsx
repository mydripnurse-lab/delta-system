'use client';

import { useId, useMemo, useRef, useState } from 'react';
import styles from './clinicCoverageSearch.module.css';

const PAGE_SIZE = 12;
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export function ClinicCoverageSearch({ areas }: { areas: string[] }) {
    const [query, setQuery] = useState('');
    const [requestedPage, setPage] = useState(1);
    const inputId = useId(), resultsId = useId();
    const input = useRef<HTMLInputElement>(null);
    const locations = useMemo(() => [...new Set(areas.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' })), [areas]);
    const words = normalize(query).split(/\s+/).filter(Boolean);
    const matches = locations.filter(label => words.every(word => normalize(label).includes(word)));
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    const page = Math.min(requestedPage, pages);
    const visible = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    return <div className={styles.panel}>
        <label className={styles.label} htmlFor={inputId}>Find your service area</label>
        <div className={styles.search}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input ref={input} id={inputId} type="search" value={query} placeholder="Search city, county, parish or state" autoComplete="off" aria-controls={resultsId} onChange={event => { setQuery(event.target.value); setPage(1); }}/>
            {query ? <button type="button" aria-label="Clear area search" onClick={() => { setQuery(''); setPage(1); input.current?.focus(); }}>×</button> : null}
        </div>
        <p className={styles.count} role="status" aria-live="polite">{matches.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, matches.length)} of ${matches.length} service ${matches.length === 1 ? 'area' : 'areas'}` : locations.length ? 'No matching service areas' : 'Service areas are being updated'}</p>
        <ul id={resultsId} className={styles.grid} aria-label="Covered service areas">
            {visible.map(label => <li key={label}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/></svg><span>{label}</span></li>)}
        </ul>
        {!matches.length ? <p className={styles.empty}>{locations.length ? 'Try a different city, municipality, county or state.' : 'Contact My Drip Nurse to confirm coverage for your address.'}</p> : null}
        {pages > 1 ? <nav className={styles.pagination} aria-label="Service area pages">
            <button type="button" aria-label="Previous areas page" disabled={page === 1} onClick={() => setPage(page - 1)}>←</button>
            <span>Page {page} of {pages}</span>
            <button type="button" aria-label="Next areas page" disabled={page === pages} onClick={() => setPage(page + 1)}>→</button>
        </nav> : null}
    </div>;
}
