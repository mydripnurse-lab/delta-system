// control-tower/src/lib/ghlHttp.ts
import { getDbPool } from "@/lib/db";
import { getTenantIntegration, upsertTenantIntegration } from "@/lib/tenantIntegrations";

const API_BASE = "https://services.leadconnectorhq.com";
const TOKEN_URL = `${API_BASE}/oauth/token`;
const VERSION = "2021-07-28";

type LocationTokenCache = {
    token: string;
    expiresAtMs: number;
};

const agencyRefreshInFlight = new Map<string, Promise<string>>();
const locationTokenInFlight = new Map<string, Promise<string>>();

type TenantCtx = {
    tenantId?: string;
    integrationKey?: string;
};

type GhlResolvedConfig = {
    provider: "ghl" | "custom";
    integrationKey: string;
    companyId: string;
    locationId: string;
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken: string;
    tokenExpiresAtMs: number;
};

function normCtx(input?: TenantCtx) {
    const tenantId = String(input?.tenantId ?? "").trim();
    const integrationKey = String(input?.integrationKey ?? "").trim() || "owner";
    return { tenantId, integrationKey };
}

function asObj(v: unknown): Record<string, unknown> {
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickGhlClient(cfg: Record<string, unknown>) {
    const oauthClient = asObj(cfg.oauthClient);
    const oauth = asObj(cfg.oauth);
    const clientId =
        String(oauthClient.clientId ?? oauthClient.client_id ?? oauth.clientId ?? oauth.client_id ?? cfg.clientId ?? cfg.client_id ?? "").trim();
    const clientSecret =
        String(
            oauthClient.clientSecret ??
                oauthClient.client_secret ??
                oauth.clientSecret ??
                oauth.client_secret ??
                cfg.clientSecret ??
                cfg.client_secret ??
                "",
        ).trim();
    return { clientId, clientSecret };
}

async function getTenantGhlIntegration(tenantId: string, integrationKey: string) {
    const ghl = await getTenantIntegration(tenantId, "ghl", integrationKey);
    if (ghl) return { row: ghl, provider: "ghl" as const };
    const custom = await getTenantIntegration(tenantId, "custom", integrationKey);
    if (custom) return { row: custom, provider: "custom" as const };
    return null;
}

async function getTenantCompanyId(tenantId: string): Promise<string> {
    const pool = getDbPool();
    const q = await pool.query<{ ghl_company_id: string | null }>(
        `
          select ghl_company_id
          from app.organization_settings
          where organization_id = $1
          limit 1
        `,
        [tenantId],
    );
    return String(q.rows[0]?.ghl_company_id || "").trim();
}

async function resolveTenantGhlConfig(input?: TenantCtx): Promise<GhlResolvedConfig | null> {
    const { tenantId, integrationKey } = normCtx(input);
    if (!tenantId) return null;

    const hit = await getTenantGhlIntegration(tenantId, integrationKey);
    if (!hit) throw new Error(`Missing GHL integration ${integrationKey} for tenant ${tenantId}`);

    const row = hit.row;
    const cfg = asObj(row.config);
    const { clientId, clientSecret } = pickGhlClient(cfg);
    const companyId =
        String(cfg.companyId ?? "").trim() ||
        (await getTenantCompanyId(tenantId)) ||
        String(row.metadata?.companyId ?? "").trim();
    const locationId = String(row.externalAccountId || cfg.locationId || "").trim();
    const refreshToken = String(row.refreshTokenEnc || "").trim();
    const accessToken = String(row.accessTokenEnc || "").trim();
    const tokenExpiresAtMs = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;

    return {
        provider: hit.provider,
        integrationKey,
        companyId,
        locationId,
        clientId,
        clientSecret,
        refreshToken,
        accessToken,
        tokenExpiresAtMs,
    };
}

async function saveTenantGhlTokens(input: {
    tenantId: string;
    provider: "ghl" | "custom";
    integrationKey: string;
    accessToken: string;
    refreshToken: string;
    expiresAtMs: number;
}) {
    const existing = await getTenantIntegration(input.tenantId, input.provider, input.integrationKey);
    await upsertTenantIntegration({
        organizationId: input.tenantId,
        provider: input.provider,
        integrationKey: input.integrationKey,
        status: "connected",
        authType: "oauth",
        accessTokenEnc: input.accessToken,
        refreshTokenEnc: input.refreshToken,
        tokenExpiresAt: new Date(input.expiresAtMs).toISOString(),
        scopes: existing?.scopes || [],
        externalAccountId: existing?.externalAccountId || null,
        externalPropertyId: existing?.externalPropertyId || null,
        config: asObj(existing?.config),
        metadata: asObj(existing?.metadata),
        lastError: null,
    });
}

function safeJsonParse(txt: string) {
    try {
        return JSON.parse(txt);
    } catch {
        return { raw: txt };
    }
}

function getErrorText(data: unknown): string {
    try {
        if (!data) return "";
        if (typeof data === "string") return data.toLowerCase();
        return JSON.stringify(data).toLowerCase();
    } catch {
        return "";
    }
}

function isAuthFailure(status: number, data: unknown): boolean {
    if (status === 401 || status === 403) return true;
    const t = getErrorText(data);
    return t.includes("invalid jwt") || t.includes("jwt invalid") || t.includes("token");
}

async function refreshAgencyAccessToken(reason: string, ctx?: TenantCtx): Promise<string> {
    const { tenantId, integrationKey } = normCtx(ctx);
    if (!tenantId) throw new Error("Missing tenantId (GHL is DB-only and tenant-scoped).");
    const inFlightKey = `${tenantId}:${integrationKey}`;
    const existingInFlight = agencyRefreshInFlight.get(inFlightKey);
    if (existingInFlight) return existingInFlight;

    const task: Promise<string> = (async () => {
        const tenantCfg = await resolveTenantGhlConfig({ tenantId, integrationKey });
        if (!tenantCfg) throw new Error(`Missing GHL integration ${integrationKey} for tenant ${tenantId}`);

        const refreshToken = String(tenantCfg.refreshToken || "").trim();
        if (!refreshToken) {
            throw new Error(`Missing refresh_token in DB for tenant ${tenantId} (${integrationKey}). Reconnect OAuth.`);
        }
        const clientId = String(tenantCfg.clientId || "").trim();
        const clientSecret = String(tenantCfg.clientSecret || "").trim();
        if (!clientId || !clientSecret) {
            throw new Error(`Missing GHL OAuth client config in DB for tenant ${tenantId} (${integrationKey}).`);
        }
        const body = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken,
        });
        const r = await fetch(TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body,
        });
        const txt = await r.text();
        const data = safeJsonParse(txt);
        if (!r.ok) {
            throw new Error(
                `GHL token refresh failed (${r.status}) [${reason}]: ${JSON.stringify(data)}`,
            );
        }
        const accessToken = String(data?.access_token || "").trim();
        if (!accessToken) {
            throw new Error(`GHL token refresh returned empty access_token [${reason}]`);
        }
        const expiresInSec = Number(data?.expires_in || 0);
        const expiresAtMs = Date.now() + Math.max(60, expiresInSec) * 1000;
        const nextRefresh = String(data?.refresh_token || refreshToken).trim();
        await saveTenantGhlTokens({
            tenantId,
            provider: tenantCfg.provider,
            integrationKey: tenantCfg.integrationKey,
            accessToken,
            refreshToken: nextRefresh,
            expiresAtMs,
        });
        return accessToken;
    })();
    agencyRefreshInFlight.set(inFlightKey, task);
    try {
        return await task;
    } finally {
        agencyRefreshInFlight.delete(inFlightKey);
    }
}

