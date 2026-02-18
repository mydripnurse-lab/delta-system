import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function jsonb(v: unknown) {
  if (v && typeof v === "object") return JSON.stringify(v);
  return "{}";
}

type Ctx = { params: Promise<{ id: string }> };

type IntegrationInput = {
  id?: string;
  provider?: string;
  integrationKey?: string;
  status?: "connected" | "disconnected" | "error";
  authType?: string;
  externalAccountId?: string;
  externalPropertyId?: string;
  scopes?: string[];
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastError?: string;
};

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const provider = s(searchParams.get("provider"));
  const integrationKey = s(searchParams.get("integrationKey"));

  const where: string[] = [`organization_id = $1`];
  const vals: unknown[] = [tenantId];
  if (provider) {
    vals.push(provider);
    where.push(`provider = $${vals.length}`);
  }
  if (integrationKey) {
    vals.push(integrationKey);
    where.push(`integration_key = $${vals.length}`);
  }

  const pool = getDbPool();
  const q = await pool.query(
    `
      select
        id,
        organization_id as "organizationId",
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
      where ${where.join(" and ")}
      order by provider asc, integration_key asc
    `,
    vals,
  );
  return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as IntegrationInput | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const provider = s(body.provider);
  const integrationKey = s(body.integrationKey);
  if (!provider || !integrationKey) {
    return NextResponse.json(
      { ok: false, error: "provider and integrationKey are required" },
      { status: 400 },
    );
  }

  const status = s(body.status) || "connected";
  const authType = s(body.authType) || "api_key";
  const externalAccountId = s(body.externalAccountId) || null;
  const externalPropertyId = s(body.externalPropertyId) || null;
  const scopes = Array.isArray(body.scopes) ? body.scopes.map((x) => s(x)).filter(Boolean) : [];
  const config = jsonb(body.config || {});
  const metadata = jsonb(body.metadata || {});
  const lastError = s(body.lastError) || null;

  const pool = getDbPool();
  const q = await pool.query<{ id: string }>(
    `
      insert into app.organization_integrations (
        organization_id,
        provider,
        integration_key,
        status,
        auth_type,
        external_account_id,
        external_property_id,
        scopes,
        config,
        metadata,
        last_error
      )
      values ($1,$2,$3,$4,$5,$6,$7,$8::text[],$9::jsonb,$10::jsonb,$11)
      on conflict (organization_id, provider, integration_key)
      do update
        set
          status = excluded.status,
          auth_type = excluded.auth_type,
          external_account_id = excluded.external_account_id,
          external_property_id = excluded.external_property_id,
          scopes = excluded.scopes,
          config = excluded.config,
          metadata = excluded.metadata,
          last_error = excluded.last_error,
          updated_at = now()
      returning id
    `,
    [
      tenantId,
      provider,
      integrationKey,
      status,
      authType,
      externalAccountId,
      externalPropertyId,
      scopes,
      config,
      metadata,
      lastError,
    ],
  );

  return NextResponse.json({
    ok: true,
    integrationId: q.rows[0]?.id || null,
    provider,
    integrationKey,
    status,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as IntegrationInput | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const integrationId = s(body.id);
  const provider = s(body.provider);
  const integrationKey = s(body.integrationKey);

  if (!integrationId && !(provider && integrationKey)) {
    return NextResponse.json(
      { ok: false, error: "id or provider+integrationKey is required" },
      { status: 400 },
    );
  }

  const status = s(body.status);
  const authType = s(body.authType);
  const externalAccountId = s(body.externalAccountId);
  const externalPropertyId = s(body.externalPropertyId);
  const scopes = Array.isArray(body.scopes) ? body.scopes.map((x) => s(x)).filter(Boolean) : null;
  const config = body.config && typeof body.config === "object" ? JSON.stringify(body.config) : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? JSON.stringify(body.metadata) : null;
  const lastError = s(body.lastError);

  const set: string[] = [];
  const vals: unknown[] = [];

  if (status) {
    vals.push(status);
    set.push(`status = $${vals.length}`);
  }
  if (authType) {
    vals.push(authType);
    set.push(`auth_type = $${vals.length}`);
  }
  if (externalAccountId || externalAccountId === "") {
    vals.push(externalAccountId || null);
    set.push(`external_account_id = $${vals.length}`);
  }
  if (externalPropertyId || externalPropertyId === "") {
    vals.push(externalPropertyId || null);
    set.push(`external_property_id = $${vals.length}`);
  }
  if (scopes) {
    vals.push(scopes);
    set.push(`scopes = $${vals.length}::text[]`);
  }
  if (config) {
    vals.push(config);
    set.push(`config = $${vals.length}::jsonb`);
  }
  if (metadata) {
    vals.push(metadata);
    set.push(`metadata = $${vals.length}::jsonb`);
  }
  if (lastError || lastError === "") {
    vals.push(lastError || null);
    set.push(`last_error = $${vals.length}`);
  }

  if (set.length === 0) {
    return NextResponse.json({ ok: false, error: "No fields to update" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let whereSql = "";
    if (integrationId) {
      vals.push(tenantId);
      vals.push(integrationId);
      whereSql = `organization_id = $${vals.length - 1} and id = $${vals.length}`;
    } else {
      vals.push(tenantId);
      vals.push(provider);
      vals.push(integrationKey);
      whereSql = `organization_id = $${vals.length - 2} and provider = $${vals.length - 1} and integration_key = $${vals.length}`;
    }

    const q = await client.query<{ id: string; provider: string; integration_key: string }>(
      `
        update app.organization_integrations
        set
          ${set.join(", ")},
          updated_at = now()
        where ${whereSql}
        returning id, provider, integration_key
      `,
      vals,
    );
    if (!q.rows[0]) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Integration not found" }, { status: 404 });
    }

    await writeAuditLog(client, {
      organizationId: tenantId,
      actorType: "user",
      actorLabel: "agency-ui",
      action: "integration.update",
      entityType: "integration",
      entityId: q.rows[0].id,
      payload: {
        provider: q.rows[0].provider,
        integrationKey: q.rows[0].integration_key,
        changed: {
          status: !!status,
          authType: !!authType,
          externalAccountId: externalAccountId !== undefined,
          externalPropertyId: externalPropertyId !== undefined,
          scopes: !!scopes,
          config: !!config,
          metadata: !!metadata,
          lastError: lastError !== undefined,
        },
      },
    });

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, id: q.rows[0].id });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to update integration";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
