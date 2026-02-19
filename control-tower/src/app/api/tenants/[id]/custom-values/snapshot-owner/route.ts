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

async function getOwnerLocationId(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ external_account_id: string | null; provider: string; config: Record<string, unknown> | null }>(
    `
      select external_account_id, provider, config
      from app.organization_integrations
      where organization_id = $1
        and integration_key = 'owner'
        and provider in ('ghl', 'custom')
      order by updated_at desc
      limit 1
    `,
    [tenantId],
  );
  const row = q.rows[0];
  if (!row) throw new Error("Owner integration not found (ghl/custom owner).");
  const cfg = asObj(row.config);
  const ownerLocationId = s(row.external_account_id) || s(cfg.locationId);
  if (!ownerLocationId) throw new Error("Missing Owner Location ID in integration owner.");
  return ownerLocationId;
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

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;

  try {
    const ownerLocationId = await getOwnerLocationId(tenantId);
    const companyId = await getEffectiveCompanyIdOrThrow({ tenantId, integrationKey: "owner" });
    const locationToken = await getLocationTokenForOwner({ tenantId, companyId, ownerLocationId });

    const r = await fetch(
      `https://services.leadconnectorhq.com/locations/${encodeURIComponent(ownerLocationId)}/customValues`,
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
    const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Failed to fetch owner custom values (${r.status}).` },
        { status: 502 },
      );
    }

    const values = extractCustomValues(data)
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
        ownerLocationId,
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
