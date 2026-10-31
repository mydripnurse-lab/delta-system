import { clinicSiteAddress } from '@/lib/clinicDomains';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
import { ClinicPublicWebsite, ClinicTeam, ClinicCoverageSection, ClinicVisitSteps } from '@/components/clinics/ClinicPublicWebsite';
import { PartnerFaq } from '@/components/partner/PartnerFaq';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/components/clinics/clinicWebsite.module.css';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    const site = clinic ? await clinicSiteAddress(clinic) : null;
    return clinic ? { metadataBase: new URL(site!.canonicalHome), title: `${clinic.name} | My Drip Nurse`, description: clinic.description.slice(0, 160), alternates: { canonical: site!.canonicalHome }, openGraph: { title: clinic.name, description: clinic.description.slice(0, 160), url: site!.canonicalHome, type: 'website', ...(clinic.logoUrl ? { images: [clinic.logoUrl] } : {}) } } : { robots: { index: false } };
}
export default async function Page({ params }: Props) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const [services, team] = await Promise.all([publicClinicServices(clinic.id), publicClinicTeam(clinic.id)]);
    const featured = services.find(s => s.availabilityStatus === 'active' && s.imageUrl) || services.find(s => s.imageUrl);
    const site = await clinicSiteAddress(clinic);
    const url = site.canonicalHome;
    const faq = [
        { question: 'Where can I schedule a visit?', answer: `This clinic serves ${clinic.coverage.slice(0, 8).map(r => r.label).join(', ') || 'the areas listed on this page'}. Eligibility and availability are confirmed using your service address.` },
        { question: 'How are service prices confirmed?', answer: 'The price and required deposit are confirmed using your service address before payment. The clinic collects the remaining balance and any voluntary tip directly. Different terms apply to eligible My Drip Nurse-funded rewards.' },
        { question: 'Who coordinates my appointment?', answer: 'My Drip Nurse coordinates booking requests. A professional must accept your appointment before it is confirmed. Visit your Care portal to follow its status.' },
    ];
    return <ClinicPublicWebsite clinic={clinic}><main id="clinic-content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [
            { '@type': 'Organization', '@id': `${url}#clinic`, name: clinic.name, url, logo: clinic.logoUrl || undefined, description: clinic.description, areaServed: clinic.coverage.map(r => ({ '@type': 'Place', name: r.label })) },
            { '@type': 'WebPage', '@id': url, url, name: clinic.name, about: { '@id': `${url}#clinic` } },
            { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
        ] }) }} />
        <section className={styles.hero}><div><span className={styles.eyebrow}>{clinic.name} · Mobile wellness</span><h1>Personalized care.<br /><em>Your local team.</em></h1><p>{clinic.description || 'Connect with our clinic’s professionals for mobile wellness care in your community.'}</p><div className={styles.heroActions}><Link className={styles.action} href={`${site.home}/services`}>Explore services <span aria-hidden="true">→</span></Link><a className={styles.textLink} href="#team">Meet your care team</a></div></div><aside className={styles.visual}><small>Care, wherever you are</small>{featured?.imageUrl ? <Image unoptimized src={featured.imageUrl} alt={featured.name} width={420} height={420} priority /> : <h2>Personal care.<br />A local team.</h2>}<h2>{featured?.name || clinic.name}</h2><p>Appointments coordinated through My Drip Nurse.</p></aside></section>
        <div className={styles.trust} aria-label="Your care experience"><span>Clinic-authorized professionals</span><span>Care at your location</span><span>Clear pricing before payment</span><span>Connected through My Care</span></div>
        <section className={styles.section} id="services"><ClinicPublicServices clinicSlug={clinic.slug} clinicHome={site.home} bookingsEnabled={clinicBookingsEnabled()} clinicId={clinic.id} coverage={clinic.coverage} services={services}/></section>
        <ClinicCoverageSection clinic={clinic}/><ClinicTeam team={team}/><ClinicVisitSteps/>
        <PartnerFaq title="Your visit, explained" items={faq}/>
        <section className={styles.section}><div className={styles.closing}><h2>Your care starts with a connection.</h2><p>Explore your options with this clinic, or visit My Care to follow an existing appointment.</p><Link className={styles.action} href={`${site.home}/services`}>Find your service →</Link></div></section>
    </main></ClinicPublicWebsite>;
}
