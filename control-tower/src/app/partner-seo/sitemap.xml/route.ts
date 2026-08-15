import { definitionForCalendar, partnerServiceSlug } from "@/lib/myDripNurseServices";
import { listPublishedPartnerWebsites } from "@/lib/partnerProfiles";
import { PARTNER_SITE_ORIGIN, partnerPublicUrl } from "@/lib/partnerSeo";

export const dynamic = "force-dynamic";

function xml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(opts: {
  loc: string;
  priority: string;
  changeFrequency: string;
  imageUrl?: string;
  imageTitle?: string;
}) {
  const image = opts.imageUrl
    ? `<image:image><image:loc>${xml(opts.imageUrl)}</image:loc><image:title>${xml(opts.imageTitle || "My Drip Nurse Partner")}</image:title></image:image>`
    : "";
  return `<url><loc>${xml(opts.loc)}</loc><changefreq>${opts.changeFrequency}</changefreq><priority>${opts.priority}</priority>${image}</url>`;
}

export async function GET() {
  const profiles = await listPublishedPartnerWebsites(250);
  const entries = [
    urlEntry({
      loc: PARTNER_SITE_ORIGIN,
      priority: "1.0",
      changeFrequency: "daily",
    }),
    ...profiles.flatMap((profile) => {
      const seen = new Set<string>();
      const serviceEntries = profile.services.flatMap((service) => {
        if (["inactive", "disabled", "removed"].includes(String(service.status || "").toLowerCase())) return [];
        const definition = definitionForCalendar(service.name);
        if (!definition) return [];
        const serviceSlug = partnerServiceSlug(definition);
        if (seen.has(serviceSlug)) return [];
        seen.add(serviceSlug);
        return [urlEntry({
          loc: partnerPublicUrl(profile.slug, `services/${serviceSlug}`),
          priority: "0.75",
          changeFrequency: "weekly",
          imageUrl: definition.imageUrl,
          imageTitle: `${definition.name} with ${profile.displayName}`,
        })];
      });
      return [
        urlEntry({
          loc: partnerPublicUrl(profile.slug),
          priority: "0.9",
          changeFrequency: "weekly",
          imageUrl: profile.profilePhotoUrl || undefined,
          imageTitle: `${profile.displayName} — My Drip Nurse Partner`,
        }),
        urlEntry({
          loc: partnerPublicUrl(profile.slug, "services"),
          priority: "0.8",
          changeFrequency: "weekly",
        }),
        ...serviceEntries,
        urlEntry({
          loc: partnerPublicUrl(profile.slug, "become-a-partner"),
          priority: "0.6",
          changeFrequency: "monthly",
        }),
      ];
    }),
  ];

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.join("")}</urlset>`;

  return new Response(body, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
