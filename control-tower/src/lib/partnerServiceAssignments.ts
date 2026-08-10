import { getDbPool } from "@/lib/db";
import { ensureBookingEngineSchema } from "@/lib/bookingEngineSchema";
import { definitionForCalendar } from "@/lib/myDripNurseServices";
import { listAdminServices } from "@/lib/myDripNurseServiceCatalog";
import type { Pool, PoolClient } from "pg";

type ServiceArea = { state?: string; county?: string; locationId?: string };
type ProfileService = Record<string, unknown>;

type ProfileRow = {
  id: string;
  organization_id: string;
  services: ProfileService[] | null;
  service_areas: ServiceArea[] | null;
};

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  ingredients: string[] | null;
  image_url: string;
  image_alt: string;
  price: string;
  currency: string;
  deposit_type: "percentage" | "fixed";
  deposit_value: string;
  public_key: string;
  calendar_status: string;
  assignment_id: string | null;
  assignment_status: string | null;
  price_override: string | null;
  coverage_count: number | string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function profileForApplication(applicationId: string, client: Pool | PoolClient = getDbPool()) {
  await ensureBookingEngineSchema();
  const result = await client.query<ProfileRow>(
    `select id, organization_id, services, service_areas
       from app.partner_profiles
      where application_id = $1
      limit 1`,
    [applicationId],
  );
  const profile = result.rows[0];
  if (!profile) throw new Error("Complete the Partner profile before assigning services.");
  return profile;
}

async function catalogOrganizationForProfile(profile: ProfileRow, client: Pool | PoolClient) {
  const result = await client.query<{ id: string }>(
    `select id
       from app.organizations
      where lower(slug) = 'my-drip-nurse'
         or lower(name) = 'my drip nurse'
      order by case when lower(slug) = 'my-drip-nurse' then 0 else 1 end
      limit 1`,
  );
  return text(result.rows[0]?.id) || profile.organization_id;
}

async function syncProfileServiceAssignments(profile: ProfileRow, client: Pool | PoolClient) {
  const configured = Array.isArray(profile.services) ? profile.services : [];
  if (!configured.length) return;
  const catalogOrganizationId = await catalogOrganizationForProfile(profile, client);

  for (const profileService of configured) {
    if (["inactive", "disabled", "removed"].includes(text(profileService.status).toLowerCase())) continue;
    const definition = definitionForCalendar(text(profileService.name || profileService.normalizedName));
    const serviceSlug = definition?.id || normalize(profileService.normalizedName || profileService.name);
    if (!serviceSlug) continue;
    const serviceResult = await client.query<{ id: string; price: string; deposit_type: "percentage" | "fixed"; deposit_value: string; currency: string }>(
      `select id, price::text, deposit_type, deposit_value::text, currency
         from app.services
        where organization_id = $1 and slug = $2 and is_active = true
        limit 1`,
      [catalogOrganizationId, serviceSlug],
    );
    const service = serviceResult.rows[0];
    if (!service) continue;
    const priceOverride = numberOrNull(profileService.priceOverride);
    const assignment = await client.query<{ id: string }>(
      `insert into app.partner_service_assignments (
         organization_id, partner_profile_id, service_id, status,
         price_override, activated_at, metadata
       ) values ($1, $2, $3, 'active', $4, now(), '{"source":"profile_sync"}'::jsonb)
       on conflict (partner_profile_id, service_id) do update set
         status = 'active',
         price_override = coalesce(app.partner_service_assignments.price_override, excluded.price_override),
         activated_at = coalesce(app.partner_service_assignments.activated_at, now()),
         deactivated_at = null,
         updated_at = now()
       returning id`,
      [profile.organization_id, profile.id, service.id, priceOverride],
    );
    const assignmentId = assignment.rows[0]?.id;
    if (!assignmentId) continue;
    const coverage = await client.query<{ count: string }>(
      `select count(*)::text as count from app.partner_coverage_areas where assignment_id = $1`,
      [assignmentId],
    );
    if (Number(coverage.rows[0]?.count || 0) > 0) continue;
    for (const area of profile.service_areas || []) {
      const state = text(area.state);
      const county = text(area.county);
      if (!state || !county) continue;
      await client.query(
        `insert into app.partner_coverage_areas (assignment_id, state, county, metadata)
         values ($1, $2, $3, $4::jsonb)
         on conflict do nothing`,
        [assignmentId, state, county, JSON.stringify({ locationId: text(area.locationId), source: "profile_sync" })],
      );
    }
  }
}

