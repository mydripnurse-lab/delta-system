import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import {
  refreshGoogleAccessToken,
  resolveTenantOAuthConnection,
  saveTenantOAuthTokens,
} from "@/lib/tenantOAuth";
import { getAgencyAccessTokenOrThrow } from "@/lib/ghlHttp";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function asObj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pickApiCredential(provider: string, config: Record<string, unknown>) {
  const p = s(provider).toLowerCase();
  const auth = asObj(config.auth);
  if (p === "bing_webmaster") {
    return s(config.webmasterApiKey) || s(config.indexNowKey) || s(config.apiKey) || s(auth.webmasterApiKey) || s(auth.apiKey);
  }
  if (p === "custom") {
    return s(config.agentApiKey) || s(config.openclawApiKey) || s(config.apiKey) || s(auth.apiKey);
  }
  if (p === "google_ads") {
    return s(config.developerToken) || s(config.googleAdsDeveloperToken) || s(config.apiKey) || s(auth.apiKey);
  }
  return s(config.apiKey) || s(config.api_key) || s(auth.apiKey) || s(auth.api_key);
}

type VerifyBody = {
  id?: string;
  provider?: string;
  integrationKey?: string;
  mode?: "single" | "refresh_due";
};

type IntegrationRow = {
  id: string;
  provider: string;
  integration_key: string;
  status: string;
  auth_type: string;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  config: Record<string, unknown> | null;
};

async function refreshOauthForRow(tenantId: string, row: IntegrationRow) {
  const provider = s(row.provider).toLowerCase();
  const integrationKey = s(row.integration_key) || "default";

  if (provider === "google_search_console" || provider === "google_ads") {
    const conn = await resolveTenantOAuthConnection({
      tenantId,
      provider,
      integrationKey,
    });
    const refreshed = await refreshGoogleAccessToken({
      clientId: conn.client.clientId,
      clientSecret: conn.client.clientSecret,
      refreshToken: conn.refreshToken,
    });
    const accessToken = s(refreshed.accessToken);
    if (!accessToken) throw new Error("OAuth refresh returned empty access token.");
    await saveTenantOAuthTokens({
      tenantId,
      provider,
      integrationKey,
      accessToken,
      refreshToken: s(refreshed.refreshToken) || undefined,
      scopes: s(refreshed.scope).split(" ").map((x) => s(x)).filter(Boolean),
      tokenExpiresAt: refreshed.expiresAtIso,
      markConnected: true,
    });
    return {
      ok: true,
      provider,
      integrationKey,
      refreshed: true,
      message: "OAuth token refreshed.",
    };
  }

  if (provider === "ghl" || provider === "custom") {
    const token = await getAgencyAccessTokenOrThrow({
      tenantId,
      integrationKey,
    });
    if (!s(token)) throw new Error("GHL token refresh returned empty access token.");
    return {
      ok: true,
      provider,
      integrationKey,
      refreshed: true,
      message: "GHL OAuth token verified/refreshed.",
    };
  }

  throw new Error(`OAuth verify is not supported for provider '${provider}'.`);
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const tenantId = s(id);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
    }
    const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
    if ("response" in auth) return auth.response;

    const body = (await req.json().catch(() => null)) as VerifyBody | null;
    const mode = s(body?.mode) === "refresh_due" ? "refresh_due" : "single";
    const integrationId = s(body?.id);
    const provider = s(body?.provider);
    const integrationKey = s(body?.integrationKey);

    const pool = getDbPool();
    const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
    if (!exists.rowCount) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    if (mode === "refresh_due") {
      const due = await pool.query<IntegrationRow>(
        `
          select
            id,
            provider,
            integration_key,
            status,
            auth_type,
            refresh_token_enc,
            token_expires_at,
            config
          from app.organization_integrations
          where organization_id = $1
            and auth_type = 'oauth'
            and nullif(refresh_token_enc, '') is not null
            and (
              token_expires_at is null
              or token_expires_at <= now() + interval '5 minutes'
              or status in ('needs_reconnect','error')
            )
        `,
        [tenantId],
      );

      const results: Array<Record<string, unknown>> = [];
      for (const row of due.rows) {
        try {
          const out = await refreshOauthForRow(tenantId, row);
          results.push({ id: row.id, ...out });
        } catch (e: any) {
          results.push({
            id: row.id,
            provider: row.provider,
            integrationKey: row.integration_key,
            ok: false,
            error: e?.message || "OAuth refresh failed",
          });
        }
      }
      return NextResponse.json({
        ok: true,
        mode,
        total: results.length,
        results,
      });
    }

    if (!integrationId && !(provider && integrationKey)) {
      return NextResponse.json(
        { ok: false, error: "id or provider+integrationKey is required" },
        { status: 400 },
      );
    }

    let q;
    if (integrationId) {
      q = await pool.query<IntegrationRow>(
        `
          select
            id,
            provider,
            integration_key,
            status,
            auth_type,
            refresh_token_enc,
            token_expires_at,
            config
          from app.organization_integrations
          where organization_id = $1 and id = $2
          limit 1
        `,
        [tenantId, integrationId],
      );
    } else {
      q = await pool.query<IntegrationRow>(
        `
          select
            id,
            provider,
            integration_key,
            status,
            auth_type,
            refresh_token_enc,
            token_expires_at,
            config
          from app.organization_integrations
          where organization_id = $1
            and provider = $2
            and integration_key = $3
          limit 1
        `,
        [tenantId, provider, integrationKey],
      );
    }
    const row = q.rows[0];
    if (!row) {
      return NextResponse.json({ ok: false, error: "Integration not found" }, { status: 404 });
    }

    if (s(row.auth_type).toLowerCase() === "oauth") {
      const out = await refreshOauthForRow(tenantId, row);
      return NextResponse.json({ ok: true, id: row.id, ...out });
    }

    const cfg = asObj(row.config);
    const credential = pickApiCredential(row.provider, cfg);
    if (!credential) {
      await pool.query(
        `
          update app.organization_integrations
          set
            status = 'disconnected',
            last_error = 'Credential missing in DB config.',
            updated_at = now()
          where organization_id = $1
            and id = $2
        `,
        [tenantId, row.id],
      );
      return NextResponse.json({
        ok: false,
        id: row.id,
        provider: row.provider,
        integrationKey: row.integration_key,
        error: "Credential missing in DB config.",
      });
    }
    await pool.query(
      `
        update app.organization_integrations
        set
          status = 'connected',
          last_error = null,
          updated_at = now()
        where organization_id = $1
          and id = $2
      `,
      [tenantId, row.id],
    );
    return NextResponse.json({
      ok: true,
      id: row.id,
      provider: row.provider,
      integrationKey: row.integration_key,
      verified: true,
      message: "Credential is present.",
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
