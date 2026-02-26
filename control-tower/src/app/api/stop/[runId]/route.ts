// src/app/api/stop/[runId]/route.ts
import { NextResponse } from "next/server";
import { stopRun, getRun } from "@/lib/runStore";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function parsePidFromMessage(message: unknown) {
    const m = String(message || "").trim();
    if (!m.startsWith("__RUN_PID__")) return 0;
    const n = Number(m.replace("__RUN_PID__", "").trim());
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function killPid(pid: number) {
    if (!(pid > 0)) return false;
    let killed = false;
    if (process.platform !== "win32") {
        try {
            process.kill(-pid, "SIGTERM");
            killed = true;
        } catch {}
    }
    if (!killed) {
        try {
            process.kill(pid, "SIGTERM");
            killed = true;
        } catch {}
    }
    setTimeout(() => {
        if (process.platform !== "win32") {
            try {
                process.kill(-pid, "SIGKILL");
                return;
            } catch {}
        }
        try {
            process.kill(pid, "SIGKILL");
        } catch {}
    }, 1500);
    return killed;
}

function workerHeaders() {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    const key = String(process.env.RUNNER_WORKER_API_KEY || "").trim();
    if (key) {
        headers.authorization = `Bearer ${key}`;
        headers["x-api-key"] = key;
    }
    return headers;
}

async function stopRemoteWorker(runId: string) {
    const workerUrl = String(process.env.RUNNER_WORKER_URL || "").trim();
    if (!workerUrl) return { attempted: false, ok: false, message: "worker_not_configured" };
    const timeoutMs = Math.max(5_000, Number(process.env.RUNNER_WORKER_STOP_TIMEOUT_MS || 20_000));
    const url = workerUrl.replace(/\/run\/?$/, "/stop");
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: workerHeaders(),
            body: JSON.stringify({ runId, source: "control-tower", timestamp: new Date().toISOString() }),
            signal: AbortSignal.timeout(timeoutMs),
            cache: "no-store",
        });
        const raw = await res.text().catch(() => "");
        const ok = res.ok && (!raw || raw.includes('"ok":true'));
        return { attempted: true, ok, message: raw || `HTTP ${res.status}` };
    } catch (e: unknown) {
        return { attempted: true, ok: false, message: e instanceof Error ? e.message : String(e) };
    }
}

async function releaseDeltaItemLocks(runId: string) {
    const pool = getDbPool();
    try {
        const q = await pool.query<{ count: string }>(
            `
              with rel as (
                update app.run_delta_item_state
                   set status = 'failed',
                       run_id = null,
                       locked_at = null,
                       last_error = coalesce(nullif(last_error, ''), 'Stopped by user'),
                       updated_at = now()
                 where run_id = $1
                   and status = 'running'
                returning 1
              )
              select count(*)::text as count from rel
            `,
            [runId],
        );
        return Number(q.rows[0]?.count || 0);
    } catch {
        return 0;
    }
}

export async function POST(_req: Request, ctx: { params: Promise<{ runId: string }> }) {
    const { runId } = await ctx.params;

    if (!runId) return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });

    const remoteStop = await stopRemoteWorker(runId);
    const releasedLocks = await releaseDeltaItemLocks(runId);
    const run = getRun(runId);
    if (!run) {
        // Fallback: run may exist only in DB (different worker/process).
        const pool = getDbPool();
        const pidQ = await pool.query<{ message: string }>(
            `
              select message
              from app.runner_run_events
              where run_id = $1
                and message like '__RUN_PID__ %'
              order by id desc
              limit 1
            `,
            [runId],
        );
        const pid = parsePidFromMessage(pidQ.rows[0]?.message);
        const killed = pid > 0 ? killPid(pid) : false;

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
            pid: pid || null,
            killed,
            releasedLocks,
            remoteStop,
            note: killed
                ? "Run was not attached in memory. Process killed by PID and marked as stopped in DB."
                : "Run was not attached in memory. Marked as stopped in DB.",
        });
    }

    const ok = stopRun(runId);
    return NextResponse.json({ ok: !!ok, runId, forced: false, releasedLocks, remoteStop });
}
