import { NextResponse } from "next/server";

import { getPartnerPortalSession } from "@/lib/partnerPortalAuth";
import { getPartnerAffiliateDashboard } from "@/lib/partnerAffiliate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getPartnerPortalSession();
  if (!session) return NextResponse.json({ ok: false, error: "Authentication required." }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, dashboard: await getPartnerAffiliateDashboard(session.profile_id) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load affiliate dashboard." }, { status: 500 });
  }
}
