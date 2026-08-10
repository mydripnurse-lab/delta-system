import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { getPartnerProfileForPortal } from "@/lib/partnerProfiles";

import PartnerPortalClient, { type PartnerPortalScreen } from "./PartnerPortalClient";

export async function renderPartnerPortal(screen: PartnerPortalScreen) {
  const host = (await headers()).get("host")?.split(":")[0].toLowerCase();
  if (process.env.NODE_ENV === "production" && host !== "partners.mydripnurse.com") {
    redirect("https://partners.mydripnurse.com/portal");
  }
  const session = await getPartnerPortalSession();
  if (!session) redirect(process.env.NODE_ENV === "production" ? "https://partners.mydripnurse.com/partner-login" : "/partner-login");
  const profile = await getPartnerProfileForPortal(session.profile_id);
  if (!profile) redirect(process.env.NODE_ENV === "production" ? "https://partners.mydripnurse.com/partner-login" : "/partner-login");
  return <PartnerPortalClient initialProfile={profile} screen={screen} />;
}
