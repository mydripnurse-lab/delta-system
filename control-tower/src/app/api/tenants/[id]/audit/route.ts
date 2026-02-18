import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) {
    return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit") || 50)));
  const action = s(searchParams.get("action"));

  const where: string[] = [`organization_id = $1`];
  const vals: unknown[] = [tenantId];
  if (action) {
    vals.push(action);
    where.push(`action = $${vals.length}`);
  }
  vals.push(limit);

  const pool = getDbPool();
  try {
    const q = await pool.query(
      `
        select
          id,
          organization_id as "organizationId",
          actor_type as "actorType",
          actor_user_id as "actorUserId",
          actor_label as "actorLabel",
          action,
          entity_type as "entityType",
          entity_id as "entityId",
          severity,
          payload,
          created_at as "createdAt"
        from app.organization_audit_logs
        where ${where.join(" and ")}
        order by created_at desc
        limit $${vals.length}
      `,
      vals,
    );
    return NextResponse.json({ ok: true, total: q.rowCount ?? 0, rows: q.rows });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read audit logs";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
