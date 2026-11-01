import { publicProviderMetadata, clinicKeywords } from "@/lib/providerSeo";
import { notFound } from 'next/navigation';
import { publicClinics } from '@/lib/clinics';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { clinicSiteAddress } from '@/lib/clinicDomains';
import { PARTNER_ORIGIN } from '@/lib/clinicDomainPolicy';
import { ClinicPublicWebsite } from '@/components/clinics/ClinicPublicWebsite';
import { ClinicPartnerInvitation } from '@/components/clinics/ClinicPartnerInvitation';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) return { robots: { index: false } };
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) return { robots: { index: false } };
    const site = await clinicSiteAddress(clinic);
    return publicProviderMetadata(`Join My Drip Nurse through ${clinic.name}`, `Join My Drip Nurse through ${clinic.name}. Explore professional websites, appointment opportunities and branded clinic team tools for nurses and clinics.`, `${site.canonicalHome}/become-a-partner`, clinic.logoUrl, clinicKeywords(clinic, ['Nurse network', 'Clinic registration']));
}
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    if (!clinicsEnabled()) notFound();
    const [clinic] = await publicClinics((await params).slug);
    if (!clinic) notFound();
    const { home, canonicalHome } = await clinicSiteAddress(clinic);
    const referral = `${PARTNER_ORIGIN}/clinics/${encodeURIComponent(clinic.slug)}/refer`;
    return <ClinicPublicWebsite clinic={clinic}>
        <ClinicPartnerInvitation name={clinic.name} home={home} referral={referral} canonical={`${canonicalHome}/become-a-partner`} />
    </ClinicPublicWebsite>;
}
