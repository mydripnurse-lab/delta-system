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
import { ClinicPublicWebsite, ClinicTeam, ClinicCoverageSection } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicNetworkInvitation } from '@/components/clinics/ClinicNetworkInvitation';
import { ClinicVisitSteps } from '@/components/clinics/ClinicVisitSteps';
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
    const categoryContent: Record<string, { title: string; intro: string; detail: string }> = {
        'iv-therapy': {
            title: 'Mobile IV therapy, on your terms.',
            intro: `Make room for your wellness without the extra trip. ${clinic.name} brings mobile IV therapy to eligible homes, hotels and other private settings in the communities we serve.`,
            detail: 'Explore our IV options, compare ingredients and regional pricing, and choose a visit that fits your schedule. Your care professional reviews your health history and service suitability before treatment.',
        },
        nad: {
            title: 'NAD+ care, in your own space.',
            intro: `Explore NAD+ services with ${clinic.name} and plan a visit around your day. Our mobile care team comes to your eligible location, so you can settle into a familiar, comfortable setting.`,
            detail: 'Compare the NAD+ options available through our clinic, then check pricing and available professionals for your address. Your care team will review suitability and what to expect before your visit.',
        },
        vitamins: {
            title: 'Vitamin care that comes to you.',
            intro: `${clinic.name} makes it easier to explore vitamin and injection services close to home. Choose from the options our clinic offers and connect with a care professional serving your area.`,
            detail: 'View each service’s ingredients and pricing, then enter your address to find available appointments. Your health history and eligibility are reviewed before any service is provided.',
        },
    };
    const site = await clinicSiteAddress(clinic);
    const url = site.canonicalHome;
    const area = coverageSummary(clinic.coverage, 3);
    const faq = [
        { question: `Which services does ${clinic.name} offer?`, answer: services.length ? `${clinic.name} lists ${services.map(s => s.name).join(', ')}. Stock status, service address and professional availability determine booking options.` : 'No services are currently listed. Contact My Drip Nurse for updates.' },
        { question: 'Where can I schedule a visit?', answer: `This clinic serves ${clinic.coverage.slice(0, 8).map(r => r.label).join(', ') || 'the areas listed on this page'}. Eligibility and availability are confirmed using your service address.` },
        { question: 'How are service prices confirmed?', answer: 'The price and required deposit are confirmed using your service address before payment. The clinic collects the remaining balance and any voluntary tip directly. Different terms apply to eligible My Drip Nurse-funded rewards.' },
        { question: 'Who coordinates my appointment?', answer: 'My Drip Nurse coordinates booking requests. A professional must accept your appointment before it is confirmed. Visit your Care portal to follow its status.' },
    ];
    return <ClinicPublicWebsite clinic={clinic} team={team} services={services}><main id="clinic-content">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [
            clinicEntity(clinic, url),
            ...clinicServiceEntities(services, url, clinic.coverage),
            ...team.map(nurse => ({ '@type': 'Person', '@id': `https://partners.mydripnurse.com/${nurse.slug}#partner`, name: nurse.name, url: `https://partners.mydripnurse.com/${nurse.slug}`, image: nurse.photo || undefined, jobTitle: nurse.publicTitle || undefined, honorificSuffix: nurse.credentials || undefined })),
            { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: clinic.name, mainEntity: { '@id': `${url}#clinic` } },
            { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
        ] }) }} />
        <section className={`${styles.hero} ${styles.homeHero}`}><div><span className={styles.eyebrow}>{clinic.name} · Mobile wellness</span><h1>Mobile wellness care<br /><em>with {clinic.name}.</em></h1><p>{clinic.description || 'Connect with our clinic’s professionals for mobile wellness care in your community.'}</p>{area ? <p>Serving {area}. Explore all service areas below.</p> : null}<div className={styles.heroActions}><Link className={styles.action} href={`${site.home}/services`}>Explore services <span aria-hidden="true">→</span></Link>{team.length > 0 ? <a className={styles.textLink} href="#team">Meet your care team</a> : null}</div></div><figure className={styles.heroPhoto}><Image unoptimized src={clinic.websiteSettings?.heroImageUrl || DEFAULT_CLINIC_HERO} className={!clinic.websiteSettings?.heroImageUrl ? styles.defaultHeroImage : undefined} alt={clinic.websiteSettings?.heroImageUrl ? `${clinic.name} mobile wellness care` : "A nurse providing mobile IV care to a client in the comfort of her home"} width={1200} height={800} priority/></figure></section>
        <ClinicVisitSteps/>
        {groups.length ? <div className={styles.careSections}>
            {groups.map(group => {
                const content = categoryContent[group.id];
                return <section key={group.id} id={`care-${group.id}`} className={styles.careSection} aria-labelledby={`care-${group.id}-title`}>
                    <div className={styles.careImage}><Image unoptimized src={group.image} alt={group.imageAlt} width={1000} height={667} sizes="(max-width: 760px) 100vw, 50vw" loading="lazy" /></div>
                    <div className={styles.careCopy}>
                        <span className={styles.eyebrow}>{group.label} · {clinic.name}</span>
                        <h2 id={`care-${group.id}-title`}>{content.title}</h2>
                        <p>{content.intro}</p><p>{content.detail}</p>
                        <ul className={styles.careServices} aria-label={`${group.label} services`}>
                            {group.services.slice(0, 3).map(service => <li key={service.id}><Link href={`${site.home}/services/${service.slug}`}>{service.name}<span aria-hidden="true"> ↗</span></Link></li>)}
                        </ul>
                        <Link className={styles.action} href={`${site.home}/services#${group.id}`}>Explore {group.label}<span aria-hidden="true">→</span></Link>
                    </div>
                </section>;
            })}
        </div> : null}
        <section className={styles.section} id="services"><ClinicPublicServices clinicSlug={clinic.slug} clinicHome={site.home} bookingsEnabled={clinicBookingsEnabled()} clinicId={clinic.id} coverage={clinic.coverage} services={services}/></section>
        <ClinicCoverageSection clinic={clinic}/><ClinicTeam clinic={clinic} team={team}/>
        <ClinicNetworkReviews/>
        <PartnerFaq title="Your visit, explained" items={faq}/>
        <section className={styles.section}><ClinicNetworkInvitation clinicName={clinic.name} href={`${site.home}/become-a-partner`} /><div className={styles.closing}><h2>Your care starts with a connection.</h2><p>Explore your options with this clinic, or visit My Care to follow an existing appointment.</p><Link className={styles.action} href={`${site.home}/services`}>Find your service →</Link></div></section>
    </main></ClinicPublicWebsite>;
}
