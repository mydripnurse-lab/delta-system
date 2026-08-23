import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  getPartnerAdminSessionSecret,
  PARTNER_ADMIN_SESSION_COOKIE_NAME,
} from "@/lib/partnerAdminSession";
import { readCookieFromHeader, verifySessionToken } from "@/lib/session";
import {
  canAccessPartnerAdminModule,
  isPlatformOwnerEmail,
  resolvePartnerAdminAccess,
  type PartnerAdminModule,
} from "@/lib/stateMarketManagers";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function isPartnerAdminEmailAllowed(email: string) {
  return isPlatformOwnerEmail(email);
}

export async function requirePartnerAdmin(
  req: Request,
  options?: { module?: PartnerAdminModule; ownerOnly?: boolean },
) {
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

  const existing = await getDbPool().query<{
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    is_active: boolean;
    password_updated_at: Date | string | null;
  }>(
    `select u.id, u.email, u.full_name, (to_jsonb(u)->>'avatar_url') as avatar_url,
            u.is_active, u.password_updated_at
       from app.users u
      where u.id = $1
        and lower(u.email) = lower($2)
      limit 1`,
    [session.sub, session.email],
  );
  const user = existing.rows[0] || null;
  if (!user || !user.is_active) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 }),
    };
  }

  const access = await resolvePartnerAdminAccess({ userId: user.id, email: user.email });
  if (
    !access ||
    access.status !== "active" ||
    (options?.ownerOnly && !access.isOwner) ||
    !canAccessPartnerAdminModule(access, options?.module)
  ) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: "Access denied." }, { status: 403 }),
    };
  }

  const passwordUpdatedAt = user.password_updated_at ? new Date(user.password_updated_at) : null;
  if (
    passwordUpdatedAt &&
    Number.isFinite(passwordUpdatedAt.getTime()) &&
    Math.floor(passwordUpdatedAt.getTime() / 1000) > session.iat
  ) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, error: "Session expired after a password change. Sign in again." },
        { status: 401 },
      ),
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
    access,
  };
}
