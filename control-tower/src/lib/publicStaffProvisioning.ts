import { createHash } from "node:crypto";
import { getDbPool } from "@/lib/db";
import {
  getAgencyAccessTokenOrThrow,
  getEffectiveCompanyIdOrThrow,
} from "@/lib/ghlHttp";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { issuePartnerOnboardingLink } from "@/lib/partnerOnboarding";

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
  webhookUrl: string;
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
};

export type StaffApplicationInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  password: string;
  countyKeys: string[];
  submissionKey?: string;
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
        add column if not exists admin_base_url text not null default 'https://admin.mydripnurse.com';
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
        add column if not exists admin_notes text,
        add column if not exists submitted_at timestamptz,
        add column if not exists reviewed_at timestamptz,
        add column if not exists reviewed_by uuid references app.users(id) on delete set null,
        add column if not exists provisioned_at timestamptz,
        add column if not exists submission_key text;
      create unique index if not exists staff_applications_org_submission_key_uq
        on app.staff_applications (organization_id, submission_key)
        where submission_key is not null;
      update app.staff_applications
         set submitted_at = coalesce(submitted_at, created_at),
             first_name = coalesce(first_name, request_payload->>'firstName'),
             last_name = coalesce(last_name, request_payload->>'lastName'),
             phone = coalesce(phone, request_payload->>'phone'),
             company = coalesce(company, request_payload->>'company');
      alter table app.staff_applications
        drop constraint if exists staff_applications_status_ck;
      alter table app.staff_applications
        alter column status set default 'submitted';
      alter table app.staff_applications
        add constraint staff_applications_status_ck check (status in (
          'submitted', 'under_review', 'stripe_pending', 'staff_ready',
          'staff_processing', 'staff_created', 'calendar_deposit_pending', 'ready_to_complete',
          'processing', 'completed', 'completed_with_warnings', 'rejected', 'failed'
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
    `);
    await pool.query(
      `insert into app.staff_form_configs (
         organization_id, form_key, enabled, webhook_url, calendar_mode, calendar_ids, calendar_names
       )
       select id, $1, true, $2, 'specific_names', array[]::text[], $3::text[]
         from app.organizations
        where slug = 'my-drip-nurse'
       on conflict (organization_id) do update set
         form_key = excluded.form_key,
         enabled = true,
         webhook_url = excluded.webhook_url,
         calendar_mode = excluded.calendar_mode,
         calendar_ids = excluded.calendar_ids,
         calendar_names = excluded.calendar_names,
         updated_at = now()`,
      [
        "848e57527017c5dac9f142dec3bfb6f6c51a7c31ab42c477",
        "https://services.leadconnectorhq.com/hooks/vMfl1L5xb2wJfNFNW5fb/webhook-trigger/2d67c827-a3c2-470b-8a44-10348ea48665",
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
    webhookUrl: s(row.webhook_url),
    applicantReceivedWebhookUrl:
      s(row.applicant_received_webhook_url) || s(process.env.MDN_STAFF_APPLICANT_RECEIVED_WEBHOOK_URL),
    adminNotificationWebhookUrl:
      s(row.admin_notification_webhook_url) || s(process.env.MDN_STAFF_ADMIN_NOTIFICATION_WEBHOOK_URL),
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
    });
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

async function updateLocationCalendars(opts: {
  config: StaffFormConfig;
  location: EligibleCounty;
  userId: string;
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
    if (alreadyMember && calendar?.isActive === true) {
      results.push({ calendarId: id, name, status: "unchanged", active: true, memberAdded: false });
      continue;
    }
    await ghlRequest({
      path: `/calendars/${encodeURIComponent(id)}`,
      token,
      version: CALENDAR_VERSION,
      method: "PUT",
      body: { isActive: true, teamMembers: nextMembers },
    });
    results.push({
      calendarId: id,
      name,
      status: "updated",
      active: true,
      memberAdded: !alreadyMember,
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

async function sendWebhook(url: string, payload: unknown) {
  if (!url) return { status: "disabled" };
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Webhook failed (${response.status})`);
  return { status: "sent" };
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
    counties: selected.map(({ state, county, locationId }) => ({ state, county, locationId })),
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
  };
}

