import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";
import { google } from "googleapis";

import { isTrustedClientRequest, safeClientNext, safeClientReturnUrl } from "@/lib/clientPortalAuth";
import { safeClientReferralCode } from "@/lib/clientReferrals";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

export async function GET(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const clientId = s(process.env.CLIENT_GOOGLE_CLIENT_ID);
  const clientSecret = s(process.env.CLIENT_GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    const unavailable = new URL("/login", request.url);
    unavailable.searchParams.set("error", "google_unavailable");
    return NextResponse.redirect(unavailable);
  }
  const requestUrl = new URL(request.url);
  const next = safeClientNext(requestUrl.searchParams.get("next"));
  const returnTo = safeClientReturnUrl(requestUrl.searchParams.get("returnTo"));
  const referralCode = safeClientReferralCode(requestUrl.searchParams.get("referral"));
  const state = randomBytes(24).toString("base64url");
  const redirectUri = "https://care.mydripnurse.com/api/client-auth/google/callback";
  const oauth = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authorizationUrl = oauth.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
  });
  const response = NextResponse.redirect(authorizationUrl);
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("mdn_client_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set("mdn_client_oauth_next", next, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set("mdn_client_oauth_return", returnTo, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });
  response.cookies.set("mdn_client_oauth_referral", referralCode, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
