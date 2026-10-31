'use client';
import Image from "next/image";
import Link from 'next/link';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Clinic, ClinicMember } from '@/lib/clinics';
import { brandTextColor } from '@/lib/clinicPolicy';
import { ClinicCoverage } from './ClinicCoverage';
import styles from './clinic.module.css';
type Workspace = {
    clinic: Clinic;
    members: ClinicMember[];
    appointments: {
        id: string;
        reference: string;
        status: string;
        startsAt: string;
        price: string;
        deposit: string;
        currency: string;
        customerName: string;
        customerEmail: string;
        customerPhone: string;
        nurseName: string;
        platformFunded: string | null;
    }[];
    services: {
        id: string;
        name: string;
        defaultPrice: string;
        clinicPrice: string | null;
        currency: string;
    }[];
};
const tabs = ['Overview', 'Team', 'Appointments', 'Services', 'Coverage', 'Website'] as const;
export function ClinicPortal() {
    const [clinics, setClinics] = useState<(Clinic & {
        role: string;
    })[]>([]), [data, setData] = useState<Workspace | null>(null), [tab, setTab] = useState<typeof tabs[number]>('Overview'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState<ClinicMember | null>(null), [invitation, setInvitation] = useState(''), [identity, setIdentity] = useState<{
        partnerId: string;
    } | null>(null);
    async function load(id?: string) { setBusy(true); setError(''); try {
        const r = await fetch(`/api/clinics${id ? `?id=${id}` : ''}`);
        const p = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        if (id)
            setData(p);
        else {
            setClinics(p.clinics);
            setIdentity(p.identity);
        }
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to load clinics.');
    }
    finally {
        setBusy(false);
    } }
    useEffect(() => { void load(); }, []);
    async function action(body: Record<string, unknown>) { setBusy(true); setError(''); setNotice(''); try {
        const r = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, clinicId: data?.clinic.id }) });
        const p = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        if (p.inviteUrl)
            setInvitation(p.inviteUrl);
        else {
            setNotice('Changes saved.');
            if (data)
                await load(data.clinic.id);
        }
        return true;
    }
    catch (e) {
        setError(e instanceof Error ? e.message : 'Unable to save.');
        return false;
    }
    finally {
        setBusy(false);
    } }
    const clinic = data?.clinic;
    const theme = clinic ? { '--clinic-primary': clinic.primaryColor, '--clinic-accent': clinic.accentColor, '--clinic-ink': brandTextColor(clinic.primaryColor), '--clinic-accent-ink': brandTextColor(clinic.accentColor) } as CSSProperties : undefined;
    function update(patch: Partial<Clinic>) { setData(old => old ? { ...old, clinic: { ...old.clinic, ...patch } } : old); }
    const save = () => clinic && action({ action: 'save', ...clinic, coverageIds: clinic.coverage.map(r => r.id) });
    return <main className={styles.shell} style={theme}><header className={styles.head}><div className={styles.identity}>{clinic?.logoUrl ? <Image unoptimized width={120} height={120} className={styles.logo} src={clinic.logoUrl} alt={clinic.name}/> : null}<div><span className={styles.eyebrow}>My Drip Nurse · Clinic partners</span><h1>{clinic?.name || 'Your clinic workspace'}</h1></div></div><div className={styles.actions}>{clinic ? <button className={styles.secondary} onClick={() => { setData(null); setEditing(null); void load(); }}>← All clinics</button> : null}{identity?.partnerId ? <a className={styles.secondary} href="/portal">My practice</a> : null}<Link className={styles.secondary} href="/clinics/register">Register a clinic</Link><button className={styles.secondary} onClick={async () => { const r = await fetch("/api/public/partner-portal/logout", { method: "POST" }); if (r.ok)
        window.location.assign("/login"); }}>Sign out</button></div></header>
 {error ? <p role="alert" className={styles.error}>{error}</p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}{busy ? <p role="status">Working…</p> : null}
 {!clinic ? <section className={styles.card}><h2>Your memberships</h2>{clinics.length ? clinics.map(c => <div className={styles.row} key={c.id}><div><strong>{c.name}</strong><p className={styles.muted}>{c.role} · {c.status}</p></div>{c.role === 'nurse' ? <a className={styles.secondary} href="/portal">Open my appointments</a> : <button className={styles.primary} disabled={busy} onClick={() => { setTab('Overview'); void load(c.id); }}>Open clinic →</button>}</div>) : <p className={styles.empty}>No clinics yet. Register your clinic or accept an invitation from its owner.</p>}</section> : <>
 <nav className={styles.tabs} aria-label="Clinic sections">{tabs.map(t => <button key={t} aria-pressed={t === tab} onClick={() => { setTab(t); setEditing(null); }}>{t}</button>)}</nav>
 {tab === 'Overview' ? <><section className={styles.hero}><span className={styles.badge}>{clinic.status}</span><h2>Care is a team effort.</h2><p>{clinic.status === 'approved' ? 'Invite your team, define coverage, and prepare your clinic’s public presence.' : 'Your application is awaiting approval by My Drip Nurse. You can prepare your branding and coverage now.'}</p></section><div className={styles.grid}><section className={styles.card}><h2>{data.members.filter(m => m.role === 'nurse' && m.status === 'active').length} active nurses</h2><button className={styles.secondary} onClick={() => setTab('Team')}>Manage team</button></section><section className={styles.card}><h2>Collection responsibility</h2><p>Your clinic collects the remaining balance and voluntary tips directly from the client. My Drip Nurse collects the booking deposit; it does not pay out the clinic’s remaining balance.</p></section></div></> : null}
 {tab === 'Team' ? <section className={styles.card}>{editing ? <><button className={styles.secondary} onClick={() => setEditing(null)}>← Team</button><h2>{editing.name}</h2><p>{editing.email} · {editing.status}</p>{editing.role === 'nurse' ? <ClinicCoverage value={editing.coverage} onChange={coverage => setEditing({ ...editing, coverage })}/> : null}<div className={styles.actions}><button disabled={busy || !editing.acceptedAt} className={styles.primary} onClick={() => void action({ action: 'member', id: editing.id, status: 'active', coverageIds: editing.coverage.map(r => r.id) }).then(ok => { if (ok)
            setEditing(null); })}>Authorize & save</button><button disabled={busy || !editing.acceptedAt} className={styles.secondary} onClick={() => void action({ action: 'member', id: editing.id, status: 'suspended', coverageIds: editing.coverage.map(r => r.id) }).then(ok => { if (ok)
            setEditing(null); })}>Suspend membership</button></div></> : <><h2>Your team</h2><p>Invite a nurse or manager. Existing professionals keep their account, website and calendar. An accepted invitation requires your authorization.</p><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void action({ action: 'invite', email: form.get('email'), role: form.get('role') }); }}><div className={styles.grid}><label className={styles.field}>Email<input name="email" type="email" required/></label><label className={styles.field}>Role<select name="role"><option value="nurse">Nurse</option><option value="manager">Clinic manager</option></select></label></div><button disabled={busy || clinic.status !== 'approved'} className={styles.primary}>Create invitation</button></form>{invitation ? <div className={styles.notice}><p>Share this private invitation with the intended recipient. It expires in 7 days.</p><input className={styles.search} readOnly value={invitation} aria-label="Private invitation link"/><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(invitation).then(() => setNotice('Invitation copied.'))}>Copy link</button></div> : null}{data.members.map(m => <div className={styles.row} key={m.id}><div><strong>{m.name}</strong><p className={styles.muted}>{m.role} · {m.status}</p></div>{m.role !== 'owner' ? <button className={styles.secondary} onClick={() => setEditing(m)}>Review member →</button> : null}</div>)}</>}</section> : null}
 {tab === 'Appointments' ? <section className={styles.card}><h2>Clinic appointments</h2><p>Only appointments booked under this clinic appear here. Nurses accept or decline from their own portal.</p>{data.appointments.length ? data.appointments.map(a => <div key={a.id} className={styles.row}><div><strong>{a.reference}</strong><p>{new Date(a.startsAt).toLocaleString('en-US')}</p><p>{a.customerName} · {a.nurseName || 'Assignment pending'}</p><details><summary>Contact details</summary><p>{a.customerEmail}<br />{a.customerPhone}</p></details></div><span className={styles.badge}>{a.status}</span><div><span>${Number(a.price).toFixed(2)} · deposit ${Number(a.deposit).toFixed(2)}</span><p className={styles.small}>{a.platformFunded === 'true' ? 'MDN-funded reward: collect $0 for the covered service.' : ['confirmed', 'partner_acknowledged', 'in_progress', 'completed'].includes(a.status) ? `Clinic balance: $${Math.max(0, Number(a.price) - Number(a.deposit)).toFixed(2)} + voluntary tip. Collection is handled by your clinic.` : 'No collection requested for this status.'}</p></div></div>) : <p className={styles.empty}>No clinic appointments yet.</p>}</section> : null}
 {tab === 'Services' ? <section className={styles.card}><h2>Services & pricing</h2><p>My Drip Nurse manages the services and regional prices for your clinic. Final prices are determined by the service address.</p>{data.services.map(s => <div key={s.id} className={styles.row}><strong>{s.name}</strong><span>{s.clinicPrice === null ? 'Uses My Drip Nurse regional pricing' : `Clinic default: $${Number(s.clinicPrice).toFixed(2)}`}</span></div>)}{!data.services.length ? <p className={styles.empty}>My Drip Nurse has not enabled any services for this clinic yet.</p> : null}</section> : null}
 {tab === 'Coverage' ? <section className={styles.card}><h2>Where your team provides care</h2><ClinicCoverage value={clinic.coverage} onChange={coverage => update({ coverage })}/><button className={styles.primary} disabled={busy} onClick={() => void save()}>Save coverage</button></section> : null}
 {tab === 'Website' ? <section className={styles.card}><h2>Make it yours</h2><div className={styles.grid}><div><label className={styles.field}>Clinic name<input value={clinic.name} onChange={e => update({ name: e.target.value })}/></label><label className={styles.field}>Logo URL<input type="url" value={clinic.logoUrl} onChange={e => update({ logoUrl: e.target.value })}/></label><label className={styles.field}>Upload logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
            return; setBusy(true); try {
            const form = new FormData();
            form.set('clinicId', clinic.id);
            form.set('file', file);
            const r = await fetch('/api/clinics/logo', { method: 'POST', body: form });
            const p = await r.json();
            if (!r.ok)
                throw new Error(p.error);
            update({ logoUrl: p.url });
            setNotice('Logo uploaded. Save your website to publish.');
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.');
        }
        finally {
            setBusy(false);
        } }}/></label><div className={styles.grid}><label className={styles.field}>Primary color<input type="color" value={clinic.primaryColor} onChange={e => update({ primaryColor: e.target.value })}/></label><label className={styles.field}>Accent color<input type="color" value={clinic.accentColor} onChange={e => update({ accentColor: e.target.value })}/></label></div><label className={styles.field}>About the clinic<textarea value={clinic.description} onChange={e => update({ description: e.target.value })}/></label><label className={styles.field}>Public contact email<input type="email" value={clinic.contactEmail} onChange={e => update({ contactEmail: e.target.value })}/></label><label className={styles.field}>Public phone<input value={clinic.contactPhone} onChange={e => update({ contactPhone: e.target.value })}/></label><label><input type="checkbox" checked={clinic.published} disabled={clinic.status !== 'approved'} onChange={e => update({ published: e.target.checked })}/> Publish website and directory listing</label></div><div className={styles.preview}><span className={styles.eyebrow}>Brand preview</span><div className={styles.hero}>{clinic.logoUrl ? <Image unoptimized width={120} height={120} className={styles.logo} src={clinic.logoUrl} alt="Clinic logo preview"/> : null}<h1>{clinic.name}</h1><p>{clinic.description || 'Your clinic’s introduction appears here.'}</p><span className={styles.primary}>Explore services →</span></div><p className={styles.small}>Powered by My Drip Nurse</p></div></div><div className={styles.actions}><button disabled={busy} className={styles.primary} onClick={() => void save()}>Save website</button>{clinic.published ? <a className={styles.secondary} href={`/clinics/${clinic.slug}`} target="_blank" rel="noreferrer">View website ↗</a> : null}</div></section> : null}
 </>}</main>;
}
