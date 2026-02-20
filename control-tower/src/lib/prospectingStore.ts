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
    createdAt: s(input?.createdAt),
    updatedAt: s(input?.updatedAt),
    webhookSentAt: s(input?.webhookSentAt) || "",
    webhookAttempts: Number(input?.webhookAttempts || 0) || 0,
    webhookLastError: s(input?.webhookLastError) || "",
    reviewStatus: (s(input?.reviewStatus) as "pending" | "approved" | "rejected") || "pending",
    reviewedAt: s(input?.reviewedAt) || "",
    reviewedBy: s(input?.reviewedBy) || "",
    notificationCreatedAt: s(input?.notificationCreatedAt) || "",
    notificationSeenAt: s(input?.notificationSeenAt) || "",
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
