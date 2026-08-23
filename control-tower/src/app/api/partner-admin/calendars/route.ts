import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { listAdminBookingCalendarDirectory } from "@/lib/partnerServiceAssignments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The calendar request failed.";
}

export async function GET(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { module: "calendars", ownerOnly: true });
  if ("response" in auth) return auth.response;
  try {
    const calendars = await listAdminBookingCalendarDirectory();
    return NextResponse.json({ ok: true, calendars }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { module: "calendars", ownerOnly: true });
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(
      { ok: true, calendars: await listAdminBookingCalendarDirectory() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requirePartnerAdmin(req, { module: "calendars", ownerOnly: true });
  if ("response" in auth) return auth.response;
  return NextResponse.json(
    { ok: false, error: "Calendar setup is managed from the Services catalog. Use the Services screen to edit price, deposit or booking rules." },
    { status: 405, headers: { allow: "GET, POST" } },
  );
}
