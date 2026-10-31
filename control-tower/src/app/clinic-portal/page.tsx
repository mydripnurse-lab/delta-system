import { clinicBookingsEnabled } from '@/lib/clinicFeature';
import { redirect, notFound } from 'next/navigation';
import { ClinicPortal } from '@/components/clinics/ClinicPortal';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
import { listClinics } from '@/lib/clinics';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clinic workspace | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page() {
    if (!clinicsEnabled()) notFound();
    const identity = await getClinicIdentity();
    if (!identity) redirect('/login');
    const clinics = await listClinics(identity.email);
    // A partner session alone does not grant a clinic workspace. Registration
    // commits the accepted owner membership only after validating consent.
    if (!clinics.length) redirect(identity.partnerId ? '/portal' : '/clinics/register');
    return <ClinicPortal bookingsEnabled={clinicBookingsEnabled()} initialClinics={clinics} initialIdentity={identity} />;
}