export async function getAgencyAccessTokenOrThrow(ctx?: TenantCtx) {
    const { tenantId, integrationKey } = normCtx(ctx);
    if (!tenantId) throw new Error("Missing tenantId (GHL is DB-only and tenant-scoped).");
    const tenantCfg = await resolveTenantGhlConfig({ tenantId, integrationKey });
    if (!tenantCfg) throw new Error(`Missing GHL integration ${integrationKey} for tenant ${tenantId}`);
    const tok = String(tenantCfg.accessToken || "").trim();
    const exp = Number(tenantCfg.tokenExpiresAtMs || 0);
    const refreshBufferSec = Number(process.env.GHL_TOKEN_REFRESH_BUFFER_SEC || "120");
    const shouldRefresh = !!exp && Date.now() > exp - refreshBufferSec * 1000;

    if (!tok || shouldRefresh || looksLikeInvalidBearerToken(tok)) {
        const reason = !tok
            ? "missing_access_token"
            : looksLikeInvalidBearerToken(tok)
              ? "invalid_access_token_shape"
              : "proactive_expiry_refresh";
        const refreshed = await refreshAgencyAccessToken(reason, ctx);
        if (looksLikeInvalidBearerToken(String(refreshed || "").trim())) {
            throw new Error(`Invalid GHL agency access token after refresh (${reason}). Reconnect OAuth.`);
        }
        return refreshed;
    }
    return tok;
}

