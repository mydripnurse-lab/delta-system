import type { PublicPartnerProfile } from "./partnerProfiles";
import { providerCoverage } from "@/lib/providerSeo";

type Coverage = PublicPartnerProfile["serviceAreas"];
type Identity = Pick<PublicPartnerProfile, "displayName" | "professionalCredentials" | "publicTitle" | "clinicBrand">;

/** Concise geographic context for copy. Full, actual coverage stays in the area search and schema. */
export function nurseLocationContext(areas: Coverage): string {
  const coverage = providerCoverage(areas);
  if (!coverage.length) return "";
  if (coverage.length === 1) return coverage[0].label;
  const states = [...new Map(areas.map(area => area.state.trim()).filter(Boolean)
    .map(state => [state.toLowerCase(), state])).values()];
  if (states.length === 1) return `selected areas of ${states[0]}`;
  if (states.length === 2) return `selected areas of ${states.join(" and ")}`;
  return "the listed service areas";
}

/** Identity comes only from the published profile; a role never implies additional qualifications. */
export function nurseIdentity(profile: Identity): string {
  const credentials = profile.professionalCredentials.trim();
  return `${profile.displayName}${credentials ? ` (${credentials})` : ""}`;
}

export function nurseCareIntroduction(profile: Identity): string {
  const clinic = profile.clinicBrand?.name?.trim();
  return `Plan your visit with ${nurseIdentity(profile)}${clinic ? `, part of ${clinic}'s care team` : ""}. Choose a service, check times for your address and review your price before booking.`;
}
