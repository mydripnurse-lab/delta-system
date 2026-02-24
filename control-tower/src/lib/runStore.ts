// src/lib/runStore.ts
import { EventEmitter } from "events";
import type { ChildProcess } from "child_process";
import {
    persistRunCmd,
    persistRunCreated,
    persistRunEvent,
    persistRunFinished,
    persistRunStopped,
} from "@/lib/runHistoryStore";

export type RunMeta = {
    job?: string;
    state?: string;
    mode?: string;
    debug?: boolean;
    tenantId?: string;
    locId?: string;
    kind?: string;
    cmd?: string;
};

export type RunRecord = {
    id: string;
    createdAt: number;
    meta: RunMeta;
    emitter: EventEmitter;
    lines: string[];
    stopped: boolean;
    finished: boolean;
    exitCode: number | null;
    error?: string;
    proc?: ChildProcess;
    progress?: {
        pct: number | null;
        doneAll: number;
        doneCounties: number;
        doneCities: number;
        totalAll: number;
        totalCounties: number;
        totalCities: number;
        lastMessage: string;
        etaSec: number | null;
        updatedAt: number;
    };
};

// ✅ IMPORTANT: keep store in globalThis so /api/run and /api/stream share it
type GlobalRunStore = {
    runs: Map<string, RunRecord>;
};

declare global {
    var __RUN_STORE__: GlobalRunStore | undefined;
}

const g = globalThis as typeof globalThis & { __RUN_STORE__?: GlobalRunStore };

if (!g.__RUN_STORE__) {
    g.__RUN_STORE__ = {
        runs: new Map<string, RunRecord>(),
    } satisfies GlobalRunStore;
}

const runs: Map<string, RunRecord> = g.__RUN_STORE__.runs;

function now() {
    return Date.now();
}

function cleanupOldRuns() {
    const TTL_MS = 1000 * 60 * 30; // 30 min
    const t = now();
    for (const [id, r] of runs.entries()) {
        if (t - r.createdAt > TTL_MS) runs.delete(id);
    }
}

export function createRun(meta: RunMeta = {}) {
    cleanupOldRuns();
    const id = `${Date.now()}-${Math.floor(Math.random() * 1e12)}`;

    const rec: RunRecord = {
        id,
        createdAt: now(),
        meta,
        emitter: new EventEmitter(),
        lines: [],
        stopped: false,
        finished: false,
        exitCode: null,
    };

    runs.set(id, rec);
    persistRunCreated(id, meta, rec.createdAt);
    return rec;
}

export function getRun(id: string) {
    return runs.get(id) || null;
}

export function listRuns(opts?: { activeOnly?: boolean; limit?: number }) {
    cleanupOldRuns();
    const activeOnly = !!opts?.activeOnly;
    const limit = Math.max(1, Number(opts?.limit || 50));
    const items = Array.from(runs.values())
        .filter((r) => (activeOnly ? !r.finished : true))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((r) => ({
            status: !r.finished ? "running" : r.stopped ? "stopped" : (r.exitCode ?? 0) === 0 && !r.error ? "done" : "error",
            id: r.id,
            createdAt: r.createdAt,
            updatedAt: r.progress?.updatedAt || r.createdAt,
            meta: r.meta,
            stopped: r.stopped,
            finished: r.finished,
            exitCode: r.exitCode,
            error: r.error || null,
            linesCount: r.lines.length,
            lastLine: r.lines.length ? r.lines[r.lines.length - 1] : "",
            progress: r.progress || null,
        }));
    return items;
}

export function setRunMetaCmd(id: string, cmd: string) {
    const r = runs.get(id);
    if (!r) return;
    r.meta.cmd = cmd;
    persistRunCmd(id, cmd);
}

