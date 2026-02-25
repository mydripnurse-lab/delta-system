// src/app/api/stream/[runId]/route.ts
import { getRun } from "@/lib/runStore";
import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;
const STREAM_DB_ONLY = String(process.env.RUN_STREAM_DB_ONLY || "1") === "1";
const STREAM_HEARTBEAT_IDLE_MS = Math.max(15_000, Number(process.env.RUN_STREAM_HEARTBEAT_IDLE_MS || 60_000));

function sseLine(str: string) {
    return `${str}\n`;
}

function sseEvent(event: string, data: unknown) {
    return (
        sseLine(`event: ${event}`) +
        sseLine(`data: ${typeof data === "string" ? data : JSON.stringify(data)}`) +
        sseLine("")
    );
}

function sseEventWithId(eventId: number, event: string, data: unknown) {
    return (
        sseLine(`id: ${eventId}`) +
        sseLine(`event: ${event}`) +
        sseLine(`data: ${typeof data === "string" ? data : JSON.stringify(data)}`) +
        sseLine("")
    );
}

function parseProgressLine(line: string): { kind: "progress"; json: string } | null {
    const s = String(line ?? "");

    const prefixes = ["__PROGRESS_INIT__ ", "__PROGRESS__ ", "__PROGRESS_END__ "];
    for (const p of prefixes) {
        if (s.startsWith(p)) {
            const json = s.slice(p.length);
            try {
                JSON.parse(json);
                return { kind: "progress", json };
            } catch {
                return null;
            }
        }
    }
    return null;
}

export async function GET(req: Request, ctx: { params: Promise<{ runId: string }> }) {
    const { runId } = await ctx.params;

    if (!runId) return new Response("Missing runId", { status: 400 });

    const stream = new ReadableStream({
        start(controller) {
            const enc = new TextEncoder();
            const write = (chunk: string) => controller.enqueue(enc.encode(chunk));

            // ✅ SSE reconnect suggestion
            write(sseLine("retry: 1500"));
            write(sseLine(""));

            // hello
            write(sseEvent("hello", { runId }));

            const lastEventIdRaw = String(req.headers.get("last-event-id") || "").trim();
            const lastEventId = Number(lastEventIdRaw);
            let lastSentLineCount = Number.isFinite(lastEventId) && lastEventId > 0 ? Math.floor(lastEventId) : 0;

            let lastDbEventId =
                Number.isFinite(lastEventId) && lastEventId > 0 ? Math.floor(lastEventId) : 0;
            let lastVisibleLineAt = Date.now();

            const tick = async () => {
                const run = STREAM_DB_ONLY ? null : getRun(runId);

                if (!run) {
                    try {
                        const pool = getDbPool();
                        const [runQ, evQ] = await Promise.all([
                            pool.query<{
                                status: string;
                                exit_code: number | null;
                                error: string | null;
                                stopped: boolean;
                            }>(
                                `
                                  select status, exit_code, error, stopped
                                  from app.runner_runs
                                  where run_id = $1
                                  limit 1
                                `,
                                [runId],
                            ),
                            pool.query<{
                                id: number;
                                event_type: string;
                                message: string;
                                payload: unknown;
                            }>(
                                `
                                  select id, event_type, message, payload
                                  from app.runner_run_events
                                  where run_id = $1
                                    and id > $2
                                  order by id asc
                                  limit 800
                                `,
                                [runId, Math.max(0, lastDbEventId)],
                            ),
                        ]);

                        const row = runQ.rows[0];
                        if (!row) {
                            write(sseEvent("end", { runId, ok: false, reason: "not_found" }));
                            controller.close();
                            return;
                        }

                        for (const ev of evQ.rows || []) {
                            const evId = Number(ev.id || 0);
                            if (!Number.isFinite(evId) || evId <= 0) continue;
                            const eventType = String(ev.event_type || "line");
                            if (eventType === "progress") {
                                const payload =
                                    ev.payload && typeof ev.payload === "object"
                                        ? JSON.stringify(ev.payload)
                                        : String(ev.message || "{}");
                                write(sseEventWithId(evId, "progress", payload));
                            } else {
                                write(sseEventWithId(evId, "line", String(ev.message || "")));
                                lastVisibleLineAt = Date.now();
                            }
                            lastDbEventId = Math.max(lastDbEventId, evId);
                        }

                        if ((evQ.rows || []).length === 0) {
                            const idleMs = Date.now() - lastVisibleLineAt;
                            if (idleMs >= STREAM_HEARTBEAT_IDLE_MS) {
                                write(sseEvent("line", `runner-heartbeat: waiting for next log (${Math.round(idleMs / 1000)}s idle)`));
                                lastVisibleLineAt = Date.now();
                            }
                        }

                        write(sseEvent("ping", { t: Date.now(), source: "db" }));

                        if (String(row.status || "").toLowerCase() !== "running") {
                            const status = String(row.status || "").toLowerCase();
                            const ok = status === "done" || status === "stopped";
                            write(
                                sseEvent("end", {
                                    runId,
                                    ok,
                                    status,
                                    exitCode: row.exit_code ?? null,
                                    error: row.error ?? null,
                                    source: "db",
                                }),
                            );
                            controller.close();
                            return;
                        }

                        setTimeout(() => {
                            void tick();
                        }, 1200);
                        return;
                    } catch {
                        write(sseEvent("ping", { t: Date.now(), source: "db_error" }));
                        setTimeout(() => {
                            void tick();
                        }, 1800);
                        return;
                    }
                }

                // send new lines
                const lines = run.lines || [];
                if (lastSentLineCount > lines.length) {
                    // If server rotated old in-memory lines, resume from available tail.
                    lastSentLineCount = Math.max(0, lines.length - 1);
                }
                for (let i = lastSentLineCount; i < lines.length; i++) {
                    const line = String(lines[i] ?? "");
                    const eventId = i + 1;

                    const p = parseProgressLine(line);
                    if (p) {
                        write(sseEventWithId(eventId, "progress", p.json));
                    } else {
                        write(sseEventWithId(eventId, "line", line));
                        lastVisibleLineAt = Date.now();
                    }
                }
                lastSentLineCount = lines.length;

                if (lines.length === 0) {
                    const idleMs = Date.now() - lastVisibleLineAt;
                    if (idleMs >= STREAM_HEARTBEAT_IDLE_MS) {
                        write(sseEvent("line", `runner-heartbeat: waiting for next log (${Math.round(idleMs / 1000)}s idle)`));
                        lastVisibleLineAt = Date.now();
                    }
                }

                // heartbeat
                write(sseEvent("ping", { t: Date.now() }));

                // finished
                if (run.finished) {
                    write(
                        sseEvent("end", {
                            runId,
                            ok: !run.error,
                            exitCode: run.exitCode ?? null,
                            error: run.error ?? null,
                        })
                    );
                    controller.close();
                    return;
                }

                setTimeout(() => {
                    void tick();
                }, 800);
            };

            void tick();
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
        },
    });
}
