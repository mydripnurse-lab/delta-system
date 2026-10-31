import { publicClinicServices } from "@/lib/clinicBooking";
import { redirect } from "next/navigation";
import { cache } from "react";

import {
  loadPartnerCalendarServices,
  partnerServiceSlug,
  definitionForServiceSlug,
} from "@/lib/myDripNurseServices";
import { getPartnerProfileForPublicPage } from "@/lib/partnerProfiles";
import { loadPartnerCities } from "@/lib/partnerServiceAreas";

export const loadPartnerServicePage = cache(async function loadPartnerServicePage(
  partnerSlug: string,
  serviceSlug: string,
  preview = "",
) {
  const profile = await getPartnerProfileForPublicPage(partnerSlug, preview);
  if (!profile) return null;
  if ((profile.clinicManaged || profile.clinicBrand) && !preview) {
    const clinic = profile.clinicBrand;
    if (!clinic) redirect(`/${profile.slug}/services`);
    const services = await publicClinicServices(clinic.id);
    const definition = definitionForServiceSlug(serviceSlug);
    const service = services.find(s => s.slug === serviceSlug || s.slug === definition?.id);
    if (!service) return null;
    redirect(`/clinics/${clinic.slug}/services/${service.slug}?nurse=${encodeURIComponent(profile.id)}`);
  }
  const [services, cities] = await Promise.all([
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
    loadPartnerCities(profile.organizationId, profile.serviceAreas),
  ]);
  const service = services.find((item) => partnerServiceSlug(item) === serviceSlug) || null;
  if (!service) return null;
  return { profile, service, services, cities };
});
