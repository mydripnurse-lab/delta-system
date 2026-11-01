import 'server-only';
import { cache } from 'react';
import { clinicBookingsEnabled } from './clinicFeature';
import { publicClinicById } from './clinics';
import { publicClinicServices, publicClinicTeam } from './clinicBooking';
import { clinicWebsiteBrand } from './clinicWebsiteBrand';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Presentation uses cached public data. Availability and checkout validate again against live data.
export const loadClinicBookingPage = cache(async (clinicId: string, publicKey: string, nurseId = '') => {
    if (!clinicBookingsEnabled() || !uuid.test(clinicId) || (nurseId && !uuid.test(nurseId))) return null;
    const clinic = await publicClinicById(clinicId);
    if (!clinic) return null;
    const services = await publicClinicServices(clinicId, nurseId || undefined);
    const service = services.find(s => s.publicKey === publicKey && s.availabilityStatus === 'active');
    if (!service) return null;
    if (nurseId && !(await publicClinicTeam(clinicId)).some(n => n.id === nurseId && n.serviceIds.includes(service.id))) return null;
    return { clinic, service, brand: clinicWebsiteBrand(clinic) };
});
