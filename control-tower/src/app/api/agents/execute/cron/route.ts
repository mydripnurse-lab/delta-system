import { executeApprovedProposal } from "@/lib/agentExecution";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

type TenantTarget = {
  tenantId: string;
  autoExecution: {
    enabled: boolean;
    maxPerRun: number;
  };
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const x = Math.trunc(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

function normalizeAutoExecution(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, false),
    maxPerRun: clampInt(input.maxPerRun, 1, 20, 4),
  };
}

async function readTenantAgentApiKeys(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{
    k1: string | null;
    k2: string | null;
    k3: string | null;
    k4: string | null;
  }>(
    `
      select
        nullif(config->>'agentApiKey', '') as k1,
        nullif(config->>'openclawApiKey', '') as k2,
        nullif(config->>'apiKey', '') as k3,
        nullif(config->>'webhookSecret', '') as k4
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider in ('custom', 'openai')
        and integration_key in ('agent', 'default', 'owner')
      order by
        case provider when 'custom' then 0 else 1 end,
        case integration_key when 'agent' then 0 when 'default' then 1 else 2 end
      limit 3
    `,
    [tenantId],
  );
  const out = new Set<string>();
  for (const row of q.rows) {
    for (const v of [row.k1, row.k2, row.k3, row.k4]) {
      const key = s(v);
      if (key) out.add(key);
    }
  }
  return out;
}

async function isAuthorized(req: Request, body?: JsonMap | null) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const tokenHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const authHeader = s(req.headers.get("authorization"));
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const tokenBody = s(body?.secret);
  const token = tokenHeader || bearer || tokenBody;
  const expected = s(
    process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET || process.env.PROSPECTING_CRON_SECRET,
  );
  if (expected && token === expected) return true;

  const singleTenantId = s(body?.tenantId);
  if (singleTenantId && token) {
    const tenantKeys = await readTenantAgentApiKeys(singleTenantId);
    if (tenantKeys.has(token)) return true;
  }

  if (!expected) return true;
  return false;
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
  return (q.rows || []).map<TenantTarget>((r) => ({
    tenantId: s(r.organization_id),
    autoExecution: normalizeAutoExecution((r.config || {}).autoExecution),
  }));
}

async function listApprovedProposalIds(tenantId: string, limit: number) {
  const pool = getDbPool();
  const q = await pool.query<{ id: string }>(
    `
      select id::text as id
      from app.agent_proposals
      where organization_id = $1::uuid
        and status = 'approved'
      order by coalesce(approved_at, created_at) asc
      limit $2::int
    `,
    [tenantId, limit],
  );
  return (q.rows || []).map((r) => s(r.id)).filter(Boolean);
}

async function runAutoExecute(req: Request, body?: JsonMap | null) {
  if (!(await isAuthorized(req, body))) {
    return Response.json({ ok: false, error: "Unauthorized cron secret." }, { status: 401 });
  }

  const singleTenantId = s(body?.tenantId);
  const globalMaxPerTenant = clampInt(body?.maxPerTenant, 1, 20, 0);
  const globalMaxTotal = clampInt(body?.maxTotal, 1, 200, 50);
  const dryRun = boolish(body?.dryRun, false);
  const origin = new URL(req.url).origin;
  const targets = await listTargets(singleTenantId);

  const rows: Array<Record<string, unknown>> = [];
  let executedTotal = 0;
  for (const target of targets) {
    const row: Record<string, unknown> = {
      tenantId: target.tenantId,
      autoEnabled: target.autoExecution.enabled,
      approvedFound: 0,
      executed: 0,
      wouldExecute: 0,
      failed: 0,
      errors: [] as string[],
    };
    try {
      if (!target.autoExecution.enabled) {
        row.skipped = "auto_execution_disabled";
        rows.push(row);
        continue;
      }
      if (executedTotal >= globalMaxTotal) {
        row.skipped = "global_limit_reached";
        rows.push(row);
        continue;
      }
      const maxPerTenant = globalMaxPerTenant || target.autoExecution.maxPerRun;
      row.maxPerTenant = maxPerTenant;
      const remainingGlobal = Math.max(0, globalMaxTotal - executedTotal);
      const limit = Math.min(maxPerTenant, remainingGlobal);
      const proposalIds = await listApprovedProposalIds(target.tenantId, limit);
      row.approvedFound = proposalIds.length;
      for (const proposalId of proposalIds) {
        if (dryRun) {
          row.wouldExecute = Number(row.wouldExecute || 0) + 1;
          continue;
        }
        try {
          await executeApprovedProposal({
            proposalId,
            actor: "system:auto_execute_cron",
            origin,
          });
          row.executed = Number(row.executed || 0) + 1;
          executedTotal += 1;
        } catch (e: unknown) {
          row.failed = Number(row.failed || 0) + 1;
          (row.errors as string[]).push(`${proposalId}: ${e instanceof Error ? e.message : "execution failed"}`);
        }
      }
    } catch (e: unknown) {
      row.failed = Number(row.failed || 0) + 1;
      (row.errors as string[]).push(e instanceof Error ? e.message : "Failed to process tenant");
    }
    rows.push(row);
  }

  return Response.json({
    ok: true,
    dryRun,
    totalTenants: rows.length,
    executed: rows.reduce((acc, r) => acc + Number(r.executed || 0), 0),
    wouldExecute: rows.reduce((acc, r) => acc + Number(r.wouldExecute || 0), 0),
    failed: rows.reduce((acc, r) => acc + Number(r.failed || 0), 0),
    skippedDisabled: rows.filter((r) => r.skipped === "auto_execution_disabled").length,
    skippedGlobalLimit: rows.filter((r) => r.skipped === "global_limit_reached").length,
    defaults: { maxPerRun: 4, maxTotal: 50 },
    globalOverrides: {
      maxPerTenant: globalMaxPerTenant || null,
      maxTotal: globalMaxTotal || null,
    },
    rows,
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return runAutoExecute(req, {
    tenantId: s(url.searchParams.get("tenantId")),
    maxPerTenant: s(url.searchParams.get("maxPerTenant")),
    maxTotal: s(url.searchParams.get("maxTotal")),
    dryRun: s(url.searchParams.get("dryRun")),
    secret: s(url.searchParams.get("secret")),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as JsonMap | null;
  return runAutoExecute(req, body);
}
