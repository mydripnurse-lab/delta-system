import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function b(v: unknown, fallback = false) {
  if (typeof v === "boolean") return v;
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on";
}

type Ctx = { params: Promise<{ id: string }> };

type CustomValueInput = {
  provider?: string;
  scope?: string;
  module?: string;
  keyName?: string;
  keyValue?: string;
  valueType?: "text" | "number" | "boolean" | "json";
  isSecret?: boolean;
  isActive?: boolean;
  description?: string;
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
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const provider = s(searchParams.get("provider"));
  const scope = s(searchParams.get("scope"));
  const moduleName = s(searchParams.get("module"));
  const onlyActive = b(searchParams.get("active"), false);

  const pool = getDbPool();
  const where: string[] = [`organization_id = $1`];
  const vals: unknown[] = [tenantId];

  if (provider) {
    vals.push(provider);
    where.push(`provider = $${vals.length}`);
  }
  if (scope) {
    vals.push(scope);
    where.push(`scope = $${vals.length}`);
  }
  if (moduleName) {
    vals.push(moduleName);
    where.push(`module = $${vals.length}`);
  }
  if (onlyActive) {
    where.push(`is_active = true`);
  }

  const q = await pool.query(
    `
      select
        id,
        organization_id as "organizationId",
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
      where ${where.join(" and ")}
      order by provider asc, scope asc, module asc, key_name asc
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
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => null)) as
    | { rows?: CustomValueInput[]; row?: CustomValueInput }
    | CustomValueInput
    | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const rows = Array.isArray((body as { rows?: CustomValueInput[] }).rows)
    ? (body as { rows: CustomValueInput[] }).rows
    : (body as { row?: CustomValueInput }).row
      ? [(body as { row: CustomValueInput }).row]
      : [body as CustomValueInput];

  if (rows.length === 0) {
    return NextResponse.json({ ok: false, error: "No rows provided" }, { status: 400 });
  }

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let upserted = 0;

    for (const row of rows) {
      const provider = s(row.provider) || "ghl";
      const scope = s(row.scope) || "global";
      const moduleName = s(row.module) || "control_tower";
      const keyName = s(row.keyName);
      const keyValue = s(row.keyValue);
      const valueType = s(row.valueType) || "text";
      const isSecret = b(row.isSecret, false);
      const isActive = b(row.isActive, true);
      const description = s(row.description) || null;

      if (!keyName) {
        throw new Error("Each row requires keyName");
      }

      await client.query(
        `
          insert into app.organization_custom_values (
            organization_id, provider, scope, module, key_name, key_value, value_type, is_secret, is_active, description
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          on conflict (organization_id, provider, scope, module, key_name)
          do update
            set
              key_value = excluded.key_value,
              value_type = excluded.value_type,
              is_secret = excluded.is_secret,
              is_active = excluded.is_active,
              description = excluded.description,
              updated_at = now()
        `,
        [tenantId, provider, scope, moduleName, keyName, keyValue, valueType, isSecret, isActive, description],
      );
      upserted += 1;
    }

    await client.query("COMMIT");
    return NextResponse.json({ ok: true, upserted });
  } catch (error: unknown) {
    await client.query("ROLLBACK");
    const message = error instanceof Error ? error.message : "Failed to upsert custom values";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    client.release();
  }
}
