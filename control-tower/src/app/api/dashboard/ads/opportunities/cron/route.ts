import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown, fallback = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const x = n(v, fallback);
  const y = Math.trunc(x);
  if (y < min) return min;
  if (y > max) return max;
  return y;
}

function ensureAuthorized(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const expected = s(process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET || process.env.PROSPECTING_CRON_SECRET);
  const providedHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const auth = s(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const providedQuery = s(new URL(req.url).searchParams.get("secret"));
  const provided = providedHeader || bearer || providedQuery;
  if (!expected) return true;
  return provided === expected;
}

function normalizeAutoProposals(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, true),
    dedupeHours: clampInt(input.dedupeHours, 1, 168, 24),
    maxPerRun: clampInt(input.maxPerRun, 1, 12, 4),
  };
}

async function listTargets(singleTenantId: string) {
  const pool = getDbPool();
  const vals: unknown[] = [];
  let whereTenant = "";
  if (singleTenantId) {
    vals.push(singleTenantId);
    whereTenant = `and oi.organization_id = $${vals.length}::uuid`;
  }
  const q = await pool.query<{ organization_id: string; config: JsonMap | null }>(
    `
      select oi.organization_id, oi.config
      from app.organization_integrations oi
      join app.organizations o on o.id = oi.organization_id
      where oi.provider = 'custom'
        and oi.integration_key = 'agent'
        and oi.status = 'connected'
        and o.status = 'active'
        ${whereTenant}
      order by oi.organization_id asc
    `,
    vals,
  );
  return (q.rows || []).map((row) => {
    const cfg = (row.config || {}) as JsonMap;
    const auto = normalizeAutoProposals(cfg.autoProposals);
    return {
      tenantId: s(row.organization_id),
      autoProposals: auto,
    };
  });
}

async function run(req: Request, body?: JsonMap | null) {
  const startedAtMs = Date.now();
  const jobKey = "ads_opportunities_cron";
  const endpoint = new URL(req.url).pathname;
  const singleTenantId = s(body?.tenantId || new URL(req.url).searchParams.get("tenantId"));
  const range = s(body?.range || new URL(req.url).searchParams.get("range")) || "last_28_days";
  const source = s(body?.source || new URL(req.url).searchParams.get("source")) || "all";
  const maxPerTenantOverride = clampInt(
    body?.maxPerTenant || new URL(req.url).searchParams.get("maxPerTenant"),
    1,
    12,
    0,
  );
  const cooldownHoursOverride = clampInt(
    body?.cooldownHours || new URL(req.url).searchParams.get("cooldownHours"),
    1,
    168,
    0,
  );
  const dryRun = boolish(body?.dryRun || new URL(req.url).searchParams.get("dryRun"), true);

  await heartbeatStart({
    jobKey,
    endpoint,
    context: {
      tenantId: singleTenantId || null,
      range,
      source,
      dryRun,
      maxPerTenantOverride: maxPerTenantOverride || null,
      cooldownHoursOverride: cooldownHoursOverride || null,
    },
  });

  if (!ensureAuthorized(req)) {
    const unauthorized = { ok: false, error: "Unauthorized cron request." };
    await heartbeatFinish({
      jobKey,
      status: "unauthorized",
      startedAtMs,
      error: unauthorized.error,
      result: unauthorized,
    });
    return Response.json(unauthorized, { status: 401 });
  }

  let lockClient: {
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ ok?: boolean }> }>;
    release: () => void;
  } | null = null;
  let lockHeld = false;
  try {
    lockClient = (await getDbPool().connect()) as typeof lockClient;
    const lock = await lockClient.query(
      "select pg_try_advisory_lock($1::int, $2::int) as ok",
      [20260305, 1],
    );
    lockHeld = !!lock.rows?.[0]?.ok;
    if (!lockHeld) {
      const busy = { ok: true, skipped: "lock_busy", message: "Ads opportunities cron already running." };
      await heartbeatFinish({ jobKey, status: "ok", startedAtMs, result: busy });
      return Response.json(busy);
    }

    const origin = new URL(req.url).origin;
    const targets = await listTargets(singleTenantId);
    const rows: Array<Record<string, unknown>> = [];
    for (const target of targets) {
      const row: Record<string, unknown> = {
        tenantId: target.tenantId,
        autoEnabled: target.autoProposals.enabled,
        queued: 0,
        dryRun,
        errors: [] as string[],
      };
      try {
        if (!target.autoProposals.enabled) {
          row.skipped = "auto_proposals_disabled";
          rows.push(row);
          continue;
        }
        const maxProposals = maxPerTenantOverride || target.autoProposals.maxPerRun;
        const cooldownHours = cooldownHoursOverride || target.autoProposals.dedupeHours || 24;
        const payload = {
          tenantId: target.tenantId,
          integrationKey: "default",
          range,
          source,
          dryRun,
          maxProposals,
          cooldownHours,
          agentId: "soul_ads_optimizer",
        };
        const res = await fetch(`${origin}/api/dashboard/ads/opportunities`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-cron-call": "1",
            ...(s(process.env.CRON_SECRET) ? { "x-dashboard-cron-secret": s(process.env.CRON_SECRET) } : {}),
            ...(s(req.headers.get("x-vercel-cron")) ? { "x-vercel-cron": s(req.headers.get("x-vercel-cron")) } : {}),
          },
          body: JSON.stringify(payload),
          cache: "no-store",
        });
        const json = (await res.json().catch(() => ({}))) as JsonMap;
        if (!res.ok || !boolish(json.ok, false)) {
          throw new Error(s(json.error) || `HTTP ${res.status}`);
        }
        row.queued = n(json.queued, 0);
        row.isBootstrap = boolish(json.isBootstrap, false);
        row.activeCampaignCount = n(json.activeCampaignCount, 0);
        row.candidatesBeforeCooldown = n(json.candidatesBeforeCooldown, 0);
        row.cooldownHours = cooldownHours;
      } catch (e: unknown) {
        row.ok = false;
        (row.errors as string[]).push(e instanceof Error ? e.message : "Failed to queue ads opportunities");
      }
      rows.push(row);
    }

    const result = {
      ok: true,
      dryRun,
      totalTenants: rows.length,
      queued: rows.reduce((acc, r) => acc + n(r.queued, 0), 0),
      skippedDisabled: rows.filter((r) => s(r.skipped) === "auto_proposals_disabled").length,
      range,
      source,
      rows,
    };
    await heartbeatFinish({
      jobKey,
      status: "ok",
      startedAtMs,
      result: {
        totalTenants: result.totalTenants,
        queued: result.queued,
        skippedDisabled: result.skippedDisabled,
      },
    });
    return Response.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to run ads opportunities cron";
    await heartbeatFinish({
      jobKey,
      status: "error",
      startedAtMs,
      error: message,
      result: { ok: false },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  } finally {
    try {
      if (lockHeld && lockClient) {
        await lockClient.query("select pg_advisory_unlock($1::int, $2::int)", [20260305, 1]);
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

export async function GET(req: Request) {
  const url = new URL(req.url);
  return run(req, {
    tenantId: s(url.searchParams.get("tenantId")),
    range: s(url.searchParams.get("range")),
    source: s(url.searchParams.get("source")),
    maxPerTenant: s(url.searchParams.get("maxPerTenant")),
    cooldownHours: s(url.searchParams.get("cooldownHours")),
    dryRun: s(url.searchParams.get("dryRun")),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as JsonMap | null;
  return run(req, body);
}

