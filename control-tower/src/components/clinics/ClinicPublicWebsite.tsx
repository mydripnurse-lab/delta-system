import { clinicWebsiteBrand } from '@/lib/clinicWebsiteBrand';
import type { CSSProperties, ReactNode } from 'react';
import type { PublicClinic } from '@/lib/clinics';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { PartnerExperience, PartnerFooter } from '@/components/partner/PartnerBrand';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import styles from './clinicWebsite.module.css';
import { ClinicPublicHeader } from './ClinicPublicHeader';
import { ClinicPublicTeam } from './ClinicPublicTeam';
import { ClinicCoverageSearch } from './ClinicCoverageSearch';

export async function ClinicPublicWebsite({ clinic, children, services, team, absoluteNavigation = false }: { clinic: PublicClinic; children: ReactNode; absoluteNavigation?: boolean; team?: Awaited<ReturnType<typeof publicClinicTeam>>; services?: Awaited<ReturnType<typeof publicClinicServices>> }) {
    const [site, catalog, members] = await Promise.all([clinicSiteAddress(clinic), services ?? publicClinicServices(clinic.id), team ?? publicClinicTeam(clinic.id)]);
    const home = absoluteNavigation ? site.canonicalHome : site.home;
    const brand = clinicWebsiteBrand(clinic);
    return <PartnerExperience branding={brand}><div data-mdn-clinic-website className={styles.site} style={{ '--clinic-primary': brand.primaryColor, '--clinic-accent': brand.accentColor, '--clinic-ink': brand.ink, '--clinic-accent-ink': brand.accentInk } as CSSProperties}>
        <a href="#clinic-content" className={styles.skip}>Skip to content</a>
        <ClinicPublicHeader hasTeam={members.length > 0} primaryColor={brand.primaryColor} accentColor={brand.accentColor} name={clinic.name} slug={clinic.slug} logoUrl={clinic.logoUrl} home={home} services={catalog.map(({ id, slug, name, imageUrl }) => ({ id, slug, name, imageUrl }))}/>
        {children}<PartnerFooter />
    </div></PartnerExperience>;
}
export async function ClinicTeam({ team, clinic }: { team: Awaited<ReturnType<typeof publicClinicTeam>>; clinic: PublicClinic }) {
    const site = await clinicSiteAddress(clinic);
    return <ClinicPublicTeam team={team.map(nurse => ({ id: nurse.id, slug: nurse.slug, href: site.home.startsWith('https://') ? `${site.home}/nurses/${encodeURIComponent(nurse.slug)}` : `https://partners.mydripnurse.com/${encodeURIComponent(nurse.slug)}`, name: nurse.name, photo: nurse.photo, credentials: nurse.credentials, publicTitle: nurse.publicTitle, area: nurse.coverage.slice(0, 3).map(r => r.label).join(' · ') }))}/>;
}
export function ClinicCoverageSection({ clinic }: { clinic: PublicClinic }) {
    return <section className={styles.section} id="coverage"><div><span className={styles.eyebrow}>Closer to you</span><h2>Care in your community.</h2><p>Find the areas served by {clinic.name}. Your address and your nurse’s availability are confirmed when you book.</p></div><ClinicCoverageSearch areas={clinic.coverage.map(area => area.label)}/></section>;
}
