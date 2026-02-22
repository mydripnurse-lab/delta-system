import { createProposal, decideProposal } from "@/lib/agentProposalStore";
import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

type ExecutePlanItem = {
  priority: "P1" | "P2" | "P3";
  action: string;
  dashboard:
    | "calls"
    | "leads"
    | "prospecting"
    | "conversations"
    | "transactions"
    | "appointments"
    | "gsc"
    | "ga"
    | "ads"
    | "facebook_ads";
  rationale: string;
  trigger_metric: string;
};

type TenantTarget = {
  tenantId: string;
  agents: Record<string, { enabled: boolean; agentId: string }>;
  autoProposals: {
    enabled: boolean;
    dedupeHours: number;
    maxPerRun: number;
  };
  autoApproval: {
    enabled: boolean;
    maxRisk: "low" | "medium" | "high";
    maxPriority: "P1" | "P2" | "P3";
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

function normalizePriority(v: unknown): "P1" | "P2" | "P3" {
  const x = s(v).toUpperCase();
  if (x === "P1" || x === "P2" || x === "P3") return x;
  return "P2";
}

function normalizeRisk(v: unknown): "low" | "medium" | "high" {
  const x = s(v).toLowerCase();
  if (x === "low" || x === "medium" || x === "high") return x;
  return "low";
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

function computeRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 28);
  return { start: start.toISOString(), end: end.toISOString(), preset: "28d" };
}

function actionTypeForDashboard(dashboard: ExecutePlanItem["dashboard"]) {
  if (dashboard === "leads" || dashboard === "prospecting") return "send_leads_ghl" as const;
  if (dashboard === "ads" || dashboard === "facebook_ads") return "optimize_ads" as const;
  return "publish_content" as const;
}

function fallbackAgentIdForDashboard(dashboard: ExecutePlanItem["dashboard"]) {
  if (dashboard === "leads" || dashboard === "prospecting") return "soul_leads_prospecting";
  if (dashboard === "ads") return "soul_ads_optimizer";
  if (dashboard === "facebook_ads") return "soul_facebook_ads";
  if (dashboard === "calls") return "soul_calls";
  if (dashboard === "conversations") return "soul_conversations";
  if (dashboard === "transactions") return "soul_transactions";
  if (dashboard === "appointments") return "soul_appointments";
  if (dashboard === "gsc") return "soul_gsc";
  if (dashboard === "ga") return "soul_ga";
  return "soul_content_publisher";
}

function defaultAgents() {
  return {
    central: { enabled: true, agentId: "soul_central_orchestrator" },
    calls: { enabled: true, agentId: "soul_calls" },
    leads: { enabled: true, agentId: "soul_leads_prospecting" },
    conversations: { enabled: true, agentId: "soul_conversations" },
    transactions: { enabled: true, agentId: "soul_transactions" },
    appointments: { enabled: true, agentId: "soul_appointments" },
    gsc: { enabled: true, agentId: "soul_gsc" },
    ga: { enabled: true, agentId: "soul_ga" },
    ads: { enabled: true, agentId: "soul_ads_optimizer" },
    facebook_ads: { enabled: true, agentId: "soul_facebook_ads" },
    content: { enabled: true, agentId: "soul_content_publisher" },
  } satisfies Record<string, { enabled: boolean; agentId: string }>;
}

function normalizeAgents(raw: unknown) {
  const defaults = defaultAgents();
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, { enabled: boolean; agentId: string }> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const row = (input[key] as Record<string, unknown> | undefined) || {};
    out[key] = {
      enabled: boolish(row.enabled, defaults[key].enabled),
      agentId: s(row.agentId) || defaults[key].agentId,
    };
  }
  return out;
}

function normalizeAutoProposals(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, true),
    dedupeHours: clampInt(input.dedupeHours, 1, 72, 8),
    maxPerRun: clampInt(input.maxPerRun, 1, 12, 6),
  };
}

function normalizeAutoApproval(raw: unknown) {
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, false),
    maxRisk: normalizeRisk(input.maxRisk),
    maxPriority: normalizePriority(input.maxPriority),
  };
}

function riskRank(risk: "low" | "medium" | "high") {
  if (risk === "low") return 1;
  if (risk === "medium") return 2;
  return 3;
}

function priorityRank(priority: "P1" | "P2" | "P3") {
  if (priority === "P1") return 1;
  if (priority === "P2") return 2;
  return 3;
}

function shouldAutoApprove(input: {
  enabled: boolean;
  maxRisk: "low" | "medium" | "high";
  maxPriority: "P1" | "P2" | "P3";
  riskLevel: "low" | "medium" | "high";
  priority: "P1" | "P2" | "P3";
}) {
  if (!input.enabled) return false;
  return (
    riskRank(input.riskLevel) <= riskRank(input.maxRisk) &&
    priorityRank(input.priority) >= priorityRank(input.maxPriority)
  );
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
  return json || {};
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
    agents: normalizeAgents((r.config || {}).agents),
    autoProposals: normalizeAutoProposals((r.config || {}).autoProposals),
    autoApproval: normalizeAutoApproval((r.config || {}).autoApproval),
  }));
}

