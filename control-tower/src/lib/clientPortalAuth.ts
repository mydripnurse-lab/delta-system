import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { cache } from "react";

import { getDbPool } from "@/lib/db";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";

export const CLIENT_SESSION_COOKIE_NAME = "mdn_client_session";
export const CLIENT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type ClientSavedAddress = {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  mapboxFeatureId: string;
  verifiedLabel: string;
  longitude: number;
  latitude: number;
  isDefault: boolean;
};

export type ClientAccount = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  emailVerified: boolean;
  authProvider: string;
  profilePhotoUrl: string;
  profilePhotoUpdatedAt: string;
  dateOfBirth: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  addressVerified: boolean;
  addressVerificationProvider: string;
  addressFeatureId: string;
  addressVerifiedLabel: string;
  addressLongitude: number | null;
  addressLatitude: number | null;
  emergencyContactName: string;
  emergencyContactPhone: string;
  weightPounds: number | null;
  heightInches: number | null;
  genderIdentity: string;
  addresses: ClientSavedAddress[];
  screeningSelections: string[];
  screeningUpdatedAt: string;
  phoneVerified: boolean;
  phoneVerifiedAt: string;
};

export type AccountSecurityPurpose = "phone_verification" | "password_change";

export type ClientProfileCompletion = {
  complete: boolean;
  completed: number;
  total: number;
  percent: number;
  missing: Array<{ key: string; label: string }>;
};

export type ClientBodyWellnessReference = {
  bmi: number;
  kind: "adult" | "age_required" | "growth_chart";
  status: "below" | "within" | "above" | null;
  statusLabel: string;
  lowerPounds: number | null;
  upperPounds: number | null;
  markerPercent: number | null;
};

type ClientSessionPayload = {
  aud: "mdn-client";
  sub: string;
  email: string;
  name?: string;
  iat: number;
  exp: number;
};

let clientSchemaReady: Promise<void> | null = null;

function s(value: unknown) {
  return String(value ?? "").trim();
}

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string) {
  return Buffer.from(input, "base64url").toString("utf8");
}

function clientSessionSecret() {
  const rootSecret = s(
    process.env.CLIENT_AUTH_SESSION_SECRET ||
      process.env.AUTH_SESSION_SECRET ||
      process.env.DEV_AUTH_SESSION_SECRET,
  );
  if (!rootSecret) return "";
  return createHmac("sha256", rootSecret).update("mdn-client-session-v1").digest("base64url");
}

