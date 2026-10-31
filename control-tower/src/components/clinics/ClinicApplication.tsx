'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { PartnerExperience } from '@/components/partner/PartnerBrand';
import { ClinicCoverage } from './ClinicCoverage';
import { PRICING_STATES, type PricingRegion } from '@/lib/regionalPricing';
import { CLINIC_AFFILIATE_POLICY_TEXT, CLINIC_AFFILIATE_POLICY_VERSION } from '@/lib/clinicAffiliatePolicy';
import styles from './clinicApplication.module.css';
import clinicStyles from './clinic.module.css';

type Props = { signedIn: boolean; accountName: string; accountEmail: string; referralCode: string };
const steps = ['Your clinic', 'Locations', 'Your contact', 'Review & submit'];
const catalogCache = new Map<string, PricingRegion[]>();

export function ClinicApplication({ signedIn, accountName, accountEmail, referralCode }: Props) {
    const [step, setStep] = useState(0);
    const [fields, setFields] = useState({ name: '', slug: '', description: '', fullName: accountName, email: accountEmail, contactEmail: accountEmail, contactPhone: '' });
    const [state, setState] = useState(''), [county, setCounty] = useState(''), [location, setLocation] = useState<PricingRegion | null>(null);
    const [regions, setRegions] = useState<PricingRegion[]>([]), [coverage, setCoverage] = useState<PricingRegion[]>([]);
    const [loading, setLoading] = useState(false), [loadError, setLoadError] = useState(''), [retry, setRetry] = useState(0);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
    const form = useRef<HTMLFormElement>(null), title = useRef<HTMLHeadingElement>(null), submitting = useRef(false), slugEdited = useRef(false);
    useEffect(() => {
        if (!state) return;
        const controller = new AbortController();
        async function load() {
            setLoading(true); setLoadError('');
            try {
                let items = catalogCache.get(state);
                if (!items) {
                    const response = await fetch(`/api/public/clinic-locations?state=${encodeURIComponent(state)}`, { signal: controller.signal });
                    const payload = await response.json();
                    if (!response.ok) throw new Error(payload.error || 'Unable to load locations.');
                    items = payload.regions as PricingRegion[];
                    catalogCache.set(state, items);
                }
                if (!controller.signal.aborted) setRegions(items);
            } catch { if (!controller.signal.aborted) setLoadError('We could not load the locations. Please try again.'); }
            finally { if (!controller.signal.aborted) setLoading(false); }
        }
        void load(); return () => controller.abort();
    }, [state, retry]);
    const counties = regions.filter(r => r.state === state && r.level === 'county');
    const cities = regions.filter(r => r.state === state && r.level === 'city' && (!counties.length || r.county === county));
    const selectedCoverage = [...new Map([...(location ? [location] : []), ...coverage].map(r => [r.id, r])).values()];
    const primaryLabel = location ? [location.city, location.county ? `${location.county} ${location.state === 'Louisiana' ? 'Parish' : 'County'}` : '', location.state].filter(Boolean).join(', ') : '';
    function change(key: keyof typeof fields, value: string) { setFields(old => ({ ...old, [key]: value })); }
    function go(next: number) { setStep(next); setError(''); requestAnimationFrame(() => title.current?.focus()); }
    function continueStep() {
        if (!form.current?.reportValidity()) return;
        if (step === 1 && !location) { setError('Select the city or municipality where your clinic operates.'); return; }
        if (selectedCoverage.length > 500) { setError('Select up to 500 areas. Use an entire state or county for broader coverage.'); return; }
        go(step + 1);
    }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (step < 3) { continueStep(); return; }
        if (submitting.current) return;
        if (!location) { setError('Choose your operating city before submitting.'); return; }
        const data = new FormData(event.currentTarget);
        if (!signedIn && data.get('password') !== data.get('confirmPassword')) { setError('The passwords do not match.'); return; }
        submitting.current = true; setBusy(true); setError('');
        try {
            const response = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...fields, action: 'register', locationId: location.id, coverageIds: selectedCoverage.map(r => r.id), referralCode, password: signedIn ? undefined : data.get('password'), affiliatePolicyAccepted: data.get('affiliatePolicyAccepted') === 'on', affiliatePolicyVersion: CLINIC_AFFILIATE_POLICY_VERSION }) });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Unable to submit your application.');
            setDone(true);
        } catch (err) { setError(err instanceof Error ? err.message : 'Unable to submit your application. Please try again.'); }
        finally { submitting.current = false; setBusy(false); }
    }
    return <PartnerExperience><div className={styles.page}>
        <header className={styles.header}><Link href="/" aria-label="My Drip Nurse home"><Image src="/mdn-logo.png" width={240} height={51} alt="My Drip Nurse" priority/></Link><Link href={signedIn ? '/portal' : '/login?role=clinic'}>{signedIn ? '← Back to my portal' : 'Already registered? Log in →'}</Link></header>
        <main className={styles.layout}>
            <aside className={styles.intro}><span className={styles.eyebrow}>FOR CLINICS & CARE TEAMS</span><h1>Your clinic.<br/>{' '}A wider <em>reach.</em></h1><p>Bring your team to My Drip Nurse. Tell us about your clinic and the communities you serve.</p><ul><li>Your clinic’s branded presence</li><li>A connected nursing team</li><li>Visibility across the USA & Puerto Rico</li></ul><div className={styles.reviewNote}><strong>Reviewed by My Drip Nurse</strong><p>Your application is reviewed before your clinic, team and public website are activated.</p></div><Link href="/directory/clinics">Explore the clinic directory ↗</Link></aside>
            <section className={styles.panel} aria-label="Clinic application">
                {done ? <div className={styles.success} role="status"><span className={styles.check} aria-hidden="true">✓</span><span className={styles.eyebrow}>APPLICATION RECEIVED</span><h2>Thank you, {fields.fullName.split(' ')[0]}.</h2><p>My Drip Nurse will review <strong>{fields.name}</strong> and its service areas. Your clinic is pending approval and is not yet visible in the public directory.</p><p>You can sign in to check your application status. Team invitations and publication become available after approval.</p><Link className={styles.primary} href={signedIn ? '/portal/clinics' : '/login?role=clinic'}>View application status →</Link></div> : <>
                    <ol className={styles.progress} aria-label="Application progress">{steps.map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined} data-complete={i < step || undefined}><span>{i < step ? '✓' : `0${i + 1}`}</span>{label}</li>)}</ol>
                    <form ref={form} onSubmit={submit} aria-busy={busy}>
                        <span className={styles.eyebrow}>STEP {step + 1} OF 4</span><h2 ref={title} tabIndex={-1}>{['Tell us about your clinic.', 'Where do you operate?', 'How can we reach you?', 'One last look.'][step]}</h2>
                        <p className={styles.lead}>{['Start with the details that introduce your practice.', 'Choose your primary operating city and all the areas your team serves.', 'These details are private. Client inquiries always go through My Drip Nurse.', signedIn ? 'Review your application and confirm the clinic affiliate policy.' : 'Review your details and create your login to follow your application.'][step]}</p>
                        <fieldset className={styles.fields} disabled={busy}>
                        {step === 0 ? <>
                            <label>Clinic name<input name="name" autoComplete="organization" value={fields.name} required minLength={2} maxLength={120} onChange={e => { const value = e.target.value; setFields(old => ({ ...old, name: value, ...(!slugEdited.current ? { slug: value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) } : {}) })); }}/></label>
                            <label>Clinic website address<input name="slug" value={fields.slug} required minLength={3} maxLength={80} pattern="[a-z0-9]+(-[a-z0-9]+)*" onChange={e => { slugEdited.current = true; change('slug', e.target.value); }}/><small>partners.mydripnurse.com/clinics/{fields.slug || 'your-clinic'}</small></label>
                            <label>About your clinic<textarea name="description" value={fields.description} required minLength={20} maxLength={4000} rows={4} onChange={e => change('description', e.target.value)} placeholder="Tell us about your clinic, your team and the care you provide."/><small>This introduction may appear on your public website after approval. Leave out direct phone numbers, emails and booking links.</small></label>
                            {signedIn ? <p className={styles.note}>You are using your existing account. Your nurse profile, appointments and history stay with you.</p> : <p className={styles.note}>Already a nurse in our network? <Link href="/login?role=nurse">Sign in to your existing account</Link> before registering your clinic.</p>}
                        </> : null}
                        {step === 1 ? <>
                            <div className={styles.grid}><label>State / territory<select value={state} required onChange={e => { setState(e.target.value); setCounty(''); setLocation(null); setRegions([]); setLoadError(''); }}><option value="">Choose a state or territory</option>{PRICING_STATES.map(s => <option key={s}>{s}</option>)}</select></label>
                            {state && counties.length > 0 ? <label>{state === 'Louisiana' ? 'Parish' : state === 'Alaska' ? 'Borough / census area' : 'County'}<select required value={county} disabled={loading} onChange={e => { setCounty(e.target.value); setLocation(null); }}><option value="">Choose a region</option>{counties.map(r => <option key={r.id} value={r.county}>{r.county}</option>)}</select></label> : null}</div>
                            <label>{state === 'Puerto Rico' ? 'Primary municipality' : 'Primary operating city'}<select required value={location?.id || ''} disabled={!state || loading || (!!counties.length && !county)} onChange={e => setLocation(cities.find(r => r.id === e.target.value) || null)}><option value="">{loading ? 'Loading locations…' : 'Choose a city / municipality'}</option>{cities.map(r => <option key={r.id} value={r.id}>{r.city}</option>)}</select></label>
                            {loadError ? <div className={styles.error} role="alert">{loadError} <button type="button" onClick={() => setRetry(n => n + 1)}>Try again</button></div> : null}
                            {location ? <p className={styles.note}><strong>{primaryLabel}</strong> is included in your initial service coverage. Add other locations below, including areas in other states.</p> : null}
                            <div className={`${clinicStyles.shell} ${clinicStyles.portalContent} ${styles.coverage}`}><ClinicCoverage publicCatalog value={coverage} onChange={setCoverage}/></div>
                        </> : null}
                        {step === 2 ? <>
                            <label>Your full name<input name="fullName" autoComplete="name" required minLength={2} maxLength={120} value={fields.fullName} onChange={e => change('fullName', e.target.value)}/></label>
                            <label>Your login email<input name="email" type="email" autoComplete="email" required maxLength={254} value={fields.email} readOnly={signedIn} onChange={e => change('email', e.target.value)}/></label>
                            <div className={styles.grid}><label>Private clinic email<input name="contactEmail" type="email" required maxLength={254} value={fields.contactEmail} onChange={e => change('contactEmail', e.target.value)}/></label><label>Private clinic phone<input name="contactPhone" type="tel" autoComplete="tel" required minLength={7} maxLength={40} value={fields.contactPhone} onChange={e => change('contactPhone', e.target.value)} placeholder="+1 (555) 555-0123"/></label></div>
                            <p className={styles.note}>Your clinic email and phone are used for internal coordination only. They will not be displayed on your public clinic website.</p>
                        </> : null}
                        {step === 3 ? <>
                            <div className={styles.summary}><div><span>Clinic</span><strong>{fields.name}</strong><button type="button" onClick={() => go(0)}>Edit clinic</button></div><div><span>Primary operating city</span><strong>{primaryLabel}</strong><small>{selectedCoverage.length} selected service {selectedCoverage.length === 1 ? 'area' : 'areas'}</small><details><summary>Review all areas</summary><ul>{selectedCoverage.map(r => <li key={r.id}>{r.label}</li>)}</ul></details><button type="button" onClick={() => go(1)}>Edit locations</button></div><div><span>Private contact</span><strong>{fields.fullName}</strong><small>{fields.email}<br/>{fields.contactEmail} · {fields.contactPhone}</small><button type="button" onClick={() => go(2)}>Edit contact</button></div></div>
                            {!signedIn ? <div className={styles.grid}><label>Create password<input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200}/><small>At least 10 characters, with uppercase, lowercase and a number.</small></label><label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={10} maxLength={200}/></label></div> : null}
                            <div className={styles.policy}><h3>Clinic affiliate policy</h3><p>{CLINIC_AFFILIATE_POLICY_TEXT}</p><p>Existing nurses must accept an invitation to join your team. Registering a clinic does not move them automatically.</p><label className={styles.consent}><input type="checkbox" name="affiliatePolicyAccepted" required/><span>I understand and accept the affiliate policy for my clinic’s own team.</span></label></div>
                        </> : null}
                        </fieldset>
                        {error ? <p className={styles.error} role="alert">{error}</p> : null}
                        <div className={styles.actions}>{step > 0 ? <button type="button" className={styles.back} disabled={busy} onClick={() => go(step - 1)}>← Back</button> : <Link className={styles.back} href={signedIn ? '/portal' : '/'}>← Return</Link>}<button className={styles.primary} disabled={busy || (step === 1 && (loading || !location))} type="submit">{busy ? 'Submitting…' : step === 3 ? 'Accept & submit application →' : 'Continue →'}</button></div>
                        <p className={styles.finePrint}>Your application does not activate bookings or publish your clinic. My Drip Nurse approval is required.</p>
                    </form>
                </>}
            </section>
        </main>
    </div></PartnerExperience>;
}
