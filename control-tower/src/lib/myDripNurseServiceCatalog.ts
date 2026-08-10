import { getDbPool } from "@/lib/db";
import {
  MY_DRIP_NURSE_SERVICES,
  definitionForCalendar,
} from "@/lib/myDripNurseServices";
import {
  BOOKING_MINIMUM_NOTICE_MINUTES,
  enforceMinimumNoticeMinutes,
} from "@/lib/bookingPolicy";

export type ServiceEditorialStatus = "draft" | "review" | "approved" | "published" | "archived";
export type ServiceCalendarStatus = "draft" | "active" | "paused" | "archived";
export type ServiceDepositType = "percentage" | "fixed";

export type AdminService = {
  id: string;
  slug: string;
  name: string;
  shortDescription: string;
  fullDescription: string;
  ingredients: string[];
  benefits: string[];
  medicalDisclaimer: string;
  price: number;
  currency: string;
  depositType: ServiceDepositType;
  depositValue: number;
  imageUrl: string;
  imageAlt: string;
  imageTitle: string;
  landingPageUrl: string;
  surveyCtaUrl: string;
  editorialStatus: ServiceEditorialStatus;
  isActive: boolean;
  updatedAt: string;
  calendar: {
    id: string;
    publicKey: string;
    status: ServiceCalendarStatus;
    durationMinutes: number;
    slotIntervalMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    minimumNoticeMinutes: number;
    maximumAdvanceDays: number;
    dailyCapacity: number | null;
  };
};

export type AdminServiceInput = Omit<AdminService, "id" | "updatedAt" | "calendar"> & {
  calendar: Omit<AdminService["calendar"], "id" | "publicKey">;
};

type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  full_description: string;
  ingredients: string[] | null;
  benefits: string[] | null;
  medical_disclaimer: string;
  price: string;
  currency: string;
  deposit_type: ServiceDepositType;
  deposit_value: string;
  image_url: string;
  image_alt: string;
  image_title: string;
  landing_page_url: string;
  survey_cta_url: string;
  editorial_status: ServiceEditorialStatus;
  is_active: boolean;
  updated_at: string;
  calendar_id: string;
  calendar_public_key: string;
  calendar_status: ServiceCalendarStatus;
  duration_minutes: number;
  slot_interval_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  maximum_advance_days: number;
  daily_capacity: number | null;
};

type LegacyCalendarSetting = {
  display_name: string;
  normalized_name: string;
  price: string | null;
  deposit_type: ServiceDepositType;
  deposit_value: string | null;
  currency: string;
};

const SHEET_ID = "1KZ_L0lIhoc2LHp67C6oT_V1ZAd5nxxjIH9fARiNEo2E";

let serviceCatalogSchemaReady: Promise<void> | null = null;