function signature(body: string, secret: string) {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createClientSessionToken(account: Pick<ClientAccount, "id" | "email" | "fullName">) {
  const secret = clientSessionSecret();
  if (!secret) throw new Error("Client session authentication is not configured.");
  const now = Math.floor(Date.now() / 1000);
  const payload: ClientSessionPayload = {
    aud: "mdn-client",
    sub: account.id,
    email: account.email.toLowerCase(),
    name: account.fullName || undefined,
    iat: now,
    exp: now + CLIENT_SESSION_TTL_SECONDS,
  };
  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${signature(body, secret)}`;
}

export function verifyClientSessionToken(tokenRaw: string): ClientSessionPayload | null {
  const token = s(tokenRaw);
  const secret = clientSessionSecret();
  if (!token || !secret) return null;
  const separator = token.lastIndexOf(".");
  if (separator < 1) return null;
  const body = token.slice(0, separator);
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(body, secret));
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body)) as ClientSessionPayload;
    if (payload.aud !== "mdn-client" || !payload.sub || !payload.email) return null;
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function clientSessionCookie(token: string) {
  return [
    `${CLIENT_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    process.env.NODE_ENV === "production" ? "Domain=.mydripnurse.com" : "",
    `Max-Age=${CLIENT_SESSION_TTL_SECONDS}`,
  ].filter(Boolean).join("; ");
}

export function clearClientSessionCookie() {
  return [
    `${CLIENT_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    process.env.NODE_ENV === "production" ? "Domain=.mydripnurse.com" : "",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].filter(Boolean).join("; ");
}

export function clearClientSessionCookies() {
  const sharedDomainCookie = clearClientSessionCookie();
  if (process.env.NODE_ENV !== "production") return [sharedDomainCookie];

  const careHostCookie = [
    `${CLIENT_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Secure",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ].join("; ");

  return [sharedDomainCookie, careHostCookie];
}

export function hashClientAuthToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function newClientAuthToken() {
  return randomBytes(32).toString("base64url");
}

export function newAccountSecurityCode() {
  return String(randomInt(100000, 1000000));
}

export function hashAccountSecurityCode(input: {
  accountId: string;
  purpose: AccountSecurityPurpose;
  code: string;
}) {
  const secret = clientSessionSecret();
  if (!secret) throw new Error("Account security is not configured.");
  return createHmac("sha256", secret)
    .update(`${input.accountId}:${input.purpose}:${input.code}`)
    .digest("hex");
}

export function isTrustedClientRequest(request: Request) {
  if (process.env.NODE_ENV !== "production") return true;
  const hostname = s(request.headers.get("host")).split(":")[0].toLowerCase();
  return hostname === "care.mydripnurse.com" || hostname === "partners.mydripnurse.com";
}

export function safeClientReturnUrl(value: unknown) {
  const raw = s(value);
  if (!raw || raw.length > 2048) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return "";
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.replace(/\/+$/, "");
    if (hostname === "partners.mydripnurse.com" && (pathname === "" || pathname === "/" || /^\/[a-z0-9-]+\/services\/[a-z0-9-]+\/book$/i.test(pathname))) {
      return `https://partners.mydripnurse.com${pathname || "/"}`;
    }
    if (hostname === "care.mydripnurse.com" && /^\/booking\/[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(pathname)) {
      return `https://care.mydripnurse.com${pathname}`;
    }
    const reservedAppHosts = new Set([
      "admin.mydripnurse.com",
      "care.mydripnurse.com",
      "onboarding.mydripnurse.com",
      "partners.mydripnurse.com",
      "policy.mydripnurse.com",
      "search-embedded.telahagocrecer.com",
      "sitemaps.mydripnurse.com",
    ]);
    const marketingHost = hostname === "mydripnurse.com"
      || hostname === "www.mydripnurse.com"
      || (hostname.endsWith(".mydripnurse.com") && !reservedAppHosts.has(hostname));
    if (marketingHost) return parsed.toString();
    return "";
  } catch {
    return "";
  }
}

export function safeClientDestination(nextValue: unknown, returnValue: unknown, fallback = "/") {
  return safeClientReturnUrl(returnValue) || safeClientNext(nextValue, fallback);
}

export function safeClientNext(value: unknown, fallback = "/") {
  const next = s(value);
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  let parsed: URL;
  try {
    parsed = new URL(next, "https://care.mydripnurse.com");
  } catch {
    return fallback;
  }
  const pathname = parsed.pathname.replace(/\/$/, "") || "/";
  const allowed = new Set(["/", "/book", "/services", "/appointments", "/products", "/profile", "/referrals", "/rewards", "/rewards/invitations", "/rewards/visits"]);
  if (!allowed.has(pathname) && !/^\/book\/[a-z0-9-]+$/i.test(pathname)) return fallback;
  const partnerId = s(parsed.searchParams.get("partner"));
  const validPartnerId = partnerId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(partnerId) ? partnerId : "";
  if (pathname === "/book") {
    const service = s(parsed.searchParams.get("service"));
    const params = new URLSearchParams();
    if (/^[a-z0-9-]+$/i.test(service)) params.set("service", service);
    if (validPartnerId) params.set("partner", validPartnerId);
    return params.size ? `${pathname}?${params.toString()}` : pathname;
  }
  if (!pathname.startsWith("/book/")) return pathname;
  return validPartnerId ? `${pathname}?partner=${encodeURIComponent(validPartnerId)}` : pathname;
}

export function getClientProfileCompletion(account: ClientAccount): ClientProfileCompletion {
  const signals = [
    { key: "identity", label: "Confirm your name and verify your mobile number", complete: Boolean(account.fullName && account.phone && account.phoneVerified) },
    { key: "birthDate", label: "Add your date of birth", complete: Boolean(account.dateOfBirth) },
    { key: "wellness", label: "Add your height and weight", complete: Boolean(account.heightInches && account.weightPounds) },
    { key: "gender", label: "Choose your sex / gender preference", complete: Boolean(account.genderIdentity) },
    { key: "address", label: "Verify your preferred service address", complete: account.addressVerified },
  ];
  const completed = signals.filter((signal) => signal.complete).length;
  return {
    complete: completed === signals.length,
    completed,
    total: signals.length,
    percent: Math.round((completed / signals.length) * 100),
    missing: signals.filter((signal) => !signal.complete).map(({ key, label }) => ({ key, label })),
  };
}

export function calculateClientBmi(account: Pick<ClientAccount, "weightPounds" | "heightInches">) {
  const weight = Number(account.weightPounds);
  const height = Number(account.heightInches);
  if (!Number.isFinite(weight) || !Number.isFinite(height) || weight <= 0 || height <= 0) return null;
  return Math.round(((weight * 703) / (height * height)) * 10) / 10;
}

function clientAgeOnDate(dateOfBirth: string, today = new Date()) {
  const match = s(dateOfBirth).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const birthDate = new Date(Date.UTC(year, month - 1, day));
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== month - 1 ||
    birthDate.getUTCDate() !== day ||
    birthDate.getTime() > today.getTime()
  ) return null;

  let age = today.getUTCFullYear() - year;
  const beforeBirthday = today.getUTCMonth() < month - 1 ||
    (today.getUTCMonth() === month - 1 && today.getUTCDate() < day);
  if (beforeBirthday) age -= 1;
  return age;
}

export function calculateClientBodyWellnessReference(
  account: Pick<ClientAccount, "dateOfBirth" | "weightPounds" | "heightInches">,
): ClientBodyWellnessReference | null {
  const bmi = calculateClientBmi(account);
  if (bmi === null) return null;

  const age = clientAgeOnDate(account.dateOfBirth);
  if (age === null) {
    return {
      bmi,
      kind: "age_required",
      status: null,
      statusLabel: "Add your date of birth to use the adult reference",
      lowerPounds: null,
      upperPounds: null,
      markerPercent: null,
    };
  }
  if (age < 20) {
    return {
      bmi,
      kind: "growth_chart",
      status: null,
      statusLabel: "Age-specific reference required",
      lowerPounds: null,
      upperPounds: null,
      markerPercent: null,
    };
  }

  const height = Number(account.heightInches);
  const status = bmi < 18.5 ? "below" : bmi < 25 ? "within" : "above";
  const statusLabel = status === "within"
    ? "Within the general reference range"
    : status === "below"
      ? "Below the general reference range"
      : "Above the general reference range";

  return {
    bmi,
    kind: "adult",
    status,
    statusLabel,
    lowerPounds: Math.ceil((18.5 * height * height) / 703),
    upperPounds: Math.floor((24.9 * height * height) / 703),
    markerPercent: Math.max(2, Math.min(98, ((bmi - 15) / 25) * 100)),
  };
}

export async function ensureClientPortalSchema() {
  if (clientSchemaReady) return clientSchemaReady;
  clientSchemaReady = (async () => {
    await ensureBookingEngineSchema();
    await getDbPool().query(`
      create table if not exists app.client_accounts (
        id uuid primary key default gen_random_uuid(),
        email text not null,
        normalized_email text not null,
        full_name text not null default '',
        phone text not null default '',
        password_hash text,
        auth_provider text not null default 'email',
        google_sub text,
        email_verified_at timestamptz,
        failed_login_attempts integer not null default 0,
        locked_until timestamptz,
        last_login_at timestamptz,
        preferences jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (normalized_email),
        unique (google_sub),
        check (auth_provider in ('email', 'google', 'hybrid'))
      );

      create table if not exists app.client_customer_links (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        booking_customer_id uuid not null references app.booking_customers(id) on delete cascade,
        organization_id uuid not null references app.organizations(id) on delete cascade,
        link_source text not null default 'verified_email',
        created_at timestamptz not null default now(),
        unique (client_account_id, booking_customer_id),
        unique (booking_customer_id),
        check (link_source in ('verified_email', 'google', 'booking_session', 'admin'))
      );

      create index if not exists client_customer_links_account_idx
        on app.client_customer_links (client_account_id, created_at desc);

      create table if not exists app.client_auth_tokens (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        purpose text not null,
        token_hash text not null unique,
        expires_at timestamptz not null,
        consumed_at timestamptz,
        created_at timestamptz not null default now(),
        check (purpose in ('verify_email', 'reset_password'))
      );

      alter table app.client_auth_tokens
        add column if not exists redirect_to text not null default '';

      create index if not exists client_auth_tokens_lookup_idx
        on app.client_auth_tokens (purpose, token_hash, expires_at)
        where consumed_at is null;

      create table if not exists app.account_security_challenges (
        id uuid primary key default gen_random_uuid(),
        account_kind text not null,
        account_id text not null,
        purpose text not null,
        delivery_channel text not null,
        destination text not null,
        code_hash text not null,
        pending_value jsonb not null default '{}'::jsonb,
        expires_at timestamptz not null,
        consumed_at timestamptz,
        attempt_count integer not null default 0,
        last_sent_at timestamptz not null default now(),
        created_at timestamptz not null default now(),
        check (account_kind in ('client', 'partner', 'admin')),
        check (purpose in ('phone_verification', 'password_change')),
        check (delivery_channel in ('sms', 'email'))
      );

      create index if not exists account_security_challenges_lookup_idx
        on app.account_security_challenges (account_kind, account_id, purpose, expires_at desc)
        where consumed_at is null;

      create table if not exists app.client_appointment_invites (
        id uuid primary key default gen_random_uuid(),
        appointment_id uuid not null references app.appointments(id) on delete cascade,
        email text not null,
        normalized_email text not null,
        full_name text not null default '',
        status text not null default 'pending',
        sent_at timestamptz,
        claimed_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (appointment_id, normalized_email),
        check (status in ('pending', 'claimed', 'revoked'))
      );

      alter table app.client_appointment_invites
        add column if not exists phone text not null default '',
        add column if not exists normalized_phone text not null default '',
        add column if not exists contact_key text not null default '',
        add column if not exists delivery_status text not null default 'pending',
        add column if not exists delivery_error text not null default '';

      update app.client_appointment_invites
         set contact_key = case
           when normalized_email <> '' then 'email:' || lower(normalized_email)
           when normalized_phone <> '' then 'phone:' || normalized_phone
           else 'legacy:' || id::text
         end
       where contact_key = '';

      alter table app.client_appointment_invites
        drop constraint if exists client_appointment_invites_appointment_id_normalized_email_key;

      create unique index if not exists client_appointment_invites_appointment_contact_key_uidx
        on app.client_appointment_invites (appointment_id, contact_key);

      alter table app.client_appointment_invites
        drop constraint if exists client_appointment_invites_delivery_status_ck;
      alter table app.client_appointment_invites
        add constraint client_appointment_invites_delivery_status_ck
        check (delivery_status in ('pending', 'processing', 'sent', 'failed'));

      create index if not exists client_appointment_invites_email_idx
        on app.client_appointment_invites (normalized_email, status, created_at desc);

      create table if not exists app.client_appointment_access (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        appointment_id uuid not null references app.appointments(id) on delete cascade,
        access_role text not null default 'additional_patient',
        created_at timestamptz not null default now(),
        unique (client_account_id, appointment_id),
        check (access_role in ('primary_patient', 'additional_patient'))
      );

      create index if not exists client_appointment_access_account_idx
        on app.client_appointment_access (client_account_id, created_at desc);

      create table if not exists app.appointment_reviews (
        id uuid primary key default gen_random_uuid(),
        appointment_id uuid not null unique references app.appointments(id) on delete cascade,
        partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        rating smallint not null check (rating between 1 and 5),
        comment varchar(600) not null default '',
        reviewer_display_name varchar(120) not null default '',
        is_published boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists appointment_reviews_partner_created_idx
        on app.appointment_reviews (partner_profile_id, created_at desc)
        where is_published = true;

      create table if not exists app.client_addresses (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        label text not null default 'Home',
        address_line_1 text not null,
        address_line_2 text not null default '',
        city text not null,
        county text not null,
        state text not null,
        postal_code text not null,
        country_code text not null default 'US',
        mapbox_feature_id text not null,
        verified_label text not null,
        longitude double precision not null,
        latitude double precision not null,
        is_default boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create index if not exists client_addresses_account_idx
        on app.client_addresses (client_account_id, is_default desc, created_at asc);

      create unique index if not exists client_addresses_one_default_idx
        on app.client_addresses (client_account_id) where is_default;

      create table if not exists app.client_referral_invites (
        id uuid primary key default gen_random_uuid(),
        inviter_account_id uuid not null references app.client_accounts(id) on delete cascade,
        first_name text not null,
        last_name text not null,
        phone text not null,
        normalized_phone text not null,
        email text not null default '',
        normalized_email text not null default '',
        public_code text not null unique,
        status text not null default 'invited',
        registered_account_id uuid references app.client_accounts(id) on delete set null,
        sent_at timestamptz,
        registered_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (inviter_account_id, normalized_phone),
        check (status in ('invited', 'registered', 'cancelled'))
      );

      create unique index if not exists client_referral_invites_phone_uq
        on app.client_referral_invites (normalized_phone)
        where status <> 'cancelled';

      create unique index if not exists client_referral_invites_registered_account_uq
        on app.client_referral_invites (registered_account_id)
        where registered_account_id is not null;

      create index if not exists client_referral_invites_inviter_idx
        on app.client_referral_invites (inviter_account_id, created_at desc);

      create table if not exists app.client_referral_rewards (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null unique references app.client_accounts(id) on delete cascade,
        status text not null default 'available',
        goal_count integer not null default 10,
        appointment_id uuid references app.appointments(id) on delete set null,
        earned_at timestamptz not null default now(),
        redeemed_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (goal_count > 0),
        check (status in ('available', 'redeemed', 'cancelled'))
      );

      create table if not exists app.client_visit_rewards (
        id uuid primary key default gen_random_uuid(),
        client_account_id uuid not null references app.client_accounts(id) on delete cascade,
        reward_program text not null default 'wellness',
        milestone_number integer not null,
        goal_count integer not null default 10,
        status text not null default 'available',
        appointment_id uuid references app.appointments(id) on delete set null,
        earned_at timestamptz not null default now(),
        redeemed_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (milestone_number > 0),
        check (goal_count > 0),
        check (status in ('available', 'redeemed', 'cancelled'))
      );

      alter table app.client_visit_rewards
        alter column goal_count set default 10;

      alter table app.client_visit_rewards
        add column if not exists reward_program text not null default 'wellness';

      alter table app.client_visit_rewards
        drop constraint if exists client_visit_rewards_client_account_id_milestone_number_key;

      create unique index if not exists client_visit_rewards_program_milestone_uq
        on app.client_visit_rewards (client_account_id, reward_program, milestone_number);

      drop index if exists app.client_visit_rewards_account_idx;

      create index if not exists client_visit_rewards_program_status_idx
        on app.client_visit_rewards (client_account_id, reward_program, status, earned_at asc);

      create table if not exists app.client_referral_webhook_deliveries (
        id uuid primary key default gen_random_uuid(),
        invite_id uuid references app.client_referral_invites(id) on delete cascade,
        event_type text not null,
        idempotency_key text not null unique,
        status text not null default 'pending',
        response_status integer,
        last_error text,
        payload jsonb not null default '{}'::jsonb,
        delivered_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in ('pending', 'delivered', 'failed', 'not_configured'))
      );
    `);
  })().catch((error) => {
    clientSchemaReady = null;
    throw error;
  });
  return clientSchemaReady;
}

export async function linkVerifiedClientCustomers(accountId: string, source = "verified_email") {
  await ensureClientPortalSchema();
  const pool = getDbPool();
  await pool.query(
    `insert into app.client_customer_links (
       client_account_id, booking_customer_id, organization_id, link_source
     )
     select account.id, customer.id, customer.organization_id, $2
       from app.client_accounts account
       join app.booking_customers customer
         on customer.normalized_email = account.normalized_email
      where account.id = $1
        and account.email_verified_at is not null
        and customer.normalized_email <> ''
     on conflict (booking_customer_id) do nothing`,
    [accountId, source],
  );
  await pool.query(
    `update app.client_accounts account
        set phone = case when account.phone = '' then source.phone else account.phone end,
            preferences = account.preferences || jsonb_strip_nulls(jsonb_build_object(
              'dateOfBirth', case
                when coalesce(account.preferences ->> 'dateOfBirth', '') = ''
                  then nullif(source.date_of_birth, '')
                else account.preferences ->> 'dateOfBirth'
              end,
              'wellness', coalesce(account.preferences -> 'wellness', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
                'weightPounds', case when coalesce(account.preferences #>> '{wellness,weightPounds}', '') = '' then nullif(source.weight, '') else account.preferences #>> '{wellness,weightPounds}' end,
                'heightInches', case when coalesce(account.preferences #>> '{wellness,heightInches}', '') = '' then nullif(source.height, '') else account.preferences #>> '{wellness,heightInches}' end,
                'genderIdentity', case when coalesce(account.preferences #>> '{wellness,genderIdentity}', '') = '' then nullif(source.gender_identity, '') else account.preferences #>> '{wellness,genderIdentity}' end
              ))
            )),
            updated_at = now()
       from (
         select customer.phone,
                coalesce(nullif(customer.metadata ->> 'dateOfBirth', ''), nullif(appointment.metadata -> 'primary_patient' ->> 'dateOfBirth', '')) as date_of_birth,
                coalesce(nullif(customer.metadata ->> 'weight', ''), nullif(appointment.metadata -> 'primary_patient' ->> 'weight', '')) as weight,
                coalesce(nullif(customer.metadata ->> 'height', ''), nullif(appointment.metadata -> 'primary_patient' ->> 'height', '')) as height,
                coalesce(nullif(customer.metadata ->> 'genderIdentity', ''), nullif(appointment.metadata -> 'primary_patient' ->> 'genderIdentity', '')) as gender_identity
           from app.client_customer_links link
           join app.booking_customers customer on customer.id = link.booking_customer_id
           left join lateral (
             select item.metadata
               from app.appointments item
              where item.customer_id = customer.id
              order by item.created_at desc
              limit 1
           ) appointment on true
          where link.client_account_id = $1
          order by customer.updated_at desc
          limit 1
       ) source
      where account.id = $1
        and (
          (account.phone = '' and source.phone <> '') or
          (coalesce(account.preferences ->> 'dateOfBirth', '') = '' and coalesce(source.date_of_birth, '') <> '') or
          (coalesce(account.preferences #>> '{wellness,weightPounds}', '') = '' and coalesce(source.weight, '') <> '') or
          (coalesce(account.preferences #>> '{wellness,heightInches}', '') = '' and coalesce(source.height, '') <> '') or
          (coalesce(account.preferences #>> '{wellness,genderIdentity}', '') = '' and coalesce(source.gender_identity, '') <> '')
        )`,
    [accountId],
  );
  await pool.query(
    `insert into app.client_appointment_access (
       client_account_id, appointment_id, access_role
     )
     select account.id, invite.appointment_id, 'additional_patient'
       from app.client_accounts account
       join app.client_appointment_invites invite
         on invite.normalized_email = account.normalized_email
        and invite.status in ('pending', 'claimed')
      where account.id = $1
        and account.email_verified_at is not null
     on conflict (client_account_id, appointment_id) do nothing`,
    [accountId],
  );
  await pool.query(
    `update app.client_appointment_invites invite
        set status = 'claimed', claimed_at = coalesce(claimed_at, now()), updated_at = now()
       from app.client_accounts account
      where account.id = $1
        and account.email_verified_at is not null
        and invite.normalized_email = account.normalized_email
        and invite.status = 'pending'`,
    [accountId],
  );
}

export async function getClientAccount(accountId: string): Promise<ClientAccount | null> {
  await ensureClientPortalSchema();
  const pool = getDbPool();
  const result = await pool.query<{
    id: string;
    email: string;
    full_name: string;
    phone: string;
    email_verified_at: string | null;
    auth_provider: string;
    profile_photo_url: string;
    profile_photo_updated_at: string;
    date_of_birth: string;
    address_line_1: string;
    address_line_2: string;
    city: string;
    county: string;
    state: string;
    postal_code: string;
    country_code: string;
    address_verified: boolean;
    address_verification_provider: string;
    address_feature_id: string;
    address_verified_label: string;
    address_longitude: number | null;
    address_latitude: number | null;
    emergency_contact_name: string;
    emergency_contact_phone: string;
    weight_pounds: number | null;
    height_inches: number | null;
    gender_identity: string;
    screening_selections: unknown;
    screening_updated_at: string;
    phone_verified_at: string;
  }>(
    `select id, email, full_name, phone, email_verified_at, auth_provider,
            coalesce(preferences #>> '{identity,profilePhotoUrl}', '') as profile_photo_url,
            coalesce(preferences #>> '{identity,profilePhotoUpdatedAt}', '') as profile_photo_updated_at,
            coalesce(preferences ->> 'dateOfBirth', '') as date_of_birth,
            coalesce(preferences #>> '{address,addressLine1}', '') as address_line_1,
            coalesce(preferences #>> '{address,addressLine2}', '') as address_line_2,
            coalesce(preferences #>> '{address,city}', '') as city,
            coalesce(preferences #>> '{address,county}', '') as county,
            coalesce(preferences #>> '{address,state}', '') as state,
            coalesce(preferences #>> '{address,postalCode}', '') as postal_code,
            coalesce(preferences #>> '{address,countryCode}', 'US') as country_code,
            coalesce((preferences #>> '{address,verified}')::boolean, false) as address_verified,
            coalesce(preferences #>> '{address,verificationProvider}', '') as address_verification_provider,
            coalesce(preferences #>> '{address,mapboxFeatureId}', '') as address_feature_id,
            coalesce(preferences #>> '{address,verifiedLabel}', '') as address_verified_label,
            case when preferences #>> '{address,longitude}' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (preferences #>> '{address,longitude}')::double precision else null end as address_longitude,
            case when preferences #>> '{address,latitude}' ~ '^-?[0-9]+(\.[0-9]+)?$'
              then (preferences #>> '{address,latitude}')::double precision else null end as address_latitude,
            coalesce(preferences #>> '{emergencyContact,name}', '') as emergency_contact_name,
            coalesce(preferences #>> '{emergencyContact,phone}', '') as emergency_contact_phone,
            case when preferences #>> '{wellness,weightPounds}' ~ '^[0-9]+(\.[0-9]+)?$'
              then (preferences #>> '{wellness,weightPounds}')::double precision else null end as weight_pounds,
            case when preferences #>> '{wellness,heightInches}' ~ '^[0-9]+(\.[0-9]+)?$'
              then (preferences #>> '{wellness,heightInches}')::double precision else null end as height_inches,
            coalesce(preferences #>> '{wellness,genderIdentity}', '') as gender_identity,
            coalesce(preferences #> '{medicalScreening,selections}', '[]'::jsonb) as screening_selections,
            coalesce(preferences #>> '{medicalScreening,updatedAt}', '') as screening_updated_at,
            case
              when coalesce(preferences #>> '{phoneVerification,phone}', '') = phone
                then coalesce(preferences #>> '{phoneVerification,verifiedAt}', '')
              else ''
            end as phone_verified_at
       from app.client_accounts where id = $1 limit 1`,
    [accountId],
  );
  const row = result.rows[0];
  if (!row) return null;
  if (row.address_verified && row.address_feature_id && row.address_longitude !== null && row.address_latitude !== null) {
    await pool.query(
      `insert into app.client_addresses (
         client_account_id, label, address_line_1, address_line_2, city, county, state,
         postal_code, country_code, mapbox_feature_id, verified_label, longitude, latitude, is_default
       )
       select $1, 'Home', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true
       where not exists (select 1 from app.client_addresses where client_account_id = $1)`,
      [accountId, row.address_line_1, row.address_line_2, row.city, row.county, row.state, row.postal_code, row.country_code, row.address_feature_id, row.address_verified_label, row.address_longitude, row.address_latitude],
    );
  }
  const savedAddresses = await pool.query<{
    id: string; label: string; address_line_1: string; address_line_2: string; city: string; county: string;
    state: string; postal_code: string; country_code: string; mapbox_feature_id: string; verified_label: string;
    longitude: number; latitude: number; is_default: boolean;
  }>(
    `select id, label, address_line_1, address_line_2, city, county, state, postal_code, country_code,
            mapbox_feature_id, verified_label, longitude, latitude, is_default
       from app.client_addresses
      where client_account_id = $1
      order by is_default desc, created_at asc`,
    [accountId],
  );
  const screeningSelections = Array.isArray(row.screening_selections)
    ? row.screening_selections.map((value) => s(value)).filter(Boolean)
    : [];
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    phone: row.phone,
    emailVerified: Boolean(row.email_verified_at),
    authProvider: row.auth_provider,
    profilePhotoUrl: row.profile_photo_url,
    profilePhotoUpdatedAt: row.profile_photo_updated_at,
    dateOfBirth: row.date_of_birth,
    addressLine1: row.address_line_1,
    addressLine2: row.address_line_2,
    city: row.city,
    county: row.county,
    state: row.state,
    postalCode: row.postal_code,
    countryCode: row.country_code || "US",
    addressVerified: row.address_verified,
    addressVerificationProvider: row.address_verification_provider,
    addressFeatureId: row.address_feature_id,
    addressVerifiedLabel: row.address_verified_label,
    addressLongitude: row.address_longitude,
    addressLatitude: row.address_latitude,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    weightPounds: row.weight_pounds,
    heightInches: row.height_inches,
    genderIdentity: row.gender_identity,
    addresses: savedAddresses.rows.map((item) => ({
      id: item.id,
      label: item.label,
      addressLine1: item.address_line_1,
      addressLine2: item.address_line_2,
      city: item.city,
      county: item.county,
      state: item.state,
      postalCode: item.postal_code,
      countryCode: item.country_code,
      mapboxFeatureId: item.mapbox_feature_id,
      verifiedLabel: item.verified_label,
      longitude: item.longitude,
      latitude: item.latitude,
      isDefault: item.is_default,
    })),
    screeningSelections,
    screeningUpdatedAt: row.screening_updated_at,
    phoneVerified: Boolean(row.phone_verified_at),
    phoneVerifiedAt: row.phone_verified_at,
  };
}

export const getAuthenticatedClient = cache(async (): Promise<ClientAccount | null> => {
  const cookieStore = await cookies();
  const session = verifyClientSessionToken(cookieStore.get(CLIENT_SESSION_COOKIE_NAME)?.value || "");
  if (!session) return null;
  const account = await getClientAccount(session.sub);
  if (account?.emailVerified) await linkVerifiedClientCustomers(account.id, account.authProvider === "google" ? "google" : "verified_email");
  return account;
});

export async function getAuthenticatedClientFromRequest(request: Request): Promise<ClientAccount | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const token = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CLIENT_SESSION_COOKIE_NAME}=`))
    ?.slice(CLIENT_SESSION_COOKIE_NAME.length + 1) || "";
  const session = verifyClientSessionToken(decodeURIComponent(token));
  if (!session) return null;
  const account = await getClientAccount(session.sub);
  return account?.emailVerified ? account : null;
}
