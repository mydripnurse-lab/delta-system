import { createHash } from "node:crypto";
import { getDbPool } from "@/lib/db";
import {
  getAgencyAccessTokenOrThrow,
  getEffectiveCompanyIdOrThrow,
} from "@/lib/ghlHttp";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { issuePartnerOnboardingLink, readLatestPartnerOnboardingForApplication } from "@/lib/partnerOnboarding";
import { notifyPartnerSitePublished } from "@/lib/partnerSeoNotifications";
import { hashPassword } from "@/lib/password";
import { ghlRoutingFieldsForEvent, ghlRoutingFieldsForPayload } from "@/lib/ghlRoutingEnvelope";
import { listTenantStateFiles } from "@/lib/tenantStateCatalogDb";

const API_BASE = "https://services.leadconnectorhq.com";
const USER_VERSION = "2023-02-21";
const CALENDAR_VERSION = "v3";

const DEFAULT_MDN_CALENDAR_NAMES = [
  "NAD+ Mobile IV Therapy",
  "NAD+ Boost Mobile IV Therapy",
  "Hydration Mobile IV Therapy",
  "Immunity Defense / Cold & Flu Mobile IV Therapy",
  "Brain Storm Mobile IV Therapy",
  "Myers' Cocktail Mobile IV Therapy",
  "The Glow / Beauty IV Drip Mobile IV Therapy",
  "Alleviate Mobile IV Therapy",
  "Hangover / Jet Lag Mobile IV Therapy",
  "Immunity Defense / Cold & Flu + Glutathione Push Mobile IV Therapy",
  "Myers' Cocktail Mobile IV Therapy + Glutathione Push",
  "Brevard Mobile IV Therapy",
  "Get Lean / Weight Loss Mobile IV Therapy",
  "Recovery & Performance Mobile IV Therapy",
];

let staffSchemaReady: Promise<void> | null = null;

function s(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: unknown) {
  return s(value).toLowerCase();
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function headerIndex(headers: string[], names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  return headers.findIndex((header) => wanted.has(s(header).toLowerCase()));
}

function countyKey(tenantId: string, locationId: string) {
  return createHash("sha256").update(`${tenantId}:${locationId}`).digest("hex").slice(0, 32);
}

export type StaffFormConfig = {
  tenantId: string;
  formKey: string;
  accountReadyWebhookUrl: string;
  applicantReceivedWebhookUrl: string;
  adminNotificationWebhookUrl: string;
  adminBaseUrl: string;
  calendarMode: "all_compatible" | "specific" | "specific_names";
  calendarIds: string[];
  calendarNames: string[];
};

export type EligibleCounty = {
  key: string;
  state: string;
  county: string;
  locationId: string;
  operational: boolean;
};

export type StaffApplicationInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  publicTitle: string;
  professionalCredentials: string;
  biography: string;
  profilePhotoUrl: string;
  profilePhotoFileId: string;
  profilePhotoLocationId: string;
  profileConsentAt: string;
  password: string;
  countyKeys: string[];
  primaryLocationId: string;
  submissionKey?: string;
  referralCode?: string;
};

export async function ensureStaffSchema() {
  if (staffSchemaReady) return staffSchemaReady;
  staffSchemaReady = (async () => {
    const pool = getDbPool();
    await pool.query(`
      create table if not exists app.staff_form_configs (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        form_key text not null unique,
        enabled boolean not null default true,
        webhook_url text,
        calendar_mode text not null default 'all_compatible',
        calendar_ids text[] not null default array[]::text[],
        calendar_names text[] not null default array[]::text[],
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id)
      );
      alter table app.staff_form_configs
        add column if not exists calendar_names text[] not null default array[]::text[];
      alter table app.staff_form_configs
        add column if not exists applicant_received_webhook_url text,
        add column if not exists admin_notification_webhook_url text,
        add column if not exists partner_notification_webhook_url text,
        add column if not exists lead_capture_webhook_url text,
        add column if not exists appointment_created_webhook_url text,
        add column if not exists new_booking_webhook_url text,
        add column if not exists partner_confirmation_required_webhook_url text,
        add column if not exists partner_rescheduled_webhook_url text,
        add column if not exists appointment_accepted_webhook_url text,
        add column if not exists appointment_declined_webhook_url text,
        add column if not exists appointment_reassigned_webhook_url text,
        add column if not exists appointment_completed_webhook_url text,
        add column if not exists appointment_refunded_webhook_url text,
        add column if not exists client_referral_webhook_url text,
        add column if not exists client_referral_registered_webhook_url text,
        add column if not exists client_referral_reward_earned_webhook_url text,
        add column if not exists account_security_webhook_url text,
        add column if not exists admin_base_url text not null default 'https://admin.mydripnurse.com',
        add column if not exists affiliate_commission_rate numeric(5,2) not null default 3.00;
      alter table app.staff_form_configs
        drop constraint if exists staff_form_configs_calendar_mode_ck;
      alter table app.staff_form_configs
        add constraint staff_form_configs_calendar_mode_ck
        check (calendar_mode in ('all_compatible', 'specific', 'specific_names'));
      create table if not exists app.staff_applications (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        email text not null,
        status text not null default 'processing',
        request_payload jsonb not null default '{}'::jsonb,
        result jsonb not null default '{}'::jsonb,
        last_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      create index if not exists staff_applications_org_created_idx
        on app.staff_applications (organization_id, created_at desc);
      alter table app.staff_applications
        add column if not exists first_name text,
        add column if not exists last_name text,
        add column if not exists phone text,
        add column if not exists company text,
        add column if not exists public_title text,
        add column if not exists professional_credentials text,
        add column if not exists biography text,
        add column if not exists profile_photo_url text,
        add column if not exists profile_photo_data text,
        add column if not exists profile_photo_content_type text,
        add column if not exists profile_photo_file_id text,
        add column if not exists profile_photo_location_id text,
        add column if not exists profile_consent_at timestamptz,
        add column if not exists admin_notes text,
        add column if not exists submitted_at timestamptz,
        add column if not exists reviewed_at timestamptz,
        add column if not exists reviewed_by uuid references app.users(id) on delete set null,
        add column if not exists provisioned_at timestamptz,
        add column if not exists deactivated_at timestamptz,
        add column if not exists deactivated_by uuid references app.users(id) on delete set null,
        add column if not exists submission_key text,
        add column if not exists ghl_user_id text,
        add column if not exists ghl_company_id text,
        add column if not exists ghl_location_ids text[] not null default array[]::text[],
        add column if not exists ghl_integration_key text not null default 'owner',
        add column if not exists ghl_identity_synced_at timestamptz,
        add column if not exists primary_location_id text;
      create unique index if not exists staff_applications_org_submission_key_uq
        on app.staff_applications (organization_id, submission_key)
        where submission_key is not null;
      update app.staff_applications
         set submitted_at = coalesce(submitted_at, created_at),
             first_name = coalesce(first_name, request_payload->>'firstName'),
             last_name = coalesce(last_name, request_payload->>'lastName'),
             phone = coalesce(phone, request_payload->>'phone'),
             company = coalesce(company, request_payload->>'company'),
             public_title = coalesce(public_title, request_payload->>'publicTitle'),
             professional_credentials = coalesce(professional_credentials, request_payload->>'professionalCredentials'),
             biography = coalesce(biography, request_payload->>'biography'),
             profile_photo_url = coalesce(profile_photo_url, request_payload->>'profilePhotoUrl'),
             profile_photo_file_id = coalesce(profile_photo_file_id, request_payload->>'profilePhotoFileId'),
             profile_photo_location_id = coalesce(profile_photo_location_id, request_payload->>'profilePhotoLocationId'),
             profile_consent_at = coalesce(
               profile_consent_at,
               nullif(request_payload->>'profileConsentAt', '')::timestamptz
             );
      alter table app.staff_applications
        drop constraint if exists staff_applications_status_ck;
      alter table app.staff_applications
        alter column status set default 'submitted';
      alter table app.staff_applications
        add constraint staff_applications_status_ck check (status in (
          'submitted', 'under_review', 'stripe_pending', 'staff_ready',
          'staff_processing', 'staff_created', 'calendar_deposit_pending', 'ready_to_complete',
          'website_review_pending',
          'processing', 'completed', 'completed_with_warnings', 'rejected', 'failed', 'deactivated'
        ));
      create table if not exists app.staff_application_location_steps (
        id uuid primary key default gen_random_uuid(),
        application_id uuid not null references app.staff_applications(id) on delete cascade,
        location_id text not null,
        state text not null,
        county text not null,
        stripe_status text not null default 'pending',
        staff_status text not null default 'pending',
        calendars_status text not null default 'pending',
        deposit_status text not null default 'pending',
        stripe_completed_at timestamptz,
        stripe_completed_by uuid references app.users(id) on delete set null,
        deposit_completed_at timestamptz,
        deposit_completed_by uuid references app.users(id) on delete set null,
        deposit_config jsonb not null default '{}'::jsonb,
        last_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (application_id, location_id),
        check (stripe_status in ('pending', 'complete', 'not_required')),
        check (staff_status in ('pending', 'processing', 'complete', 'failed')),
        check (calendars_status in ('pending', 'processing', 'complete', 'failed')),
        check (deposit_status in ('pending', 'processing', 'complete', 'not_required', 'failed'))
      );
      create index if not exists staff_application_location_steps_application_idx
        on app.staff_application_location_steps (application_id, created_at);
      create table if not exists app.partner_profiles (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        application_id uuid not null unique references app.staff_applications(id) on delete cascade,
        ghl_user_id text not null,
        email text not null,
        slug text not null,
        display_name text not null,
        business_name text,
        public_title text,
        professional_credentials text,
        biography text,
        profile_photo_url text,
        profile_photo_data text,
        profile_photo_content_type text,
        profile_photo_file_id text,
        profile_photo_location_id text,
        primary_location_id text,
        service_areas jsonb not null default '[]'::jsonb,
        website_status text not null default 'draft',
        directory_status text not null default 'hidden',
        ghl_photo_sync_status text not null default 'pending',
        ghl_photo_synced_at timestamptz,
        ghl_photo_sync_error text,
        profile_consent_at timestamptz,
        published_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id, slug),
        check (website_status in ('draft', 'ready', 'published', 'hidden')),
        check (directory_status in ('published', 'hidden')),
        check (ghl_photo_sync_status in ('pending', 'syncing', 'synced', 'failed'))
      );
      create index if not exists partner_profiles_organization_status_idx
        on app.partner_profiles (organization_id, website_status, updated_at desc);
      create index if not exists partner_profiles_ghl_user_idx
        on app.partner_profiles (ghl_user_id);
      create table if not exists app.partner_personal_calendars (
        id uuid primary key default gen_random_uuid(),
        application_id uuid not null references app.staff_applications(id) on delete cascade,
        location_id text not null,
        normalized_name text not null,
        source_calendar_id text not null,
        calendar_id text not null,
        group_id text not null,
        calendar_slug text not null,
        status text not null default 'active',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (application_id, normalized_name),
        unique (location_id, calendar_id),
        check (status in ('active', 'inactive', 'failed'))
      );
      alter table app.partner_profiles
        add column if not exists group_calendar_id text,
        add column if not exists group_calendar_slug text,
        add column if not exists group_calendar_url text,
        add column if not exists services jsonb not null default '[]'::jsonb,
        add column if not exists directory_status text,
        add column if not exists profile_photo_data text,
        add column if not exists profile_photo_content_type text,
        add column if not exists affiliate_code text,
        add column if not exists affiliate_commission_rate numeric(5,2),
        add column if not exists portal_password_hash text,
        add column if not exists portal_tour_completed_at timestamptz,
        add column if not exists portal_tour_required boolean not null default false;
      update app.partner_profiles set affiliate_code = slug where affiliate_code is null;
      update app.partner_profiles
         set directory_status = case when website_status = 'published' then 'published' else 'hidden' end
       where directory_status is null;
      alter table app.partner_profiles alter column directory_status set default 'hidden';
      alter table app.partner_profiles alter column directory_status set not null;
      create unique index if not exists partner_profiles_affiliate_code_uq
        on app.partner_profiles (organization_id, affiliate_code)
        where affiliate_code is not null;
      alter table app.staff_applications
        add column if not exists referral_code text,
        add column if not exists referred_by_profile_id uuid references app.partner_profiles(id) on delete set null;
      create table if not exists app.partner_affiliate_ledger (
        id uuid primary key default gen_random_uuid(),
        referrer_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        referred_application_id uuid not null references app.staff_applications(id) on delete cascade,
        event_type text not null default 'application',
        amount numeric(12,2),
        currency text not null default 'USD',
        status text not null default 'pending_review',
        approved_at timestamptz,
        paid_at timestamptz,
        payout_reference text,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (referrer_profile_id, referred_application_id, event_type),
        check (status in ('pending_review', 'approved', 'payable', 'paid', 'void'))
      );
      create index if not exists partner_affiliate_ledger_profile_idx
        on app.partner_affiliate_ledger (referrer_profile_id, status, created_at desc);
      create table if not exists app.partner_automation_deliveries (
        id uuid primary key default gen_random_uuid(),
        organization_id uuid not null references app.organizations(id) on delete cascade,
        application_id uuid references app.staff_applications(id) on delete cascade,
        target text not null,
        event_name text not null,
        event_id text not null,
        payload jsonb not null default '{}'::jsonb,
        status text not null default 'pending',
        attempts integer not null default 0,
        next_attempt_at timestamptz not null default now(),
        delivered_at timestamptz,
        last_attempt_at timestamptz,
        last_error text,
        http_status integer,
        endpoint_host text,
        endpoint_fingerprint text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (organization_id, target, event_id),
        check (target in ('account_ready', 'applicant_received', 'admin_notification')),
        check (status in ('pending', 'sending', 'sent', 'failed', 'not_configured'))
      );
      create index if not exists partner_automation_deliveries_retry_idx
        on app.partner_automation_deliveries (status, next_attempt_at, created_at)
        where status in ('pending', 'failed', 'not_configured');
      insert into app.partner_automation_deliveries (
        organization_id, application_id, target, event_name, event_id, payload
      )
      select
        a.organization_id,
        a.id,
        'applicant_received',
        'partner_application_received',
        a.id::text || ':partner_application_received',
        (a.request_payload - 'profilePhotoUrl') || jsonb_build_object(
          'event', 'partner_application_received',
          'eventId', a.id::text || ':partner_application_received',
          'applicationId', a.id,
          'test', false,
          'payloadSource', 'application_submission_recovery',
          'fullName', trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')),
          'countyNames', coalesce((
            select string_agg(trim(item->>'county'), ', ' order by ordinality)
              from jsonb_array_elements(coalesce(a.request_payload->'counties', '[]'::jsonb))
                   with ordinality as county_item(item, ordinality)
          ), ''),
          'countyStateNames', coalesce((
            select string_agg(trim(item->>'county') || ', ' || trim(item->>'state'), '; ' order by ordinality)
              from jsonb_array_elements(coalesce(a.request_payload->'counties', '[]'::jsonb))
                   with ordinality as county_item(item, ordinality)
          ), ''),
          'totalCounties', jsonb_array_length(coalesce(a.request_payload->'counties', '[]'::jsonb)),
          'status', 'submitted',
          'success', true,
          'processing', true,
          'adminProfileUrl', trim(trailing '/' from c.admin_base_url) || '/applications/' || a.id::text,
          'submittedAt', coalesce(a.submitted_at, a.created_at)
        )
      from app.staff_applications a
      join app.staff_form_configs c on c.organization_id = a.organization_id
      where a.created_at > now() - interval '7 days'
        and coalesce(a.result->'applicantWebhook'->>'status', '') in ('failed', 'disabled', 'not_configured')
      on conflict (organization_id, target, event_id) do nothing;
      insert into app.partner_automation_deliveries (
        organization_id, application_id, target, event_name, event_id, payload
      )
      select
        a.organization_id,
        a.id,
        'account_ready',
        'partner_account_ready',
        a.id::text || ':partner_account_ready',
        (a.request_payload - 'profilePhotoUrl') || jsonb_build_object(
          'event', 'partner_account_ready',
          'eventId', a.id::text || ':partner_account_ready',
          'applicationId', a.id,
          'test', false,
          'payloadSource', 'application_acceptance_recovery',
          'fullName', trim(coalesce(a.first_name, '') || ' ' || coalesce(a.last_name, '')),
          'countyNames', coalesce((
            select string_agg(trim(item->>'county'), ', ' order by ordinality)
              from jsonb_array_elements(coalesce(a.request_payload->'counties', '[]'::jsonb))
                   with ordinality as county_item(item, ordinality)
          ), ''),
          'countyStateNames', coalesce((
            select string_agg(trim(item->>'county') || ', ' || trim(item->>'state'), '; ' order by ordinality)
              from jsonb_array_elements(coalesce(a.request_payload->'counties', '[]'::jsonb))
                   with ordinality as county_item(item, ordinality)
          ), ''),
          'totalCounties', jsonb_array_length(coalesce(a.request_payload->'counties', '[]'::jsonb)),
          'primaryLocationId', coalesce(a.primary_location_id, a.request_payload->>'primaryLocationId', ''),
          'partnerUserId', coalesce(a.result->'user'->>'userId', p.ghl_user_id, ''),
          'partnerPortalUrl', 'https://partners.mydripnurse.com/login',
          'welcomeLandingPageUrl', coalesce(a.result->>'welcomeLandingPageUrl', ''),
          'activationLinkExpiresInDays', 7,
          'partnerSlug', coalesce(p.slug, ''),
          'partnerWebsiteUrl', case when p.slug is null then '' else 'https://partners.mydripnurse.com/' || p.slug end,
          'partnerWebsiteStatus', coalesce(p.website_status, 'ready'),
          'groupCalendarId', coalesce(p.group_calendar_id, ''),
          'groupCalendarUrl', coalesce(p.group_calendar_url, ''),
          'onboardingLinkReady', nullif(a.result->>'welcomeLandingPageUrl', '') is not null,
          'accountReady', true,
          'availabilityConfigured', false,
          'availabilityRequiredForApproval', false,
          'calendarSetupSucceeded', true,
          'calendarSetupStatus', 'ready_for_partner_availability',
          'success', true,
          'provisioningStatus', 'completed',
          'acceptedAt', coalesce(a.provisioned_at, a.updated_at),
          'submittedAt', coalesce(a.submitted_at, a.created_at)
        )
      from app.staff_applications a
      join app.staff_form_configs c on c.organization_id = a.organization_id
      left join app.partner_profiles p on p.application_id = a.id
      where a.created_at > now() - interval '7 days'
        and a.provisioned_at is not null
        and coalesce(a.result->>'finalWebhookSent', 'false') <> 'true'
        and coalesce(a.result->'finalWebhook'->>'status', '') in ('failed', 'disabled', 'not_configured')
      on conflict (organization_id, target, event_id) do nothing;
      create table if not exists app.partner_affiliate_payouts (
        id uuid primary key default gen_random_uuid(),
        referrer_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
        amount numeric(12,2) not null,
        currency text not null default 'USD',
        status text not null default 'draft',
        provider text,
        provider_reference text,
        scheduled_at timestamptz,
        paid_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        check (status in ('draft', 'scheduled', 'processing', 'paid', 'failed', 'cancelled'))
      );
      alter table app.staff_application_location_steps
        add column if not exists deposit_completed_at timestamptz,
        add column if not exists deposit_completed_by uuid references app.users(id) on delete set null;
      insert into app.staff_application_location_steps (
        application_id, location_id, state, county
      )
      select
        a.id,
        trim(county->>'locationId'),
        trim(county->>'state'),
        trim(county->>'county')
      from app.staff_applications a
      cross join lateral jsonb_array_elements(
        case
          when jsonb_typeof(a.request_payload->'counties') = 'array'
            then a.request_payload->'counties'
          else '[]'::jsonb
        end
      ) as county
      where nullif(trim(county->>'locationId'), '') is not null
        and nullif(trim(county->>'state'), '') is not null
        and nullif(trim(county->>'county'), '') is not null
      on conflict (application_id, location_id) do nothing;
      update app.staff_applications a
         set ghl_user_id = coalesce(a.ghl_user_id, nullif(a.result->'user'->>'userId', '')),
             ghl_company_id = coalesce(a.ghl_company_id, nullif(a.result->'user'->>'companyId', '')),
             ghl_location_ids = case
               when cardinality(a.ghl_location_ids) > 0 then a.ghl_location_ids
               else coalesce((
                 select array_agg(distinct l.location_id order by l.location_id)
                   from app.staff_application_location_steps l
                  where l.application_id = a.id
               ), array[]::text[])
             end,
             ghl_identity_synced_at = case
               when coalesce(a.ghl_user_id, nullif(a.result->'user'->>'userId', '')) is not null
                 then coalesce(a.ghl_identity_synced_at, a.provisioned_at, a.updated_at)
               else a.ghl_identity_synced_at
             end;
    `);
    await pool.query(
      `insert into app.staff_form_configs (
         organization_id, form_key, enabled, webhook_url, calendar_mode, calendar_ids, calendar_names
       )
       select id, $1, true, $2, 'specific_names', array[]::text[], $3::text[]
         from app.organizations
        where slug = 'my-drip-nurse'
       -- This statement only seeds a missing configuration. Existing values are
       -- owned by Partner Admin > Automations and must never be reset during a
       -- schema check, application submission, or Partner approval.
       on conflict (organization_id) do nothing`,
      [
        "848e57527017c5dac9f142dec3bfb6f6c51a7c31ab42c477",
        "https://services.leadconnectorhq.com/hooks/vMfl1L5xb2wJfNFNW5fb/webhook-trigger/7e940f4c-6153-4053-9289-c499e1ef7b91",
        DEFAULT_MDN_CALENDAR_NAMES,
      ],
    );
  })().catch((error) => {
    staffSchemaReady = null;
    throw error;
  });
  return staffSchemaReady;
}