export async function ensureServiceCatalogSchema() {
  if (serviceCatalogSchemaReady) return serviceCatalogSchemaReady;
  serviceCatalogSchemaReady = getDbPool().query(`
    create table if not exists app.services (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id) on delete cascade,
      slug text not null,
      name text not null,
      short_description text not null default '',
      full_description text not null default '',
      ingredients text[] not null default array[]::text[],
      benefits text[] not null default array[]::text[],
      medical_disclaimer text not null default '',
      price numeric(12,2) not null default 0,
      currency text not null default 'USD',
      deposit_type text not null default 'percentage',
      deposit_value numeric(12,2) not null default 35,
      image_url text not null default '',
      image_alt text not null default '',
      image_title text not null default '',
      landing_page_url text not null default '',
      survey_cta_url text not null default '',
      editorial_status text not null default 'draft',
      is_active boolean not null default true,
      source_metadata jsonb not null default '{}'::jsonb,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (organization_id, slug),
      check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      check (price >= 0),
      check (currency ~ '^[A-Z]{3}$'),
      check (deposit_type in ('percentage', 'fixed')),
      check (deposit_value >= 0),
      check (deposit_type <> 'percentage' or deposit_value <= 100),
      check (editorial_status in ('draft', 'review', 'approved', 'published', 'archived'))
    );
    alter table app.services alter column deposit_value set default 35;
    create index if not exists services_organization_status_idx
      on app.services (organization_id, is_active, editorial_status, name);

    create table if not exists app.service_calendars (
      id uuid primary key default gen_random_uuid(),
      service_id uuid not null unique references app.services(id) on delete cascade,
      public_key text not null unique,
      status text not null default 'draft',
      duration_minutes integer not null default 60,
      slot_interval_minutes integer not null default 30,
      buffer_before_minutes integer not null default 0,
      buffer_after_minutes integer not null default 30,
      minimum_notice_minutes integer not null default ${BOOKING_MINIMUM_NOTICE_MINUTES},
      maximum_advance_days integer not null default 60,
      daily_capacity integer,
      rules jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (public_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
      check (status in ('draft', 'active', 'paused', 'archived')),
      check (duration_minutes between 5 and 1440),
      check (slot_interval_minutes between 5 and 1440),
      check (buffer_before_minutes between 0 and 1440),
      check (buffer_after_minutes between 0 and 1440),
      check (minimum_notice_minutes between 0 and 525600),
      check (maximum_advance_days between 1 and 730),
      check (daily_capacity is null or daily_capacity > 0)
    );
    alter table app.service_calendars alter column minimum_notice_minutes set default ${BOOKING_MINIMUM_NOTICE_MINUTES};
    update app.service_calendars
       set minimum_notice_minutes = ${BOOKING_MINIMUM_NOTICE_MINUTES}, updated_at = now()
     where minimum_notice_minutes < ${BOOKING_MINIMUM_NOTICE_MINUTES};
    do $$
    begin
      if not exists (
        select 1
          from pg_constraint
         where conrelid = 'app.service_calendars'::regclass
           and conname = 'service_calendars_minimum_notice_two_hours_ck'
      ) then
        alter table app.service_calendars
          add constraint service_calendars_minimum_notice_two_hours_ck
          check (minimum_notice_minutes >= ${BOOKING_MINIMUM_NOTICE_MINUTES});
      end if;
    end $$;

    create table if not exists app.service_media (
      id uuid primary key default gen_random_uuid(),
      service_id uuid not null references app.services(id) on delete cascade,
      role text not null default 'hero',
      url text not null,
      mime_type text,
      width integer,
      height integer,
      alt_text text not null default '',
      title_text text not null default '',
      focal_point jsonb not null default '{"x":0.5,"y":0.5}'::jsonb,
      sort_order integer not null default 0,
      is_primary boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (role in ('hero', 'card', 'og', 'gallery')),
      check (width is null or width > 0),
      check (height is null or height > 0)
    );
    create unique index if not exists service_media_primary_role_uq
      on app.service_media (service_id, role) where is_primary = true;
    create index if not exists service_media_service_idx
      on app.service_media (service_id, role, sort_order);

    create table if not exists app.partner_service_suggestions (
      id uuid primary key default gen_random_uuid(),
      organization_id uuid not null references app.organizations(id) on delete cascade,
      partner_profile_id uuid not null references app.partner_profiles(id) on delete cascade,
      suggestion_type text not null default 'service',
      name text not null,
      ingredients text[] not null default array[]::text[],
      details text not null default '',
      status text not null default 'pending',
      admin_notes text not null default '',
      reviewed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      check (suggestion_type in ('service', 'recipe', 'other')),
      check (status in ('pending', 'reviewing', 'approved', 'declined'))
    );
    create index if not exists partner_service_suggestions_status_idx
      on app.partner_service_suggestions (organization_id, status, created_at desc);
  `).then(() => undefined).catch((error) => {
    serviceCatalogSchemaReady = null;
    throw error;
  });
  return serviceCatalogSchemaReady;
}

export type PartnerServiceSuggestion = {
  id: string;
  type: "service" | "recipe" | "other";
  name: string;
  ingredients: string[];
  details: string;
  status: "pending" | "reviewing" | "approved" | "declined";
  partnerName: string;
  partnerEmail: string;
  createdAt: string;
};

