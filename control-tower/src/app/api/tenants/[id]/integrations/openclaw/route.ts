import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type DashboardAgentKey =
  | "central"
  | "calls"
  | "leads"
  | "conversations"
  | "transactions"
  | "appointments"
  | "gsc"
  | "ga"
  | "ads"
  | "facebook_ads"
  | "content";

type AgentNode = {
  enabled: boolean;
  agentId: string;
};

function defaultAgents(): Record<DashboardAgentKey, AgentNode> {
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

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function normalizeAgents(raw: unknown) {
  const defaults = defaultAgents();
  const input = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const out: Record<DashboardAgentKey, AgentNode> = { ...defaults };
  (Object.keys(defaults) as DashboardAgentKey[]).forEach((key) => {
    const row = (input[key] as Record<string, unknown> | undefined) || {};
    const nextId = s(row.agentId) || defaults[key].agentId;
    out[key] = {
      enabled: boolish(row.enabled, defaults[key].enabled),
      agentId: nextId,
    };
  });
  return out;
}

function maskKey(raw: string) {
  const v = s(raw);
  if (!v) return "";
  if (v.length <= 10) return `${v.slice(0, 2)}***${v.slice(-2)}`;
  return `${v.slice(0, 6)}...${v.slice(-4)}`;
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const pool = getDbPool();
  const q = await pool.query<{
    status: string;
    config: Record<string, unknown> | null;
    updated_at: string | null;
  }>(
    `
      select status, config, updated_at::text
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
  const key = s(cfg.agentApiKey || cfg.openclawApiKey || cfg.apiKey);
  const agents = normalizeAgents(cfg.agents);
  const openclawBaseUrl = s(cfg.openclawBaseUrl);
  const openclawWorkspace = s(cfg.openclawWorkspace);
  return NextResponse.json({
    ok: true,
    provider: "custom",
    integrationKey: "agent",
    status: row?.status || "disconnected",
    hasApiKey: Boolean(key),
    apiKeyMasked: key ? maskKey(key) : "",
    openclawBaseUrl,
    openclawWorkspace,
    agents,
    updatedAt: row?.updated_at || null,
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rotate = s(body.rotate) === "1" || s(body.rotate).toLowerCase() === "true";
  const provided = s(body.apiKey);
  const nextKey = provided || (rotate ? randomBytes(24).toString("base64url") : "");
  const enabled = s(body.enabled).toLowerCase() !== "false";
  const currentQ = await getDbPool().query<{ config: Record<string, unknown> | null }>(
    `
      select config
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider = 'custom'
        and integration_key = 'agent'
      limit 1
    `,
    [tenantId],
  );
  const currentCfg = (currentQ.rows[0]?.config || {}) as Record<string, unknown>;
  const currentKey = s(currentCfg.agentApiKey || currentCfg.openclawApiKey || currentCfg.apiKey);
  const finalKey = nextKey || currentKey;
  if (!finalKey) {
    return NextResponse.json(
      { ok: false, error: "Missing apiKey. Provide apiKey or set rotate=true." },
      { status: 400 },
    );
  }

  const pool = getDbPool();
  const config = {
    ...currentCfg,
    agentApiKey: finalKey,
    openclawBaseUrl: s(body.openclawBaseUrl) || s(currentCfg.openclawBaseUrl),
    openclawWorkspace: s(body.openclawWorkspace) || s(currentCfg.openclawWorkspace),
    agents: normalizeAgents(body.agents || currentCfg.agents),
  };
  await pool.query(
    `
      insert into app.organization_integrations (
        organization_id, provider, integration_key, status, auth_type, config, metadata
      ) values (
        $1::uuid, 'custom', 'agent', $2, 'api_key', $3::jsonb, '{}'::jsonb
      )
      on conflict (organization_id, provider, integration_key)
      do update set
        status = excluded.status,
        auth_type = excluded.auth_type,
        config = excluded.config,
        updated_at = now()
    `,
    [tenantId, enabled ? "connected" : "disconnected", JSON.stringify(config)],
  );

  return NextResponse.json({
    ok: true,
    provider: "custom",
    integrationKey: "agent",
    status: enabled ? "connected" : "disconnected",
    apiKey: nextKey || undefined,
    apiKeyMasked: maskKey(finalKey),
    openclawBaseUrl: s(config.openclawBaseUrl),
    openclawWorkspace: s(config.openclawWorkspace),
    agents: config.agents,
  });
}
