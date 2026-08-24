import { NextResponse } from "next/server";

import { loadCurrentMyDripNurseServiceMedia } from "@/lib/myDripNurseServices";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600",
  "X-Robots-Tag": "noindex, nofollow, nosnippet, noarchive",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
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
