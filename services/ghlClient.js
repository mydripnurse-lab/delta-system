// services/ghlClient.js
import { loadTokens, getTokens, isExpiredSoon, saveTokens } from "./tokenStore.js";

const TOKEN_URL = "https://services.leadconnectorhq.com/oauth/token";
const API_BASE = "https://services.leadconnectorhq.com";
const FETCH_TIMEOUT_MS = Math.max(10_000, Number(process.env.GHL_FETCH_TIMEOUT_MS || 45_000));
const RETRY_BASE_MS = Math.max(250, Number(process.env.GHL_FETCH_RETRY_BASE_MS || 700));
const RETRY_MAX_MS = Math.max(RETRY_BASE_MS, Number(process.env.GHL_FETCH_RETRY_MAX_MS || 6_000));
const MAX_RETRIES = Math.max(0, Number(process.env.GHL_FETCH_MAX_RETRIES || 2));

function mustEnv(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Missing env var: ${name}`);
    return v;
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function shouldRetry(status) {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

function retryAfterMs(headers) {
    if (!headers?.get) return 0;
    const raw = String(headers.get("retry-after") || "").trim();
    if (!raw) return 0;
    const asNum = Number(raw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000;
    const asDate = Date.parse(raw);
    if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());
    return 0;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(t);
    }
}

async function refreshAccessToken() {
    const { refresh_token } = getTokens();
    if (!refresh_token) throw new Error("No refresh_token available. Run OAuth again.");

    const client_id = mustEnv("GHL_CLIENT_ID");
    const client_secret = mustEnv("GHL_CLIENT_SECRET");

    // IMPORTANT: token endpoint requiere x-www-form-urlencoded
    const body = new URLSearchParams({
        client_id,
        client_secret,
        grant_type: "refresh_token",
        refresh_token,
    });

    let r = null;
    let attempt = 0;
    let lastErr = null;
    while (attempt <= MAX_RETRIES) {
        try {
            r = await fetchWithTimeout(TOKEN_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                },
                body,
            });
            if (r.ok || !shouldRetry(r.status) || attempt >= MAX_RETRIES) break;
            const wait = Math.max(
                retryAfterMs(r.headers),
                Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * Math.pow(1.8, attempt))),
            );
            await sleep(wait);
        } catch (e) {
            lastErr = e;
            if (attempt >= MAX_RETRIES) throw e;
            const wait = Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * Math.pow(1.8, attempt)));
            await sleep(wait);
        }
        attempt++;
    }
    if (!r) throw lastErr || new Error("Token refresh failed: no response");

    const data = await r.json();
    if (!r.ok) {
        throw new Error(`Refresh failed (${r.status}): ${JSON.stringify(data)}`);
    }

    const expires_in = Number(data.expires_in || 0); // seconds
    const expires_at = Date.now() + expires_in * 1000;

    await saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token || refresh_token,
        expires_at,
        scope: data.scope || "",
        userType: data.userType || "",
        companyId: data.companyId || "",
        locationId: data.locationId || "",
    });

    return data.access_token;
}

export async function getValidAccessToken() {
    await loadTokens();
    const t = getTokens();

    if (!t.access_token) throw new Error("No access_token yet. Run /connect/ghl first.");
    if (isExpiredSoon()) {
        return await refreshAccessToken();
    }
    return t.access_token;
}

export async function ghlFetch(pathOrUrl, options = {}) {
    const accessToken = await getValidAccessToken();

    const url = pathOrUrl.startsWith("http")
        ? pathOrUrl
        : `${API_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;

    const headers = {
        Authorization: `Bearer ${accessToken}`,
        Version: "2021-07-28",
        Accept: "application/json",
        ...(options.headers || {}),
    };

    let attempt = 0;
    let lastErr = null;
    while (attempt <= MAX_RETRIES) {
        let r = null;
        try {
            r = await fetchWithTimeout(url, { ...options, headers });
            const text = await r.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch {
                json = { raw: text };
            }

            if (!r.ok) {
                if (shouldRetry(r.status) && attempt < MAX_RETRIES) {
                    const wait = Math.max(
                        retryAfterMs(r.headers),
                        Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * Math.pow(1.8, attempt))),
                    );
                    await sleep(wait);
                    attempt++;
                    continue;
                }
                const err = new Error(`GHL API error (${r.status}) ${url}`);
                err.status = r.status;
                err.data = json;
                throw err;
            }

            return json;
        } catch (e) {
            const isAbort = String(e?.name || "").toLowerCase() === "aborterror";
            lastErr = e;
            if (attempt >= MAX_RETRIES) break;
            // Retry network/timeout errors as well.
            if (!isAbort && r && !shouldRetry(Number(r.status || 0))) break;
            const wait = Math.min(RETRY_MAX_MS, Math.round(RETRY_BASE_MS * Math.pow(1.8, attempt)));
            await sleep(wait);
            attempt++;
        }
    }

    throw lastErr instanceof Error ? lastErr : new Error(`GHL API failed after retries: ${url}`);
}

/* ===========================
   ✅ Helpers específicos GHL
   =========================== */

// 1) Crear subaccount (POST /locations/)
export async function createSubAccount(locationBody) {
    return await ghlFetch("/locations/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(locationBody),
    });
}

// 2) Sacar Location Token (POST /oauth/locationToken)
// OJO: esta ruta es JSON (no x-www-form-urlencoded)
export async function getLocationToken(locationId) {
    if (!locationId) throw new Error("getLocationToken requires locationId");

    return await ghlFetch("/oauth/locationToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId }),
    });
}

// 3) Get Custom Values de una location
export async function getCustomValues(locationId, locationAccessToken) {
    if (!locationId) throw new Error("getCustomValues requires locationId");
    if (!locationAccessToken) throw new Error("getCustomValues requires locationAccessToken");

    return await ghlFetch(`/locations/${locationId}/customValues`, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${locationAccessToken}`, // 👈 location token
        },
    });
}

// 4) Update un Custom Value (PUT) por ID (lo típico en GHL)
export async function updateCustomValue(locationId, customValueId, payload, locationAccessToken) {
    if (!locationId) throw new Error("updateCustomValue requires locationId");
    if (!customValueId) throw new Error("updateCustomValue requires customValueId");
    if (!locationAccessToken) throw new Error("updateCustomValue requires locationAccessToken");

    // payload esperado por ti: { name, value }
    return await ghlFetch(`/locations/${locationId}/customValues/${customValueId}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${locationAccessToken}`, // 👈 location token
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });
}
