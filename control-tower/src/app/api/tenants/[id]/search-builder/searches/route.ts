import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const MODULE = "search_builder_searches";
const SEARCH_EMBEDDED_HOST = "search-embedded.telahagocrecer.com";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizePath(input: unknown) {
  const raw = s(input);
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
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
  return allowed.has(key) ? key : "lato";
}

function normalizePreviewTone(input: unknown) {
  const tone = s(input).toLowerCase();
  return tone === "light" ? "light" : "dark";
}

function normalizeLocationNavMode(input: unknown) {
  const m = s(input).toLowerCase();
  if (m === "state" || m === "county" || m === "city") return m;
  return "auto";
}

function normalizeLocationNavCityBehavior(input: unknown) {
  const m = s(input).toLowerCase();
  if (m === "sibling_cities" || m === "counties_in_state") return m;
  return "states";
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
  return `search_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizePayload(input: Record<string, unknown> | null | undefined) {
  const name = s(input?.name) || "Untitled Search";
  return {
    id: s(input?.id) || randomId(),
    name,
    companyName: s(input?.companyName),
    buttonText: s(input?.buttonText) || "Book An Appointment",
    modalTitle: s(input?.modalTitle) || `${name} Locations`,
    host: SEARCH_EMBEDDED_HOST,
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
    buttonPosition: ["left", "center", "right"].includes(s(input?.buttonPosition).toLowerCase())
      ? s(input?.buttonPosition).toLowerCase()
      : "center",
    fontKey: normalizeFontKey(input?.fontKey),
    buttonRadius: n(input?.buttonRadius, 999, 0, 999),
    buttonPaddingY: n(input?.buttonPaddingY, 12, 6, 32),
    buttonPaddingX: n(input?.buttonPaddingX, 22, 8, 60),
    buttonFontSize: n(input?.buttonFontSize, 15, 10, 30),
    buttonFontWeight: n(input?.buttonFontWeight, 800, 300, 900),
    buttonShadow: n(input?.buttonShadow, 18, 0, 80),
    modalRadius: n(input?.modalRadius, 16, 0, 40),
    modalWidth: n(input?.modalWidth, 800, 360, 1400),
    modalHeight: n(input?.modalHeight, 680, 360, 1100),
    modalBackdropOpacity: n(input?.modalBackdropOpacity, 55, 0, 95),
    modalHeaderHeight: n(input?.modalHeaderHeight, 56, 40, 120),
    inputRadius: n(input?.inputRadius, 10, 0, 30),
    previewTone: normalizePreviewTone(input?.previewTone),
    locationNavTitle: s(input?.locationNavTitle) || "Explore nearby locations",
    locationNavMode: normalizeLocationNavMode(input?.locationNavMode),
    locationNavCityBehavior: normalizeLocationNavCityBehavior(input?.locationNavCityBehavior),
    locationNavColumnsDesktop: n(input?.locationNavColumnsDesktop, 4, 1, 6),
    locationNavGap: n(input?.locationNavGap, 10, 4, 32),
    locationNavButtonBg: normalizeColor(input?.locationNavButtonBg, "#0f172a"),
    locationNavButtonText: normalizeColor(input?.locationNavButtonText, "#e2e8f0"),
    locationNavButtonBorder: normalizeColor(input?.locationNavButtonBorder, "#1e293b"),
    locationNavButtonRadius: n(input?.locationNavButtonRadius, 12, 0, 30),
    locationNavButtonPaddingY: n(input?.locationNavButtonPaddingY, 10, 6, 24),
    locationNavButtonPaddingX: n(input?.locationNavButtonPaddingX, 14, 8, 32),
    locationNavButtonFontSize: n(input?.locationNavButtonFontSize, 14, 11, 22),
    locationNavButtonFontWeight: n(input?.locationNavButtonFontWeight, 700, 400, 900),
    locationNavCustomCss: s(input?.locationNavCustomCss),
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

    const searches = q.rows.map((row) => {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(s(row.key_value) || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const payload = normalizePayload({ ...parsed, id: s(parsed.id) || row.key_name });
      return { ...payload, updatedAt: s(row.updated_at) };
    });

    return NextResponse.json({ ok: true, searches });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read searches" },
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
          $6, 'json', false, true, 'Search Builder search config'
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

    return NextResponse.json({ ok: true, search: { ...payload, id: keyName } });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create search" },
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
    const searchId = kebabToken(s(body.searchId || body.id));
    if (!searchId) return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });
    const payload = normalizePayload({ ...body, id: searchId });
    const pool = getDbPool();

    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Search Builder search config'
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

    return NextResponse.json({ ok: true, search: payload });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update search" },
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
    const searchId = kebabToken(url.searchParams.get("searchId") || "");
    if (!searchId) return NextResponse.json({ ok: false, error: "Missing searchId" }, { status: 400 });

    const pool = getDbPool();
    await pool.query(
      `
        update app.organization_custom_values
        set is_active = false, updated_at = now()
        where organization_id = $1::uuid
          and provider = $2
          and scope = $3
          and module = $4
          and key_name = $5
      `,
      [tenantId, PROVIDER, SCOPE, MODULE, searchId],
    );

    return NextResponse.json({ ok: true, searchId });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete search" },
      { status: 500 },
    );
  }
}
