import { clinicKeywords, coverageSummary, publicProviderMetadata, clinicEntity, clinicServiceEntities } from "@/lib/providerSeo";
import { clinicSiteAddress } from '@/lib/clinicDomains';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { ClinicPublicWebsite, ClinicTeam, ClinicCoverageSection } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/components/clinics/clinicWebsite.module.css';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    const site = clinic ? await clinicSiteAddress(clinic) : null;
    const area = clinic ? coverageSummary(clinic.coverage) : '';
    return clinic ? publicProviderMetadata(`IV services | ${clinic.name}${area ? ` · ${area}` : ''}`, `Explore services offered by ${clinic.name}${area ? ` in ${area}` : ''}. View local pricing, ingredients and care professionals.`, `${site!.canonicalHome}/services`, clinic.logoUrl, clinicKeywords(clinic, ["IV services"])) : { robots: { index: false } };
}
export default async function Page({ params }: Props) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const [services, team] = await Promise.all([publicClinicServices(clinic.id), publicClinicTeam(clinic.id)]);
    const site = await clinicSiteAddress(clinic);
    const url = `${site.canonicalHome}/services`;
    return <ClinicPublicWebsite clinic={clinic} team={team} services={services}><main id="clinic-content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [clinicEntity(clinic, site.canonicalHome), ...clinicServiceEntities(services, site.canonicalHome, clinic.coverage), { '@type': 'CollectionPage', name: `${clinic.name} services`, url, mainEntity: { '@type': 'ItemList', itemListElement: services.map((s, index) => ({ '@type': 'ListItem', position: index + 1, name: s.name, url: `${url}/${s.slug}` })) } }] }) }}/>
        <section className={styles.hero}><div><Link className={styles.back} href={site.home}>← {clinic.name}</Link><h1>Services from<br /><em>{clinic.name}.</em></h1><p>Explore care from {clinic.name}{coverageSummary(clinic.coverage) ? ` in ${coverageSummary(clinic.coverage)}` : ""}. Explore services and pricing, then check appointment availability for your address.</p></div><aside className={styles.visual}><small>Your visit, connected</small><h2>One team.<br />Personal attention.</h2><p>Explore your options below. Your address, eligibility and professional availability determine the final booking details.</p></aside></section>
        <section className={styles.section}><ClinicPublicServices clinicId={clinic.id} clinicSlug={clinic.slug} clinicHome={site.home} services={services} coverage={clinic.coverage} bookingsEnabled={clinicBookingsEnabled()}/></section>
        <ClinicCoverageSection clinic={clinic}/><ClinicTeam team={team}/>
    </main></ClinicPublicWebsite>;
}
