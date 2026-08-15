import { NextResponse } from "next/server";

import {
  clientSessionCookie,
  createClientSessionToken,
  ensureClientPortalSchema,
  isTrustedClientRequest,
  safeClientDestination,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const email = s(body?.email).toLowerCase();
  const password = s(body?.password);
  const destination = safeClientDestination(body?.next, body?.returnTo);
  if (!email || !password) {
    return NextResponse.json({ ok: false, error: "Email and password are required." }, { status: 400 });
  }
  if (email.length > 254 || password.length > 256) {
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }

  await ensureClientPortalSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    password_hash: string | null;
    email_verified_at: string | null;
    failed_login_attempts: number;
    locked_until: string | null;
  }>(
    `select id, email, full_name, password_hash, email_verified_at,
            failed_login_attempts, locked_until
       from app.client_accounts where normalized_email = $1 limit 1`,
    [email],
  );
  const account = result.rows[0];
  if (account?.locked_until && new Date(account.locked_until).getTime() > Date.now()) {
    return NextResponse.json({ ok: false, error: "Your account is temporarily locked. Try again shortly." }, { status: 423 });
  }
  const invalid = !account?.password_hash || !(await verifyPassword(password, account.password_hash));
  if (!account || invalid) {
    if (account) {
      const attempts = Number(account.failed_login_attempts || 0) + 1;
      await pool.query(
        `update app.client_accounts
            set failed_login_attempts = $2,
                locked_until = case when $2 >= 5 then now() + interval '15 minutes' else null end,
                updated_at = now()
          where id = $1`,
        [account.id, attempts],
      );
    }
    return NextResponse.json({ ok: false, error: "Invalid email or password." }, { status: 401 });
  }
  if (!account.email_verified_at) {
    return NextResponse.json({ ok: false, error: "Verify your email before signing in.", requiresVerification: true }, { status: 403 });
  }

  await pool.query(
    `update app.client_accounts
        set failed_login_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
      where id = $1`,
    [account.id],
  );
  const session = createClientSessionToken({ id: account.id, email: account.email, fullName: account.full_name });
  return new NextResponse(JSON.stringify({ ok: true, next: destination }), {
    status: 200,
    headers: { "content-type": "application/json", "set-cookie": clientSessionCookie(session) },
  });
}
