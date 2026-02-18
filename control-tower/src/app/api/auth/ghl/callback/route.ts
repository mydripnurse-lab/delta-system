import { getTenantIntegration, upsertTenantIntegration } from "@/lib/tenantIntegrations";
import { getTenantOAuthClientConfig } from "@/lib/tenantOAuth";

export const runtime = "nodejs";

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function decodeState(raw: string) {
  if (!raw) return null;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function resolveGhlProvider(tenantId: string, integrationKey: string, hinted: string) {
  const hint = s(hinted).toLowerCase();
  if (hint === "ghl" || hint === "custom") {
    const hit = await getTenantIntegration(tenantId, hint, integrationKey);
    if (hit) return hint as "ghl" | "custom";
  }
  const ghl = await getTenantIntegration(tenantId, "ghl", integrationKey);
  if (ghl) return "ghl" as const;
  const custom = await getTenantIntegration(tenantId, "custom", integrationKey);
  if (custom) return "custom" as const;
  return "ghl" as const;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = s(url.searchParams.get("code"));
  const err = s(url.searchParams.get("error"));
  const rawState = s(url.searchParams.get("state"));
  const state = decodeState(rawState);
  const tenantId = s(state?.tenantId || url.searchParams.get("tenantId"));
  const integrationKey = s(state?.integrationKey || url.searchParams.get("integrationKey")) || "owner";
  const returnTo = s(state?.returnTo) || `/projects/${tenantId}`;

  if (err) return new Response(`OAuth error: ${err}`, { status: 400 });
  if (!code) return new Response("Missing ?code=", { status: 400 });
  if (!tenantId) return new Response("Missing tenantId (state/query).", { status: 400 });

  const provider = await resolveGhlProvider(tenantId, integrationKey, s(state?.provider));
  const existing = await getTenantIntegration(tenantId, provider, integrationKey);
  const existingCfg = existing?.config && typeof existing.config === "object" ? (existing.config as Record<string, unknown>) : {};

  const { clientId, clientSecret, redirectUri } = await getTenantOAuthClientConfig({
    tenantId,
    provider,
    integrationKey,
  });

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });

  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    return new Response(`GHL OAuth token exchange failed (${r.status}): ${JSON.stringify(data)}`, { status: 400 });
  }

  const accessToken = s(data.access_token);
  const refreshToken = s(data.refresh_token) || s(existing?.refreshTokenEnc);
  if (!accessToken || !refreshToken) {
    return new Response("GHL OAuth response missing access_token/refresh_token.", { status: 400 });
  }

  const expiresIn = Number(data.expires_in || 0);
  const tokenExpiresAt = Number.isFinite(expiresIn) && expiresIn > 0
    ? new Date(Date.now() + expiresIn * 1000).toISOString()
    : null;
  const scopes = s(data.scope).split(" ").map((x) => s(x)).filter(Boolean);

  await upsertTenantIntegration({
    organizationId: tenantId,
    provider,
    integrationKey,
    status: "connected",
    authType: "oauth",
    accessTokenEnc: accessToken,
    refreshTokenEnc: refreshToken,
    tokenExpiresAt,
    scopes,
    externalAccountId: s(data.locationId) || existing?.externalAccountId || null,
    externalPropertyId: existing?.externalPropertyId || null,
    config: existingCfg,
    metadata: {
      ...(existing?.metadata || {}),
      companyId: s(data.companyId) || s((existing?.metadata || {})?.companyId),
      locationId: s(data.locationId) || s((existing?.metadata || {})?.locationId),
      userType: s(data.userType),
    },
    lastError: null,
  });

  const okUrl = new URL(returnTo || "/", url.origin);
  okUrl.searchParams.set("oauth", "ghl_ok");
  okUrl.searchParams.set("tenantId", tenantId);
  okUrl.searchParams.set("integrationKey", integrationKey);
  okUrl.searchParams.set("hasRefresh", refreshToken ? "1" : "0");
  return Response.redirect(okUrl.toString(), 302);
}
