import { ClinicPricingProvider, ClinicServicePrice } from '@/components/clinics/ClinicServicePrice';
import { publicPriceSummary, publicPriceOffer } from '@/lib/publicServicePricing';
import { clinicKeywords, clinicServiceIntroduction, coverageSummary, publicProviderMetadata, clinicEntity, clinicServiceEntities } from "@/lib/providerSeo";
import { clinicSiteAddress } from '@/lib/clinicDomains';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinics } from '@/lib/clinics';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { ClinicPublicWebsite, ClinicTeam, ClinicCoverageSection } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicNetworkReviews } from '@/components/clinics/ClinicNetworkReviews';
import layout from '@/app/partner-site/[slug]/partnerSite.module.css';
import { PartnerFaq } from '@/components/partner/PartnerFaq';
import { serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/components/clinics/clinicWebsite.module.css';
import { clinicCovers } from '@/lib/clinicPolicy';
type Props = { params: Promise<{ slug: string; serviceSlug: string }>; searchParams: Promise<{ nurse?: string }> };
const load = cache(async (slug: string, serviceSlug: string) => {
    if (!clinicsEnabled()) return null;
    const [clinic] = await publicClinics(slug);
    if (!clinic) return null;
    const [services, team] = await Promise.all([publicClinicServices(clinic.id), publicClinicTeam(clinic.id)]);
    const service = services.find(s => s.slug === serviceSlug);
    return service ? { clinic, service, services, team: team.filter(n => n.serviceIds.includes(service.id)) } : null;
});
export async function generateMetadata({ params }: Props) {
    const { slug, serviceSlug } = await params, data = await load(slug, serviceSlug);
    const site = data ? await clinicSiteAddress(data.clinic) : null;
    const area = data ? coverageSummary(data.clinic.coverage) : '';
    return data ? publicProviderMetadata(`${data.service.name} | ${data.clinic.name}${area ? ` · ${area}` : ''}`, `${data.service.name} with ${data.clinic.name}${area ? ` in ${area}` : ''}. ${data.service.description} View service details, local pricing and the care team.`, `${site!.canonicalHome}/services/${serviceSlug}`, data.service.imageUrl, clinicKeywords(data.clinic, [data.service.name])) : { robots: { index: false } };
}
export default async function Page({ params, searchParams }: Props) {
    const { slug, serviceSlug } = await params, data = await load(slug, serviceSlug);
    if (!data) notFound();
    const { clinic, service, team } = data, requested = (await searchParams).nurse;
    const nurse = requested ? team.find(n => n.id === requested) : undefined;
    if (requested && !nurse) notFound();
    const nurseService = nurse ? (await publicClinicServices(clinic.id, nurse.id)).find(s => s.id === service.id) : undefined;
    if (nurse && !nurseService) notFound();
    const coverage = nurse ? [...new Map([
        ...nurse.coverage.filter(r => clinicCovers(clinic.coverage, r)),
        ...clinic.coverage.filter(r => clinicCovers(nurse.coverage, r)),
    ].map(r => [r.id, r])).values()] : clinic.coverage;
    const site = await clinicSiteAddress(clinic);
    const url = `${site.canonicalHome}/services/${serviceSlug}`;
    const area = coverageSummary(coverage, 4);
    const introduction = clinicServiceIntroduction({ ...clinic, coverage }, service, nurse ? [nurse] : team);
    const price = publicPriceSummary(nurseService || service, coverage);
    const selectedService = nurseService || service;
    const outOfStock = selectedService.availabilityStatus === 'out_of_stock';
    const canBook = clinicBookingsEnabled() && !outOfStock;
    const bookingUrl = `https://care.mydripnurse.com/booking/${encodeURIComponent(selectedService.publicKey)}?clinicId=${encodeURIComponent(clinic.id)}${nurse ? `&partnerId=${encodeURIComponent(nurse.id)}` : ''}`;
    const faq = [
        { question: `Where does ${clinic.name} offer ${service.name}?`, answer: area ? `${service.name} is listed for ${area}. Your full service address and the professional’s availability are checked before booking.` : 'Contact My Drip Nurse to check coverage for your address.' },
        { question: `Who offers ${service.name} at ${clinic.name}?`, answer: introduction.team },
        { question: 'What will my visit cost?', answer: `${price.label} per visit${price.variable ? ", depending on your service area" : ""}. Your final price and deposit are confirmed from the service address before payment.` },
        { question: 'Who collects the remaining balance?', answer: 'The clinic collects the remaining balance and any voluntary tip directly. Eligible My Drip Nurse-funded rewards have separate terms.' },
        { question: 'Is my visit confirmed immediately?', answer: 'Your request is sent to an eligible professional for acceptance. Track the appointment in your secure Care portal.' },
    ];
    return <ClinicPublicWebsite clinic={clinic} services={data.services}><ClinicPricingProvider><main id="clinic-content" className={layout.page}><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: clinic.name, item: site.canonicalHome }, { '@type': 'ListItem', position: 2, name: 'Services', item: `${site.canonicalHome}/services` }, { '@type': 'ListItem', position: 3, name: service.name, item: url }] },
        clinicEntity(clinic, site.canonicalHome),
        ...clinicServiceEntities([service], site.canonicalHome, coverage).map(entity => ({ ...entity, offers: publicPriceOffer(nurseService || service, coverage, url, (nurseService || service).availabilityStatus === "out_of_stock") })),
        { '@type': 'WebPage', '@id': `${url}#webpage`, url, name: `${service.name} | ${clinic.name}`, mainEntity: { '@id': `${url}#service` } },
        { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
    ] }) }} />
        <section className={layout.serviceDetailHero}>
            <div className={layout.shell}>
                <div className={layout.serviceDetailCopy}>
                    <span className={layout.eyebrow}>Mobile wellness with {clinic.name}</span>
                    <h1>{service.name}<br/><em>delivered to you.</em></h1>
                    <p>{service.description} Enjoy a visit at home, at your hotel or at work with {clinic.name}{area ? `, serving ${area}` : ''}. {nurse ? `Your requested professional is ${nurse.name}.` : 'Choose an available professional from our care team.'}</p>
                    <div className={`${layout.serviceBookingCard} ${outOfStock ? layout.serviceBookingCardOutOfStock : ''}`}>
                        <ClinicServicePrice service={selectedService} coverage={coverage}/>
                        {canBook ? <a className={layout.primaryAction} href={bookingUrl}>Book {service.name} <span aria-hidden="true">→</span></a> : <span className={styles.stock}>{outOfStock ? 'Temporarily out of stock' : 'Online booking coming soon'}</span>}
                    </div>
                </div>
                <div className={layout.serviceDetailVisual}>{service.imageUrl ? <Image unoptimized priority src={service.imageUrl} alt={`${service.name} with ${clinic.name}`} width={900} height={760} sizes="(max-width: 900px) 100vw, 45vw"/> : null}</div>
            </div>
        </section>
        <section className={layout.serviceOverview}>
            <div className={layout.shell}>
                <div><span className={layout.eyebrow}>Treatment overview</span><h2>A clear, professional booking experience.</h2><p>Plan your {service.name} visit with {clinic.name}. Explore the service, confirm coverage for your address and choose an available nurse and time that suit your day.</p></div>
                <div className={layout.serviceFacts}>
                    <article><span>01</span><h3>Care that comes to you</h3><p>Find a professional from {clinic.name} who offers this service in your area, with availability for your preferred visit.</p></article>
                    <article><span>02</span><h3>Transparent pricing</h3><p>Review your service price and deposit before payment. Your visit address confirms the applicable local price.</p></article>
                    <article><span>03</span><h3>Personal clinical review</h3><p>Your professional reviews treatment suitability and final ingredients before administration. Follow appointment updates in My Care.</p></article>
                </div>
            </div>
        </section>
        {service.ingredients?.length ? <section className={layout.ingredientSection}>
            <div className={layout.shell}><div><span className={layout.eyebrow}>Service ingredients</span><h2>What this service may include.</h2></div><div className={layout.ingredientCards}>{service.ingredients.map(ingredient => <span key={ingredient}>{ingredient}</span>)}</div></div>
        </section> : null}
        <section className={styles.section} aria-labelledby="clinic-service-context"><span className={styles.eyebrow}>About your clinic</span><h2 id="clinic-service-context">{introduction.heading}</h2>{introduction.description ? <p>{introduction.description}</p> : null}<p>{introduction.coverage}</p><p>{introduction.team}</p></section>
        <ClinicCoverageSection clinic={{ ...clinic, coverage }}/><ClinicTeam team={nurse ? [nurse] : team}/>
        <ClinicNetworkReviews/>
        <PartnerFaq eyebrow={`${service.name} FAQ`} title={`Questions about ${service.name}.`} introduction={`Helpful information before your visit with ${clinic.name}.`} items={faq}/>
        <section className={layout.serviceBookCta} id="booking"><div className={layout.shell}>
            <span className={layout.eyebrow}>{outOfStock ? 'Temporarily unavailable' : 'Your next visit'}</span>
            <h2>{outOfStock ? `${service.name} is currently out of stock.` : `${service.name}, with ${clinic.name}.`}</h2>
            {canBook ? <a className={layout.primaryAction} href={bookingUrl}>View availability <span aria-hidden="true">→</span></a> : <p>{outOfStock ? 'Explore our other services or check back for availability.' : 'Online booking is coming soon. Explore our team and services while we prepare to welcome you.'}</p>}
            <p><Link className={styles.textLink} href={`${site.home}/services`}>Explore all services <span aria-hidden="true">→</span></Link></p>
        </div></section>
    </main></ClinicPricingProvider></ClinicPublicWebsite>;
}
