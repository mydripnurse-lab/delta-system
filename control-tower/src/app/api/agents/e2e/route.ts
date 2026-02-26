import { NextResponse } from "next/server";
import { createProposal } from "@/lib/agentProposalStore";
import { authorizeTenantAgentRequest } from "@/lib/tenantAgentAuth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

type DashboardKey =
  | "central"
  | "calls"
  | "leads"
  | "prospecting"
  | "conversations"
  | "transactions"
  | "appointments"
  | "gsc"
  | "ga"
  | "ads"
  | "facebook_ads"
  | "youtube_ads"
  | "content"
  | "seo_canva";

function mapDashboardToActionType(dashboard: DashboardKey) {
  if (dashboard === "leads" || dashboard === "prospecting") return "send_leads_ghl" as const;
  if (dashboard === "ads" || dashboard === "facebook_ads" || dashboard === "youtube_ads") return "optimize_ads" as const;
  return "publish_content" as const;
}

function mapDashboardToAgent(dashboard: DashboardKey) {
  if (dashboard === "leads" || dashboard === "prospecting") return "soul_leads_prospecting";
  if (dashboard === "ads") return "soul_ads_optimizer";
  if (dashboard === "facebook_ads") return "soul_facebook_ads";
  if (dashboard === "youtube_ads") return "soul_youtube_ads";
  if (dashboard === "calls") return "soul_calls";
  if (dashboard === "conversations") return "soul_conversations";
  if (dashboard === "transactions") return "soul_transactions";
  if (dashboard === "appointments") return "soul_appointments";
  if (dashboard === "gsc") return "soul_gsc";
  if (dashboard === "ga") return "soul_ga";
  if (dashboard === "central") return "soul_central_orchestrator";
  if (dashboard === "seo_canva") return "soul_seo_canvas_strategist";
  return "soul_content_publisher";
}

function mapDashboardToDashboardId(dashboard: DashboardKey) {
  if (dashboard === "leads") return "prospecting";
  if (dashboard === "central") return "overview";
  return dashboard;
}

async function readTenantAgentConfig(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ config: JsonMap | null }>(
    `
      select config
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider = 'custom'
        and integration_key = 'agent'
        and status = 'connected'
      limit 1
    `,
    [tenantId],
  );
  const cfg = (q.rows[0]?.config || {}) as JsonMap;
  const raw = (cfg.agents && typeof cfg.agents === "object" ? cfg.agents : {}) as Record<string, JsonMap>;
  return raw;
}

async function hasRecentE2EProposal(input: {
  tenantId: string;
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
        and coalesce(payload->>'source','') = 'e2e_validation'
    `,
    [input.tenantId, input.actionType, input.dashboardId, input.summary, input.lookbackHours],
  );
  return Number(q.rows[0]?.c || "0") > 0;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const tenantId = s(body?.tenantId || body?.organizationId);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    const auth = await authorizeTenantAgentRequest(req, tenantId, "tenant.manage");
    if ("response" in auth) return auth.response;

    const dryRun = boolish(body?.dryRun, false);
    const lookbackHours = Math.max(1, Math.min(72, Number(body?.dedupeHours || 24)));
    const include = Array.isArray(body?.dashboards)
      ? (body?.dashboards as unknown[]).map((x) => s(x).toLowerCase()).filter(Boolean)
      : [];

    const agentCfg = await readTenantAgentConfig(tenantId);
    const allDashboards: DashboardKey[] = [
      "calls",
      "prospecting",
      "conversations",
      "transactions",
      "appointments",
      "gsc",
      "ga",
      "ads",
      "facebook_ads",
      "youtube_ads",
      "content",
      "seo_canva",
      "central",
    ];
    const targets = include.length
      ? allDashboards.filter((d) => include.includes(d))
      : allDashboards;

    const rows: Array<Record<string, unknown>> = [];
    for (const key of targets) {
      const routeKey = key === "prospecting" ? "leads" : key;
      const node = (agentCfg[routeKey] || {}) as JsonMap;
      const enabled = node.enabled === undefined ? true : boolish(node.enabled, true);
      if (!enabled) {
        rows.push({ dashboard: key, skipped: "disabled" });
        continue;
      }
      const agentId = s(node.agentId) || mapDashboardToAgent(key);
      const dashboardId = mapDashboardToDashboardId(key);
      const actionType = mapDashboardToActionType(key);
      const summary = `E2E validation proposal (${dashboardId})`;

      const duplicate = await hasRecentE2EProposal({
        tenantId,
        actionType,
        dashboardId,
        summary,
        lookbackHours,
      });
      if (duplicate) {
        rows.push({ dashboard: key, deduped: true });
        continue;
      }
      if (dryRun) {
        rows.push({ dashboard: key, wouldCreate: true, actionType, agentId, summary });
        continue;
      }

      const proposal = await createProposal({
        organizationId: tenantId,
        actionType,
        agentId,
        dashboardId,
        priority: "P2",
        riskLevel: "low",
        expectedImpact: "medium",
        summary,
        payload: {
          tenant_id: tenantId,
          dashboard: dashboardId,
          source: "e2e_validation",
          note: "Synthetic proposal to validate Notification Hub flow.",
          generated_at: new Date().toISOString(),
        },
        policyAutoApproved: false,
        approvalRequired: true,
      });
      rows.push({ dashboard: key, created: true, proposalId: s(proposal.id), actionType, agentId });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      tenantId,
      lookbackHours,
      created: rows.filter((r) => r.created).length,
      deduped: rows.filter((r) => r.deduped).length,
      skippedDisabled: rows.filter((r) => r.skipped === "disabled").length,
      rows,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to run e2e validation" },
      { status: 500 },
    );
  }
}