async function ghlRequest(opts: {
  path: string;
  token: string;
  version: string;
  method?: string;
  body?: unknown;
}) {
  const response = await fetch(`${API_BASE}${opts.path}`, {
    method: opts.method || "GET",
    headers: {
      Authorization: `Bearer ${opts.token}`,
      Version: opts.version,
      Accept: "application/json",
      ...(opts.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    cache: "no-store",
  });
  const text = await response.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const error = new Error(`GHL ${opts.method || "GET"} ${opts.path} failed (${response.status}): ${JSON.stringify(data)}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return data;
}

type StaffFormConfigRow = {
  organization_id: string;
  form_key: string;
  webhook_url: string | null;
  applicant_received_webhook_url: string | null;
  admin_notification_webhook_url: string | null;
  admin_base_url: string | null;
  calendar_mode: "all_compatible" | "specific" | "specific_names";
  calendar_ids: string[] | null;
  calendar_names: string[] | null;
};

function mapStaffFormConfig(row: StaffFormConfigRow): StaffFormConfig {
  return {
    tenantId: row.organization_id,
    formKey: row.form_key,
    // `webhook_url` is the URL edited under "Account-ready welcome".
    accountReadyWebhookUrl: s(row.webhook_url),
    // Partner Admin > Automations is the only webhook source of truth. Keeping
    // environment fallbacks here made an old endpoint silently take over when
    // an Automation was cleared or edited.
    applicantReceivedWebhookUrl: s(row.applicant_received_webhook_url),
    adminNotificationWebhookUrl: s(row.admin_notification_webhook_url),
    adminBaseUrl:
      s(row.admin_base_url) || s(process.env.MDN_STAFF_ADMIN_BASE_URL) || "https://admin.mydripnurse.com",
    calendarMode: row.calendar_mode,
    calendarIds: Array.isArray(row.calendar_ids) ? row.calendar_ids.map(s).filter(Boolean) : [],
    calendarNames: Array.isArray(row.calendar_names) ? row.calendar_names.map(s).filter(Boolean) : [],
  };
}

const STAFF_CONFIG_SELECT = `select organization_id, form_key, webhook_url,
       applicant_received_webhook_url, admin_notification_webhook_url, admin_base_url,
       calendar_mode, calendar_ids, calendar_names
  from app.staff_form_configs`;

export async function getStaffFormConfig(formKeyRaw: string): Promise<StaffFormConfig> {
  await ensureStaffSchema();
  const formKey = s(formKeyRaw);
  if (!formKey) throw new Error("Missing formKey");
  const pool = getDbPool();
  const query = await pool.query<StaffFormConfigRow>(
    `${STAFF_CONFIG_SELECT} where form_key = $1 and enabled = true limit 1`,
    [formKey],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Invalid or disabled formKey");
  return mapStaffFormConfig(row);
}

export async function getStaffFormConfigForTenant(tenantIdRaw: string): Promise<StaffFormConfig> {
  await ensureStaffSchema();
  const tenantId = s(tenantIdRaw);
  if (!tenantId) throw new Error("Missing tenant ID");
  const query = await getDbPool().query<StaffFormConfigRow>(
    `${STAFF_CONFIG_SELECT} where organization_id = $1 and enabled = true limit 1`,
    [tenantId],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Staff form configuration is missing or disabled for this tenant");
  return mapStaffFormConfig(row);
}

export async function loadEligibleCounties(config: StaffFormConfig): Promise<EligibleCounty[]> {
  const sheet = await getTenantSheetConfig(config.tenantId);
  const tab = await loadTenantSheetTabIndex({
    tenantId: config.tenantId,
    spreadsheetId: sheet.spreadsheetId,
    sheetName: sheet.countyTab,
    range: "A:AZ",
  });
  const stateIdx = headerIndex(tab.headers, ["State"]);
  const countyIdx = headerIndex(tab.headers, ["County"]);
  const locationIdx = headerIndex(tab.headers, ["Location Id", "Location ID", "LocationId"]);
  if (stateIdx < 0 || countyIdx < 0 || locationIdx < 0) {
    throw new Error(`The ${sheet.countyTab} sheet must contain State, County and Location Id columns`);
  }

  const seen = new Set<string>();
  const counties: EligibleCounty[] = [];
  for (const row of tab.rows) {
    const state = s(row[stateIdx]);
    const county = s(row[countyIdx]);
    const locationId = s(row[locationIdx]);
    if (!state || !county || !locationId || seen.has(locationId)) continue;
    seen.add(locationId);
    counties.push({
      key: countyKey(config.tenantId, locationId),
      state,
      county,
      locationId,
      operational: true,
    });
  }
  return counties.sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
}

function normalizedCatalogName(value: unknown) {
  return s(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function catalogSlug(value: unknown) {
  return normalizedCatalogName(value).replace(/\s+/g, "-") || "county";
}

function formatCatalogCountyName(stateSlug: string, countyName: string) {
  if (/\b(county|parish|borough|municipality|census area)\b/i.test(countyName)) return countyName;
  if (stateSlug === "louisiana") return `${countyName} Parish`;
  if (["alaska", "district-of-columbia", "puerto-rico"].includes(stateSlug)) return countyName;
  return `${countyName} County`;
}

/**
 * Public Partner applications use the complete JSON state catalog. The Sheet
 * remains the source of operational Location IDs, but an unprovisioned county
 * is no longer hidden from an applicant who can cover it.
 */
export async function loadApplicationCounties(config: StaffFormConfig): Promise<EligibleCounty[]> {
  let operationalCounties: EligibleCounty[] = [];
  let operationalError: unknown = null;
  try {
    operationalCounties = await loadEligibleCounties(config);
  } catch (error) {
    operationalError = error;
  }

  let stateFiles: Awaited<ReturnType<typeof listTenantStateFiles>> = [];
  try {
    stateFiles = await listTenantStateFiles(getDbPool(), config.tenantId);
  } catch {
    // Preserve the current Sheet-backed behavior if the JSON catalog has not
    // been seeded for this tenant yet.
  }

  if (!stateFiles.length) {
    if (operationalCounties.length) return operationalCounties;
    if (operationalError instanceof Error) throw operationalError;
    throw new Error("No county catalog is configured for this Partner application");
  }

  const operationalByName = new Map<string, EligibleCounty>();
  for (const county of operationalCounties) {
    operationalByName.set(
      `${normalizedCatalogName(county.state)}:${normalizedCatalogName(county.county)}`,
      county,
    );
  }

  const counties: EligibleCounty[] = [];
  const seen = new Set<string>();
  for (const stateFile of stateFiles) {
    const stateSlug = s(stateFile.state_slug).toLowerCase();
    const stateName = s(stateFile.state_name) || s(record(stateFile.payload).stateName) || stateSlug;
    const payloadCounties = record(stateFile.payload).counties;
    if (!Array.isArray(payloadCounties)) continue;

    for (const item of payloadCounties) {
      const rawCountyName = s(record(item).countyName);
      if (!rawCountyName) continue;
      const lookupKey = `${normalizedCatalogName(stateName)}:${normalizedCatalogName(rawCountyName)}`;
      const operationalCounty = operationalByName.get(lookupKey);
      const locationId = operationalCounty?.locationId
        || `catalog:${stateSlug}:${catalogSlug(rawCountyName)}`;
      const key = countyKey(config.tenantId, locationId);
      if (seen.has(key)) continue;
      seen.add(key);
      counties.push({
        key,
        state: operationalCounty?.state || stateName,
        county: operationalCounty?.county || formatCatalogCountyName(stateSlug, rawCountyName),
        locationId,
        operational: Boolean(operationalCounty),
      });
    }
  }

  // Keep any operational Sheet locations that are not present in an older
  // JSON snapshot so the merge never removes an existing application option.
  for (const county of operationalCounties) {
    if (seen.has(county.key)) continue;
    seen.add(county.key);
    counties.push(county);
  }

  return counties.sort((a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county));
}

async function getLocationToken(tenantId: string, locationId: string) {
  const [agencyToken, companyId] = await Promise.all([
    getAgencyAccessTokenOrThrow({ tenantId, integrationKey: "owner" }),
    getEffectiveCompanyIdOrThrow({ tenantId, integrationKey: "owner" }),
  ]);
  const data = await ghlRequest({
    path: "/oauth/locationToken",
    token: agencyToken,
    version: "2021-07-28",
    method: "POST",
    body: { companyId, locationId },
  });
  const tokenData = record(data);
  const token = s(tokenData.access_token || tokenData.accessToken);
  if (!token) throw new Error(`GHL did not return a Location token for ${locationId}`);
  return token;
}

export async function uploadStaffProfilePhoto(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  file: File;
  firstName: string;
  lastName: string;
}) {
  const allowedTypes = new Set(["image/jpeg", "image/png"]);
  if (!allowedTypes.has(opts.file.type)) {
    throw new Error("Profile photo must be a JPG or PNG image");
  }
  if (opts.file.size <= 0 || opts.file.size > 5 * 1024 * 1024) {
    throw new Error("Profile photo must be smaller than 5 MB");
  }

  const extension = opts.file.type === "image/png" ? "png" : "jpg";
  const safeName = `${opts.firstName}-${opts.lastName}`
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "partner";
  const fileName = `${safeName}-profile.${extension}`;
  const locationToken = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const upload = new FormData();
  upload.append("file", opts.file, fileName);
  upload.append("hosted", "false");
  upload.append("name", fileName);

  const response = await fetch(`${API_BASE}/medias/upload-file`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${locationToken}`,
      Version: "v3",
      Accept: "application/json",
    },
    body: upload,
    cache: "no-store",
  });
  const payload = record(await response.json().catch(() => ({})));
  if (!response.ok) {
    throw new Error(`Unable to store profile photo in GHL (${response.status})`);
  }
  const url = s(payload.url);
  const fileId = s(payload.fileId || payload.id);
  if (!url) throw new Error("GHL uploaded the profile photo but returned no public URL");
  return {
    url,
    fileId,
    locationId: opts.location.locationId,
  };
}

