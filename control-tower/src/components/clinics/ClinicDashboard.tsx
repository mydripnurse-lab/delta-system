'use client';
import { useEffect, useState } from 'react';
import type { ClinicDashboardData, ClinicMetric } from '@/lib/clinicDashboard';
import type { Clinic } from '@/lib/clinics';
import styles from './clinicDashboard.module.css';

const money = (value: string | number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value));
const percent = (numerator: number, denominator: number) => denominator ? `${Math.round(numerator / denominator * 100)}%` : '—';
const emptyMetric: ClinicMetric = { profileId: null, overall: true, currency: 'USD', appointments: 0, completed: 0, cancelled: 0, upcoming: 0, serviceValue: '0', completedBalance: '0', pipelineBalance: '0', deposits: '0', refunds: '0' };

export function ClinicDashboard({ clinic, directory = false }: { clinic: Clinic; directory?: boolean }) {
    const [days, setDays] = useState(30);
    const [report, setReport] = useState<{ clinicId: string; data: ClinicDashboardData } | null>(null);
    const [error, setError] = useState('');
    const [currency, setCurrency] = useState('USD');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState('');
    const [revision, setRevision] = useState(0);
    useEffect(() => {
        const controller = new AbortController();
        fetch(`/api/clinics/dashboard?clinicId=${encodeURIComponent(clinic.id)}&days=${days}`, { signal: controller.signal })
            .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); if (!controller.signal.aborted) { setReport({ clinicId: clinic.id, data: body.data }); setError(''); } })
            .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load performance.'); });
        return () => controller.abort();
    }, [clinic.id, days, revision]);
    const data = report?.clinicId === clinic.id && report.data.days === days ? report.data : null;
    if (error) return <div className={styles.panel} role="alert"><p>{error}</p><button onClick={() => { setError(''); setRevision(v => v + 1); }}>Try again</button></div>;
    if (!data) return <div className={styles.panel} role="status">Loading clinic performance…</div>;
    const totals = data.metrics.filter(m => m.overall);
    const currencies = totals.length ? totals.map(m => m.currency) : ['USD'];
    const currentCurrency = currencies.includes(currency) ? currency : currencies[0];
    const metric = totals.find(m => m.currency === currentCurrency) || emptyMetric;
    const total = (field: 'appointments' | 'completed' | 'cancelled' | 'upcoming') => totals.reduce((sum, m) => sum + m[field], 0);
    const team = data.team.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
    const person = data.team.find(m => m.id === selected);
    const personMetrics = data.metrics.filter(m => !m.overall && m.profileId === selected);
    const traffic = data.team.reduce((s, m) => ({ impressions: s.impressions + m.impressions, clicks: s.clicks + m.profileClicks, bookings: s.bookings + m.bookingClicks }), { impressions: 0, clicks: 0, bookings: 0 });
    const kpis = directory ? [
        ['Visible team profiles', String(data.team.filter(m => m.visible).length), 'Published with consent'],
        ['Team impressions', data.directoryAvailable ? traffic.impressions.toLocaleString() : '—', 'Appearances in the directory'],
        ['Profile clicks', data.directoryAvailable ? traffic.clicks.toLocaleString() : '—', 'Visits from the directory'],
        ['Booking clicks', data.directoryAvailable ? traffic.bookings.toLocaleString() : '—', 'Clicks, not confirmed appointments'],
    ] : [
        ['Appointments', total('appointments').toLocaleString(), `Scheduled in the last ${days} days`],
        ['Completed visits', total('completed').toLocaleString(), `${percent(total('completed'), total('appointments'))} completion rate`],
        ['Upcoming visits', total('upcoming').toLocaleString(), 'Confirmed · next 30 days'],
        ['Acceptance rate', percent(data.decisions.accepted, data.decisions.accepted + data.decisions.declined), `${data.decisions.accepted} accepted · ${data.decisions.declined} declined`],
    ];
    return <div className={styles.dashboard}>
        <div className={styles.toolbar}><div><span className={styles.eyebrow}>{directory ? 'Visibility & discovery' : 'Practice performance'}</span><h2>{directory ? 'Your clinic. Your team.' : 'A clear view of your care.'}</h2><p>{directory ? 'Explore your listing and the performance of your team’s profiles.' : 'Clinic appointments, team activity and service value in one place.'}</p></div><label>Reporting period<select value={days} onChange={e => setDays(Number(e.target.value))}><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last 12 months</option></select></label></div>
        {directory ? <section className={styles.panel}><div className={styles.toolbar}><div><h3>{clinic.name}</h3><p>{clinic.published ? 'Clinic website & listing published' : 'Clinic listing not published'}</p></div><div className={styles.links}><a href="/clinics" target="_blank" rel="noreferrer">Browse clinic directory ↗</a>{clinic.published ? <a href={`/clinics/${clinic.slug}`} target="_blank" rel="noreferrer">View your clinic ↗</a> : null}</div></div><p className={styles.note}>Team profile traffic is measured from the date each nurse joined this clinic. These counters can include visits for their independent practice; they are not clinic-booking conversions. Separate clinic-listing impressions are not tracked yet.</p></section> : null}
        <div className={styles.kpis}>{kpis.map(([label, value, caption]) => <article key={label}><span>{label}</span><strong>{value}</strong><small>{caption}</small></article>)}</div>
        {!directory ? <section className={styles.panel}><div className={styles.toolbar}><div><span className={styles.eyebrow}>Financial overview</span><h3>Service value & collections</h3></div><label>Currency<select value={currentCurrency} onChange={e => setCurrency(e.target.value)}>{currencies.map(c => <option key={c}>{c}</option>)}</select></label></div><div className={styles.finances}>
            <div><span>Completed service value</span><strong>{money(metric.serviceValue, currentCurrency)}</strong></div>
            <div><span>Clinic balance · completed</span><strong>{money(metric.completedBalance, currentCurrency)}</strong></div>
            <div><span>Clinic balance · upcoming</span><strong>{money(metric.pipelineBalance, currentCurrency)}</strong></div>
            <div><span>Net recorded deposits · MDN</span><strong>{money(metric.deposits, currentCurrency)}</strong></div>
            <div><span>Recorded deposit refunds</span><strong>{money(metric.refunds, currentCurrency)}</strong></div>
            <div><span>Cancelled / failed / refunded</span><strong>{total('cancelled')}</strong></div>
        </div><p className={styles.note}>Your clinic collects the remaining balance and voluntary tips directly. Balances shown are service value after the deposit, not verified collections or a payout from My Drip Nurse. Tips and MDN-funded reward balances are excluded. Deposit figures reflect payment records; they are not a bank reconciliation.</p></section> : null}
        <section className={styles.panel}><div className={styles.toolbar}><div><span className={styles.eyebrow}>Your people</span><h3>{directory ? 'Team directory results' : 'Team performance'}</h3></div><label className={styles.search}>Find a nurse<input type="search" placeholder="Search by name" value={search} onChange={e => setSearch(e.target.value)}/></label></div>
            <div className={styles.tableWrap}><table><caption className={styles.srOnly}>Nurse performance for this clinic</caption><thead><tr><th>Nurse</th><th>{directory ? 'Impressions' : 'Visits'}</th><th>{directory ? 'Profile clicks' : 'Completed'}</th><th>{directory ? 'Booking clicks' : 'Acceptance'}</th><th>{directory ? 'Listing' : 'Availability'}</th><th><span className={styles.srOnly}>Details</span></th></tr></thead><tbody>{team.map(m => {
                const rows = data.metrics.filter(r => !r.overall && r.profileId === m.id);
                return <tr key={m.id}><th scope="row"><strong>{m.name}</strong><small>{m.status}</small></th><td>{directory ? data.directoryAvailable ? m.impressions : '—' : rows.reduce((s, r) => s + r.appointments, 0)}</td><td>{directory ? data.directoryAvailable ? m.profileClicks : '—' : rows.reduce((s, r) => s + r.completed, 0)}</td><td>{directory ? data.directoryAvailable ? m.bookingClicks : '—' : percent(m.accepted, m.accepted + m.declined)}</td><td><span className={styles.badge}>{directory ? m.visible ? 'Published' : 'Not published' : m.availability ? 'Configured' : 'Needs setup'}</span></td><td><button aria-label={`View performance for ${m.name}`} aria-expanded={selected === m.id} onClick={() => setSelected(selected === m.id ? '' : m.id)}>View →</button></td></tr>;
            })}</tbody></table></div>
            {!team.length ? <p className={styles.empty}>{search ? 'No nurses match your search.' : 'Your team’s results will appear here after nurses join your clinic.'}</p> : null}
            {person ? <section className={styles.detail} aria-label={`${person.name} performance`}><div className={styles.toolbar}><h3>{person.name}</h3><button onClick={() => setSelected('')}>Close details</button></div><p>{person.accepted} accepted · {person.declined} declined · {percent(person.accepted, person.accepted + person.declined)} acceptance rate</p>{personMetrics.length ? personMetrics.map(m => <p key={m.currency}>{m.completed} completed · {m.upcoming} upcoming · {money(m.completedBalance, m.currency)} clinic balance from completed visits</p>) : <p>No clinic visits recorded in this reporting period.</p>}<p>{person.availability ? 'Weekly availability is configured.' : 'Weekly availability needs setup.'} This does not guarantee availability for a particular appointment.</p>{person.visible ? <a href={`/clinics/${clinic.slug}/team/${person.slug}`} target="_blank" rel="noreferrer">View nurse profile ↗</a> : null}</section> : null}
            <p className={styles.note}>Appointment and financial results include only bookings assigned to this clinic. Independent appointments and other clinics’ patient records remain private. Historical visits remain in clinic totals if a team member leaves.</p>{data.teamTruncated ? <p className={styles.note}>Showing the first 200 team members. Clinic totals include all clinic appointments.</p> : null}
        </section><p className={styles.note}>Updated {new Date(data.generatedAt).toLocaleString('en-US')}. Reopen this view for the latest available results. Reporting uses appointment dates; acceptance includes upcoming visits in the next 30 days.</p>
    </div>;
}
