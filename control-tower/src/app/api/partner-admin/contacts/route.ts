import { NextRequest, NextResponse } from "next/server";

import { listAdminBookingContacts } from "@/lib/adminBookingContacts";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request);
  if ("response" in auth) return auth.response;
  try {
    const contacts = await listAdminBookingContacts({
      search: request.nextUrl.searchParams.get("search") || "",
      limit: Number(request.nextUrl.searchParams.get("limit") || 400),
      from: request.nextUrl.searchParams.get("from") || "",
      to: request.nextUrl.searchParams.get("to") || "",
      relationship: request.nextUrl.searchParams.get("relationship") || "all",
    });
    return NextResponse.json({ ok: true, contacts }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[partner-admin contacts] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load contacts." }, { status: 500 });
  }
}
