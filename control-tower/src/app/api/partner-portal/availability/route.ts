import { NextResponse } from "next/server";
import { z } from "zod";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import {
  getPartnerWeeklyAvailability,
  savePartnerWeeklyAvailability,
} from "@/lib/partnerAvailability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { scheduleSchema } from "@/lib/partnerAvailabilitySchema";

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
