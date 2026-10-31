'use client';
import { useEffect, useState } from 'react';
import { PartnerAdminShell } from '@/components/partner-admin/PartnerAdminShell';
import type { Clinic } from '@/lib/clinics';
import styles from './clinic.module.css';
export function ClinicAdmin() {
    const [clinics, setClinics] = useState<Clinic[]>([]), [page, setPage] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false), [search, setSearch] = useState('');
    useEffect(() => { const c = new AbortController(); fetch(`/api/partner-admin/clinics?page=${page}`, { signal: c.signal }).then(async (r) => { const p = await r.json(); if (!r.ok)
        throw new Error(p.error); setClinics(p.clinics); }).catch(e => { if (!c.signal.aborted)
        setError(e.message); }); return () => c.abort(); }, [page]);
    async function status(clinic: Clinic, status: Clinic['status']) { setBusy(true); setError(''); try {
        const r = await fetch('/api/partner-admin/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', clinicId: clinic.id, status }) });
        const p = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        setClinics(old => old.map(c => c.id === clinic.id ? { ...c, status } : c));
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to update.');
    }
    finally {
        setBusy(false);
    } }
    return <PartnerAdminShell title="Clinics"><main className={styles.shell}><header className={styles.head}><div><span className={styles.eyebrow}>Partner network</span><h1>Clinic partners</h1><p>Approve clinics. Each clinic authorizes its own team. Service pricing stays with My Drip Nurse.</p></div><a className={styles.secondary} href="https://partners.mydripnurse.com/clinics/register">Clinic registration ↗</a></header>{error ? <p className={styles.error} role="alert">{error}</p> : null}<section className={styles.card}><input className={styles.search} aria-label="Search clinics on this page" placeholder="Search clinics on this page…" value={search} onChange={e => setSearch(e.target.value)}/>{clinics.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => <article className={styles.row} key={c.id}><div><strong>{c.name}</strong><p className={styles.muted}>{c.contactEmail} · {c.contactPhone}</p><p>{c.description}</p><details className={styles.muted}><summary>Operating areas · {c.coverage.length}</summary><p>{c.coverage.map(area => area.label).join(" · ") || "Not provided"}</p></details><span className={styles.badge}>{c.status}</span></div><div className={styles.actions}>{c.status !== 'approved' ? <button className={styles.primary} disabled={busy} onClick={() => void status(c, 'approved')}>Approve clinic</button> : <button className={styles.secondary} disabled={busy} onClick={() => void status(c, 'suspended')}>Suspend</button>}<a className={styles.secondary} href="/services">Configure service prices</a></div></article>)}{!clinics.length && !error ? <p className={styles.empty}>Clinic applications will appear here.</p> : null}<div className={styles.actions}><button className={styles.secondary} disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1}</span><button className={styles.secondary} disabled={clinics.length < 50} onClick={() => setPage(page + 1)}>Next</button></div></section></main></PartnerAdminShell>;
}
