import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { sendClientPhoneOtpThroughGhl } from "@/lib/accountSecurityCommunication";
import {
  ensureClientPortalSchema,
  getAuthenticatedClientFromRequest,
  hashAccountSecurityCode,
  isTrustedClientRequest,
  newAccountSecurityCode,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { normalizePhone, phoneCountry, phoneIsComplete } from "@/lib/phoneInput";

export const runtime = "nodejs";

const EXPIRES_IN_MINUTES = 10;

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClientFromRequest(request);
  if (!account) return NextResponse.json({ ok: false, error: "Please sign in again." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { phone?: string } | null;
  const rawPhone = String(body?.phone || "").trim();
  if (!phoneIsComplete(rawPhone)) {
    return NextResponse.json({ ok: false, error: "Enter a complete 10-digit mobile number." }, { status: 400 });
  }
  const phone = normalizePhone(rawPhone, phoneCountry(rawPhone));

  await ensureClientPortalSchema();
  const pool = getDbPool();
  const recent = await pool.query<{ retry_after: number }>(
    `select greatest(1, ceil(extract(epoch from (last_sent_at + interval '60 seconds' - now()))))::int as retry_after
       from app.account_security_challenges
      where account_kind = 'client' and account_id = $1 and purpose = 'phone_verification'
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
        where account_kind = 'client' and account_id = $1 and purpose = 'phone_verification' and consumed_at is null
     )
     insert into app.account_security_challenges
       (id, account_kind, account_id, purpose, delivery_channel, destination, code_hash, pending_value, expires_at)
     values ($2, 'client', $1, 'phone_verification', 'sms', $3, $4, jsonb_build_object('phone', $3::text), now() + interval '10 minutes')`,
    [account.id, challengeId, phone, hashAccountSecurityCode({ accountId: account.id, purpose: "phone_verification", code })],
  );

  try {
    await sendClientPhoneOtpThroughGhl({
      challengeId,
      accountId: account.id,
      fullName: account.fullName,
      email: account.email,
      phone,
      code,
      expiresInMinutes: EXPIRES_IN_MINUTES,
    });
  } catch (error) {
    await pool.query(`update app.account_security_challenges set consumed_at = now() where id = $1`, [challengeId]);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "The verification code could not be sent.",
    }, { status: 503 });
  }

  return NextResponse.json({ ok: true, challengeId, expiresInMinutes: EXPIRES_IN_MINUTES });
}
