import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicAuth';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { brandTextColor } from '@/lib/clinicPolicy';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
import styles from '@/components/clinics/clinic.module.css';
export async function generateMetadata({ params }: {
    params: Promise<{
        slug: string;
    }>;
}) { if (!clinicsEnabled())
    return { robots: { index: false } }; const { slug } = await params; const [clinic] = await publicClinics(slug); return clinic ? { title: `${clinic.name} | My Drip Nurse`, description: clinic.description.slice(0, 160), alternates: { canonical: `https://partners.mydripnurse.com/clinics/${clinic.slug}` } } : { robots: { index: false } }; }
export default async function Page({ params }: {
    params: Promise<{
        slug: string;
    }>;
}) {
    if (!clinicsEnabled())
        notFound();
    const { slug } = await params;
    const [clinic] = await publicClinics(slug);
    if (!clinic)
        notFound();
    const [services, team] = await Promise.all([publicClinicServices(clinic.id), publicClinicTeam(clinic.id)]);
    return <main className={styles.shell} style={{ '--clinic-primary': clinic.primaryColor, '--clinic-accent': clinic.accentColor, '--clinic-ink': brandTextColor(clinic.primaryColor), '--clinic-accent-ink': brandTextColor(clinic.accentColor) } as CSSProperties}><header className={styles.head}><div className={styles.identity}>{clinic.logoUrl ? <Image unoptimized width={120} height={120} className={styles.logo} src={clinic.logoUrl} alt={clinic.name}/> : null}<strong>{clinic.name}</strong></div><Link href="/clinics">Explore clinics</Link></header><section className={styles.hero}><span className={styles.eyebrow}>A My Drip Nurse clinic partner</span><h1>{clinic.name}</h1><p>{clinic.description}</p><a className={styles.primary} href="#services">Explore services →</a></section><div id="services"><ClinicPublicServices clinicId={clinic.id} coverage={clinic.coverage} services={services}/></div><section className={styles.card}><h2>Meet your care team</h2><div className={styles.grid}>{team.map(n => <article className={styles.card} key={n.id}>{n.photo ? <Image unoptimized width={120} height={120} className={styles.logo} src={n.photo} alt={n.name}/> : null}<h2><a href={`/clinics/${clinic.slug}/team/${n.slug}`}>{n.name}</a></h2><p>{n.credentials}</p><p>{n.biography}</p><p>{n.coverage.slice(0, 3).map(r => r.label).join(' · ')}</p></article>)}</div>{!team.length ? <p>Meet your assigned professional when your appointment is arranged.</p> : null}</section><footer className={styles.card}><h2>Contact {clinic.name}</h2><p>{clinic.contactPhone}</p><a href={`mailto:${clinic.contactEmail}`}>{clinic.contactEmail}</a><p>Powered by My Drip Nurse · Availability depends on your service address and the care team’s schedule.</p></footer></main>;
}
