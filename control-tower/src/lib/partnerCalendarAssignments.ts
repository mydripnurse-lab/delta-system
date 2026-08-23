import { getDbPool } from "@/lib/db";
import { definitionForCalendar } from "@/lib/myDripNurseServices";
import { getStaffApplication } from "@/lib/staffAdmin";
import {
  getStaffFormConfigForTenant,
  ensurePartnerPersonalCalendars,
  setPartnerPersonalCalendarStatus,
  listPartnerLocationCalendars,
  updatePartnerLocationCalendarMembership,
} from "@/lib/publicStaffProvisioning";
import type {
  EligibleCounty,
  PartnerLocationCalendar,
  StaffFormConfig,
} from "@/lib/publicStaffProvisioning";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function normalize(value: unknown) {
  return String(value ?? "").trim().normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, " ").toLowerCase();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

let schemaReady: Promise<void> | null = null;

export async function ensurePartnerCalendarSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = getDbPool().query(`
    create table if not exists app.partner_calendar_services (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id) on delete cascade,
      normalized_name text not null,
      display_name text not null,
      price numeric(12,2),
      deposit_type text not null default 'percentage',
      deposit_value numeric(12,2),
      currency text not null default 'USD',
      active_by_default boolean not null default false,
      last_seen_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, normalized_name),
      check (deposit_type in ('percentage', 'fixed'))
    );
    create table if not exists app.staff_application_calendar_selections (
      application_id uuid not null references app.staff_applications(id) on delete cascade,
      normalized_name text not null,
      display_name text not null,
      selected boolean not null default true,
      pricing_snapshot jsonb not null default '{}'::jsonb,
      updated_by uuid references app.users(id) on delete set null,
      updated_at timestamptz not null default now(),
      primary key (application_id, normalized_name)
    );
    create index if not exists partner_calendar_services_org_idx
      on app.partner_calendar_services (organization_id, display_name);
  `).then(() => undefined).catch((error) => {
    schemaReady = null;
    throw error;
  });
  return schemaReady;
}

type LocationScan = {
  location: EligibleCounty;
  calendars: PartnerLocationCalendar[];
  error: string | null;
};

async function scanLocations(config: StaffFormConfig, locations: EligibleCounty[]) {
  const scans: LocationScan[] = [];
  for (let index = 0; index < locations.length; index += 3) {
    const batch = locations.slice(index, index + 3);
    scans.push(...await Promise.all(batch.map(async (location): Promise<LocationScan> => {
      try {
        return { location, calendars: await listPartnerLocationCalendars({ config, location }), error: null };
      } catch (error) {
        return { location, calendars: [], error: error instanceof Error ? error.message : "Calendar scan failed." };
      }
    })));
  }
  return scans;
}

async function applicationContext(applicationId: string) {
  const application = await getStaffApplication(applicationId);
  if (!application) throw new Error("Application not found.");
  if (!application.locations.length) throw new Error("This application has no requested subaccounts.");
  const config = await getStaffFormConfigForTenant(application.organizationId);
  const locations = application.locations.map((location) => ({
    key: location.id,
    locationId: location.locationId,
    state: location.state,
    county: location.county,
    operational: !location.locationId.startsWith("catalog:"),
  }));
  return { application, config, locations };
}