export function appendLine(id: string, line: string) {
    const r = runs.get(id);
    if (!r) return;

    const msg = String(line ?? "");

    const parseProgressPayload = (prefix: string) => {
        if (!msg.startsWith(prefix)) return null;
        try {
            return JSON.parse(msg.slice(prefix.length)) as Record<string, unknown>;
        } catch {
            return null;
        }
    };

    const payload =
        parseProgressPayload("__PROGRESS__ ") ||
        parseProgressPayload("__PROGRESS_INIT__ ") ||
        parseProgressPayload("__PROGRESS_END__ ");

    if (payload) {
        const toNum = (v: unknown) => {
            const n = Number(v ?? 0);
            return Number.isFinite(n) ? n : 0;
        };
        const totals =
            payload.totals && typeof payload.totals === "object"
                ? (payload.totals as Record<string, unknown>)
                : {};
        const done =
            payload.done && typeof payload.done === "object"
                ? (payload.done as Record<string, unknown>)
                : {};
        const totalAll = toNum(totals.all);
        const doneAll = toNum(done.all);
        const rawPct = Number(payload.pct);
        const pct =
            Number.isFinite(rawPct) && rawPct >= 0
                ? Math.max(0, Math.min(1, rawPct))
                : totalAll > 0
                  ? Math.max(0, Math.min(1, doneAll / totalAll))
                  : null;
        const updatedAt = Date.now();
        let etaSec: number | null = null;
        if (totalAll > 0 && doneAll > 0) {
            const elapsedSec = Math.max(1, Math.floor((updatedAt - r.createdAt) / 1000));
            const rate = doneAll / elapsedSec;
            const remaining = Math.max(0, totalAll - doneAll);
            etaSec = rate > 0 ? Math.round(remaining / rate) : null;
        }
        const last =
            payload.last && typeof payload.last === "object"
                ? (payload.last as Record<string, unknown>)
                : {};
        const kind = String(last.kind || "");
        const lastMessage =
            kind === "state"
                ? `State ${String(last.state || "")} • ${String(last.action || "")}`
                : kind === "county"
                  ? `County ${String(last.county || "")} • ${String(last.action || "")}`
                  : kind === "city"
                    ? `City ${String(last.city || "")} • ${String(last.action || "")}`
                    : "Running";
        r.progress = {
            pct,
            doneAll,
            doneCounties: toNum(done.counties),
            doneCities: toNum(done.cities),
            totalAll,
            totalCounties: toNum(totals.counties),
            totalCities: toNum(totals.cities),
            lastMessage,
            etaSec,
            updatedAt,
        };
    }

    r.lines.push(msg);

    if (r.lines.length > 5000) r.lines = r.lines.slice(-4000);

    r.emitter.emit("line", msg);
    persistRunEvent(id, msg, {
        eventType: payload ? "progress" : "line",
        payload,
        linesCount: r.lines.length,
        progress: r.progress || null,
    });
}

/**
 * ✅ Optional helper: emit progress in the exact format that stream parser expects.
 * Your scripts can call this by importing from "@/lib/runStore" IF you ever execute scripts in-process.
 * (Not required for your current spawn-based setup.)
 */
export function appendProgressLine(
    id: string,
    payload: unknown,
    kind: "__PROGRESS_INIT__" | "__PROGRESS__" | "__PROGRESS_END__" = "__PROGRESS__"
) {
    appendLine(id, `${kind} ${JSON.stringify(payload)}`);
}

export function attachProcess(id: string, proc: ChildProcess) {
    const r = runs.get(id);
    if (!r) return;
    r.proc = proc;
}

export function endRun(id: string, exitCode: number | null) {
    const r = runs.get(id);
    if (!r) return;

    r.finished = true;
    r.exitCode = exitCode ?? null;

    // ✅ HARDEN: if exitCode != 0 and no error set, mark a generic one
    if ((r.exitCode ?? 0) !== 0 && !r.error) {
        r.error = `Process exited with code ${r.exitCode}`;
        appendLine(id, `❌ ${r.error}`);
    }

    r.emitter.emit("end", r.exitCode ?? 0);
    persistRunFinished(id, {
        finished: true,
        stopped: !!r.stopped,
        exitCode: r.exitCode,
        error: r.error || null,
        linesCount: r.lines.length,
        lastLine: r.lines.length ? r.lines[r.lines.length - 1] : "",
        progress: r.progress || null,
    });
}

export function errorRun(id: string, err: unknown) {
    const r = runs.get(id);
    if (!r) return;

    const msg = err instanceof Error ? err.message : String(err);
    r.error = msg;
    appendLine(id, `❌ ${msg}`);
    persistRunEvent(id, `❌ ${msg}`, { eventType: "error", linesCount: r.lines.length, progress: r.progress || null });

    // ✅ HARDEN: if already finished, don't double-close
    if (r.finished) return;

    // If no attached process, safest is to close the run.
    if (!r.proc) {
        endRun(id, 1);
        return;
    }
}

export function stopRun(id: string) {
    const r = runs.get(id);
    if (!r) return false;

    r.stopped = true;

    try {
        if (r.proc && !r.proc.killed) {
            const pid = Number(r.proc.pid || 0);
            if (pid > 0 && process.platform !== "win32") {
                try {
                    // Try killing the whole process group first (requires detached spawn).
                    process.kill(-pid, "SIGTERM");
                } catch {
                    r.proc.kill("SIGTERM");
                }
            } else {
                r.proc.kill("SIGTERM");
            }
            setTimeout(() => {
                try {
                    if (r.proc && !r.proc.killed) {
                        const pid2 = Number(r.proc.pid || 0);
                        if (pid2 > 0 && process.platform !== "win32") {
                            try {
                                process.kill(-pid2, "SIGKILL");
                            } catch {
                                r.proc.kill("SIGKILL");
                            }
                        } else {
                            r.proc.kill("SIGKILL");
                        }
                    }
                } catch { }
            }, 1200);
        }
    } catch { }

    appendLine(id, "🛑 Stop requested");
    persistRunStopped(id);
    return true;
}

export function removeRun(id: string) {
    const r = runs.get(id);
    if (!r) return false;
    try {
        if (r.proc && !r.proc.killed) {
            stopRun(id);
        }
    } catch {}
    runs.delete(id);
    return true;
}