async function serviceRows(profile: ProfileRow, client: Pool | PoolClient = getDbPool()) {
  const catalogOrganizationId = await catalogOrganizationForProfile(profile, client);
  const result = await client.query<ServiceRow>(
    `select s.id, s.slug, s.name, s.short_description, s.ingredients, s.image_url, s.image_alt, s.price::text, s.currency,
            s.deposit_type, s.deposit_value::text,
            c.public_key, c.status as calendar_status,
            a.id as assignment_id, a.status as assignment_status,
            a.price_override::text,
            coalesce((
              select count(*)::int
                from app.partner_coverage_areas area
               where area.assignment_id = a.id and area.status = 'active'
            ), 0) as coverage_count
       from app.services s
       join app.service_calendars c on c.service_id = s.id
       left join app.partner_service_assignments a
         on a.service_id = s.id and a.partner_profile_id = $2
      where s.organization_id = $1
        and s.is_active = true
      order by s.name`,
    [catalogOrganizationId, profile.id],
  );
  return result.rows;
}

function matrix(profile: ProfileRow, rows: ServiceRow[]) {
  const requestedLocationCount = Array.isArray(profile.service_areas) ? profile.service_areas.length : 0;
  const services = rows.map((row) => {
    const price = numberOrNull(row.price);
    const partnerPriceOverride = numberOrNull(row.price_override);
    const selected = row.assignment_status === "active";
    const coverageCount = Number(row.coverage_count || 0);
    return {
      normalizedName: row.slug,
      name: row.name,
      locationCount: requestedLocationCount,
      requestedLocationCount,
      availableEverywhere: true,
      activeLocationCount: selected ? coverageCount : 0,
      activeEverywhere: selected,
      activeSomewhere: selected,
      selected,
      price,
      partnerPriceOverride,
      effectivePrice: partnerPriceOverride ?? price,
      depositType: row.deposit_type,
      depositValue: numberOrNull(row.deposit_value),
      currency: row.currency,
      pricingConfigured: price !== null && numberOrNull(row.deposit_value) !== null,
      calendarStatus: row.calendar_status,
      publicKey: row.public_key,
      imageUrl: row.image_url,
      imageAlt: row.image_alt || row.name,
    };
  });
  return {
    services,
    provisioned: true,
    summary: {
      requestedLocationCount,
      scannedLocationCount: requestedLocationCount,
      failedLocationCount: 0,
      commonServiceCount: services.length,
    },
    scanErrors: [],
  };
}

export async function listPartnerServiceAssignments(applicationId: string) {
  const profile = await profileForApplication(applicationId);
  return matrix(profile, await serviceRows(profile));
}

export async function listPartnerPortalServices(applicationId: string) {
  const profile = await profileForApplication(applicationId);
  const client = await getDbPool().connect();
  try {
    await syncProfileServiceAssignments(profile, client);
  } finally {
    client.release();
  }
  const rows = await serviceRows(profile);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.short_description,
    ingredients: row.ingredients || [],
    price: numberOrNull(row.price),
    partnerPriceOverride: numberOrNull(row.price_override),
    effectivePrice: numberOrNull(row.price_override) ?? numberOrNull(row.price),
    currency: row.currency,
    depositType: row.deposit_type,
    depositValue: numberOrNull(row.deposit_value),
    imageUrl: row.image_url,
    publicKey: row.public_key,
    calendarStatus: row.calendar_status,
    active: row.assignment_status === "active",
  }));
}

export async function setPartnerPortalService(opts: { applicationId: string; serviceKey: string; active: boolean }) {
  return setPartnerServiceAssignment(opts);
}

