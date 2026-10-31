'use client';
import { useEffect, useState } from 'react';
import styles from './clinic.module.css';
import { CLINIC_AFFILIATE_POLICY_TEXT, CLINIC_AFFILIATE_POLICY_VERSION } from '@/lib/clinicAffiliatePolicy';
export function ClinicRegistration({ invite = false, signedIn = false, accountName = '', accountEmail = '', referralCode = '' }: {
    invite?: boolean;
    signedIn?: boolean;
    accountName?: string;
    accountEmail?: string;
    referralCode?: string;
}) {
    const [token, setToken] = useState(''), [error, setError] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
    useEffect(() => { if (invite)
        setToken(window.location.hash.slice(1)); }, [invite]);
    return <main className={styles.shell}><a href={signedIn ? "/portal" : "/login"}>{signedIn ? "← Back to my portal" : "← Sign in"}</a><section className={styles.card}><span className={styles.eyebrow}>My Drip Nurse · Clinic partners</span><h1>{invite ? 'Join your clinic’s team' : 'Bring your clinic to My Drip Nurse'}</h1>{done ? <p className={styles.notice}>{invite ? 'Account activated. Once your clinic authorizes you, your professional website and directory listing will be published automatically if you consented below.' : 'Application received. My Drip Nurse will review your clinic before your team and website go live.'} <a href={signedIn ? (invite ? "/portal" : "/portal/clinics") : "/login"}>{signedIn ? (invite ? "Open my portal →" : "View application status →") : "Sign in to your portal →"}</a></p> : <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); const body = Object.fromEntries(new FormData(e.currentTarget)); try {
            const r = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, referralCode: invite ? undefined : referralCode, action: invite ? 'accept' : 'register', token, publicProfileConsent: body.publicProfileConsent === 'on', affiliatePolicyAccepted: body.affiliatePolicyAccepted === 'on', affiliatePolicyVersion: CLINIC_AFFILIATE_POLICY_VERSION }) });
            const p = await r.json();
            if (!r.ok)
                throw new Error(p.error);
            setDone(true);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to submit.');
        }
        finally {
            setBusy(false);
        } }}>
 <p>{invite ? 'Use the email address that received the invitation. If you already have a partner account, sign in first and reopen this invitation.' : signedIn ? 'Add a clinic to your existing account. Your professional website, availability, appointments and personal referral history stay with you. My Drip Nurse will review the clinic before activation.' : 'Create your clinic workspace. Existing partners should sign in first to keep one account.'}</p>
 <div className={styles.grid}><label className={styles.field}>Your full name<input name="fullName" defaultValue={accountName} required maxLength={120}/></label><label className={styles.field}>Your account email<input name="email" type="email" defaultValue={accountEmail} readOnly={signedIn && !!accountEmail} required maxLength={254}/></label></div>{!signedIn ? <label className={styles.field}>Password<input name="password" type="password" autoComplete="new-password" minLength={10} maxLength={200} required/><span className={styles.muted}>At least 10 characters with uppercase, lowercase and a number.</span></label> : null}
 {invite ? <><label className={styles.field}>Mobile number (new nurses)<input name="phone" type="tel" placeholder="+15555550123" maxLength={32}/><span className={styles.muted}>Include the country code for appointment notifications.</span></label><label className={styles.field}>Public professional credentials (nurses)<input name="credentials" placeholder="RN, BSN" maxLength={250}/></label></> : <><div className={styles.grid}><label className={styles.field}>Clinic name<input name="name" required maxLength={120}/></label><label className={styles.field}>Website address<input name="slug" placeholder="your-clinic" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={80} required/><span className={styles.muted}>partners.mydripnurse.com/clinics/your-clinic</span></label><label className={styles.field}>Private clinic email<input name="contactEmail" type="email" required/></label><label className={styles.field}>Private clinic phone<input name="contactPhone" maxLength={40}/></label></div><p className={styles.muted}>Your clinic email and phone are for internal coordination only and will not be displayed to clients. All inquiries go through My Drip Nurse.</p><label className={styles.field}>About your clinic<textarea name="description" maxLength={4000}/><span className={styles.muted}>Public introduction. Do not include direct contact details or external booking links.</span></label></>}
 {invite ? <label className={styles.field}><span><input type="checkbox" name="publicProfileConsent"/> I agree to publish my professional website and appear in the My Drip Nurse and clinic directories after clinic authorization.</span></label> : null}
 {!invite ? <section className={styles.notice} aria-labelledby="clinic-affiliate-policy-title"><h2 id="clinic-affiliate-policy-title">Before you register your clinic</h2><p>{CLINIC_AFFILIATE_POLICY_TEXT}</p><p>Registering a clinic does not automatically move your referred nurses into its team. Existing nurses must accept an invitation.</p><label className={styles.policyConsent}><input type="checkbox" name="affiliatePolicyAccepted" required/><span>I understand and accept the change to affiliate earnings for my own clinic team.</span></label></section> : null}
 {error ? <p className={styles.error} role="alert">{error}</p> : null}<div className={styles.actions}><button className={styles.primary} disabled={busy || (invite && !token)}>{busy ? 'Submitting…' : invite ? 'Accept invitation' : 'Accept & submit clinic application'}</button>{!invite && !busy ? <a className={styles.secondary} href={signedIn ? '/portal/profile' : '/login'}>Decline & return</a> : null}</div></form>}</section></main>;
}
