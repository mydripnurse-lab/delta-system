import { getDbPool } from "@/lib/db";
import { AI_PROMPT_DEFINITIONS, getAiPromptDefinition } from "@/lib/aiPromptCatalog";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function normalizeIntegrationKey(v: unknown) {
  return s(v) || "default";
}

function normalizeModule(v: unknown) {
  return s(v) || "ai";
}

export type TenantAiPromptRow = {
  id: string;
  organizationId: string;
  integrationKey: string;
  promptKey: string;
  name: string;
  module: string;
  routePath: string;
  description: string;
  promptText: string;
  isActive: boolean;
  metadata: JsonMap;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedAiPrompt = {
  promptKey: string;
  name: string;
  module: string;
  routePath: string;
  description: string;
  promptText: string;
  integrationKey: string;
  source: "db" | "default";
};

export async function resolveTenantAiPrompt(input: {
  tenantId?: string | null;
  integrationKey?: string | null;
  promptKey: string;
  fallbackPrompt: string;
  fallbackName?: string;
  fallbackModule?: string;
  fallbackRoutePath?: string;
  fallbackDescription?: string;
}): Promise<ResolvedAiPrompt> {
  const promptKey = s(input.promptKey);
  const fallbackDef = getAiPromptDefinition(promptKey);
  const tenantId = s(input.tenantId);
  const integrationKey = normalizeIntegrationKey(input.integrationKey);

  const fallback: ResolvedAiPrompt = {
    promptKey,
    name: s(input.fallbackName) || s(fallbackDef?.name) || promptKey,
    module: normalizeModule(input.fallbackModule) || s(fallbackDef?.module) || "ai",
    routePath: s(input.fallbackRoutePath) || s(fallbackDef?.routePath),
    description: s(input.fallbackDescription) || s(fallbackDef?.description),
    promptText: s(input.fallbackPrompt),
    integrationKey,
    source: "default",
  };

  if (!tenantId || !promptKey) return fallback;

  const pool = getDbPool();
  const q = await pool.query<TenantAiPromptRow>(
    `
      select
        id::text as id,
        organization_id::text as "organizationId",
        integration_key as "integrationKey",
        prompt_key as "promptKey",
        name,
        module,
        route_path as "routePath",
        description,
        prompt_text as "promptText",
        is_active as "isActive",
        metadata,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt"
      from app.organization_ai_prompts
      where organization_id = $1::uuid
        and prompt_key = $2
        and is_active = true
        and integration_key in ($3, 'default')
      order by case when integration_key = $3 then 0 else 1 end, updated_at desc
      limit 1
    `,
    [tenantId, promptKey, integrationKey],
  );

  const row = q.rows[0];
  if (!row || !s(row.promptText)) return fallback;

  return {
    promptKey,
    name: s(row.name) || fallback.name,
    module: s(row.module) || fallback.module,
    routePath: s(row.routePath) || fallback.routePath,
    description: s(row.description) || fallback.description,
    promptText: s(row.promptText) || fallback.promptText,
    integrationKey: s(row.integrationKey) || integrationKey,
    source: "db",
  };
}

export async function listTenantAiPrompts(
  tenantId: string,
  integrationKey?: string,
): Promise<Array<ResolvedAiPrompt & { customized: boolean; updatedAt?: string }>> {
  const id = s(tenantId);
  if (!id) throw new Error("Missing tenantId");
  const key = normalizeIntegrationKey(integrationKey);

  const pool = getDbPool();
  const q = await pool.query<TenantAiPromptRow>(
    `
      select
        id::text as id,
        organization_id::text as "organizationId",
        integration_key as "integrationKey",
        prompt_key as "promptKey",
        name,
        module,
        route_path as "routePath",
        description,
        prompt_text as "promptText",
        is_active as "isActive",
        metadata,
        created_at::text as "createdAt",
        updated_at::text as "updatedAt"
      from app.organization_ai_prompts
      where organization_id = $1::uuid
        and integration_key in ($2, 'default')
      order by updated_at desc
    `,
    [id, key],
  );

  const byPromptKey = new Map<string, TenantAiPromptRow>();
  for (const row of q.rows) {
    if (!s(row.promptKey)) continue;
    const existing = byPromptKey.get(row.promptKey);
    if (!existing) {
      byPromptKey.set(row.promptKey, row);
      continue;
    }
    if (s(existing.integrationKey) !== key && s(row.integrationKey) === key) {
      byPromptKey.set(row.promptKey, row);
    }
  }

  const out: Array<ResolvedAiPrompt & { customized: boolean; updatedAt?: string }> = [];

  for (const def of AI_PROMPT_DEFINITIONS) {
    const row = byPromptKey.get(def.promptKey);
    if (row && s(row.promptText) && row.isActive !== false) {
      out.push({
        promptKey: def.promptKey,
        name: s(row.name) || def.name,
        module: s(row.module) || def.module,
        routePath: s(row.routePath) || def.routePath,
        description: s(row.description) || def.description,
        promptText: s(row.promptText) || def.defaultPrompt,
        integrationKey: s(row.integrationKey) || key,
        source: "db",
        customized: true,
        updatedAt: s(row.updatedAt),
      });
      continue;
    }

    out.push({
      promptKey: def.promptKey,
      name: def.name,
      module: def.module,
      routePath: def.routePath,
      description: def.description,
      promptText: def.defaultPrompt,
      integrationKey: key,
      source: "default",
      customized: false,
      updatedAt: "",
    });
  }

  for (const row of q.rows) {
    const promptKey = s(row.promptKey);
    if (!promptKey) continue;
    if (getAiPromptDefinition(promptKey)) continue;
    if (row.isActive === false) continue;
    out.push({
      promptKey,
      name: s(row.name) || promptKey,
      module: s(row.module) || "ai",
      routePath: s(row.routePath),
      description: s(row.description),
      promptText: s(row.promptText),
      integrationKey: s(row.integrationKey) || key,
      source: "db",
      customized: true,
      updatedAt: s(row.updatedAt),
    });
  }

  out.sort((a, b) => {
    const mod = a.module.localeCompare(b.module);
    if (mod !== 0) return mod;
    return a.name.localeCompare(b.name);
  });

  return out;
}

export async function upsertTenantAiPrompt(input: {
  tenantId: string;
  integrationKey?: string;
  promptKey: string;
  name: string;
  module: string;
  routePath?: string;
  description?: string;
  promptText: string;
  isActive?: boolean;
  metadata?: JsonMap;
}) {
  const tenantId = s(input.tenantId);
  const promptKey = s(input.promptKey);
  const promptText = s(input.promptText);
  if (!tenantId) throw new Error("Missing tenantId");
  if (!promptKey) throw new Error("Missing promptKey");
  if (!promptText) throw new Error("Prompt text cannot be empty");

  const integrationKey = normalizeIntegrationKey(input.integrationKey);
  const name = s(input.name) || promptKey;
  const module = normalizeModule(input.module);
  const routePath = s(input.routePath);
  const description = s(input.description);
  const isActive = input.isActive !== false;
  const metadata = input.metadata && typeof input.metadata === "object" ? input.metadata : {};

  const pool = getDbPool();
  const q = await pool.query<{ id: string; updated_at: string }>(
    `
      insert into app.organization_ai_prompts (
        organization_id,
        integration_key,
        prompt_key,
        name,
        module,
        route_path,
        description,
        prompt_text,
        is_active,
        metadata
      ) values (
        $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb
      )
      on conflict (organization_id, integration_key, prompt_key)
      do update set
        name = excluded.name,
        module = excluded.module,
        route_path = excluded.route_path,
        description = excluded.description,
        prompt_text = excluded.prompt_text,
        is_active = excluded.is_active,
        metadata = excluded.metadata,
        updated_at = now()
      returning id::text as id, updated_at::text as updated_at
    `,
    [
      tenantId,
      integrationKey,
      promptKey,
      name,
      module,
      routePath,
      description,
      promptText,
      isActive,
      JSON.stringify(metadata),
    ],
  );

  return {
    id: s(q.rows[0]?.id),
    updatedAt: s(q.rows[0]?.updated_at),
  };
}
