import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import { getDbPool } from "@/lib/db";
import { readPartnerOnboardingToken } from "@/lib/partnerOnboarding";
import { ensureStaffSchema } from "@/lib/publicStaffProvisioning";
import { verifyPassword } from "@/lib/password";

export const PARTNER_PORTAL_COOKIE = "mdn_partner_session";

type PortalSessionRow = {
  session_id: string;
  profile_id: string;
  application_id: string;
  organization_id: string;
  ghl_user_id: string;
  email: string;
  slug: string;
  display_name: string;
  expires_at: string;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

async function ensurePortalSessionSchema() {
  await ensureStaffSchema();
  await getDbPool().query(`
    create table if not exists app.partner_portal_sessions (
      id uuid primary key default gen_random_uuid(),
      profile_id uuid not null references app.partner_profiles(id) on delete cascade,
      token_hash text not null unique,
      expires_at timestamptz not null,
      revoked_at timestamptz,
      last_seen_at timestamptz,
      created_at timestamptz not null default now()
    );
    create index if not exists partner_portal_sessions_profile_idx
      on app.partner_portal_sessions (profile_id, expires_at desc)
      where revoked_at is null;
  `);
}

export async function createPartnerPortalSession(onboardingToken: string) {
  const onboarding = await readPartnerOnboardingToken(onboardingToken);
  if (!onboarding) return null;
  await ensurePortalSessionSchema();
  const profile = await getDbPool().query<{
    id: string;
    application_id: string;
    organization_id: string;
    ghl_user_id: string;
    email: string;
    slug: string;
    display_name: string;
  }>(
    `select id, application_id, organization_id, ghl_user_id, email, slug, display_name
       from app.partner_profiles
      where application_id = $1 and ghl_user_id = $2
      limit 1`,
    [onboarding.applicationId, onboarding.ghlUserId],
  );
  if (!profile.rows[0]) return null;

  return issuePartnerPortalSession(profile.rows[0]);
}

async function issuePartnerPortalSession(profile: {
  id: string;
  application_id: string;
  organization_id: string;
  ghl_user_id: string;
  email: string;
  slug: string;
  display_name: string;
}) {
  const rawToken = randomBytes(32).toString("base64url");
  await getDbPool().query(
    `insert into app.partner_portal_sessions (profile_id, token_hash, expires_at)
     values ($1, $2, now() + interval '90 days')`,
    [profile.id, tokenHash(rawToken)],
  );
  return { token: rawToken, profile };
}

export async function createPartnerPortalPasswordSession(emailRaw: string, passwordRaw: string) {
  await ensurePortalSessionSchema();
  const email = emailRaw.trim().toLowerCase();
  const password = passwordRaw.trim();
  if (!email || !password) return null;
  const result = await getDbPool().query<{
    id: string;
    application_id: string;
    organization_id: string;
    ghl_user_id: string;
    email: string;
    slug: string;
    display_name: string;
    portal_password_hash: string | null;
  }>(
    `select id, application_id, organization_id, ghl_user_id, email, slug,
            display_name, portal_password_hash
       from app.partner_profiles
      where lower(email) = lower($1)
        and website_status in ('ready', 'published', 'hidden')
      order by updated_at desc
      limit 1`,
    [email],
  );
  const profile = result.rows[0];
  if (!profile?.portal_password_hash) return null;
  if (!(await verifyPassword(password, profile.portal_password_hash))) return null;
  return issuePartnerPortalSession(profile);
}

export async function readPartnerPortalSession(rawToken: string) {
  const token = rawToken.trim();
  if (token.length < 32) return null;
  await ensurePortalSessionSchema();
  const result = await getDbPool().query<PortalSessionRow>(
    `update app.partner_portal_sessions s
        set last_seen_at = now(),
            expires_at = greatest(s.expires_at, now() + interval '30 days')
       from app.partner_profiles p
      where s.token_hash = $1
        and s.profile_id = p.id
        and s.revoked_at is null
        and s.expires_at > now()
      returning s.id as session_id, p.id as profile_id, p.application_id,
                p.organization_id, p.ghl_user_id, p.email, p.slug,
                p.display_name, s.expires_at::text`,
    [tokenHash(token)],
  );
  return result.rows[0] || null;
}

export async function getPartnerPortalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(PARTNER_PORTAL_COOKIE)?.value || "";
  return readPartnerPortalSession(token);
}

export async function revokePartnerPortalSession(rawToken: string) {
  if (!rawToken) return;
  await ensurePortalSessionSchema();
  await getDbPool().query(
    `update app.partner_portal_sessions set revoked_at = now() where token_hash = $1`,
    [tokenHash(rawToken)],
  );
}

export function partnerPortalCookieOptions() {
  const production = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: production,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
    ...(production ? { domain: ".mydripnurse.com" } : {}),
  };
}
