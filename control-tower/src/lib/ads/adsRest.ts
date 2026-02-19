import { getAdsOAuth2 } from "./adsAuth";
import {
    refreshGoogleAccessToken,
    resolveTenantOAuthConnection,
    saveTenantOAuthTokens,
} from "@/lib/tenantOAuth";

function s(v: any) {
    return String(v ?? "").trim();
}
function cleanCid(v: string) {
    return s(v).replace(/-/g, "");
}

async function getAccessToken() {
    const oauth2 = await getAdsOAuth2();
    const tok = await oauth2.getAccessToken();
    const accessToken = s((tok as any)?.token || tok);
    if (!accessToken) throw new Error("Failed to obtain Google OAuth access_token");
    return accessToken;
}

async function getTenantAccess(input: { tenantId: string; integrationKey?: string }) {
    const conn = await resolveTenantOAuthConnection({
        tenantId: input.tenantId,
        provider: "google_ads",
        integrationKey: input.integrationKey || "default",
    });
    const cfg = (conn.config || {}) as Record<string, unknown>;
    const refreshed = await refreshGoogleAccessToken({
        clientId: conn.client.clientId,
        clientSecret: conn.client.clientSecret,
        refreshToken: conn.refreshToken,
    });
    const accessToken = s(refreshed.accessToken);
    if (!accessToken) throw new Error("Failed to refresh tenant Google Ads access token");

    await saveTenantOAuthTokens({
        tenantId: input.tenantId,
        provider: "google_ads",
        integrationKey: input.integrationKey || "default",
        accessToken,
        refreshToken: s(refreshed.refreshToken),
        scopes: s(refreshed.scope).split(" ").map((x) => s(x)).filter(Boolean),
        tokenExpiresAt: refreshed.expiresAtIso,
        markConnected: true,
    });

    return {
        accessToken,
        customerId: s(conn.externalAccountId) || s(cfg.customerId) || s(cfg.googleAdsCustomerId),
        loginCustomerId: s(cfg.loginCustomerId) || s(cfg.googleAdsLoginCustomerId),
        developerToken: s(cfg.developerToken) || s(cfg.googleAdsDeveloperToken),
    };
}

function headersBase(developerTokenInput?: string, loginCustomerId?: string, allowEnvFallback = true) {
    const developerToken = allowEnvFallback
        ? s(developerTokenInput) || s(process.env.GOOGLE_ADS_DEVELOPER_TOKEN)
        : s(developerTokenInput);
    if (!developerToken) throw new Error("Missing Google Ads developer token.");

    const loginCid = cleanCid(loginCustomerId || s(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID));

    return {
        "developer-token": developerToken,
        ...(loginCid ? { "login-customer-id": loginCid } : {}),
        "content-type": "application/json",
    };
}

function buildSearchStreamUrl(opts: { version?: string; customerId: string }) {
    const version = s(opts.version) || s(process.env.GOOGLE_ADS_API_VERSION) || "v22";
    const customerId = cleanCid(opts.customerId);

    const base = `https://googleads.googleapis.com/${version}`;
    const path = `customers/${customerId}/googleAds:searchStream`;
    return `${base}/${path}`; // ✅ slash correcto
}

function versionCandidates(preferred?: string) {
    const seed = [s(preferred), s(process.env.GOOGLE_ADS_API_VERSION), "v22", "v21", "v20"].filter(Boolean);
    const out: string[] = [];
    const seen = new Set<string>();
    for (const v of seed) {
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
    }
    return out;
}

function shouldRetryWithAnotherVersion(status: number, payload: unknown) {
    if (status === 404) return true;
    const text = JSON.stringify(payload || "").toLowerCase();
    return (
        text.includes("unsupported_version") ||
        text.includes("deprecated") ||
        text.includes("version") && text.includes("blocked")
    );
}

/**
 * We normalize to `{ results: [...] }` so your joins stay consistent.
 */
