'use client';
import { clinicScreenUrl, parseClinicScreen } from '@/lib/clinicPortalRoutes';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Clinic, ClinicMember } from '@/lib/clinics';
import { brandTextColor } from '@/lib/clinicPolicy';
import { ClinicPortalShell, type ClinicSection } from './ClinicPortalShell';
import { ClinicServiceCatalog, type ClinicService } from './ClinicServiceCatalog';
import { ClinicTeam } from './ClinicTeam';
import { ClinicCoverage } from './ClinicCoverage';
import { ClinicCalendar } from './ClinicCalendar';
import { ClinicDashboard } from './ClinicDashboard';
import { ClinicAffiliates } from './ClinicAffiliates';
import styles from './clinic.module.css';
import branding from './clinicBranding.module.css';
import { ClinicWebsiteEditor } from './ClinicWebsiteEditor';
import { ClinicWhiteLabel } from './ClinicWhiteLabel';
import { ClinicOwnerPractice } from './ClinicOwnerPractice';
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
    services: ClinicService[];
};
type ListedClinic = Clinic & { role?: string };
type ClinicIdentity = { partnerId: string; name: string; photoUrl?: string };
export function ClinicPortal({ bookingsEnabled = false, initialClinics, initialIdentity, initialWorkspace, initialAppointment, initialSection = 'Overview', initialProfileTab = 'details' }: {
    initialSection?: ClinicSection;
    initialProfileTab?: string;
    bookingsEnabled?: boolean;
    initialAppointment?: string;
    initialWorkspace: Workspace;
    initialClinics: ListedClinic[];
    initialIdentity: ClinicIdentity;
}) {
    const [clinics, setClinics] = useState<ListedClinic[]>(initialClinics), [data, setData] = useState<Workspace | null>(initialWorkspace), [tab, setTab] = useState<ClinicSection>(initialSection), [error, setError] = useState(''), [notice, setNotice] = useState<{ message: string } | null>(null), [busy, setBusy] = useState(false), [identity, setIdentity] = useState<ClinicIdentity>(initialIdentity);
    const [focusAppointment, setFocusAppointment] = useState<{id:string;request:number} | undefined>(initialAppointment ? {id:initialAppointment,request:0} : undefined);
    const [myAppointmentsId, setMyAppointmentsId] = useState<string | undefined>();
    const [notificationRevision, setNotificationRevision] = useState(0);
    useEffect(() => {
        if (!notice) return;
        const timeout = window.setTimeout(() => setNotice(null), 4000);
        return () => window.clearTimeout(timeout);
    }, [notice]);
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
    async function action(body: Record<string, unknown>) { setBusy(true); setError(''); setNotice(null); try {
        const r = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, clinicId: data?.clinic.id }) });
        const p = await r.json();
        if (!r.ok)
            throw new Error(p.error);
        setNotice({ message: 'Changes saved.' });
        if (data)
            await load(data.clinic.id);
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
    const [profileTab, setProfileTab] = useState(initialProfileTab);
    function navigate(section: ClinicSection, profile = profileTab, appointment?: string) {
        if (!data) return;
        window.history.pushState(null, '', clinicScreenUrl(section, data.clinic.id, profile, appointment));
        setTab(section);
        setProfileTab(profile);
        setFocusAppointment(appointment ? { id: appointment, request: Date.now() } : undefined);
    }
    useEffect(() => {
        function restoreRoute() {
            const url = new URL(window.location.href);
            const route = parseClinicScreen(url.pathname.replace(/^\/(?:portal\/clinics|clinic-portal)\/?/, '').split('/').filter(Boolean));
            if (!route) return;
            const clinicId = url.searchParams.get('clinic');
            if (clinicId && clinicId !== initialWorkspace.clinic.id) { window.location.reload(); return; }
            setTab(route.section);
            setProfileTab(route.profile);
            const appointment = url.searchParams.get('appointment');
            setFocusAppointment(appointment ? { id: appointment, request: Date.now() } : undefined);
        }
        window.addEventListener('popstate', restoreRoute);
        return () => window.removeEventListener('popstate', restoreRoute);
    }, [initialWorkspace.clinic.id]);
    const ownedClinics = clinics.filter(c => c.role === 'owner');
    const affiliateClinic = ownedClinics.find(c => c.id === affiliateClinicId) || (ownedClinics.length === 1 ? ownedClinics[0] : undefined);
    const clinic = data?.clinic;
    const theme = clinic ? { '--clinic-primary': clinic.primaryColor, '--clinic-accent': clinic.accentColor, '--clinic-ink': brandTextColor(clinic.primaryColor), '--clinic-accent-ink': brandTextColor(clinic.accentColor) } as CSSProperties : undefined;
    function update(patch: Partial<Clinic>) { setData(old => old ? { ...old, clinic: { ...old.clinic, ...patch } } : old); }
    const save = () => clinic && action({ action: 'save', ...clinic, coverageIds: clinic.coverage.map(r => r.id) });
    return <ClinicPortalShell clinic={clinic} theme={theme} section={tab} owner={data ? data.role === 'owner' : ownedClinics.length > 0} hasPractice={!!identity?.partnerId} accountName={identity?.name} accountPhotoUrl={identity?.photoUrl} busy={busy} notificationRevision={notificationRevision} onAppointment={id => navigate('Appointments', profileTab, id)}
        onSection={next => navigate(next)}

        onSignOut={() => { void fetch('/api/public/partner-portal/logout', { method: 'POST' }).then(r => { if (r.ok) window.location.assign('/login'); else setError('Unable to sign out. Please try again.'); }).catch(() => setError('Unable to sign out. Please try again.')); }}>
    <div className={`${styles.shell} ${styles.portalContent}`} style={theme}>

 {clinics.length > 1 ? <label className={styles.field}>Clinic workspace<select value={clinic?.id || ''} disabled={busy} onChange={e => window.location.assign(clinicScreenUrl('Overview', e.target.value))}>{clinics.map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}</select></label> : null}
 {error ? <p role="alert" className={styles.error}>{error}</p> : null}{notice ? <div role="status" aria-live="polite" aria-atomic="true" className={styles.saveToast}><span className={styles.saveToastIcon} aria-hidden="true">✓</span><span>{notice.message}</span></div> : null}{busy ? <p role="status">Working…</p> : null}
 {tab === 'Support' ? <section className={styles.card}><h2>How can we help?</h2><p>Contact the My Drip Nurse partner team for help with your clinic, team access or services.</p><a className={styles.primary} href="mailto:info@mydripnurse.com">Contact support →</a></section> : null}
 {!clinic && tab === 'Affiliates' ? <>
 <section className={styles.card}><span className={styles.eyebrow}>Your external network</span><h2>Clinic affiliates</h2><p>Invite independent nurses or other clinics. Earnings belong to the clinic you select below. Your own nursing team is not eligible for referral commissions.</p>{ownedClinics.length > 1 ? <label className={styles.field}>Clinic<select value={affiliateClinicId} onChange={event => setAffiliateClinicId(event.target.value)}><option value="">Choose your clinic</option>{ownedClinics.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label> : null}</section>
 {affiliateClinic ? <ClinicAffiliates key={affiliateClinic.id} clinicId={affiliateClinic.id} published={affiliateClinic.published}/> : <p className={styles.empty}>Choose a clinic you own to view its referral links and earnings.</p>}
 </> : null}
 {clinic && data ? <>

 {tab === 'Affiliates' ? <ClinicAffiliates key={clinic.id} clinicId={clinic.id} published={clinic.published}/> : null}
 {tab === 'Overview' ? clinic.status === 'approved' ? <ClinicDashboard key={clinic.id} clinic={clinic}/> : <section className={styles.card} aria-labelledby="clinic-review-title"><span className={styles.badge}>Application received</span><h2 id="clinic-review-title">Your clinic is under review.</h2><p>My Drip Nurse reviews every clinic before activation. Your application has been submitted to the Admin team. You can prepare your private profile, branding and coverage while you wait.</p><p>Team invitations, public listings and clinic operations become available after approval.</p><div className={styles.actions}><button className={styles.primary} onClick={() => navigate('Profile')}>Review clinic profile</button><button className={styles.secondary} disabled={busy} onClick={() => void load(clinic.id)}>Check approval status</button></div></section> : null}
 {tab === 'Team' ? <ClinicTeam key={clinic.id} clinic={clinic} services={data.services} owner={data.role === 'owner'}/> : null}
 {tab === 'Appointments' && clinic.status === 'approved' ? <ClinicCalendar key={clinic.id} clinicId={clinic.id} focusAppointment={focusAppointment} myNurseId={myAppointmentsId} onChange={() => setNotificationRevision(value => value + 1)} /> : null}
 {tab === 'Services' ? <ClinicServiceCatalog key={data.clinic.id} clinicId={data.clinic.id} services={data.services} onRefresh={() => load(data.clinic.id)} /> : null}
 {tab === 'Coverage' ? <section className={styles.card}><h2>Where your team provides care</h2><ClinicCoverage value={clinic.coverage} onChange={coverage => update({ coverage })}/><button className={styles.primary} disabled={busy} onClick={() => void save()}>Save coverage</button></section> : null}

 {tab === 'Profile' ? <><nav className={branding.profileTabs} aria-label="Profile sections">{[['details', 'Clinic details'], ['branding', 'White Label'], ['account', 'My profile'], ...(data.role === 'owner' ? [['practice', 'My nursing practice']] : [])].map(([value, label]) => <button type="button" key={value} aria-pressed={profileTab === value} disabled={busy} onClick={() => navigate('Profile', value)}>{label}</button>)}</nav>{profileTab === 'branding' ? <ClinicWhiteLabel key={clinic.id} clinic={clinic} busy={busy} onSave={brand => action({ action: 'branding', ...brand })}/> : null}{profileTab === 'practice' && data.role === 'owner' ? <ClinicOwnerPractice key={clinic.id} clinicId={clinic.id} approved={clinic.status === 'approved'} bookingsEnabled={bookingsEnabled} services={data.services} onAppointments={partnerId => { setMyAppointmentsId(partnerId); navigate('Appointments'); }} /> : null}{profileTab === 'account' ? <ClinicAccountPhoto name={identity.name} photoUrl={identity.photoUrl || ''} onSaved={photoUrl => setIdentity(current => ({ ...current, photoUrl }))}/> : null}</> : null}
 {tab === 'Profile' && profileTab === 'details' ? <section className={styles.card}><h2>Your clinic details</h2><p>Your clinic email and phone are private and used only for internal coordination. Client inquiries and appointment requests go through My Drip Nurse.</p><label className={styles.field}>Clinic name<input value={clinic.name} onChange={e => update({ name: e.target.value })}/></label><label className={styles.field}>About the clinic<textarea value={clinic.description} onChange={e => update({ description: e.target.value })}/><span className={styles.muted}>Public introduction. Do not include direct contact details or external booking links.</span></label><div className={styles.grid}><label className={styles.field}>Private contact email<input type="email" value={clinic.contactEmail} onChange={e => update({ contactEmail: e.target.value })}/></label><label className={styles.field}>Private phone<input value={clinic.contactPhone} onChange={e => update({ contactPhone: e.target.value })}/></label></div><button disabled={busy} className={styles.primary} onClick={() => void save()}>Save clinic profile</button></section> : null}
 {tab === 'Directory' && clinic.status === 'approved' ? <ClinicDashboard key={clinic.id} clinic={clinic} directory/> : null}
 {tab === 'Rewards' || tab === 'Products' ? <section className={styles.card}><span className={styles.badge}>Coming soon</span><h2>{tab === 'Rewards' ? 'More possibilities for your clinic' : 'Products for your practice'}</h2><p>{tab === 'Rewards' ? 'Clinic rewards are not available yet. Your existing affiliate program remains available to the clinic owner.' : 'Clinic product ordering is not available yet. Your service catalog stays in Services.'}</p></section> : null}
 {tab === 'Website' ? <ClinicWebsiteEditor key={clinic.id} clinic={clinic} busy={busy} onSave={settings => action({ action: 'website', ...settings })}/> : null}
 </> : null}</div></ClinicPortalShell>;
}
