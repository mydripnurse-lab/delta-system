import { NextResponse } from "next/server";

import {
  clientSessionCookie,
  createClientSessionToken,
  ensureClientPortalSchema,
  hashClientAuthToken,
  isTrustedClientRequest,
  linkVerifiedClientCustomers,
  safeClientDestination,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { claimClientReferralRegistration } from "@/lib/clientReferrals";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = String(body?.token || "").trim();
  if (!token) return NextResponse.json({ ok: false, error: "The verification link is invalid." }, { status: 400 });
  await ensureClientPortalSchema();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const result = await client.query<{
      token_id: string;
      id: string;
      email: string;
      full_name: string;
      redirect_to: string;
    }>(
      `select token.id as token_id, account.id, account.email, account.full_name, token.redirect_to
         from app.client_auth_tokens token
         join app.client_accounts account on account.id = token.client_account_id
        where token.purpose = 'verify_email'
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
      return NextResponse.json({ ok: false, error: "This verification link is invalid or has expired." }, { status: 400 });
    }
    await client.query(`update app.client_auth_tokens set consumed_at = now() where id = $1`, [account.token_id]);
    await client.query(
      `update app.client_accounts
          set email_verified_at = coalesce(email_verified_at, now()),
              failed_login_attempts = 0,
              locked_until = null,
              last_login_at = now(),
              updated_at = now()
        where id = $1`,
      [account.id],
    );
    await client.query("commit");
    await linkVerifiedClientCustomers(account.id);
    await claimClientReferralRegistration(account.id);
    const session = createClientSessionToken({ id: account.id, email: account.email, fullName: account.full_name });
    return new NextResponse(JSON.stringify({ ok: true, next: safeClientDestination("/", account.redirect_to) }), {
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