export async function googleAdsSearch(opts: {
    query: string;
    customerId?: string;
    loginCustomerId?: string;
    version?: string;
    tenantId?: string;
    integrationKey?: string;
}) {
    const tenantId = s(opts.tenantId);
    const tenantAccess = tenantId
        ? await getTenantAccess({ tenantId, integrationKey: opts.integrationKey })
        : null;

    const customerId = tenantAccess
        ? cleanCid(opts.customerId || tenantAccess.customerId)
        : cleanCid(opts.customerId || s(process.env.GOOGLE_ADS_CUSTOMER_ID));
    if (!customerId) throw new Error("Missing Google Ads customerId.");

    const accessToken = tenantAccess?.accessToken || (await getAccessToken());
    const versions = versionCandidates(opts.version);
    let lastErr = "";

    for (const version of versions) {
        const endpoint = buildSearchStreamUrl({ version, customerId });
        console.log("[ADS] POST", endpoint);

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...headersBase(
                    tenantAccess
                        ? tenantAccess.developerToken
                        : undefined,
                    tenantAccess
                        ? (opts.loginCustomerId || tenantAccess.loginCustomerId)
                        : opts.loginCustomerId,
                    !tenantAccess,
                ),
            },
            body: JSON.stringify({ query: opts.query }),
        });

        const text = await res.text();
        let json: any;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = { raw: text };
        }

        if (res.ok) {
            const chunks = Array.isArray(json) ? json : [];
            const results = chunks.flatMap((c) => (Array.isArray(c?.results) ? c.results : []));
            return { results };
        }

        lastErr = `Google Ads ${version} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 3000)}`;
        if (!shouldRetryWithAnotherVersion(res.status, json)) {
            throw new Error(lastErr);
        }
    }

    throw new Error(lastErr || "Google Ads request failed for all API versions.");
}

export type GoogleAdsKeywordIdea = {
    text: string;
    avgMonthlySearches: number;
    competition: string;
    competitionIndex: number;
    lowTopOfPageBidMicros: number;
    highTopOfPageBidMicros: number;
};

export async function googleAdsGenerateKeywordIdeas(opts: {
    keywords: string[];
    tenantId: string;
    integrationKey?: string;
    customerId?: string;
    loginCustomerId?: string;
    version?: string;
    languageConstant?: string;
    geoTargetConstants?: string[];
    keywordPlanNetwork?: "GOOGLE_SEARCH" | "GOOGLE_SEARCH_AND_PARTNERS";
    pageSize?: number;
}) {
    const tenantId = s(opts.tenantId);
    if (!tenantId) throw new Error("Missing tenantId");
    const tenantAccess = await getTenantAccess({ tenantId, integrationKey: opts.integrationKey });
    const accessToken = tenantAccess.accessToken || (await getAccessToken());

    const customerId = cleanCid(opts.customerId || tenantAccess.customerId);
    if (!customerId) throw new Error("Missing Google Ads customerId.");

    const keywords = Array.from(
        new Set((opts.keywords || []).map((k) => s(k)).filter(Boolean)),
    ).slice(0, 20);
    if (!keywords.length) return { results: [] as GoogleAdsKeywordIdea[] };

    const versions = versionCandidates(opts.version);
    let lastErr = "";
    for (const version of versions) {
        const endpoint =
            `https://googleads.googleapis.com/${version}/customers/${customerId}/keywordPlanIdeas:generateKeywordIdeas`;

        const body = {
            language: s(opts.languageConstant) || "languageConstants/1000",
            geoTargetConstants:
                Array.isArray(opts.geoTargetConstants) && opts.geoTargetConstants.length
                    ? opts.geoTargetConstants
                    : ["geoTargetConstants/2840"],
            keywordPlanNetwork: s(opts.keywordPlanNetwork) || "GOOGLE_SEARCH_AND_PARTNERS",
            pageSize: Number(opts.pageSize || 100),
            keywordSeed: { keywords },
            includeAdultKeywords: false,
        };

        const res = await fetch(endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                ...headersBase(
                    tenantAccess.developerToken,
                    opts.loginCustomerId || tenantAccess.loginCustomerId,
                    false,
                ),
            },
            body: JSON.stringify(body),
        });

        const text = await res.text();
        let json: any;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = { raw: text };
        }

        if (res.ok) {
            const rawResults = Array.isArray(json?.results)
                ? json.results
                : Array.isArray(json?.keywordIdeas)
                    ? json.keywordIdeas
                    : [];
            const results: GoogleAdsKeywordIdea[] = rawResults.map((r: any) => {
                const m = (r?.keywordIdeaMetrics || r?.keyword_idea_metrics || {}) as Record<string, unknown>;
                return {
                    text: s(r?.text || r?.keyword),
                    avgMonthlySearches: Number(m.avgMonthlySearches || m.avg_monthly_searches || 0),
                    competition: s(m.competition || "UNSPECIFIED"),
                    competitionIndex: Number(m.competitionIndex || m.competition_index || 0),
                    lowTopOfPageBidMicros: Number(m.lowTopOfPageBidMicros || m.low_top_of_page_bid_micros || 0),
                    highTopOfPageBidMicros: Number(m.highTopOfPageBidMicros || m.high_top_of_page_bid_micros || 0),
                };
            }).filter((x) => x.text);
            return { results };
        }

        lastErr = `Google Ads Keyword Ideas ${version} HTTP ${res.status}: ${JSON.stringify(json).slice(0, 3000)}`;
        if (!shouldRetryWithAnotherVersion(res.status, json)) {
            throw new Error(lastErr);
        }
    }

    throw new Error(lastErr || "Google Ads keyword ideas failed for all API versions.");
}
