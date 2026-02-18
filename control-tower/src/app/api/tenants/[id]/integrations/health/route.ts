import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function tokenHealth(tokenExpiresAt: string | null) {
  if (!tokenExpiresAt) return { tokenExpiresInSec: null, needsRefresh: false };
  const ms = new Date(tokenExpiresAt).getTime();
  if (!Number.isFinite(ms)) return { tokenExpiresInSec: null, needsRefresh: false };
  const sec = Math.floor((ms - Date.now()) / 1000);
  return {
    tokenExpiresInSec: sec,
    needsRefresh: sec <= 120,
  };
}

type Row = {
  id: string;
  provider: string;
  integration_key: string;
  status: string;
  auth_type: string;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  token_expires_at: string | null;
  updated_at: string;
  last_error: string | null;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const tenantId = s(id);
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
    }

    const u = new URL(req.url);
    const provider = s(u.searchParams.get("provider"));
    const integrationKey = s(u.searchParams.get("integrationKey"));

    const pool = getDbPool();
    const exists = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
    if (!exists.rowCount) {
      return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
    }

    const where: string[] = ["organization_id = $1"];
    const vals: unknown[] = [tenantId];
    if (provider) {
      vals.push(provider);
      where.push(`provider = $${vals.length}`);
    }
    if (integrationKey) {
      vals.push(integrationKey);
      where.push(`integration_key = $${vals.length}`);
    }

    const q = await pool.query<Row>(
      `
        select
          id,
          provider,
          integration_key,
          status,
          auth_type,
          access_token_enc,
          refresh_token_enc,
          token_expires_at,
          updated_at,
          last_error
        from app.organization_integrations
        where ${where.join(" and ")}
        order by provider asc, integration_key asc
      `,
      vals,
    );

    const rows = q.rows.map((r) => {
      const hasAccessToken = !!s(r.access_token_enc);
      const hasRefreshToken = !!s(r.refresh_token_enc);
      const health = tokenHealth(r.token_expires_at);
      const reconnectRecommended =
        r.status === "needs_reconnect" ||
        r.status === "error" ||
        (r.auth_type === "oauth" && !hasRefreshToken);

      return {
        id: r.id,
        provider: r.provider,
        integrationKey: r.integration_key,
        status: r.status,
        authType: r.auth_type,
        hasAccessToken,
        hasRefreshToken,
        tokenExpiresAt: r.token_expires_at,
        tokenExpiresInSec: health.tokenExpiresInSec,
        needsRefresh: health.needsRefresh,
        reconnectRecommended,
        lastError: s(r.last_error) || null,
        updatedAt: r.updated_at,
      };
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      total: rows.length,
      rows,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
