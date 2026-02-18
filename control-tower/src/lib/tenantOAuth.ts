import { getTenantIntegration, upsertTenantIntegration, type TenantIntegrationRow } from "@/lib/tenantIntegrations";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type OAuthClientConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type OAuthConfigObject = Record<string, unknown>;

export type TenantOAuthConnection = {
  requestedTenantId: string;
  effectiveTenantId: string;
  provider: string;
  integrationKey: string;
  client: OAuthClientConfig;
  refreshToken: string;
  accessToken: string;
  tokenExpiresAt: string | null;
  scopes: string[];
  externalAccountId: string | null;
  externalPropertyId: string | null;
  config: OAuthConfigObject;
};

function asObject(v: unknown): OAuthConfigObject {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as OAuthConfigObject;
  return {};
}

function pickOAuthClientConfig(config: OAuthConfigObject): OAuthClientConfig | null {
  const oauthClient = asObject(config.oauthClient);
  const oauth = asObject(config.oauth);
  const fallback = config;

  const clientId =
    s(oauthClient.clientId) ||
    s(oauthClient.client_id) ||
    s(oauth.clientId) ||
    s(oauth.client_id) ||
    s(fallback.clientId) ||
    s(fallback.client_id);
  const clientSecret =
    s(oauthClient.clientSecret) ||
    s(oauthClient.client_secret) ||
    s(oauth.clientSecret) ||
    s(oauth.client_secret) ||
    s(fallback.clientSecret) ||
    s(fallback.client_secret);
  const redirectUri =
    s(oauthClient.redirectUri) ||
    s(oauthClient.redirect_uri) ||
    s(oauth.redirectUri) ||
    s(oauth.redirect_uri) ||
    s(fallback.redirectUri) ||
    s(fallback.redirect_uri);

  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

function pickShareRef(config: OAuthConfigObject) {
  const tenantId =
    s(config.sharedFromTenantId) ||
    s(config.oauthSharedFromTenantId) ||
    s(asObject(config.oauth).sharedFromTenantId);
  const integrationKey =
    s(config.sharedIntegrationKey) ||
    s(config.oauthSharedIntegrationKey) ||
    s(asObject(config.oauth).sharedIntegrationKey) ||
    "default";
  return { tenantId, integrationKey };
}

type ResolveInput = {
  tenantId: string;
  provider: string;
  integrationKey?: string;
};

type ResolveResult = {
  requested: TenantIntegrationRow;
  effective: TenantIntegrationRow;
  requestedTenantId: string;
  effectiveTenantId: string;
  integrationKey: string;
};

async function resolveTenantIntegrationInternal(
  input: ResolveInput,
  depth = 0,
  visited = new Set<string>(),
): Promise<ResolveResult> {
  if (depth > 4) throw new Error("OAuth shared integration chain is too deep.");

  const requestedTenantId = s(input.tenantId);
  const provider = s(input.provider);
  const integrationKey = s(input.integrationKey) || "default";
  if (!requestedTenantId || !provider) throw new Error("Missing tenantId/provider");

  const requested = await getTenantIntegration(requestedTenantId, provider, integrationKey);
  if (!requested) {
    throw new Error(`Missing integration ${provider}:${integrationKey} for tenant ${requestedTenantId}`);
  }

  const key = `${requestedTenantId}:${provider}:${integrationKey}`;
  if (visited.has(key)) throw new Error("Detected circular OAuth integration share reference.");
  visited.add(key);

  const requestedConfig = asObject(requested.config);
  const share = pickShareRef(requestedConfig);

  const hasRequestedRefresh = !!s(requested.refreshTokenEnc);
  if (hasRequestedRefresh || !share.tenantId) {
    return {
      requested,
      effective: requested,
      requestedTenantId,
      effectiveTenantId: requestedTenantId,
      integrationKey,
    };
  }

  const shared = await resolveTenantIntegrationInternal(
    {
      tenantId: share.tenantId,
      provider,
      integrationKey: share.integrationKey || integrationKey,
    },
    depth + 1,
    visited,
  );

  return {
    requested,
    effective: shared.effective,
    requestedTenantId,
    effectiveTenantId: shared.effectiveTenantId,
    integrationKey,
  };
}

export async function resolveTenantOAuthConnection(input: ResolveInput): Promise<TenantOAuthConnection> {
  const provider = s(input.provider);
  const resolved = await resolveTenantIntegrationInternal(input);
  const requestedConfig = asObject(resolved.requested.config);
  const effectiveConfig = asObject(resolved.effective.config);

  const client = pickOAuthClientConfig(requestedConfig) || pickOAuthClientConfig(effectiveConfig);
  if (!client) {
    throw new Error(
      `Missing OAuth client config for ${provider}:${resolved.integrationKey}.` +
      " Set config.oauthClient.{clientId,clientSecret,redirectUri}.",
    );
  }

  const refreshToken = s(resolved.effective.refreshTokenEnc);
  if (!refreshToken) {
    throw new Error(
      `Missing refresh token for ${provider}:${resolved.integrationKey}.` +
      " Connect OAuth first or configure sharedFromTenantId.",
    );
  }

  return {
    requestedTenantId: resolved.requestedTenantId,
    effectiveTenantId: resolved.effectiveTenantId,
    provider,
    integrationKey: resolved.integrationKey,
    client,
    refreshToken,
    accessToken: s(resolved.effective.accessTokenEnc),
    tokenExpiresAt: s(resolved.effective.tokenExpiresAt) || null,
    scopes: Array.isArray(resolved.effective.scopes) ? resolved.effective.scopes.map((x) => s(x)).filter(Boolean) : [],
    externalAccountId: s(resolved.requested.externalAccountId) || s(resolved.effective.externalAccountId) || null,
    externalPropertyId: s(resolved.requested.externalPropertyId) || s(resolved.effective.externalPropertyId) || null,
    config: requestedConfig,
  };
}

export async function getTenantOAuthClientConfig(input: ResolveInput): Promise<OAuthClientConfig> {
  const provider = s(input.provider);
  const resolved = await resolveTenantIntegrationInternal(input);
  const requestedConfig = asObject(resolved.requested.config);
  const effectiveConfig = asObject(resolved.effective.config);
  const client = pickOAuthClientConfig(requestedConfig) || pickOAuthClientConfig(effectiveConfig);
  if (!client) {
    throw new Error(
      `Missing OAuth client config for ${provider}:${resolved.integrationKey}.` +
      " Set config.oauthClient.{clientId,clientSecret,redirectUri}.",
    );
  }
  return client;
}

export async function saveTenantOAuthTokens(input: {
  tenantId: string;
  provider: string;
  integrationKey?: string;
  accessToken: string;
  refreshToken?: string;
  scopes?: string[];
  tokenExpiresAt?: string | null;
  markConnected?: boolean;
}) {
  const tenantId = s(input.tenantId);
  const provider = s(input.provider);
  const integrationKey = s(input.integrationKey) || "default";
  if (!tenantId || !provider) throw new Error("Missing tenantId/provider");

  const existing = await getTenantIntegration(tenantId, provider, integrationKey);
  const nextRefresh = s(input.refreshToken) || s(existing?.refreshTokenEnc);
  const nextScopes = Array.isArray(input.scopes) ? input.scopes.map((x) => s(x)).filter(Boolean) : existing?.scopes || [];

  await upsertTenantIntegration({
    organizationId: tenantId,
    provider,
    integrationKey,
    status: input.markConnected === false ? "needs_reconnect" : "connected",
    authType: "oauth",
    accessTokenEnc: s(input.accessToken),
    refreshTokenEnc: nextRefresh || null,
    tokenExpiresAt: s(input.tokenExpiresAt) || null,
    scopes: nextScopes,
    externalAccountId: existing?.externalAccountId || null,
    externalPropertyId: existing?.externalPropertyId || null,
    config: asObject(existing?.config),
    metadata: asObject(existing?.metadata),
    lastError: null,
  });
}

export async function refreshGoogleAccessToken(input: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  const body = new URLSearchParams();
  body.set("client_id", s(input.clientId));
  body.set("client_secret", s(input.clientSecret));
  body.set("refresh_token", s(input.refreshToken));
  body.set("grant_type", "refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(s(json?.error_description) || s(json?.error) || `OAuth HTTP ${res.status}`);
  }

  const accessToken = s(json?.access_token);
  const refreshToken = s(json?.refresh_token);
  const expiresIn = Number(json?.expires_in || 0);
  const expiresAtIso =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

  return {
    accessToken,
    refreshToken,
    expiresIn,
    expiresAtIso,
    scope: s(json?.scope),
    tokenType: s(json?.token_type),
  };
}