export type PartnerAdminDirectoryItem = {
  id: string;
  applicationId: string;
  displayName: string;
  email: string;
  businessName: string;
  profilePhotoUrl: string;
  websiteStatus: string;
  activeServiceCount: number;
  coverageAreaCount: number;
  activatedAt: string;
};

export type AdminBookingCalendarDirectory = {
  serviceId: string;
  slug: string;
  name: string;
  shortDescription: string;
  imageUrl: string;
  imageAlt: string;
  price: number;
  currency: string;
  depositType: "percentage" | "fixed";
  depositValue: number;
  calendarId: string;
  publicKey: string;
  calendarStatus: string;
  durationMinutes: number;
  minimumNoticeMinutes: number;
  activePartnerCount: number;
  coverageAreaCount: number;
  partners: Array<{
    id: string;
    applicationId: string;
    displayName: string;
    businessName: string;
    profilePhotoUrl: string;
    websiteStatus: string;
    coverageAreaCount: number;
    priceOverride: number | null;
    activatedAt: string | null;
  }>;
};

/**
 * Returns the Admin-owned booking calendar directory.
 *
 * This intentionally reads the internal booking engine assignments instead of
 * discovering or inspecting any GHL calendars. The service catalog remains the
 * source of truth for price, deposit and calendar rules; assignments only tell
 * us which published Partner profiles can receive that service.
 */
export async function listAdminBookingCalendarDirectory(): Promise<AdminBookingCalendarDirectory[]> {
  await ensureBookingEngineSchema();
  const services = await listAdminServices();
  const result = await getDbPool().query<{
    service_id: string;
    partner_id: string;
    application_id: string;
    display_name: string;
    business_name: string | null;
    profile_photo_url: string | null;
    website_status: string;
    coverage_area_count: number | string;
    price_override: string | null;
    activated_at: string | null;
  }>(
    `select a.service_id,
            p.id as partner_id,
            p.application_id,
            p.display_name,
            p.business_name,
            p.profile_photo_url,
            p.website_status,
            count(distinct area.id) filter (where area.status = 'active')::int as coverage_area_count,
            a.price_override::text,
            a.activated_at::text
       from app.partner_service_assignments a
       join app.partner_profiles p on p.id = a.partner_profile_id
       left join app.partner_coverage_areas area on area.assignment_id = a.id
      where a.status = 'active'
        and p.website_status in ('ready', 'published')
      group by a.service_id, p.id, p.application_id, p.display_name,
               p.business_name, p.profile_photo_url, p.website_status,
               a.price_override, a.activated_at
      order by p.display_name asc`,
  );

  const partnersByService = new Map<string, AdminBookingCalendarDirectory["partners"]>();
  for (const row of result.rows) {
    const partners = partnersByService.get(row.service_id) || [];
    partners.push({
      id: row.partner_id,
      applicationId: row.application_id,
      displayName: row.display_name,
      businessName: text(row.business_name),
      profilePhotoUrl: text(row.profile_photo_url),
      websiteStatus: row.website_status,
      coverageAreaCount: Number(row.coverage_area_count || 0),
      priceOverride: numberOrNull(row.price_override),
      activatedAt: row.activated_at,
    });
    partnersByService.set(row.service_id, partners);
  }

  return services.map((service) => {
    const partners = partnersByService.get(service.id) || [];
    return {
      serviceId: service.id,
      slug: service.slug,
      name: service.name,
      shortDescription: service.shortDescription,
      imageUrl: service.imageUrl,
      imageAlt: service.imageAlt,
      price: service.price,
      currency: service.currency,
      depositType: service.depositType,
      depositValue: service.depositValue,
      calendarId: service.calendar.id,
      publicKey: service.calendar.publicKey,
      calendarStatus: service.calendar.status,
      durationMinutes: service.calendar.durationMinutes,
      minimumNoticeMinutes: service.calendar.minimumNoticeMinutes,
      activePartnerCount: partners.length,
      coverageAreaCount: partners.reduce((sum, partner) => sum + partner.coverageAreaCount, 0),
      partners,
    };
  });
}

