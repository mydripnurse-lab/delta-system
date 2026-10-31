'use client';
import { useEffect, useMemo, useState } from 'react';
import { RegionalLocationPicker } from '@/components/partner-admin/RegionalLocationPicker';
import type { PricingRegion } from '@/lib/regionalPricing';
import styles from './clinic.module.css';
export function ClinicCoverage({ value, onChange, publicCatalog = false }: {
    publicCatalog?: boolean;
    value: PricingRegion[];
    onChange: (regions: PricingRegion[]) => void;
}) {
    const [regions, setRegions] = useState<PricingRegion[]>([]), [state, setState] = useState(''), [level, setLevel] = useState('county'), [error, setError] = useState(''), [settledRequest, setSettledRequest] = useState(''), [retry, setRetry] = useState(0);
    const requestKey = `${publicCatalog}:${state}:${retry}`;
    const loading = settledRequest !== requestKey;
    useEffect(() => { const controller = new AbortController(); fetch(`${publicCatalog ? "/api/public/clinic-locations?" : "/api/clinics?regions=1&"}state=${encodeURIComponent(state)}`, { signal: controller.signal }).then(async (response) => { const data = await response.json(); if (!response.ok)
        throw new Error(data.error); if (controller.signal.aborted) return; setError(''); setRegions(old => [...new Map<string, PricingRegion>([...old, ...data.regions].map((r: PricingRegion) => [r.id, r])).values()]); }).catch(e => { if (!controller.signal.aborted)
        setError(e.message); }).finally(() => { if (!controller.signal.aborted) setSettledRequest(requestKey); }); return () => controller.abort(); }, [state, publicCatalog, requestKey]);
    const states = useMemo(() => [...new Set(regions.map(r => r.state))].sort(), [regions]);
    const options = useMemo(() => regions.filter(r => r.state === state && r.level === level).map(r => ({ id: r.id, label: r.city || r.county || r.label, detail: [r.county, r.state].filter(Boolean).join(' · ') })), [regions, state, level]);
    return <div><p className={styles.muted}>Choose the states, counties / parishes or cities your clinic serves across the United States and Puerto Rico. You can select areas in more than one state.</p>{error ? <p role="alert">{error} <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></p> : null}<div className={styles.grid}><label className={styles.field}>State / territory<select value={state} onChange={e => { setState(e.target.value); if (['Puerto Rico', 'District of Columbia'].includes(e.target.value)) setLevel('city'); }}><option value="">Choose a state</option>{states.map(s => <option key={s}>{s}</option>)}</select></label><label className={styles.field}>Area type<select value={level} onChange={e => setLevel(e.target.value)}>{!['Puerto Rico', 'District of Columbia'].includes(state) ? <option value="county">County / parish</option> : null}<option value="city">City / municipality</option><option value="state">Entire state / territory</option></select></label></div><RegionalLocationPicker title="Coverage" disabled={loading} options={options} selectedIds={value.map(r => r.id)} onChange={ids => { if (ids.length > 500) {
        setError('Select up to 500 areas.');
        return;
    } setError(''); onChange([...new Map([...value, ...regions].map(r => [r.id, r])).values()].filter(r => ids.includes(r.id))); }} emptyText={loading ? "Loading locations…" : state ? "No areas of this type. Choose another area type." : "Select a state to browse its areas."}/><details><summary>{value.length} selected areas</summary>{value.map(r => <div className={styles.row} key={r.id}>{r.label}<button type="button" className={styles.secondary} onClick={() => onChange(value.filter(v => v.id !== r.id))}>Remove</button></div>)}</details></div>;
}
