import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
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
  displayName?: string;
};

type AutoProposalsConfig = {
  enabled: boolean;
  dedupeHours: number;
  maxPerRun: number;
};

type AutoExecutionConfig = {
  enabled: boolean;
  maxPerRun: number;
};

type AutoApprovalConfig = {
  enabled: boolean;
  maxRisk: "low" | "medium" | "high";
  maxPriority: "P1" | "P2" | "P3";
};

function defaultAgents(): Record<DashboardAgentKey, AgentNode> {
  return {
    central: { enabled: true, agentId: "soul_central_orchestrator", displayName: "Central Orchestrator" },
    calls: { enabled: true, agentId: "soul_calls", displayName: "Call Intelligence Agent" },
    leads: { enabled: true, agentId: "soul_leads_prospecting", displayName: "Leads Prospecting Agent" },
    conversations: { enabled: true, agentId: "soul_conversations", displayName: "Conversation Recovery Agent" },
    transactions: { enabled: true, agentId: "soul_transactions", displayName: "Revenue Intelligence Agent" },
    appointments: { enabled: true, agentId: "soul_appointments", displayName: "Appointments Intelligence Agent" },
    gsc: { enabled: true, agentId: "soul_gsc", displayName: "Search Console Agent" },
    ga: { enabled: true, agentId: "soul_ga", displayName: "Analytics Agent" },
    ads: { enabled: true, agentId: "soul_ads_optimizer", displayName: "Ads Optimizer Agent" },
    facebook_ads: { enabled: true, agentId: "soul_facebook_ads", displayName: "Facebook Ads Agent" },
    content: { enabled: true, agentId: "soul_content_publisher", displayName: "Content Publisher Agent" },
  };
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

function normalizeAgents(raw: unknown) {
  const defaults = defaultAgents();
  const input = (raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}) as Record<string, unknown>;
  const out: Record<DashboardAgentKey, AgentNode> = { ...defaults };
  (Object.keys(defaults) as DashboardAgentKey[]).forEach((key) => {
    const row = (input[key] as Record<string, unknown> | undefined) || {};
    const identity = asObj(row.identity);
    const nextId = s(row.agentId) || defaults[key].agentId;
    out[key] = {
      enabled: boolish(row.enabled, defaults[key].enabled),
      agentId: nextId,
      displayName:
        s(row.displayName) ||
        s(row.identityName) ||
        s(identity.displayName) ||
        s(identity.name) ||
        s(row.name) ||
        s(row.label) ||
        s(defaults[key].displayName),
    };
  });
  return out;
}

function defaultAutoProposals(): AutoProposalsConfig {
  return {
    enabled: true,
    dedupeHours: 8,
    maxPerRun: 6,
  };
}

function normalizeAutoProposals(raw: unknown): AutoProposalsConfig {
  const defaults = defaultAutoProposals();
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, defaults.enabled),
    dedupeHours: clampInt(input.dedupeHours, 1, 72, defaults.dedupeHours),
    maxPerRun: clampInt(input.maxPerRun, 1, 12, defaults.maxPerRun),
  };
}

function defaultAutoExecution(): AutoExecutionConfig {
  return {
    enabled: false,
    maxPerRun: 4,
  };
}

function normalizeAutoExecution(raw: unknown): AutoExecutionConfig {
  const defaults = defaultAutoExecution();
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, defaults.enabled),
    maxPerRun: clampInt(input.maxPerRun, 1, 20, defaults.maxPerRun),
  };
}

function normalizeRisk(v: unknown): "low" | "medium" | "high" {
  const x = s(v).toLowerCase();
  if (x === "low" || x === "medium" || x === "high") return x;
  return "low";
}

function normalizePriority(v: unknown): "P1" | "P2" | "P3" {
  const x = s(v).toUpperCase();
  if (x === "P1" || x === "P2" || x === "P3") return x;
  return "P3";
}

function defaultAutoApproval(): AutoApprovalConfig {
  return {
    enabled: false,
    maxRisk: "low",
    maxPriority: "P3",
  };
}

function normalizeAutoApproval(raw: unknown): AutoApprovalConfig {
  const defaults = defaultAutoApproval();
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: boolish(input.enabled, defaults.enabled),
    maxRisk: normalizeRisk(input.maxRisk ?? defaults.maxRisk),
    maxPriority: normalizePriority(input.maxPriority ?? defaults.maxPriority),
  };
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
  const autoProposals = normalizeAutoProposals(cfg.autoProposals);
  const autoExecution = normalizeAutoExecution(cfg.autoExecution);
  const autoApproval = normalizeAutoApproval(cfg.autoApproval);
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
    autoProposals,
    autoExecution,
    autoApproval,
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
    autoProposals: normalizeAutoProposals(body.autoProposals || currentCfg.autoProposals),
    autoExecution: normalizeAutoExecution(body.autoExecution || currentCfg.autoExecution),
    autoApproval: normalizeAutoApproval(body.autoApproval || currentCfg.autoApproval),
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
    autoProposals: config.autoProposals,
    autoExecution: config.autoExecution,
    autoApproval: config.autoApproval,
    agents: config.agents,
  });
}
