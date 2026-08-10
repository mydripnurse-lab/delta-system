import { NextResponse } from "next/server";
import { z } from "zod";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import {
  getPartnerWeeklyAvailability,
  PARTNER_TIMEZONES,
  savePartnerWeeklyAvailability,
} from "@/lib/partnerAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const scheduleSchema = z.object({
  timezone: z.enum(PARTNER_TIMEZONES),
  days: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })).length(7),
  blockedDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(366).default([]),
  blockedRanges: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/),
  })).max(732).default([]),
}).superRefine((value, context) => {
  const seen = new Set<number>();
  for (const [index, day] of value.days.entries()) {
    if (seen.has(day.dayOfWeek)) {
      context.addIssue({ code: "custom", path: ["days", index, "dayOfWeek"], message: "Each day can appear only once." });
    }
    seen.add(day.dayOfWeek);
    if (day.enabled && day.startTime >= day.endTime) {
      context.addIssue({ code: "custom", path: ["days", index, "endTime"], message: "End time must be after start time." });
    }
  }
  for (const [index, range] of value.blockedRanges.entries()) {
    if (range.startTime >= range.endTime) {
      context.addIssue({ code: "custom", path: ["blockedRanges", index, "endTime"], message: "End time must be after start time." });
    }
  }
});

function validRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "mydripnurse.com" || hostname.endsWith(".mydripnurse.com");
  } catch {
    return false;
  }
}

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  return NextResponse.json({ ok: true, availability: await getPartnerWeeklyAvailability(session.profile_id) });
}

export async function PUT(request: Request) {
  if (!validRequestOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    const schedule = scheduleSchema.parse(await request.json());
    const availability = await savePartnerWeeklyAvailability({ profileId: session.profile_id, ...schedule });
    return NextResponse.json({ ok: true, availability });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to save availability." },
      { status: error instanceof z.ZodError ? 400 : 500 },
    );
  }
}
