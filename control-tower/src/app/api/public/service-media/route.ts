import { gzipSync, gunzipSync } from "node:zlib";
import { loadPricingRegions } from "@/lib/regionalPricingCatalog";
import { pricingHost, regionForHost, resolveRegionalPrice, SERVICE_PRICING_TAG } from "@/lib/regionalPricing";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

import { loadCurrentMyDripNurseServiceMedia } from "@/lib/myDripNurseServices";
import { logPublicRequestDiagnostic } from "@/lib/publicRequestDiagnostics";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800",
  "X-Robots-Tag": "noindex, nofollow, nosnippet, noarchive",
};

const getCachedServiceMedia = unstable_cache(
  async () => gzipSync(JSON.stringify(await loadCurrentMyDripNurseServiceMedia())).toString("base64"),
  ["public-service-media", "regional-prices-v1"],
  { revalidate: 3600, tags: [SERVICE_PRICING_TAG] },
);

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  const startedAt = Date.now();
  try {
    const packed = await getCachedServiceMedia();
    const catalog = JSON.parse(gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 32 * 1024 * 1024 }).toString("utf8")) as Awaited<ReturnType<typeof loadCurrentMyDripNurseServiceMedia>>;
    const site = pricingHost(new URL(request.url).searchParams.get("site") || "");
    const regional = new URL(request.url).searchParams.get("v") === "regional-v1";
    const hasRules = catalog.some(service => service.regionalPrices?.length);
    const region = regional && site && site !== "mydripnurse.com" && hasRules
      ? regionForHost((await loadPricingRegions()).regions, site) : null;
    const services = catalog.map(({ regionalPrices, basePrice, currency, ...service }) => {
      const resolved = resolveRegionalPrice(basePrice ?? 0, regionalPrices || [], region);
      return { ...service, price: regional && site && site !== "mydripnurse.com" && hasRules && !region ? "" : basePrice === undefined ? service.price : new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(resolved.price) };
    });
    const body = JSON.stringify({ services, pricingVersion: "regional-v1", pricingSite: site });
    logPublicRequestDiagnostic(request.headers, "/api/public/service-media", {
      responseBytes: new TextEncoder().encode(body).byteLength,
      serviceCount: services.length,
      databaseDurationMs: Date.now() - startedAt,
    });
    return new NextResponse(body, {
      headers: {
        ...CORS_HEADERS,
        ...(regional ? { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=60" } : {}),
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("public-service-media", error);
    return NextResponse.json(
      { error: "Service media is temporarily unavailable." },
      { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } },
    );
  }
}
