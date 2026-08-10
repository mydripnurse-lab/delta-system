import { NextRequest, NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { listPartnerPortalNotifications } from "@/lib/partnerPortalNotifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Partner authentication required." }, { status: 401 });
  try {
    const notifications = await listPartnerPortalNotifications(session.profile_id);
    return NextResponse.json({ ok: true, notifications }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load notifications." }, { status: 500 });
  }
}