export async function getEffectiveLocationIdOrThrow(ctx?: TenantCtx) {
    const { tenantId, integrationKey } = normCtx(ctx);
    if (!tenantId) throw new Error("Missing tenantId (GHL is DB-only and tenant-scoped).");
    const tenantCfg = await resolveTenantGhlConfig({ tenantId, integrationKey });
    const id = String(tenantCfg?.locationId || "").trim();
    if (!id) throw new Error(`Missing locationId in DB for tenant ${tenantId} (${integrationKey}).`);
    return id;
}

export async function getEffectiveCompanyIdOrThrow(ctx?: TenantCtx) {
    const { tenantId, integrationKey } = normCtx(ctx);
    if (!tenantId) throw new Error("Missing tenantId (GHL is DB-only and tenant-scoped).");
    const tenantCfg = await resolveTenantGhlConfig({ tenantId, integrationKey });
    const id = String(tenantCfg?.companyId || "").trim();
    if (!id) throw new Error(`Missing companyId in DB for tenant ${tenantId} (${integrationKey}).`);
    return id;
}

function ctxCacheKey(ctx?: TenantCtx) {
    const { tenantId, integrationKey } = normCtx(ctx);
    return tenantId ? `${tenantId}:${integrationKey}` : "_default";
}

const scopedLocationCache = new Map<string, LocationTokenCache>();

async function resolveBearerLike(
    input: unknown,
): Promise<string> {
    let cur: unknown = input;
    let hops = 0;
    while (typeof cur === "function" && hops < 3) {
        cur = await (cur as () => unknown)();
        hops++;
    }
    if (cur && typeof (cur as Promise<unknown>).then === "function") {
        cur = await (cur as Promise<unknown>);
    }
    return String(cur ?? "").trim();
}

function looksLikeInvalidBearerToken(token: string): boolean {
    if (!token) return true;
    // Bearer tokens should be compact strings; reject obvious function/source payloads.
    if (/\s/.test(token)) return true;
    const low = token.toLowerCase();
    if (low.includes("=>") || low.includes("function") || low.startsWith("async")) return true;
    return false;
}

