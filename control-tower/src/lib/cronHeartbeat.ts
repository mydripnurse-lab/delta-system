import { getDbPool } from "@/lib/db";

type HeartbeatStatus = "running" | "ok" | "error" | "unauthorized";

function safeJson(value: unknown) {
  if (value === undefined) return {};
  return value;
}

export async function heartbeatStart(input: {
  jobKey: string;
  endpoint: string;
  context?: unknown;
}) {
  const pool = getDbPool();
  try {
    await pool.query(
      `
        insert into app.cron_heartbeat (
          job_key, endpoint, last_status, last_started_at, last_finished_at, last_duration_ms, last_error, last_result,
          run_count, success_count, error_count, unauthorized_count
        )
        values ($1, $2, 'running', now(), null, null, null, $3::jsonb, 1, 0, 0, 0)
        on conflict (job_key)
        do update set
          endpoint = excluded.endpoint,
          last_status = 'running',
          last_started_at = now(),
          last_finished_at = null,
          last_duration_ms = null,
          last_error = null,
          last_result = excluded.last_result,
          run_count = app.cron_heartbeat.run_count + 1,
          updated_at = now()
      `,
      [input.jobKey, input.endpoint, JSON.stringify(safeJson(input.context))],
    );
  } catch {
    // Heartbeat should never break cron logic.
  }
}

export async function heartbeatFinish(input: {
  jobKey: string;
  status: HeartbeatStatus;
  startedAtMs: number;
  error?: string;
  result?: unknown;
}) {
  const pool = getDbPool();
  const duration = Math.max(0, Date.now() - input.startedAtMs);
  const incSuccess = input.status === "ok" ? 1 : 0;
  const incError = input.status === "error" ? 1 : 0;
  const incUnauthorized = input.status === "unauthorized" ? 1 : 0;
  try {
    await pool.query(
      `
        update app.cron_heartbeat
        set
          last_status = $2,
          last_finished_at = now(),
          last_duration_ms = $3,
          last_error = $4,
          last_result = $5::jsonb,
          success_count = success_count + $6::int,
          error_count = error_count + $7::int,
          unauthorized_count = unauthorized_count + $8::int,
          updated_at = now()
        where job_key = $1
      `,
      [
        input.jobKey,
        input.status,
        duration,
        input.error || null,
        JSON.stringify(safeJson(input.result)),
        incSuccess,
        incError,
        incUnauthorized,
      ],
    );
  } catch {
    // Heartbeat should never break cron logic.
  }
}
