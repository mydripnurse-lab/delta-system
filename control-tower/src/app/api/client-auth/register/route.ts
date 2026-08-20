import { NextResponse } from "next/server";

import {
  clientSessionCookie,
  createClientSessionToken,
  ensureClientPortalSchema,
  hashClientAuthToken,
  isTrustedClientRequest,
  newClientAuthToken,
  safeClientDestination,
} from "@/lib/clientPortalAuth";
import { clientEmailIsConfigured, sendClientVerificationEmail } from "@/lib/clientPortalEmail";
import { claimClientReferralRegistration, safeClientReferralCode } from "@/lib/clientReferrals";
import { getDbPool } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { normalizePhone, phoneCountry, phoneIsComplete } from "@/lib/phoneInput";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  const fullName = s(body.fullName);
  const email = s(body.email).toLowerCase();
  const rawPhone = s(body.phone);
  const phone = rawPhone ? normalizePhone(rawPhone, phoneCountry(rawPhone)) : "";
  const password = s(body.password);
  const referralCode = safeClientReferralCode(body.referral);
  const destination = safeClientDestination(body.next, body.returnTo);
  if (!fullName || !email || !password) {
    return NextResponse.json({ ok: false, error: "Name, email and password are required." }, { status: 400 });
  }
  if (fullName.length > 120 || email.length > 254 || phone.length > 40) {
    return NextResponse.json({ ok: false, error: "One or more fields are too long." }, { status: 400 });
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ ok: false, error: "Enter a valid email address." }, { status: 400 });
  }
  if (rawPhone && !phoneIsComplete(rawPhone)) {
    return NextResponse.json({ ok: false, error: "Enter a complete mobile number." }, { status: 400 });
  }
  const passwordError = validatePasswordStrength(password);
  if (passwordError) return NextResponse.json({ ok: false, error: passwordError }, { status: 400 });

  await ensureClientPortalSchema();
  const pool = getDbPool();
  const existing = await pool.query<{
    id: string;
    full_name: string;
    email_verified_at: string | null;
  }>(
    `select id, full_name, email_verified_at
       from app.client_accounts where normalized_email = $1 limit 1`,
    [email],
  );
  const existingAccount = existing.rows[0];
  const emailConfigured = clientEmailIsConfigured();
  if (existingAccount?.email_verified_at) {
    return NextResponse.json({ ok: false, error: "An account already exists for this email. Sign in instead." }, { status: 409 });
  }
  if (existingAccount && emailConfigured) {
    if (referralCode) {
      await pool.query(
        `update app.client_accounts
            set preferences = preferences || jsonb_build_object(
                  'referral', coalesce(preferences -> 'referral', '{}'::jsonb)
                    || jsonb_build_object('pendingCode', $2::text)
                ),
                updated_at = now()
          where id = $1`,
        [existingAccount.id, referralCode],
      );
    }
    const verificationToken = newClientAuthToken();
    await pool.query(
      `with consumed as (
         update app.client_auth_tokens
            set consumed_at = now()
          where client_account_id = $1 and purpose = 'verify_email' and consumed_at is null
       )
       insert into app.client_auth_tokens (client_account_id, purpose, token_hash, expires_at, redirect_to)
       values ($1, 'verify_email', $2, now() + interval '24 hours', $3)`,
      [existingAccount.id, hashClientAuthToken(verificationToken), destination],
    );
    await sendClientVerificationEmail({
      email,
      fullName: existingAccount.full_name || fullName,
      token: verificationToken,
      returnTo: destination,
    });
    return NextResponse.json({
      ok: true,
      requiresVerification: true,
      next: destination,
      message: "We sent a fresh verification link to your email.",
    }, { status: 200 });
  }
  if (existingAccount) {
    return NextResponse.json({ ok: false, error: "An account already exists for this email. Sign in instead." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  if (process.env.NODE_ENV === "production" && !emailConfigured) {
    return NextResponse.json({
      ok: false,
      error: "Secure email verification is being configured. Please use Google or try again shortly.",
    }, { status: 503 });
  }
  const created = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    phone: string;
  }>(
    `insert into app.client_accounts (
       email, normalized_email, full_name, phone, password_hash, auth_provider, email_verified_at, preferences
     ) values ($1, $1, $2, $3, $4, 'email', case when $5 then null else now() end,
       case when $6 = '' then '{}'::jsonb else jsonb_build_object('referral', jsonb_build_object('pendingCode', $6::text)) end)
     returning id, email, full_name, phone`,
    [email, fullName, phone, passwordHash, emailConfigured, referralCode],
  );
  const account = created.rows[0];
  if (!account) return NextResponse.json({ ok: false, error: "The account could not be created." }, { status: 500 });

  if (emailConfigured) {
    const verificationToken = newClientAuthToken();
    await pool.query(
      `insert into app.client_auth_tokens (client_account_id, purpose, token_hash, expires_at, redirect_to)
       values ($1, 'verify_email', $2, now() + interval '24 hours', $3)`,
      [account.id, hashClientAuthToken(verificationToken), destination],
    );
    try {
      await sendClientVerificationEmail({ email, fullName, token: verificationToken, returnTo: destination });
    } catch (error) {
      console.error("[client-auth] verification-email-failed", {
        accountId: account.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json({
        ok: true,
        requiresVerification: true,
        next: destination,
        message: "Your account was created, but the verification email could not be sent yet. Please try again shortly.",
      }, { status: 202 });
    }
    return NextResponse.json({
      ok: true,
      requiresVerification: true,
      next: destination,
      message: "Check your email to verify your secure patient account.",
    }, { status: 201 });
  }

  // Development fallback only. Production must configure transactional email.
  if (referralCode) await claimClientReferralRegistration(account.id, referralCode);
  await pool.query(
    `update app.client_accounts set last_login_at = now(), updated_at = now() where id = $1`,
    [account.id],
  );
  const session = createClientSessionToken({ id: account.id, email: account.email, fullName: account.full_name });
  return new NextResponse(JSON.stringify({ ok: true, requiresVerification: false, next: destination }), {
    status: 201,
    headers: { "content-type": "application/json", "set-cookie": clientSessionCookie(session) },
  });
}
