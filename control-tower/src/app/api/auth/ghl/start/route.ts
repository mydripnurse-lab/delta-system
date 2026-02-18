import { NextResponse } from "next/server";
import { getTenantOAuthClientConfig } from "@/lib/tenantOAuth";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

const CHOOSE_LOCATION_URL = "https://marketplace.gohighlevel.com/oauth/chooselocation";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function encodeState(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

async function resolveGhlProvider(tenantId: string, integrationKey: string) {
  const ghl = await getTenantIntegration(tenantId, "ghl", integrationKey);
  if (ghl) return "ghl" as const;
  const custom = await getTenantIntegration(tenantId, "custom", integrationKey);
  if (custom) return "custom" as const;
  return "ghl" as const;
}

export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const tenantId = s(u.searchParams.get("tenantId"));
    const integrationKey = s(u.searchParams.get("integrationKey")) || "owner";
    const returnTo = s(u.searchParams.get("returnTo")) || `/projects/${tenantId}`;

    if (!tenantId) {
      return new Response("Missing tenantId query param.", { status: 400 });
    }

    const provider = await resolveGhlProvider(tenantId, integrationKey);
    const row = await getTenantIntegration(tenantId, provider, integrationKey);
    const cfg = row?.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};

    const { clientId, redirectUri } = await getTenantOAuthClientConfig({
      tenantId,
      provider,
      integrationKey,
    });

    const scopeFromCfg = Array.isArray(cfg.oauthScopes)
      ? cfg.oauthScopes.map((x) => s(x)).filter(Boolean).join(" ")
      : s(cfg.oauthScopes);
    const scope = scopeFromCfg || "contacts.readonly contacts.write opportunities.readonly opportunities.write";
    const userType = s(cfg.oauthUserType) || "Location";

    const p = new URLSearchParams();
    p.set("response_type", "code");
    p.set("client_id", clientId);
    p.set("redirect_uri", redirectUri);
    p.set("scope", scope);
    p.set("user_type", userType);
    p.set(
      "state",
      encodeState({
        tenantId,
        provider,
        integrationKey,
        returnTo,
        at: Date.now(),
      }),
    );

    const authUrl = `${CHOOSE_LOCATION_URL}?${p.toString()}`;
    return NextResponse.redirect(authUrl);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to build GHL OAuth URL";
    return new Response(message, { status: 500 });
  }
}
