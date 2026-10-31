import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { PartnerExperience } from '@/components/partner/PartnerBrand';
import { NetworkHeader, NetworkFooter, DirectoryNavigation } from '@/components/partner-network/NetworkNavigation';
import styles from '@/components/partner-network/network.module.css';
export const metadata = { title: 'Clinic Directory | My Drip Nurse', description: 'Explore approved, published clinics and their care teams in the My Drip Nurse network.', alternates: { canonical: 'https://partners.mydripnurse.com/directory/clinics' } };
export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!clinicsEnabled()) notFound();
  const query = await searchParams;
  const page = Math.max(0, Math.min(1000, parseInt(query.page || '0') || 0));
  const clinics = await publicClinics('', page * 24);
  return <PartnerExperience><NetworkHeader directory/><main id="main-content"><DirectoryNavigation active="clinics"/><section className={styles.clinicDirectory}><h1>Care teams. Connected to you.</h1><p>Explore clinics in our network, their service areas and the nurses behind their care.</p><div className={styles.clinicGrid}>{clinics.map(c => <article className={styles.listing} key={c.id}>{c.logoUrl ? <Image unoptimized width={120} height={120} src={c.logoUrl} alt={`${c.name} logo`}/> : <span className={styles.listingFallback} aria-hidden="true">{c.name.slice(0,1)}</span>}<h2>{c.name}</h2><p>{c.description.slice(0,200)}</p><small>{c.coverage.slice(0,3).map(r => r.label).join(' · ')}</small><Link prefetch={false} href={`/clinics/${c.slug}`}>Meet the clinic <span aria-hidden="true">↗</span></Link></article>)}</div>{!clinics.length ? <div className={styles.empty}><h2>{page ? 'You’ve reached the end of the listings.' : 'Our clinic network is taking shape.'}</h2><p>{page ? 'Return to the previous page to keep exploring.' : 'Approved clinics will appear here once their websites are published. You can explore our nurse directory in the meantime.'}</p><Link prefetch={false} className={styles.secondary} href="/directory">Explore nurses →</Link></div> : null}<nav className={styles.pagination} aria-label="Clinic directory pages">{page > 0 ? <Link prefetch={false} href={`/directory/clinics?page=${page-1}`}>← Previous</Link> : null}{clinics.length === 24 ? <Link prefetch={false} href={`/directory/clinics?page=${page+1}`}>Next →</Link> : null}</nav></section></main><NetworkFooter/></PartnerExperience>;
}
