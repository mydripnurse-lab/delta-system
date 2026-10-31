import { notFound } from 'next/navigation';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
import { ClinicRegistration } from '@/components/clinics/ClinicRegistration';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clinic partners | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
    if (!clinicsEnabled()) notFound();
    const { ref = '' } = await searchParams;
    const referralCode = /^clinic:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref) && ref.length <= 87 ? ref : '';
    const identity = await getClinicIdentity();
    return <ClinicRegistration referralCode={referralCode} signedIn={!!identity} accountName={identity?.name || ''} accountEmail={identity?.email || ''}/>;
}
