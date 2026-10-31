'use client';
import { useEffect, useState } from 'react';
import { RegionalPricingEditor } from '@/components/partner-admin/RegionalPricingEditor';
import { resolveClinicPrice } from '@/lib/clinicPolicy';
import type { RegionalPrice } from '@/lib/regionalPricing';
import styles from './clinic.module.css';
type Rule = {
    clinicId: string;
    enabled: boolean;
    price: number | null;
    regionalPrices: RegionalPrice[];
};
export function ClinicPriceEditor({ serviceId, basePrice, general, currency }: {
    serviceId: string;
    basePrice: number;
    general: RegionalPrice[];
    currency: string;
}) {
    const [open, setOpen] = useState(false), [clinics, setClinics] = useState<{
        id: string;
        name: string;
    }[]>([]), [prices, setPrices] = useState<Rule[]>([]), [selected, setSelected] = useState(''), [draft, setDraft] = useState<Rule | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [preview, setPreview] = useState({ state: '', county: '', city: '' });
    useEffect(() => { if (!open || !serviceId)
        return; const c = new AbortController(); fetch(`/api/partner-admin/clinics?serviceId=${serviceId}`, { signal: c.signal }).then(async (r) => { const p = await r.json(); if (!r.ok)
        throw new Error(p.error); setClinics(p.clinics); setPrices(p.prices); }).catch(e => { if (!c.signal.aborted)
        setError(e.message); }); return () => c.abort(); }, [open, serviceId]);
    const result = draft ? resolveClinicPrice(basePrice, general, draft, preview) : null;
    return <section className={styles.card}><button type="button" className={styles.secondary} aria-expanded={open} onClick={() => setOpen(!open)}>Clinic-specific services & prices {open ? '−' : '+'}</button>{open ? <><p>Only My Drip Nurse can change these prices. Clinic city → clinic county → clinic state → clinic default → My Drip Nurse regional price.</p>{error ? <p className={styles.error} role="alert">{error}</p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}<label className={styles.field}>Clinic<select value={selected} onChange={e => { const id = e.target.value; setSelected(id); setDraft(id ? structuredClone(prices.find(p => p.clinicId === id) || { clinicId: id, enabled: false, price: null, regionalPrices: [] }) : null); setNotice(''); }}><option value="">Choose a clinic</option>{clinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{draft ? <><label><input type="checkbox" checked={draft.enabled} onChange={e => setDraft({ ...draft, enabled: e.target.checked })}/> Enable this service for the clinic</label><label className={styles.field}>Clinic default price ({currency})<input type="number" min="0" step="0.01" max="1000000" placeholder="Use My Drip Nurse regional prices" value={draft.price ?? ''} onChange={e => setDraft({ ...draft, price: e.target.value === '' ? null : Number(e.target.value) })}/><span className={styles.muted}>Leave empty to inherit My Drip Nurse prices wherever no clinic regional exception exists.</span></label><RegionalPricingEditor active rules={draft.regionalPrices} basePrice={draft.price ?? basePrice} currency={currency} onChange={regionalPrices => setDraft({ ...draft, regionalPrices })} clinicMode/><details><summary>Preview a location’s price</summary><div className={styles.grid}>{(['state', 'county', 'city'] as const).map(k => <label className={styles.field} key={k}>{k}<input value={preview[k]} onChange={e => setPreview({ ...preview, [k]: e.target.value })}/></label>)}</div><p>{result ? `${new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(result.price)} · ${result.source}` : ''}</p></details><p>Clinic pricing is saved separately from the general service draft.</p><button type="button" className={styles.primary} disabled={busy || !serviceId} onClick={async () => { setBusy(true); setError(''); try {
        const r = await fetch('/api/partner-admin/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'price', serviceId, ...draft, regionalPrices: draft.regionalPrices.map(r => ({ regionId: r.region.id, price: r.price })) }) });
        const p = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        setPrices(old => [...old.filter(r => r.clinicId !== draft.clinicId), draft]);
        setNotice('Clinic pricing saved. Public clinic pages refresh from the shared cache.');
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save.');
    }
    finally {
        setBusy(false);
    } }}>{busy ? 'Saving…' : 'Save clinic prices'}</button></> : null}</> : null}</section>;
}
