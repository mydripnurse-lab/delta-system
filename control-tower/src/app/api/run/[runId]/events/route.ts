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

  const pool = getDbPool();
  const rows = await pool.query<{
    id: number;
    created_at: string;
    event_type: string;
    message: string;
    payload: unknown;
  }>(
    `
      select id, created_at::text, event_type, message, payload
      from app.runner_run_events
      where run_id = $1
      order by id desc
      limit $2
    `,
    [id, limit],
  );

  return NextResponse.json({
    ok: true,
    runId: id,
    events: rows.rows.reverse().map((r) => ({
      id: Number(r.id),
      createdAt: r.created_at,
      eventType: s(r.event_type) || "line",
      message: s(r.message),
      payload: r.payload ?? null,
    })),
  });
}

