import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { getAgencyAccessTokenOrThrow, getEffectiveCompanyIdOrThrow } from "@/lib/ghlHttp";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { isLegacyDynamicCustomValueName, normalizeCustomValueName } from "@/lib/ghlCustomValuesRules";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function cleanCell(v: unknown) {
  return String(v ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function ensureHttps(domainOrUrl: unknown) {
  const v = s(domainOrUrl);
  if (!v) return "";
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  return `https://${v.replace(/^\/+/, "")}`;
}

function ensureCountySuffix(name: unknown) {
  const t = s(name);
  if (!t) return "";
  const low = t.toLowerCase();
  if (low.endsWith(" county") || low.endsWith(" parish")) return t;
  return `${t} County`;
}

function rowToObject(headers: string[], row: unknown[]) {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < headers.length; i++) out[headers[i]] = row?.[i];
  return out;
}

function findRowByLocId(tabIndex: { headers: string[]; rows: unknown[][]; headerMap: Map<string, number> }, locId: string) {
  const locIdx = tabIndex.headerMap.get("Location Id");
  if (locIdx == null || locIdx < 0) return null;
  const target = cleanCell(locId);
  for (let r = 0; r < tabIndex.rows.length; r++) {
    const row = tabIndex.rows[r] || [];
    const cell = cleanCell(row?.[locIdx]);
    if (cell && cell === target) {
      return { rowIndex1: r + 2, row, obj: rowToObject(tabIndex.headers, row) };
    }
  }
  return null;
}

async function getLocationTokenFor(tenantId: string, targetLocationId: string) {
  const companyId = await getEffectiveCompanyIdOrThrow({ tenantId, integrationKey: "owner" });
  const agencyToken = await getAgencyAccessTokenOrThrow({ tenantId, integrationKey: "owner" });
  const r = await fetch("https://services.leadconnectorhq.com/oauth/locationToken", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agencyToken}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ companyId, locationId: targetLocationId }),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(`GHL locationToken failed (${r.status}).`);
  const token = s(data.access_token);
  if (!token) throw new Error("GHL location token missing access_token.");
  return token;
}

function extractCustomValues(payload: Record<string, unknown>) {
  const candidates = [
    payload.customValues,
    asObj(payload.data).customValues,
    asObj(asObj(payload.data).data).customValues,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) return c as Array<Record<string, unknown>>;
  }
  return [] as Array<Record<string, unknown>>;
}

