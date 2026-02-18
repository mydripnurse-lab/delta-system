import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getTenantIntegration, upsertTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

type ShareBody = {
  sourceTenantId?: string;
  provider?: "google_search_console" | "google_ads" | "google_analytics";
  sourceIntegrationKey?: string;
  targetIntegrationKey?: string;
  mode?: "copy" | "reference";
};

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const targetTenantId = s(id);
  if (!targetTenantId) {
    return NextResponse.json({ ok: false, error: "Missing target tenant id" }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as ShareBody | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });

  const sourceTenantId = s(body.sourceTenantId);
  const provider = s(body.provider);
  const sourceIntegrationKey = s(body.sourceIntegrationKey) || "default";
  const targetIntegrationKey = s(body.targetIntegrationKey) || "default";
  const mode = s(body.mode) === "reference" ? "reference" : "copy";

  if (!sourceTenantId || !provider) {
    return NextResponse.json(
      { ok: false, error: "sourceTenantId and provider are required" },
      { status: 400 },
    );
  }

  const pool = getDbPool();
  const [sourceExists, targetExists] = await Promise.all([
    pool.query(`select 1 from app.organizations where id = $1 limit 1`, [sourceTenantId]),
    pool.query(`select 1 from app.organizations where id = $1 limit 1`, [targetTenantId]),
  ]);
  if (!sourceExists.rows[0]) {
    return NextResponse.json({ ok: false, error: "Source tenant not found" }, { status: 404 });
  }
  if (!targetExists.rows[0]) {
    return NextResponse.json({ ok: false, error: "Target tenant not found" }, { status: 404 });
  }

  const source = await getTenantIntegration(sourceTenantId, provider, sourceIntegrationKey);
  if (!source) {
    return NextResponse.json(
      { ok: false, error: `Source integration ${provider}:${sourceIntegrationKey} not found` },
      { status: 404 },
    );
  }
  if (!s(source.refreshTokenEnc)) {
    return NextResponse.json(
      { ok: false, error: `Source integration ${provider}:${sourceIntegrationKey} has no refresh token` },
      { status: 400 },
    );
  }

  const sourceCfg = (source.config && typeof source.config === "object" ? source.config : {}) as Record<
    string,
    unknown
  >;
  const nextConfig =
    mode === "reference"
      ? {
          ...sourceCfg,
          sharedFromTenantId: sourceTenantId,
          sharedIntegrationKey: sourceIntegrationKey,
        }
      : sourceCfg;

  await upsertTenantIntegration({
    organizationId: targetTenantId,
    provider,
    integrationKey: targetIntegrationKey,
    status: "connected",
    authType: "oauth",
    accessTokenEnc: mode === "copy" ? source.accessTokenEnc : null,
    refreshTokenEnc: mode === "copy" ? source.refreshTokenEnc : null,
    tokenExpiresAt: mode === "copy" ? source.tokenExpiresAt : null,
    scopes: Array.isArray(source.scopes) ? source.scopes : [],
    externalAccountId: source.externalAccountId,
    externalPropertyId: source.externalPropertyId,
    config: nextConfig,
    metadata: {
      copiedFrom: {
        tenantId: sourceTenantId,
        provider,
        integrationKey: sourceIntegrationKey,
        mode,
        at: new Date().toISOString(),
      },
    },
    lastError: null,
  });

  return NextResponse.json({
    ok: true,
    mode,
    source: { tenantId: sourceTenantId, provider, integrationKey: sourceIntegrationKey },
    target: { tenantId: targetTenantId, provider, integrationKey: targetIntegrationKey },
  });
}

