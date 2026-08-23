import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { getStaffApplication, staffApplicationMatchesStateScope } from "@/lib/staffAdmin";
import {
  getApplicationWeeklyAvailability,
  PARTNER_TIMEZONES,
  saveApplicationWeeklyAvailability,
} from "@/lib/partnerAvailability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ applicationId: string }> };

const scheduleSchema = z.object({
  timezone: z.enum(PARTNER_TIMEZONES),
  days: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    enabled: z.boolean(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  })).length(7),
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
});

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to manage Partner availability.";
}

export async function GET(request: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(request, { module: "applications" });
  if ("response" in auth) return auth.response;
  try {
    const { applicationId } = await context.params;
    const application = await getStaffApplication(applicationId);
    if (!application || !staffApplicationMatchesStateScope(application, auth.access.stateCodes)) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }
    const availability = await getApplicationWeeklyAvailability(applicationId);
    return NextResponse.json({ ok: true, availability }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = errorMessage(error);
    return NextResponse.json({ ok: false, error: message }, { status: /profile/i.test(message) ? 404 : 500 });
  }
}

export async function PUT(request: NextRequest, context: Context) {
  const auth = await requirePartnerAdmin(request, { module: "applications", ownerOnly: true });
  if ("response" in auth) return auth.response;
  try {
    const { applicationId } = await context.params;
    const schedule = scheduleSchema.parse(await request.json());
    const availability = await saveApplicationWeeklyAvailability({ applicationId, ...schedule });
    return NextResponse.json({ ok: true, availability });
  } catch (error) {
    const message = errorMessage(error);
    return NextResponse.json(
      { ok: false, error: message },
      { status: error instanceof z.ZodError ? 400 : /profile/i.test(message) ? 404 : 500 },
    );
  }
}
