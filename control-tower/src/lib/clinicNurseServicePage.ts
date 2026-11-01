import { cache } from 'react';
import { getPartnerProfileForPublicPage } from '@/lib/partnerProfiles';
import { publicClinics } from '@/lib/clinics';
import { publicClinicServices, publicClinicTeam } from '@/lib/clinicBooking';
import { clinicCovers } from '@/lib/clinicPolicy';
import { definitionForServiceSlug, definitionForCalendar, partnerServiceSlug } from '@/lib/myDripNurseServices';

export function nurseServiceSlug(service: { name: string; slug: string }) {
    const definition = definitionForCalendar(service.name);
    return definition ? partnerServiceSlug(definition) : service.slug;
}

// The same cached public records used by the clinic service page. Booking still
// uses clinicId + partnerId; an indexable nurse page never changes assignment.
export const loadClinicNurseServicePage = cache(async (slug: string, serviceSlug: string, preview = '') => {
    if (preview) return null;
    const profile = await getPartnerProfileForPublicPage(slug, preview);
    if (!profile?.clinicBrand) return null;
    const affiliation = profile.clinicBrand;
    const [clinics, services, team] = await Promise.all([
        publicClinics(affiliation.slug), publicClinicServices(affiliation.id, profile.id), publicClinicTeam(affiliation.id),
    ]);
    const clinic = clinics[0], nurse = team.find(n => n.id === profile.id);
    const definition = definitionForServiceSlug(serviceSlug);
    const service = services.find(s => nurseServiceSlug(s) === serviceSlug || s.slug === serviceSlug || s.slug === definition?.id);
    if (!clinic || !nurse || !service) return null;
    const coverage = [...new Map([
        ...nurse.coverage.filter(r => clinicCovers(clinic.coverage, r)),
        ...clinic.coverage.filter(r => clinicCovers(nurse.coverage, r)),
    ].map(r => [r.id, r])).values()];
    return { profile, clinic, service, coverage, slug: nurseServiceSlug(service) };
});
