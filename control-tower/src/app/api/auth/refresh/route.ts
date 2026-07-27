import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  buildSessionCookie,
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionSecret,
  readCookieFromHeader,
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/lib/session";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(req: Request) {
  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Session authentication is not configured." }, { status: 500 });
  }

  const authHeader = s(req.headers.get("authorization"));
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const cookieToken = readCookieFromHeader(req.headers.get("cookie"), SESSION_COOKIE_NAME);
  const currentToken = bearer || cookieToken;
  const current = currentToken ? verifySessionToken(currentToken, secret) : null;
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "Session expired. Sign in again to resume." },
      { status: 401 },
    );
  }

  const pool = getDbPool();
  const existing = await pool.query<{
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
  const user = existing.rows[0] || null;
  if (!user || !user.is_active) {
    return NextResponse.json({ ok: false, error: "User is unavailable or disabled." }, { status: 403 });
  }

  // Rolling sessions remain short-lived individually. Active dashboards and
  // long-running extension jobs rotate them well before this window expires.
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name || undefined,
    ttlSeconds: DEFAULT_SESSION_TTL_SECONDS,
    secret,
  });
  const cookie = buildSessionCookie({ token, maxAgeSeconds: DEFAULT_SESSION_TTL_SECONDS });

  return new NextResponse(
    JSON.stringify({
      ok: true,
      token,
      tokenType: "Bearer",
      expiresIn: DEFAULT_SESSION_TTL_SECONDS,
      user: { id: user.id, email: user.email, fullName: user.full_name || null },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "set-cookie": cookie,
      },
    },
  );
}