/** Stores an application photo in the internal application payload. No CRM or subaccount API is used. */
export async function uploadInternalStaffProfilePhoto(opts: {
  file: File;
  firstName: string;
  lastName: string;
}) {
  const allowedTypes = new Set(["image/jpeg", "image/png"]);
  if (!allowedTypes.has(opts.file.type)) {
    throw new Error("Profile photo must be a JPG or PNG image");
  }
  if (opts.file.size <= 0 || opts.file.size > 5 * 1024 * 1024) {
    throw new Error("Profile photo must be smaller than 5 MB");
  }
  const bytes = Buffer.from(await opts.file.arrayBuffer());
  const safeName = `${opts.firstName}-${opts.lastName}`
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "partner";
  return {
    url: `data:${opts.file.type};base64,${bytes.toString("base64")}`,
    fileId: `internal-${safeName}-profile`,
    locationId: "internal",
  };
}

function extractUsers(data: unknown): JsonRecord[] {
  const obj = record(data);
  if (Array.isArray(obj.users)) return obj.users.map(record);
  if (Array.isArray(obj.data)) return obj.data.map(record);
  if (Array.isArray(data)) return data.map(record);
  return [];
}

async function findUserByEmail(opts: {
  companyId: string;
  email: string;
  agencyToken: string;
  locationToken: string;
  locationId: string;
}) {
  try {
    const data = await ghlRequest({
      path: "/users/search/filter-by-email",
      token: opts.agencyToken,
      version: USER_VERSION,
      method: "POST",
      body: {
        companyId: opts.companyId,
        emails: [opts.email],
        deleted: false,
        skip: "0",
        limit: "25",
        projection: "all",
      },
    });
    const exact = extractUsers(data).find((user) => normalizeEmail(user.email) === opts.email);
    if (exact) return exact;
  } catch {
    // Fall through for older GHL installations that do not expose this endpoint.
  }
  try {
    const params = new URLSearchParams({
      companyId: opts.companyId,
      locationId: opts.locationId,
      query: opts.email,
    });
    const data = await ghlRequest({
      path: `/users/search?${params.toString()}`,
      token: opts.agencyToken,
      version: USER_VERSION,
    });
    const exact = extractUsers(data).find((user) => normalizeEmail(user.email) === opts.email);
    if (exact) return exact;
  } catch {
    // Some GHL installations do not expose /users/search to the installed app.
  }
  const data = await ghlRequest({
    path: `/users/?locationId=${encodeURIComponent(opts.locationId)}`,
    token: opts.locationToken,
    version: USER_VERSION,
  });
  return extractUsers(data).find((user) => normalizeEmail(user.email) === opts.email) || null;
}

async function getUserDetails(userId: string, agencyToken: string) {
  try {
    const data = await ghlRequest({
      path: `/users/${encodeURIComponent(userId)}`,
      token: agencyToken,
      version: USER_VERSION,
    });
    const obj = record(data);
    return record(obj.user || obj);
  } catch {
    return null;
  }
}

export async function syncPartnerProfilePhoto(opts: {
  tenantId: string;
  ghlUserId: string;
  profilePhotoUrl: string;
}) {
  const agencyToken = await getAgencyAccessTokenOrThrow({
    tenantId: opts.tenantId,
    integrationKey: "owner",
  });
  const detailedUser = await getUserDetails(opts.ghlUserId, agencyToken);
  if (!detailedUser) throw new Error("GHL user could not be loaded for photo synchronization");
  const roles = record(detailedUser.roles);
  const locationIds = Array.isArray(roles.locationIds)
    ? roles.locationIds.map(s).filter(Boolean)
    : Array.isArray(detailedUser.locationIds)
      ? detailedUser.locationIds.map(s).filter(Boolean)
      : [];
  await ghlRequest({
    path: `/users/${encodeURIComponent(opts.ghlUserId)}`,
    token: agencyToken,
    version: USER_VERSION,
    method: "PUT",
    body: {
      firstName: s(detailedUser.firstName),
      lastName: s(detailedUser.lastName),
      phone: s(detailedUser.phone),
      profilePhoto: opts.profilePhotoUrl,
      type: s(detailedUser.type) || "account",
      role: s(detailedUser.role) || s(roles.role) || "user",
      locationIds,
      permissions: record(detailedUser.permissions),
    },
  });
}

function staffPermissions() {
  return {
    contactsEnabled: true,
    appointmentsEnabled: true,
    conversationsEnabled: true,
    assignedDataOnly: true,
    settingsEnabled: false,
    workflowsEnabled: false,
    triggersEnabled: false,
    funnelsEnabled: false,
    websitesEnabled: false,
    marketingEnabled: false,
  };
}

async function ensureStaffUser(opts: {
  config: StaffFormConfig;
  input: StaffApplicationInput;
  locations: EligibleCounty[];
}) {
  const tenantId = opts.config.tenantId;
  const locationIds = [...new Set(opts.locations.map((item) => item.locationId))];
  const [agencyToken, companyId, firstLocationToken] = await Promise.all([
    getAgencyAccessTokenOrThrow({ tenantId, integrationKey: "owner" }),
    getEffectiveCompanyIdOrThrow({ tenantId, integrationKey: "owner" }),
    getLocationToken(tenantId, locationIds[0]),
  ]);
  const email = normalizeEmail(opts.input.email);
  const existing = await findUserByEmail({
    companyId,
    email,
    agencyToken,
    locationToken: firstLocationToken,
    locationId: locationIds[0],
  });
  const permissions = staffPermissions();
  const updateExisting = async (foundUser: JsonRecord) => {
    const userId = s(foundUser.id);
    const detailedUser = (await getUserDetails(userId, agencyToken)) || foundUser;
    const existingRoles = record(detailedUser.roles);
    const currentLocationIds = Array.isArray(existingRoles.locationIds)
      ? existingRoles.locationIds.map(s).filter(Boolean)
      : Array.isArray(detailedUser.locationIds)
        ? detailedUser.locationIds.map(s).filter(Boolean)
      : [];
    const mergedLocationIds = [...new Set([...currentLocationIds, ...locationIds])];
    await ghlRequest({
      path: `/users/${encodeURIComponent(userId)}`,
      token: agencyToken,
      version: USER_VERSION,
      method: "PUT",
      body: {
        firstName: opts.input.firstName,
        lastName: opts.input.lastName,
        phone: opts.input.phone,
        ...(opts.input.profilePhotoUrl ? { profilePhoto: opts.input.profilePhotoUrl } : {}),
        type: "account",
        role: "user",
        locationIds: mergedLocationIds,
        permissions: { ...record(detailedUser.permissions), ...permissions },
      },
    });
    return { userId, status: "updated" as const };
  };

  if (existing?.id) {
    return updateExisting(existing);
  }

  let created: unknown;
  try {
    created = await ghlRequest({
      path: "/users/",
      token: agencyToken,
      version: USER_VERSION,
      method: "POST",
      body: {
        companyId,
        email,
        password: opts.input.password,
        phone: opts.input.phone,
        firstName: opts.input.firstName,
        lastName: opts.input.lastName,
        ...(opts.input.profilePhotoUrl ? { profilePhoto: opts.input.profilePhotoUrl } : {}),
        type: "account",
        role: "user",
        locationIds,
        permissions,
        scopes: ["contacts.write", "calendars.readonly", "calendars/events.write"],
        scopesAssignedToOnly: ["contacts.write", "calendars/events.write"],
        platformLanguage: "en_US",
      },
    });
  } catch (error) {
    if (!/already exists/i.test(error instanceof Error ? error.message : String(error))) throw error;
    const recovered = await findUserByEmail({
      companyId,
      email,
      agencyToken,
      locationToken: firstLocationToken,
      locationId: locationIds[0],
    });
    if (!recovered?.id) throw error;
    return updateExisting(recovered);
  }
  const createdObj = record(created);
  const userId = s(createdObj.id || record(createdObj.user).id);
  if (!userId) throw new Error(`GHL created the user but returned no user ID: ${JSON.stringify(created)}`);
  return { userId, status: "created" as const };
}

export async function resolvePartnerGhlIdentity(opts: {
  config: StaffFormConfig;
  email: string;
  locations: Array<{ locationId: string }>;
}) {
  const locationIds = [...new Set(opts.locations.map((item) => s(item.locationId)).filter(Boolean))];
  if (!locationIds.length) throw new Error("This partner has no GHL locations to inspect.");
  const [agencyToken, companyId, firstLocationToken] = await Promise.all([
    getAgencyAccessTokenOrThrow({ tenantId: opts.config.tenantId, integrationKey: "owner" }),
    getEffectiveCompanyIdOrThrow({ tenantId: opts.config.tenantId, integrationKey: "owner" }),
    getLocationToken(opts.config.tenantId, locationIds[0]),
  ]);
  const email = normalizeEmail(opts.email);
  const found = await findUserByEmail({
    companyId,
    email,
    agencyToken,
    locationToken: firstLocationToken,
    locationId: locationIds[0],
  });
  const userId = s(found?.id);
  if (!userId) throw new Error(`No active GHL user was found for ${email}.`);
  const detailedUser = (await getUserDetails(userId, agencyToken)) || found || {};
  const roles = record(detailedUser.roles);
  const returnedLocationIds = Array.isArray(roles.locationIds)
    ? roles.locationIds.map(s).filter(Boolean)
    : Array.isArray(detailedUser.locationIds)
      ? detailedUser.locationIds.map(s).filter(Boolean)
      : [];
  return {
    userId,
    companyId,
    locationIds: [...new Set(returnedLocationIds.length ? returnedLocationIds : locationIds)],
    integrationKey: "owner" as const,
    syncedAt: new Date().toISOString(),
  };
}

const TEAM_CALENDAR_TYPES = new Set([
  "round_robin",
  "collective",
  "class_booking",
  "service_booking",
  "class",
  "service",
]);

function normalizeCalendarName(value: unknown) {
  return s(value)
    .normalize("NFKC")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function calendarCommerceFields(value: JsonRecord) {
  const commerceKey = /(price|amount|payment|deposit|currency|stripe|live.*mode)/i;
  const output: JsonRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (!commerceKey.test(key)) continue;
    if (Array.isArray(item)) {
      output[key] = item.length > 10 ? item.slice(0, 10) : item;
    } else if (item && typeof item === "object") {
      output[key] = record(item);
    } else {
      output[key] = item;
    }
  }
  return output;
}

export type PartnerCalendarInspectionItem = {
  locationId: string;
  state: string;
  county: string;
  status: "matched" | "missing" | "error";
  calendarId?: string;
  calendarType?: string;
  isActive?: boolean;
  commerceFields?: JsonRecord;
  error?: string;
};

export type PartnerLocationCalendar = {
  id: string;
  name: string;
  normalizedName: string;
  calendarType: string;
  isActive: boolean;
  teamMembers: JsonRecord[];
  commerceFields: JsonRecord;
};

export async function listPartnerLocationCalendars(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
}): Promise<PartnerLocationCalendar[]> {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const data = await ghlRequest({
    path: `/calendars/?locationId=${encodeURIComponent(opts.location.locationId)}&showDrafted=true`,
    token,
    version: CALENDAR_VERSION,
  });
  const calendars = Array.isArray(record(data).calendars) ? (record(data).calendars as unknown[]).map(record) : [];
  return calendars.flatMap((calendar) => {
    const id = s(calendar.id);
    const name = s(calendar.name);
    const calendarType = s(calendar.calendarType).toLowerCase();
    if (!id || !name || !TEAM_CALENDAR_TYPES.has(calendarType)) return [];
    return [{
      id,
      name,
      normalizedName: normalizeCalendarName(name),
      calendarType,
      isActive: calendar.isActive !== false,
      teamMembers: Array.isArray(calendar.teamMembers) ? calendar.teamMembers.map(record) : [],
      commerceFields: calendarCommerceFields(calendar),
    }];
  });
}

export async function updatePartnerLocationCalendarMembership(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  calendar: PartnerLocationCalendar;
  userId: string;
  active: boolean;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const currentlyMember = opts.calendar.teamMembers.some((member) => s(member.userId) === opts.userId);
  let nextMembers = opts.active
    ? (currentlyMember ? opts.calendar.teamMembers : [...opts.calendar.teamMembers, {
        userId: opts.userId,
        priority: 0.5,
        ...(opts.calendar.calendarType === "collective" ? { isPrimary: false } : {}),
      }])
    : opts.calendar.teamMembers.filter((member) => s(member.userId) !== opts.userId);

  if (opts.calendar.calendarType === "collective" && nextMembers.length > 0 && !nextMembers.some((member) => member.isPrimary === true)) {
    nextMembers = nextMembers.map((member, index) => index === 0 ? { ...member, isPrimary: true } : member);
  }
  const hasRemainingStaff = nextMembers.length > 0;
  const nextIsActive = opts.active ? true : hasRemainingStaff ? opts.calendar.isActive : false;
  const membershipChanged = opts.active ? !currentlyMember : currentlyMember;
  const activeChanged = nextIsActive !== opts.calendar.isActive;
  if (membershipChanged || activeChanged) {
    await ghlRequest({
      path: `/calendars/${encodeURIComponent(opts.calendar.id)}`,
      token,
      version: CALENDAR_VERSION,
      method: "PUT",
      body: { isActive: nextIsActive, teamMembers: nextMembers },
    });
  }
  return {
    calendarId: opts.calendar.id,
    locationId: opts.location.locationId,
    active: opts.active,
    calendarActive: nextIsActive,
    membershipChanged,
    remainingStaff: nextMembers.length,
  };
}

