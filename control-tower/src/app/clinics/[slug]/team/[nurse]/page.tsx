import { notFound, redirect } from 'next/navigation';
import { clinicsEnabled } from '@/lib/clinicFeature';
import { publicClinics } from '@/lib/clinics';
import { clinicNurseSiteAddress } from '@/lib/clinicDomainLookup';
import { publicClinicTeam } from '@/lib/clinicBooking';
export const metadata = { robots: { index: false, follow: true } };
export default async function Page({ params }: { params: Promise<{ slug: string; nurse: string }> }) {
    if (!clinicsEnabled()) notFound();
    const { slug, nurse } = await params;
    const [clinic] = await publicClinics(slug);
    if (!clinic) notFound();
    const member = (await publicClinicTeam(clinic.id)).find(n => n.slug === nurse);
    if (!member) notFound();
    redirect(await clinicNurseSiteAddress({ slug: member.slug, clinicBrand: clinic }));
}
