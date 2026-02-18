import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type IntegrationRow = {
  id: string;
  provider: string;
  integrationKey: string;
  status: string;
  authType: string | null;
  externalAccountId: string | null;
  externalPropertyId: string | null;
  scopes: string[] | null;
  config: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomValueRow = {
  id: string;
  provider: string;
  scope: string;
  module: string;
  keyName: string;
  keyValue: string;
  valueType: string;
  isSecret: boolean;
  isActive: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
};

function toIntegrationMap(rows: IntegrationRow[]) {
  const out: Record<string, IntegrationRow> = {};
  for (const row of rows) {
    out[`${row.provider}:${row.integrationKey}`] = row;
  }
  return out;
}

function toCustomValuesMap(rows: CustomValueRow[]) {
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (!row.isActive) continue;
    const key = `${row.provider}.${row.scope}.${row.module}.${row.keyName}`;
    out[key] = row.keyValue;
  }
  return out;
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const pool = getDbPool();

  const orgQ = await pool.query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>(
    `
      select id, name, slug, status, created_at, updated_at
      from app.organizations
      where id = $1
      limit 1
    `,
    [tenantId],
  );

  const tenant = orgQ.rows[0];
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const settingsQ = await pool.query<{
    timezone: string | null;
    locale: string | null;
    currency: string | null;
    root_domain: string | null;
    ghl_company_id: string | null;
    owner_first_name: string | null;
    owner_last_name: string | null;
    owner_email: string | null;
    owner_phone: string | null;
    app_display_name: string | null;
    brand_name: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `
      select
        timezone,
        locale,
        currency,
        root_domain,
        ghl_company_id,
        owner_first_name,
        owner_last_name,
        owner_email,
        owner_phone,
        app_display_name,
        brand_name,
        created_at,
        updated_at
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [tenantId],
  );

  const integrationsQ = await pool.query<IntegrationRow>(
    `
      select
        id,
        provider,
        integration_key as "integrationKey",
        status,
        auth_type as "authType",
        external_account_id as "externalAccountId",
        external_property_id as "externalPropertyId",
        scopes,
        config,
        metadata,
        last_sync_at as "lastSyncAt",
        last_error as "lastError",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from app.organization_integrations
      where organization_id = $1
      order by provider asc, integration_key asc
    `,
    [tenantId],
  );

  const customValuesQ = await pool.query<CustomValueRow>(
    `
      select
        id,
        provider,
        scope,
        module,
        key_name as "keyName",
        key_value as "keyValue",
        value_type as "valueType",
        is_secret as "isSecret",
        is_active as "isActive",
        description,
        created_at as "createdAt",
        updated_at as "updatedAt"
      from app.organization_custom_values
      where organization_id = $1
      order by provider asc, scope asc, module asc, key_name asc
    `,
    [tenantId],
  );

  const stateFilesQ = await pool.query<{
    total: string;
    latest_generated_at: string | null;
    root_domains: string[] | null;
  }>(
    `
      select
        count(*)::text as total,
        max(generated_at) as latest_generated_at,
        array_remove(array_agg(distinct root_domain), null) as root_domains
      from app.organization_state_files
      where organization_id = $1
    `,
    [tenantId],
  );

  const owner = integrationsQ.rows.find(
    (r) => r.provider === "ghl" && r.integrationKey === "owner",
  );

  return NextResponse.json({
    ok: true,
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      createdAt: tenant.created_at,
      updatedAt: tenant.updated_at,
    },
    settings: settingsQ.rows[0] || null,
    integrations: {
      total: integrationsQ.rowCount ?? 0,
      ownerLocationId: owner?.externalAccountId || null,
      rows: integrationsQ.rows,
      map: toIntegrationMap(integrationsQ.rows),
    },
    customValues: {
      total: customValuesQ.rowCount ?? 0,
      active: customValuesQ.rows.filter((r) => r.isActive).length,
      rows: customValuesQ.rows,
      map: toCustomValuesMap(customValuesQ.rows),
    },
    stateFiles: {
      total: Number(stateFilesQ.rows[0]?.total || "0"),
      latestGeneratedAt: stateFilesQ.rows[0]?.latest_generated_at || null,
      rootDomains: stateFilesQ.rows[0]?.root_domains || [],
    },
    resolved: {
      timezone: settingsQ.rows[0]?.timezone || "UTC",
      locale: settingsQ.rows[0]?.locale || "en-US",
      currency: settingsQ.rows[0]?.currency || "USD",
      rootDomain: settingsQ.rows[0]?.root_domain || null,
      companyId: settingsQ.rows[0]?.ghl_company_id || null,
      ownerFirstName: settingsQ.rows[0]?.owner_first_name || null,
      ownerLastName: settingsQ.rows[0]?.owner_last_name || null,
      ownerEmail: settingsQ.rows[0]?.owner_email || null,
      ownerPhone: settingsQ.rows[0]?.owner_phone || null,
      appDisplayName: settingsQ.rows[0]?.app_display_name || tenant.name,
      brandName: settingsQ.rows[0]?.brand_name || tenant.name,
      ownerLocationId: owner?.externalAccountId || null,
    },
    generatedAt: new Date().toISOString(),
  });
}