export async function inspectConfiguredCalendarSample(opts: {
  config: StaffFormConfig;
  calendarName: string;
  sampleSize?: number;
}): Promise<PartnerCalendarInspectionItem[]> {
  const wantedName = normalizeCalendarName(opts.calendarName);
  if (!wantedName || !opts.config.calendarNames.some((name) => normalizeCalendarName(name) === wantedName)) {
    throw new Error("Select a calendar from the configured My Drip Nurse catalog.");
  }

  const counties = await loadEligibleCounties(opts.config);
  const count = Math.max(1, Math.min(8, Math.floor(opts.sampleSize || 5)));
  const sample = Array.from({ length: Math.min(count, counties.length) }, (_, index) => {
    if (counties.length <= count) return counties[index];
    const offset = Math.round(index * (counties.length - 1) / Math.max(1, count - 1));
    return counties[offset];
  }).filter(Boolean);

  return Promise.all(sample.map(async (location): Promise<PartnerCalendarInspectionItem> => {
    try {
      const token = await getLocationToken(opts.config.tenantId, location.locationId);
      const data = await ghlRequest({
        path: `/calendars/?locationId=${encodeURIComponent(location.locationId)}&showDrafted=true`,
        token,
        version: CALENDAR_VERSION,
      });
      const calendars = Array.isArray(record(data).calendars) ? (record(data).calendars as unknown[]).map(record) : [];
      const calendar = calendars.find((item) => normalizeCalendarName(item.name) === wantedName);
      if (!calendar) {
        return { locationId: location.locationId, state: location.state, county: location.county, status: "missing" };
      }
      return {
        locationId: location.locationId,
        state: location.state,
        county: location.county,
        status: "matched",
        calendarId: s(calendar.id),
        calendarType: s(calendar.calendarType),
        isActive: calendar.isActive !== false,
        commerceFields: calendarCommerceFields(calendar),
      };
    } catch (error) {
      return {
        locationId: location.locationId,
        state: location.state,
        county: location.county,
        status: "error",
        error: error instanceof Error ? error.message : "Calendar inspection failed.",
      };
    }
  }));
}

async function updateLocationCalendars(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  userId: string;
  groupId?: string;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const data = await ghlRequest({
    path: `/calendars/?locationId=${encodeURIComponent(opts.location.locationId)}&showDrafted=true`,
    token,
    version: CALENDAR_VERSION,
  });
  const calendarData = record(data);
  const calendars: JsonRecord[] = Array.isArray(calendarData.calendars) ? calendarData.calendars.map(record) : [];
  const configured = new Set(opts.config.calendarIds);
  const configuredNames = new Set(opts.config.calendarNames.map(normalizeCalendarName));
  const results: JsonRecord[] = [];
  const matchedNames = new Set<string>();

  for (const calendar of calendars) {
    const id = s(calendar?.id);
    const type = s(calendar?.calendarType).toLowerCase();
    const name = s(calendar?.name);
    const normalizedName = normalizeCalendarName(name);
    if (!id) continue;
    if (opts.config.calendarMode === "specific" && !configured.has(id)) continue;
    if (opts.config.calendarMode === "specific_names" && !configuredNames.has(normalizedName)) continue;
    if (opts.config.calendarMode === "specific_names") matchedNames.add(normalizedName);
    if (!TEAM_CALENDAR_TYPES.has(type)) {
      results.push({ calendarId: id, name, status: "skipped", reason: `unsupported calendar type: ${type || "unknown"}` });
      continue;
    }

    const members = Array.isArray(calendar?.teamMembers) ? calendar.teamMembers : [];
    const alreadyMember = members.some((member) => s(record(member).userId) === opts.userId);
    const alreadyInGroup = !opts.groupId || s(calendar?.groupId) === opts.groupId;
    const nextMembers = alreadyMember
      ? members
      : [
          ...members,
          {
            userId: opts.userId,
            priority: 0.5,
            ...(type === "collective" ? { isPrimary: false } : {}),
          },
        ];
    if (alreadyMember && calendar?.isActive === true && alreadyInGroup) {
      results.push({ calendarId: id, name, status: "unchanged", active: true, memberAdded: false, groupId: s(calendar?.groupId) });
      continue;
    }
    await ghlRequest({
      path: `/calendars/${encodeURIComponent(id)}`,
      token,
      version: CALENDAR_VERSION,
      method: "PUT",
      body: {
        isActive: true,
        teamMembers: nextMembers,
        ...(opts.groupId ? { groupId: opts.groupId } : {}),
      },
    });
    results.push({
      calendarId: id,
      name,
      status: "updated",
      active: true,
      memberAdded: !alreadyMember,
      groupId: opts.groupId || s(calendar?.groupId),
    });
  }
  if (opts.config.calendarMode === "specific_names") {
    for (const requiredName of opts.config.calendarNames) {
      if (!matchedNames.has(normalizeCalendarName(requiredName))) {
        results.push({ name: requiredName, status: "missing", reason: "calendar not found in this subaccount" });
      }
    }
  }
  return results;
}

function configuredCalendarMatches(config: StaffFormConfig, calendar: JsonRecord) {
  const calendarId = s(calendar.id);
  if (!calendarId) return false;
  if (config.calendarMode === "specific") return config.calendarIds.includes(calendarId);
  if (config.calendarMode === "specific_names") {
    const configuredNames = new Set(config.calendarNames.map(normalizeCalendarName));
    return configuredNames.has(normalizeCalendarName(calendar.name));
  }
  return TEAM_CALENDAR_TYPES.has(s(calendar.calendarType).toLowerCase());
}

function provisionedCalendarIds(result: JsonRecord, locationId: string) {
  const locations = Array.isArray(result.locations) ? result.locations.map(record) : [];
  const location = locations.find((item) => s(item.locationId) === locationId);
  const calendars = location && Array.isArray(location.calendars) ? location.calendars.map(record) : [];
  return new Set(calendars.map((calendar) => s(calendar.calendarId)).filter(Boolean));
}

async function deactivateLocationCalendars(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  userId: string;
  previousResult: JsonRecord;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const data = await ghlRequest({
    path: `/calendars/?locationId=${encodeURIComponent(opts.location.locationId)}&showDrafted=true`,
    token,
    version: CALENDAR_VERSION,
  });
  const calendarData = record(data);
  const calendars = Array.isArray(calendarData.calendars) ? calendarData.calendars.map(record) : [];
  const storedIds = provisionedCalendarIds(opts.previousResult, opts.location.locationId);
  const results: JsonRecord[] = [];

  for (const calendar of calendars) {
    const calendarId = s(calendar.id);
    const calendarType = s(calendar.calendarType).toLowerCase();
    const calendarName = s(calendar.name);
    if (!calendarId || !TEAM_CALENDAR_TYPES.has(calendarType)) continue;
    const isTarget = storedIds.size > 0
      ? storedIds.has(calendarId)
      : configuredCalendarMatches(opts.config, calendar);
    if (!isTarget) continue;

    const members = Array.isArray(calendar.teamMembers) ? calendar.teamMembers.map(record) : [];
    const memberWasPresent = Boolean(opts.userId) && members.some((member) => s(member.userId) === opts.userId);
    let nextMembers = opts.userId
      ? members.filter((member) => s(member.userId) !== opts.userId)
      : members;
    if (calendarType === "collective" && nextMembers.length > 0 && !nextMembers.some((member) => member.isPrimary === true)) {
      nextMembers = nextMembers.map((member, index) => index === 0 ? { ...member, isPrimary: true } : member);
    }

    const hasRemainingStaff = nextMembers.length > 0;
    const nextIsActive = hasRemainingStaff ? calendar.isActive !== false : false;
    const shouldUpdate = memberWasPresent || (!hasRemainingStaff && calendar.isActive !== false);

    if (!shouldUpdate) {
      results.push({
        calendarId,
        name: calendarName,
        status: "unchanged",
        active: calendar.isActive !== false,
        memberRemoved: false,
        remainingStaff: nextMembers.length,
      });
      continue;
    }

    await ghlRequest({
      path: `/calendars/${encodeURIComponent(calendarId)}`,
      token,
      version: CALENDAR_VERSION,
      method: "PUT",
      body: { isActive: nextIsActive, teamMembers: nextMembers },
    });
    results.push({
      calendarId,
      name: calendarName,
      status: hasRemainingStaff ? "member_removed" : "deactivated",
      active: nextIsActive,
      memberRemoved: memberWasPresent,
      remainingStaff: nextMembers.length,
    });
  }

  return results;
}

export async function deactivateStaffApplication(opts: {
  config: StaffFormConfig;
  applicationId: string;
  email: string;
  locations: EligibleCounty[];
  previousResult: Record<string, unknown>;
  deactivatedBy: string;
}) {
  await ensureStaffSchema();
  const { ensureBookingEngineSchema } = await import("@/lib/bookingEngineSchema");
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const previousResult = record(opts.previousResult);
  const storedUserId = s(record(previousResult.user).userId);
  const locationIds = [...new Set(opts.locations.map((location) => location.locationId).filter(Boolean))];
  if (!locationIds.length) throw new Error("This staff application has no GHL locations to deactivate");

  const [agencyToken, companyId, firstLocationToken] = await Promise.all([
    getAgencyAccessTokenOrThrow({ tenantId: opts.config.tenantId, integrationKey: "owner" }),
    getEffectiveCompanyIdOrThrow({ tenantId: opts.config.tenantId, integrationKey: "owner" }),
    getLocationToken(opts.config.tenantId, locationIds[0]),
  ]);
  let userId = storedUserId;
  if (!userId) {
    const existing = await findUserByEmail({
      companyId,
      email: normalizeEmail(opts.email),
      agencyToken,
      locationToken: firstLocationToken,
      locationId: locationIds[0],
    });
    userId = s(existing?.id);
  }

  const locationResults: JsonRecord[] = [];
  try {
    for (const location of opts.locations) {
      const calendars = await deactivateLocationCalendars({
        config: opts.config,
        location,
        userId,
        previousResult,
      });
      locationResults.push({
        state: location.state,
        county: location.county,
        locationId: location.locationId,
        calendars,
      });
    }

    const personalRows = await pool.query<{ calendar_id: string; location_id: string }>(
      `select calendar_id, location_id
         from app.partner_personal_calendars
        where application_id = $1 and status = 'active'`,
      [opts.applicationId],
    );
    const personalCalendars: JsonRecord[] = [];
    for (const personal of personalRows.rows) {
      const location = opts.locations.find((item) => item.locationId === personal.location_id);
      if (!location) continue;
      await setPartnerPersonalCalendarStatus({
        config: opts.config,
        location,
        calendarId: personal.calendar_id,
        active: false,
      });
      personalCalendars.push({ calendarId: personal.calendar_id, locationId: personal.location_id, status: "inactive" });
    }
    await pool.query(
      `update app.partner_personal_calendars set status = 'inactive', updated_at = now() where application_id = $1;
       update app.partner_profiles set website_status = 'hidden', updated_at = now() where application_id = $1`,
      [opts.applicationId],
    );

    let userDeletion: JsonRecord = { status: "not_found", userId: userId || null };
    if (userId) {
      try {
        const deletion = record(await ghlRequest({
          path: `/users/${encodeURIComponent(userId)}`,
          token: agencyToken,
          version: "v3",
          method: "DELETE",
        }));
        if (deletion.succeeded === false) {
          throw new Error(s(deletion.message) || "GHL did not queue the staff deletion");
        }
        userDeletion = {
          status: "queued",
          userId,
          succeeded: deletion.succeeded !== false,
          message: s(deletion.message),
        };
      } catch (error) {
        const status = Number((error as Error & { status?: number })?.status || 0);
        if (status !== 404 && status !== 422) throw error;
        userDeletion = {
          status: "already_deleted",
          userId,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }

    const deactivation = {
      status: "completed",
      completedAt: new Date().toISOString(),
      userDeletion,
      locations: locationResults,
      personalCalendars,
    };
    await pool.query(
      `update app.staff_applications
          set status = 'deactivated',
              deactivated_at = coalesce(deactivated_at, now()),
              deactivated_by = $2::uuid,
              result = coalesce(result, '{}'::jsonb) || $3::jsonb,
              last_error = null,
              updated_at = now()
        where id = $1`,
      [opts.applicationId, opts.deactivatedBy, JSON.stringify({ deactivation })],
    );
    return deactivation;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update app.staff_applications
          set result = coalesce(result, '{}'::jsonb) || $2::jsonb,
              last_error = $3,
              updated_at = now()
        where id = $1`,
      [
        opts.applicationId,
        JSON.stringify({
          deactivation: {
            status: "failed",
            attemptedAt: new Date().toISOString(),
            locations: locationResults,
            error: message,
          },
        }),
        message,
      ],
    );
    throw error;
  }
}

async function ensurePartnerCalendarGroup(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  slug: string;
  displayName: string;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const groupSlug = `mdn-${opts.slug}`.slice(0, 80);
  const groupData = await ghlRequest({
    path: `/calendars/groups?locationId=${encodeURIComponent(opts.location.locationId)}`,
    token,
    version: CALENDAR_VERSION,
  });
  const groupObject = record(groupData);
  const groups = Array.isArray(groupObject.groups) ? groupObject.groups.map(record) : [];
  let group = groups.find((item) => s(item.slug) === groupSlug);

  if (!group) {
    const created = await ghlRequest({
      path: "/calendars/groups",
      token,
      version: CALENDAR_VERSION,
      method: "POST",
      body: {
        locationId: opts.location.locationId,
        name: `My Drip Nurse — ${opts.displayName}`,
        description: `Mobile IV therapy services with ${opts.displayName}.`,
        slug: groupSlug,
        isActive: true,
      },
    });
    const createdObject = record(created);
    group = record(createdObject.group || createdObject);
  }

  const id = s(group?.id);
  if (!id) throw new Error("GHL created or found the Partner calendar group but returned no group ID");
  if (group?.isActive === false) {
    await ghlRequest({
      path: `/calendars/groups/${encodeURIComponent(id)}/status`,
      token,
      version: CALENDAR_VERSION,
      method: "PUT",
      body: { isActive: true },
    });
  }
  return {
    id,
    slug: groupSlug,
    url: `https://api.leadconnectorhq.com/widget/group/${id}`,
    locationId: opts.location.locationId,
  };
}

function personalCalendarSlug(partnerSlug: string, serviceName: string) {
  const serviceSlug = serviceName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 38);
  return `mdn-${partnerSlug}-${serviceSlug}`.slice(0, 80).replace(/-+$/, "");
}

export async function ensurePartnerPersonalCalendars(opts: {
  config: StaffFormConfig;
  applicationId: string;
  location: EligibleCounty;
  userId: string;
  groupId: string;
  partnerSlug: string;
  displayName: string;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  const data = await ghlRequest({
    path: `/calendars/?locationId=${encodeURIComponent(opts.location.locationId)}&showDrafted=true`,
    token,
    version: CALENDAR_VERSION,
  });
  const calendars = Array.isArray(record(data).calendars) ? (record(data).calendars as unknown[]).map(record) : [];
  const sourceCalendars = calendars.filter((calendar) =>
    configuredCalendarMatches(opts.config, calendar) &&
    s(calendar.calendarType).toLowerCase() !== "personal" &&
    !s(calendar.slug).startsWith("mdn-"),
  );
  const results: JsonRecord[] = [];
  const pool = getDbPool();
  for (const source of sourceCalendars) {
    const sourceId = s(source.id);
    const serviceName = s(source.name);
    if (!sourceId || !serviceName) continue;
    const slug = personalCalendarSlug(opts.partnerSlug, serviceName);
    let personal = calendars.find((calendar) => s(calendar.slug) === slug);
    const teamMembers = [{ userId: opts.userId, priority: 0.5 }];
    if (!personal) {
      const optionalKeys = [
        "eventTitle", "eventColor", "slotDuration", "slotDurationUnit", "slotInterval",
        "slotIntervalUnit", "preBuffer", "preBufferUnit", "postBuffer", "postBufferUnit",
        "appointmentsPerSlot", "appointmentsPerDay", "minSchedulingNotice", "minSchedulingNoticeUnit",
        "maxSchedulingNotice", "maxSchedulingNoticeUnit", "openHours", "formId", "stickyContact",
        "autoConfirm", "allowReschedule", "allowCancellation", "calendarCoverImage", "widgetType",
        "isLivePaymentMode", "thankYouMessage", "lookBusyConfig",
      ];
      const cloned: JsonRecord = {};
      for (const key of optionalKeys) {
        if (source[key] !== undefined && source[key] !== null) cloned[key] = source[key];
      }
      const created = record(await ghlRequest({
        path: "/calendars/",
        token,
        version: CALENDAR_VERSION,
        method: "POST",
        body: {
          ...cloned,
          locationId: opts.location.locationId,
          groupId: opts.groupId,
          teamMembers,
          name: `${serviceName} — ${opts.displayName}`.slice(0, 120),
          description: s(source.description) || `${serviceName} appointments with ${opts.displayName}.`,
          slug,
          calendarType: "personal",
          isActive: true,
        },
      }));
      personal = record(created.calendar || created);
    } else {
      const members = Array.isArray(personal.teamMembers) ? personal.teamMembers.map(record) : [];
      const correctMember = members.length === 1 && s(members[0].userId) === opts.userId;
      if (!correctMember || s(personal.groupId) !== opts.groupId || personal.isActive === false) {
        await ghlRequest({
          path: `/calendars/${encodeURIComponent(s(personal.id))}`,
          token,
          version: CALENDAR_VERSION,
          method: "PUT",
          body: { groupId: opts.groupId, teamMembers, isActive: true },
        });
      }
    }
    const calendarId = s(personal?.id);
    if (!calendarId) throw new Error(`GHL did not return the personal calendar ID for ${serviceName}`);
    const normalizedName = normalizeCalendarName(serviceName);
    await pool.query(
      `insert into app.partner_personal_calendars (
         application_id, location_id, normalized_name, source_calendar_id,
         calendar_id, group_id, calendar_slug, status
       ) values ($1, $2, $3, $4, $5, $6, $7, 'active')
       on conflict (application_id, normalized_name) do update set
         location_id = excluded.location_id,
         source_calendar_id = excluded.source_calendar_id,
         calendar_id = excluded.calendar_id,
         group_id = excluded.group_id,
         calendar_slug = excluded.calendar_slug,
         status = 'active',
         updated_at = now()`,
      [opts.applicationId, opts.location.locationId, normalizedName, sourceId, calendarId, opts.groupId, slug],
    );
    results.push({
      calendarId,
      sourceCalendarId: sourceId,
      name: serviceName,
      normalizedName,
      slug,
      status: "active",
    });
  }
  if (!results.length) throw new Error("No configured services were available for personal Partner calendars");
  return results;
}

export async function setPartnerPersonalCalendarStatus(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  calendarId: string;
  active: boolean;
}) {
  const token = await getLocationToken(opts.config.tenantId, opts.location.locationId);
  await ghlRequest({
    path: `/calendars/${encodeURIComponent(opts.calendarId)}`,
    token,
    version: CALENDAR_VERSION,
    method: "PUT",
    body: { isActive: opts.active },
  });
}

const OMIT_AUTOMATION_VALUE = Symbol("omit-automation-value");

function sanitizeAutomationValue(value: unknown, key = ""): unknown | typeof OMIT_AUTOMATION_VALUE {
  if (typeof value === "string") {
    const normalizedKey = key.toLowerCase();
    if (
      value.startsWith("data:") ||
      normalizedKey.includes("photodata") ||
      normalizedKey.includes("imagebase64") ||
      normalizedKey.includes("filebase64")
    ) {
      return OMIT_AUTOMATION_VALUE;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeAutomationValue(item))
      .filter((item) => item !== OMIT_AUTOMATION_VALUE);
  }
  if (value && typeof value === "object") {
    const sanitized: JsonRecord = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const nextValue = sanitizeAutomationValue(childValue, childKey);
      if (nextValue !== OMIT_AUTOMATION_VALUE) sanitized[childKey] = nextValue;
    }
    return sanitized;
  }
  return value;
}

