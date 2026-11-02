import { parseClinicScreen } from '@/lib/clinicPortalRoutes';
import { clinicBookingsEnabled } from '@/lib/clinicFeature';
import { redirect, notFound } from 'next/navigation';
import { ClinicPortal } from '@/components/clinics/ClinicPortal';
import { clinicsEnabled, getClinicIdentity } from '@/lib/clinicAuth';
import { listClinics, clinicWorkspace } from '@/lib/clinics';
export async function renderClinicPortal(searchParams: Promise<{ clinic?: string; appointment?: string }>, screen: string[] = []) {
    const route = parseClinicScreen(screen);
    if (!route) notFound();
    if (!clinicsEnabled()) notFound();
    const identity = await getClinicIdentity();
    if (!identity) redirect('/login');
    const clinics = await listClinics(identity.email);
    // A partner session alone does not grant a clinic workspace. Registration
    // commits the accepted owner membership only after validating consent.
    if (!clinics.length) redirect(identity.partnerId ? '/portal' : '/clinics/register');
    const params = await searchParams;
    const requested = params.clinic;
    const appointment = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(params.appointment || '') ? params.appointment : undefined;
    if (requested && !clinics.some(c => c.id === requested)) notFound();
    const selected = (requested ? clinics.find(c => c.id === requested) : null) || clinics.find(c => c.status === 'approved') || clinics[0];
    const workspace = await clinicWorkspace(selected.id);
    return <ClinicPortal initialSection={appointment ? 'Appointments' : route.section} initialProfileTab={route.profile} initialAppointment={appointment} initialWorkspace={workspace} bookingsEnabled={clinicBookingsEnabled()} initialClinics={clinics} initialIdentity={identity} />;
}
