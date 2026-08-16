import { NextResponse } from "next/server";

import {
  ensureAccountPasswordResetSchema,
  hashAccountPasswordResetToken,
  isTrustedAccountPasswordRequest,
} from "@/lib/accountPasswordReset";
import { getDbPool } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import {
  PARTNER_PORTAL_COOKIE,
  partnerPortalCookieOptions,
  revokeAllPartnerPortalSessions,
} from "@/lib/partnerPortalAuth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedAccountPasswordRequest(request, "partner")) {
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
  const pool = getDbPool();
  const client = await pool.connect();
  let profileId = "";
  try {
    await client.query("begin");
    const result = await client.query<{ token_id: string; profile_id: string }>(
      `select t.id as token_id, p.id as profile_id
         from app.account_password_reset_tokens t
         join app.partner_profiles p on p.id = t.account_id
        where t.account_kind = 'partner'
          and t.token_hash = $1
          and t.consumed_at is null
          and t.expires_at > now()
          and p.website_status in ('ready', 'published', 'hidden')
        limit 1
        for update of t, p`,
      [hashAccountPasswordResetToken(token)],
    );
    const row = result.rows[0] || null;
    if (!row) {
      await client.query("rollback");
      return NextResponse.json(
        { ok: false, error: "This reset link is invalid or has expired. Request a new one." },
        { status: 400 },
      );
    }

    profileId = row.profile_id;
    await client.query(
      `update app.partner_profiles
          set portal_password_hash = $2, updated_at = now()
        where id = $1`,
      [profileId, await hashPassword(password)],
    );
    await client.query(
      `update app.account_password_reset_tokens set consumed_at = now() where id = $1`,
      [row.token_id],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    console.error("Partner password reset failed", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ ok: false, error: "Unable to reset the password right now." }, { status: 500 });
  } finally {
    client.release();
  }

  await revokeAllPartnerPortalSessions(profileId);
  const response = NextResponse.json({ ok: true, next: "/login" });
  response.cookies.set(PARTNER_PORTAL_COOKIE, "", { ...partnerPortalCookieOptions(), maxAge: 0 });
  return response;
}
