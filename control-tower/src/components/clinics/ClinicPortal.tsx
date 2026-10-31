'use client';
import { useState, type CSSProperties } from 'react';
import type { Clinic, ClinicMember } from '@/lib/clinics';
import { brandTextColor } from '@/lib/clinicPolicy';
import { ClinicPortalShell, type ClinicSection } from './ClinicPortalShell';
import { ClinicCoverage } from './ClinicCoverage';
import { ClinicDashboard } from './ClinicDashboard';
import { ClinicAffiliates } from './ClinicAffiliates';
import { CLINIC_AFFILIATE_POLICY_TEXT } from '@/lib/clinicAffiliatePolicy';
import styles from './clinic.module.css';
import branding from './clinicBranding.module.css';
import { ClinicWhiteLabel } from './ClinicWhiteLabel';
import { ClinicAccountPhoto } from './ClinicAccountPhoto';
type Workspace = {
    role: 'owner' | 'manager';
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
type ListedClinic = Clinic & { role?: string };
type ClinicIdentity = { partnerId: string; name: string; photoUrl?: string };
export function ClinicPortal({ bookingsEnabled = false, initialClinics, initialIdentity, initialWorkspace }: {
    bookingsEnabled?: boolean;
    initialWorkspace: Workspace;
    initialClinics: ListedClinic[];
    initialIdentity: ClinicIdentity;
}) {
    const [clinics, setClinics] = useState<ListedClinic[]>(initialClinics), [data, setData] = useState<Workspace | null>(initialWorkspace), [tab, setTab] = useState<ClinicSection>('Overview'), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [editing, setEditing] = useState<ClinicMember | null>(null), [invitation, setInvitation] = useState(''), [identity, setIdentity] = useState<ClinicIdentity>(initialIdentity);
    async function load(id?: string) { setBusy(true); setError(''); try {
        const r = await fetch(`/api/clinics${id ? `?id=${id}` : ''}`);
        const p = await r.json();
        if (!r.ok) {
            if (p.redirectTo) window.location.replace(p.redirectTo);
            throw new Error(p.error);
        }
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
    const [affiliateClinicId, setAffiliateClinicId] = useState('');
    const [profileTab, setProfileTab] = useState('details');
    const ownedClinics = clinics.filter(c => c.role === 'owner');
    const affiliateClinic = ownedClinics.find(c => c.id === affiliateClinicId) || (ownedClinics.length === 1 ? ownedClinics[0] : undefined);
    const clinic = data?.clinic;
    const theme = clinic ? { '--clinic-primary': clinic.primaryColor, '--clinic-accent': clinic.accentColor, '--clinic-ink': brandTextColor(clinic.primaryColor), '--clinic-accent-ink': brandTextColor(clinic.accentColor) } as CSSProperties : undefined;
    function update(patch: Partial<Clinic>) { setData(old => old ? { ...old, clinic: { ...old.clinic, ...patch } } : old); }
    const save = () => clinic && action({ action: 'save', ...clinic, coverageIds: clinic.coverage.map(r => r.id) });
    return <ClinicPortalShell clinic={clinic} theme={theme} section={tab} owner={data ? data.role === 'owner' : ownedClinics.length > 0} hasPractice={!!identity?.partnerId} accountName={identity?.name} accountPhotoUrl={identity?.photoUrl} busy={busy}
        onSection={next => { setTab(next); setEditing(null); }}

        onSignOut={() => { void fetch('/api/public/partner-portal/logout', { method: 'POST' }).then(r => { if (r.ok) window.location.assign('/login'); else setError('Unable to sign out. Please try again.'); }).catch(() => setError('Unable to sign out. Please try again.')); }}>
    <div className={`${styles.shell} ${styles.portalContent}`} style={theme}>

 {clinics.length > 1 ? <label className={styles.field}>Clinic workspace<select value={clinic?.id || ''} disabled={busy} onChange={e => { setTab('Overview'); setEditing(null); setInvitation(''); void load(e.target.value); }}>{clinics.map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select></label> : null}
 {!bookingsEnabled ? <p className={styles.setupNotice} role="status">Setup is open. Online clinic bookings are coming soon.</p> : null}
 {error ? <p role="alert" className={styles.error}>{error}</p> : null}{notice ? <p role="status" className={styles.notice}>{notice}</p> : null}{busy ? <p role="status">Working…</p> : null}
 {tab === 'Support' ? <section className={styles.card}><h2>How can we help?</h2><p>Contact the My Drip Nurse partner team for help with your clinic, team access or services.</p><a className={styles.primary} href="mailto:info@mydripnurse.com">Contact support →</a></section> : null}
 {!clinic && tab === 'Affiliates' ? <>
 <section className={styles.card}><span className={styles.eyebrow}>Your external network</span><h2>Clinic affiliates</h2><p>Invite independent nurses or other clinics. Earnings belong to the clinic you select below. Your own nursing team is not eligible for referral commissions.</p>{ownedClinics.length > 1 ? <label className={styles.field}>Clinic<select value={affiliateClinicId} onChange={event => setAffiliateClinicId(event.target.value)}><option value="">Choose your clinic</option>{ownedClinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}</section>
 {affiliateClinic ? <ClinicAffiliates key={affiliateClinic.id} clinicId={affiliateClinic.id} published={affiliateClinic.published}/> : <p className={styles.empty}>Choose a clinic you own to view its referral links and earnings.</p>}
 </> : null}
 {clinic && data ? <>

 {tab === 'Affiliates' && data.role === 'owner' ? <ClinicAffiliates key={clinic.id} clinicId={clinic.id} published={clinic.published}/> : null}
 {tab === 'Overview' ? clinic.status === 'approved' ? <ClinicDashboard key={clinic.id} clinic={clinic}/> : <section className={styles.card} aria-labelledby="clinic-review-title"><span className={styles.badge}>Application received</span><h2 id="clinic-review-title">Your clinic is under review.</h2><p>My Drip Nurse reviews every clinic before activation. Your application has been submitted to the Admin team. You can prepare your private profile, branding and coverage while you wait.</p><p>Team invitations, public listings and clinic operations become available after approval.</p><div className={styles.actions}><button className={styles.primary} onClick={() => setTab('Profile')}>Review clinic profile</button><button className={styles.secondary} disabled={busy} onClick={() => void load(clinic.id)}>Check approval status</button></div></section> : null}
 {tab === 'Team' ? <section className={styles.card}>{editing ? <><button className={styles.secondary} onClick={() => setEditing(null)}>← Team</button><h2>{editing.name}</h2><p>{editing.email} · {editing.status}</p><p className={styles.muted}>Verify professional credentials before authorizing this nurse. Their public profile appears when your clinic is published and their publication consent is recorded.</p>{editing.role === 'nurse' ? <ClinicCoverage value={editing.coverage} onChange={coverage => setEditing({ ...editing, coverage })}/> : null}<div className={styles.actions}><button disabled={busy || !editing.acceptedAt} className={styles.primary} onClick={() => void action({ action: 'member', id: editing.id, status: 'active', coverageIds: editing.coverage.map(r => r.id) }).then(ok => { if (ok)
            setEditing(null); })}>Authorize & save</button><button disabled={busy || !editing.acceptedAt} className={styles.secondary} onClick={() => void action({ action: 'member', id: editing.id, status: 'suspended', coverageIds: editing.coverage.map(r => r.id) }).then(ok => { if (ok)
            setEditing(null); })}>Suspend membership</button></div></> : <><h2>Your team</h2><p className={styles.notice}>{CLINIC_AFFILIATE_POLICY_TEXT}</p><p>Invite a nurse or manager. Existing professionals keep their account, website and calendar. Once an invited nurse activates their account, your authorization publishes their website and directory listing with their consent.</p><form onSubmit={e => { e.preventDefault(); const form = new FormData(e.currentTarget); void action({ action: 'invite', email: form.get('email'), role: form.get('role') }); }}><div className={styles.grid}><label className={styles.field}>Email<input name="email" type="email" required/></label><label className={styles.field}>Role<select name="role"><option value="nurse">Nurse</option><option value="manager">Clinic manager</option></select></label></div><button disabled={busy || clinic.status !== 'approved'} className={styles.primary}>Create invitation</button></form>{invitation ? <div className={styles.notice}><p>Share this private invitation with the intended recipient. It expires in 7 days.</p><input className={styles.search} readOnly value={invitation} aria-label="Private invitation link"/><button className={styles.secondary} onClick={() => void navigator.clipboard.writeText(invitation).then(() => setNotice('Invitation copied.'))}>Copy link</button></div> : null}{data.members.map(m => <div className={styles.row} key={m.id}><div><strong>{m.name}</strong><p className={styles.muted}>{m.role} · {m.status}{m.role === 'nurse' ? ` · ${m.publicationReady && clinic.published ? 'Website & directory live' : 'Publication pending'}` : ''}</p>{m.publicationReady && clinic.published && m.profileSlug ? <a href={`https://partners.mydripnurse.com/${m.profileSlug}`} target="_blank" rel="noreferrer">View professional website ↗</a> : null}</div>{m.role !== 'owner' ? <button className={styles.secondary} onClick={() => setEditing(m)}>Review member →</button> : null}</div>)}</>}</section> : null}
 {tab === 'Appointments' ? <section className={styles.card}><h2>Clinic appointments</h2><p>The 50 most recent appointments booked under this clinic appear here. Nurses accept or decline from their own portal. Dashboard totals include all visits in the selected reporting period.</p>{data.appointments.length ? data.appointments.map(a => <div key={a.id} className={styles.row}><div><strong>{a.reference}</strong><p>{new Date(a.startsAt).toLocaleString('en-US')}</p><p>{a.customerName} · {a.nurseName || 'Assignment pending'}</p><details><summary>Contact details</summary><p>{a.customerEmail}<br />{a.customerPhone}</p></details></div><span className={styles.badge}>{a.status}</span><div><span>{a.currency} {Number(a.price).toFixed(2)} · deposit {a.currency} {Number(a.deposit).toFixed(2)}</span><p className={styles.small}>{a.platformFunded === 'true' ? 'MDN-funded reward: collect $0 for the covered service.' : ['confirmed', 'partner_acknowledged', 'in_progress', 'completed'].includes(a.status) ? `Clinic balance: ${a.currency} ${Math.max(0, Number(a.price) - Number(a.deposit)).toFixed(2)} + voluntary tip. Collection is handled by your clinic.` : 'No collection requested for this status.'}</p></div></div>) : <p className={styles.empty}>No clinic appointments yet.</p>}</section> : null}
 {tab === 'Services' ? <section className={styles.card}><h2>Services & pricing</h2><p>My Drip Nurse manages the services and regional prices for your clinic. Final prices are determined by the service address.</p>{data.services.map(s => <div key={s.id} className={styles.row}><strong>{s.name}</strong><span>{s.clinicPrice === null ? 'Uses My Drip Nurse regional pricing' : `Clinic default: $${Number(s.clinicPrice).toFixed(2)}`}</span></div>)}{!data.services.length ? <p className={styles.empty}>My Drip Nurse has not enabled any services for this clinic yet.</p> : null}</section> : null}
 {tab === 'Coverage' ? <section className={styles.card}><h2>Where your team provides care</h2><ClinicCoverage value={clinic.coverage} onChange={coverage => update({ coverage })}/><button className={styles.primary} disabled={busy} onClick={() => void save()}>Save coverage</button></section> : null}

 {tab === 'Profile' ? <><nav className={branding.profileTabs} aria-label="Profile sections">{[['details', 'Clinic details'], ['branding', 'White Label'], ['account', 'My profile']].map(([value, label]) => <button type="button" key={value} aria-pressed={profileTab === value} disabled={busy} onClick={() => setProfileTab(value)}>{label}</button>)}</nav>{profileTab === 'branding' ? <ClinicWhiteLabel key={clinic.id} clinic={clinic} busy={busy} onSave={brand => action({ action: 'branding', ...brand })}/> : null}{profileTab === 'account' ? <ClinicAccountPhoto name={identity.name} photoUrl={identity.photoUrl || ''} onSaved={photoUrl => setIdentity(current => ({ ...current, photoUrl }))}/> : null}</> : null}
 {tab === 'Profile' && profileTab === 'details' ? <section className={styles.card}><h2>Your clinic details</h2><p>Your clinic email and phone are private and used only for internal coordination. Client inquiries and appointment requests go through My Drip Nurse.</p><label className={styles.field}>Clinic name<input value={clinic.name} onChange={e => update({ name: e.target.value })}/></label><label className={styles.field}>About the clinic<textarea value={clinic.description} onChange={e => update({ description: e.target.value })}/><span className={styles.muted}>Public introduction. Do not include direct contact details or external booking links.</span></label><div className={styles.grid}><label className={styles.field}>Private contact email<input type="email" value={clinic.contactEmail} onChange={e => update({ contactEmail: e.target.value })}/></label><label className={styles.field}>Private phone<input value={clinic.contactPhone} onChange={e => update({ contactPhone: e.target.value })}/></label></div><button disabled={busy} className={styles.primary} onClick={() => void save()}>Save clinic profile</button></section> : null}
 {tab === 'Directory' && clinic.status === 'approved' ? <ClinicDashboard key={clinic.id} clinic={clinic} directory/> : null}
 {tab === 'Rewards' || tab === 'Products' ? <section className={styles.card}><span className={styles.badge}>Coming soon</span><h2>{tab === 'Rewards' ? 'More possibilities for your clinic' : 'Products for your practice'}</h2><p>{tab === 'Rewards' ? 'Clinic rewards are not available yet. Your existing affiliate program remains available to the clinic owner.' : 'Clinic product ordering is not available yet. Your service catalog stays in Services.'}</p></section> : null}
 {tab === 'Website' ? <section className={styles.card}><h2>Your clinic website</h2><p>Your clinic website uses the logo and colors saved in your profile’s White Label tab.</p><div className={styles.actions}><button className={styles.secondary} onClick={() => { setProfileTab('branding'); setTab('Profile'); }}>Edit White Label →</button>{clinic.published && clinic.status === 'approved' ? <a className={styles.secondary} href={`/clinics/${clinic.slug}`} target="_blank" rel="noreferrer">View website ↗</a> : null}</div><p><label><input type="checkbox" checked={clinic.published} disabled={clinic.status !== 'approved' || busy} onChange={e => update({ published: e.target.checked })}/> Publish website and directory listing</label></p><button disabled={busy} className={styles.primary} onClick={() => void save()}>Save website</button></section> : null}
 </> : null}</div></ClinicPortalShell>;
}
