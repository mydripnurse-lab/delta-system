import { listPublicPartnerProfiles } from "@/lib/partnerProfiles";
import { PARTNER_SITE_ORIGIN } from "@/lib/partnerSeo";

export const dynamic = "force-dynamic";

export async function GET() {
  const profiles = await listPublicPartnerProfiles(250);
  const body = [
    "# My Drip Nurse Partner Network",
    "",
    "> My Drip Nurse helps independent nurses and clinics gain visibility, attract traffic and connect with appointment opportunities through its presence across the United States and Puerto Rico. Applications require review; acceptance does not guarantee appointments or income.",
    "",
    "## Primary pages",
    `- [Join the nurse and clinic network](${PARTNER_SITE_ORIGIN})`,
    `- [How to join](${PARTNER_SITE_ORIGIN}/#how-it-works)`,
    `- [Network FAQs](${PARTNER_SITE_ORIGIN}/#faq)`,
    `- [Nurse directory and map](${PARTNER_SITE_ORIGIN}/directory)`,
    `- [Clinic directory](${PARTNER_SITE_ORIGIN}/directory/clinics)`,
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
