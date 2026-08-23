import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  buildPartnerAdminSessionCookie,
  getPartnerAdminSessionSecret,
  PARTNER_ADMIN_SESSION_TTL_SECONDS,
} from "@/lib/partnerAdminSession";
import { verifyPassword } from "@/lib/password";
import { createSessionToken } from "@/lib/session";
import { resolvePartnerAdminAccess } from "@/lib/stateMarketManagers";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  const secret = getPartnerAdminSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Partner administration authentication is not configured." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as {
    email?: string;
    password?: string;
    rememberMe?: boolean;
  } | null;
  const email = text(body?.email).toLowerCase();
  const password = text(body?.password);
  const rememberMe = Boolean(body?.rememberMe);
  if (!email || !password) {
    return NextResponse.json(
      { ok: false, error: "Email and password are required." },
      { status: 400 },
    );
  }
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    password_hash: string | null;
    failed_login_attempts: number | null;
    locked_until: Date | string | null;
  }>(
    `select id, email, full_name, is_active, password_hash,
            failed_login_attempts, locked_until
       from app.users
      where lower(email) = lower($1)
      limit 1`,
    [email],
  );
  const user = result.rows[0] || null;
  if (!user || !user.is_active) {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const access = await resolvePartnerAdminAccess({ userId: user.id, email: user.email }, pool);
  if (!access || access.status !== "active") {
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const lockDate = user.locked_until ? new Date(user.locked_until) : null;
  if (lockDate && Number.isFinite(lockDate.getTime()) && lockDate.getTime() > Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Account temporarily locked. Try again in a few minutes." },
      { status: 423 },
    );
  }

  const valid = user.password_hash ? await verifyPassword(password, user.password_hash) : false;
  if (!valid) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    await pool.query(
      `update app.users
          set failed_login_attempts = $2,
              locked_until = case when $3 then now() + ($4::text || ' minutes')::interval else null end
        where id = $1`,
      [user.id, attempts, attempts >= MAX_LOGIN_ATTEMPTS, LOCK_MINUTES],
    );
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  await pool.query(
    `update app.users
        set failed_login_attempts = 0, locked_until = null, last_login_at = now()
      where id = $1`,
    [user.id],
  );

  const maxAgeSeconds = rememberMe ? 60 * 60 * 24 * 30 : PARTNER_ADMIN_SESSION_TTL_SECONDS;
  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name || undefined,
    ttlSeconds: maxAgeSeconds,
    secret,
  });

  return new NextResponse(
    JSON.stringify({
      ok: true,
      user: { id: user.id, email: user.email, fullName: user.full_name || null },
      access,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "set-cookie": buildPartnerAdminSessionCookie({ token, maxAgeSeconds }),
      },
    },
  );
}