async function buildApplicationMatrix(applicationId: string) {
  await ensurePartnerCalendarSchema();
  const { application, config, locations } = await applicationContext(applicationId);
  const scans = await scanLocations(config, locations);
  const userId = String(record(application.result.user).userId || "").trim();
  const services = new Map<string, {
    name: string;
    instances: Array<{ location: EligibleCounty; calendar: PartnerLocationCalendar }>;
    activeLocations: number;
    commerceKeys: Set<string>;
  }>();

  for (const scan of scans) {
    for (const calendar of scan.calendars) {
      const current = services.get(calendar.normalizedName) || {
        name: calendar.name,
        instances: [],
        activeLocations: 0,
        commerceKeys: new Set<string>(),
      };
      current.instances.push({ location: scan.location, calendar });
      if (userId && calendar.teamMembers.some((member) => String(member.userId || "").trim() === userId)) {
        current.activeLocations += 1;
      }
      Object.keys(calendar.commerceFields).forEach((key) => current.commerceKeys.add(key));
      services.set(calendar.normalizedName, current);
    }
  }

  const pool = getDbPool();
  for (const [normalizedName, service] of services) {
    await pool.query(
      `insert into app.partner_calendar_services (
         organization_id, normalized_name, display_name, last_seen_at
       ) values ($1, $2, $3, now())
       on conflict (organization_id, normalized_name) do update set
         display_name = excluded.display_name,
         last_seen_at = now(),
         updated_at = now()`,
      [application.organizationId, normalizedName, service.name],
    );
  }

  type ServiceSettingRow = {
      normalized_name: string;
      price: string | null;
      deposit_type: "percentage" | "fixed";
      deposit_value: string | null;
      currency: string;
      active_by_default: boolean;
  };
  const [settingsResult, selectionsResult, profileResult] = await Promise.all([
    pool.query<ServiceSettingRow>(`select normalized_name, price, deposit_type, deposit_value, currency, active_by_default
          from app.partner_calendar_services where organization_id = $1`, [application.organizationId]),
    pool.query<{ normalized_name: string; selected: boolean }>(
      `select normalized_name, selected from app.staff_application_calendar_selections where application_id = $1`,
      [applicationId],
    ),
    pool.query<{ services: Array<Record<string, unknown>> | null }>(
      `select services from app.partner_profiles where application_id = $1 limit 1`,
      [applicationId],
    ),
  ]);
  const settings = new Map<string, ServiceSettingRow>(settingsResult.rows.map((row) => [row.normalized_name, row]));
  const selections = new Map<string, boolean>(selectionsResult.rows.map((row) => [row.normalized_name, row.selected]));
  const profileServices = new Map<string, Record<string, unknown>>(
    (Array.isArray(profileResult.rows[0]?.services) ? profileResult.rows[0].services : []).map((service) => [
      normalize(service.normalizedName || service.name),
      service,
    ] as const),
  );
  const configuredNames = new Set(config.calendarNames.map(normalize));
  const availableLocationCount = scans.filter((scan) => !scan.error).length;

  const publicServices = Array.from(services.entries()).map(([normalizedName, service]) => {
    const setup = settings.get(normalizedName);
    const profileService = profileServices.get(normalizedName);
    const partnerPriceOverride = profileService
      && Object.prototype.hasOwnProperty.call(profileService, "priceOverride")
      ? numberOrNull(profileService.priceOverride)
      : null;
    const locationCount = service.instances.length;
    const selected = selections.has(normalizedName)
      ? selections.get(normalizedName) === true
      : setup?.active_by_default === true || configuredNames.has(normalizedName);
    return {
      normalizedName,
      name: service.name,
      locationCount,
      requestedLocationCount: locations.length,
      availableEverywhere: locationCount === locations.length && scans.every((scan) => !scan.error),
      activeLocationCount: service.activeLocations,
      activeEverywhere: Boolean(userId) && service.activeLocations === locations.length,
      activeSomewhere: service.activeLocations > 0,
      selected,
      price: numberOrNull(setup?.price),
      partnerPriceOverride,
      effectivePrice: partnerPriceOverride ?? numberOrNull(setup?.price),
      depositType: setup?.deposit_type || "percentage",
      depositValue: numberOrNull(setup?.deposit_value),
      currency: setup?.currency || "USD",
      pricingConfigured: setup?.price !== null && setup?.price !== undefined && setup?.deposit_value !== null && setup?.deposit_value !== undefined,
      commerceKeys: Array.from(service.commerceKeys).sort(),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  return {
    application,
    config,
    locations,
    scans,
    userId,
    serviceMap: services,
    services: publicServices,
    summary: {
      requestedLocationCount: locations.length,
      scannedLocationCount: availableLocationCount,
      failedLocationCount: scans.filter((scan) => scan.error).length,
      commonServiceCount: publicServices.filter((service) => service.availableEverywhere).length,
    },
  };
}

export async function listApplicationCalendarMatrix(applicationId: string) {
  const matrix = await buildApplicationMatrix(applicationId);
  return {
    services: matrix.services,
    summary: matrix.summary,
    provisioned: Boolean(matrix.userId),
    scanErrors: matrix.scans.filter((scan) => scan.error).map((scan) => ({
      locationId: scan.location.locationId,
      state: scan.location.state,
      county: scan.location.county,
      error: scan.error,
    })),
  };
}

export async function updateApplicationCalendarSelection(opts: {
  applicationId: string;
  normalizedName: string;
  active: boolean;
  updatedBy: string;
}) {
  const matrix = await buildApplicationMatrix(opts.applicationId);
  if (matrix.application.status === "deactivated") throw new Error("This staff account has been deactivated.");
  const service = matrix.services.find((item) => item.normalizedName === normalize(opts.normalizedName));
  const internal = matrix.serviceMap.get(normalize(opts.normalizedName));
  if (!service || !internal) throw new Error("Calendar service not found in the requested subaccounts.");
  if (opts.active && !service.availableEverywhere) {
    throw new Error("This service cannot be activated because it is not available in every requested subaccount.");
  }

  const pricingSnapshot = {
    price: service.price,
    depositType: service.depositType,
    depositValue: service.depositValue,
    currency: service.currency,
    capturedAt: new Date().toISOString(),
  };
  await getDbPool().query(
    `insert into app.staff_application_calendar_selections (
       application_id, normalized_name, display_name, selected, pricing_snapshot, updated_by, updated_at
     ) values ($1, $2, $3, $4, $5::jsonb, $6, now())
     on conflict (application_id, normalized_name) do update set
       display_name = excluded.display_name,
       selected = excluded.selected,
       pricing_snapshot = excluded.pricing_snapshot,
       updated_by = excluded.updated_by,
       updated_at = now()`,
    [opts.applicationId, service.normalizedName, service.name, opts.active, JSON.stringify(pricingSnapshot), opts.updatedBy],
  );

  const updates = [];
  let personalCalendarId = "";
  if (matrix.userId) {
    for (const instance of internal.instances) {
      updates.push(await updatePartnerLocationCalendarMembership({
        config: matrix.config,
        location: instance.location,
        calendar: instance.calendar,
        userId: matrix.userId,
        active: opts.active,
      }));
    }
    if (opts.active && matrix.application.partnerWebsite?.groupCalendarId) {
      const primaryLocation = matrix.locations.find(
        (location) => location.locationId === matrix.application.partnerWebsite?.primaryLocationId,
      ) || matrix.locations[0];
      await ensurePartnerPersonalCalendars({
        config: matrix.config,
        applicationId: opts.applicationId,
        location: primaryLocation,
        userId: matrix.userId,
        groupId: matrix.application.partnerWebsite.groupCalendarId,
        partnerSlug: matrix.application.partnerWebsite.slug,
        displayName: matrix.application.fullName,
      });
      const personal = await getDbPool().query<{ calendar_id: string }>(
        `select calendar_id from app.partner_personal_calendars
          where application_id = $1 and normalized_name = $2 and status = 'active'
          limit 1`,
        [opts.applicationId, service.normalizedName],
      );
      personalCalendarId = String(personal.rows[0]?.calendar_id || "");
    } else if (!opts.active && matrix.application.partnerWebsite?.primaryLocationId) {
      const personal = await getDbPool().query<{ calendar_id: string }>(
        `select calendar_id from app.partner_personal_calendars
          where application_id = $1 and normalized_name = $2
          limit 1`,
        [opts.applicationId, service.normalizedName],
      );
      const calendarId = String(personal.rows[0]?.calendar_id || "");
      const primaryLocation = matrix.locations.find(
        (location) => location.locationId === matrix.application.partnerWebsite?.primaryLocationId,
      );
      if (calendarId && primaryLocation) {
        await setPartnerPersonalCalendarStatus({
          config: matrix.config,
          location: primaryLocation,
          calendarId,
          active: false,
        });
        await getDbPool().query(
          `update app.partner_personal_calendars
              set status = 'inactive', updated_at = now()
            where application_id = $1 and normalized_name = $2`,
          [opts.applicationId, service.normalizedName],
        );
      }
    }
  }
  const profileResult = await getDbPool().query<{ services: Array<Record<string, unknown>> | null }>(
    `select services from app.partner_profiles where application_id = $1 limit 1`,
    [opts.applicationId],
  );
  if (profileResult.rows[0]) {
    const current = Array.isArray(profileResult.rows[0].services) ? profileResult.rows[0].services : [];
    const existingProfileService = current.find((item) => normalize(item.normalizedName || item.name) === service.normalizedName);
    const next = current.filter((item) => normalize(item.name) !== service.normalizedName);
    if (opts.active) {
      const primaryLocationId = matrix.application.partnerWebsite?.primaryLocationId || matrix.locations[0]?.locationId;
      const primaryInstance = internal.instances.find((instance) => instance.location.locationId === primaryLocationId) || internal.instances[0];
      next.push({
        calendarId: personalCalendarId || primaryInstance?.calendar.id || "",
        name: service.name,
        status: "active",
        normalizedName: service.normalizedName,
        price: service.price,
        depositType: service.depositType,
        depositValue: service.depositValue,
        currency: service.currency,
        ...(existingProfileService && Object.prototype.hasOwnProperty.call(existingProfileService, "priceOverride")
          ? { priceOverride: existingProfileService.priceOverride }
          : {}),
      });
    }
    await getDbPool().query(
      `update app.partner_profiles set services = $2::jsonb, updated_at = now() where application_id = $1`,
      [opts.applicationId, JSON.stringify(next)],
    );
  }
  return {
    selected: opts.active,
    appliedToGhl: Boolean(matrix.userId),
    updates,
    pricingSnapshot,
    matrix: await listApplicationCalendarMatrix(opts.applicationId),
  };
}

export async function updatePartnerServicePrice(opts: {
  applicationId: string;
  normalizedName: string;
  priceOverride: number | null;
}) {
  const matrix = await buildApplicationMatrix(opts.applicationId);
  if (!matrix.userId) throw new Error("Create the Partner staff account before setting a Partner-specific price.");
  const normalizedName = normalize(opts.normalizedName);
  const service = matrix.services.find((item) => item.normalizedName === normalizedName);
  if (!service) throw new Error("Calendar service not found in the requested subaccounts.");
  if (opts.priceOverride !== null && (!Number.isFinite(opts.priceOverride) || opts.priceOverride < 0)) {
    throw new Error("The Partner price must be zero or greater.");
  }

  const pool = getDbPool();
  const profileResult = await pool.query<{ services: Array<Record<string, unknown>> | null }>(
    `select services from app.partner_profiles where application_id = $1 limit 1`,
    [opts.applicationId],
  );
  if (!profileResult.rows[0]) throw new Error("The Partner website profile is not ready yet.");
  const current = Array.isArray(profileResult.rows[0].services) ? profileResult.rows[0].services : [];
  let matched = false;
  const next = current.map((item) => {
    if (normalize(item.normalizedName || item.name) !== normalizedName) return item;
    matched = true;
    const updated = { ...item };
    if (opts.priceOverride === null) delete updated.priceOverride;
    else updated.priceOverride = opts.priceOverride;
    return updated;
  });
  if (!matched) throw new Error("Activate this service for the Partner before setting its website price.");
  await pool.query(
    `update app.partner_profiles set services = $2::jsonb, updated_at = now() where application_id = $1`,
    [opts.applicationId, JSON.stringify(next)],
  );
  return {
    priceOverride: opts.priceOverride,
    matrix: await listApplicationCalendarMatrix(opts.applicationId),
  };
}

export async function savePartnerCalendarServiceSetup(opts: {
  organizationId: string;
  normalizedName: string;
  price: number | null;
  depositType: "percentage" | "fixed";
  depositValue: number | null;
  activeByDefault: boolean;
}) {
  await ensurePartnerCalendarSchema();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await client.query<{ display_name: string }>(
      `update app.partner_calendar_services
          set price = $3,
              deposit_type = $4,
              deposit_value = $5,
              active_by_default = $6,
              updated_at = now()
        where organization_id = $1 and normalized_name = $2
        returning display_name`,
      [opts.organizationId, normalize(opts.normalizedName), opts.price, opts.depositType, opts.depositValue, opts.activeByDefault],
    );
    const displayName = result.rows[0]?.display_name;
    if (!displayName) throw new Error("Sync this calendar service before saving its setup.");

    const definition = definitionForCalendar(displayName);
    if (definition) {
      const servicesTable = await client.query<{ table_name: string | null }>(
        `select to_regclass('app.services')::text as table_name`,
      );
      if (servicesTable.rows[0]?.table_name) {
        await client.query(
          `update app.services
              set price = coalesce($3, price),
                  deposit_type = 'percentage',
                  deposit_value = 40,
                  is_active = $4,
                  updated_at = now()
            where organization_id = $1 and slug = $2`,
          [opts.organizationId, definition.id, opts.price, opts.activeByDefault],
        );
      }
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
