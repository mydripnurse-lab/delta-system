import { validPartnerPortalOrigin } from '@/lib/partnerPortalOrigin';
import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { markPartnerPortalTourCompleted } from "@/lib/partnerProfiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";



export async function POST(request: Request) {
  if (!await validPartnerPortalOrigin(request)) {
    return NextResponse.json({ ok: false, error: "Invalid request origin." }, { status: 403 });
  }
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });

  const completed = await markPartnerPortalTourCompleted(session.profile_id);
  if (!completed) return NextResponse.json({ ok: false, error: "Partner profile not found." }, { status: 404 });
  return NextResponse.json({ ok: true, completed: true });
}
