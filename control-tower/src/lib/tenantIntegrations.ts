import { getDbPool } from "@/lib/db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export type TenantIntegrationRow = {
  id: string;
  organizationId: string;
  provider: string;
  integrationKey: string;
  status: string;
  authType: string;
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  tokenExpiresAt: string | null;
  scopes: string[];
  externalAccountId: string | null;
  externalPropertyId: string | null;
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  lastSyncAt: string | null;
  lastError: string | null;
};

export async function getTenantIntegration(
  organizationId: string,
  provider: string,
  integrationKey = "default",
): Promise<TenantIntegrationRow | null> {
  const pool = getDbPool();
  const q = await pool.query<TenantIntegrationRow>(
    `
      select
        id,
        organization_id as "organizationId",
        provider,
        integration_key as "integrationKey",
        status,
        auth_type as "authType",
        access_token_enc as "accessTokenEnc",
        refresh_token_enc as "refreshTokenEnc",
        token_expires_at as "tokenExpiresAt",
        scopes,
        external_account_id as "externalAccountId",
        external_property_id as "externalPropertyId",
        config,
        metadata,
        last_sync_at as "lastSyncAt",
        last_error as "lastError"
      from app.organization_integrations
      where organization_id = $1
        and provider = $2
        and integration_key = $3
      limit 1
    `,
    [s(organizationId), s(provider), s(integrationKey) || "default"],
  );
  return q.rows[0] || null;
}

type UpsertIntegrationInput = {
  organizationId: string;
  provider: string;
  integrationKey?: string;
  status?: "connected" | "disconnected" | "needs_reconnect" | "error";
  authType?: "oauth" | "api_key" | "service_account" | "none";
  accessTokenEnc?: string | null;
  refreshTokenEnc?: string | null;
  tokenExpiresAt?: string | null;
  scopes?: string[];
  externalAccountId?: string | null;
  externalPropertyId?: string | null;
  config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  lastError?: string | null;
};

export async function upsertTenantIntegration(input: UpsertIntegrationInput) {
  const pool = getDbPool();
  const integrationKey = s(input.integrationKey) || "default";
  const scopes = Array.isArray(input.scopes) ? input.scopes.map((x) => s(x)).filter(Boolean) : [];

  const q = await pool.query<{ id: string }>(
    `
      insert into app.organization_integrations (
        organization_id,
        provider,
        integration_key,
        status,
        auth_type,
        access_token_enc,
        refresh_token_enc,
        token_expires_at,
        scopes,
        external_account_id,
        external_property_id,
        config,
        metadata,
        last_error
      )
      values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12::jsonb,$13::jsonb,$14
      )
      on conflict (organization_id, provider, integration_key)
      do update set
        status = excluded.status,
        auth_type = excluded.auth_type,
        access_token_enc = excluded.access_token_enc,
        refresh_token_enc = excluded.refresh_token_enc,
        token_expires_at = excluded.token_expires_at,
        scopes = excluded.scopes,
        external_account_id = excluded.external_account_id,
        external_property_id = excluded.external_property_id,
        config = excluded.config,
        metadata = excluded.metadata,
        last_error = excluded.last_error,
        updated_at = now()
      returning id
    `,
    [
      s(input.organizationId),
      s(input.provider),
      integrationKey,
      s(input.status) || "connected",
      s(input.authType) || "oauth",
      input.accessTokenEnc ?? null,
      input.refreshTokenEnc ?? null,
      input.tokenExpiresAt ?? null,
      scopes,
      s(input.externalAccountId) || null,
      s(input.externalPropertyId) || null,
      JSON.stringify(input.config || {}),
      JSON.stringify(input.metadata || {}),
      input.lastError ?? null,
    ],
  );

  return q.rows[0]?.id || null;
}
