import { getDbPool } from "@/lib/db";
import type { RunMeta } from "@/lib/runStore";

type RunProgress = {
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

type QueuedRunEvent = {
  runId: string;
  eventType: string;
  message: string;
  payloadJson: string | null;
  linesCount: number;
  progressJson: string | null;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function safeStatusFrom(meta: {
  finished?: boolean;
  stopped?: boolean;
  exitCode?: number | null;
  error?: string | null;
}) {
  if (!meta.finished) return "running";
  if (meta.stopped) return "stopped";
  if (meta.error || (meta.exitCode ?? 0) !== 0) return "error";
  return "done";
}

async function writeSafe(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    // Keep runner resilient even if DB is temporarily unavailable.
  }
}

const EVENT_BATCH_SIZE = Math.max(25, Number(process.env.RUN_HISTORY_EVENT_BATCH_SIZE || 250));
const EVENT_FLUSH_MS = Math.max(80, Number(process.env.RUN_HISTORY_EVENT_FLUSH_MS || 250));
const EVENT_QUEUE_MAX = Math.max(1000, Number(process.env.RUN_HISTORY_EVENT_QUEUE_MAX || 20000));

const eventQueue: QueuedRunEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;

function scheduleEventFlush(immediate = false) {
  if (flushTimer) return;
  flushTimer = setTimeout(
    () => {
      flushTimer = null;
      void flushQueuedEvents();
    },
    immediate ? 0 : EVENT_FLUSH_MS,
  );
}

async function flushQueuedEvents() {
  if (flushing) return;
  if (!eventQueue.length) return;
  flushing = true;
  try {
    const pool = getDbPool();
    while (eventQueue.length) {
      const batch = eventQueue.splice(0, EVENT_BATCH_SIZE);
      if (!batch.length) break;

      const placeholders: string[] = [];
      const values: Array<string | null> = [];
      let i = 0;
      for (const ev of batch) {
        const base = i * 4;
        placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::jsonb)`);
        values.push(ev.runId, ev.eventType, ev.message, ev.payloadJson);
        i++;
      }

      await pool.query(
        `
          insert into app.runner_run_events (run_id, event_type, message, payload)
          values ${placeholders.join(", ")}
        `,
        values,
      );

      const lastByRun = new Map<
        string,
        { lastLine: string; linesCount: number; progressJson: string | null }
      >();
      for (const ev of batch) {
        const prev = lastByRun.get(ev.runId);
        lastByRun.set(ev.runId, {
          lastLine: ev.message,
          linesCount: ev.linesCount > 0 ? ev.linesCount : prev?.linesCount || 0,
          progressJson: ev.progressJson ?? prev?.progressJson ?? null,
        });
      }

      for (const [runId, row] of lastByRun.entries()) {
        await pool.query(
          `
            update app.runner_runs
               set updated_at = now(),
                   last_line = $2,
                   lines_count = case when $3 > 0 then $3 else lines_count end,
                   progress = coalesce($4::jsonb, progress)
             where run_id = $1
          `,
          [runId, row.lastLine, row.linesCount, row.progressJson],
        );
      }
    }
  } catch {
    // Keep runner resilient even if DB is temporarily unavailable.
  } finally {
    flushing = false;
    if (eventQueue.length) scheduleEventFlush(true);
  }
}

export function persistRunCreated(runId: string, meta: RunMeta, createdAtMs: number) {
  const createdAt = new Date(createdAtMs);
  void writeSafe(async () => {
    const pool = getDbPool();
    await pool.query(
      `
        insert into app.runner_runs (
          run_id, tenant_id, job, state, mode, debug, loc_id, kind, created_at, updated_at, status
        ) values (
          $1, nullif($2,''), nullif($3,''), nullif($4,''), nullif($5,''), $6, nullif($7,''), nullif($8,''), $9, now(), 'running'
        )
        on conflict (run_id) do update
          set tenant_id = excluded.tenant_id,
              job = excluded.job,
              state = excluded.state,
              mode = excluded.mode,
              debug = excluded.debug,
              loc_id = excluded.loc_id,
              kind = excluded.kind,
              updated_at = now()
      `,
      [
        runId,
        s(meta.tenantId),
        s(meta.job),
        s(meta.state),
        s(meta.mode),
        !!meta.debug,
        s(meta.locId),
        s(meta.kind),
        createdAt,
      ],
    );
  });
}

export function persistRunCmd(runId: string, cmd: string) {
  void writeSafe(async () => {
    const pool = getDbPool();
    await pool.query(
      `
        update app.runner_runs
           set cmd = $2,
               updated_at = now()
         where run_id = $1
      `,
      [runId, s(cmd)],
    );
  });
}

export function persistRunEvent(
  runId: string,
  message: string,
  opts?: { eventType?: string; payload?: unknown; linesCount?: number; progress?: RunProgress | null },
) {
  const eventType = s(opts?.eventType || "line") || "line";
  const msg = String(message ?? "");
  const linesCount = Number(opts?.linesCount ?? 0);
  const progress = opts?.progress ?? null;
  const payloadJson = opts?.payload ? JSON.stringify(opts.payload) : null;
  const progressJson = progress ? JSON.stringify(progress) : null;

  if (eventQueue.length >= EVENT_QUEUE_MAX && eventType === "line") {
    // Prefer dropping plain line noise over pressure-collapsing the runner.
    return;
  }

  eventQueue.push({
    runId,
    eventType,
    message: msg,
    payloadJson,
    linesCount,
    progressJson,
  });
  scheduleEventFlush(false);
}

export function persistRunStopped(runId: string) {
  scheduleEventFlush(true);
  void writeSafe(async () => {
    const pool = getDbPool();
    await pool.query(
      `
        update app.runner_runs
           set stopped = true,
               status = 'stopped',
               updated_at = now()
         where run_id = $1
      `,
      [runId],
    );
  });
}

export function persistRunFinished(runId: string, params: {
  finished: boolean;
  stopped: boolean;
  exitCode: number | null;
  error?: string | null;
  linesCount: number;
  lastLine: string;
  progress?: RunProgress | null;
}) {
  const status = safeStatusFrom(params);
  scheduleEventFlush(true);
  void writeSafe(async () => {
    const pool = getDbPool();
    await pool.query(
      `
        update app.runner_runs
           set finished_at = case when $2 then now() else finished_at end,
               status = $3,
               stopped = $4,
               exit_code = $5,
               error = nullif($6,''),
               lines_count = $7,
               last_line = $8,
               progress = coalesce($9::jsonb, progress),
               updated_at = now()
         where run_id = $1
      `,
      [
        runId,
        params.finished,
        status,
        params.stopped,
        params.exitCode,
        s(params.error),
        params.linesCount,
        s(params.lastLine),
        params.progress ? JSON.stringify(params.progress) : null,
      ],
    );
  });
}

export async function listRunsFromDb(opts?: {
  tenantId?: string;
  activeOnly?: boolean;
  limit?: number;
}) {
  const pool = getDbPool();
  const limit = Math.max(1, Math.min(500, Number(opts?.limit || 100)));
  const activeOnly = !!opts?.activeOnly;
  const tenantId = s(opts?.tenantId);
  const result = await pool.query<{
    run_id: string;
    created_at: string;
    updated_at: string;
    tenant_id: string | null;
    job: string | null;
    state: string | null;
    mode: string | null;
    debug: boolean;
    loc_id: string | null;
    kind: string | null;
    cmd: string | null;
    status: string;
    stopped: boolean;
    exit_code: number | null;
    error: string | null;
    lines_count: number;
    last_line: string | null;
    progress: unknown;
  }>(
    `
      select
        run_id,
        created_at::text,
        updated_at::text,
        tenant_id,
        job,
        state,
        mode,
        debug,
        loc_id,
        kind,
        cmd,
        status,
        stopped,
        exit_code,
        error,
        lines_count,
        last_line,
        progress
      from app.runner_runs
      where ($1 = '' or tenant_id = $1)
        and ($2::boolean = false or status = 'running')
      order by created_at desc
      limit $3
    `,
    [tenantId, activeOnly, limit],
  );

  return result.rows.map((r) => ({
    id: r.run_id,
    createdAt: new Date(r.created_at).getTime(),
    updatedAt: new Date(r.updated_at).getTime(),
    meta: {
      tenantId: s(r.tenant_id),
      job: s(r.job),
      state: s(r.state),
      mode: s(r.mode),
      debug: !!r.debug,
      locId: s(r.loc_id),
      kind: s(r.kind),
      cmd: s(r.cmd),
    },
    stopped: !!r.stopped,
    finished: r.status !== "running",
    status: s(r.status) || "running",
    exitCode: r.exit_code === null ? null : Number(r.exit_code),
    error: r.error ? String(r.error) : null,
    linesCount: Number(r.lines_count || 0),
    lastLine: s(r.last_line),
    progress: (r.progress as Record<string, unknown> | null) || null,
  }));
}
