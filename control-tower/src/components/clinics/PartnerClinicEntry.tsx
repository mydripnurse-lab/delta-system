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
    if (hidden || dismissed) return null;
    return <aside className={styles.entry} aria-label="Clinic workspace">
        <span><strong>Own a clinic?</strong> <span className={styles.bannerCopy}>Bring your team to My Drip Nurse.</span></span>
        <nav className={styles.navigation} aria-label="Clinic shortcuts">
            <Link prefetch={false} href="/portal/clinics">My clinics</Link>
            <Link prefetch={false} href="/clinics/register">Get started <span aria-hidden="true">→</span></Link>
        </nav>
        <button type="button" onClick={dismiss} aria-label="Dismiss clinic introduction">×</button>
    </aside>;
}
