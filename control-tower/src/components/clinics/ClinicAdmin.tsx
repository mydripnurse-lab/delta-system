'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { PartnerAdminShell } from '@/components/partner-admin/PartnerAdminShell';
import type { Clinic } from '@/lib/clinics';
import styles from '@/app/partner-admin/partnerAdmin.module.css';
import layout from './clinicAdmin.module.css';

const labels: Record<Clinic['status'], string> = { pending: 'Pending review', approved: 'Approved', suspended: 'Suspended' };
function Badge({ status }: { status: Clinic['status'] }) {
    return <span className={`${styles.badge} ${status === 'approved' ? styles.good : status === 'suspended' ? styles.bad : styles.warn}`}>{labels[status]}</span>;
}
function Avatar({ clinic }: { clinic: Clinic }) {
    const [failedUrl, setFailedUrl] = useState('');
    return <div className={`${styles.avatar} ${layout.avatar}`}>{clinic.logoUrl && clinic.logoUrl !== failedUrl
        ? <Image src={clinic.logoUrl} alt="" width={40} height={40} unoptimized onError={() => setFailedUrl(clinic.logoUrl)} />
        : clinic.name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase()}</div>;
}
function Website({ clinic }: { clinic: Clinic }) {
    const live = clinic.status === 'approved' && clinic.published;
    return <div className={`${styles.websiteSummary} ${live ? styles.websiteSummaryLive : styles.websiteSummaryPreview}`}><span><i aria-hidden="true" />{live ? 'Live' : 'Not live'}</span>{live ? <a href={`https://partners.mydripnurse.com/clinics/${encodeURIComponent(clinic.slug)}`} target="_blank" rel="noreferrer">View live ↗</a> : null}</div>;
}
export function ClinicAdmin() {
    const pathname = usePathname();
    const [clinics, setClinics] = useState<Clinic[]>([]);
    const [page, setPage] = useState(0);
    const [revision, setRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const returnId = useRef<string | null>(null);
    const selected = clinics.find(clinic => clinic.id === selectedId);
    const servicesUrl = pathname.startsWith('/partner-admin') ? '/partner-admin/services' : '/services';
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true); setError('');
        async function load() {
            try {
                const response = await fetch(`/api/partner-admin/clinics?page=${page}`, { signal: controller.signal, cache: 'no-store' });
                if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`); return; }
                const payload = await response.json();
                if (!response.ok) throw new Error(payload.error || 'Unable to load clinics.');
                if (!controller.signal.aborted) setClinics(payload.clinics || []);
            } catch (cause) {
                if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load clinics.');
            } finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void load();
        return () => controller.abort();
    }, [page, revision]);
    useEffect(() => {
        if (selectedId) heading.current?.focus();
        else if (returnId.current) { document.getElementById(`review-clinic-${returnId.current}`)?.focus(); returnId.current = null; }
    }, [selectedId]);
    async function changeStatus(clinic: Clinic, status: Clinic['status']) {
        if (busy) return;
        setBusy(true); setError(''); setNotice('');
        try {
            const response = await fetch('/api/partner-admin/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', clinicId: clinic.id, status }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to update clinic.');
            // The existing API unpublishes the website when approval is removed.
            setClinics(current => current.map(item => item.id === clinic.id ? { ...item, status, published: status === 'approved' ? item.published : false } : item));
            setNotice(`${clinic.name} ${status === 'approved' ? 'approved' : 'suspended'}.`);
        } catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to update clinic.'); }
        finally { setBusy(false); }
    }
    function back() { returnId.current = selectedId; setSelectedId(null); setError(''); setNotice(''); }
    function changePage(next: number) { setLoading(true); setPage(next); setNotice(''); }
    const query = search.trim().toLowerCase();
    const visible = clinics.filter(clinic => (filter === 'all' || clinic.status === filter) && `${clinic.name} ${clinic.contactEmail} ${clinic.contactPhone} ${clinic.coverage.map(area => area.label).join(' ')}`.toLowerCase().includes(query));
    return <PartnerAdminShell title="Clinics" actions={<a className={styles.secondaryButton} href="https://partners.mydripnurse.com/clinics/register" target="_blank" rel="noreferrer">Clinic registration ↗</a>}>
        <div className={styles.frame}>
            <section className={styles.moduleHeader}>
                <div><span className={styles.eyebrow}>Partner network</span><h1>Clinics</h1><p>Review clinic profiles, operating areas and website status. Service pricing stays with My Drip Nurse.</p></div>
                <div className={styles.moduleSummary}><strong>{loading ? '—' : clinics.length}</strong><span>clinics on this page</span><strong>{loading ? '—' : clinics.filter(clinic => clinic.status === 'pending').length}</strong><span>awaiting review on this page</span></div>
            </section>
            {error ? <div className={`${layout.message} ${styles.error}`} role="alert">{error}{!selected ? <button className={styles.textButton} onClick={() => setRevision(value => value + 1)} disabled={loading}>Try again</button> : null}</div> : null}
            {notice ? <p className={layout.message} role="status">{notice}</p> : null}
            {selected ? <section className={styles.panel} aria-label="Clinic profile">
                <div className={styles.panelHeader}><button className={`${styles.textButton} ${layout.back}`} onClick={back} disabled={busy}>← Back to clinics</button><div className={layout.detailHeading}><div className={styles.applicant}><Avatar clinic={selected} /><div><h2 ref={heading} tabIndex={-1}>{selected.name}</h2><span className={styles.subtle}>Clinic profile</span></div></div><Badge status={selected.status} /></div></div>
                <div className={layout.detailGrid}><div>
                    <section className={layout.section}><h3>About the clinic</h3><p className={layout.description}>{selected.description || 'No description provided.'}</p></section>
                    <section className={layout.section}><h3>Operating areas <span>{selected.coverage.length}</span></h3>{selected.coverage.length ? <ul className={layout.coverage}>{selected.coverage.map(area => <li key={area.id}>{area.label}</li>)}</ul> : <p>No operating areas provided.</p>}</section>
                </div><aside className={layout.aside}>
                    <section className={layout.section}><h3>Private contact details</h3><p>For internal coordination. These details are not displayed on the clinic website.</p><dl className={layout.facts}><dt>Email</dt><dd>{selected.contactEmail || 'Not provided'}</dd><dt>Phone</dt><dd>{selected.contactPhone || 'Not provided'}</dd></dl></section>
                    <section className={layout.section}><h3>Website</h3><Website clinic={selected} /></section>
                    <section className={layout.section}><h3>Review & access</h3><p>My Drip Nurse approves the clinic. Each clinic authorizes its own team.</p><div className={layout.actions}><button className={selected.status === 'approved' ? styles.dangerButton : styles.button} disabled={busy} onClick={() => void changeStatus(selected, selected.status === 'approved' ? 'suspended' : 'approved')}>{busy ? 'Saving…' : selected.status === 'approved' ? 'Suspend clinic' : selected.status === 'suspended' ? 'Reactivate clinic' : 'Approve clinic'}</button><a className={styles.secondaryButton} href={servicesUrl}>Configure service prices →</a></div></section>
                </aside></div>
            </section> : <section className={styles.panel} aria-busy={loading}>
                <div className={styles.panelHeader}><div className={layout.panelTitle}><div><h2>My Drip Nurse Clinics</h2><span className={styles.subtle}>Open a profile to review clinic information and manage approval.</span></div><button className={styles.secondaryButton} disabled={loading || busy} onClick={() => setRevision(value => value + 1)}>Refresh clinics</button></div>
                    <div className={`${styles.filters} ${layout.filters}`}><input className={`${styles.input} ${styles.search}`} aria-label="Search clinics on this page" placeholder="Search clinic, email or operating area on this page" value={search} onChange={event => setSearch(event.target.value)} /><select className={styles.select} aria-label="Filter clinics on this page by status" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending review</option><option value="approved">Approved</option><option value="suspended">Suspended</option></select></div>
                </div>
                {loading ? <div className={styles.loading} role="status">Loading clinics…</div> : !error && visible.length ? <div className={styles.tableWrap}><table className={`${styles.table} ${layout.table}`}>
                    <caption className={layout.srOnly}>Clinic profiles on page {page + 1}</caption><thead><tr><th scope="col">Clinic</th><th scope="col">Status</th><th scope="col">Coverage</th><th scope="col">Website</th><th scope="col"><span className={layout.srOnly}>Actions</span></th></tr></thead>
                    <tbody>{visible.map(clinic => <tr key={clinic.id}><td><div className={styles.applicant}><Avatar clinic={clinic} /><div><strong>{clinic.name}</strong><span>{clinic.contactEmail || 'No contact email'}</span></div></div></td><td><Badge status={clinic.status} /></td><td>{clinic.coverage.length} {clinic.coverage.length === 1 ? 'operating area' : 'operating areas'}</td><td><Website clinic={clinic} /></td><td><div className={styles.rowActions}><button id={`review-clinic-${clinic.id}`} className={styles.textButton} aria-label={`Open profile for ${clinic.name}`} onClick={() => { setNotice(''); setSelectedId(clinic.id); }}>Open profile →</button></div></td></tr>)}</tbody>
                </table></div> : !error ? <div className={styles.empty}>{clinics.length ? 'No clinic matches these filters on this page.' : 'No clinics on this page.'}{search || filter !== 'all' ? <button className={styles.textButton} onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button> : null}</div> : null}
                <nav className={layout.pagination} aria-label="Clinic list pages"><span className={styles.subtle}>Page {page + 1}{!loading && !error ? ` · ${visible.length} of ${clinics.length} shown` : ''}</span><div><button className={styles.secondaryButton} disabled={loading || page === 0} onClick={() => changePage(page - 1)}>Previous</button><button className={styles.secondaryButton} disabled={loading || !!error || clinics.length < 50} onClick={() => changePage(page + 1)}>Next</button></div></nav>
            </section>}
        </div>
    </PartnerAdminShell>;
}
