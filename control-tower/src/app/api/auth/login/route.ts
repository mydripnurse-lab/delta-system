import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  buildSessionCookie,
  createSessionToken,
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionSecret,
} from "@/lib/session";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type LoginBody = {
  email?: string;
  password?: string;
  rememberMe?: boolean;
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(req: Request) {
  const secret = getSessionSecret();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Missing AUTH_SESSION_SECRET (or DEV_AUTH_SESSION_SECRET)." },
      { status: 500 },
    );
  }

  const body = (await req.json().catch(() => null)) as LoginBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const email = s(body.email).toLowerCase();
  const password = s(body.password);
  const rememberMe = Boolean(body.rememberMe);
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }

  const pool = getDbPool();
  const existing = await pool.query<{
    id: string;
    email: string;
    full_name: string | null;
    is_active: boolean;
    password_hash: string | null;
    failed_login_attempts: number | null;
    locked_until: Date | string | null;
  }>(
    `
      select
        id,
        email,
        full_name,
        is_active,
        password_hash,
        failed_login_attempts,
        locked_until
      from app.users
      where lower(email) = lower($1)
      limit 1
    `,
    [email],
  );

  const user = existing.rows[0] || null;
  if (!user) return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  if (!user.is_active) return NextResponse.json({ ok: false, error: "User is disabled." }, { status: 403 });
  const lockDate = user.locked_until ? new Date(user.locked_until) : null;
  if (lockDate && Number.isFinite(lockDate.getTime()) && lockDate.getTime() > Date.now()) {
    return NextResponse.json(
      { ok: false, error: "Account temporarily locked. Try again in a few minutes." },
      { status: 423 },
    );
  }

  const isValid = user.password_hash ? await verifyPassword(password, user.password_hash) : false;
  if (!isValid) {
    const attempts = Number(user.failed_login_attempts || 0) + 1;
    const shouldLock = attempts >= MAX_LOGIN_ATTEMPTS;
    await pool.query(
      `
        update app.users
        set
          failed_login_attempts = $2,
          locked_until = case when $3 then now() + ($4::text || ' minutes')::interval else null end
        where id = $1
      `,
      [user.id, attempts, shouldLock, LOCK_MINUTES],
    );
    return NextResponse.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  await pool.query(
    `
      update app.users
      set
        failed_login_attempts = 0,
        locked_until = null,
        last_login_at = now()
      where id = $1
    `,
    [user.id],
  );

  const token = createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.full_name || undefined,
    ttlSeconds: rememberMe ? 60 * 60 * 24 * 30 : DEFAULT_SESSION_TTL_SECONDS,
    secret,
  });
  const cookie = buildSessionCookie({
    token,
    maxAgeSeconds: rememberMe ? 60 * 60 * 24 * 30 : DEFAULT_SESSION_TTL_SECONDS,
  });

  return new NextResponse(
    JSON.stringify({
      ok: true,
      user: { id: user.id, email: user.email, fullName: user.full_name || null },
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "set-cookie": cookie,
      },
    },
  );
}
