import { getDbPool } from "@/lib/db";

export type ProspectLeadStatus = "new" | "validated" | "contacted" | "replied" | "disqualified";

export type ProspectLead = {
  id: string;
  businessName: string;
  website: string;
  email: string;
  phone: string;
  category: string;
  services: string;
  state: string;
  county: string;
  city: string;
  source: string;
  status: ProspectLeadStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  webhookSentAt?: string;
  webhookAttempts?: number;
  webhookLastError?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewedAt?: string;
  reviewedBy?: string;
  notificationCreatedAt?: string;
  notificationSeenAt?: string;
};

export type LeadStore = {
  leads: ProspectLead[];
  updatedAt: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toIsoOrEmpty(v: unknown) {
  const raw = s(v);
  if (!raw) return "";
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function normalizeLead(input: any): ProspectLead {
  return {
    id: s(input?.id),
    businessName: s(input?.businessName),
    website: s(input?.website),
    email: s(input?.email),
    phone: s(input?.phone),
    category: s(input?.category),
    services: s(input?.services),
    state: s(input?.state),
    county: s(input?.county),
    city: s(input?.city),
    source: s(input?.source),
    status: (s(input?.status) as ProspectLeadStatus) || "new",
    notes: s(input?.notes),
    createdAt: toIsoOrEmpty(input?.createdAt),
    updatedAt: toIsoOrEmpty(input?.updatedAt),
    webhookSentAt: toIsoOrEmpty(input?.webhookSentAt),
    webhookAttempts: Number(input?.webhookAttempts || 0) || 0,
    webhookLastError: s(input?.webhookLastError) || "",
    reviewStatus: (s(input?.reviewStatus) as "pending" | "approved" | "rejected") || "pending",
    reviewedAt: toIsoOrEmpty(input?.reviewedAt),
    reviewedBy: s(input?.reviewedBy) || "",
    notificationCreatedAt: toIsoOrEmpty(input?.notificationCreatedAt),
    notificationSeenAt: toIsoOrEmpty(input?.notificationSeenAt),
  };
}

let ensured = false;
async function ensureProspectingTables() {
  if (ensured) return;
  const pool = getDbPool();
  await pool.query(`
    create table if not exists app.prospecting_leads (
      organization_id uuid not null,
      lead_id text not null,
      business_name text not null default '',
      website text not null default '',
      email text not null default '',
      phone text not null default '',
      category text not null default '',
      services text not null default '',
      state text not null default '',
      county text not null default '',
      city text not null default '',
      source text not null default '',
      status text not null default 'new',
      notes text not null default '',
      webhook_sent_at timestamptz null,
      webhook_attempts int not null default 0,
      webhook_last_error text not null default '',
      review_status text not null default 'pending',
      reviewed_at timestamptz null,
      reviewed_by text not null default '',
      notification_created_at timestamptz not null default now(),
      notification_seen_at timestamptz null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (organization_id, lead_id)
    );
  `);
  await pool.query(`alter table app.prospecting_leads add column if not exists review_status text not null default 'pending'`);
  await pool.query(`alter table app.prospecting_leads add column if not exists reviewed_at timestamptz null`);
  await pool.query(`alter table app.prospecting_leads add column if not exists reviewed_by text not null default ''`);
  await pool.query(`alter table app.prospecting_leads add column if not exists notification_created_at timestamptz not null default now()`);
  await pool.query(`alter table app.prospecting_leads add column if not exists notification_seen_at timestamptz null`);
  await pool.query(`
    create table if not exists app.prospecting_geo_runs (
      organization_id uuid not null,
      geo_type text not null,
      geo_name text not null,
      last_run_at timestamptz not null default now(),
      last_status text not null default 'ok',
      discovered int not null default 0,
      created int not null default 0,
      updated int not null default 0,
      last_error text not null default '',
      primary key (organization_id, geo_type, geo_name)
    );
  `);
  ensured = true;
}

export async function readLeadStore(tenantId: string): Promise<LeadStore> {
  await ensureProspectingTables();
  const pool = getDbPool();
  const q = await pool.query<{
    lead_id: string;
    business_name: string;
    website: string;
    email: string;
    phone: string;
    category: string;
    services: string;
    state: string;
    county: string;
    city: string;
    source: string;
    status: string;
    notes: string;
    created_at: string;
    updated_at: string;
    webhook_sent_at: string | null;
    webhook_attempts: number;
    webhook_last_error: string | null;
    review_status: string;
    reviewed_at: string | null;
    reviewed_by: string | null;
    notification_created_at: string | null;
    notification_seen_at: string | null;
  }>(
    `
      select
        lead_id,
        business_name,
        website,
        email,
        phone,
        category,
        services,
        state,
        county,
        city,
        source,
        status,
        notes,
        created_at,
        updated_at,
        webhook_sent_at,
        webhook_attempts,
        webhook_last_error,
        review_status,
        reviewed_at,
        reviewed_by,
        notification_created_at,
        notification_seen_at
      from app.prospecting_leads
      where organization_id = $1::uuid
      order by updated_at desc
    `,
    [tenantId],
  );
  const leads = q.rows.map((r) =>
    normalizeLead({
      id: r.lead_id,
      businessName: r.business_name,
      website: r.website,
      email: r.email,
      phone: r.phone,
      category: r.category,
      services: r.services,
      state: r.state,
      county: r.county,
      city: r.city,
      source: r.source,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      webhookSentAt: r.webhook_sent_at || "",
      webhookAttempts: r.webhook_attempts || 0,
      webhookLastError: r.webhook_last_error || "",
      reviewStatus: (s(r.review_status) as "pending" | "approved" | "rejected") || "pending",
      reviewedAt: s(r.reviewed_at) || "",
      reviewedBy: s(r.reviewed_by) || "",
      notificationCreatedAt: s(r.notification_created_at) || "",
      notificationSeenAt: s(r.notification_seen_at) || "",
    }),
  );
  return {
    leads,
    updatedAt: leads[0]?.updatedAt || new Date().toISOString(),
  };
}

export async function writeLeadStore(tenantId: string, store: LeadStore) {
  await ensureProspectingTables();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`delete from app.prospecting_leads where organization_id = $1::uuid`, [tenantId]);
    for (const lead of store.leads) {
      const row = normalizeLead(lead);
      await client.query(
        `
          insert into app.prospecting_leads (
            organization_id, lead_id, business_name, website, email, phone, category, services,
            state, county, city, source, status, notes, webhook_sent_at, webhook_attempts,
            webhook_last_error, review_status, reviewed_at, reviewed_by, notification_created_at, notification_seen_at, created_at, updated_at
          ) values (
            $1::uuid, $2, $3, $4, $5, $6, $7, $8,
            $9, $10, $11, $12, $13, $14, nullif($15,'')::timestamptz, $16,
            $17, $18, nullif($19,'')::timestamptz, $20, coalesce(nullif($21,'')::timestamptz, now()),
            nullif($22,'')::timestamptz, coalesce(nullif($23,'')::timestamptz, now()), coalesce(nullif($24,'')::timestamptz, now())
          )
        `,
        [
          tenantId,
          row.id,
          row.businessName,
          row.website,
          row.email,
          row.phone,
          row.category,
          row.services,
          row.state,
          row.county,
          row.city,
          row.source,
          row.status,
          row.notes,
          row.webhookSentAt || "",
          row.webhookAttempts || 0,
          row.webhookLastError || "",
          row.reviewStatus || "pending",
          row.reviewedAt || "",
          row.reviewedBy || "",
          row.notificationCreatedAt || "",
          row.notificationSeenAt || "",
          row.createdAt || "",
          row.updatedAt || "",
        ],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}

export function upsertLeadRows(existing: ProspectLead[], rows: ProspectLead[]) {
  const out = [...existing];
  for (const row of rows) {
    const idx = out.findIndex((x) => x.id === row.id);
    if (idx >= 0) {
      out[idx] = {
        ...out[idx],
        ...row,
        createdAt: out[idx].createdAt || row.createdAt,
        reviewStatus: row.reviewStatus || out[idx].reviewStatus || "pending",
        reviewedAt: row.reviewedAt || out[idx].reviewedAt || "",
        reviewedBy: row.reviewedBy || out[idx].reviewedBy || "",
        notificationCreatedAt: out[idx].notificationCreatedAt || row.notificationCreatedAt || "",
        notificationSeenAt: out[idx].notificationSeenAt || row.notificationSeenAt || "",
      };
    } else {
      out.push(row);
    }
  }
  return out;
}

export async function reviewLead(
  tenantId: string,
  leadId: string,
  decision: "pending" | "approved" | "rejected",
  reviewer?: string,
) {
  await ensureProspectingTables();
  const pool = getDbPool();
  await pool.query(
    `
      update app.prospecting_leads
      set
        review_status = $3::text,
        reviewed_at = now(),
        reviewed_by = $4::text,
        updated_at = now()
      where organization_id = $1::uuid
        and lead_id = $2::text
    `,
    [tenantId, leadId, decision, s(reviewer)],
  );
}

export async function markLeadNotificationsSeen(tenantId: string, leadIds: string[]) {
  await ensureProspectingTables();
  const ids = Array.from(new Set(leadIds.map((x) => s(x)).filter(Boolean)));
  if (!ids.length) return;
  const pool = getDbPool();
  await pool.query(
    `
      update app.prospecting_leads
      set
        notification_seen_at = now(),
        updated_at = now()
      where organization_id = $1::uuid
        and lead_id = any($2::text[])
    `,
    [tenantId, ids],
  );
}

export async function markLeadsWebhookResult(
  tenantId: string,
  leadIds: string[],
  input: { sentAt?: string; attemptsDelta?: number; error?: string },
) {
  await ensureProspectingTables();
  const ids = Array.from(new Set(leadIds.map((x) => s(x)).filter(Boolean)));
  if (!ids.length) return;
  const pool = getDbPool();
  await pool.query(
    `
      update app.prospecting_leads
      set
        webhook_sent_at = coalesce($3::timestamptz, webhook_sent_at),
        webhook_attempts = webhook_attempts + $4::int,
        webhook_last_error = $5::text,
        updated_at = now()
      where organization_id = $1::uuid
        and lead_id = any($2::text[])
    `,
    [tenantId, ids, s(input.sentAt) || null, Number(input.attemptsDelta || 0) || 0, s(input.error)],
  );
}

export async function recordGeoRun(input: {
  tenantId: string;
  geoType: string;
  geoName: string;
  status: string;
  discovered: number;
  created: number;
  updated: number;
  error?: string;
}) {
  await ensureProspectingTables();
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.prospecting_geo_runs (
        organization_id, geo_type, geo_name, last_run_at, last_status, discovered, created, updated, last_error
      ) values ($1::uuid, $2, $3, now(), $4, $5, $6, $7, $8)
      on conflict (organization_id, geo_type, geo_name)
      do update set
        last_run_at = excluded.last_run_at,
        last_status = excluded.last_status,
        discovered = excluded.discovered,
        created = excluded.created,
        updated = excluded.updated,
        last_error = excluded.last_error
    `,
    [
      input.tenantId,
      s(input.geoType),
      s(input.geoName),
      s(input.status) || "ok",
      Number(input.discovered || 0),
      Number(input.created || 0),
      Number(input.updated || 0),
      s(input.error),
    ],
  );
}

export async function listGeoRuns(tenantId: string) {
  await ensureProspectingTables();
  const pool = getDbPool();
  const q = await pool.query<{
    geo_type: string;
    geo_name: string;
    last_run_at: string;
    last_status: string;
  }>(
    `
      select geo_type, geo_name, last_run_at, last_status
      from app.prospecting_geo_runs
      where organization_id = $1::uuid
    `,
    [tenantId],
  );
  return q.rows.map((r) => ({
    geoType: s(r.geo_type),
    geoName: s(r.geo_name),
    lastRunAt: s(r.last_run_at),
    lastStatus: s(r.last_status),
  }));
}

export type PartnerAdminProspect = {
  placeId: string;
  businessName: string;
  formattedAddress: string;
  city: string;
  county: string;
  state: string;
  website: string;
  email: string;
  phone: string;
  googleMapsUrl: string;
  category: string;
  types: string[];
  rating: number | null;
  userRatingCount: number;
  businessStatus: string;
  serviceAreaBusiness: boolean;
  fitScore: number;
  fitLabel: string;
  fitReasons: string[];
  discoveredAt: string;
  lastRefreshedAt: string;
  googleDetailsExpireAt: string;
  stale: boolean;
};

export type PartnerAdminProspectRun = {
  id: string;
  county: string;
  state: string;
  queries: string[];
  discovered: number;
  saved: number;
  newProspects: number;
  status: string;
  error: string;
  createdAt: string;
};

let partnerAdminProspectingEnsured = false;

async function ensurePartnerAdminProspectingTables() {
  if (partnerAdminProspectingEnsured) return;
  const pool = getDbPool();
  await pool.query(`
    create table if not exists app.partner_admin_prospects (
      organization_id uuid not null,
      place_id text not null,
      business_name text not null default '',
      formatted_address text not null default '',
      city text not null default '',
      county text not null default '',
      state text not null default '',
      website text not null default '',
      public_email text not null default '',
      phone text not null default '',
      google_maps_url text not null default '',
      category text not null default '',
      place_types jsonb not null default '[]'::jsonb,
      rating numeric null,
      user_rating_count int not null default 0,
      business_status text not null default '',
      service_area_business boolean not null default false,
      fit_score int not null default 0,
      fit_label text not null default '',
      fit_reasons jsonb not null default '[]'::jsonb,
      discovered_at timestamptz not null default now(),
      last_refreshed_at timestamptz not null default now(),
      google_details_expire_at timestamptz not null default (now() + interval '30 days'),
      updated_at timestamptz not null default now(),
      primary key (organization_id, place_id)
    )
  `);
  await pool.query(`
    create index if not exists partner_admin_prospects_market_idx
      on app.partner_admin_prospects (organization_id, lower(state), lower(county), fit_score desc)
  `);
  await pool.query(`
    create table if not exists app.partner_admin_prospect_runs (
      organization_id uuid not null,
      run_id text not null,
      county text not null default '',
      state text not null default '',
      queries jsonb not null default '[]'::jsonb,
      discovered int not null default 0,
      saved int not null default 0,
      new_prospects int not null default 0,
      status text not null default 'ok',
      last_error text not null default '',
      created_at timestamptz not null default now(),
      primary key (organization_id, run_id)
    )
  `);
  await pool.query(`
    create index if not exists partner_admin_prospect_runs_market_idx
      on app.partner_admin_prospect_runs (organization_id, lower(state), lower(county), created_at desc)
  `);
  partnerAdminProspectingEnsured = true;
}

function jsonStrings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => s(entry)).filter(Boolean);
}

function mapPartnerAdminProspect(row: Record<string, unknown>): PartnerAdminProspect {
  const expiresAt = toIsoOrEmpty(row.google_details_expire_at);
  return {
    placeId: s(row.place_id),
    businessName: s(row.business_name),
    formattedAddress: s(row.formatted_address),
    city: s(row.city),
    county: s(row.county),
    state: s(row.state),
    website: s(row.website),
    email: s(row.public_email),
    phone: s(row.phone),
    googleMapsUrl: s(row.google_maps_url),
    category: s(row.category),
    types: jsonStrings(row.place_types),
    rating: row.rating == null ? null : Number(row.rating),
    userRatingCount: Number(row.user_rating_count || 0),
    businessStatus: s(row.business_status),
    serviceAreaBusiness: Boolean(row.service_area_business),
    fitScore: Number(row.fit_score || 0),
    fitLabel: s(row.fit_label),
    fitReasons: jsonStrings(row.fit_reasons),
    discoveredAt: toIsoOrEmpty(row.discovered_at),
    lastRefreshedAt: toIsoOrEmpty(row.last_refreshed_at),
    googleDetailsExpireAt: expiresAt,
    stale: !expiresAt || Date.parse(expiresAt) <= Date.now(),
  };
}

export async function listPartnerAdminProspects(input: {
  organizationId: string;
  county: string;
  state: string;
  limit?: number;
}) {
  await ensurePartnerAdminProspectingTables();
  const result = await getDbPool().query<Record<string, unknown>>(
    `
      select *
      from app.partner_admin_prospects
      where organization_id = $1::uuid
        and lower(county) = lower($2)
        and lower(state) = lower($3)
      order by fit_score desc, user_rating_count desc, business_name asc
      limit $4
    `,
    [input.organizationId, s(input.county), s(input.state), Math.min(100, Math.max(1, Number(input.limit || 10)))],
  );
  return result.rows.map(mapPartnerAdminProspect);
}

export async function countPartnerAdminProspects(input: { organizationId: string; county: string; state: string }) {
  await ensurePartnerAdminProspectingTables();
  const result = await getDbPool().query<{ total: string }>(
    `select count(*)::text as total
       from app.partner_admin_prospects
      where organization_id = $1::uuid and lower(county) = lower($2) and lower(state) = lower($3)`,
    [input.organizationId, s(input.county), s(input.state)],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function countPartnerAdminProspectRuns(input: { organizationId: string; county: string; state: string }) {
  await ensurePartnerAdminProspectingTables();
  const result = await getDbPool().query<{ total: string }>(
    `select count(*)::text as total
       from app.partner_admin_prospect_runs
      where organization_id = $1::uuid and lower(county) = lower($2) and lower(state) = lower($3)`,
    [input.organizationId, s(input.county), s(input.state)],
  );
  return Number(result.rows[0]?.total || 0);
}

export async function getLatestPartnerAdminProspectRun(input: { organizationId: string; county: string; state: string }) {
  await ensurePartnerAdminProspectingTables();
  const result = await getDbPool().query<Record<string, unknown>>(
    `select * from app.partner_admin_prospect_runs
      where organization_id = $1::uuid and lower(county) = lower($2) and lower(state) = lower($3)
      order by created_at desc limit 1`,
    [input.organizationId, s(input.county), s(input.state)],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: s(row.run_id), county: s(row.county), state: s(row.state), queries: jsonStrings(row.queries),
    discovered: Number(row.discovered || 0), saved: Number(row.saved || 0), newProspects: Number(row.new_prospects || 0),
    status: s(row.status), error: s(row.last_error), createdAt: toIsoOrEmpty(row.created_at),
  } satisfies PartnerAdminProspectRun;
}

export async function savePartnerAdminProspectingRun(input: {
  organizationId: string;
  run: PartnerAdminProspectRun;
  prospects: PartnerAdminProspect[];
}) {
  await ensurePartnerAdminProspectingTables();
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    for (const prospect of input.prospects) {
      await client.query(
        `
          insert into app.partner_admin_prospects (
            organization_id, place_id, business_name, formatted_address, city, county, state,
            website, public_email, phone, google_maps_url, category, place_types, rating,
            user_rating_count, business_status, service_area_business, fit_score, fit_label,
            fit_reasons, discovered_at, last_refreshed_at, google_details_expire_at, updated_at
          ) values (
            $1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,
            $20::jsonb,coalesce(nullif($21,'')::timestamptz,now()),now(),now() + interval '30 days',now()
          )
          on conflict (organization_id, place_id) do update set
            business_name = excluded.business_name,
            formatted_address = excluded.formatted_address,
            city = excluded.city,
            county = excluded.county,
            state = excluded.state,
            website = excluded.website,
            public_email = case when excluded.public_email <> '' then excluded.public_email else app.partner_admin_prospects.public_email end,
            phone = excluded.phone,
            google_maps_url = excluded.google_maps_url,
            category = excluded.category,
            place_types = excluded.place_types,
            rating = excluded.rating,
            user_rating_count = excluded.user_rating_count,
            business_status = excluded.business_status,
            service_area_business = excluded.service_area_business,
            fit_score = excluded.fit_score,
            fit_label = excluded.fit_label,
            fit_reasons = excluded.fit_reasons,
            last_refreshed_at = now(),
            google_details_expire_at = now() + interval '30 days',
            updated_at = now()
        `,
        [
          input.organizationId, prospect.placeId, prospect.businessName, prospect.formattedAddress,
          prospect.city, prospect.county, prospect.state, prospect.website, prospect.email,
          prospect.phone, prospect.googleMapsUrl, prospect.category, JSON.stringify(prospect.types),
          prospect.rating, prospect.userRatingCount, prospect.businessStatus, prospect.serviceAreaBusiness,
          prospect.fitScore, prospect.fitLabel, JSON.stringify(prospect.fitReasons), prospect.discoveredAt,
        ],
      );
    }
    await client.query(
      `insert into app.partner_admin_prospect_runs (
         organization_id, run_id, county, state, queries, discovered, saved, new_prospects, status, last_error, created_at
       ) values ($1::uuid,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,coalesce(nullif($11,'')::timestamptz,now()))`,
      [input.organizationId, input.run.id, input.run.county, input.run.state, JSON.stringify(input.run.queries),
        input.run.discovered, input.run.saved, input.run.newProspects, input.run.status, input.run.error, input.run.createdAt],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
