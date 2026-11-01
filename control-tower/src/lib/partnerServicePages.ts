import { loadClinicNurseCatalog } from "@/lib/clinicNurseCatalog";
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
    const affiliation = profile.clinicBrand;
    if (!affiliation) return null;
    const catalog = await loadClinicNurseCatalog(profile);
    if (!catalog) return null;
    const definition = definitionForServiceSlug(serviceSlug);
    const index = catalog.rows.findIndex((row, index) => row.slug === serviceSlug || row.slug === definition?.id
      || partnerServiceSlug(catalog.services[index]) === serviceSlug);
    if (index < 0) return null;
    const serviceAreas = catalog.coverage.map(r => ({ state: r.state, county: r.county || '', city: r.city || '', locationId: '' }));
    return { profile: { ...profile, serviceAreas }, service: catalog.services[index], services: catalog.services,
      cities: catalog.coverage.filter(r => r.city).map(r => ({ name: r.city!, state: r.state, county: r.county || '' })) };

  }
  const [services, cities] = await Promise.all([
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
    loadPartnerCities(profile.organizationId, profile.serviceAreas),
  ]);
  const service = services.find((item) => partnerServiceSlug(item) === serviceSlug) || null;
  if (!service) return null;
  return { profile, service, services, cities };
});