async function hasRecentSimilarProposal(input: {
  organizationId: string;
  actionType: "publish_content" | "send_leads_ghl" | "publish_ads" | "optimize_ads";
  dashboardId: string;
  summary: string;
  lookbackHours: number;
}) {
  const pool = getDbPool();
  const q = await pool.query<{ c: string }>(
    `
      select count(*)::text as c
      from app.agent_proposals
      where organization_id = $1::uuid
        and action_type = $2
        and dashboard_id = $3
        and summary = $4
        and status in ('proposed', 'approved', 'executed')
        and created_at >= now() - make_interval(hours => $5::int)
    `,
    [input.organizationId, input.actionType, input.dashboardId, input.summary, input.lookbackHours],
  );
  return Number(q.rows[0]?.c || "0") > 0;
}

async function buildExecutePlanForTenant(input: {
  origin: string;
  tenantId: string;
  integrationKey: string;
  start: string;
  end: string;
  preset: string;
}) {
  const qs = new URLSearchParams();
  qs.set("tenantId", input.tenantId);
  qs.set("integrationKey", input.integrationKey);
  qs.set("start", input.start);
  qs.set("end", input.end);
  qs.set("preset", input.preset);
  qs.set("compare", "1");
  const overview = await fetchJson(`${input.origin}/api/dashboard/overview?${qs.toString()}`);
  const payload = {
    range: overview.range || null,
    prevRange: overview.prevRange || null,
    executive: overview.executive || null,
    modules: overview.modules || null,
    swarm_agents: [
      "calls_strategist",
      "leads_strategist",
      "conversations_strategist",
      "transactions_strategist",
      "appointments_strategist",
      "gsc_strategist",
      "ga_strategist",
      "ads_strategist",
    ],
    objective: "Maximize growth efficiency with clear CEO-level decisions and cross-agent orchestration.",
    readiness: {
      gsc: { status: "test_mode_pending_approval", note: "GSC is pending approval to move out of test mode." },
      facebook_ads: { status: "not_configured", note: "Facebook Ads setup is pending." },
      keyword_planner: {
        status: "planned",
        note: "Google Ads Keyword Planner integration is planned for campaign recommendation automation.",
      },
    },
  };
  const insights = await fetchJson(`${input.origin}/api/dashboard/overview/insights`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const plan = (insights.insights as JsonMap | undefined)?.execute_plan;
  return Array.isArray(plan) ? (plan as Array<Record<string, unknown>>) : [];
}

async function runAutoProposals(req: Request, body?: JsonMap | null) {
  const startedAtMs = Date.now();
  const jobKey = "overview_auto_proposals_cron";
  const endpoint = new URL(req.url).pathname;

  const singleTenantId = s(body?.tenantId);
  const integrationKey = s(body?.integrationKey) || "owner";
  const globalDedupeHours = clampInt(body?.dedupeHours, 1, 72, 0);
  const globalMaxPerTenant = clampInt(body?.maxPerTenant, 1, 12, 0);
  const dryRun = boolish(body?.dryRun, false);
  await heartbeatStart({
    jobKey,
    endpoint,
    context: {
      tenantId: singleTenantId || null,
      integrationKey,
      dryRun,
      dedupeHoursOverride: globalDedupeHours || null,
      maxPerTenantOverride: globalMaxPerTenant || null,
    },
  });
  if (!(await isAuthorized(req, body))) {
    const unauthorized = { ok: false, error: "Unauthorized cron secret." };
    await heartbeatFinish({
      jobKey,
      status: "unauthorized",
      startedAtMs,
      error: unauthorized.error,
      result: unauthorized,
    });
    return Response.json(unauthorized, { status: 401 });
  }
  try {
    const { start, end, preset } = computeRange();
    const origin = new URL(req.url).origin;
    const targets = await listTargets(singleTenantId);
    const allowAutoApproval = boolish(process.env.AGENT_ALLOW_AUTO_APPROVAL, false);

    const rows: Array<Record<string, unknown>> = [];
    for (const target of targets) {
      const row: Record<string, unknown> = {
        tenantId: target.tenantId,
        ok: true,
        autoEnabled: target.autoProposals.enabled,
        generated: 0,
        autoApproved: 0,
        wouldGenerate: 0,
        deduped: 0,
        skippedDisabled: 0,
        skippedNoAgent: 0,
        skippedAutoDisabled: 0,
        errors: [] as string[],
      };
      try {
        if (!target.autoProposals.enabled) {
          row.skippedAutoDisabled = 1;
          rows.push(row);
          continue;
        }
        const lookbackHours = globalDedupeHours || target.autoProposals.dedupeHours;
        const maxPerTenant = globalMaxPerTenant || target.autoProposals.maxPerRun;
        row.dedupeHours = lookbackHours;
        row.maxPerTenant = maxPerTenant;
        const rawPlan = await buildExecutePlanForTenant({
          origin,
          tenantId: target.tenantId,
          integrationKey,
          start,
          end,
          preset,
        });
        row.planItems = rawPlan.length;
        for (const item of rawPlan.slice(0, maxPerTenant)) {
          const dashboard = s(item.dashboard) as ExecutePlanItem["dashboard"];
          const action = s(item.action);
          const rationale = s(item.rationale);
          const triggerMetric = s(item.trigger_metric);
          const priority = normalizePriority(item.priority);
          if (!dashboard || !action) continue;

          const routeKey = dashboard === "prospecting" ? "leads" : dashboard;
          const agentNode = target.agents[routeKey];
          if (agentNode && !agentNode.enabled) {
            row.skippedDisabled = Number(row.skippedDisabled || 0) + 1;
            continue;
          }
          const agentId = s(agentNode?.agentId) || fallbackAgentIdForDashboard(dashboard);
          if (!agentId) {
            row.skippedNoAgent = Number(row.skippedNoAgent || 0) + 1;
            continue;
          }

          const actionType = actionTypeForDashboard(dashboard);
          const summary = `${action} (${dashboard})`;
          const alreadyExists = await hasRecentSimilarProposal({
            organizationId: target.tenantId,
            actionType,
            dashboardId: dashboard,
            summary,
            lookbackHours,
          });
          if (alreadyExists) {
            row.deduped = Number(row.deduped || 0) + 1;
            continue;
          }

          const riskLevel = priority === "P1" ? "high" : priority === "P2" ? "medium" : "low";
          const expectedImpact = priority === "P1" ? "high" : priority === "P2" ? "medium" : "low";
          if (dryRun) {
            row.wouldGenerate = Number(row.wouldGenerate || 0) + 1;
            continue;
          }
          const created = await createProposal({
            organizationId: target.tenantId,
            actionType,
            agentId,
            dashboardId: dashboard,
            priority,
            riskLevel,
            expectedImpact,
            summary,
            payload: {
              tenant_id: target.tenantId,
              integration_key: integrationKey,
              dashboard,
              recommended_action: action,
              rationale,
              trigger_metric: triggerMetric,
              source: "overview_execute_plan_cron",
              generated_at: new Date().toISOString(),
            },
            policyAutoApproved: false,
            approvalRequired: true,
          });
          const autoApprove = shouldAutoApprove({
            enabled: allowAutoApproval && target.autoApproval.enabled,
            maxRisk: target.autoApproval.maxRisk,
            maxPriority: target.autoApproval.maxPriority,
            riskLevel,
            priority,
          });
          if (autoApprove) {
            await decideProposal({
              proposalId: s(created.id),
              decision: "approved",
              actor: "system:auto_approval_cron",
              note: `Auto-approved by tenant policy (maxRisk=${target.autoApproval.maxRisk}, maxPriority=${target.autoApproval.maxPriority}).`,
            });
            row.autoApproved = Number(row.autoApproved || 0) + 1;
          }
          row.generated = Number(row.generated || 0) + 1;
        }
      } catch (e: unknown) {
        row.ok = false;
        (row.errors as string[]).push(e instanceof Error ? e.message : "Failed to generate proposals");
      }
      rows.push(row);
    }

    const result = {
      ok: true,
      dryRun,
      policy: {
        autoApprovalEnabledByEnv: allowAutoApproval,
        requiresManualApprovalByDefault: !allowAutoApproval,
      },
      totalTenants: rows.length,
      generated: rows.reduce((acc, r) => acc + Number(r.generated || 0), 0),
      autoApproved: rows.reduce((acc, r) => acc + Number(r.autoApproved || 0), 0),
      wouldGenerate: rows.reduce((acc, r) => acc + Number(r.wouldGenerate || 0), 0),
      deduped: rows.reduce((acc, r) => acc + Number(r.deduped || 0), 0),
      skippedAutoDisabled: rows.reduce((acc, r) => acc + Number(r.skippedAutoDisabled || 0), 0),
      defaults: { dedupeHours: 8, maxPerRun: 6 },
      globalOverrides: {
        dedupeHours: globalDedupeHours || null,
        maxPerTenant: globalMaxPerTenant || null,
      },
      range: { start, end, preset },
      rows,
    };
    await heartbeatFinish({
      jobKey,
      status: "ok",
      startedAtMs,
      result: {
        totalTenants: result.totalTenants,
        generated: result.generated,
        autoApproved: result.autoApproved,
        deduped: result.deduped,
      },
    });
    return Response.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to run auto proposals cron";
    await heartbeatFinish({
      jobKey,
      status: "error",
      startedAtMs,
      error: message,
      result: { ok: false },
    });
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  return runAutoProposals(req, {
    tenantId: s(url.searchParams.get("tenantId")),
    integrationKey: s(url.searchParams.get("integrationKey")),
    dedupeHours: s(url.searchParams.get("dedupeHours")),
    maxPerTenant: s(url.searchParams.get("maxPerTenant")),
    dryRun: s(url.searchParams.get("dryRun")),
    secret: s(url.searchParams.get("secret")),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as JsonMap | null;
  return runAutoProposals(req, body);
}
