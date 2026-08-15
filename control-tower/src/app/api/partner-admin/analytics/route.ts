import { NextRequest, NextResponse } from "next/server";

import { loadAdminAppointmentAnalytics } from "@/lib/adminAppointmentAnalytics";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const analytics = await loadAdminAppointmentAnalytics({
      period: request.nextUrl.searchParams.get("period") || "90",
      status: request.nextUrl.searchParams.get("status") || "",
      from: request.nextUrl.searchParams.get("from") || "",
      to: request.nextUrl.searchParams.get("to") || "",
      search: request.nextUrl.searchParams.get("search") || "",
      granularity: request.nextUrl.searchParams.get("granularity") || "week",
    });
    return NextResponse.json({ ok: true, analytics }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin analytics] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load geographic analytics." }, { status: 500 });
  }
}
