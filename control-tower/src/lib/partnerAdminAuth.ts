import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  getPartnerAdminSessionSecret,
  PARTNER_ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/partnerAdminSession";
import { readCookieFromHeader, verifySessionToken } from "@/lib/session";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function allowedEmails() {
  return new Set(
    (text(process.env.PARTNER_ADMIN_EMAILS) || "ac@devasks.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isPartnerAdminEmailAllowed(email: string) {
  return allowedEmails().has(text(email).toLowerCase());
}

export async function requirePartnerAdmin(req: Request) {
  const secret = getPartnerAdminSessionSecret();
  if (!secret) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Partner administration authentication is not configured." },
        { status: 500 },
      ),
    };
  }

  const token = readCookieFromHeader(
    req.headers.get("cookie"),
    PARTNER_ADMIN_SESSION_COOKIE_NAME,
  );
  const session = token ? verifySessionToken(token, secret) : null;
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Session expired. Sign in again." },
        { status: 401 },
      ),
    };
  }

  if (!isPartnerAdminEmailAllowed(session.email)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 }),
    };
  }

  const existing = await getDbPool().query<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    is_active: boolean;
  }>(
    `select u.id, u.email, u.full_name, (to_jsonb(u)->>'avatar_url') as avatar_url, u.is_active
       from app.users u
      where u.id = $1
        and lower(u.email) = lower($2)
      limit 1`,
    [session.sub, session.email],
  );
  const user = existing.rows[0] || null;
  if (!user || !user.is_active || !isPartnerAdminEmailAllowed(user.email)) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 }),
    };
  }

  return {
    ok: true as const,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name || null,
      avatarUrl: user.avatar_url || null,
    },
  };
}
