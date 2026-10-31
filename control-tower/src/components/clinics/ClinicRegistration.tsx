'use client';
import { useEffect, useState } from 'react';
import styles from './clinic.module.css';
export function ClinicRegistration({ invite = false, signedIn = false, accountName = '', accountEmail = '' }: {
    invite?: boolean;
    signedIn?: boolean;
    accountName?: string;
    accountEmail?: string;
}) {
    const [token, setToken] = useState(''), [error, setError] = useState(''), [done, setDone] = useState(false), [busy, setBusy] = useState(false);
    useEffect(() => { if (invite)
        setToken(window.location.hash.slice(1)); }, [invite]);
    return <main className={styles.shell}><a href={signedIn ? "/portal/clinics" : "/login"}>{signedIn ? "← My clinics" : "← Sign in"}</a><section className={styles.card}><span className={styles.eyebrow}>My Drip Nurse · Clinic partners</span><h1>{invite ? 'Join your clinic’s team' : 'Bring your clinic to My Drip Nurse'}</h1>{done ? <p className={styles.notice}>{invite ? 'Account activated. Once your clinic authorizes you, your professional website and directory listing will be published automatically if you consented below.' : 'Application received. My Drip Nurse will review your clinic before your team and website go live.'} <a href={signedIn ? "/portal/clinics" : "/login"}>{signedIn ? "Open clinic workspace →" : "Sign in to your portal →"}</a></p> : <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); const body = Object.fromEntries(new FormData(e.currentTarget)); try {
            const r = await fetch('/api/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, action: invite ? 'accept' : 'register', token, publicProfileConsent: body.publicProfileConsent === 'on' }) });
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
 {invite ? <><label className={styles.field}>Mobile number (new nurses)<input name="phone" type="tel" placeholder="+15555550123" maxLength={32}/><span className={styles.muted}>Include the country code for appointment notifications.</span></label><label className={styles.field}>Public professional credentials (nurses)<input name="credentials" placeholder="RN, BSN" maxLength={250}/></label></> : <><div className={styles.grid}><label className={styles.field}>Clinic name<input name="name" required maxLength={120}/></label><label className={styles.field}>Website address<input name="slug" placeholder="your-clinic" pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={80} required/><span className={styles.muted}>partners.mydripnurse.com/clinics/your-clinic</span></label><label className={styles.field}>Public clinic email<input name="contactEmail" type="email" required/></label><label className={styles.field}>Clinic phone<input name="contactPhone" maxLength={40}/></label></div><label className={styles.field}>About your clinic<textarea name="description" maxLength={4000}/></label></>}
 {invite ? <label className={styles.field}><span><input type="checkbox" name="publicProfileConsent"/> I agree to publish my professional website and appear in the My Drip Nurse and clinic directories after clinic authorization.</span></label> : null}
 {error ? <p className={styles.error} role="alert">{error}</p> : null}<button className={styles.primary} disabled={busy || (invite && !token)}>{busy ? 'Submitting…' : invite ? 'Accept invitation' : 'Submit clinic application'}</button></form>}</section></main>;
}
