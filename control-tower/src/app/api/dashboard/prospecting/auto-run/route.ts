import { getDbPool } from "@/lib/db";
import { listGeoRuns, recordGeoRun } from "@/lib/prospectingStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

function norm(v: unknown) {
  return s(v).replace(/\s+/g, " ").trim().toLowerCase();
}

function isUnknownGeoName(v: unknown) {
  const x = norm(v);
  return !x || x === "unknown" || x === "n/a" || x === "na" || x === "null" || x === "undefined" || x === "-";
}

function resolveAuthCandidates() {
  return [
    s(process.env.PROSPECTING_CRON_SECRET),
    s(process.env.CRON_SECRET),
    s(process.env.DASHBOARD_CRON_SECRET),
  ].filter(Boolean);
}

function enforceCronAuth() {
  const v = s(process.env.ENFORCE_PROSPECTING_CRON_AUTH).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function extractToken(req: Request, body?: JsonMap | null) {
  const qs = new URL(req.url).searchParams;
  const header = s(req.headers.get("x-prospecting-cron-secret"));
  const dashboardHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const auth = s(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const query = s(qs.get("secret"));
  const bodyToken = s(body?.secret);
  return header || dashboardHeader || bearer || query || bodyToken;
}

function isVercelCronRequest(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const vercelId = s(req.headers.get("x-vercel-id"));
  if (vercelId) return true;
  const ua = s(req.headers.get("user-agent")).toLowerCase();
  return ua.includes("vercel-cron");
}

function isInternalCronCall(req: Request) {
  return s(req.headers.get("x-internal-cron-call")) === "1";
}

async function fetchJson(url: string, init?: RequestInit, timeoutMs = 55_000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), Math.max(1_000, timeoutMs));
  const res = await fetch(url, { cache: "no-store", ...(init || {}), signal: ac.signal }).finally(() => {
    clearTimeout(timer);
  });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
  return json || {};
}

async function listAutoEnabledTenants() {
  const pool = getDbPool();
  const q = await pool.query<{ id: string }>(
    `
      select o.id
      from app.organizations o
      where exists (
        select 1
        from app.organization_custom_values cv
        where cv.organization_id = o.id
          and cv.provider = 'ghl'
          and cv.scope = 'module'
          and cv.module = 'custom_values'
          and cv.key_name = 'prospecting_auto_enabled'
          and lower(cv.key_value) in ('1','true','yes','on','active')
          and cv.is_active = true
      )
      order by o.created_at asc
    `,
  );
  return q.rows.map((r) => s(r.id)).filter(Boolean);
}

type GeoCandidate = {
  geoType: "city" | "county" | "state";
  geoName: string;
  priorityScore: number;
};

function pickGeoBatch(input: {
  cities: Array<{ name: string; priorityScore?: number }>;
  counties: Array<{ name: string; priorityScore?: number }>;
  states: Array<{ name: string; priorityScore?: number }>;
  already: Array<{ geoType: string; geoName: string; lastRunAt: string }>;
  batchSize: number;
  cooldownMinutes: number;
}) {
  const now = Date.now();
  const cooldownMs = Math.max(1, input.cooldownMinutes) * 60 * 1000;
  const lastMap = new Map<string, number>();
  for (const row of input.already) {
    const key = `${s(row.geoType)}|${s(row.geoName).toLowerCase()}`;
    const ms = new Date(s(row.lastRunAt)).getTime();
    if (Number.isFinite(ms)) lastMap.set(key, ms);
  }

  const all: GeoCandidate[] = [
    ...input.cities.map((x) => ({ geoType: "city" as const, geoName: s(x.name), priorityScore: n(x.priorityScore) })),
    ...input.counties.map((x) => ({ geoType: "county" as const, geoName: s(x.name), priorityScore: n(x.priorityScore) })),
    ...input.states.map((x) => ({ geoType: "state" as const, geoName: s(x.name), priorityScore: n(x.priorityScore) })),
  ].filter((x) => x.geoName && !isUnknownGeoName(x.geoName));

  all.sort((a, b) => b.priorityScore - a.priorityScore);
  const out: GeoCandidate[] = [];
  for (const row of all) {
    if (out.length >= input.batchSize) break;
    const key = `${row.geoType}|${row.geoName.toLowerCase()}`;
    const last = lastMap.get(key) || 0;
    if (last > 0 && now - last < cooldownMs) continue;
    out.push(row);
  }
  return out;
}

