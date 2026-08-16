import { NextResponse } from "next/server";

import {
  ensureAccountPasswordResetSchema,
  hashAccountPasswordResetToken,
  isTrustedAccountPasswordRequest,
} from "@/lib/accountPasswordReset";
import { getDbPool } from "@/lib/db";
import { isPartnerAdminEmailAllowed } from "@/lib/partnerAdminAuth";
import { buildClearPartnerAdminSessionCookie } from "@/lib/partnerAdminSession";
import { hashPassword, validatePasswordStrength } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedAccountPasswordRequest(request, "admin")) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string } | null;
  const token = String(body?.token || "").trim();
  const password = String(body?.password || "").trim();
  const passwordError = validatePasswordStrength(password);
  if (!token || passwordError) {
    return NextResponse.json(
      { ok: false, error: passwordError || "This reset link is invalid." },
      { status: 400 },
    );
  }

  await ensureAccountPasswordResetSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{ token_id: string; user_id: string; email: string }>(
      `select t.id as token_id, u.id as user_id, u.email
         from app.account_password_reset_tokens t
         join app.users u on u.id = t.account_id
        where t.account_kind = 'admin'
          and t.token_hash = $1
          and t.consumed_at is null
          and t.expires_at > now()
          and u.is_active = true
        limit 1
        for update of t, u`,
      [hashAccountPasswordResetToken(token)],
    );
    const row = result.rows[0] || null;
    if (!row || !isPartnerAdminEmailAllowed(row.email)) {
      await client.query("rollback");
      return NextResponse.json(
        { ok: false, error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    await client.query(
      `update app.users
          set password_hash = $2,
              password_updated_at = now(),
              failed_login_attempts = 0,
              locked_until = null
        where id = $1`,
      [row.user_id, await hashPassword(password)],
    );
    await client.query(
      `update app.account_password_reset_tokens set consumed_at = now() where id = $1`,
      [row.token_id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Admin password reset failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, error: "Unable to reset the password right now." }, { status: 500 });
  } finally {
    client.release();
  }

  return new NextResponse(JSON.stringify({ ok: true, next: "/login" }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "set-cookie": buildClearPartnerAdminSessionCookie(),
    },
  });
}