export async function listPartnerServiceSuggestions(): Promise<PartnerServiceSuggestion[]> {
  await ensureServiceCatalogSchema();
  const result = await getDbPool().query<{
    id: string; suggestion_type: PartnerServiceSuggestion["type"]; name: string; ingredients: string[] | null;
    details: string; status: PartnerServiceSuggestion["status"]; display_name: string; email: string; created_at: string;
  }>(
    `select suggestion.id, suggestion.suggestion_type, suggestion.name, suggestion.ingredients,
            suggestion.details, suggestion.status, profile.display_name, profile.email, suggestion.created_at::text
       from app.partner_service_suggestions suggestion
       join app.partner_profiles profile on profile.id = suggestion.partner_profile_id
      order by suggestion.created_at desc
      limit 200`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    type: row.suggestion_type,
    name: row.name,
    ingredients: row.ingredients || [],
    details: row.details,
    status: row.status,
    partnerName: row.display_name,
    partnerEmail: row.email,
    createdAt: row.created_at,
  }));
}

const SHEET_SERVICE_DATA: Record<string, { row: number; surveyPath: string }> = {
  hydration: { row: 2, surveyPath: "/hydrate-mobile-iv-therapy-survey-book-appointment" },
  "brain-storm": { row: 3, surveyPath: "/brain-storm-mobile-iv-therapy-survey-book-appointment" },
  alleviate: { row: 4, surveyPath: "/alleviate-mobile-iv-therapy-survey-book-appointment" },
  "recovery-performance": { row: 5, surveyPath: "/recovery-performance-mobile-iv-therapy-survey-book-appointment" },
  "myers-cocktail": { row: 6, surveyPath: "/myers-cocktail-mobile-iv-therapy-survey-book-appointment" },
  "myers-glutathione": { row: 7, surveyPath: "/myers-cockatil-and-glutathione-push-mobile-iv-therapy-survey-book-appointment" },
  "get-lean": { row: 8, surveyPath: "/get-lean-mobile-iv-therapy-survey-book-appointment" },
  "hangover-jet-lag": { row: 9, surveyPath: "/hangover-mobile-iv-therapy-survey-book-appointment" },
  "the-glow": { row: 10, surveyPath: "/the-glow-mobile-iv-therapy-survey-book-appointment" },
  "immunity-defense": { row: 11, surveyPath: "/immunity-defense-mobile-iv-therapy-survey-book-appointment" },
  "immunity-glutathione": { row: 12, surveyPath: "/immunity-defense-and-glutathione-push-mobile-iv-therapy-survey-book-appointment" },
  "nad-plus": { row: 13, surveyPath: "/nad-mobile-iv-therapy-survey-book-appointment" },
  "nad-boost": { row: 14, surveyPath: "/nad-boost-mobile-iv-therapy-survey-book-appointment" },
};

const SERVICE_SELECT = `
  select s.id, s.slug, s.name, s.short_description, s.full_description,
         s.ingredients, s.benefits, s.medical_disclaimer,
         s.price::text, s.currency, s.deposit_type, s.deposit_value::text,
         s.image_url, s.image_alt, s.image_title,
         s.landing_page_url, s.survey_cta_url,
         s.editorial_status, s.is_active, s.updated_at::text,
         c.id as calendar_id, c.public_key as calendar_public_key,
         c.status as calendar_status, c.duration_minutes,
         c.slot_interval_minutes, c.buffer_before_minutes,
         c.buffer_after_minutes, c.minimum_notice_minutes,
         c.maximum_advance_days, c.daily_capacity
    from app.services s
    join app.service_calendars c on c.service_id = s.id
`;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapService(row: ServiceRow): AdminService {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description,
    fullDescription: row.full_description,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    benefits: Array.isArray(row.benefits) ? row.benefits : [],
    medicalDisclaimer: row.medical_disclaimer,
    price: number(row.price),
    currency: row.currency,
    depositType: row.deposit_type,
    depositValue: number(row.deposit_value),
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    imageTitle: row.image_title,
    landingPageUrl: row.landing_page_url,
    surveyCtaUrl: row.survey_cta_url,
    editorialStatus: row.editorial_status,
    isActive: row.is_active,
    updatedAt: row.updated_at,
    calendar: {
      id: row.calendar_id,
      publicKey: row.calendar_public_key,
      status: row.calendar_status,
      durationMinutes: row.duration_minutes,
      slotIntervalMinutes: row.slot_interval_minutes,
      bufferBeforeMinutes: row.buffer_before_minutes,
      bufferAfterMinutes: row.buffer_after_minutes,
      minimumNoticeMinutes: row.minimum_notice_minutes,
      maximumAdvanceDays: row.maximum_advance_days,
      dailyCapacity: row.daily_capacity,
    },
  };
}

