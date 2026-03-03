import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { listTenantAiPrompts, upsertTenantAiPrompt } from "@/lib/aiPromptStore";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1 limit 1`, [tenantId]);
  return !!q.rows[0];
}

export async function GET(req: Request, ctx: Ctx) {
  try {
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

    const { searchParams } = new URL(req.url);
    const integrationKey = s(searchParams.get("integrationKey")) || "default";
    const rows = await listTenantAiPrompts(tenantId, integrationKey);
    return NextResponse.json({ ok: true, rows, total: rows.length });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list tenant AI prompts" },
      { status: 500 },
    );
  }
}

type PatchInput = {
  integrationKey?: string;
  promptKey?: string;
  name?: string;
  module?: string;
  routePath?: string;
  description?: string;
  promptText?: string;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
};

export async function PATCH(req: Request, ctx: Ctx) {
  try {
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

    const body = (await req.json().catch(() => null)) as PatchInput | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const promptKey = s(body.promptKey);
    const promptText = s(body.promptText);
    if (!promptKey) {
      return NextResponse.json({ ok: false, error: "Missing promptKey" }, { status: 400 });
    }
    if (!promptText) {
      return NextResponse.json({ ok: false, error: "Prompt text cannot be empty" }, { status: 400 });
    }

    const saved = await upsertTenantAiPrompt({
      tenantId,
      integrationKey: s(body.integrationKey) || "default",
      promptKey,
      name: s(body.name) || promptKey,
      module: s(body.module) || "ai",
      routePath: s(body.routePath),
      description: s(body.description),
      promptText,
      isActive: body.isActive !== false,
      metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    });

    return NextResponse.json({ ok: true, saved });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update tenant AI prompt" },
      { status: 500 },
    );
  }
}
