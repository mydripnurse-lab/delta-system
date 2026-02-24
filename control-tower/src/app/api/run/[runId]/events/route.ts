import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const id = s(runId);
  if (!id) return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 600);
  const limit = Math.max(1, Math.min(5000, Number.isFinite(limitRaw) ? limitRaw : 600));
  const afterIdRaw = Number(url.searchParams.get("afterId") || 0);
  const afterId = Number.isFinite(afterIdRaw) ? Math.max(0, Math.floor(afterIdRaw)) : 0;
  const tenantId = s(url.searchParams.get("tenantId") || "");

  const pool = getDbPool();
  if (tenantId) {
    const ownerQ = await pool.query<{ run_id: string }>(
      `
        select run_id
        from app.runner_runs
        where run_id = $1
          and tenant_id = $2
        limit 1
      `,
      [id, tenantId],
    );
    if (!ownerQ.rows[0]) {
      return NextResponse.json({ ok: false, error: "Run not found for tenant" }, { status: 404 });
    }
  }

  const rows = await pool.query<{
    id: number;
    created_at: string;
    event_type: string;
    message: string;
    payload: unknown;
  }>(
    afterId > 0
      ? `
          select id, created_at::text, event_type, message, payload
          from app.runner_run_events
          where run_id = $1
            and id > $2
          order by id asc
          limit $3
        `
      : `
          select id, created_at::text, event_type, message, payload
          from app.runner_run_events
          where run_id = $1
          order by id desc
          limit $2
        `,
    afterId > 0 ? [id, afterId, limit] : [id, limit],
  );

  const orderedRows = afterId > 0 ? rows.rows : rows.rows.reverse();

  return NextResponse.json({
    ok: true,
    runId: id,
    events: orderedRows.map((r) => ({
      id: Number(r.id),
      createdAt: r.created_at,
      eventType: s(r.event_type) || "line",
      message: s(r.message),
      payload: r.payload ?? null,
    })),
  });
}
