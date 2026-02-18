// control-tower/src/app/api/auth/gsc/start/route.ts
import { NextResponse } from "next/server";
import { getTenantOAuthClientConfig } from "@/lib/tenantOAuth";

export const runtime = "nodejs";

function s(v: unknown) {
    return String(v ?? "").trim();
}

function encodeState(payload: Record<string, unknown>) {
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export async function GET(req: Request) {
    try {
        const u = new URL(req.url);
        const tenantId = s(u.searchParams.get("tenantId"));
        const integrationKey = s(u.searchParams.get("integrationKey")) || "default";
        const returnTo = s(u.searchParams.get("returnTo")) || `/projects/${tenantId}`;

        if (!tenantId) {
            return new Response("Missing tenantId query param.", { status: 400 });
        }

        const { clientId, redirectUri } = await getTenantOAuthClientConfig({
            tenantId,
            provider: "google_search_console",
            integrationKey,
        });

        const scopes = [
            "https://www.googleapis.com/auth/webmasters.readonly",
            "https://www.googleapis.com/auth/analytics.readonly",
        ];

        const p = new URLSearchParams();
        p.set("client_id", clientId);
        p.set("redirect_uri", redirectUri);
        p.set("response_type", "code");
        p.set("access_type", "offline");
        p.set("prompt", "consent");
        p.set("scope", scopes.join(" "));
        p.set("include_granted_scopes", "true");
        p.set(
            "state",
            encodeState({
                tenantId,
                integrationKey,
                provider: "google_search_console",
                returnTo,
                at: Date.now(),
            }),
        );

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
        return NextResponse.redirect(authUrl);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Failed to build OAuth URL";
        return new Response(message, { status: 500 });
    }
}
