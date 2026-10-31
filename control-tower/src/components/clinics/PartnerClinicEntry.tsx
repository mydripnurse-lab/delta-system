'use client';
import Link from 'next/link';
import { useEffect, useState, useSyncExternalStore } from 'react';
import styles from './partnerClinicEntry.module.css';

const changed = 'mdn-clinic-invitation-dismissed';
function subscribe(update: () => void) {
    window.addEventListener('storage', update);
    window.addEventListener(changed, update);
    return () => { window.removeEventListener('storage', update); window.removeEventListener(changed, update); };
}
export function PartnerClinicEntry({ profileId }: { profileId: string }) {
    const key = `mdn-clinic-introduction-v1:${profileId}`;
    const [dismissed, setDismissed] = useState(false);
    const hidden = useSyncExternalStore(subscribe, () => {
        try {
            const value = localStorage.getItem(key);
            return value === 'dismissed' || (!!value && Date.now() - Number(value) > 30 * 86400000);
        } catch { return false; }
    }, () => true);
    useEffect(() => {
        try { if (!localStorage.getItem(key)) localStorage.setItem(key, String(Date.now())); } catch { /* Browser storage may be unavailable. */ }
    }, [key]);
    function dismiss() {
        setDismissed(true);
        try { localStorage.setItem(key, 'dismissed'); } catch { /* The permanent workspace link remains available. */ }
        window.dispatchEvent(new Event(changed));
    }
    return <aside className={styles.entry} aria-label="Clinic workspace">
        <nav className={styles.navigation}><Link prefetch={false} href="/portal/clinics">My clinics →</Link><Link prefetch={false} href="/clinics/register">Register my clinic</Link></nav>
        {!hidden && !dismissed ? <section className={styles.banner} aria-labelledby="clinic-introduction-title">
            <div><span className={styles.eyebrow}>Grow your practice</span><h2 id="clinic-introduction-title">Your clinic. Your team. One account.</h2><p>Already a partner and own a clinic? Register it from this account, invite your nurses, and manage your clinic’s website. Keep your professional profile, appointments and referral history.</p><Link prefetch={false} className={styles.action} href="/clinics/register">Register my clinic <span aria-hidden="true">→</span></Link><small>Review the own-team affiliate policy before registering. My Drip Nurse approval required.</small></div>
            <button type="button" onClick={dismiss} aria-label="Dismiss clinic introduction">×</button>
        </section> : null}
    </aside>;
}