export async function backfillPartnerServiceAssignments() {
  await ensureBookingEngineSchema();
  const pool = getDbPool();
  const profiles = await pool.query<ProfileRow & { created_at: string }>(
    `select id, organization_id, services, service_areas, created_at::text
       from app.partner_profiles`,
  );
  for (const profile of profiles.rows) {
    const configured = Array.isArray(profile.services) ? profile.services : [];
    for (const profileService of configured) {
      if (["inactive", "disabled", "removed"].includes(text(profileService.status).toLowerCase())) continue;
      const definition = definitionForCalendar(text(profileService.name || profileService.normalizedName));
      const serviceSlug = definition?.id || normalize(profileService.normalizedName || profileService.name);
      const service = await pool.query<{ id: string }>(
        `select id from app.services where organization_id = $1 and slug = $2 limit 1`,
        [profile.organization_id, serviceSlug],
      );
      const serviceId = service.rows[0]?.id;
      if (!serviceId) continue;
      const priceOverride = numberOrNull(profileService.priceOverride);
      const assignment = await pool.query<{ id: string }>(
        `insert into app.partner_service_assignments (
           organization_id, partner_profile_id, service_id, status,
           price_override, activated_at, metadata
         ) values ($1, $2, $3, 'active', $4, coalesce($5::timestamptz, now()), '{"source":"profile_backfill"}'::jsonb)
         on conflict (partner_profile_id, service_id) do update set
           price_override = coalesce(app.partner_service_assignments.price_override, excluded.price_override)
         returning id`,
        [profile.organization_id, profile.id, serviceId, priceOverride, profile.created_at],
      );
      const assignmentId = assignment.rows[0]?.id;
      if (!assignmentId) continue;
      const coverage = await pool.query<{ count: string }>(
        `select count(*)::text as count from app.partner_coverage_areas where assignment_id = $1`,
        [assignmentId],
      );
      if (Number(coverage.rows[0]?.count || 0) > 0) continue;
      for (const area of profile.service_areas || []) {
        const state = text(area.state);
        const county = text(area.county);
        if (!state || !county) continue;
        await pool.query(
          `insert into app.partner_coverage_areas (assignment_id, state, county, metadata)
           values ($1, $2, $3, $4::jsonb)
           on conflict do nothing`,
          [assignmentId, state, county, JSON.stringify({ locationId: text(area.locationId), source: "profile_backfill" })],
        );
      }
    }
  }
}

export async function listPartnerAdminDirectory(): Promise<PartnerAdminDirectoryItem[]> {
  await ensureBookingEngineSchema();
  await backfillPartnerServiceAssignments();
  const result = await getDbPool().query<{
    id: string;
    application_id: string;
    display_name: string;
    email: string;
    business_name: string | null;
    profile_photo_url: string | null;
    website_status: string;
    active_service_count: number | string;
    coverage_area_count: number | string;
    activated_at: string | null;
    created_at: string;
  }>(
    `select p.id, p.application_id, p.display_name, p.email,
            p.business_name, p.profile_photo_url, p.website_status,
            count(distinct a.id) filter (where a.status = 'active')::int as active_service_count,
            count(distinct area.id) filter (where a.status = 'active' and area.status = 'active')::int as coverage_area_count,
            max(a.activated_at)::text as activated_at,
            p.created_at::text
       from app.partner_profiles p
       left join app.partner_service_assignments a on a.partner_profile_id = p.id
       left join app.partner_coverage_areas area on area.assignment_id = a.id
      group by p.id
      order by p.display_name`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    applicationId: row.application_id,
    displayName: row.display_name,
    email: row.email,
    businessName: text(row.business_name),
    profilePhotoUrl: text(row.profile_photo_url),
    websiteStatus: row.website_status,
    activeServiceCount: Number(row.active_service_count || 0),
    coverageAreaCount: Number(row.coverage_area_count || 0),
    activatedAt: text(row.activated_at) || row.created_at,
  }));
}

