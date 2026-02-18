import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import {
  getTenantStateFile,
  listTenantStateFiles,
} from "@/lib/tenantStateCatalogDb";
import { seedTenantStateFilesFromTemplates } from "@/lib/tenantStateTemplateSeed";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type RegenerateBody = {
  rootDomain?: string;
};

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const pool = getDbPool();
  const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  if (!exists.rows[0]) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const url = new URL(req.url);
    const state = s(url.searchParams.get("state")).toLowerCase();
    if (state) {
      const row = await getTenantStateFile(pool, tenantId, state);
      if (!row) {
        return NextResponse.json(
          { ok: false, error: `State file not found for slug: ${state}` },
          { status: 404 },
        );
      }
      return NextResponse.json({
        ok: true,
        tenantId,
        stateSlug: state,
        row,
      });
    }

    const rows = await listTenantStateFiles(pool, tenantId);
    return NextResponse.json({
      ok: true,
      tenantId,
      total: rows.length,
      rows,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list tenant state files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as RegenerateBody | null;
  const rootDomainOverride = s(body?.rootDomain);
  const pool = getDbPool();

  const tenantQ = await pool.query<{
    id: string;
    root_domain: string | null;
  }>(
    `
      select o.id, s.root_domain
      from app.organizations o
      left join app.organization_settings s on s.organization_id = o.id
      where o.id = $1
      limit 1
    `,
    [tenantId],
  );
  const tenant = tenantQ.rows[0];
  if (!tenant) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const rootDomain = rootDomainOverride || s(tenant.root_domain);
  if (!rootDomain) {
    return NextResponse.json(
      { ok: false, error: "Tenant has no rootDomain. Set organization_settings.root_domain first." },
      { status: 400 },
    );
  }

  try {
    const seeded = await seedTenantStateFilesFromTemplates({
      db: pool,
      organizationId: tenantId,
      rootDomain,
      source: "template_seed_manual",
    });

    return NextResponse.json({
      ok: seeded.ok,
      tenantId,
      rootDomain,
      seeded,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to regenerate tenant state files";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
