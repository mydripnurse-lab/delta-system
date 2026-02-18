import { google } from "googleapis";
import { saveTenantOAuthTokens, getTenantOAuthClientConfig } from "@/lib/tenantOAuth";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

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

export async function GET(req: Request) {
    const url = new URL(req.url);
    const code = s(url.searchParams.get("code"));
    const err = s(url.searchParams.get("error"));
    const rawState = s(url.searchParams.get("state"));
    const state = decodeState(rawState);
    const tenantId = s(state?.tenantId || url.searchParams.get("tenantId"));
    const integrationKey = s(state?.integrationKey || url.searchParams.get("integrationKey")) || "default";
    const returnTo = s(state?.returnTo) || `/projects/${tenantId}`;

    if (err) {
        return new Response(`OAuth error: ${err}`, { status: 400 });
    }
    if (!code) {
        return new Response("Missing ?code=", { status: 400 });
    }
    if (!tenantId) {
        return new Response("Missing tenantId (state/query).", { status: 400 });
    }

    const { clientId, clientSecret, redirectUri } = await getTenantOAuthClientConfig({
        tenantId,
        provider: "google_search_console",
        integrationKey,
    });

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Exchange code -> tokens
    const { tokens } = await oauth2.getToken(code);

    const accessToken = s(tokens.access_token);
    const refreshToken = s(tokens.refresh_token);
    const existing = await getTenantIntegration(tenantId, "google_search_console", integrationKey);
    if (!refreshToken && !s(existing?.refreshTokenEnc)) {
        return new Response(
            "Google no devolvio refresh_token. Repite la conexion OAuth con prompt=consent y selecciona la cuenta correcta.",
            { status: 400 },
        );
    }
    const tokenExpiresAt =
        Number.isFinite(Number(tokens.expiry_date)) && Number(tokens.expiry_date) > 0
            ? new Date(Number(tokens.expiry_date)).toISOString()
            : null;
    const scopeList = s(tokens.scope).split(" ").map((x) => s(x)).filter(Boolean);

    await saveTenantOAuthTokens({
        tenantId,
        provider: "google_search_console",
        integrationKey,
        accessToken,
        refreshToken,
        scopes: scopeList,
        tokenExpiresAt,
        markConnected: true,
    });

    const okUrl = new URL(returnTo || "/", url.origin);
    okUrl.searchParams.set("oauth", "gsc_ok");
    okUrl.searchParams.set("tenantId", tenantId);
    okUrl.searchParams.set("integrationKey", integrationKey);
    okUrl.searchParams.set("hasRefresh", refreshToken ? "1" : "0");
    return Response.redirect(okUrl.toString(), 302);
}