export async function setPartnerServiceAssignment(opts: {
  applicationId: string;
  serviceKey: string;
  active: boolean;
}) {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const profile = await profileForApplication(opts.applicationId, client);
    const rows = await serviceRows(profile, client);
    const service = rows.find((row) => row.slug === opts.serviceKey || normalize(row.name) === normalize(opts.serviceKey));
    if (!service) throw new Error("Service not found in the Admin catalog.");
    if (opts.active && service.calendar_status !== "active") {
      throw new Error("Activate the service calendar in the Admin Services catalog before assigning it to a Partner.");
    }
    const assignment = await client.query<{ id: string }>(
      `insert into app.partner_service_assignments (
         organization_id, partner_profile_id, service_id, status, activated_at, deactivated_at
       ) values ($1, $2, $3, $4, case when $4 = 'active' then now() end, case when $4 <> 'active' then now() end)
       on conflict (partner_profile_id, service_id) do update set
         status = excluded.status,
         activated_at = case when excluded.status = 'active' then now() else app.partner_service_assignments.activated_at end,
         deactivated_at = case when excluded.status <> 'active' then now() else null end,
         updated_at = now()
       returning id`,
      [profile.organization_id, profile.id, service.id, opts.active ? "active" : "paused"],
    );
    const assignmentId = assignment.rows[0]?.id;
    if (!assignmentId) throw new Error("The service assignment could not be saved.");

    if (opts.active) {
      await client.query(`delete from app.partner_coverage_areas where assignment_id = $1`, [assignmentId]);
      for (const area of profile.service_areas || []) {
        const state = text(area.state);
        const county = text(area.county);
        if (!state || !county) continue;
        await client.query(
          `insert into app.partner_coverage_areas (assignment_id, state, county, metadata)
           values ($1, $2, $3, $4::jsonb)`,
          [assignmentId, state, county, JSON.stringify({ locationId: text(area.locationId) })],
        );
      }
    }

    const current = Array.isArray(profile.services) ? profile.services : [];
    const existing = current.find((item) => normalize(item.normalizedName || item.name) === normalize(service.slug));
    const next = current.filter((item) => normalize(item.normalizedName || item.name) !== normalize(service.slug));
    if (opts.active) {
      next.push({
        calendarId: service.public_key,
        name: service.name,
        normalizedName: service.slug,
        status: "active",
        price: numberOrNull(service.price),
        depositType: service.deposit_type,
        depositValue: numberOrNull(service.deposit_value),
        currency: service.currency,
        ...(existing && Object.prototype.hasOwnProperty.call(existing, "priceOverride")
          ? { priceOverride: existing.priceOverride }
          : {}),
      });
    }
    await client.query(
      `update app.partner_profiles set services = $2::jsonb, updated_at = now() where id = $1`,
      [profile.id, JSON.stringify(next)],
    );
    await client.query("commit");
    return matrix(profile, await serviceRows(profile));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function setPartnerServicePriceOverride(opts: {
  applicationId: string;
  serviceKey: string;
  priceOverride: number | null;
}) {
  if (opts.priceOverride !== null && (!Number.isFinite(opts.priceOverride) || opts.priceOverride < 0)) {
    throw new Error("Partner price must be zero or greater.");
  }
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const profile = await profileForApplication(opts.applicationId, client);
    const rows = await serviceRows(profile, client);
    const service = rows.find((row) => row.slug === opts.serviceKey || normalize(row.name) === normalize(opts.serviceKey));
    if (!service?.assignment_id || service.assignment_status !== "active") {
      throw new Error("Activate this service for the Partner before setting a custom price.");
    }
    await client.query(
      `update app.partner_service_assignments
          set price_override = $2, updated_at = now()
        where id = $1`,
      [service.assignment_id, opts.priceOverride],
    );
    const current = Array.isArray(profile.services) ? profile.services : [];
    const next = current.map((item) => {
      if (normalize(item.normalizedName || item.name) !== normalize(service.slug)) return item;
      const updated = { ...item };
      if (opts.priceOverride === null) delete updated.priceOverride;
      else updated.priceOverride = opts.priceOverride;
      return updated;
    });
    await client.query(
      `update app.partner_profiles set services = $2::jsonb, updated_at = now() where id = $1`,
      [profile.id, JSON.stringify(next)],
    );
    await client.query("commit");
    return matrix(profile, await serviceRows(profile));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
