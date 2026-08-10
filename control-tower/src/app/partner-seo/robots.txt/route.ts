import { PARTNER_SITE_ORIGIN } from "@/lib/partnerSeo";

export const dynamic = "force-dynamic";

export async function GET() {
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /login",
    "Disallow: /portal",
    "Disallow: /*/apply",
    "Disallow: /*/services/*/book",
    `Sitemap: ${PARTNER_SITE_ORIGIN}/sitemap.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
