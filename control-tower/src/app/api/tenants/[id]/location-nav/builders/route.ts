import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "location_nav_builders";

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

function randomId() {
  return `loc_nav_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input).toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
  return fallback;
}

function n(input: unknown, fallback: number, min: number, max: number) {
  const v = Number(input);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, Math.round(v)));
}

function normalizeFontKey(input: unknown) {
  const key = s(input).toLowerCase();
  const allowed = new Set([
    "lato",
    "inter",
    "poppins",
    "montserrat",
    "oswald",
    "raleway",
    "nunito",
    "dm_sans",
    "plus_jakarta_sans",
    "manrope",
    "rubik",
    "merriweather",
  ]);
  return allowed.has(key) ? key : "inter";
}

function normalizePayload(input: Record<string, unknown> | null | undefined) {
  const searchId = kebabToken(s(input?.searchId || ""));
  return {
    id: s(input?.id) || randomId(),
    name: s(input?.name) || "Location Nav",
    searchId,
    title: s(input?.title) || "Explore nearby locations",
    mode: ["auto", "state", "county", "city"].includes(s(input?.mode).toLowerCase())
      ? s(input?.mode).toLowerCase()
      : "auto",
    cityBehavior: ["states", "sibling_cities", "counties_in_state"].includes(s(input?.cityBehavior).toLowerCase())
      ? s(input?.cityBehavior).toLowerCase()
      : "states",
    columnsDesktop: n(input?.columnsDesktop, 4, 1, 6),
    gap: n(input?.gap, 10, 4, 32),
    buttonBg: normalizeColor(input?.buttonBg, "#0f172a"),
    buttonText: normalizeColor(input?.buttonText, "#e2e8f0"),
    buttonBorder: normalizeColor(input?.buttonBorder, "#1e293b"),
    buttonRadius: n(input?.buttonRadius, 12, 0, 30),
    buttonPaddingY: n(input?.buttonPaddingY, 10, 6, 24),
    buttonPaddingX: n(input?.buttonPaddingX, 14, 8, 32),
    buttonFontSize: n(input?.buttonFontSize, 14, 11, 22),
    buttonFontWeight: n(input?.buttonFontWeight, 700, 400, 900),
    customCss: s(input?.customCss),
    fontKey: normalizeFontKey(input?.fontKey),
    previewTone: s(input?.previewTone).toLowerCase() === "light" ? "light" : "dark",
  };
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
    const pool = getDbPool();
    const q = await pool.query<{ key_name: string; key_value: string | null; updated_at: string | null }>(
      `
        select key_name, key_value, updated_at
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and is_active = true
        order by updated_at desc nulls last, key_name asc
      `,
      [tenantId, PROVIDER, SCOPE, MODULE],
    );
    const builders = q.rows.map((row) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      return { ...normalizePayload({ ...parsed, id: s(parsed.id) || row.key_name }), updatedAt: s(row.updated_at) };
    });
    return NextResponse.json({ ok: true, builders });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read location nav builders" },
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
    const payload = normalizePayload(body);
    const keyName = kebabToken(payload.id) || randomId();
    const pool = getDbPool();
    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Location Nav builder config'
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
      [tenantId, PROVIDER, SCOPE, MODULE, keyName, JSON.stringify({ ...payload, id: keyName })],
    );
    return NextResponse.json({ ok: true, builder: { ...payload, id: keyName } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create location nav builder" },
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
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const builderId = kebabToken(s(body.id));
    if (!builderId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    const payload = normalizePayload({ ...body, id: builderId });
    const pool = getDbPool();
    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Location Nav builder config'
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
      [tenantId, PROVIDER, SCOPE, MODULE, builderId, JSON.stringify(payload)],
    );
    return NextResponse.json({ ok: true, builder: payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update location nav builder" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const url = new URL(req.url);
    const builderId = kebabToken(url.searchParams.get("id") || "");
    if (!builderId) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });
    const pool = getDbPool();
    await pool.query(
      `
        delete from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, builderId],
    );
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete location nav builder" },
      { status: 500 },
    );
  }
}

