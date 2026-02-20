import { NextResponse } from "next/server";
import { authorizeTenantAgentRequest } from "@/lib/tenantAgentAuth";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type AgentNode = {
  enabled: boolean;
  agentId: string;
};

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function defaultAgents(): Record<string, AgentNode> {
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
  };
}

function normalizeAgents(raw: unknown): Record<string, AgentNode> {
  const defaults = defaultAgents();
  const input = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const out: Record<string, AgentNode> = {};
  for (const key of Object.keys(defaults)) {
    const row = (input[key] as Record<string, unknown> | undefined) || {};
    out[key] = {
      enabled: boolish(row.enabled, defaults[key].enabled),
      agentId: s(row.agentId) || defaults[key].agentId,
    };
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenantId = s(url.searchParams.get("organizationId") || url.searchParams.get("tenantId"));
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing organizationId" }, { status: 400 });
    }
    const auth = await authorizeTenantAgentRequest(req, tenantId, "tenant.read");
    if ("response" in auth) return auth.response;

    const pool = getDbPool();
    const q = await pool.query<{ status: string; config: Record<string, unknown> | null }>(
      `
        select status, config
        from app.organization_integrations
        where organization_id = $1::uuid
          and provider = 'custom'
          and integration_key = 'agent'
        limit 1
      `,
      [tenantId],
    );
    const row = q.rows[0];
    const cfg = (row?.config || {}) as Record<string, unknown>;
    const agents = normalizeAgents(cfg.agents);

    return NextResponse.json({
      ok: true,
      organizationId: tenantId,
      status: s(row?.status || "disconnected"),
      openclaw: {
        baseUrl: s(cfg.openclawBaseUrl),
        workspace: s(cfg.openclawWorkspace),
      },
      agents,
      actions: {
        publish_content: {
          requiredFields: ["channel", "title", "body"],
          endpoint: "/api/agents/proposals",
        },
        send_leads_ghl: {
          requiredFields: ["tenant_id"],
          endpoint: "/api/agents/proposals",
        },
        publish_ads: {
          requiredFields: ["platform", "account_id", "objective"],
          endpoint: "/api/agents/proposals",
        },
        optimize_ads: {
          requiredFields: ["platform", "account_id", "entity_type", "entity_id"],
          endpoint: "/api/agents/proposals",
        },
      },
      usage: {
        createProposal: {
          method: "POST",
          endpoint: "/api/agents/proposals",
          headers: ["content-type: application/json", "x-agent-api-key: <tenant-key>", "x-agent-id: <soul-id>"],
          bodyTemplate: {
            organizationId: tenantId,
            actionType: "optimize_ads",
            agentId: "soul_ads_optimizer",
            dashboardId: "ads",
            priority: "P2",
            riskLevel: "medium",
            expectedImpact: "medium",
            summary: "Optimize underperforming ad set",
            payload: {
              tenant_id: tenantId,
              recommendation: "Pause low CTR ad and shift 15% budget to top performer",
            },
          },
        },
      },
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to build agents manifest" },
      { status: 500 },
    );
  }
}

