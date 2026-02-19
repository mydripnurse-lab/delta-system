import { getDbPool } from "@/lib/db";

type JsonObject = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

export type KpiCacheScope = {
  tenantId: string;
  module: string;
  integrationKey?: string;
  start: string;
  end: string;
  preset?: string;
  compare?: boolean;
};

export async function readDashboardKpiCache(
  scope: KpiCacheScope,
): Promise<{ payload: JsonObject; capturedAt: string; expired: boolean } | null> {
  const tenantId = s(scope.tenantId);
  const module = s(scope.module);
  const integrationKey = s(scope.integrationKey) || "owner";
  const start = s(scope.start);
  const end = s(scope.end);
  const preset = s(scope.preset);
  const compare = scope.compare !== false;
  if (!tenantId || !module || !start || !end) return null;

  const pool = getDbPool();
  const q = await pool.query<{
    payload: JsonObject | null;
    captured_at: string | null;
    expires_at: string | null;
  }>(
    `
      select payload, captured_at, expires_at
      from app.dashboard_kpi_cache
      where organization_id = $1
        and module = $2
        and integration_key = $3
        and range_start = $4::timestamptz
        and range_end = $5::timestamptz
        and preset = $6
        and compare_enabled = $7
      limit 1
    `,
    [tenantId, module, integrationKey, start, end, preset, compare],
  );

  const row = q.rows[0];
  if (!row?.payload) return null;
  const expiresAtMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs > 0 ? Date.now() > expiresAtMs : false;
  return {
    payload: row.payload,
    capturedAt: s(row.captured_at),
    expired,
  };
}

export async function writeDashboardKpiCache(
  scope: KpiCacheScope & {
    payload: JsonObject;
    source?: string;
    ttlSec?: number;
  },
) {
  const tenantId = s(scope.tenantId);
  const module = s(scope.module);
  const integrationKey = s(scope.integrationKey) || "owner";
  const start = s(scope.start);
  const end = s(scope.end);
  const preset = s(scope.preset);
  const compare = scope.compare !== false;
  const source = s(scope.source) || "dashboard_api";
  if (!tenantId || !module || !start || !end) return;

  const ttlSec = Number(scope.ttlSec || 0);
  const expiresAtIso =
    Number.isFinite(ttlSec) && ttlSec > 0 ? new Date(Date.now() + ttlSec * 1000).toISOString() : null;

  const pool = getDbPool();
  await pool.query(
    `
      insert into app.dashboard_kpi_cache (
        organization_id,
        module,
        integration_key,
        range_start,
        range_end,
        preset,
        compare_enabled,
        source,
        payload,
        captured_at,
        expires_at
      )
      values (
        $1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7, $8, $9::jsonb, now(), $10::timestamptz
      )
      on conflict (organization_id, module, integration_key, range_start, range_end, preset, compare_enabled)
      do update set
        source = excluded.source,
        payload = excluded.payload,
        captured_at = excluded.captured_at,
        expires_at = excluded.expires_at,
        updated_at = now()
    `,
    [
      tenantId,
      module,
      integrationKey,
      start,
      end,
      preset,
      compare,
      source,
      JSON.stringify(scope.payload || {}),
      expiresAtIso,
    ],
  );
}
