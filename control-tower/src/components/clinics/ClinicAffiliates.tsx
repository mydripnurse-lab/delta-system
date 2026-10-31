'use client';
import { useEffect, useState } from 'react';
import type { ClinicAffiliateDashboard } from '@/lib/clinicAffiliate';
import styles from './clinic.module.css';
const money = (value: string, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
export function ClinicAffiliates({ clinicId, published }: { clinicId: string; published: boolean }) {
    const [data, setData] = useState<ClinicAffiliateDashboard | null>(null);
    const [error, setError] = useState(''), [notice, setNotice] = useState(''), [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/clinics/affiliates?clinicId=${encodeURIComponent(clinicId)}`, { signal: controller.signal })
            .then(async response => { const value = await response.json(); if (!response.ok) throw new Error(value.error); setData(value.data); setError(''); })
            .catch(e => { if (!controller.signal.aborted) setError(e.message || 'Unable to load affiliate activity.'); });
        return () => controller.abort();
    }, [clinicId, revision]);
    return <section className={styles.card} aria-labelledby="clinic-affiliates-title">
        <span className={styles.eyebrow}>External referrals</span><h2 id="clinic-affiliates-title">Grow your network.</h2>
        <p>Earn commission on qualifying appointments performed by new independent partners who apply through your clinic’s referral link. Adding or inviting a nurse to your own team does not earn a referral commission.</p>
        {error ? <p role="alert" className={styles.error}>{error} <button className={styles.secondary} onClick={() => setRevision(v => v + 1)}>Retry</button></p> : !data ? <p role="status">Loading affiliate activity…</p> : <>
            <div className={styles.hero}><span className={styles.badge}>{data.rate}% referral commission</span><h3>Your clinic’s referral link</h3>{published && data.status === 'approved' ? <><label className={styles.field}>Share with external professionals<input readOnly value={data.referralUrl} onFocus={e => e.currentTarget.select()}/></label><button className={styles.primary} onClick={() => void navigator.clipboard.writeText(data.referralUrl).then(() => setNotice('Referral link copied.'), () => setNotice('Select and copy the link above.'))}>Copy referral link</button></> : <p>Your clinic must be approved and its website published before this referral page is available.</p>}<p className={styles.small}>My Drip Nurse sets the commission rate. Referrals never change your service prices or the booking deposit. Your personal referral history remains in My practice → Affiliates. Your own team does not generate new affiliate commissions, including through a previous personal referral.</p></div>
            {notice ? <p role="status">{notice}</p> : null}
            {data.metrics.length ? data.metrics.map(m => <div key={m.currency} className={styles.affiliateMetrics}><div><small>Total earned · {m.currency}</small><strong>{money(m.earned, m.currency)}</strong></div><div><small>Pending</small><strong>{money(m.pending, m.currency)}</strong></div><div><small>Paid</small><strong>{money(m.paid, m.currency)}</strong></div><div><small>Qualifying appointments</small><strong>{m.appointments}</strong></div></div>) : <p className={styles.empty}>No affiliate earnings yet. Share your link to start building your external network.</p>}
            <p className={styles.small}>Pending commissions are not payments. Cancelled or refunded visits are excluded from pending earnings. Activity refreshes when you reopen this tab; updates may take about a minute.</p>
            <h3>Referred partners</h3>{data.partners.length ? data.partners.map(p => <div className={styles.row} key={p.id}><strong>{p.name}</strong><span className={styles.badge}>{p.status}</span></div>) : <p>No external partners have joined through this link yet.</p>}
            <h3>Recent commissions</h3>{data.commissions.map(c => <div className={styles.row} key={c.id}><div><strong>{c.partnerName}</strong><p className={styles.small}>{c.serviceName} · {c.reference}</p></div><span>{money(c.amount, c.currency)} · {c.rate}%</span><span className={styles.badge}>{c.status}</span></div>)}<p className={styles.small}>Showing up to 50 recent entries. Earnings totals include all recorded entries.</p>
        </>}
    </section>;
}