export async function POST(req: Request) {
  let lockClient: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }>; release: () => void } | null = null;
  let lockHeld = false;
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    void req;

    const singleTenantId = s(body?.tenantId);
    const integrationKey = s(body?.integrationKey) || "owner";
    const batchSize = Math.max(1, Math.min(50, Number(body?.batchSize || 2)));
    const cooldownMinutes = Math.max(5, Math.min(24 * 60, Number(body?.cooldownMinutes || 180)));
    const maxResultsPerGeo = Math.max(1, Math.min(50, Number(body?.maxResultsPerGeo || 12)));
    const maxTenants = Math.max(0, Math.min(500, Number(body?.maxTenants || 0)));
    const maxRuntimeMs = Math.max(30_000, Math.min(295_000, Number(body?.maxRuntimeMs || 240_000)));
    const startedAt = Date.now();
    const deadline = startedAt + maxRuntimeMs;
    const sources = ((body?.sources as JsonMap | undefined) || {}) as JsonMap;
    const enrichment = ((body?.enrichment as JsonMap | undefined) || {}) as JsonMap;

    lockClient = (await getDbPool().connect()) as typeof lockClient;
    const lock = await lockClient.query(
      "select pg_try_advisory_lock($1::int, $2::int) as ok",
      [20260223, 1],
    );
    lockHeld = !!lock.rows?.[0]?.ok;
    if (!lockHeld) {
      return Response.json({
        ok: true,
        skipped: "lock_busy",
        message: "Prospecting auto-run already in progress.",
      });
    }

    const allTenantIds = singleTenantId ? [singleTenantId] : await listAutoEnabledTenants();
    const tenantIds = maxTenants > 0 ? allTenantIds.slice(0, maxTenants) : allTenantIds;
    const origin = new URL(req.url).origin;
    const results: Array<Record<string, unknown>> = [];
    let timedOut = false;

    for (const tenantId of tenantIds) {
      if (Date.now() >= deadline - 2_000) {
        timedOut = true;
        break;
      }
      const perTenant: Record<string, unknown> = {
        tenantId,
        processed: 0,
        skippedUnknownGeo: 0,
        runs: [] as Record<string, unknown>[],
      };
      try {
        const dashboard = await fetchJson(
          `${origin}/api/dashboard/prospecting?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`,
          undefined,
          Math.max(5_000, Math.min(45_000, deadline - Date.now() - 1_000)),
        );
        const geoQueue = (dashboard.geoQueue as JsonMap | undefined) || {};
        const cities = (Array.isArray(geoQueue.cities) ? geoQueue.cities : []) as Array<{ name: string; priorityScore?: number }>;
        const counties = (Array.isArray(geoQueue.counties) ? geoQueue.counties : []) as Array<{ name: string; priorityScore?: number }>;
        const states = (Array.isArray(geoQueue.states) ? geoQueue.states : []) as Array<{ name: string; priorityScore?: number }>;
        const already = await listGeoRuns(tenantId);
        const picks = pickGeoBatch({
          cities,
          counties,
          states,
          already,
          batchSize,
          cooldownMinutes,
        });

        for (const pick of picks) {
          if (Date.now() >= deadline - 2_000) {
            timedOut = true;
            break;
          }
          if (isUnknownGeoName(pick.geoName)) {
            perTenant.skippedUnknownGeo = n(perTenant.skippedUnknownGeo) + 1;
            (perTenant.runs as Record<string, unknown>[]).push({
              geoType: pick.geoType,
              geoName: pick.geoName,
              skipped: "unknown-geo",
            });
            continue;
          }
          try {
            const run = await fetchJson(`${origin}/api/dashboard/prospecting/run`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                tenantId,
                integrationKey,
                geoType: pick.geoType,
                geoName: pick.geoName,
                city: pick.geoType === "city" ? pick.geoName : "",
                county: pick.geoType === "county" ? pick.geoName : "",
                state: pick.geoType === "state" ? pick.geoName : "",
                maxResults: maxResultsPerGeo,
                sources,
                enrichment,
              }),
            }, Math.max(5_000, Math.min(60_000, deadline - Date.now() - 1_000)));
            const r = (run.results as JsonMap | undefined) || {};
            await recordGeoRun({
              tenantId,
              geoType: pick.geoType,
              geoName: pick.geoName,
              status: "ok",
              discovered: n(r.discovered),
              created: n(r.created),
              updated: n(r.updated),
            });
            (perTenant.runs as Record<string, unknown>[]).push({
              geoType: pick.geoType,
              geoName: pick.geoName,
              discovered: n(r.discovered),
              created: n(r.created),
              updated: n(r.updated),
            });
            perTenant.processed = n(perTenant.processed) + 1;
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "run failed";
            await recordGeoRun({
              tenantId,
              geoType: pick.geoType,
              geoName: pick.geoName,
              status: "error",
              discovered: 0,
              created: 0,
              updated: 0,
              error: msg,
            });
            (perTenant.runs as Record<string, unknown>[]).push({
              geoType: pick.geoType,
              geoName: pick.geoName,
              error: msg,
            });
          }
        }
      } catch (e: unknown) {
        perTenant.error = e instanceof Error ? e.message : "tenant run failed";
      }
      results.push(perTenant);
    }

    return Response.json({
      ok: true,
      mode: singleTenantId ? "single-tenant" : "auto-enabled-tenants",
      batchSize,
      cooldownMinutes,
      maxResultsPerGeo,
      maxTenants: maxTenants || null,
      maxRuntimeMs,
      timedOut,
      elapsedMs: Date.now() - startedAt,
      tenants: results,
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to auto-run prospecting" },
      { status: 500 },
    );
  } finally {
    try {
      if (lockHeld && lockClient) {
        await lockClient.query("select pg_advisory_unlock($1::int, $2::int)", [20260223, 1]);
      }
    } catch {
      // noop
    }
    try {
      lockClient?.release();
    } catch {
      // noop
    }
  }
}
