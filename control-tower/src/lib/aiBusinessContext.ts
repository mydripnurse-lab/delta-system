import { getDbPool } from "@/lib/db";

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

function s(v: unknown) {
  return String(v ?? "").trim();
}

function compactJson(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const out = value.trim();
    if (out.length <= 600) return out;
    return `${out.slice(0, 600)}...`;
  }
  if (depth >= 4) return null;
  if (Array.isArray(value)) {
    const items: JsonValue[] = [];
    const max = Math.min(value.length, 12);
    for (let i = 0; i < max; i += 1) {
      items.push(compactJson(value[i], depth + 1));
    }
    return items;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, JsonValue> = {};
    const entries = Object.entries(obj).slice(0, 40);
    for (const [key, raw] of entries) {
      out[key] = compactJson(raw, depth + 1);
    }
    return out;
  }
  return null;
}

const PRESET_PRIORITY = ["7d", "28d", "3m", "6m", "1y", ""];

function presetRank(preset: string) {
  const idx = PRESET_PRIORITY.indexOf(preset);
  return idx >= 0 ? idx : PRESET_PRIORITY.length + 1;
}

export async function buildBusinessContextFromDb(
  tenantId: string,
  integrationKey?: string | null,
) {
  const orgId = s(tenantId);
  if (!orgId) return null;
  if (!s(process.env.DATABASE_URL)) return null;

  const key = s(integrationKey) || "owner";
  const pool = getDbPool();
  const q = await pool.query<{
    module: string;
    preset: string | null;
    compare_enabled: boolean;
    range_start: string;
    range_end: string;
    captured_at: string;
    payload: Record<string, unknown> | null;
  }>(
    `
      select distinct on (module, coalesce(preset, ''), compare_enabled)
        module,
        preset,
        compare_enabled,
        range_start,
        range_end,
        captured_at,
        payload
      from app.dashboard_kpi_cache
      where organization_id = $1::uuid
        and integration_key in ($2, 'owner', 'default')
      order by module, coalesce(preset, ''), compare_enabled, captured_at desc
    `,
    [orgId, key],
  );

  const rows = q.rows || [];
  if (!rows.length) return null;

  const snapshots = rows
    .map((r) => ({
      module: s(r.module),
      preset: s(r.preset),
      compareEnabled: r.compare_enabled === true,
      range: { start: s(r.range_start), end: s(r.range_end) },
      capturedAt: s(r.captured_at),
      payload: compactJson(r.payload || {}),
    }))
    .sort((a, b) => {
      if (a.module !== b.module) return a.module.localeCompare(b.module);
      const ra = presetRank(a.preset);
      const rb = presetRank(b.preset);
      if (ra !== rb) return ra - rb;
      return String(b.capturedAt).localeCompare(String(a.capturedAt));
    });

  return {
    source: "app.dashboard_kpi_cache",
    generatedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    modules: Array.from(new Set(snapshots.map((x) => x.module))),
    snapshots,
  };
}

