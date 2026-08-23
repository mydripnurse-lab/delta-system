import { NextRequest, NextResponse } from "next/server";

import { getPartnerDirectoryAdminAnalytics } from "@/lib/partnerDirectoryAnalytics";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "directory-analytics" });
  if ("response" in auth) return auth.response;
  try {
    const days = Number(request.nextUrl.searchParams.get("days") || 30);
    return NextResponse.json(
      { ok: true, analytics: await getPartnerDirectoryAdminAnalytics(days, auth.access.stateCodes) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[partner-admin directory analytics] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load directory analytics." }, { status: 500 });
  }
}
