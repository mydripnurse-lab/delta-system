import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

import {
  CLIENT_SESSION_COOKIE_NAME,
  CLIENT_SESSION_TTL_SECONDS,
  createClientSessionToken,
  ensureClientPortalSchema,
  isTrustedClientRequest,
  linkVerifiedClientCustomers,
  safeClientNext,
  safeClientReturnUrl,
} from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { claimClientReferralRegistration, safeClientReferralCode } from "@/lib/clientReferrals";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

function safeGoogleProfilePhoto(value: unknown) {
  try {
    const url = new URL(s(value));
    return url.protocol === "https:" && url.hostname === "lh3.googleusercontent.com" ? url.toString() : "";
  } catch {
    return "";
  }
}

function loginError(request: Request, code: string) {
  const url = new URL("/login", request.url);
  url.searchParams.set("error", code);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const clientId = s(process.env.CLIENT_GOOGLE_CLIENT_ID);
  const clientSecret = s(process.env.CLIENT_GOOGLE_CLIENT_SECRET);
  const state = s(request.nextUrl.searchParams.get("state"));
  const expectedState = s(request.cookies.get("mdn_client_oauth_state")?.value);
  const code = s(request.nextUrl.searchParams.get("code"));
  if (!clientId || !clientSecret || !state || state !== expectedState || !code) return loginError(request, "google_failed");
  try {
    const redirectUri = "https://care.mydripnurse.com/api/client-auth/google/callback";
    const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
    const { tokens } = await oauth.getToken(code);
    if (!tokens.id_token) return loginError(request, "google_failed");
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    const googleSub = s(payload?.sub);
    const email = s(payload?.email).toLowerCase();
    const fullName = s(payload?.name) || [s(payload?.given_name), s(payload?.family_name)].filter(Boolean).join(" ");
    const profilePhotoUrl = safeGoogleProfilePhoto(payload?.picture);
    if (!googleSub || !email || payload?.email_verified !== true) return loginError(request, "google_unverified");

    await ensureClientPortalSchema();
    const existingAccount = await getDbPool().query<{ id: string }>(
      `select id
         from app.client_accounts
        where normalized_email = $1 or google_sub = $2
        limit 1`,
      [email, googleSub],
    );
    const isNewCareAccount = !existingAccount.rows[0];
    const result = await getDbPool().query<{
      id: string;
      email: string;
      full_name: string;
    }>(
      `insert into app.client_accounts (
         email, normalized_email, full_name, auth_provider, google_sub, email_verified_at, preferences, last_login_at
       ) values ($1, $4, $2, 'google', $3, now(), $5::jsonb, now())
       on conflict (normalized_email) do update set
         full_name = case when app.client_accounts.full_name = '' then excluded.full_name else app.client_accounts.full_name end,
         google_sub = coalesce(app.client_accounts.google_sub, excluded.google_sub),
         auth_provider = case when app.client_accounts.password_hash is null then 'google' else 'hybrid' end,
         email_verified_at = coalesce(app.client_accounts.email_verified_at, now()),
         failed_login_attempts = 0,
         locked_until = null,
         last_login_at = now(),
         preferences = app.client_accounts.preferences || jsonb_build_object(
           'identity', coalesce(app.client_accounts.preferences -> 'identity', '{}'::jsonb)
             || coalesce(excluded.preferences -> 'identity', '{}'::jsonb)
         ),
         updated_at = now()
       returning id, email, full_name`,
      [
        email,
        fullName,
        googleSub,
        email.toLowerCase(),
        JSON.stringify({
          identity: {
            ...(profilePhotoUrl ? { profilePhotoUrl } : {}),
            profilePhotoProvider: "google",
            profilePhotoUpdatedAt: new Date().toISOString(),
          },
        }),
      ],
    );
    const account = result.rows[0];
    if (!account) return loginError(request, "google_failed");
    await linkVerifiedClientCustomers(account.id, "google");
    const referralCode = safeClientReferralCode(request.cookies.get("mdn_client_oauth_referral")?.value);
    if (referralCode && isNewCareAccount) await claimClientReferralRegistration(account.id, referralCode);
    const session = createClientSessionToken({ id: account.id, email: account.email, fullName: account.full_name });
    const next = safeClientNext(request.cookies.get("mdn_client_oauth_next")?.value);
    const returnTo = safeClientReturnUrl(request.cookies.get("mdn_client_oauth_return")?.value);
    const response = NextResponse.redirect(returnTo || new URL(next, request.url));
    response.cookies.delete("mdn_client_oauth_state");
    response.cookies.delete("mdn_client_oauth_next");
    response.cookies.delete("mdn_client_oauth_return");
    response.cookies.delete("mdn_client_oauth_referral");
    response.cookies.set(CLIENT_SESSION_COOKIE_NAME, session, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      domain: process.env.NODE_ENV === "production" ? ".mydripnurse.com" : undefined,
      path: "/",
      maxAge: CLIENT_SESSION_TTL_SECONDS,
    });
    console.info(JSON.stringify({
      level: "info",
      message: "Client Google sign-in completed",
      route: "/api/client-auth/google/callback",
      accountId: account.id,
    }));
    return response;
  } catch (error) {
    console.error("[client-auth] google-callback-failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return loginError(request, "google_failed");
  }
}