export function sanitizePartnerAutomationPayload(payload: unknown): JsonRecord {
  return record(sanitizeAutomationValue(payload));
}

async function sendWebhook(url: string, payload: unknown) {
  if (!url) return { status: "disabled" };
  const payloadRecord = sanitizePartnerAutomationPayload(payload);
  const body = JSON.stringify(payloadRecord);
  const payloadBytes = Buffer.byteLength(body, "utf8");
  if (payloadBytes > 256 * 1024) {
    throw new Error(`Webhook payload is still too large after media sanitization (${payloadBytes} bytes)`);
  }
  const eventId = s(payloadRecord.eventId);
  const event = s(payloadRecord.event);
  const payloadSource = s(payloadRecord.payloadSource);
  const endpointFingerprint = createHash("sha256").update(url).digest("hex").slice(0, 12);
  const retryableStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastError = "";

  console.info("[partner-webhook] delivery-start", {
    event,
    eventId,
    payloadSource,
    test: payloadRecord.test === true,
    endpointFingerprint,
    payloadBytes,
  });

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(eventId ? { "X-MDN-Event-Id": eventId, "Idempotency-Key": eventId } : {}),
        },
        body,
        signal: controller.signal,
        cache: "no-store",
      });
      const responseText = (await response.text()).slice(0, 800);
      if (response.ok) {
        const isGhlTestReceiver = /test request received/i.test(responseText);
        if (payloadRecord.test !== true && isGhlTestReceiver) {
          throw new Error(
            "GHL_TEST_RECEIVER: Account-ready webhook points to GHL's test receiver. Publish/activate the workflow and save its live webhook URL.",
          );
        }
        let endpointHost = "";
        try { endpointHost = new URL(url).host; } catch {}
        console.info("[partner-webhook] delivery-success", {
          event,
          eventId,
          payloadSource,
          endpointFingerprint,
          httpStatus: response.status,
          attempts: attempt,
          payloadBytes,
        });
        return {
          status: "sent",
          httpStatus: response.status,
          deliveredAt: new Date().toISOString(),
          attempts: attempt,
          eventId,
          payloadSource: s(payloadRecord.payloadSource),
          endpointHost,
          endpointFingerprint,
          response: responseText,
        };
      }
      lastError = `Webhook failed (HTTP ${response.status})${responseText ? `: ${responseText}` : ""}`;
      if (!retryableStatuses.has(response.status) || attempt === 3) throw new Error(lastError);
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      lastError = timedOut
        ? "Webhook timed out after 12 seconds"
        : error instanceof Error ? error.message : String(error);
      if (
        lastError.startsWith("GHL_TEST_RECEIVER:") ||
        attempt === 3 ||
        (!timedOut && /HTTP 4\d\d/.test(lastError) && !/HTTP (408|425|429)/.test(lastError))
      ) {
        console.error("[partner-webhook] delivery-failed", {
          event,
          eventId,
          payloadSource,
          endpointFingerprint,
          payloadBytes,
          attempt,
          error: lastError,
        });
        throw new Error(lastError);
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  throw new Error(lastError || "Webhook delivery failed");
}

export type PartnerAutomationTarget = "account_ready" | "applicant_received" | "admin_notification";

type AutomationDeliveryRow = {
  id: string;
  organization_id: string;
  application_id: string | null;
  target: PartnerAutomationTarget;
  event_name: string;
  event_id: string;
  payload: JsonRecord;
  status: "pending" | "sending" | "sent" | "failed" | "not_configured";
  attempts: number;
  delivered_at: string | null;
  last_error: string | null;
  http_status: number | null;
  endpoint_host: string | null;
  endpoint_fingerprint: string | null;
};

function configuredAutomationUrl(config: StaffFormConfig, target: PartnerAutomationTarget) {
  if (target === "account_ready") return s(config.accountReadyWebhookUrl);
  if (target === "applicant_received") return s(config.applicantReceivedWebhookUrl);
  return s(config.adminNotificationWebhookUrl);
}

function automationDeliveryResult(row: AutomationDeliveryRow, extra?: JsonRecord): JsonRecord {
  return {
    status: row.status,
    eventId: row.event_id,
    attempts: Number(row.attempts || 0),
    deliveredAt: row.delivered_at,
    httpStatus: row.http_status,
    endpointHost: s(row.endpoint_host),
    endpointFingerprint: s(row.endpoint_fingerprint),
    error: s(row.last_error),
    ...extra,
  };
}

async function syncApplicationAutomationResult(row: AutomationDeliveryRow, delivery: JsonRecord) {
  if (!row.application_id) return;
  const sent = s(delivery.status) === "sent";
  if (row.target === "account_ready") {
    await getDbPool().query(
      `update app.staff_applications
          set result = (coalesce(result, '{}'::jsonb) - 'finalWebhookPendingReason') || jsonb_build_object(
                'finalWebhook', $2::jsonb,
                'finalWebhookSent', $3::boolean
              ),
              status = case
                when $3::boolean and status = 'completed_with_warnings' then 'completed'
                else status
              end,
              updated_at = now()
        where id = $1`,
      [row.application_id, JSON.stringify(delivery), sent],
    );
    return;
  }
  const resultKey = row.target === "applicant_received" ? "applicantWebhook" : "adminWebhook";
  await getDbPool().query(
    `update app.staff_applications
        set result = coalesce(result, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
            updated_at = now()
      where id = $1`,
    [row.application_id, resultKey, JSON.stringify(delivery)],
  );
}

async function syncApplicationAutomationResultSafely(
  row: AutomationDeliveryRow,
  delivery: JsonRecord,
) {
  try {
    await syncApplicationAutomationResult(row, delivery);
    return "synced";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[partner-webhook] application-result-sync-failed", {
      applicationId: row.application_id,
      eventId: row.event_id,
      target: row.target,
      error: message,
    });
    return message;
  }
}

