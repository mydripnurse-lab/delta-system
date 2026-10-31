import { clinicSiteAddress } from '@/lib/clinicDomains';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinicServices } from '@/lib/clinicBooking';
import { ClinicPublicWebsite } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/components/clinics/clinicWebsite.module.css';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    const site = clinic ? await clinicSiteAddress(clinic) : null;
    return clinic ? { title: `Services & local pricing | ${clinic.name}`, description: `Explore services offered by ${clinic.name}. View regional pricing and request a visit through My Drip Nurse.`, alternates: { canonical: `${site!.canonicalHome}/services` } } : { robots: { index: false } };
}
export default async function Page({ params }: Props) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const services = await publicClinicServices(clinic.id);
    const site = await clinicSiteAddress(clinic);
    const url = `${site.canonicalHome}/services`;
    return <ClinicPublicWebsite clinic={clinic}><main id="clinic-content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${clinic.name} services`, url, mainEntity: { '@type': 'ItemList', itemListElement: services.map((s, index) => ({ '@type': 'ListItem', position: index + 1, name: s.name, url: `${url}/${s.slug}` })) } }) }}/>
        <section className={styles.hero}><div><Link className={styles.back} href={site.home}>← {clinic.name}</Link><h1>Care that fits<br /><em>your day.</em></h1><p>Discover the services offered by our clinic. Choose your area to explore pricing, then check appointment availability.</p></div><aside className={styles.visual}><small>Your visit, connected</small><h2>One team.<br />Personal attention.</h2><p>Explore your options below. Your address, eligibility and professional availability determine the final booking details.</p></aside></section>
        <section className={styles.section}><ClinicPublicServices clinicId={clinic.id} clinicSlug={clinic.slug} clinicHome={site.home} services={services} coverage={clinic.coverage} bookingsEnabled={clinicBookingsEnabled()}/></section>
    </main></ClinicPublicWebsite>;
}
