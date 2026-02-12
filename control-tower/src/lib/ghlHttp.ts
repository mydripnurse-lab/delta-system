// control-tower/src/lib/ghlHttp.ts
import { readTokensFile, saveTokensFile, tokensPath } from "./ghl/tokenStore";

const API_BASE = "https://services.leadconnectorhq.com";
const TOKEN_URL = `${API_BASE}/oauth/token`;
const VERSION = "2021-07-28";

type LocationTokenCache = {
    token: string;
    expiresAtMs: number;
};

let locationTokenCache: LocationTokenCache | null = null;
let agencyRefreshInFlight: Promise<string> | null = null;
let locationTokenInFlight: Promise<string> | null = null;

function mustEnv(name: string) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
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

async function refreshAgencyAccessToken(reason: string): Promise<string> {
    if (agencyRefreshInFlight) return agencyRefreshInFlight;
    agencyRefreshInFlight = (async () => {
        const t = await readTokensFile();
        const refreshToken = String(t.refresh_token || "").trim();
        if (!refreshToken) {
            throw new Error(
                `No refresh_token in ${tokensPath()}. Re-run OAuth connect to regenerate tokens.`,
            );
        }
        const clientId = mustEnv("GHL_CLIENT_ID");
        const clientSecret = mustEnv("GHL_CLIENT_SECRET");
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
        await saveTokensFile({
            access_token: accessToken,
            refresh_token: String(data?.refresh_token || refreshToken).trim(),
            expires_at: expiresAtMs,
            scope: data?.scope || t.scope,
            userType: data?.userType || t.userType,
            companyId: data?.companyId || t.companyId,
            locationId: data?.locationId || t.locationId,
        });
        return accessToken;
    })().finally(() => {
        agencyRefreshInFlight = null;
    });
    return agencyRefreshInFlight;
}

export async function getAgencyAccessTokenOrThrow() {
    const t = await readTokensFile();
    const tok = String(t.access_token || "").trim();
    const exp = Number(t.expires_at || 0);
    const refreshBufferSec = Number(process.env.GHL_TOKEN_REFRESH_BUFFER_SEC || "120");
    const shouldRefresh = !!exp && Date.now() > exp - refreshBufferSec * 1000;

    if (!tok || shouldRefresh) {
        return await refreshAgencyAccessToken(!tok ? "missing_access_token" : "proactive_expiry_refresh");
    }
    return tok;
}

export async function getEffectiveLocationIdOrThrow() {
    const t = await readTokensFile();
    const fromFile = String(t.locationId || "").trim();
    const fromEnv = String(process.env.GHL_LOCATION_ID || "").trim();
    const id = fromEnv || fromFile;
    if (!id) throw new Error("Missing locationId (set GHL_LOCATION_ID or store it in tokens.json).");
    return id;
}

export async function getEffectiveCompanyIdOrThrow() {
    const t = await readTokensFile();
    const fromFile = String(t.companyId || "").trim();
    const fromEnv = String(process.env.GHL_COMPANY_ID || "").trim();
    const id = fromEnv || fromFile;
    if (!id) throw new Error("Missing companyId (set GHL_COMPANY_ID or store it in tokens.json).");
    return id;
}

export async function getLocationAccessTokenCached() {
    const now = Date.now();
    if (locationTokenCache && locationTokenCache.expiresAtMs - 30_000 > now) return locationTokenCache.token;
    if (locationTokenInFlight) return locationTokenInFlight;

    locationTokenInFlight = (async () => {
        const locationId = await getEffectiveLocationIdOrThrow();
        const companyId = await getEffectiveCompanyIdOrThrow();

        const tryFetch = async (agencyToken: string) => {
            const url = `${API_BASE}/oauth/locationToken`;
            const r = await fetch(url, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${agencyToken}`,
                    Version: VERSION,
                    Accept: "application/json",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ companyId, locationId }),
            });
            const txt = await r.text();
            return { r, data: safeJsonParse(txt) };
        };

        let agencyToken = await getAgencyAccessTokenOrThrow();
        let { r, data } = await tryFetch(agencyToken);

        if (!r.ok && isAuthFailure(r.status, data)) {
            agencyToken = await refreshAgencyAccessToken("location_token_exchange_auth_failure");
            ({ r, data } = await tryFetch(agencyToken));
        }
        if (!r.ok) {
            throw new Error(`GHL locationToken error (${r.status}): ${JSON.stringify(data)}`);
        }

        const token = String(data?.access_token || "").trim();
        if (!token) throw new Error(`Location token missing in response: ${JSON.stringify(data)}`);

        const expiresInSec = Number(data?.expires_in || 0);
        const expiresAtMs = Date.now() + Math.max(60, expiresInSec) * 1000;
        locationTokenCache = { token, expiresAtMs };
        return token;
    })().finally(() => {
        locationTokenInFlight = null;
    });

    return locationTokenInFlight;
}

export async function ghlFetchJson(
    pathOrUrl: string,
    opts: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
        authToken?: string; // override bearer
    } = {},
) {
    const url =
        pathOrUrl.startsWith("http") ? pathOrUrl : `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const headers: Record<string, string> = {
        Version: VERSION,
        Accept: "application/json",
        ...(opts.headers || {}),
    };

    const token = opts.authToken || (await getLocationAccessTokenCached());
    headers.Authorization = `Bearer ${token}`;

    let body = opts.body;
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

    if (!r.ok && !opts.authToken && isAuthFailure(r.status, data)) {
        locationTokenCache = null;
        const retryToken = await getLocationAccessTokenCached();
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
