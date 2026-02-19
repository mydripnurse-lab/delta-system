import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "ct_session";
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  sub: string;
  email: string;
  name?: string;
  iat: number;
  exp: number;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest("base64url");
}

export function getSessionSecret() {
  return s(process.env.AUTH_SESSION_SECRET || process.env.DEV_AUTH_SESSION_SECRET);
}

export function createSessionToken(input: {
  userId: string;
  email: string;
  name?: string;
  ttlSeconds?: number;
  secret: string;
}) {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    sub: s(input.userId),
    email: s(input.email).toLowerCase(),
    name: s(input.name) || undefined,
    iat: now,
    exp: now + Math.max(60, Number(input.ttlSeconds || DEFAULT_SESSION_TTL_SECONDS)),
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(body, input.secret);
  return `${body}.${signature}`;
}

export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const raw = s(token);
  if (!raw) return null;
  const idx = raw.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  if (!body || !sig) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64UrlDecode(body)) as SessionPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (!payload?.sub || !payload?.email || !payload?.iat || !payload?.exp) return null;
  if (payload.exp <= now) return null;
  return payload;
}

export function readCookieFromHeader(cookieHeader: string | null, cookieName: string): string {
  const raw = s(cookieHeader);
  if (!raw) return "";
  const parts = raw.split(";").map((x) => x.trim());
  for (const part of parts) {
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    if (key !== cookieName) continue;
    return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return "";
}

export function buildSessionCookie(input: { token: string; maxAgeSeconds?: number }) {
  const secure = process.env.NODE_ENV === "production";
  const maxAgeSeconds = Math.max(60, Number(input.maxAgeSeconds || DEFAULT_SESSION_TTL_SECONDS));
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearSessionCookie() {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
