// control-tower/src/app/api/dashboard/ads/ping/route.ts
import { NextResponse } from "next/server";
import {
    refreshGoogleAccessToken,
    resolveTenantOAuthConnection,
    saveTenantOAuthTokens,
} from "@/lib/tenantOAuth";

export const runtime = "nodejs";

function s(v: any) {
    return String(v ?? "").trim();
}
function cleanCid(v: string) {
    return s(v).replace(/-/g, "");
}

async function googleAdsSearch(input: {
    tenantId: string;
    integrationKey: string;
    customerId: string;
    query: string;
}) {
    const conn = await resolveTenantOAuthConnection({
        tenantId: input.tenantId,
        provider: "google_ads",
        integrationKey: input.integrationKey,
    });
    const cfg = (conn.config || {}) as Record<string, unknown>;
    const refreshed = await refreshGoogleAccessToken({
        clientId: conn.client.clientId,
        clientSecret: conn.client.clientSecret,
        refreshToken: conn.refreshToken,
    });
    const accessToken = s(refreshed.accessToken);
    if (!accessToken) throw new Error("Failed to refresh Google Ads OAuth access token.");

    await saveTenantOAuthTokens({
        tenantId: input.tenantId,
        provider: "google_ads",
        integrationKey: input.integrationKey,
        accessToken,
        scopes: s(refreshed.scope).split(" ").map((x) => s(x)).filter(Boolean),
        tokenExpiresAt: refreshed.expiresAtIso,
        markConnected: true,
    });

    const developerToken =
        s(cfg.developerToken) ||
        s(cfg.googleAdsDeveloperToken);
    const loginCustomerId = cleanCid(
        s(cfg.loginCustomerId) ||
        s(cfg.googleAdsLoginCustomerId),
    );

    if (!developerToken) throw new Error("Missing Google Ads developer token in tenant integration config.");
    if (!input.customerId) throw new Error("Missing customerId");

    // ✅ Docs indican base URL con versión (hoy v23) y método search
    // https://googleads.googleapis.com/v23/customers/CUSTOMER_ID/googleAds:search
    // :contentReference[oaicite:2]{index=2}
    const url = `https://googleads.googleapis.com/v23/customers/${input.customerId}/googleAds:search`;

    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        "Content-Type": "application/json",
    };

    // opcional pero recomendado cuando usas MCC
    if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

    const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query: input.query }),
        cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
        // devuelve raw para debug
        throw new Error(`Google Ads HTTP ${res.status}: ${text}`);
    }

    try {
        return JSON.parse(text);
    } catch {
        return { raw: text };
    }
}

export async function GET(req: Request) {
    try {
        const u = new URL(req.url);
        const tenantId = s(u.searchParams.get("tenantId"));
        const integrationKey = s(u.searchParams.get("integrationKey")) || "default";
        if (!tenantId) throw new Error("Missing tenantId");

        const conn = await resolveTenantOAuthConnection({
            tenantId,
            provider: "google_ads",
            integrationKey,
        });
        const cfg = (conn.config || {}) as Record<string, unknown>;
        const customerId = cleanCid(
            s(u.searchParams.get("customerId")) ||
            s(conn.externalAccountId) ||
            s(cfg.customerId) ||
            s(cfg.googleAdsCustomerId),
        );
        if (!customerId) throw new Error("Missing customerId in tenant integration");

        // query mínima para confirmar que responde
        const query = `
      SELECT
        customer.id,
        customer.descriptive_name,
        customer.currency_code,
        customer.time_zone
      FROM customer
      LIMIT 1
    `.trim();

        const out = await googleAdsSearch({
            tenantId,
            integrationKey,
            customerId,
            query,
        });

        return NextResponse.json({
            ok: true,
            tenantId,
            integrationKey,
            customerId,
            out,
        });
    } catch (e: any) {
        return NextResponse.json(
            { ok: false, error: e?.message || String(e) },
            { status: 500 },
        );
    }
}
