import { NextResponse } from "next/server";

import {
  ensureClientPortalSchema,
  getAuthenticatedClientFromRequest,
  hashAccountSecurityCode,
  isTrustedClientRequest,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { challengeId?: string; code?: string } | null;
  const challengeId = String(body?.challengeId || "").trim();
  const code = String(body?.code || "").replace(/\D/g, "").slice(0, 6);
  if (!challengeId || code.length !== 6) {
    return NextResponse.json({ ok: false, error: "Enter the 6-digit verification code." }, { status: 400 });
  }

  await ensureClientPortalSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ phone: string; code_matches: boolean; attempt_count: number }>(
      `update app.account_security_challenges
          set attempt_count = attempt_count + 1,
              consumed_at = case when code_hash = $3 then now() else consumed_at end
        where id = $1 and account_kind = 'client' and account_id = $2
          and purpose = 'phone_verification' and consumed_at is null
          and expires_at > now() and attempt_count < 5
      returning pending_value->>'phone' as phone, (code_hash = $3) as code_matches, attempt_count`,
      [challengeId, account.id, hashAccountSecurityCode({ accountId: account.id, purpose: "phone_verification", code })],
    );
    const challenge = result.rows[0];
    if (!challenge) {
      await client.query("rollback");
      return NextResponse.json({ ok: false, error: "This code has expired. Request a new one." }, { status: 400 });
    }
    if (!challenge.code_matches) {
      await client.query("commit");
      const remaining = Math.max(0, 5 - challenge.attempt_count);
      return NextResponse.json({ ok: false, error: remaining ? `That code is not correct. ${remaining} attempts remaining.` : "Request a new verification code." }, { status: 400 });
    }
    await client.query(
      `update app.client_accounts
          set phone = $2,
              preferences = jsonb_set(coalesce(preferences, '{}'::jsonb), '{phoneVerification}', jsonb_build_object('phone', $2::text, 'verifiedAt', now()::text), true),
              updated_at = now()
        where id = $1`,
      [account.id, challenge.phone],
    );
    await client.query("commit");
    return NextResponse.json({ ok: true, phone: challenge.phone, verified: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
