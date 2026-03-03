import OpenAI from "openai";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function asObject(v: unknown) {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function preferredIntegrationKeys(integrationKey: string) {
  return Array.from(
    new Set(
      integrationKey === "owner"
        ? ["owner", "default"]
        : integrationKey === "default"
          ? ["default", "owner"]
          : [integrationKey, "default", "owner"],
    ),
  );
}

function pickShareRef(config: Record<string, unknown>) {
  const oauth = asObject(config.oauth);
  return {
    tenantId: s(config.sharedFromTenantId) || s(config.openaiSharedFromTenantId) || s(oauth.sharedFromTenantId),
    integrationKey:
      s(config.sharedIntegrationKey) ||
      s(config.openaiSharedIntegrationKey) ||
      s(oauth.sharedIntegrationKey) ||
      "default",
  };
}

function pickOpenAIKey(config: Record<string, unknown>, accessTokenEnc: string | null) {
  const openai = asObject(config.openai);
  const api = asObject(config.api);
  return (
    s(config.apiKey) ||
    s(config.openaiApiKey) ||
    s(config.openai_api_key) ||
    s(openai.apiKey) ||
    s(openai.api_key) ||
    s(api.openaiApiKey) ||
    s(api.openai_api_key) ||
    s(accessTokenEnc)
  );
}

async function resolveTenantOpenAIApiKeyInternal(
  tenantId: string,
  integrationKey: string,
  depth = 0,
  visited = new Set<string>(),
): Promise<string | null> {
  if (depth > 4) throw new Error("OpenAI shared integration chain is too deep.");
  const tenant = s(tenantId);
  const key = s(integrationKey) || "default";
  if (!tenant) return null;

  const visitKey = `${tenant}:${key}`;
  if (visited.has(visitKey)) throw new Error("Detected circular OpenAI integration share reference.");
  visited.add(visitKey);

  for (const provider of ["openai", "custom"] as const) {
    const row = await getTenantIntegration(tenant, provider, key);
    if (!row) continue;

    const cfg = asObject(row.config);
    const direct = pickOpenAIKey(cfg, row.accessTokenEnc);
    if (direct) return direct;

    const share = pickShareRef(cfg);
    if (share.tenantId) {
      const fromShare = await resolveTenantOpenAIApiKeyInternal(
        share.tenantId,
        share.integrationKey || key,
        depth + 1,
        visited,
      );
      if (fromShare) return fromShare;
    }
  }

  return null;
}

export async function resolveTenantOpenAIApiKey(input: {
  tenantId: string;
  integrationKey?: string;
}) {
  const tenantId = s(input.tenantId);
  const integrationKey = s(input.integrationKey) || "default";
  if (!tenantId) throw new Error("Missing tenantId for OpenAI config.");

  for (const key of preferredIntegrationKeys(integrationKey)) {
    const apiKey = await resolveTenantOpenAIApiKeyInternal(tenantId, key);
    if (apiKey) return apiKey;
  }

  throw new Error(
    `Missing OpenAI API key in DB for tenant ${tenantId}. ` +
      "Configure app.organization_integrations provider=openai|custom, integration_key=default|owner, config.apiKey.",
  );
}

export async function getTenantOpenAIClient(input: { tenantId: string; integrationKey?: string }) {
  const apiKey = await resolveTenantOpenAIApiKey(input);
  return new OpenAI({ apiKey });
}
