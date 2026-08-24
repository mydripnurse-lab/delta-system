import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { createStateMarketManager, listStateMarketManagers } from "@/lib/stateMarketManagers";
import { US_STATE_OPTIONS } from "@/lib/usStateOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, module: "market-management" });
  if ("response" in auth) return auth.response;
  try {
    const managers = await listStateMarketManagers();
    return NextResponse.json({ ok: true, managers, states: US_STATE_OPTIONS }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not load Market Managers." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, module: "market-management" });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  try {
    const origin = new URL(request.url).origin;
    const created = await createStateMarketManager({
      fullName: String(body.fullName || ""),
      email: String(body.email || ""),
      phone: String(body.phone || ""),
      assignments: body.assignments || body.stateCodes,
      actorUserId: auth.user.id,
      activationBaseUrl: `${origin}/partner-admin/activate`,
    });
    return NextResponse.json({ ok: true, ...created }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not create Market Manager." }, { status: 400 });
  }
}
