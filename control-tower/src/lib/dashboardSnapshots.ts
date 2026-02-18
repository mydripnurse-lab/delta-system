import { getDbPool } from "@/lib/db";

type JsonObject = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

export async function loadDashboardSnapshot(
  tenantId: string,
  module: string,
  snapshotKey = "latest",
): Promise<{ payload: JsonObject; capturedAt: string } | null> {
  const id = s(tenantId);
  const mod = s(module);
  const key = s(snapshotKey) || "latest";
  if (!id || !mod) return null;

  const pool = getDbPool();
  const q = await pool.query<{ payload: JsonObject; captured_at: string | null }>(
    `
      select payload, captured_at
      from app.organization_snapshots
      where organization_id = $1
        and module = $2
        and snapshot_key = $3
      limit 1
    `,
    [id, mod, key],
  );

  const row = q.rows[0];
  if (!row?.payload) return null;
  return {
    payload: row.payload,
    capturedAt: s(row.captured_at),
  };
}

export async function saveDashboardSnapshot(
  tenantId: string,
  module: string,
  payload: JsonObject,
  options?: { snapshotKey?: string; source?: string },
) {
  const id = s(tenantId);
  const mod = s(module);
  const key = s(options?.snapshotKey) || "latest";
  const source = s(options?.source) || "dashboard_api";
  if (!id || !mod) return;

  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_snapshots (
        organization_id, module, snapshot_key, source, payload, captured_at
      )
      values ($1, $2, $3, $4, $5::jsonb, now())
      on conflict (organization_id, module, snapshot_key)
      do update set
        source = excluded.source,
        payload = excluded.payload,
        captured_at = excluded.captured_at,
        updated_at = now()
    `,
    [id, mod, key, source, JSON.stringify(payload)],
  );
}