async function getMyDripNurseOrganizationId() {
  const result = await getDbPool().query<{ id: string }>(
    `select id
       from app.organizations
      where lower(slug) = 'my-drip-nurse'
         or lower(name) = 'my drip nurse'
      order by case when lower(slug) = 'my-drip-nurse' then 0 else 1 end
      limit 1`,
  );
  const organizationId = text(result.rows[0]?.id);
  if (!organizationId) throw new Error("The My Drip Nurse organization is not configured.");
  return organizationId;
}

async function loadLegacySettings(organizationId: string) {
  const pool = getDbPool();
  const exists = await pool.query<{ table_name: string | null }>(
    `select to_regclass('app.partner_calendar_services')::text as table_name`,
  );
  if (!exists.rows[0]?.table_name) return new Map<string, LegacyCalendarSetting>();
  const result = await pool.query<LegacyCalendarSetting>(
    `select display_name, normalized_name, price::text, deposit_type,
            deposit_value::text, currency
       from app.partner_calendar_services
      where organization_id = $1`,
    [organizationId],
  );
  const byServiceId = new Map<string, LegacyCalendarSetting>();
  for (const row of result.rows) {
    const definition = definitionForCalendar(row.display_name) || definitionForCalendar(row.normalized_name);
    if (!definition) continue;
    const current = byServiceId.get(definition.id);
    if (!current || (current.price === null && row.price !== null)) byServiceId.set(definition.id, row);
  }
  return byServiceId;
}

