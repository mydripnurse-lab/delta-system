import { NextResponse } from "next/server";

import {
  ensureClientPortalSchema,
  hashClientAuthToken,
  isTrustedClientRequest,
  newClientAuthToken,
} from "@/lib/clientPortalAuth";
import { clientEmailIsConfigured, sendClientPasswordResetEmail } from "@/lib/clientPortalEmail";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (!clientEmailIsConfigured()) {
    return NextResponse.json({ ok: false, error: "Password recovery is being configured. Please try again shortly." }, { status: 503 });
  }
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const result = await pool.query<{ id: string; full_name: string; email: string }>(
    `select id, full_name, email
       from app.client_accounts
      where normalized_email = $1 and email_verified_at is not null and password_hash is not null
      limit 1`,
    [email],
  );
  const account = result.rows[0];
  if (account) {
    const token = newClientAuthToken();
    await pool.query(
      `with consumed as (
         update app.client_auth_tokens
            set consumed_at = now()
          where client_account_id = $1 and purpose = 'reset_password' and consumed_at is null
       )
       insert into app.client_auth_tokens (client_account_id, purpose, token_hash, expires_at)
       values ($1, 'reset_password', $2, now() + interval '1 hour')`,
      [account.id, hashClientAuthToken(token)],
    );
    await sendClientPasswordResetEmail({ email: account.email, fullName: account.full_name, token }).catch((error) => {
      console.error("[client-auth] password-reset-email-failed", {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
  return NextResponse.json({
    ok: true,
    message: "If an eligible account exists, a secure reset link is on its way.",
  });
}
