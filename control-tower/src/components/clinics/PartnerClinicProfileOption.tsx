import Link from 'next/link';
import styles from './partnerClinicEntry.module.css';

/** Permanent profile entry; independent of the dismissible introduction banner. */
export function PartnerClinicProfileOption() {
    return <section className={styles.profileOption} aria-labelledby="profile-clinic-title">
        <div>
            <span className={styles.eyebrow}>Clinic workspace</span>
            <h3 id="profile-clinic-title">Own a clinic?</h3>
            <p>Register your clinic using this account, then invite and manage your nursing team. Your professional profile, website, availability, appointments and personal referral history stay with you.</p>
            <small>You will review and accept the own-team affiliate policy before registering. My Drip Nurse approval is required.</small>
        </div>
        <div className={styles.profileOptionActions}>
            <Link prefetch={false} className={styles.action} href="/clinics/register">Register my clinic <span aria-hidden="true">→</span></Link>
            <Link prefetch={false} className={styles.workspaceLink} href="/portal/clinics">Manage my clinics</Link>
        </div>
    </section>;
}
