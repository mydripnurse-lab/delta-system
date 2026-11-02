import { getRequestClinicTenant } from "@/lib/clinicDomainRequest";
import { clinicNurseSiteAddress } from "@/lib/clinicDomainLookup";
import { getClinicPortalBrand } from "@/lib/clinicPortalBrand";
import { clinicsEnabled } from "@/lib/clinicAuth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { getPartnerProfileForPortal } from "@/lib/partnerProfiles";

import PartnerPortalClient, { type PartnerPortalScreen } from "./PartnerPortalClient";

export async function renderPartnerPortal(screen: PartnerPortalScreen) {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  const tenant = await getRequestClinicTenant();
  if (!tenant && process.env.NODE_ENV === "production" && host !== "partners.mydripnurse.com") {
    redirect("https://partners.mydripnurse.com/portal");
  }
  const session = await getPartnerPortalSession();
  if (!session) redirect(tenant ? "/login" : "/partner-login");
  const [profile, clinicBrand] = await Promise.all([getPartnerProfileForPortal(session.profile_id), getClinicPortalBrand(session.profile_id)]);
  if (!profile) redirect(tenant ? "/login" : "/partner-login");
  const publicWebsiteUrl = await clinicNurseSiteAddress({ slug: profile.slug, clinicBrand });
  const clinicsAvailable = clinicsEnabled();
  return <PartnerPortalClient initialProfile={profile} publicWebsiteUrl={publicWebsiteUrl} brandedDomain={!!tenant} screen={screen} clinicsAvailable={clinicsAvailable} clinicBrand={clinicBrand} />;
}
