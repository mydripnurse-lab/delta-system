import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { suspendStateMarketManager, updateStateMarketManager } from "@/lib/stateMarketManagers";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, module: "market-management" });
  if ("response" in auth) return auth.response;
  const { userId } = await context.params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  try {
    await updateStateMarketManager({
      userId,
      fullName: String(body.fullName || ""),
      phone: String(body.phone || ""),
      assignments: body.assignments || body.stateCodes,
      status: body.status === "active" || body.status === "invited" ? body.status : undefined,
      actorUserId: auth.user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not update Market Manager." }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, module: "market-management" });
  if ("response" in auth) return auth.response;
  const { userId } = await context.params;
  try {
    await suspendStateMarketManager(userId, auth.user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not suspend Market Manager." }, { status: 400 });
  }
}
