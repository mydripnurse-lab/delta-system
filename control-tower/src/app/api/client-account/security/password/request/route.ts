import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  ensureClientPortalSchema,
  getAuthenticatedClientFromRequest,
  hashAccountSecurityCode,
  isTrustedClientRequest,
  newAccountSecurityCode,
} from "@/lib/clientPortalAuth";
import { clientEmailIsConfigured, sendClientPasswordChangeCodeEmail } from "@/lib/clientPortalEmail";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

const EXPIRES_IN_MINUTES = 10;

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  if (!clientEmailIsConfigured()) {
    return NextResponse.json({ ok: false, error: "Password security email is being configured. Please try again shortly." }, { status: 503 });
  }

  await ensureClientPortalSchema();
  const pool = getDbPool();
  const recent = await pool.query<{ retry_after: number }>(
    `select greatest(1, ceil(extract(epoch from (last_sent_at + interval '60 seconds' - now()))))::int as retry_after
       from app.account_security_challenges
      where account_kind = 'client' and account_id = $1 and purpose = 'password_change'
        and consumed_at is null and last_sent_at > now() - interval '60 seconds'
      order by last_sent_at desc
      limit 1`,
    [account.id],
  );
  if (recent.rows[0]) {
    return NextResponse.json({ ok: false, error: `Please wait ${recent.rows[0].retry_after} seconds before requesting another code.` }, { status: 429 });
  }

  const challengeId = randomUUID();
  const code = newAccountSecurityCode();
  await pool.query(
    `with consumed as (
       update app.account_security_challenges
          set consumed_at = now()
        where account_kind = 'client' and account_id = $1 and purpose = 'password_change' and consumed_at is null
     )
     insert into app.account_security_challenges
       (id, account_kind, account_id, purpose, delivery_channel, destination, code_hash, expires_at)
     values ($2, 'client', $1, 'password_change', 'email', $3, $4, now() + interval '10 minutes')`,
    [account.id, challengeId, account.email, hashAccountSecurityCode({ accountId: account.id, purpose: "password_change", code })],
  );
  try {
    await sendClientPasswordChangeCodeEmail({
      email: account.email,
      fullName: account.fullName,
      code,
      challengeId,
      expiresInMinutes: EXPIRES_IN_MINUTES,
    });
  } catch (error) {
    await pool.query(`update app.account_security_challenges set consumed_at = now() where id = $1`, [challengeId]);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "The security code could not be sent." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, challengeId, expiresInMinutes: EXPIRES_IN_MINUTES });
}
