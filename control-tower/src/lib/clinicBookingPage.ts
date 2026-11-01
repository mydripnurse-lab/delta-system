import 'server-only';
import { cache } from 'react';
import { clinicBookingsEnabled } from './clinicFeature';
import { publicClinicById } from './clinics';
import { publicClinicServices, publicClinicTeam } from './clinicBooking';
import { clinicCovers } from './clinicPolicy';
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
    const nurse = nurseId ? (await publicClinicTeam(clinicId)).find(n => n.id === nurseId && n.serviceIds.includes(service.id)) : undefined;
    if (nurseId && !nurse) return null;
    const coverage = nurse ? [...new Map([
        ...nurse.coverage.filter(r => clinicCovers(clinic.coverage, r)),
        ...clinic.coverage.filter(r => clinicCovers(nurse.coverage, r)),
    ].map(r => [r.id, r])).values()] : clinic.coverage;
    return { clinic, service, nurse, coverage, brand: clinicWebsiteBrand(clinic) };
});
