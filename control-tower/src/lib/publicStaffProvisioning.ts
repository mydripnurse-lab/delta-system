import { createHash } from "node:crypto";
import { getDbPool } from "@/lib/db";
import {
  getAgencyAccessTokenOrThrow,
  getEffectiveCompanyIdOrThrow,
} from "@/lib/ghlHttp";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";

const API_BASE = "https://services.leadconnectorhq.com";
const USER_VERSION = "2023-02-21";
const CALENDAR_VERSION = "v3";

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

type StaffFormConfig = {
  tenantId: string;
  formKey: string;
  webhookUrl: string;
  calendarMode: "all_compatible" | "specific";
  calendarIds: string[];
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
};

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

export async function getStaffFormConfig(formKeyRaw: string): Promise<StaffFormConfig> {
  const formKey = s(formKeyRaw);
  if (!formKey) throw new Error("Missing formKey");
  const pool = getDbPool();
  const query = await pool.query<{
    organization_id: string;
    form_key: string;
    webhook_url: string | null;
    calendar_mode: "all_compatible" | "specific";
    calendar_ids: string[] | null;
  }>(
    `select organization_id, form_key, webhook_url, calendar_mode, calendar_ids
       from app.staff_form_configs
      where form_key = $1 and enabled = true
      limit 1`,
    [formKey],
  );
  const row = query.rows[0];
  if (!row) throw new Error("Invalid or disabled formKey");
  return {
    tenantId: row.organization_id,
    formKey: row.form_key,
    webhookUrl: s(row.webhook_url),
    calendarMode: row.calendar_mode,
    calendarIds: Array.isArray(row.calendar_ids) ? row.calendar_ids.map(s).filter(Boolean) : [],
  };
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
  if (existing?.id) {
    const existingRoles = record(existing.roles);
    const currentLocationIds = Array.isArray(existingRoles.locationIds)
      ? existingRoles.locationIds.map(s).filter(Boolean)
      : [];
    const mergedLocationIds = [...new Set([...currentLocationIds, ...locationIds])];
    await ghlRequest({
      path: `/users/${encodeURIComponent(s(existing.id))}`,
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
        permissions: { ...record(existing.permissions), ...permissions },
        roles: {
          ...existingRoles,
          type: "account",
          role: "user",
          locationIds: mergedLocationIds,
          restrictSubAccount: true,
        },
      },
    });
    return { userId: s(existing.id), status: "updated" as const };
  }

  const created = await ghlRequest({
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
      roles: {
        type: "account",
        role: "user",
        locationIds,
        restrictSubAccount: true,
      },
      scopes: ["contacts.write", "calendars.readonly", "calendars/events.write"],
      scopesAssignedToOnly: ["contacts.write", "calendars/events.write"],
      platformLanguage: "en_US",
    },
  });
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
  const results: JsonRecord[] = [];

  for (const calendar of calendars) {
    const id = s(calendar?.id);
    const type = s(calendar?.calendarType).toLowerCase();
    if (!id) continue;
    if (opts.config.calendarMode === "specific" && !configured.has(id)) continue;
    if (!TEAM_CALENDAR_TYPES.has(type)) {
      results.push({ calendarId: id, name: s(calendar?.name), status: "skipped", reason: `unsupported calendar type: ${type || "unknown"}` });
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
      results.push({ calendarId: id, name: s(calendar?.name), status: "unchanged", active: true, memberAdded: false });
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
      name: s(calendar?.name),
      status: "updated",
      active: true,
      memberAdded: !alreadyMember,
    });
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

export async function provisionStaffApplication(opts: {
  config: StaffFormConfig;
  input: StaffApplicationInput;
  selected: EligibleCounty[];
}) {
  const pool = getDbPool();
  const safePayload = {
    firstName: opts.input.firstName,
    lastName: opts.input.lastName,
    email: normalizeEmail(opts.input.email),
    phone: opts.input.phone,
    company: opts.input.company,
    counties: opts.selected.map(({ state, county, locationId }) => ({ state, county, locationId })),
  };
  const inserted = await pool.query<{ id: string }>(
    `insert into app.staff_applications (organization_id, email, status, request_payload)
     values ($1, $2, 'processing', $3::jsonb) returning id`,
    [opts.config.tenantId, safePayload.email, JSON.stringify(safePayload)],
  );
  const applicationId = inserted.rows[0].id;
  try {
    const user = await ensureStaffUser({
      config: opts.config,
      input: opts.input,
      locations: opts.selected,
    });
    const locations: JsonRecord[] = [];
    let warningCount = 0;
    for (const location of opts.selected) {
      try {
        const calendars = await updateLocationCalendars({ config: opts.config, location, userId: user.userId });
        const skipped = calendars.filter((item) => item.status === "skipped").length;
        warningCount += skipped;
        locations.push({ state: location.state, county: location.county, locationId: location.locationId, status: "completed", calendars });
      } catch (error) {
        warningCount += 1;
        locations.push({
          state: location.state,
          county: location.county,
          locationId: location.locationId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    let webhook: JsonRecord = { status: "disabled" };
    try {
      webhook = await sendWebhook(opts.config.webhookUrl, {
        ...safePayload,
        fullName: `${opts.input.firstName} ${opts.input.lastName}`.trim(),
        countyNames: opts.selected.map((item) => item.county).join(", "),
        totalCounties: opts.selected.length,
        applicationId,
        ghlUserId: user.userId,
        submittedAt: new Date().toISOString(),
      });
    } catch (error) {
      warningCount += 1;
      webhook = { status: "failed", error: error instanceof Error ? error.message : String(error) };
    }
    const result = { user, locations, webhook };
    const status = warningCount ? "completed_with_warnings" : "completed";
    await pool.query(
      `update app.staff_applications set status = $2, result = $3::jsonb, last_error = null where id = $1`,
      [applicationId, status, JSON.stringify(result)],
    );
    return { applicationId, status, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `update app.staff_applications set status = 'failed', last_error = $2 where id = $1`,
      [applicationId, message],
    );
    throw error;
  }
}