async function sendOptionalWebhook(url: string, payload: unknown): Promise<JsonRecord> {
  try {
    return await sendWebhook(url, payload);
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  }
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
  const inserted = await pool.query<{ id: string }>(
    `insert into app.staff_applications (
       organization_id, email, status, request_payload, first_name, last_name,
       phone, company, submitted_at, submission_key
     ) values ($1, $2, 'submitted', $3::jsonb, $4, $5, $6, $7, $8::timestamptz, $9)
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
      submittedAt,
      submissionKey,
    ],
  );
  if (!inserted.rows[0]) {
    const existing = await pool.query<{ id: string; status: string }>(
      `select id, status
         from app.staff_applications
        where organization_id = $1 and submission_key = $2
        limit 1`,
      [opts.config.tenantId, submissionKey],
    );
    if (!existing.rows[0]) {
      throw new Error("Unable to recover the existing partner application");
    }
    return {
      applicationId: existing.rows[0].id,
      status: existing.rows[0].status,
      message: "Your application was already received and is under review.",
      duplicate: true as const,
    };
  }
  const applicationId = inserted.rows[0].id;
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
  const [applicantWebhook, adminWebhook] = await Promise.all([
    sendOptionalWebhook(opts.config.applicantReceivedWebhookUrl, {
      ...webhookPayload,
      event: "partner_application_received",
    }),
    sendOptionalWebhook(opts.config.adminNotificationWebhookUrl, {
      ...webhookPayload,
      event: "partner_application_admin_notification",
    }),
  ]);
  const result = { applicantWebhook, adminWebhook, adminProfileUrl };
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
         organization_id, email, status, request_payload, first_name, last_name, phone, company, submitted_at
       ) values ($1, $2, 'staff_processing', $3::jsonb, $4, $5, $6, $7, now()) returning id`,
      [
        opts.config.tenantId,
        safePayload.email,
        JSON.stringify(safePayload),
        opts.input.firstName,
        opts.input.lastName,
        opts.input.phone,
        opts.input.company,
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
    const locations: JsonRecord[] = [];
    const failureReasons: string[] = [];
    for (const location of opts.selected) {
      try {
        const calendars = await updateLocationCalendars({ config: opts.config, location, userId: user.userId });
        const calendarError = calendarProvisioningError(opts.config, calendars);
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

    const welcomeLandingPageUrl = await issuePartnerOnboardingLink({
      applicationId,
      ghlUserId: user.userId,
      firstName: opts.input.firstName,
      lastName: opts.input.lastName,
      email: safePayload.email,
      password: opts.input.password,
      countyStateNames: opts.selected.map((item) => `${item.county}, ${item.state}`).join("; "),
      loginUrl: "https://app.devasks.com",
    });
    if (!welcomeLandingPageUrl) throw new Error("Partner onboarding link was not created");

    let finalWebhook = record(previousResult.finalWebhook || previousResult.webhook);
    if (!webhookWasSent(previousResult)) {
      finalWebhook = await sendWebhook(opts.config.webhookUrl, {
        ...safePayload,
        event: "partner_account_ready",
        eventId: applicationId,
        fullName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
        countyNames: opts.selected.map((item) => item.county).join(", "),
        countyStateNames: opts.selected.map((item) => `${item.county}, ${item.state}`).join("; "),
        totalCounties: opts.selected.length,
        applicationId,
        ghlUserId: user.userId,
        ghlUserStatus: user.status,
        password: opts.input.password,
        loginUrl: "https://app.devasks.com",
        welcomeLandingPageUrl,
        onboardingLinkReady: true,
        accountReady: true,
        calendarSetupSucceeded: true,
        calendarSetupStatus: "completed",
        success: true,
        provisioningStatus: "completed",
        failureReasons: [],
        failureReasonText: "",
        locations,
        submittedAt: new Date().toISOString(),
      });
      if (!webhookWasSent({ finalWebhook })) {
        throw new Error("The final partner account-ready webhook was not delivered");
      }
      await pool.query(
        `update app.staff_applications
            set result = coalesce(result, '{}'::jsonb) || $2::jsonb,
                updated_at = now()
          where id = $1`,
        [applicationId, JSON.stringify({ finalWebhook, finalWebhookSent: true })],
      );
      finalWebhookDelivered = true;
    }
    const result = {
      user,
      locations,
      finalWebhook,
      finalWebhookSent: true,
      provisioningStatus: "completed",
      welcomeLandingPageUrl,
    };
    const status = "calendar_deposit_pending" as const;
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
