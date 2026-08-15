import { NextResponse } from "next/server";

import {
  clientSessionCookie,
  createClientSessionToken,
  ensureClientPortalSchema,
  hashClientAuthToken,
  isTrustedClientRequest,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string } | null;
  const token = String(body?.token || "").trim();
  const password = String(body?.password || "").trim();
  const passwordError = validatePasswordStrength(password);
  if (!token) return NextResponse.json({ ok: false, error: "This reset link is invalid." }, { status: 400 });
  if (passwordError) return NextResponse.json({ ok: false, error: passwordError }, { status: 400 });

  await ensureClientPortalSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ token_id: string; id: string; email: string; full_name: string }>(
      `select token.id as token_id, account.id, account.email, account.full_name
         from app.client_auth_tokens token
         join app.client_accounts account on account.id = token.client_account_id
        where token.purpose = 'reset_password'
          and token.token_hash = $1
          and token.consumed_at is null
          and token.expires_at > now()
        for update of token, account
        limit 1`,
      [hashClientAuthToken(token)],
    );
    const account = result.rows[0];
    if (!account) {
      await client.query("rollback");
      return NextResponse.json({ ok: false, error: "This reset link is invalid or has expired." }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await client.query(`update app.client_auth_tokens set consumed_at = now() where id = $1`, [account.token_id]);
    await client.query(
      `update app.client_accounts
          set password_hash = $2,
              auth_provider = case when auth_provider = 'google' then 'hybrid' else 'email' end,
              failed_login_attempts = 0, locked_until = null, updated_at = now()
        where id = $1`,
      [account.id, passwordHash],
    );
    await client.query("commit");
    const session = createClientSessionToken({ id: account.id, email: account.email, fullName: account.full_name });
    return new NextResponse(JSON.stringify({ ok: true, next: "/" }), {
      status: 200,
      headers: { "content-type": "application/json", "set-cookie": clientSessionCookie(session) },
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