export async function seedMyDripNurseServices() {
  await ensureServiceCatalogSchema();
  const organizationId = await getMyDripNurseOrganizationId();
  const legacySettings = await loadLegacySettings(organizationId);
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const definition of MY_DRIP_NURSE_SERVICES) {
      const sheet = SHEET_SERVICE_DATA[definition.id];
      const legacy = legacySettings.get(definition.id);
      const landingPageUrl = `{{custom_values.business__county_domain}}${definition.landingPath}`;
      const surveyCtaUrl = sheet
        ? `{{custom_values.business__county_domain}}${sheet.surveyPath}`
        : "";
      const inserted = await client.query<{ id: string }>(
        `insert into app.services (
           organization_id, slug, name, short_description, ingredients,
           price, currency, deposit_type, deposit_value,
           image_url, image_alt, image_title,
           landing_page_url, survey_cta_url, source_metadata
         ) values (
           $1, $2, $3, $4, $5::text[],
           $6, $7, $8, $9,
           $10, $11, $12,
           $13, $14, $15::jsonb
         )
         on conflict (organization_id, slug) do update set
           name = excluded.name,
           short_description = excluded.short_description,
           ingredients = excluded.ingredients,
           deposit_type = 'percentage',
           deposit_value = 35,
           image_url = excluded.image_url,
           image_alt = excluded.image_alt,
           image_title = excluded.image_title,
           landing_page_url = excluded.landing_page_url,
           survey_cta_url = excluded.survey_cta_url,
           source_metadata = app.services.source_metadata || excluded.source_metadata,
           updated_at = now()
         returning id`,
        [
          organizationId,
          definition.id,
          definition.name,
          definition.description,
          definition.ingredients,
          number(legacy?.price),
          legacy?.currency || "USD",
          "percentage",
          35,
          definition.imageUrl,
          `${definition.name} mobile IV therapy`,
          `${definition.name} mobile IV therapy`,
          landingPageUrl,
          surveyCtaUrl,
          JSON.stringify({ googleSheetId: SHEET_ID, googleSheetRow: sheet?.row || null }),
        ],
      );
      const serviceId = inserted.rows[0]?.id || (await client.query<{ id: string }>(
        `select id from app.services where organization_id = $1 and slug = $2 limit 1`,
        [organizationId, definition.id],
      )).rows[0]?.id;
      if (!serviceId) throw new Error(`Could not seed the ${definition.name} service.`);
      await client.query(
        `insert into app.service_calendars (service_id, public_key)
         values ($1, $2)
         on conflict (service_id) do update set
           status = 'active',
           minimum_notice_minutes = ${BOOKING_MINIMUM_NOTICE_MINUTES},
           updated_at = now()`,
        [serviceId, `mdn-${definition.id}`],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function listAdminServices() {
  await seedMyDripNurseServices();
  const organizationId = await getMyDripNurseOrganizationId();
  const result = await getDbPool().query<ServiceRow>(
    `${SERVICE_SELECT}
      where s.organization_id = $1
      order by s.name asc`,
    [organizationId],
  );
  return result.rows.map(mapService);
}

export async function createAdminService(input: AdminServiceInput) {
  const organizationId = await getMyDripNurseOrganizationId();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const service = await client.query<{ id: string }>(
      `insert into app.services (
         organization_id, slug, name, short_description, full_description,
         ingredients, benefits, medical_disclaimer,
         price, currency, deposit_type, deposit_value,
         image_url, image_alt, image_title,
         landing_page_url, survey_cta_url, editorial_status, is_active
       ) values (
         $1, $2, $3, $4, $5,
         $6::text[], $7::text[], $8,
         $9, $10, $11, $12,
         $13, $14, $15,
         $16, $17, $18, $19
       ) returning id`,
      [
        organizationId, input.slug, input.name, input.shortDescription, input.fullDescription,
        input.ingredients, input.benefits, input.medicalDisclaimer,
        input.price, input.currency, input.depositType, input.depositValue,
        input.imageUrl, input.imageAlt, input.imageTitle,
        input.landingPageUrl, input.surveyCtaUrl, input.editorialStatus, input.isActive,
      ],
    );
    const serviceId = service.rows[0]?.id;
    if (!serviceId) throw new Error("The service could not be created.");
    await client.query(
      `insert into app.service_calendars (
         service_id, public_key, status, duration_minutes,
         slot_interval_minutes, buffer_before_minutes, buffer_after_minutes,
         minimum_notice_minutes, maximum_advance_days, daily_capacity
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        serviceId, `mdn-${input.slug}`, input.calendar.status, input.calendar.durationMinutes,
        input.calendar.slotIntervalMinutes, input.calendar.bufferBeforeMinutes,
        input.calendar.bufferAfterMinutes, enforceMinimumNoticeMinutes(input.calendar.minimumNoticeMinutes),
        input.calendar.maximumAdvanceDays, input.calendar.dailyCapacity,
      ],
    );
    await client.query("commit");
    return serviceId;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminService(serviceId: string, input: AdminServiceInput) {
  const organizationId = await getMyDripNurseOrganizationId();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    const updated = await client.query<{ id: string }>(
      `update app.services
          set slug = $3,
              name = $4,
              short_description = $5,
              full_description = $6,
              ingredients = $7::text[],
              benefits = $8::text[],
              medical_disclaimer = $9,
              price = $10,
              currency = $11,
              deposit_type = $12,
              deposit_value = $13,
              image_url = $14,
              image_alt = $15,
              image_title = $16,
              landing_page_url = $17,
              survey_cta_url = $18,
              editorial_status = $19,
              is_active = $20,
              published_at = case
                when $19 = 'published' and published_at is null then now()
                when $19 <> 'published' then null
                else published_at
              end
        where id = $1 and organization_id = $2
        returning id`,
      [
        serviceId, organizationId, input.slug, input.name, input.shortDescription,
        input.fullDescription, input.ingredients, input.benefits, input.medicalDisclaimer,
        input.price, input.currency, input.depositType, input.depositValue,
        input.imageUrl, input.imageAlt, input.imageTitle,
        input.landingPageUrl, input.surveyCtaUrl,
        input.editorialStatus, input.isActive,
      ],
    );
    if (!updated.rows[0]) throw new Error("Service not found.");
    await client.query(
      `update app.service_calendars
          set public_key = $2,
              status = $3,
              duration_minutes = $4,
              slot_interval_minutes = $5,
              buffer_before_minutes = $6,
              buffer_after_minutes = $7,
              minimum_notice_minutes = $8,
              maximum_advance_days = $9,
              daily_capacity = $10
        where service_id = $1`,
      [
        serviceId, `mdn-${input.slug}`, input.calendar.status,
        input.calendar.durationMinutes, input.calendar.slotIntervalMinutes,
        input.calendar.bufferBeforeMinutes, input.calendar.bufferAfterMinutes,
        enforceMinimumNoticeMinutes(input.calendar.minimumNoticeMinutes), input.calendar.maximumAdvanceDays,
        input.calendar.dailyCapacity,
      ],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
