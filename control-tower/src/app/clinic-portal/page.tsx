import { clinicBookingsEnabled } from '@/lib/clinicFeature';
import { redirect, notFound } from 'next/navigation';
import { ClinicPortal } from '@/components/clinics/ClinicPortal';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clinic workspace | My Drip Nurse', robots: { index: false, follow: false } };
export default async function Page() { if (!clinicsEnabled())
    notFound(); if (!await getClinicIdentity())
    redirect('/login'); return <ClinicPortal bookingsEnabled={clinicBookingsEnabled()} />; }