export async function getLocationAccessTokenCached(ctx?: TenantCtx) {
    const { tenantId, integrationKey } = normCtx(ctx);
    if (!tenantId) throw new Error("Missing tenantId (GHL is DB-only and tenant-scoped).");
    const now = Date.now();
    const cacheKey = ctxCacheKey(ctx);
    const scoped = scopedLocationCache.get(cacheKey);
    if (scoped && scoped.expiresAtMs - 30_000 > now) return scoped.token;
    const inFlight = locationTokenInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const task: Promise<string> = (async () => {
        const locationId = await getEffectiveLocationIdOrThrow(ctx);
        const companyId = await getEffectiveCompanyIdOrThrow(ctx);

        const tryFetch = async (agencyToken: string) => {
            const cleanAgencyToken = String(agencyToken || "").trim();
            if (looksLikeInvalidBearerToken(cleanAgencyToken)) {
                throw new Error("Invalid GHL agency access token shape for locationToken exchange.");
            }
            const url = `${API_BASE}/oauth/locationToken`;
            const r = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${cleanAgencyToken}`,
                    Version: VERSION,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ companyId, locationId }),
            });
            const txt = await r.text();
            return { r, data: safeJsonParse(txt) };
        };

        let agencyToken = await getAgencyAccessTokenOrThrow(ctx);
        let { r, data } = await tryFetch(agencyToken);

        if (!r.ok && isAuthFailure(r.status, data)) {
            agencyToken = await refreshAgencyAccessToken("location_token_exchange_auth_failure", ctx);
            ({ r, data } = await tryFetch(agencyToken));
        }
        if (!r.ok) {
            throw new Error(`GHL locationToken error (${r.status}): ${JSON.stringify(data)}`);
        }

        const token = String(data?.access_token || "").trim();
        if (!token) throw new Error(`Location token missing in response: ${JSON.stringify(data)}`);

        const expiresInSec = Number(data?.expires_in || 0);
        const expiresAtMs = Date.now() + Math.max(60, expiresInSec) * 1000;
        const hit = { token, expiresAtMs };
        scopedLocationCache.set(cacheKey, hit);
        return token;
    })();
    locationTokenInFlight.set(cacheKey, task);
    try {
        return await task;
    } finally {
        locationTokenInFlight.delete(cacheKey);
    }
}

export async function ghlFetchJson(
    pathOrUrl: string,
    opts: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
        authToken?: string | (() => Promise<string> | string); // optional bearer override (string or resolver)
        tenantId?: string;
        integrationKey?: string;
    } = {},
) {
    const url =
        pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const headers: Record<string, string> = {
        Version: VERSION,
        Accept: "application/json",
        ...(opts.headers || {}),
    };

    const hasTokenOverride = opts.authToken !== undefined && opts.authToken !== null;
    const overrideToken = await resolveBearerLike(opts.authToken);
    const tokenFromOverride = String(overrideToken || "").trim();
    if (tokenFromOverride && looksLikeInvalidBearerToken(tokenFromOverride) && process.env.NODE_ENV !== "production") {
        console.warn("[ghlFetchJson] Ignoring invalid authToken override for", url);
    }
    const token =
        !looksLikeInvalidBearerToken(tokenFromOverride)
            ? tokenFromOverride
            : String(
                  await getLocationAccessTokenCached({
                      tenantId: opts.tenantId,
                      integrationKey: opts.integrationKey,
                  }),
              ).trim();
    if (!token) {
        throw new Error(`Missing GHL bearer token for ${url}`);
    }
    headers.Authorization = `Bearer ${token}`;

    let body: BodyInit | undefined = undefined;
    if (opts.body !== undefined && opts.body !== null) {
        body = opts.body as BodyInit;
    }
    if (body && typeof body !== "string") {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
        body = JSON.stringify(body);
    }

    const doFetch = async () => {
        const r = await fetch(url, { method: opts.method || "GET", headers, body });
        const txt = await r.text();
        const ct = r.headers.get("content-type") || "";
        const data = ct.includes("application/json") ? safeJsonParse(txt) : { raw: txt, contentType: ct };
        return { r, data };
    };

    let { r, data } = await doFetch();

    if (!r.ok && !hasTokenOverride && isAuthFailure(r.status, data)) {
        scopedLocationCache.delete(
            ctxCacheKey({
                tenantId: opts.tenantId,
                integrationKey: opts.integrationKey,
            }),
        );
        const retryToken = await getLocationAccessTokenCached({
            tenantId: opts.tenantId,
            integrationKey: opts.integrationKey,
        });
        headers.Authorization = `Bearer ${retryToken}`;
        ({ r, data } = await doFetch());
    }

    if (!r.ok) {
        const e = new Error(`GHL API error (${r.status}) ${url}: ${JSON.stringify(data)}`) as Error & {
            status?: number;
            data?: unknown;
        };
        e.status = r.status;
        e.data = data;
        throw e;
    }

    return data;
}
