import { NextResponse } from "next/server";

import { recordPartnerDirectoryEvent } from "@/lib/partnerDirectoryAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const event = String(body?.event || "");
    if (!(["impression", "profile_click", "booking_click"] as string[]).includes(event)) {
      return NextResponse.json({ ok: false, error: "Invalid event." }, { status: 400 });
    }
    const partnerProfileIds = (Array.isArray(body?.partnerProfileIds) ? body.partnerProfileIds : [body?.partnerProfileId])
      .map((value: unknown) => String(value || "").trim())
      .filter((value: string) => UUID.test(value));
    if (!partnerProfileIds.length) return NextResponse.json({ ok: false, error: "Invalid Partner." }, { status: 400 });
    await recordPartnerDirectoryEvent(partnerProfileIds, event as "impression" | "profile_click" | "booking_click");
    return NextResponse.json({ ok: true }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Unable to record directory activity." }, { status: 500 });
  }
}
