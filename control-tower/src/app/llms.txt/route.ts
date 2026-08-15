import { listPublicPartnerProfiles } from "@/lib/partnerProfiles";
import { PARTNER_SITE_ORIGIN } from "@/lib/partnerSeo";

export const dynamic = "force-dynamic";

export async function GET() {
  const profiles = await listPublicPartnerProfiles(250);
  const body = [
    "# My Drip Nurse Partner Directory",
    "",
    "> Official directory of published My Drip Nurse mobile IV therapy Partners and their public service areas.",
    "",
    "## Primary pages",
    `- [Partner directory](${PARTNER_SITE_ORIGIN})`,
    `- [XML sitemap](${PARTNER_SITE_ORIGIN}/sitemap.xml)`,
    "- [Main My Drip Nurse website](https://mydripnurse.com)",
    "",
    "## Published Partners",
    ...profiles.map((profile) => `- [${profile.displayName}${profile.professionalCredentials ? `, ${profile.professionalCredentials}` : ""}](${PARTNER_SITE_ORIGIN}/${profile.slug}) — serves ${profile.serviceAreas.map((area) => `${area.county}, ${area.state}`).join("; ")}`),
    "",
    "Public profiles and locations are included only while published by My Drip Nurse.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
