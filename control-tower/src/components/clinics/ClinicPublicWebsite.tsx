import { clinicWebsiteBrand } from '@/lib/clinicWebsiteBrand';
import Link from 'next/link';
import Image from 'next/image';
import type { CSSProperties, ReactNode } from 'react';
import type { PublicClinic } from '@/lib/clinics';
import { publicClinicServices, type publicClinicTeam } from '@/lib/clinicBooking';
import { PartnerExperience, PartnerFooter } from '@/components/partner/PartnerBrand';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import styles from './clinicWebsite.module.css';
import { ClinicPublicHeader } from './ClinicPublicHeader';
import { ClinicCoverageSearch } from './ClinicCoverageSearch';

export async function ClinicPublicWebsite({ clinic, children, services, absoluteNavigation = false }: { clinic: PublicClinic; children: ReactNode; absoluteNavigation?: boolean; services?: Awaited<ReturnType<typeof publicClinicServices>> }) {
    const [site, catalog] = await Promise.all([clinicSiteAddress(clinic), services ?? publicClinicServices(clinic.id)]);
    const home = absoluteNavigation ? site.canonicalHome : site.home;
    const brand = clinicWebsiteBrand(clinic);
    return <PartnerExperience branding={brand}><div data-mdn-clinic-website className={styles.site} style={{ '--clinic-primary': brand.primaryColor, '--clinic-accent': brand.accentColor, '--clinic-ink': brand.ink, '--clinic-accent-ink': brand.accentInk } as CSSProperties}>
        <a href="#clinic-content" className={styles.skip}>Skip to content</a>
        <ClinicPublicHeader primaryColor={brand.primaryColor} accentColor={brand.accentColor} name={clinic.name} slug={clinic.slug} logoUrl={clinic.logoUrl} home={home} services={catalog.map(({ id, slug, name, imageUrl }) => ({ id, slug, name, imageUrl }))}/>
        {children}<PartnerFooter />
    </div></PartnerExperience>;
}
export function ClinicTeam({ team }: { team: Awaited<ReturnType<typeof publicClinicTeam>> }) {
    if (!team.length) return null;
    return <section className={styles.section} id="team"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>The people behind your care</span><h2>A local team.<br />A personal connection.</h2></div><p>Get to know the professionals authorized by this clinic. Explore their profiles and the areas they serve.</p></div><div className={styles.team}>{team.map(nurse => <Link className={styles.member} key={nurse.id} href={`${PARTNER_ORIGIN}/${nurse.slug}`}>
        {nurse.photo ? <Image unoptimized src={nurse.photo} width={420} height={460} sizes="(max-width: 760px) 90vw, 33vw" alt={nurse.name} /> : <div className={styles.initials} aria-hidden="true">{nurse.name.split(/\s+/).slice(0, 2).map(n => n[0]).join('')}</div>}
        <div><small>{nurse.credentials || 'Care professional'}</small><h3>{nurse.name}</h3>{nurse.publicTitle ? <p>{nurse.publicTitle}</p> : null}<p>{nurse.coverage.slice(0, 3).map(r => r.label).join(' · ')}</p><strong>Meet your professional <span aria-hidden="true">→</span></strong></div>
    </Link>)}</div></section>;
}
export function ClinicCoverageSection({ clinic }: { clinic: PublicClinic }) {
    return <section className={styles.section} id="coverage"><div><span className={styles.eyebrow}>Closer to you</span><h2>Care in your community.</h2><p>Find the areas served by {clinic.name}. Your address and your nurse’s availability are confirmed when you book.</p></div><ClinicCoverageSearch areas={clinic.coverage.map(area => area.label)}/></section>;
}
