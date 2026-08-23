import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { listAdminBookingAppointments } from "@/lib/adminBookingAppointments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "appointments" });
  if ("response" in auth) return auth.response;
  try {
    const appointments = await listAdminBookingAppointments({
      search: request.nextUrl.searchParams.get("search") || "",
      status: request.nextUrl.searchParams.get("status") || "",
      limit: Number(request.nextUrl.searchParams.get("limit") || 250),
      stateCodes: auth.access.stateCodes,
    });
    return NextResponse.json({ ok: true, appointments }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin appointments] failed to load appointments", error);
    return NextResponse.json(
      { ok: false, error: "Could not load internal appointments." },
      { status: 500 },
    );
  }
}
