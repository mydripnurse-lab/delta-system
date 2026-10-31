import Image from "next/image";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicAuth';
import styles from '@/components/clinics/clinic.module.css';
export const metadata = { title: 'Find a clinic | My Drip Nurse' };
export default async function Page({ searchParams }: {
    searchParams: Promise<{
        page?: string;
    }>;
}) {
    if (!clinicsEnabled())
        notFound();
    const query = await searchParams;
    const page = Math.max(0, Math.min(1000, parseInt(query.page || '0') || 0));
    const clinics = await publicClinics('', page * 24);
    return <main className={styles.shell}><header className={styles.head}><div><span className={styles.eyebrow}>My Drip Nurse network</span><h1>Find your clinic.</h1><p>Meet the clinics and care teams serving your community.</p></div><div className={styles.actions}><Link href="/">Find a professional</Link><Link href="/login" className={styles.secondary}>Partner sign in</Link></div></header><div className={styles.grid}>{clinics.map(c => <article className={styles.card} key={c.id}>{c.logoUrl ? <Image unoptimized width={120} height={120} className={styles.logo} src={c.logoUrl} alt={c.name}/> : null}<h2>{c.name}</h2><p>{c.description.slice(0, 200)}</p><p>{c.coverage.slice(0, 3).map(r => r.label).join(' · ')}</p><Link className={styles.primary} href={`/clinics/${c.slug}`}>Meet the clinic →</Link></article>)}</div>{!clinics.length ? <p className={styles.empty}>Clinic listings are being prepared.</p> : null}<div className={styles.actions}>{page > 0 ? <Link href={`/clinics?page=${page - 1}`}>Previous</Link> : null}{clinics.length === 24 ? <Link href={`/clinics?page=${page + 1}`}>Next</Link> : null}</div></main>;
}