async function attemptPartnerAutomationDelivery(deliveryIdRaw: string): Promise<JsonRecord> {
  const deliveryId = s(deliveryIdRaw);
  const pool = getDbPool();
  const claimed = await pool.query<AutomationDeliveryRow>(
    `update app.partner_automation_deliveries
        set status = 'sending', attempts = attempts + 1,
            last_attempt_at = now(), updated_at = now()
      where id = $1
        and (
          status in ('pending', 'failed', 'not_configured')
          or (status = 'sending' and last_attempt_at < now() - interval '5 minutes')
        )
      returning *`,
    [deliveryId],
  );
  let row = claimed.rows[0];
  if (!row) {
    const existing = await pool.query<AutomationDeliveryRow>(
      `select * from app.partner_automation_deliveries where id = $1 limit 1`,
      [deliveryId],
    );
    row = existing.rows[0];
    if (!row) throw new Error("Partner Automation delivery was not found");
    return automationDeliveryResult(row, { alreadyProcessed: true });
  }

  const config = await getStaffFormConfigForTenant(row.organization_id);
  const webhookUrl = configuredAutomationUrl(config, row.target);
  if (!webhookUrl) {
    const missing = await pool.query<AutomationDeliveryRow>(
      `update app.partner_automation_deliveries
          set status = 'not_configured', last_error = $2,
              next_attempt_at = now() + interval '15 minutes', updated_at = now()
        where id = $1
        returning *`,
      [row.id, `${row.target} is not configured in Partner Admin > Automations`],
    );
    const result = automationDeliveryResult(missing.rows[0]);
    await syncApplicationAutomationResultSafely(missing.rows[0], result);
    return result;
  }

  const endpointHost = (() => {
    try { return new URL(webhookUrl).host; } catch { return ""; }
  })();
  const endpointFingerprint = createHash("sha256").update(webhookUrl).digest("hex").slice(0, 12);
  let delivered: JsonRecord;
  try {
    delivered = await sendWebhook(webhookUrl, row.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryMinutes = Math.min(60, Math.max(2, 2 ** Math.min(5, Number(row.attempts || 1))));
    const failed = await pool.query<AutomationDeliveryRow>(
      `update app.partner_automation_deliveries
          set status = 'failed', last_error = $2, http_status = null,
              endpoint_host = $3, endpoint_fingerprint = $4,
              next_attempt_at = now() + ($5::text || ' minutes')::interval,
              updated_at = now()
        where id = $1
        returning *`,
      [row.id, message, endpointHost, endpointFingerprint, String(retryMinutes)],
    );
    const result = automationDeliveryResult(failed.rows[0]);
    await syncApplicationAutomationResultSafely(failed.rows[0], result);
    return result;
  }

  // Once the remote endpoint returns success, delivery is final. A secondary
  // application-result sync must never turn it back into a retryable delivery.
  const sent = await pool.query<AutomationDeliveryRow>(
    `update app.partner_automation_deliveries
        set status = 'sent', delivered_at = now(), next_attempt_at = now(),
            last_error = null, http_status = $2,
            endpoint_host = $3, endpoint_fingerprint = $4, updated_at = now()
      where id = $1
      returning *`,
    [row.id, Number(record(delivered).httpStatus || 200), endpointHost, endpointFingerprint],
  );
  const result = automationDeliveryResult(sent.rows[0], delivered);
  const resultSync = await syncApplicationAutomationResultSafely(sent.rows[0], result);
  return resultSync === "synced" ? result : { ...result, resultSyncWarning: resultSync };
}

export async function deliverPartnerAutomationWebhook(opts: {
  tenantId: string;
  applicationId?: string;
  target: PartnerAutomationTarget;
  eventName: string;
  eventId: string;
  payload: unknown;
}) {
  await ensureStaffSchema();
  const tenantId = s(opts.tenantId);
  const eventId = s(opts.eventId);
  if (!tenantId || !eventId) throw new Error("Partner Automation delivery requires tenantId and eventId");
  const rawPayload = record(opts.payload);
  const event = s(rawPayload.event) || s(opts.eventName);
  const stateOperator = record(rawPayload.stateOperator);
  const payload = sanitizePartnerAutomationPayload({
    ...rawPayload,
    ...ghlRoutingFieldsForPayload(event, rawPayload, {
      marketCountryCode: rawPayload.marketCountryCode,
      marketState: rawPayload.marketState,
      marketCounty: rawPayload.marketCounty,
      marketCity: rawPayload.marketCity,
      platformFunded:
        rawPayload.platformFunded === true ||
        rawPayload.platformFundedAppointment === true,
      noEligiblePartners:
        rawPayload.noEligiblePartners === true ||
        (Object.prototype.hasOwnProperty.call(rawPayload, "eligiblePartnerCount") &&
          Number(rawPayload.eligiblePartnerCount) === 0),
      stateOperator: {
        id: rawPayload.stateOperatorId || stateOperator.id,
        ghlUserId: rawPayload.stateOperatorGhlUserId || stateOperator.ghlUserId,
        fullName: rawPayload.stateOperatorFullName || stateOperator.fullName,
        email: rawPayload.stateOperatorEmail || stateOperator.email,
        phone: rawPayload.stateOperatorPhone || stateOperator.phone,
      },
    }),
    event,
    eventId,
  });
  const queued = await getDbPool().query<AutomationDeliveryRow>(
    `insert into app.partner_automation_deliveries (
       organization_id, application_id, target, event_name, event_id, payload
     ) values ($1, nullif($2, '')::uuid, $3, $4, $5, $6::jsonb)
     on conflict (organization_id, target, event_id) do update set
       application_id = coalesce(app.partner_automation_deliveries.application_id, excluded.application_id),
       event_name = excluded.event_name,
       payload = excluded.payload,
       status = case
         when app.partner_automation_deliveries.status = 'sent' then 'sent'
         else 'pending'
       end,
       next_attempt_at = case
         when app.partner_automation_deliveries.status = 'sent' then app.partner_automation_deliveries.next_attempt_at
         else now()
       end,
       updated_at = now()
     returning *`,
    [tenantId, s(opts.applicationId), opts.target, s(opts.eventName), eventId, JSON.stringify(payload)],
  );
  if (queued.rows[0].status === "sent") {
    return automationDeliveryResult(queued.rows[0], { alreadyProcessed: true });
  }
  return attemptPartnerAutomationDelivery(queued.rows[0].id);
}

export async function retryPartnerAutomationWebhooks(limitRaw = 25) {
  await ensureStaffSchema();
  const limit = Math.max(1, Math.min(100, Number(limitRaw || 25)));
  const due = await getDbPool().query<{ id: string }>(
    `select id
       from app.partner_automation_deliveries
      where (status in ('pending', 'failed', 'not_configured') and next_attempt_at <= now())
         or (status = 'sending' and last_attempt_at < now() - interval '5 minutes')
      order by next_attempt_at, created_at
      limit $1`,
    [limit],
  );
  const results: JsonRecord[] = [];
  for (const item of due.rows) {
    try {
      results.push(await attemptPartnerAutomationDelivery(item.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[partner-webhook] retry-item-failed", { deliveryId: item.id, error: message });
      results.push({ status: "failed", deliveryId: item.id, error: message });
    }
  }
  return {
    processed: results.length,
    sent: results.filter((item) => s(item.status) === "sent").length,
    failed: results.filter((item) => s(item.status) === "failed").length,
    notConfigured: results.filter((item) => s(item.status) === "not_configured").length,
  };
}

function webhookWasSent(value: unknown) {
  const result = record(value);
  if (result.finalWebhookSent === true) return true;
  if (s(record(result.finalWebhook).status).toLowerCase() === "sent") return true;
  return s(record(result.webhook).status).toLowerCase() === "sent";
}

function calendarProvisioningError(
  config: StaffFormConfig,
  calendars: JsonRecord[],
) {
  const blocking = calendars.filter((calendar) => {
    const status = s(calendar.status).toLowerCase();
    if (status === "missing") return true;
    if (status !== "skipped") return false;
    return config.calendarMode === "specific" || config.calendarMode === "specific_names";
  });
  const assigned = calendars.some((calendar) => {
    const status = s(calendar.status).toLowerCase();
    return status === "updated" || status === "unchanged";
  });
  if (!assigned) {
    blocking.push({ status: "missing", reason: "no compatible calendar was assigned" });
  }
  const unique = new Set(
    blocking.map((calendar) =>
      `${s(calendar.name) || s(calendar.calendarId) || "Calendar"}: ${s(calendar.reason) || s(calendar.status) || "not available"}`,
    ),
  );
  return [...unique].join(" | ");
}

export function buildStaffPassword(firstNameRaw: string, lastNameRaw: string) {
  const firstName = s(firstNameRaw);
  const lastName = s(lastNameRaw);
  const initial = firstName.charAt(0).toUpperCase();
  const compactSurname = lastName.replace(/\s+/g, "");
  const surname = compactSurname.charAt(0).toUpperCase() + compactSurname.slice(1).toLowerCase();
  const suffix = "1234@";
  const padding = "0".repeat(Math.max(0, 12 - initial.length - surname.length - suffix.length));
  return `${initial}${surname}${padding}${suffix}`;
}

function applicationPayload(input: StaffApplicationInput, selected: EligibleCounty[]) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: normalizeEmail(input.email),
    phone: input.phone,
    company: input.company,
    publicTitle: input.publicTitle,
    professionalCredentials: input.professionalCredentials,
    biography: input.biography,
    profilePhotoUrl: input.profilePhotoUrl,
    profilePhotoFileId: input.profilePhotoFileId,
    profilePhotoLocationId: input.profilePhotoLocationId,
    profileConsentAt: input.profileConsentAt,
    referralCode: s(input.referralCode),
    primaryLocationId: s(input.primaryLocationId),
    counties: selected.map(({ state, county, locationId, operational }) => ({
      state,
      county,
      locationId,
      operational,
    })),
  };
}

function partnerSlug(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "partner";
}

async function upsertPartnerProfile(opts: {
  config: StaffFormConfig;
  applicationId: string;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
  ghlUserId: string;
}) {
  const pool = getDbPool();
  const existing = await pool.query<{ slug: string }>(
    `select slug from app.partner_profiles where application_id = $1 limit 1`,
    [opts.applicationId],
  );
  const displayName = `${opts.input.firstName} ${opts.input.lastName}`.trim();
  const areas = opts.selected.map(({ state, county, locationId }) => ({ state, county, locationId }));
  const syncStatus = opts.input.profilePhotoUrl ? "synced" : "pending";
  const portalPasswordHash = await hashPassword(opts.input.password);
  const values = [
    opts.config.tenantId,
    opts.applicationId,
    opts.ghlUserId,
    normalizeEmail(opts.input.email),
    displayName,
    opts.input.company,
    opts.input.publicTitle,
    opts.input.professionalCredentials,
    opts.input.biography,
    opts.input.profilePhotoUrl,
    opts.input.profilePhotoFileId,
    opts.input.profilePhotoLocationId,
    opts.input.primaryLocationId || opts.selected[0]?.locationId || "",
    JSON.stringify(areas),
    syncStatus,
    opts.input.profileConsentAt || null,
    portalPasswordHash,
  ];

  let slug = existing.rows[0]?.slug || "";
  if (slug) {
    await pool.query(
      `update app.partner_profiles
          set ghl_user_id = $3,
              email = $4,
              display_name = $5,
              business_name = $6,
              public_title = $7,
              professional_credentials = $8,
              biography = $9,
              profile_photo_url = $10,
              profile_photo_file_id = $11,
              profile_photo_location_id = $12,
              primary_location_id = $13,
              service_areas = $14::jsonb,
              ghl_photo_sync_status = $15,
              ghl_photo_synced_at = case when $15 = 'synced' then now() else ghl_photo_synced_at end,
              ghl_photo_sync_error = null,
              profile_consent_at = $16::timestamptz,
              portal_password_hash = $17,
              affiliate_code = coalesce(affiliate_code, slug),
              updated_at = now()
        where application_id = $2 and organization_id = $1`,
      values,
    );
  } else {
    const baseSlug = partnerSlug(opts.input.company || displayName);
    for (let attempt = 1; attempt <= 50; attempt += 1) {
      const candidate = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
      try {
        await pool.query(
          `insert into app.partner_profiles (
             organization_id, application_id, ghl_user_id, email, slug, display_name,
             business_name, public_title, professional_credentials, biography,
             profile_photo_url, profile_photo_file_id, profile_photo_location_id,
             primary_location_id, service_areas, ghl_photo_sync_status,
             ghl_photo_synced_at, profile_consent_at, affiliate_code, portal_password_hash
           ) values (
             $1, $2, $3, $4, $18, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14::jsonb, $15,
             case when $15 = 'synced' then now() else null end,
             $16::timestamptz, $18, $17
           )`,
          [...values, candidate],
        );
        slug = candidate;
        break;
      } catch (error) {
        const code = s((error as { code?: string })?.code);
        if (code !== "23505") throw error;
      }
    }
  }
  if (!slug) throw new Error("Unable to reserve a unique Partner website URL");
  const baseUrl = s(process.env.PARTNER_WEBSITE_BASE_URL) || "https://partners.mydripnurse.com";
  return {
    slug,
    websiteUrl: `${baseUrl.replace(/\/+$/, "")}/${slug}`,
  };
}

function submissionWebhookPayload(opts: {
  applicationId: string;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
  adminProfileUrl: string;
  submittedAt: string;
}) {
  const safePayload = applicationPayload(opts.input, opts.selected);
  const primaryCoverage = opts.selected[0];
  return {
    ...safePayload,
    applicationId: opts.applicationId,
    fullName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
    countyNames: opts.selected.map((item) => item.county).join(", "),
    countyStateNames: opts.selected.map((item) => `${item.county}, ${item.state}`).join("; "),
    totalCounties: opts.selected.length,
    status: "submitted",
    success: true,
    processing: true,
    adminProfileUrl: opts.adminProfileUrl,
    submittedAt: opts.submittedAt,
    ...ghlRoutingFieldsForEvent("partner_application_received", {
      marketCountryCode: "US",
      marketState: primaryCoverage?.state,
      marketCounty: primaryCoverage?.county,
    }),
  };
}

export async function submitStaffApplication(opts: {
  config: StaffFormConfig;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const safePayload = applicationPayload(opts.input, opts.selected);
  const submittedAt = new Date().toISOString();
  const submissionKey = s(opts.input.submissionKey) || null;
  const referralCode = s(opts.input.referralCode).toLowerCase();
  let referredByProfileId: string | null = null;
  if (referralCode) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(referralCode)) {
      throw new Error("Invalid Partner referral code");
    }
    const referrer = await pool.query<{ id: string }>(
      `select id from app.partner_profiles
        where organization_id = $1
          and affiliate_code = $2
          and website_status in ('ready', 'published')
        limit 1`,
      [opts.config.tenantId, referralCode],
    );
    referredByProfileId = referrer.rows[0]?.id || null;
  }
  const inserted = await pool.query<{ id: string }>(
    `insert into app.staff_applications (
       organization_id, email, status, request_payload, first_name, last_name,
       phone, company, public_title, professional_credentials, biography,
       profile_photo_url, profile_photo_file_id, profile_photo_location_id,
       profile_consent_at, submitted_at, submission_key, referral_code, referred_by_profile_id,
       primary_location_id
     ) values (
       $1, $2, 'submitted', $3::jsonb, $4, $5, $6, $7, $8, $9, $10,
       $11, $12, $13, nullif($14, '')::timestamptz, $15::timestamptz, $16, nullif($17, ''), $18, $19
     )
     on conflict (organization_id, submission_key) where submission_key is not null do nothing
     returning id`,
    [
      opts.config.tenantId,
      safePayload.email,
      JSON.stringify(safePayload),
      opts.input.firstName,
      opts.input.lastName,
      opts.input.phone,
      opts.input.company,
      opts.input.publicTitle,
      opts.input.professionalCredentials,
      opts.input.biography,
      opts.input.profilePhotoUrl,
      opts.input.profilePhotoFileId,
      opts.input.profilePhotoLocationId,
      opts.input.profileConsentAt,
      submittedAt,
      submissionKey,
      referralCode,
      referredByProfileId,
      opts.input.primaryLocationId,
    ],
  );
  if (!inserted.rows[0]) {
    const existing = await pool.query<{ id: string; status: string; submitted_at: string | null }>(
      `select id, status, submitted_at::text
         from app.staff_applications
        where organization_id = $1 and submission_key = $2
        limit 1`,
      [opts.config.tenantId, submissionKey],
    );
    if (!existing.rows[0]) {
      throw new Error("Unable to recover the existing partner application");
    }
    const existingApplicationId = existing.rows[0].id;
    const adminProfileUrl = `${opts.config.adminBaseUrl.replace(/\/$/, "")}/applications/${existingApplicationId}`;
    const duplicatePayload = submissionWebhookPayload({
      applicationId: existingApplicationId,
      input: opts.input,
      selected: opts.selected,
      adminProfileUrl,
      submittedAt: existing.rows[0].submitted_at || submittedAt,
    });
    const applicantWebhook = await deliverPartnerAutomationWebhook({
      tenantId: opts.config.tenantId,
      applicationId: existingApplicationId,
      target: "applicant_received",
      eventName: "partner_application_received",
      eventId: `${existingApplicationId}:partner_application_received`,
      payload: { ...duplicatePayload, event: "partner_application_received", test: false, payloadSource: "application_submission" },
    });
    await pool.query(
      `update app.staff_applications
          set result = coalesce(result, '{}'::jsonb) || jsonb_build_object('applicantWebhook', $2::jsonb),
              updated_at = now()
        where id = $1`,
      [existingApplicationId, JSON.stringify(applicantWebhook)],
    );
    return {
      applicationId: existingApplicationId,
      status: existing.rows[0].status,
      message: "Your application was already received and is under review.",
      duplicate: true as const,
    };
  }
  const applicationId = inserted.rows[0].id;
  if (referredByProfileId) {
    await pool.query(
      `insert into app.partner_affiliate_ledger (
         referrer_profile_id, referred_application_id, metadata
       ) values ($1, $2, $3::jsonb)
       on conflict (referrer_profile_id, referred_application_id, event_type) do nothing`,
      [referredByProfileId, applicationId, JSON.stringify({ referralCode, submittedAt })],
    );
  }
  for (const location of opts.selected) {
    await pool.query(
      `insert into app.staff_application_location_steps (
         application_id, location_id, state, county
       ) values ($1, $2, $3, $4)
       on conflict (application_id, location_id) do nothing`,
      [applicationId, location.locationId, location.state, location.county],
    );
  }
  const adminBaseUrl = opts.config.adminBaseUrl.replace(/\/$/, "");
  const adminProfileUrl = `${adminBaseUrl}/applications/${applicationId}`;
  const webhookPayload = submissionWebhookPayload({
    applicationId,
    input: opts.input,
    selected: opts.selected,
    adminProfileUrl,
    submittedAt,
  });
  // One paid GHL inbound event carries both routing instructions. The GHL
  // workflow acknowledges the applicant and alerts the internal team by using
  // notifyApplicant / notifyAdmin from the shared routing envelope.
  const communicationsWebhook = await deliverPartnerAutomationWebhook({
    tenantId: opts.config.tenantId,
    applicationId,
    target: "applicant_received",
    eventName: "partner_application_received",
    eventId: `${applicationId}:partner_application_received`,
    payload: { ...webhookPayload, event: "partner_application_received", test: false, payloadSource: "application_submission" },
  });
  const result = {
    communicationsWebhook,
    // Preserve these legacy result keys for existing Admin views without
    // generating a second outbound webhook request.
    applicantWebhook: communicationsWebhook,
    adminWebhook: communicationsWebhook,
    adminProfileUrl,
  };
  await pool.query(
    `update app.staff_applications set result = $2::jsonb where id = $1`,
    [applicationId, JSON.stringify(result)],
  );
  return {
    applicationId,
    status: "submitted" as const,
    message: "Your application was received and is now under review.",
  };
}

