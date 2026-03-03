import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import {
  readTenantCampaignContextSettings,
  writeTenantCampaignContextSettings,
} from "@/lib/campaignContextSettings";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const data = await readTenantCampaignContextSettings(tenantId);
    return NextResponse.json({ ok: true, ...data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read campaign context settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) {
    return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = await writeTenantCampaignContextSettings(tenantId, body);
    return NextResponse.json({ ok: true, payload });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save campaign context settings";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
