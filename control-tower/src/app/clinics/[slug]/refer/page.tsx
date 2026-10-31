import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicFeature';
import styles from '@/components/clinics/clinic.module.css';
import type { CSSProperties } from 'react';
export const metadata = { title: 'Partner referral | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) notFound();
    const { slug } = await params;
    const clinic = (await publicClinics(slug))[0];
    if (!clinic) notFound();
    return <main className={styles.shell} style={{ '--clinic-accent': clinic.accentColor } as CSSProperties}>
        <a href={`/clinics/${clinic.slug}`}>← {clinic.name}</a>
        <section className={styles.hero}><span className={styles.eyebrow}>My Drip Nurse · External partner referral</span><h1>Build your independent practice.</h1><p>{clinic.name} invited you to explore the My Drip Nurse partner network. Apply as an independent professional. This referral does not enroll you in the clinic’s team.</p><p>My Drip Nurse reviews every application. Existing accounts retain their original referral history.</p></section>
        <iframe className={styles.applicationFrame} src={`/partner-application.html?embedded=1&ref=${encodeURIComponent(`clinic:${clinic.slug}`)}`} title="Independent partner application" />
    </main>;
}
