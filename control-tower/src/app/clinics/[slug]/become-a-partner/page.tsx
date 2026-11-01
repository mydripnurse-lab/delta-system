import { publicProviderMetadata, clinicKeywords } from "@/lib/providerSeo";
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import { ClinicPublicWebsite } from '@/components/clinics/ClinicPublicWebsite';
import { PartnerFaq } from '@/components/partner/PartnerFaq';
import styles from '@/components/clinics/clinicWebsite.module.css';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) return { robots: { index: false } };
    const site = await clinicSiteAddress(clinic);
    return publicProviderMetadata(`Join My Drip Nurse through ${clinic.name}`, `Explore an independent nurse or clinic application through ${clinic.name}. Learn about the referral, service coverage and appointment process.`, `${site.canonicalHome}/become-a-partner`, clinic.logoUrl, clinicKeywords(clinic, ['Nurse network', 'Clinic registration']));
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const { home } = await clinicSiteAddress(clinic);
    const referral = `${PARTNER_ORIGIN}/clinics/${encodeURIComponent(clinic.slug)}/refer`;
    return <ClinicPublicWebsite clinic={clinic}><main id="clinic-content">
        <section className={styles.referralHero}><Link className={styles.back} href={home}>← Back to {clinic.name}</Link><h1>Your care. More possibilities.</h1><p>Join My Drip Nurse through {clinic.name}. Build your visibility and connect with appointment opportunities through our network across the United States and Puerto Rico.</p></section>
        <section className={styles.section} aria-label="Choose how to join"><div className={styles.referralCards}>
            <article><span className={styles.eyebrow}>For independent nurses</span><h2>Grow your practice.</h2><p>Create your professional presence, share your services and availability, and manage appointment requests in your portal.</p><Link className={styles.action} href={`${referral}?type=nurse`}>Apply as a nurse →</Link></article>
            <article><span className={styles.eyebrow}>For clinics</span><h2>Bring your team.</h2><p>Build your clinic website, manage your nurses and service areas, and coordinate your team’s appointments with your own branding.</p><Link className={styles.action} href={`${referral}?type=clinic`}>Apply as a clinic →</Link></article>
        </div><p className={styles.referralNote}>This is an external affiliate invitation from {clinic.name}, not an invitation to join its staff. Eligible referrals may earn the referring clinic a commission. My Drip Nurse reviews applications before approval; appointment volume is not guaranteed.</p></section>
        <ClinicBenefits/>
        <PartnerFaq title="A few things to know" items={[
            { question: 'Am I joining this clinic’s staff?', answer: 'No. These applications are for independent nurses and clinics joining My Drip Nurse through an external referral. Joining a clinic’s team uses a separate invitation.' },
            { question: 'What if I already have a My Drip Nurse account?', answer: 'Use your existing account. Your profile, website, availability and referral history stay with you. Existing referral attribution is not replaced by this invitation.' },
            { question: 'How do appointment opportunities work?', answer: 'Clients are matched with available nurses using their service address, selected service and appointment time. Requests must be accepted by the assigned professional. Availability and booking volume vary.' },
            { question: 'Can I earn commissions on my own clinic’s nurses?', answer: 'No. Affiliate commissions apply only to eligible external referrals. Your own clinic team is excluded while its members belong to your clinic.' },
        ]}/>
    </main></ClinicPublicWebsite>;
}
function ClinicBenefits() {
    return <section className={styles.section}><span className={styles.eyebrow}>Built for your practice</span><h2>A connected way to grow.</h2><div className={styles.facts}>
        <article><span className={styles.step}>01</span><h3>Build your visibility</h3><p>A professional website and directory presence help clients discover your services and coverage.</p></article>
        <article><span className={styles.step}>02</span><h3>Connect with demand</h3><p>My Drip Nurse works to attract traffic and connect eligible appointment requests with available care professionals.</p></article>
        <article><span className={styles.step}>03</span><h3>Stay in control</h3><p>Manage your profile and hours. Clinic owners coordinate their team, while nurses review their own appointment requests.</p></article>
    </div></section>;
}
