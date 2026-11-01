import type { CSSProperties } from 'react';
import { clinicWebsiteBrand } from '@/lib/clinicWebsiteBrand';
import clinicStyles from './clinicWebsite.module.css';
import Link from 'next/link';
import { PartnerExperience, PartnerFooter } from '@/components/partner/PartnerBrand';
import PartnerPublicHeader from '@/components/partner/PartnerPublicHeader';
import { PartnerFaq } from '@/components/partner/PartnerFaq';
import { ClinicPublicServices } from './ClinicPublicServices';
import { clinicBookingsEnabled } from '@/lib/clinicFeature';
import type { loadClinicNurseServicePage } from '@/lib/clinicNurseServicePage';
import { coverageSummary, providerCoverage } from '@/lib/providerSeo';
import { partnerPublicUrl, serializeStructuredData } from '@/lib/partnerSeo';
import styles from '@/app/partner-site/[slug]/partnerSite.module.css';

export function ClinicNurseServicePage({ data }: { data: NonNullable<Awaited<ReturnType<typeof loadClinicNurseServicePage>>> }) {
    const { profile, clinic, service, coverage, slug } = data;
    const home = partnerPublicUrl(profile.slug), url = partnerPublicUrl(profile.slug, `services/${slug}`);
    const area = coverageSummary(coverage, 3);
    const brand = clinicWebsiteBrand(clinic);
    const faq = [
        { question: `Who provides ${service.name}?`, answer: `${profile.displayName}${profile.professionalCredentials ? ` (${profile.professionalCredentials})` : ''} offers this service through ${clinic.name}. ${profile.publicTitle || ''} Treatment suitability is reviewed before care.` },
        { question: `Where can I book with ${profile.displayName}?`, answer: area ? `Listed coverage includes ${area}. See all service areas on this page. Your address, service and the professional’s availability are checked during booking.` : 'Contact My Drip Nurse to confirm service coverage.' },
        { question: 'How are price and payment confirmed?', answer: 'Choose your area to see local pricing. The final price and deposit are confirmed using your service address before payment. The clinic collects the remaining balance and any voluntary tip directly; eligible My Drip Nurse-funded rewards have separate terms.' },
    ];
    const schema = { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Person', '@id': `${home}#partner`, name: profile.displayName, url: home, image: profile.profilePhotoUrl || undefined, jobTitle: profile.publicTitle || undefined, honorificSuffix: profile.professionalCredentials || undefined },
        { '@type': 'Service', '@id': `${url}#service`, name: service.name, description: service.description, url, image: service.imageUrl || undefined, provider: { '@id': `${home}#partner` }, areaServed: providerCoverage(coverage).map(area => area.schema) },
        { '@type': 'WebPage', url, name: `${service.name} with ${profile.displayName}`, mainEntity: { '@id': `${url}#service` } },
        { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: profile.displayName, item: home }, { '@type': 'ListItem', position: 2, name: 'Services', item: `${home}/services` }, { '@type': 'ListItem', position: 3, name: service.name, item: url }] },
        { '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
    ] };
    return <PartnerExperience branding={profile.clinicBrand}><main className={styles.page}>
        <PartnerPublicHeader profile={profile}/><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeStructuredData(schema) }}/>
        <section className={styles.servicesHero}><div className={styles.shell}>
            <Link href={`/${profile.slug}/services`}>← All services</Link>
            <h1>{service.name}<br/><em>with {profile.displayName}.</em></h1>
            <p>{profile.publicTitle}{profile.professionalCredentials ? ` · ${profile.professionalCredentials}` : ''}</p>
            <p>{service.description}</p><p>Care through <Link href={`/clinics/${clinic.slug}`}>{clinic.name}</Link>{area ? ` in ${area}` : ''}.</p>
            {profile.biography ? <p>{profile.biography}</p> : null}
        </div></section>
        <section className={`${styles.serviceCatalog} ${clinicStyles.site}`} style={{ "--clinic-primary": brand.primaryColor, "--clinic-accent": brand.accentColor, "--clinic-ink": brand.ink, "--clinic-accent-ink": brand.accentInk, minHeight: "auto" } as CSSProperties}><div className={styles.shell}>
            <ClinicPublicServices clinicId={clinic.id} partnerId={profile.id} coverage={coverage} services={[service]} bookingsEnabled={clinicBookingsEnabled()}/>
            {service.ingredients?.length ? <><h2>Service ingredients</h2><p>{service.ingredients.join(' · ')}</p></> : null}
        </div></section>
        <section className={styles.localServiceSection}><div className={styles.shell}><h2>Where {profile.displayName} provides care</h2><div className={styles.cityGrid}>{providerCoverage(coverage).map(area => <span key={area.label}>{area.label}</span>)}</div></div></section>
        <PartnerFaq title={`Questions about ${service.name}`} items={faq}/><PartnerFooter/>
    </main></PartnerExperience>;
}
