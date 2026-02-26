import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "search_builder_indexes";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function kebabToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const searchId = kebabToken(new URL(req.url).searchParams.get("searchId") || "");
    if (!searchId) return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });
    const pool = getDbPool();
    const q = await pool.query<{ key_value: string | null }>(
      `
        select key_value
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
          and is_active = true
        limit 1
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, searchId],
    );
    const raw = s(q.rows[0]?.key_value);
    if (!raw) return NextResponse.json({ ok: true, exists: false, index: null });
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return NextResponse.json({ ok: true, exists: true, index: parsed });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read search index" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const searchId = kebabToken(s(body.searchId));
    const state = kebabToken(s(body.state || "all")) || "all";
    if (!searchId) return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });

    const pool = getDbPool();
    const args: unknown[] = [tenantId];
    let where = "where organization_id = $1::uuid";
    if (state !== "all") {
      args.push(state);
      where += ` and state_slug = $${args.length}`;
    }
    const q = await pool.query<{ state_slug: string; state_name: string }>(
      `
        select state_slug, state_name
        from app.organization_state_files
        ${where}
        order by state_slug asc
      `,
      args,
    );

    const states = q.rows.map((r) => ({
      stateSlug: s(r.state_slug),
      stateName: s(r.state_name),
      stateFileUrl: `/embedded/state/${tenantId}/${s(r.state_slug)}.json`,
    }));

    const payload = {
      searchId,
      tenantId,
      state,
      generatedAt: new Date().toISOString(),
      count: states.length,
      states,
    };

    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Search Builder index by search'
        )
        on conflict (organization_id, provider, scope, module, key_name)
        do update set
          key_value = excluded.key_value,
          value_type = excluded.value_type,
          is_secret = excluded.is_secret,
          is_active = excluded.is_active,
          description = excluded.description,
          updated_at = now()
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, searchId, JSON.stringify(payload)],
    );

    return NextResponse.json({ ok: true, index: payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to build search index" },
      { status: 500 },
    );
  }
}
