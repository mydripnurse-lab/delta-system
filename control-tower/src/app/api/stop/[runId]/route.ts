// src/app/api/stop/[runId]/route.ts
import { NextResponse } from "next/server";
import { stopRun, getRun } from "@/lib/runStore";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
    const { runId } = await ctx.params;

    if (!runId) return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });

    const run = getRun(runId);
    if (!run) {
        // Fallback: run may exist only in DB (different worker/process).
        const pool = getDbPool();
        const q = await pool.query<{ run_id: string }>(
            `
              update app.runner_runs
                 set stopped = true,
                     status = 'stopped',
                     updated_at = now()
               where run_id = $1
               returning run_id
            `,
            [runId],
        );
        if (!q.rows[0]) {
            return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
        }
        return NextResponse.json({
            ok: true,
            runId,
            forced: true,
            note: "Run was not attached in memory. Marked as stopped in DB.",
        });
    }

    const ok = stopRun(runId);
    return NextResponse.json({ ok: !!ok, runId, forced: false });
}
