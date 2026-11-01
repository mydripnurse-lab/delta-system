import { clinicKeywords, coverageSummary, publicProviderMetadata, clinicEntity, clinicServiceEntities } from "@/lib/providerSeo";
import { DEFAULT_CLINIC_HERO } from '@/lib/clinicWebsiteBrand';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
import { ClinicPublicWebsite, ClinicTeam, ClinicCoverageSection, ClinicVisitSteps } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicNetworkReviews } from '@/components/clinics/ClinicNetworkReviews';
import { clinicServiceGroups } from '@/lib/clinicServiceNavigation';
import { PartnerFaq } from '@/components/partner/PartnerFaq';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/components/clinics/clinicWebsite.module.css';
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    const site = clinic ? await clinicSiteAddress(clinic) : null;
    const area = clinic ? coverageSummary(clinic.coverage) : '';
    return clinic ? publicProviderMetadata(`${clinic.name} | Mobile IV care${area ? ` in ${area}` : ''}`, `${clinic.name}${area ? ` serves ${area}` : ''}. Explore its care team, available IV services and appointment options. ${clinic.description}`.slice(0, 300), site!.canonicalHome, clinic.websiteSettings?.heroImageUrl || clinic.logoUrl, clinicKeywords(clinic, ["Mobile IV care"])) : { robots: { index: false } };
}
export default async function Page({ params }: Props) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const [services, team] = await Promise.all([publicClinicServices(clinic.id), publicClinicTeam(clinic.id)]);
    const groups = clinicServiceGroups(services);
    const site = await clinicSiteAddress(clinic);
    const url = site.canonicalHome;
    const area = coverageSummary(clinic.coverage, 3);
    const faq = [
        { question: `Which services does ${clinic.name} offer?`, answer: services.length ? `${clinic.name} lists ${services.map(s => s.name).join(', ')}. Stock status, service address and professional availability determine booking options.` : 'No services are currently listed. Contact My Drip Nurse for updates.' },
        { question: 'Where can I schedule a visit?', answer: `This clinic serves ${clinic.coverage.slice(0, 8).map(r => r.label).join(', ') || 'the areas listed on this page'}. Eligibility and availability are confirmed using your service address.` },
        { question: 'How are service prices confirmed?', answer: 'The price and required deposit are confirmed using your service address before payment. The clinic collects the remaining balance and any voluntary tip directly. Different terms apply to eligible My Drip Nurse-funded rewards.' },
        { question: 'Who coordinates my appointment?', answer: 'My Drip Nurse coordinates booking requests. A professional must accept your appointment before it is confirmed. Visit your Care portal to follow its status.' },
    ];
    return <ClinicPublicWebsite clinic={clinic} services={services}><main id="clinic-content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [
            clinicEntity(clinic, url),
            ...clinicServiceEntities(services, url, clinic.coverage),
            ...team.map(nurse => ({ '@type': 'Person', '@id': `https://partners.mydripnurse.com/${nurse.slug}#partner`, name: nurse.name, url: `https://partners.mydripnurse.com/${nurse.slug}`, image: nurse.photo || undefined, jobTitle: nurse.publicTitle || undefined, honorificSuffix: nurse.credentials || undefined })),
            { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: clinic.name, mainEntity: { '@id': `${url}#clinic` } },
            { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
        ] }) }} />
        <section className={styles.hero}><div><span className={styles.eyebrow}>{clinic.name} · Mobile wellness</span><h1>Mobile wellness care<br /><em>with {clinic.name}.</em></h1><p>{clinic.description || 'Connect with our clinic’s professionals for mobile wellness care in your community.'}</p>{area ? <p>Serving {area}. Explore all service areas below.</p> : null}<div className={styles.heroActions}><Link className={styles.action} href={`${site.home}/services`}>Explore services <span aria-hidden="true">→</span></Link><a className={styles.textLink} href="#team">Meet your care team</a></div></div><figure className={styles.heroPhoto}><Image unoptimized src={clinic.websiteSettings?.heroImageUrl || DEFAULT_CLINIC_HERO} alt={clinic.websiteSettings?.heroImageUrl ? `${clinic.name} wellness setting` : "A bright wellness lounge with comfortable treatment chairs and natural materials"} width={1200} height={800} priority/>{!clinic.websiteSettings?.heroImageUrl ? <figcaption>Wellness setting · Illustrative image</figcaption> : null}</figure></section>
        <div className={styles.trust} aria-label="Your care experience"><span>Clinic-authorized professionals</span><span>Care at your location</span><span>Clear pricing before payment</span><span>Connected through My Care</span></div>
        <section className={styles.section} aria-labelledby="clinic-care-options"><div className={styles.sectionHeading}><div><span className={styles.eyebrow}>Wellness, with a personal touch</span><h2 id="clinic-care-options">Find your kind of care.</h2></div><p>Explore the services offered by {clinic.name}, with professional guidance at every step.</p></div><div className={styles.categories}>{groups.map(group => <Link key={group.id} className={styles.category} href={`${site.home}/services#${group.id}`}><span className={styles.categoryImage}>{group.services[0].imageUrl ? <Image unoptimized src={group.services[0].imageUrl} alt="" width={220} height={220}/> : null}</span><h3>{group.label}</h3><p>{group.description}</p><strong>Explore {group.label} <span aria-hidden="true">→</span></strong></Link>)}</div></section>
        <section className={styles.section} id="services"><ClinicPublicServices clinicSlug={clinic.slug} clinicHome={site.home} bookingsEnabled={clinicBookingsEnabled()} clinicId={clinic.id} coverage={clinic.coverage} services={services}/></section>
        <ClinicCoverageSection clinic={clinic}/><ClinicTeam team={team}/><ClinicVisitSteps/>
        <ClinicNetworkReviews/>
        <PartnerFaq title="Your visit, explained" items={faq}/>
        <section className={styles.section}><div className={styles.recruit}><div><span className={styles.eyebrow}>Grow with our network</span><h2>Your expertise. More connections.</h2><p>Are you a nurse or clinic owner? Join My Drip Nurse through {clinic.name} and build your presence in our USA &amp; Puerto Rico network.</p></div><Link className={styles.action} href={`${site.home}/become-a-partner`}>Become a Partner →</Link></div><div className={styles.closing}><h2>Your care starts with a connection.</h2><p>Explore your options with this clinic, or visit My Care to follow an existing appointment.</p><Link className={styles.action} href={`${site.home}/services`}>Find your service →</Link></div></section>
    </main></ClinicPublicWebsite>;
}
