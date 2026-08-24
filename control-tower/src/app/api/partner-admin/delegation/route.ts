import { NextResponse } from "next/server";

import { getDbPool } from "@/lib/db";
import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import {
  buildClearPartnerAdminDelegationCookie,
  buildPartnerAdminDelegationCookie,
  getPartnerAdminSessionSecret,
} from "@/lib/partnerAdminSession";
import { createSessionToken } from "@/lib/session";
import { resolvePartnerAdminAccess } from "@/lib/stateMarketManagers";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, ignoreDelegation: true });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null) as { managerUserId?: string } | null;
  const managerUserId = String(body?.managerUserId || "").trim();
  const result = await getDbPool().query<{ id: string; email: string; full_name: string | null }>(
    `select id, email, full_name from app.users where id = $1 and is_active = true limit 1`,
    [managerUserId],
  );
  const manager = result.rows[0];
  const access = manager ? await resolvePartnerAdminAccess({ userId: manager.id, email: manager.email }) : null;
  if (!manager || access?.role !== "state_market_manager" || access.status !== "active") {
    return NextResponse.json({ ok: false, error: "This Market Manager is not active." }, { status: 404 });
  }
  const secret = getPartnerAdminSessionSecret();
  const ttlSeconds = 60 * 60 * 2;
  const token = createSessionToken({
    userId: manager.id,
    email: manager.email,
    name: manager.full_name || undefined,
    ttlSeconds,
    secret: `${secret}:delegation`,
  });
  await getDbPool().query(
    `insert into app.admin_access_audit_log (actor_user_id, target_user_id, action, after_payload)
     values ($1, $2, 'state_manager.delegation_started', $3::jsonb)`,
    [auth.user.id, manager.id, JSON.stringify({ expiresInSeconds: ttlSeconds })],
  );
  return new NextResponse(JSON.stringify({ ok: true, redirectTo: "/partner-admin/partners" }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": buildPartnerAdminDelegationCookie({ token, maxAgeSeconds: ttlSeconds }),
    },
  });
}

export async function DELETE(request: Request) {
  const auth = await requirePartnerAdmin(request, { ownerOnly: true, ignoreDelegation: true });
  if ("response" in auth) return auth.response;
  return new NextResponse(JSON.stringify({ ok: true, redirectTo: "/partner-admin/market-management" }), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": buildClearPartnerAdminDelegationCookie(),
    },
  });
}
