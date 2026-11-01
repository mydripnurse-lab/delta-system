import { clinicSiteAddress } from '@/lib/clinicDomains';
import Image from 'next/image';
import Link from 'next/link';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { clinicsEnabled, clinicBookingsEnabled } from '@/lib/clinicFeature';
import { publicClinics } from '@/lib/clinics';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { ClinicPublicWebsite, ClinicTeam } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicPublicServices } from '@/components/clinics/ClinicPublicServices';
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
    return data ? { title: `${data.service.name} | ${data.clinic.name}`, description: data.service.description, alternates: { canonical: `${site!.canonicalHome}/services/${serviceSlug}` } } : { robots: { index: false } };
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
    const faq = [
        { question: 'What will my visit cost?', answer: 'Choose your service area below to see applicable pricing. Your final price and deposit are confirmed from the service address before payment.' },
        { question: 'Who collects the remaining balance?', answer: 'The clinic collects the remaining balance and any voluntary tip directly. My Drip Nurse does not collect or pay out this balance. Eligible My Drip Nurse-funded rewards have separate terms.' },
        { question: 'Is my visit confirmed immediately?', answer: 'Your request is sent to an eligible professional for acceptance. Track the appointment in your secure Care portal.' },
    ];
    return <ClinicPublicWebsite clinic={clinic} services={data.services}><main id="clinic-content"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData({ '@context': 'https://schema.org', '@graph': [
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: clinic.name, item: site.canonicalHome }, { '@type': 'ListItem', position: 2, name: 'Services', item: `${site.canonicalHome}/services` }, { '@type': 'ListItem', position: 3, name: service.name, item: url }] },
        { '@type': 'Service', name: service.name, description: service.description, image: service.imageUrl || undefined, url, provider: { '@type': 'Organization', name: clinic.name, url: site.canonicalHome }, areaServed: clinic.coverage.map(r => ({ '@type': 'Place', name: r.label })) },
        { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
    ] }) }} />
        <section className={styles.hero}><div><Link className={styles.back} href={`${site.home}/services`}>← All services</Link><h1>{service.name}</h1><p>{service.description}</p>{nurse ? <p>Requested professional: {nurse.name}</p> : null}<div className={styles.heroActions}><a className={styles.action} href="#booking">View pricing & availability →</a></div></div><div className={styles.visual}>{service.imageUrl ? <Image unoptimized priority src={service.imageUrl} alt={service.name} width={500} height={500}/> : null}</div></section>
        <section className={styles.section}><span className={styles.eyebrow}>Your experience</span><h2>Personal attention, wherever you are.</h2><div className={styles.facts}><article><h3>Service details</h3><p>{service.ingredients?.length ? service.ingredients.join(' · ') : service.description}</p></article><article><h3>Professional review</h3><p>Eligibility, ingredients and treatment suitability are reviewed by an appropriately qualified professional before administration.</p></article><article><h3>Care, connected</h3><p>Use your Care portal for appointment details and updates. This service is not emergency care.</p></article></div></section>
        <section className={styles.section} id="booking"><ClinicPublicServices clinicId={clinic.id} partnerId={nurse?.id} services={[nurseService || service]} coverage={coverage} bookingsEnabled={clinicBookingsEnabled()}/></section>
        <ClinicTeam team={nurse ? [nurse] : team}/><PartnerFaq title="Before your visit" items={faq}/>
    </main></ClinicPublicWebsite>;
}
