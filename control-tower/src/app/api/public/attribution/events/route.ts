import { NextResponse } from "next/server";
import { z } from "zod";

import { ATTRIBUTION_EVENT_TYPES, recordBookingAttributionTouchpoint } from "@/lib/bookingAttribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const schema = z.object({
  eventId: z.string().trim().min(8).max(160),
  sessionId: z.string().trim().min(8).max(160),
  visitorId: z.string().trim().min(8).max(160),
  pageUrl: z.string().trim().url().max(2000),
  referrer: z.string().trim().url().max(2000).optional(),
  eventType: z.enum(ATTRIBUTION_EVENT_TYPES),
  source: z.string().trim().max(120).optional(),
  channel: z.string().trim().max(120).optional(),
  campaign: z.string().trim().max(200).optional(),
  serviceSlug: z.string().trim().max(160).optional(),
  partnerProfileId: z.string().trim().max(160).optional(),
  attribution: z.record(z.string().max(100), z.string().max(300)).optional().default({}),
  occurredAt: z.string().datetime({ offset: true }).optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function POST(request: Request) {
  try {
    const result = await recordBookingAttributionTouchpoint(schema.parse(await request.json()));
    return NextResponse.json({ ok: true, ...result }, { headers: { ...cors, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Invalid attribution event." }, { status: 400, headers: cors });
    return NextResponse.json({ ok: false, error: "Attribution could not be recorded." }, { status: 500, headers: cors });
  }
}
