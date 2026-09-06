import { NextResponse } from "next/server";

import { loadCurrentMyDripNurseServiceMedia } from "@/lib/myDripNurseServices";
import { logPublicRequestDiagnostic } from "@/lib/publicRequestDiagnostics";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
  "X-Robots-Tag": "noindex, nofollow, nosnippet, noarchive",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request) {
  logPublicRequestDiagnostic(request.headers, "/api/public/service-media");
  try {
    const services = await loadCurrentMyDripNurseServiceMedia();
    return NextResponse.json({ services }, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("public-service-media", error);
    return NextResponse.json(
      { error: "Service media is temporarily unavailable." },
      { status: 503, headers: CORS_HEADERS },
    );
  }
}