async function getLegacyDynamicValuesForLoc(opts: {
  tenantId: string;
  locId: string;
  kind?: string;
}) {
  const cfg = await getTenantSheetConfig(opts.tenantId);
  const [countiesTab, citiesTab] = await Promise.all([
    loadTenantSheetTabIndex({
      tenantId: opts.tenantId,
      spreadsheetId: cfg.spreadsheetId,
      sheetName: cfg.countyTab,
      range: "A:ZZ",
    }),
    loadTenantSheetTabIndex({
      tenantId: opts.tenantId,
      spreadsheetId: cfg.spreadsheetId,
      sheetName: cfg.cityTab,
      range: "A:ZZ",
    }),
  ]);

  const kind = s(opts.kind).toLowerCase();
  let found: ReturnType<typeof findRowByLocId> = null;
  let foundKind: "counties" | "cities" | "" = "";
  if (kind === "counties") {
    found = findRowByLocId(countiesTab, opts.locId);
    foundKind = "counties";
  } else if (kind === "cities") {
    found = findRowByLocId(citiesTab, opts.locId);
    foundKind = "cities";
  } else {
    found = findRowByLocId(countiesTab, opts.locId);
    foundKind = found ? "counties" : "";
    if (!found) {
      found = findRowByLocId(citiesTab, opts.locId);
      foundKind = found ? "cities" : "";
    }
  }
  if (!found || !foundKind) {
    throw new Error(`locId not found in sheet (Counties/Cities): ${opts.locId}`);
  }

  const obj = (found.obj || {}) as Record<string, unknown>;
  const stateName = cleanCell(obj["State"]);
  const countyRaw = cleanCell(obj["County"]);
  const cityRaw = cleanCell(obj["City"]);
  const countyName = ensureCountySuffix(countyRaw);
  const countyDomain = cleanCell(obj["County Domain"] || obj["Domain"] || "");
  const cityDomain = cleanCell(obj["City Domain"] || "");

  const isCity = foundKind === "cities";
  const websiteDomain = isCity ? cityDomain || countyDomain : countyDomain;
  const websiteUrl = ensureHttps(websiteDomain);
  const countyNameAndState = isCity
    ? `${cityRaw} ${stateName}`.trim()
    : `${countyName} ${stateName}`.trim();

  return {
    foundKind,
    values: [
      { name: "Business - County Domain", value: ensureHttps(countyDomain) },
      { name: "Business - County Name", value: countyName },
      { name: "County Name And State", value: countyNameAndState },
      { name: "Website Url", value: websiteUrl },
    ],
  };
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const locId = s(body.locId);
    const kind = s(body.kind);
    if (!locId) {
      return NextResponse.json({ ok: false, error: "Missing locId" }, { status: 400 });
    }

    const pool = getDbPool();
    const desiredQ = await pool.query<{ key_name: string; key_value: string }>(
      `
        select key_name, key_value
        from app.organization_custom_values
        where organization_id = $1
          and provider = 'ghl'
          and scope = 'module'
          and module = 'custom_values'
          and is_active = true
          and nullif(trim(key_value), '') is not null
        order by key_name asc
      `,
      [tenantId],
    );
    const desiredFromDb = desiredQ.rows
      .map((r) => ({
      name: s(r.key_name),
      value: s(r.key_value),
      }))
      .filter((r) => !isLegacyDynamicCustomValueName(r.name));

    const dynamic = await getLegacyDynamicValuesForLoc({
      tenantId,
      locId,
      kind,
    });

    const desired = desiredFromDb.concat(dynamic.values);
    if (!desired.length) {
      return NextResponse.json({
        ok: false,
        error: "No custom values found to apply.",
      }, { status: 400 });
    }

    const locationToken = await getLocationTokenFor(tenantId, locId);
    const listRes = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locId)}/customValues`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${locationToken}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );
    const listJson = (await listRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (!listRes.ok) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch target custom values (${listRes.status}).` },
        { status: 502 },
      );
    }

    const targetValues = extractCustomValues(listJson);
    const byNorm = new Map<string, { id: string; name: string }>();
    for (const cv of targetValues) {
      const id = s(cv.id);
      const name = s(cv.name);
      if (!id || !name) continue;
      const key = normalizeCustomValueName(name);
      if (!byNorm.has(key)) byNorm.set(key, { id, name });
    }

    let updated = 0;
    let noMatch = 0;
    let failed = 0;
    const noMatchNames: string[] = [];

    for (const item of desired) {
      const hit = byNorm.get(normalizeCustomValueName(item.name));
      if (!hit) {
        noMatch += 1;
        noMatchNames.push(item.name);
        continue;
      }
      const upRes = await fetch(
        `https://services.leadconnectorhq.com/locations/${encodeURIComponent(locId)}/customValues/${encodeURIComponent(hit.id)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${locationToken}`,
            Version: "2021-07-28",
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: hit.name,
            value: item.value,
          }),
          cache: "no-store",
        },
      );
      if (!upRes.ok) {
        failed += 1;
        continue;
      }
      updated += 1;
    }

    return NextResponse.json({
      ok: failed === 0,
      locId,
      kindDetected: dynamic.foundKind,
      desired: desired.length,
      desiredFromDb: desiredFromDb.length,
      desiredDynamic: dynamic.values.length,
      targetCount: targetValues.length,
      updated,
      noMatch,
      failed,
      noMatchNames: noMatchNames.slice(0, 50),
      message: `Custom values applied from DB template: updated=${updated}, noMatch=${noMatch}, failed=${failed}.`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to apply custom values.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
