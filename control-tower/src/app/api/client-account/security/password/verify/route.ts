import { NextResponse } from "next/server";

import {
  ensureClientPortalSchema,
  getAuthenticatedClientFromRequest,
  hashAccountSecurityCode,
  isTrustedClientRequest,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { challengeId?: string; code?: string; password?: string } | null;
  const challengeId = String(body?.challengeId || "").trim();
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6);
  const password = String(body?.password || "");
  const passwordError = validatePasswordStrength(password);
  if (!challengeId || code.length !== 6) return NextResponse.json({ ok: false, error: "Enter the 6-digit security code." }, { status: 400 });
  if (passwordError) return NextResponse.json({ ok: false, error: passwordError }, { status: 400 });

  await ensureClientPortalSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ code_matches: boolean; attempt_count: number }>(
      `update app.account_security_challenges
          set attempt_count = attempt_count + 1,
              consumed_at = case when code_hash = $3 then now() else consumed_at end
        where id = $1 and account_kind = 'client' and account_id = $2
          and purpose = 'password_change' and consumed_at is null
          and expires_at > now() and attempt_count < 5
      returning (code_hash = $3) as code_matches, attempt_count`,
      [challengeId, account.id, hashAccountSecurityCode({ accountId: account.id, purpose: "password_change", code })],
    );
    const challenge = result.rows[0];
    if (!challenge) {
      await client.query("rollback");
      return NextResponse.json({ ok: false, error: "This code has expired. Request a new one." }, { status: 400 });
    }
    if (!challenge.code_matches) {
      await client.query("commit");
      const remaining = Math.max(0, 5 - challenge.attempt_count);
      return NextResponse.json({ ok: false, error: remaining ? `That code is not correct. ${remaining} attempts remaining.` : "Request a new security code." }, { status: 400 });
    }
    const passwordHash = await hashPassword(password);
    await client.query(
      `update app.client_accounts
          set password_hash = $2,
              auth_provider = case when auth_provider = 'google' then 'hybrid' else 'email' end,
              failed_login_attempts = 0, locked_until = null, updated_at = now()
        where id = $1`,
      [account.id, passwordHash],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
