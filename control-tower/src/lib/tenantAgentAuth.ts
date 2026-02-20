import { NextResponse } from "next/server";
import { requireTenantPermission } from "@/lib/authz";
import { getDbPool } from "@/lib/db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export type TenantAgentAuthOk = {
  ok: true;
  actor: string;
  mode: "session" | "agent_key";
};

export type TenantAgentAuthFail = {
  ok: false;
  response: NextResponse;
};

export type TenantAgentAuth = TenantAgentAuthOk | TenantAgentAuthFail;

function unauthorized(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 401 });
}

function forbidden(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 403 });
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

export async function authorizeTenantAgentRequest(
  req: Request,
  tenantId: string,
  permission: "tenant.read" | "tenant.manage",
): Promise<TenantAgentAuth> {
  const tenant = s(tenantId);
  if (!tenant) return { ok: false, response: unauthorized("Missing tenant id.") };

  const headerAgentKey = s(req.headers.get("x-agent-api-key"));
  if (headerAgentKey) {
    const keys = await readTenantAgentApiKeys(tenant);
    if (!keys.size) {
      return { ok: false, response: forbidden("Agent key not configured for tenant.") };
    }
    if (!keys.has(headerAgentKey)) {
      return { ok: false, response: forbidden("Invalid tenant agent key.") };
    }
    const agentLabel = s(req.headers.get("x-agent-id")) || "openclaw";
    return { ok: true, actor: `agent:${agentLabel}`, mode: "agent_key" };
  }

  const auth = await requireTenantPermission(req, tenant, permission);
  if ("response" in auth) return { ok: false, response: auth.response };
  return { ok: true, actor: `user:${s(auth.user.id) || s(auth.user.email)}`, mode: "session" };
}

