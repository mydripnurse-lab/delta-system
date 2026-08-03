import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { isPartnerAdminEmailAllowed } from "@/lib/partnerAdminAuth";
import {
  buildPartnerAdminSessionCookie,
  getPartnerAdminSessionSecret,
  PARTNER_ADMIN_SESSION_COOKIE_NAME,
  PARTNER_ADMIN_SESSION_TTL_SECONDS,
} from "@/lib/partnerAdminSession";
import { createSessionToken, readCookieFromHeader, verifySessionToken } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const secret = getPartnerAdminSessionSecret();
  const currentToken = readCookieFromHeader(
    req.headers.get("cookie"),
    PARTNER_ADMIN_SESSION_COOKIE_NAME,
  );
  const current = secret && currentToken ? verifySessionToken(currentToken, secret) : null;
  if (!current || !isPartnerAdminEmailAllowed(current.email)) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Sign in again." },
      { status: 401 },
    );
  }

  const result = await getDbPool().query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
  }>(
    `select id, email, full_name, is_active
       from app.users
      where id = $1
      limit 1`,
    [current.sub],
  );
  const user = result.rows[0] || null;
  if (!user || !user.is_active || !isPartnerAdminEmailAllowed(user.email)) {
    return NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 });
  }

  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name || undefined,
    ttlSeconds: PARTNER_ADMIN_SESSION_TTL_SECONDS,
    secret,
  });
  return new NextResponse(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": buildPartnerAdminSessionCookie({
        token,
        maxAgeSeconds: PARTNER_ADMIN_SESSION_TTL_SECONDS,
      }),
    },
  });
}
