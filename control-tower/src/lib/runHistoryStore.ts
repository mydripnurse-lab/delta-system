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
  const payload = opts?.payload ?? null;
  const linesCount = Number(opts?.linesCount ?? 0);
  const progress = opts?.progress ?? null;
  void writeSafe(async () => {
    const pool = getDbPool();
    await pool.query(
      `
        insert into app.runner_run_events (run_id, event_type, message, payload)
        values ($1, $2, $3, $4::jsonb)
      `,
      [runId, eventType, msg, payload ? JSON.stringify(payload) : null],
    );
    await pool.query(
      `
        update app.runner_runs
           set updated_at = now(),
               last_line = $2,
               lines_count = case when $3 > 0 then $3 else lines_count end,
               progress = coalesce($4::jsonb, progress)
         where run_id = $1
      `,
      [runId, msg, linesCount, progress ? JSON.stringify(progress) : null],
    );
  });
}

export function persistRunStopped(runId: string) {
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

