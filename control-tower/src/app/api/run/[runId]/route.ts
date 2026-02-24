import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { getRun, removeRun, stopRun } from "@/lib/runStore";

function s(v: unknown) {
  return String(v ?? "").trim();
}

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ runId: string }> }) {
  const { runId } = await ctx.params;
  const id = s(runId);
  if (!id) return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });

  const url = new URL(req.url);
  const forceStop = ["1", "true", "yes"].includes(s(url.searchParams.get("forceStop")).toLowerCase());

  const inMem = getRun(id);
  if (inMem && !inMem.finished && !forceStop) {
    return NextResponse.json(
      { ok: false, error: "Run is still active. Stop it first or call DELETE with ?forceStop=1." },
      { status: 409 },
    );
  }

  if (inMem) {
    if (!inMem.finished || forceStop) stopRun(id);
    removeRun(id);
  }

  const pool = getDbPool();
  await pool.query("delete from app.runner_run_events where run_id = $1", [id]);
  const del = await pool.query("delete from app.runner_runs where run_id = $1 returning run_id", [id]);

  if (!del.rows[0] && !inMem) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, runId: id, deleted: true, forceStop });
}

