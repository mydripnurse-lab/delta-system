import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { getAgencyAccessTokenOrThrow, getEffectiveCompanyIdOrThrow } from "@/lib/ghlHttp";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

function normalizeName(x: unknown) {
  return String(x ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
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
    const desired = desiredQ.rows.map((r) => ({
      name: s(r.key_name),
      value: s(r.key_value),
    }));
    if (!desired.length) {
      return NextResponse.json({
        ok: false,
        error: "No active custom values with non-empty value found in DB template.",
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
      const key = normalizeName(name);
      if (!byNorm.has(key)) byNorm.set(key, { id, name });
    }

    let updated = 0;
    let noMatch = 0;
    let failed = 0;
    const noMatchNames: string[] = [];

    for (const item of desired) {
      const hit = byNorm.get(normalizeName(item.name));
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
      desired: desired.length,
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

