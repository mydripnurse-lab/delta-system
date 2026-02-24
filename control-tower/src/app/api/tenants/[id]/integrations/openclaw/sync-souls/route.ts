import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

type AgentNode = {
  enabled: boolean;
  agentId: string;
  displayName?: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function defaultAgents(): Record<string, AgentNode> {
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
    youtube_ads: { enabled: true, agentId: "soul_youtube_ads", displayName: "YouTube Ads Agent" },
    content: { enabled: true, agentId: "soul_content_publisher", displayName: "Content Publisher Agent" },
  };
}

function normalizeAgents(raw: unknown) {
  const defaults = defaultAgents();
  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: Record<string, AgentNode> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const row = (input[key] as Record<string, unknown> | undefined) || {};
    out[key] = {
      enabled: boolish(row.enabled, defaults[key].enabled),
      agentId: s(row.agentId) || defaults[key].agentId,
      displayName: s(row.displayName) || defaults[key].displayName,
    };
  }
  return out;
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query("select 1 from app.organizations where id = $1::uuid limit 1", [tenantId]);
  return !!q.rows[0];
}

async function fetchTenantOpenclawCfg(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ status: string; config: JsonMap | null }>(
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
  const cfg = (row?.config || {}) as JsonMap;
  const apiKey = s(cfg.agentApiKey || cfg.openclawApiKey || cfg.apiKey);
  const openclawBaseUrl = s(cfg.openclawBaseUrl).replace(/\/+$/, "");
  const openclawWorkspace = s(cfg.openclawWorkspace);
  const agents = normalizeAgents(cfg.agents);

  return {
    status: s(row?.status || "disconnected"),
    apiKey,
    openclawBaseUrl,
    openclawWorkspace,
    agents,
  };
}

async function postOpenclaw(
  baseUrl: string,
  path: string,
  apiKey: string,
  body: JsonMap,
  method: "POST" | "PUT" | "PATCH" = "POST",
) {
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
      "x-agent-api-key": apiKey,
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const txt = await res.text();
  let json: unknown = null;
  try {
    json = txt ? JSON.parse(txt) : {};
  } catch {
    json = { raw: txt.slice(0, 1200) };
  }

  return { res, json };
}

async function syncOneSoul(input: {
  baseUrl: string;
  apiKey: string;
  workspace: string;
  tenantId: string;
  dashboardKey: string;
  node: AgentNode;
}) {
  const node = input.node;
  const payloads: Array<{ path: string; body: JsonMap; methods?: Array<"POST" | "PUT" | "PATCH"> }> = [
    {
      path: "/api/agents/upsert",
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        displayName: s(node.displayName) || node.agentId,
        enabled: true,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["POST", "PUT", "PATCH"],
    },
    {
      path: "/api/agents",
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        displayName: s(node.displayName) || node.agentId,
        enabled: true,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["POST", "PUT", "PATCH"],
    },
    {
      path: `/api/agents/${encodeURIComponent(node.agentId)}`,
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        displayName: s(node.displayName) || node.agentId,
        enabled: true,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["PUT", "PATCH", "POST"],
    },
    {
      path: "/v1/agents/upsert",
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["POST", "PUT", "PATCH"],
    },
    {
      path: "/v1/agents",
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["POST", "PUT", "PATCH"],
    },
    {
      path: `/v1/agents/${encodeURIComponent(node.agentId)}`,
      body: {
        id: node.agentId,
        name: s(node.displayName) || node.agentId,
        workspace: input.workspace,
        metadata: {
          source: "control_tower_sync_souls",
          tenantId: input.tenantId,
          dashboard: input.dashboardKey,
        },
      },
      methods: ["PUT", "PATCH", "POST"],
    },
  ];

  const errors: string[] = [];
  let methodNotAllowedOrNotFoundCount = 0;
  for (const c of payloads) {
    const methods = c.methods && c.methods.length ? c.methods : (["POST"] as Array<"POST" | "PUT" | "PATCH">);
    for (const method of methods) {
      const { res, json } = await postOpenclaw(input.baseUrl, c.path, input.apiKey, c.body, method);
      if (!res.ok && (res.status === 404 || res.status === 405)) {
        methodNotAllowedOrNotFoundCount += 1;
        errors.push(`${method} ${c.path}: HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) {
        const msg = s((json as JsonMap)?.error || (json as JsonMap)?.message || `HTTP ${res.status}`);
        return { ok: false, endpoint: `${method} ${c.path}`, error: msg || `HTTP ${res.status}` };
      }
      return { ok: true, endpoint: `${method} ${c.path}` };
    }
  }

  return {
    ok: false,
    endpoint: "",
    error: methodNotAllowedOrNotFoundCount > 0
      ? `OpenClaw returned 404/405 for all tested write routes on ${input.baseUrl}. This host does not expose agent create/upsert APIs. Create the souls manually in OpenClaw UI (Agents section) or point OpenClaw Base URL to an API host that supports /api/agents* or /v1/agents*.`
      : `No compatible OpenClaw agent upsert endpoint found for base URL ${input.baseUrl}. Use the OpenClaw API host (not WS/Gateway-only host).`,
  };
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const tenantId = s(id);
    if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });

    const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
    if ("response" in auth) return auth.response;

    if (!(await tenantExists(tenantId))) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const cfg = await fetchTenantOpenclawCfg(tenantId);
    if (cfg.status !== "connected") {
      return NextResponse.json({ ok: false, error: "OpenClaw integration is not connected for this tenant." }, { status: 400 });
    }
    if (!cfg.openclawBaseUrl) {
      return NextResponse.json({ ok: false, error: "Missing openclawBaseUrl. Save OpenClaw Base URL first." }, { status: 400 });
    }
    if (!cfg.apiKey) {
      return NextResponse.json({ ok: false, error: "Missing tenant agent API key. Rotate API key and save routing first." }, { status: 400 });
    }

    const workspace = cfg.openclawWorkspace || tenantId;
    const rows: Array<Record<string, unknown>> = [];

    for (const [dashboardKey, node] of Object.entries(cfg.agents)) {
      if (!node.enabled) {
        rows.push({ dashboardKey, agentId: node.agentId, skipped: "disabled" });
        continue;
      }
      const synced = await syncOneSoul({
        baseUrl: cfg.openclawBaseUrl,
        apiKey: cfg.apiKey,
        workspace,
        tenantId,
        dashboardKey,
        node,
      });

      rows.push({
        dashboardKey,
        agentId: node.agentId,
        displayName: s(node.displayName),
        ...synced,
      });
    }

    const okCount = rows.filter((r) => r.ok).length;
    const failCount = rows.filter((r) => r.ok === false).length;
    return NextResponse.json({
      ok: failCount === 0,
      tenantId,
      openclawBaseUrl: cfg.openclawBaseUrl,
      workspace,
      okCount,
      failCount,
      rows,
      note:
        failCount > 0
          ? "Some souls were not synced. Check row.error and ensure OpenClaw exposes /api/agents/upsert (or /api/agents)."
          : "All enabled souls synced successfully.",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to sync souls to OpenClaw" },
      { status: 500 },
    );
  }
}
