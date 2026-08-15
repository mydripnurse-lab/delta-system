import { cache } from "react";

import {
  loadPartnerCalendarServices,
  partnerServiceSlug,
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
  const [services, cities] = await Promise.all([
    loadPartnerCalendarServices(profile.organizationId, profile.services, profile.id),
    loadPartnerCities(profile.organizationId, profile.serviceAreas),
  ]);
  const service = services.find((item) => partnerServiceSlug(item) === serviceSlug) || null;
  if (!service) return null;
  return { profile, service, services, cities };
});
