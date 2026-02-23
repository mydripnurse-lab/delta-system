import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function isAuthorized(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const expected = s(
    process.env.CRON_SECRET || process.env.DASHBOARD_CRON_SECRET || process.env.PROSPECTING_CRON_SECRET,
  );
  if (!expected) return true;
  const tokenHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const authHeader = s(req.headers.get("authorization"));
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const qs = new URL(req.url).searchParams;
  const token = tokenHeader || bearer || s(qs.get("secret"));
  return token === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  const pool = getDbPool();
  const q = await pool.query<{
    job_key: string;
    endpoint: string;
    last_status: string;
    last_started_at: string | null;
    last_finished_at: string | null;
    last_duration_ms: number | null;
    last_error: string | null;
    run_count: string;
    success_count: string;
    error_count: string;
    unauthorized_count: string;
    updated_at: string;
  }>(
    `
      select
        job_key,
        endpoint,
        last_status,
        last_started_at::text,
        last_finished_at::text,
        last_duration_ms,
        left(coalesce(last_error, ''), 500) as last_error,
        run_count::text,
        success_count::text,
        error_count::text,
        unauthorized_count::text,
        updated_at::text
      from app.cron_heartbeat
      order by updated_at desc
    `,
  );
  return Response.json({
    ok: true,
    total: q.rowCount || 0,
    rows: q.rows.map((r) => ({
      jobKey: s(r.job_key),
      endpoint: s(r.endpoint),
      status: s(r.last_status),
      lastStartedAt: s(r.last_started_at),
      lastFinishedAt: s(r.last_finished_at),
      lastDurationMs: r.last_duration_ms,
      lastError: s(r.last_error),
      runCount: Number(r.run_count || "0"),
      successCount: Number(r.success_count || "0"),
      errorCount: Number(r.error_count || "0"),
      unauthorizedCount: Number(r.unauthorized_count || "0"),
      updatedAt: s(r.updated_at),
    })),
  });
}