export async function provisionStaffApplication(opts: {
  config: StaffFormConfig;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
  applicationId?: string;
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const safePayload = applicationPayload(opts.input, opts.selected);
  let applicationId = s(opts.applicationId);
  let previousResult: JsonRecord = {};
  let finalWebhookDelivered = false;
  if (applicationId) {
    const claimed = await pool.query<{ id: string; result: JsonRecord }>(
      `update app.staff_applications
          set status = 'staff_processing', last_error = null, updated_at = now()
        where id = $1
          and organization_id = $2
          and reviewed_at is not null
          and status in ('staff_ready', 'failed')
          and exists (
            select 1 from app.staff_application_location_steps l
             where l.application_id = app.staff_applications.id
          )
          and not exists (
            select 1 from app.staff_application_location_steps l
             where l.application_id = app.staff_applications.id
               and l.stripe_status not in ('complete', 'not_required')
          )
          and not exists (
            select 1 from app.staff_application_location_steps l
             where l.application_id = app.staff_applications.id
               and (l.staff_status = 'processing' or l.calendars_status = 'processing')
          )
        returning id, result`,
      [applicationId, opts.config.tenantId],
    );
    if (!claimed.rows[0]) {
      const current = await pool.query<{
        status: string;
        reviewed_at: string | null;
        stripe_pending: string;
      }>(
        `select a.status, a.reviewed_at,
                count(*) filter (where l.stripe_status not in ('complete', 'not_required'))::text as stripe_pending
           from app.staff_applications a
           left join app.staff_application_location_steps l on l.application_id = a.id
          where a.id = $1 and a.organization_id = $2
          group by a.id`,
        [applicationId, opts.config.tenantId],
      );
      const state = current.rows[0];
      if (!state) throw new Error("Staff application not found for this tenant");
      if (!state.reviewed_at) throw new Error("Review the application before creating the staff account");
      if (Number(state.stripe_pending || 0) > 0) {
        throw new Error("Complete Stripe for every requested subaccount before creating the staff account");
      }
      if (state.status === "staff_processing") throw new Error("Staff provisioning is already running");
      if (["calendar_deposit_pending", "ready_to_complete", "completed"].includes(state.status)) {
        throw new Error("The staff account and calendars were already provisioned");
      }
      throw new Error(`Application cannot be provisioned from status ${state.status}`);
    }
    previousResult = record(claimed.rows[0].result);
    finalWebhookDelivered = webhookWasSent(previousResult);
  } else {
    const inserted = await pool.query<{ id: string }>(
      `insert into app.staff_applications (
         organization_id, email, status, request_payload, first_name, last_name, phone, company,
         public_title, professional_credentials, biography, profile_photo_url,
         profile_photo_file_id, profile_photo_location_id, profile_consent_at, submitted_at,
         primary_location_id
       ) values (
         $1, $2, 'staff_processing', $3::jsonb, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, nullif($14, '')::timestamptz, now(), $15
       ) returning id`,
      [
        opts.config.tenantId,
        safePayload.email,
        JSON.stringify(safePayload),
        opts.input.firstName,
        opts.input.lastName,
        opts.input.phone,
        opts.input.company,
        opts.input.publicTitle,
        opts.input.professionalCredentials,
        opts.input.biography,
        opts.input.profilePhotoUrl,
        opts.input.profilePhotoFileId,
        opts.input.profilePhotoLocationId,
        opts.input.profileConsentAt,
        opts.input.primaryLocationId,
      ],
    );
    applicationId = inserted.rows[0].id;
    for (const location of opts.selected) {
      await pool.query(
        `insert into app.staff_application_location_steps (application_id, location_id, state, county)
         values ($1, $2, $3, $4)
         on conflict (application_id, location_id) do nothing`,
        [applicationId, location.locationId, location.state, location.county],
      );
    }
  }
  await pool.query(
    `update app.staff_application_location_steps
        set staff_status = 'processing', calendars_status = 'processing', last_error = null
      where application_id = $1`,
    [applicationId],
  );
  try {
    const user = await ensureStaffUser({
      config: opts.config,
      input: opts.input,
      locations: opts.selected,
    });
    const partnerProfile = await upsertPartnerProfile({
      config: opts.config,
      applicationId,
      input: opts.input,
      selected: opts.selected,
      ghlUserId: user.userId,
    });
    const primaryLocation = opts.selected.find((location) => location.locationId === opts.input.primaryLocationId) || opts.selected[0];
    const calendarGroup = await ensurePartnerCalendarGroup({
      config: opts.config,
      location: primaryLocation,
      slug: partnerProfile.slug,
      displayName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
    });
    const locations: JsonRecord[] = [];
    let primaryCalendars: JsonRecord[] = [];
    const failureReasons: string[] = [];
    for (const location of opts.selected) {
      try {
        const calendars = await updateLocationCalendars({
          config: opts.config,
          location,
          userId: user.userId,
        });
        const calendarError = calendarProvisioningError(opts.config, calendars);
        if (location.locationId === primaryLocation.locationId) primaryCalendars = calendars;
        const calendarStatus = calendarError ? "failed" : "complete";
        await pool.query(
          `update app.staff_application_location_steps
              set staff_status = 'complete', calendars_status = $3, last_error = $4, updated_at = now()
            where application_id = $1 and location_id = $2`,
          [applicationId, location.locationId, calendarStatus, calendarError || null],
        );
        if (calendarError) {
          const failure = `${location.county}: ${calendarError}`;
          failureReasons.push(failure);
          locations.push({
            state: location.state,
            county: location.county,
            locationId: location.locationId,
            status: "failed",
            error: calendarError,
            calendars,
          });
        } else {
          locations.push({ state: location.state, county: location.county, locationId: location.locationId, status: "completed", calendars });
        }
      } catch (error) {
        const locationError = error instanceof Error ? error.message : String(error);
        failureReasons.push(`${location.county}: ${locationError}`);
        await pool.query(
          `update app.staff_application_location_steps
              set staff_status = 'complete', calendars_status = 'failed', last_error = $3, updated_at = now()
            where application_id = $1 and location_id = $2`,
          [applicationId, location.locationId, locationError],
        );
        locations.push({
          state: location.state,
          county: location.county,
          locationId: location.locationId,
          status: "failed",
          error: locationError,
        });
      }
    }
    if (failureReasons.length > 0) {
      throw new Error(`Calendar provisioning is incomplete: ${failureReasons.join(" | ")}`);
    }
    primaryCalendars = await ensurePartnerPersonalCalendars({
      config: opts.config,
      applicationId,
      location: primaryLocation,
      userId: user.userId,
      groupId: calendarGroup.id,
      partnerSlug: partnerProfile.slug,
      displayName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
    });
    await pool.query(
      `update app.partner_profiles
          set group_calendar_id = $2,
              group_calendar_slug = $3,
              group_calendar_url = $4,
              services = $5::jsonb,
              website_status = 'ready',
              updated_at = now()
        where application_id = $1`,
      [
        applicationId,
        calendarGroup.id,
        calendarGroup.slug,
        calendarGroup.url,
        JSON.stringify(
          primaryCalendars
            .filter((calendar) => ["updated", "unchanged", "active"].includes(s(calendar.status)))
            .map((calendar) => ({
              calendarId: s(calendar.calendarId),
              name: s(calendar.name),
              status: s(calendar.status),
            })),
        ),
      ],
    );

    const welcomeLandingPageUrl = await issuePartnerOnboardingLink({
      applicationId,
      ghlUserId: user.userId,
      firstName: opts.input.firstName,
      lastName: opts.input.lastName,
      email: safePayload.email,
      password: opts.input.password,
      countyStateNames: opts.selected.map((item) => `${item.county}, ${item.state}`).join("; "),
      loginUrl: "https://app.devasks.com",
      publicTitle: opts.input.publicTitle,
      professionalCredentials: opts.input.professionalCredentials,
      biography: opts.input.biography,
      profilePhotoUrl: opts.input.profilePhotoUrl,
      partnerSlug: partnerProfile.slug,
      partnerWebsiteUrl: partnerProfile.websiteUrl,
    });
    if (!welcomeLandingPageUrl) throw new Error("Partner onboarding link was not created");

    const result = {
      user,
      locations,
      finalWebhook: record(previousResult.finalWebhook || previousResult.webhook),
      finalWebhookSent: webhookWasSent(previousResult),
      provisioningStatus: "website_review_pending",
      welcomeLandingPageUrl,
      partnerProfile,
      calendarGroup,
    };
    const status = "website_review_pending" as const;
    await pool.query(
      `update app.staff_applications
          set status = $2,
              result = coalesce(result, '{}'::jsonb) || $3::jsonb,
              last_error = null,
              provisioned_at = coalesce(provisioned_at, now()),
              updated_at = now()
        where id = $1`,
      [applicationId, status, JSON.stringify(result)],
    );
    return { applicationId, status, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update app.staff_applications
          set status = 'failed',
              result = coalesce(result, '{}'::jsonb) || $3::jsonb,
              last_error = $2,
              updated_at = now()
        where id = $1`,
      [
        applicationId,
        message,
        JSON.stringify({
          provisioningStatus: "failed",
          provisioningFailureReason: message,
          finalWebhookSent: finalWebhookDelivered,
        }),
      ],
    );
    await pool.query(
      `update app.staff_application_location_steps
          set staff_status = case when staff_status = 'processing' then 'failed' else staff_status end,
              calendars_status = case when calendars_status = 'processing' then 'failed' else calendars_status end,
              last_error = coalesce(last_error, $2),
              updated_at = now()
        where application_id = $1`,
      [applicationId, message],
    );
    throw error;
  }
}

export async function setPartnerWebsiteVisibility(opts: {
  applicationId: string;
  action: "publish" | "hide" | "republish";
  target?: "website" | "directory" | "both";
}) {
  await ensureStaffSchema();
  const pool = getDbPool();
  const loaded = await pool.query<{
    organization_id: string;
    status: string;
    request_payload: JsonRecord;
    result: JsonRecord;
    profile_id: string | null;
    slug: string | null;
    website_status: string | null;
    group_calendar_id: string | null;
    group_calendar_url: string | null;
    services: unknown;
    account_activated: boolean;
    availability_configured: boolean;
    submitted_at: string | null;
  }>(
    `select a.organization_id, a.status, a.request_payload, a.result,
            a.submitted_at::text,
            p.id as profile_id, p.slug, p.website_status,
            p.group_calendar_id, p.group_calendar_url, p.services,
            (nullif(p.portal_password_hash, '') is not null) as account_activated,
            exists (
              select 1
                from app.partner_availability_rules availability
               where availability.partner_profile_id = p.id
                 and availability.is_active = true
            ) as availability_configured
       from app.staff_applications a
       left join app.partner_profiles p on p.application_id = a.id
      where a.id = $1
      limit 1`,
    [opts.applicationId],
  );
  const row = loaded.rows[0];
  if (!row || !row.profile_id || !row.slug) throw new Error("Partner website is not ready yet");

  const target = opts.target || "both";
  if (opts.action === "hide") {
    const assignments: string[] = ["updated_at = now()"];
    if (target === "website" || target === "both") assignments.push("website_status = 'hidden'");
    if (target === "directory" || target === "both") assignments.push("directory_status = 'hidden'");
    await pool.query(
      `update app.partner_profiles
          set ${assignments.join(", ")}
        where application_id = $1`,
      [opts.applicationId],
    );
    return { websiteStatus: target === "directory" ? row.website_status : "hidden", slug: row.slug };
  }

  if (!Array.isArray(row.services) || row.services.length === 0) {
    throw new Error("Activate at least one Partner service before publishing the website");
  }
  if (opts.action === "publish" && !row.account_activated) {
    throw new Error("The Partner must activate their Portal account before publishing the website or directory");
  }
  if (opts.action === "publish" && !row.availability_configured) {
    throw new Error("The Partner must add at least one working day before publishing the website or directory");
  }

  const websiteBase = (s(process.env.PARTNER_WEBSITE_BASE_URL) || "https://partners.mydripnurse.com").replace(/\/+$/, "");
  const partnerWebsiteUrl = `${websiteBase}/${row.slug}`;
  const publishAssignments = ["published_at = coalesce(published_at, now())", "updated_at = now()"];
  if (target === "website" || target === "both") publishAssignments.push("website_status = 'published'");
  if (target === "directory" || target === "both") publishAssignments.push("directory_status = 'published'");
  await pool.query(
    `update app.partner_profiles set ${publishAssignments.join(", ")} where application_id = $1`,
    [opts.applicationId],
  );

  const previousResult = record(row.result);
  let finalWebhook = record(previousResult.finalWebhook || previousResult.webhook);
  let finalWebhookSent = webhookWasSent(previousResult);
  let finalWebhookPendingReason = "";
  if (!finalWebhookSent) {
    const onboarding = await readLatestPartnerOnboardingForApplication(opts.applicationId);
    if (onboarding) {
      const config = await getStaffFormConfigForTenant(row.organization_id);
      const requestPayload = record(row.request_payload);
      const counties = Array.isArray(requestPayload.counties)
        ? requestPayload.counties.map(record)
        : [];
      const locations = Array.isArray(previousResult.locations) ? previousResult.locations : [];
      if (s(config.accountReadyWebhookUrl)) {
        finalWebhook = await deliverPartnerAutomationWebhook({
          tenantId: row.organization_id,
          applicationId: opts.applicationId,
          target: "account_ready",
          eventName: "partner_account_ready",
          eventId: `${opts.applicationId}:partner_account_ready`,
          payload: {
          ...requestPayload,
          event: "partner_account_ready",
          ...ghlRoutingFieldsForEvent("partner_account_ready", {
            marketCountryCode: "US",
            marketState: s(record(counties[0]).state),
            marketCounty: s(record(counties[0]).county),
          }),
          eventId: `${opts.applicationId}:partner_account_ready`,
          applicationId: opts.applicationId,
          test: false,
          payloadSource: "application_acceptance",
          fullName: `${onboarding.firstName} ${onboarding.lastName}`.trim(),
          countyNames: counties.map((item) => s(item.county)).filter(Boolean).join(", "),
          countyStateNames: onboarding.countyStateNames,
          totalCounties: counties.length,
          primaryLocationId: s(requestPayload.primaryLocationId),
          partnerUserId: onboarding.ghlUserId,
          loginUrl: onboarding.loginUrl,
          partnerPortalUrl: `${websiteBase}/login`,
          welcomeLandingPageUrl: s(previousResult.welcomeLandingPageUrl),
          activationLinkExpiresInDays: 7,
          partnerSlug: row.slug,
          partnerWebsiteUrl,
          partnerWebsiteStatus: "published",
          groupCalendarId: row.group_calendar_id,
          groupCalendarUrl: row.group_calendar_url,
          onboardingLinkReady: true,
          accountReady: true,
          availabilityConfigured: false,
          availabilityRequiredForApproval: false,
          calendarSetupSucceeded: true,
          calendarSetupStatus: "ready_for_partner_availability",
          success: true,
          provisioningStatus: "completed",
          locations,
          acceptedAt: new Date().toISOString(),
          submittedAt: row.submitted_at,
          },
        });
        finalWebhookSent = webhookWasSent({ finalWebhook });
        if (!finalWebhookSent) finalWebhookPendingReason = "The configured welcome webhook did not confirm delivery.";
      } else {
        finalWebhookPendingReason = "No Partner welcome webhook is configured yet.";
      }
    } else {
      finalWebhookPendingReason = "The secure Partner onboarding package has not been issued yet.";
    }
  }

  const nextResult = {
    finalWebhook,
    finalWebhookSent,
    ...(finalWebhookPendingReason ? { finalWebhookPendingReason } : {}),
    partnerWebsiteUrl,
    partnerWebsiteStatus: "published",
    provisioningStatus: "completed",
  };
  await pool.query(
    `update app.staff_applications
        set status = $3,
            result = coalesce(result, '{}'::jsonb) || $2::jsonb,
            last_error = null,
            updated_at = now()
      where id = $1`,
    [opts.applicationId, JSON.stringify(nextResult), finalWebhookSent ? "completed" : "completed_with_warnings"],
  );
  await notifyPartnerSitePublished(row.organization_id);
  return { websiteStatus: "published" as const, slug: row.slug, partnerWebsiteUrl, finalWebhookSent };
}

/**
 * Provisions a Partner entirely inside the My Drip Nurse platform.
 *
 * This is deliberately separate from the legacy HighLevel provisioner above:
 * no GHL user, location token, calendar, or subaccount is created here. The
 * internal booking engine owns services, availability, deposits, and portal
 * access; webhooks remain the only outbound notification boundary.
 */
export async function provisionInternalPartnerApplication(opts: {
  config: StaffFormConfig;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
  applicationId: string;
}) {
  await ensureStaffSchema();
  const { ensureBookingEngineSchema } = await import("@/lib/bookingEngineSchema");
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const applicationId = s(opts.applicationId);
  if (!applicationId) throw new Error("Partner application ID is required.");

  const claim = await pool.query<{ id: string; result: JsonRecord | null; submitted_at: string | null }>(
    `update app.staff_applications
        set status = 'staff_processing', last_error = null, updated_at = now()
      where id = $1
        and organization_id = $2
        and reviewed_at is not null
        and status in ('staff_ready', 'failed', 'under_review', 'stripe_pending')
      returning id, result, submitted_at::text`,
    [applicationId, opts.config.tenantId],
  );
  if (!claim.rows[0]) {
    const current = await pool.query<{ status: string; reviewed_at: string | null }>(
      `select status, reviewed_at from app.staff_applications where id = $1 and organization_id = $2 limit 1`,
      [applicationId, opts.config.tenantId],
    );
    const row = current.rows[0];
    if (!row) throw new Error("Partner application not found for this organization.");
    if (!row.reviewed_at) throw new Error("Review the application before activating the Partner.");
    if (["staff_processing", "website_review_pending", "calendar_deposit_pending", "ready_to_complete", "completed", "completed_with_warnings"].includes(row.status)) {
      throw new Error("This Partner is already activated or is currently being activated.");
    }
    throw new Error(`Application cannot be activated from status ${row.status}.`);
  }

  const internalUserId = `internal-partner-${applicationId}`;
  const previousResult = record(claim.rows[0].result);
  try {
    for (const location of opts.selected) {
      await pool.query(
        `insert into app.staff_application_location_steps (application_id, location_id, state, county)
         values ($1, $2, $3, $4)
         on conflict (application_id, location_id) do nothing`,
        [applicationId, location.locationId, location.state, location.county],
      );
    }
    await pool.query(
      `update app.staff_application_location_steps
          set stripe_status = 'complete', stripe_completed_at = coalesce(stripe_completed_at, now()),
              staff_status = 'processing', calendars_status = 'processing', last_error = null,
              updated_at = now()
        where application_id = $1`,
      [applicationId],
    );

    const partnerProfile = await upsertPartnerProfile({
      config: opts.config,
      applicationId,
      input: opts.input,
      selected: opts.selected,
      ghlUserId: internalUserId,
    });
    const profileRow = await pool.query<{ id: string }>(
      `select id from app.partner_profiles where application_id = $1 limit 1`,
      [applicationId],
    );
    const profileId = profileRow.rows[0]?.id;
    if (!profileId) throw new Error("The internal Partner profile could not be created.");

    const catalogOrg = await pool.query<{ id: string }>(
      `select id from app.organizations
        where lower(slug) = 'my-drip-nurse' or lower(name) = 'my drip nurse'
        order by case when lower(slug) = 'my-drip-nurse' then 0 else 1 end
        limit 1`,
    );
    const serviceOrgId = catalogOrg.rows[0]?.id || opts.config.tenantId;
    const services = await pool.query<{
      id: string; slug: string; name: string; short_description: string | null;
      ingredients: string[] | null; image_url: string | null; image_alt: string | null;
      price: string | null; currency: string; deposit_type: string; deposit_value: string;
    }>(
      `select id, slug, name, short_description, ingredients, image_url, image_alt,
              price::text, currency, deposit_type, deposit_value::text
         from app.services
        where organization_id = $1 and is_active = true
        order by name`,
      [serviceOrgId],
    );
    if (!services.rows.length) throw new Error("Create at least one active service before activating a Partner.");

    const serviceSnapshot = services.rows.map((service) => ({
      normalizedName: service.slug,
      name: service.name,
      description: service.short_description || "",
      ingredients: service.ingredients || [],
      price: service.price === null ? null : Number(service.price),
      effectivePrice: service.price === null ? null : Number(service.price),
      currency: service.currency,
      depositType: service.deposit_type,
      depositValue: Number(service.deposit_value),
      imageUrl: service.image_url || "",
      imageAlt: service.image_alt || service.name,
      status: "active",
    }));
    const internalGroupId = `internal-group-${applicationId}`;
    const websiteBase = (s(process.env.PARTNER_WEBSITE_BASE_URL) || "https://partners.mydripnurse.com").replace(/\/+$/, "");
    await pool.query(
      `update app.partner_profiles
          set group_calendar_id = $2,
              group_calendar_slug = $3,
              group_calendar_url = $4,
              services = $5::jsonb,
              website_status = 'ready',
              updated_at = now()
        where id = $1`,
      [profileId, internalGroupId, `${partnerProfile.slug}-services`, `${websiteBase}/${partnerProfile.slug}/services`, JSON.stringify(serviceSnapshot)],
    );

    for (const service of services.rows) {
      const assignment = await pool.query<{ id: string }>(
        `insert into app.partner_service_assignments
           (organization_id, partner_profile_id, service_id, status, activated_at, metadata)
         values ($1, $2, $3, 'active', now(), '{"source":"internal_application_activation"}'::jsonb)
         on conflict (partner_profile_id, service_id) do update set
           status = 'active', activated_at = coalesce(app.partner_service_assignments.activated_at, now()),
           deactivated_at = null, updated_at = now()
         returning id`,
        [opts.config.tenantId, profileId, service.id],
      );
      const assignmentId = assignment.rows[0]?.id;
      if (!assignmentId) continue;
      for (const location of opts.selected) {
        await pool.query(
          `insert into app.partner_coverage_areas (assignment_id, state, county, metadata)
           values ($1, $2, $3, $4::jsonb)
           on conflict do nothing`,
          [assignmentId, location.state, location.county, JSON.stringify({ locationId: location.locationId, source: "internal_application_activation" })],
        );
      }
    }

    await pool.query(
      `update app.staff_application_location_steps
          set stripe_status = 'complete', staff_status = 'complete', calendars_status = 'complete',
              deposit_status = 'complete',
              deposit_config = jsonb_build_object('percentage', 40, 'source', 'service_catalog', 'platform', 'stripe'),
              stripe_completed_at = coalesce(stripe_completed_at, now()), deposit_completed_at = now(),
              last_error = null, updated_at = now()
        where application_id = $1`,
      [applicationId],
    );

    const onboardingUrl = await issuePartnerOnboardingLink({
      applicationId,
      ghlUserId: internalUserId,
      firstName: opts.input.firstName,
      lastName: opts.input.lastName,
      email: normalizeEmail(opts.input.email),
      password: opts.input.password,
      countyStateNames: opts.selected.map((item) => `${item.county}, ${item.state}`).join("; "),
      loginUrl: `${websiteBase}/login`,
      publicTitle: opts.input.publicTitle,
      professionalCredentials: opts.input.professionalCredentials,
      biography: opts.input.biography,
      profilePhotoUrl: opts.input.profilePhotoUrl,
      partnerSlug: partnerProfile.slug,
      partnerWebsiteUrl: partnerProfile.websiteUrl,
    });
    const acceptedAt = new Date().toISOString();
    const countyNames = opts.selected.map((item) => item.county).join(", ");
    const countyStateNames = opts.selected.map((item) => `${item.county}, ${item.state}`).join("; ");
    // Re-read the saved Account-ready welcome destination immediately before
    // delivery so an admin edit made during review cannot use a stale URL.
    const accountReadyConfig = await getStaffFormConfigForTenant(opts.config.tenantId);
    const finalWebhook = await deliverPartnerAutomationWebhook({
      tenantId: accountReadyConfig.tenantId,
      applicationId,
      target: "account_ready",
      eventName: "partner_account_ready",
      eventId: `${applicationId}:partner_account_ready`,
      payload: {
      ...applicationPayload(opts.input, opts.selected),
      event: "partner_account_ready",
      ...ghlRoutingFieldsForEvent("partner_account_ready", {
        marketCountryCode: "US",
        marketState: opts.selected[0]?.state,
        marketCounty: opts.selected[0]?.county,
      }),
      eventId: `${applicationId}:partner_account_ready`,
      applicationId,
      test: false,
      payloadSource: "application_acceptance",
      fullName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
      countyNames,
      countyStateNames,
      totalCounties: opts.selected.length,
      primaryLocationId: s(opts.input.primaryLocationId || opts.selected[0]?.locationId),
      partnerUserId: internalUserId,
      loginUrl: `${websiteBase}/login`,
      partnerPortalUrl: `${websiteBase}/login`,
      welcomeLandingPageUrl: onboardingUrl,
      activationLinkExpiresInDays: 7,
      partnerSlug: partnerProfile.slug,
      partnerWebsiteUrl: partnerProfile.websiteUrl,
      partnerWebsiteStatus: "ready",
      groupCalendarId: internalGroupId,
      groupCalendarUrl: `${websiteBase}/${partnerProfile.slug}/services`,
      onboardingLinkReady: true,
      accountReady: true,
      availabilityConfigured: false,
      availabilityRequiredForApproval: false,
      calendarSetupSucceeded: true,
      calendarSetupStatus: "ready_for_partner_availability",
      success: true,
      provisioningStatus: "completed",
      locations: opts.selected.map(({ state, county, locationId }) => ({ state, county, locationId })),
      acceptedAt,
      submittedAt: claim.rows[0].submitted_at,
      },
    });
    const finalWebhookSent = webhookWasSent({ finalWebhook });
    const finalStatus = finalWebhookSent ? "completed" : "completed_with_warnings";
    const result = {
      ...previousResult,
      user: { userId: internalUserId, provider: "my_drip_nurse" },
      provisioningProvider: "internal",
      provisioningStatus: "completed",
      welcomeLandingPageUrl: onboardingUrl,
      partnerProfile,
      calendarGroup: { id: internalGroupId, url: `${websiteBase}/${partnerProfile.slug}/services` },
      availabilityConfigured: false,
      finalWebhook,
      finalWebhookSent,
      ...(!finalWebhookSent ? { finalWebhookPendingReason: "The configured account-ready webhook did not confirm delivery." } : {}),
    };
    await pool.query(
      `update app.staff_applications
          set status = $2, result = $3::jsonb,
              provisioned_at = coalesce(provisioned_at, now()), last_error = null, updated_at = now()
        where id = $1`,
      [applicationId, finalStatus, JSON.stringify(result)],
    );
    return { applicationId, status: finalStatus, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update app.staff_applications set status = 'failed', last_error = $2, updated_at = now() where id = $1`,
      [applicationId, message],
    );
    await pool.query(
      `update app.staff_application_location_steps
          set staff_status = case when staff_status = 'processing' then 'failed' else staff_status end,
              calendars_status = case when calendars_status = 'processing' then 'failed' else calendars_status end,
              last_error = coalesce(last_error, $2), updated_at = now()
        where application_id = $1`,
      [applicationId, message],
    );
    throw error;
  }
}

/** Deactivates a Partner only in the My Drip Nurse booking platform. */
export async function deactivateInternalPartnerApplication(opts: {
  applicationId: string;
  deactivatedBy: string;
}) {
  await ensureStaffSchema();
  const { ensureBookingEngineSchema } = await import("@/lib/bookingEngineSchema");
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const applicationId = s(opts.applicationId);
  if (!applicationId) throw new Error("Partner application ID is required.");

  const profile = await pool.query<{ id: string }>(
    `select id from app.partner_profiles where application_id = $1 limit 1`,
    [applicationId],
  );
  if (!profile.rows[0]) throw new Error("This application does not have an internal Partner profile.");
  const profileId = profile.rows[0].id;
  await pool.query(
    `update app.partner_service_assignments
        set status = 'revoked', deactivated_at = coalesce(deactivated_at, now()), updated_at = now()
      where partner_profile_id = $1;
     update app.partner_coverage_areas
        set status = 'paused', updated_at = now()
      where assignment_id in (select id from app.partner_service_assignments where partner_profile_id = $1);
     update app.partner_availability_rules
        set is_active = false, updated_at = now()
      where partner_profile_id = $1;
     update app.partner_profiles
        set website_status = 'hidden', updated_at = now()
      where id = $1;`,
    [profileId],
  );
  const deactivation = {
    status: "completed",
    provider: "internal",
    completedAt: new Date().toISOString(),
    profileId,
  };
  await pool.query(
    `update app.staff_applications
        set status = 'deactivated', deactivated_at = coalesce(deactivated_at, now()),
            deactivated_by = $2::uuid, result = coalesce(result, '{}'::jsonb) || $3::jsonb,
            last_error = null, updated_at = now()
      where id = $1`,
    [applicationId, opts.deactivatedBy, JSON.stringify({ deactivation })],
  );
  return deactivation;
}

export async function sendPartnerApplicationLifecycleEvent(
  applicationIdRaw: string,
  event: "partner_application_under_review",
) {
  await ensureStaffSchema();
  const applicationId = s(applicationIdRaw);
  const pool = getDbPool();
  const loaded = await pool.query<{
    organization_id: string;
    request_payload: JsonRecord;
    submitted_at: string | null;
  }>(
    `select organization_id, request_payload, submitted_at::text
       from app.staff_applications
      where id = $1
      limit 1`,
    [applicationId],
  );
  const row = loaded.rows[0];
  if (!row) throw new Error("Partner application not found");
  const config = await getStaffFormConfigForTenant(row.organization_id);
  const requestPayload = record(row.request_payload);
  const adminProfileUrl = `${config.adminBaseUrl.replace(/\/$/, "")}/applications/${applicationId}`;
  const delivery = await deliverPartnerAutomationWebhook({
    tenantId: row.organization_id,
    applicationId,
    target: "applicant_received",
    eventName: event,
    eventId: `${applicationId}:${event}`,
    payload: {
      ...requestPayload,
      event,
      applicationId,
      status: "under_review",
      adminProfileUrl,
      submittedAt: row.submitted_at,
      updatedAt: new Date().toISOString(),
      test: false,
      payloadSource: "application_review",
    },
  });
  await pool.query(
    `update app.staff_applications
        set result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
          'lifecycleWebhooks',
          coalesce(result->'lifecycleWebhooks', '{}'::jsonb) || jsonb_build_object($2, $3::jsonb)
        ), updated_at = now()
      where id = $1`,
    [applicationId, event, JSON.stringify(delivery)],
  );
  return delivery;
}
