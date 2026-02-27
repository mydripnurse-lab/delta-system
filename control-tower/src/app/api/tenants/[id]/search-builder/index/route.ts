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

function pickText(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = s(obj[key]);
    if (v) return v;
  }
  return "";
}

function normalizeText(input: string) {
  return s(input)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

type FlatIndexItem = {
  label: string;
  search: string;
  state: string;
  county: string;
  city: string;
  countyDomain: string;
  cityDomain: string;
  countyUrl: string;
  cityUrl: string;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function toUrlMaybe(domainOrUrl: string) {
  const d = s(domainOrUrl);
  if (!d) return "";
  if (d.startsWith("http://") || d.startsWith("https://")) return d;
  return `https://${d}`;
}

function hostOnly(input: string) {
  const raw = s(input);
  if (!raw) return "";
  const noProto = raw.replace(/^https?:\/\//i, "");
  return noProto.split("/")[0].replace(/^www\./i, "").trim();
}

function flattenStatePayload(payload: Record<string, unknown> | null): FlatIndexItem[] {
  if (!payload) return [];
  const out: FlatIndexItem[] = [];
  const seen = new Set<string>();
  let visited = 0;

  function pushItem(item: FlatIndexItem) {
    const key = `${item.label}|${item.cityUrl}|${item.countyUrl}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  }

  function scanNode(node: unknown, stateHint: string, countyHint: string) {
    if (visited > 20000) return;
    visited += 1;
    if (Array.isArray(node)) {
      for (const item of node) scanNode(item, stateHint, countyHint);
      return;
    }
    if (!isObj(node)) return;
    const state = pickText(node, ["stateName", "state", "State", "name"]) || stateHint;
    const county = pickText(node, ["countyName", "parishName", "County", "county", "parish", "name"]) || countyHint;
    const city = pickText(node, ["cityName", "City", "city"]);
    const countyDomain = pickText(node, ["countyDomain", "parishDomain", "county_domain", "parish_domain", "Domain", "domain"]);
    const cityDomain = pickText(node, ["cityDomain", "city_domain", "City Domain"]);

    if (city) {
      const suffix = county ? ` (${county})` : "";
      pushItem({
        label: `${city}, ${state || ""}${suffix}`.trim(),
        search: normalizeText(`${city} ${county} ${state}`),
        state,
        county,
        city,
        countyDomain,
        cityDomain,
        countyUrl: toUrlMaybe(countyDomain),
        cityUrl: toUrlMaybe(cityDomain),
      });
    } else if (county) {
      pushItem({
        label: `${county}, ${state || ""}`.replace(/\s+,/g, ",").trim(),
        search: normalizeText(`${county} ${state}`),
        state,
        county,
        city: "",
        countyDomain,
        cityDomain: "",
        countyUrl: toUrlMaybe(countyDomain),
        cityUrl: "",
      });
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === "object") scanNode(value, state, county);
    }
  }

  const stateName = pickText(payload, ["stateName", "state", "name"]);
  const rowsRaw = payload.rows;
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  if (rows.length) {
    const outRows: FlatIndexItem[] = [];
    for (const row0 of rows) {
      if (!row0 || typeof row0 !== "object" || Array.isArray(row0)) continue;
      const row = row0 as Record<string, unknown>;
      const countyName = pickText(row, ["County", "county", "countyName", "parishName"]);
      const cityName = pickText(row, ["City", "city", "cityName"]);
      const countyDomain = pickText(row, ["Domain", "County Domain", "countyDomain", "parishDomain"]);
      const cityDomain = pickText(row, ["City Domain", "cityDomain"]);
      const labelCore = cityName || countyName;
      if (!labelCore) continue;
      const suffix = countyName && cityName ? ` (${countyName})` : "";
      outRows.push({
        label: `${labelCore}, ${stateName || ""}${suffix}`.trim(),
        search: normalizeText(`${cityName} ${countyName} ${stateName}`),
        state: stateName,
        county: countyName,
        city: cityName,
        countyDomain,
        cityDomain,
        countyUrl: toUrlMaybe(countyDomain),
        cityUrl: toUrlMaybe(cityDomain),
      });
    }
    if (outRows.length) return outRows;
  }
  scanNode(payload, stateName, "");

  return out;
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
    const q = await pool.query<{ state_slug: string; state_name: string; root_domain: string | null; payload: Record<string, unknown> | null }>(
      `
        select state_slug, state_name, root_domain, payload
        from app.organization_state_files
        ${where}
        order by state_slug asc
      `,
      args,
    );

    const allItems = q.rows.flatMap((r) => flattenStatePayload(r.payload || null));
    const states = q.rows.map((r) => {
      const stateSlug = s(r.state_slug);
      const stateName = s(r.state_name);
      const rootDomain = s(r.root_domain);
      const representative = allItems.find((it) => normalizeText(it.state) === normalizeText(stateName));
      const rootHost = hostOnly(rootDomain);
      const stateUrlSubdomain = rootHost ? `https://${stateSlug}.${rootHost}` : "";
      const stateUrlPath = rootDomain ? `${toUrlMaybe(rootDomain).replace(/\/+$/, "")}/${stateSlug}` : "";
      return {
        stateSlug,
        stateName,
        stateUrl: stateUrlSubdomain || stateUrlPath || s(representative?.countyUrl) || "",
        statePathUrl: stateUrlPath,
        stateSubdomainUrl: stateUrlSubdomain,
        stateFileUrl: `/embedded/state/${tenantId}/${stateSlug}.json`,
      };
    });
    const statesWithPayload = q.rows.filter((r) => isObj(r.payload)).length;
    const items = allItems.map((it) => {
      const stateRef = states.find((st) => normalizeText(st.stateName) === normalizeText(it.state));
      return {
        ...it,
        stateUrl: s(stateRef?.stateUrl),
      };
    });

    const payload = {
      searchId,
      tenantId,
      state,
      generatedAt: new Date().toISOString(),
      count: states.length,
      statesWithPayload,
      itemsCount: items.length,
      states,
      items,
    };

    await pool.query(
      `
        insert into app.organization_custom_values (
          organization_id, provider, scope, module, key_name,
          key_value, value_type, is_secret, is_active, description
        ) values (
          $1::uuid, $2, $3, $4, $5,
          $6, 'json', false, true, 'Search/Navigation index by key'
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
