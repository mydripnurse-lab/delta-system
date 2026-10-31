import { notFound } from 'next/navigation';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
import { ClinicRegistration } from '@/components/clinics/ClinicRegistration';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clinic partners | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page() {
    if (!clinicsEnabled()) notFound();
    const identity = await getClinicIdentity();
    return <ClinicRegistration signedIn={!!identity} accountName={identity?.name || ''} accountEmail={identity?.email || ''}/>;
}
