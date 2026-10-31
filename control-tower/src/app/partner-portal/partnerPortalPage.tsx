import Link from "next/link";
import { clinicsEnabled } from "@/lib/clinicAuth";
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
  return <>{clinicsEnabled() ? <nav style={{padding:"12px 24px",background:"#e9f3f7",textAlign:"right"}}><Link href="/portal/clinics">Clinic workspace →</Link></nav> : null}<PartnerPortalClient initialProfile={profile} screen={screen} /></>;
}
