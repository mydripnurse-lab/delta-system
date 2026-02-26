import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "search_builder";
const KEY_NAME = "config_v1";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizePath(input: unknown) {
  const raw = s(input);
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input);
  if (!raw) return fallback;
  const hex = raw.toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(hex)) return hex;
  return fallback;
}

function normalizePayload(input: Record<string, unknown> | null | undefined) {
  return {
    companyName: s(input?.companyName),
    buttonText: s(input?.buttonText) || "Book An Appointment",
    modalTitle: s(input?.modalTitle) || "Locations",
    host: s(input?.host) || "sitemaps.mydripnurse.com",
    folder: s(input?.folder) || "company-search",
    pageSlug: s(input?.pageSlug) || "mobile-iv-therapy-locations",
    query: s(input?.query) || "embed=1",
    buttonColor: normalizeColor(input?.buttonColor, "#044c5c"),
    headerColor: normalizeColor(input?.headerColor, "#a4d8e4"),
    searchTitle: s(input?.searchTitle) || "Choose your location",
    searchSubtitle:
      s(input?.searchSubtitle) || "Search by State, County/Parish, or City. Then click Book Now.",
    searchPlaceholder: s(input?.searchPlaceholder) || "Choose your City, State, or Country",
    defaultBookingPath: normalizePath(input?.defaultBookingPath || "/"),
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
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const pool = getDbPool();
    const q = await pool.query<{ key_value: string | null; updated_at: string | null }>(
      `
        select key_value, updated_at
        from app.organization_custom_values
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
        limit 1
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, KEY_NAME],
    );

    const row = q.rows[0];
    if (!row) {
      return NextResponse.json({ ok: true, exists: false, payload: null, updatedAt: null });
    }

    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
    } catch {
      parsed = {};
    }
    return NextResponse.json({
      ok: true,
      exists: true,
      payload: normalizePayload(parsed),
      updatedAt: s(row.updated_at),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read search builder settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
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

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = normalizePayload(body);
    const pool = getDbPool();

    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Search Builder tenant settings'
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
      [tenantId, PROVIDER, SCOPE, MODULE, KEY_NAME, JSON.stringify(payload)],
    );

    return NextResponse.json({ ok: true, payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save search builder settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

