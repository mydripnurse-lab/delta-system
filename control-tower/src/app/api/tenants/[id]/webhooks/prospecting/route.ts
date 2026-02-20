import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

function normalize(input: Record<string, unknown> | null | undefined) {
  return {
    webhookUrl: s(input?.webhookUrl),
    enabled: s(input?.enabled).toLowerCase() !== "false",
  };
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const pool = getDbPool();
    const q = await pool.query<{
      config: Record<string, unknown> | null;
      status: string;
    }>(
      `
        select config, status
        from app.organization_integrations
        where organization_id = $1::uuid
          and provider = 'prospecting'
          and integration_key = 'default'
        limit 1
      `,
      [tenantId],
    );
    const row = q.rows[0];
    const cfg = (row?.config || {}) as Record<string, unknown>;
    const payload = normalize({
      webhookUrl: s(cfg.webhookUrl),
      enabled: s(row?.status || "connected") !== "disconnected",
    });
    return NextResponse.json({ ok: true, settingKey: "tenant_prospecting_webhook_v1", payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = normalize(body);
    const status = payload.enabled && payload.webhookUrl ? "connected" : "disconnected";

    const pool = getDbPool();
    await pool.query(
      `
        insert into app.organization_integrations (
          organization_id, provider, integration_key, status, auth_type, config, metadata
        ) values (
          $1::uuid, 'prospecting', 'default', $2, 'webhook', $3::jsonb, '{}'::jsonb
        )
        on conflict (organization_id, provider, integration_key)
        do update set
          status = excluded.status,
          auth_type = excluded.auth_type,
          config = excluded.config,
          updated_at = now()
      `,
      [tenantId, status, JSON.stringify({ webhookUrl: payload.webhookUrl })],
    );

    return NextResponse.json({ ok: true, settingKey: "tenant_prospecting_webhook_v1", payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

