import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicFeature';
import styles from '@/components/clinics/clinic.module.css';
import type { CSSProperties } from 'react';
export const metadata = { title: 'Partner referral | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
    if (!clinicsEnabled()) notFound();
    const { slug } = await params;
    const { type } = await searchParams;
    const clinic = (await publicClinics(slug))[0];
    if (!clinic) notFound();
    const clinicReferral = type === 'clinic';
    const code = encodeURIComponent(`clinic:${clinic.slug}`);
    return <main className={styles.shell} style={{ '--clinic-accent': clinic.accentColor } as CSSProperties}>
        <Link href={`/clinics/${clinic.slug}`}>← {clinic.name}</Link>
        <section className={styles.hero}>
            <span className={styles.eyebrow}>My Drip Nurse · External referral</span>
            <h1>{clinicReferral ? 'Bring your clinic to our network.' : 'Build your independent nursing practice.'}</h1>
            <p>{clinic.name} invited you to join My Drip Nurse as {clinicReferral ? 'an independent clinic' : 'an independent nurse'}. This invitation does not add you to their nursing team.</p>
            <p>My Drip Nurse reviews every application. Existing accounts retain their original referral history.</p>
            <nav className={styles.actions} aria-label="Referral application type">
                <Link className={clinicReferral ? styles.secondary : styles.primary} aria-current={!clinicReferral ? 'page' : undefined} href={`/clinics/${clinic.slug}/refer?type=nurse`}>Join as a nurse</Link>
                <Link className={clinicReferral ? styles.primary : styles.secondary} aria-current={clinicReferral ? 'page' : undefined} href={`/clinics/${clinic.slug}/refer?type=clinic`}>Join as a clinic</Link>
            </nav>
        </section>
        {clinicReferral ? <section className={styles.card}><h2>Your clinic. Your team.</h2><p>Register your clinic, invite your nurses and manage your presence with My Drip Nurse. Approval is required before activation.</p><Link className={styles.primary} href={`/clinics/register?ref=${code}`}>Start clinic application →</Link></section> : <iframe className={styles.applicationFrame} src={`/partner-application.html?embedded=1&ref=${code}`} title="Independent nurse application" />}
    </main>;
}
