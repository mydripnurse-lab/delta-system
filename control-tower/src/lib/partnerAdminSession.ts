import {
  DEFAULT_SESSION_TTL_SECONDS,
  getSessionSecret,
} from "@/lib/session";

export const PARTNER_ADMIN_SESSION_COOKIE_NAME = "mdn_partner_admin_session";
export { DEFAULT_SESSION_TTL_SECONDS as PARTNER_ADMIN_SESSION_TTL_SECONDS };

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function getPartnerAdminSessionSecret() {
  return text(process.env.PARTNER_ADMIN_SESSION_SECRET) || getSessionSecret();
}

export function buildPartnerAdminSessionCookie(input: {
  token: string;
  maxAgeSeconds?: number;
}) {
  const secure = process.env.NODE_ENV === "production";
  const maxAgeSeconds = Math.max(
    60,
    Number(input.maxAgeSeconds || DEFAULT_SESSION_TTL_SECONDS),
  );
  return [
    `${PARTNER_ADMIN_SESSION_COOKIE_NAME}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearPartnerAdminSessionCookie() {
  const secure = process.env.NODE_ENV === "production";
  return [
    `${PARTNER_ADMIN_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
    "Max-Age=0",
  ]
    .filter(Boolean)
    .join("; ");
}
