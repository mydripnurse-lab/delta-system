import Image from "next/image";
import { notFound } from 'next/navigation';
import type { CSSProperties } from 'react';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { publicClinics } from '@/lib/clinics';
import { publicClinicTeam, publicClinicServices } from '@/lib/clinicBooking';
import { brandTextColor } from '@/lib/clinicPolicy';
import styles from '@/components/clinics/clinic.module.css';
export const metadata = { title: 'Meet your professional | My Drip Nurse', robots: { index: false, follow: true } };
export default async function Page({ params }: {
    params: Promise<{
        slug: string;
        nurse: string;
    }>;
}) {
    if (!clinicsEnabled())
        notFound();
    const { slug, nurse } = await params;
    const [clinic] = await publicClinics(slug);
    if (!clinic)
        notFound();
    const [team, services] = await Promise.all([publicClinicTeam(clinic.id), publicClinicServices(clinic.id)]);
    const member = team.find(n => n.slug === nurse);
    if (!member)
        notFound();
    return <main className={styles.shell} style={{ '--clinic-primary': clinic.primaryColor, '--clinic-accent': clinic.accentColor, '--clinic-ink': brandTextColor(clinic.primaryColor), '--clinic-accent-ink': brandTextColor(clinic.accentColor) } as CSSProperties}><a href={`/clinics/${slug}`}>← {clinic.name}</a><section className={styles.hero}><span className={styles.eyebrow}>Meet your care team</span>{member.photo ? <Image unoptimized width={120} height={120} className={styles.logo} src={member.photo} alt={member.name}/> : null}<h1>{member.name}</h1><p>{member.credentials}</p><p>{member.biography}</p></section><section className={styles.card}><h2>Service areas</h2><p>{member.coverage.map(r => r.label).join(' · ')}</p><h2>Book with {member.name}</h2>{services.map(s => <div className={styles.row} key={s.id}><strong>{s.name}</strong><a className={styles.primary} href={`https://care.mydripnurse.com/booking/${s.publicKey}?clinicId=${clinic.id}&partnerId=${member.id}`}>Check availability →</a></div>)}</section></main>;
}
