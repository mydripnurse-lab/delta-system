import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { getAgencyAccessTokenOrThrow, getEffectiveCompanyIdOrThrow } from "@/lib/ghlHttp";
import { isLegacyDynamicCustomValueName } from "@/lib/ghlCustomValuesRules";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

async function getSnapshotLocationId(tenantId: string) {
  const pool = getDbPool();
  const settingsQ = await pool.query<{ snapshot_location_id: string | null }>(
    `
      select snapshot_location_id
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [tenantId],
  );
  const snapshotLocationId = s(settingsQ.rows[0]?.snapshot_location_id);
  if (snapshotLocationId) return snapshotLocationId;
  throw new Error("Missing Snapshot Location ID. Set it in Project Details > Custom Values.");
}

async function saveSnapshotLocationId(tenantId: string, snapshotLocationId: string) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_settings (
        organization_id,
        snapshot_location_id
      )
      values ($1, $2)
      on conflict (organization_id)
      do update
      set
        snapshot_location_id = excluded.snapshot_location_id,
        updated_at = now()
    `,
    [tenantId, snapshotLocationId],
  );
}

async function getLocationTokenForOwner(input: {
  tenantId: string;
  companyId: string;
  ownerLocationId: string;
}) {
  const agencyToken = await getAgencyAccessTokenOrThrow({
    tenantId: input.tenantId,
    integrationKey: "owner",
  });
  const r = await fetch("https://services.leadconnectorhq.com/oauth/locationToken", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${agencyToken}`,
      Version: "2021-07-28",
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      companyId: input.companyId,
      locationId: input.ownerLocationId,
    }),
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    throw new Error(`GHL owner locationToken failed (${r.status}).`);
  }
  const token = s(data.access_token);
  if (!token) throw new Error("Owner location token missing access_token.");
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

async function fetchAllLocationCustomValues(opts: {
  locationId: string;
  locationToken: string;
}) {
  const all: Array<Record<string, unknown>> = [];
  const limit = 200;
  let offset = 0;
  let safety = 0;
  let lastSignature = "";

  while (safety < 30) {
    safety += 1;
    const url =
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(opts.locationId)}/customValues` +
      `?limit=${limit}&offset=${offset}`;
    const r = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${opts.locationToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      throw new Error(`Failed to fetch owner custom values (${r.status}).`);
    }
    const batch = extractCustomValues(data);
    if (!batch.length) break;
    const signature = batch
      .slice(0, 3)
      .map((x) => `${s(x.id)}:${s(x.name)}`)
      .join("|");
    if (signature && signature === lastSignature) break;
    lastSignature = signature;
    all.push(...batch);
    if (batch.length < limit) break;
    offset += batch.length;
  }
  return all;
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
    const snapshotLocationIdFromBody = s(body.snapshotLocationId);
    if (snapshotLocationIdFromBody) {
      await saveSnapshotLocationId(tenantId, snapshotLocationIdFromBody);
    }
    const snapshotLocationId = snapshotLocationIdFromBody || (await getSnapshotLocationId(tenantId));
    const companyId = await getEffectiveCompanyIdOrThrow({ tenantId, integrationKey: "owner" });
    const locationToken = await getLocationTokenForOwner({ tenantId, companyId, ownerLocationId: snapshotLocationId });

    const values = (await fetchAllLocationCustomValues({
      locationId: snapshotLocationId,
      locationToken,
    }))
      .map((x) => s(x.name))
      .filter(Boolean);

    const uniqueNames = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
    const filteredNames = uniqueNames.filter((name) => !isLegacyDynamicCustomValueName(name));
    const skippedDynamic = uniqueNames.length - filteredNames.length;
    const pool = getDbPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      let inserted = 0;
      let touched = 0;
      for (const name of filteredNames) {
        const q = await client.query<{ inserted: boolean }>(
          `
            insert into app.organization_custom_values (
              organization_id, provider, scope, module, key_name, key_value, value_type, is_secret, is_active, description
            )
            values ($1, 'ghl', 'module', 'custom_values', $2, '', 'text', false, true, 'Owner snapshot template')
            on conflict (organization_id, provider, scope, module, key_name)
            do update
              set
                is_active = true,
                updated_at = now()
            returning (xmax = 0) as inserted
          `,
          [tenantId, name],
        );
        if (q.rows[0]?.inserted) inserted += 1;
        touched += 1;
      }
      await client.query("COMMIT");
      return NextResponse.json({
        ok: true,
        snapshotLocationId,
        totalFromOwner: uniqueNames.length,
        totalAfterFilter: filteredNames.length,
        skippedDynamic,
        touched,
        inserted,
      });
    } catch (error: unknown) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to snapshot owner custom values.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
