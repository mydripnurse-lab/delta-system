import { getDbPool } from "@/lib/db";
import { heartbeatFinish, heartbeatStart } from "@/lib/cronHeartbeat";

export const runtime = "nodejs";
export const maxDuration = 300;

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function prevPeriodRange(startIso: string, endIso: string) {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { prevStart: "", prevEnd: "" };
  }
  const len = end - start;
  const prevEnd = new Date(start - 1);
  const prevStart = new Date(start - 1 - len);
  return { prevStart: prevStart.toISOString(), prevEnd: prevEnd.toISOString() };
}

async function fetchJson(url: string, timeoutMs = 25000, init?: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs));
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctrl.signal, ...(init || {}) });
    const json = (await res.json().catch(() => null)) as JsonMap | null;
    if (!res.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
    return json || {};
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function runTasksWithConcurrency(
  tasks: Array<{ key: string; url: string; timeoutMs?: number }>,
  limit = 3,
) {
  const classifySkippedError = (message: string) => {
    const m = s(message).toLowerCase();
    if (!m) return "";
    if (m.includes("missing oauth client config")) return "missing_oauth_config";
    if (m.includes("missing integration")) return "missing_integration";
    if (m.includes("run /api/dashboard/ads/sync first")) return "missing_ads_cache";
    return "";
  };
  const out: Record<string, unknown> = {};
  const queue = [...tasks];
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    while (queue.length) {
      const task = queue.shift();
      if (!task) continue;
      const t0 = Date.now();
      try {
        await fetchJson(task.url, task.timeoutMs || 25000);
        out[task.key] = {
          ok: true,
          ms: Date.now() - t0,
        };
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "request failed";
        const skipReason = classifySkippedError(message);
        if (skipReason) {
          out[task.key] = {
            ok: true,
            skipped: true,
            reason: skipReason,
            ms: Date.now() - t0,
            error: message,
          };
          continue;
        }
        out[task.key] = {
          ok: false,
          ms: Date.now() - t0,
          error: message,
        };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

function isAuthorized(req: Request, body?: JsonMap | null) {
  const tokenHeader = s(req.headers.get("x-dashboard-cron-secret"));
  const authHeader = s(req.headers.get("authorization"));
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  const tokenBody = s(body?.secret);
  const expected = s(
    process.env.CRON_SECRET ||
      process.env.DASHBOARD_CRON_SECRET ||
      process.env.PROSPECTING_CRON_SECRET,
  );
  if (!expected) return true;
  return tokenHeader === expected || bearer === expected || tokenBody === expected;
}

function computeRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 28);
  return { start: start.toISOString(), end: end.toISOString(), preset: "28d" };
}

async function listActiveTenantIds() {
  const pool = getDbPool();
  const q = await pool.query<{ id: string }>(
    `
      select id
      from app.organizations
      where status = 'active'
      order by created_at asc
    `,
  );
  return q.rows.map((r) => s(r.id)).filter(Boolean);
}

async function runHardRefresh(req: Request, body?: JsonMap | null) {
  const startedAtMs = Date.now();
  const jobKey = "dashboard_hard_refresh_cron";
  const endpoint = new URL(req.url).pathname;
  try {
    const singleTenantId = s(body?.tenantId);
    const integrationKey = s(body?.integrationKey) || "owner";
    const force = body?.force !== false;
    await heartbeatStart({
      jobKey,
      endpoint,
      context: {
        tenantId: singleTenantId || null,
        integrationKey,
        force,
        method: req.method,
      },
    });
    if (!isAuthorized(req, body)) {
      const unauthorized = { ok: false, error: "Unauthorized cron secret." };
      await heartbeatFinish({
        jobKey,
        status: "unauthorized",
        startedAtMs,
        error: unauthorized.error,
        result: unauthorized,
      });
      return Response.json(unauthorized, { status: 401 });
    }

    const appointmentsForceFull = body?.appointmentsForceFull === true;
    const appointmentsPreferFresh = body?.appointmentsPreferFresh === true;
    const { start, end, preset } = computeRange();
    const { prevStart, prevEnd } = prevPeriodRange(start, end);
    const tenantIds = singleTenantId ? [singleTenantId] : await listActiveTenantIds();
    const origin = new URL(req.url).origin;
    const searchRange = "last_28_days";
    const runPrevious = body?.includePrevious !== false;

    const rows: Array<Record<string, unknown>> = [];
    for (const tenantId of tenantIds) {
      const row: Record<string, unknown> = { tenantId, ok: true };
      const tq = `tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`;
      const appointmentsBustQ = appointmentsForceFull && force ? "&bust=1" : "";
      const appointmentsPreferSnapshotQ = appointmentsPreferFresh ? "" : "&preferSnapshot=1";
      const tasks: Array<{ key: string; url: string; timeoutMs?: number }> = [
        {
          key: "overview_current",
          url: `${origin}/api/dashboard/overview?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}&compare=1${force ? "&force=1" : ""}`,
          timeoutMs: 30000,
        },
        {
          key: "calls_current",
          url: `${origin}/api/dashboard/calls?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
          timeoutMs: 12000,
        },
        {
          key: "contacts_current",
          url: `${origin}/api/dashboard/contacts?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
          timeoutMs: 20000,
        },
        {
          key: "conversations_current",
          url: `${origin}/api/dashboard/conversations?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
          timeoutMs: 20000,
        },
        {
          key: "appointments_current",
          url: `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}${appointmentsBustQ}${appointmentsPreferSnapshotQ}`,
          timeoutMs: 65000,
        },
        {
          key: "transactions_current",
          url: `${origin}/api/dashboard/transactions?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1&hard=1" : ""}`,
          timeoutMs: 25000,
        },
        {
          key: "search_performance_join",
          url: `${origin}/api/dashboard/search-performance/join?${tq}&range=${encodeURIComponent(searchRange)}&compare=1${force ? "&force=1" : ""}`,
          timeoutMs: 25000,
        },
        {
          key: "ga_join",
          url: `${origin}/api/dashboard/ga/join?${tq}&compare=1${force ? "&force=1" : ""}`,
          timeoutMs: 25000,
        },
        {
          key: "ads_sync",
          url: `${origin}/api/dashboard/ads/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
          timeoutMs: 30000,
        },
        {
          key: "gsc_sync",
          url: `${origin}/api/dashboard/gsc/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
          timeoutMs: 30000,
        },
        {
          key: "bing_sync",
          url: `${origin}/api/dashboard/bing/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
          timeoutMs: 30000,
        },
      ];
      if (runPrevious && prevStart && prevEnd) {
        tasks.push(
          {
            key: "calls_previous",
            url: `${origin}/api/dashboard/calls?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}`,
            timeoutMs: 12000,
          },
          {
            key: "contacts_previous",
            url: `${origin}/api/dashboard/contacts?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
            timeoutMs: 20000,
          },
          {
            key: "conversations_previous",
            url: `${origin}/api/dashboard/conversations?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
            timeoutMs: 20000,
          },
          {
            key: "appointments_previous",
            url: `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${appointmentsBustQ}${appointmentsPreferSnapshotQ}`,
            timeoutMs: 65000,
          },
          {
            key: "transactions_previous",
            url: `${origin}/api/dashboard/transactions?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1&hard=1" : ""}`,
            timeoutMs: 25000,
          },
        );
      }

      const modules = await runTasksWithConcurrency(tasks, 3);
      const shouldRetryWithDefaultKey = integrationKey === "owner";
      const maybeRetryWithDefaultKey = async (
        moduleKey: string,
        urlWithOwnerKey: string,
        timeoutMs: number,
      ) => {
        if (!shouldRetryWithDefaultKey) return;
        const current = (modules[moduleKey] || {}) as Record<string, unknown>;
        if (current.ok === true && current.skipped !== true) return;
        const msg = s(current.error).toLowerCase();
        if (!msg.includes("missing")) return;
        const fallbackUrl = urlWithOwnerKey.replace("integrationKey=owner", "integrationKey=default");
        const t0 = Date.now();
        try {
          await fetchJson(fallbackUrl, timeoutMs);
          modules[`${moduleKey}_retry_default`] = { ok: true, ms: Date.now() - t0 };
          modules[moduleKey] = {
            ok: true,
            recovered: true,
            strategy: "integrationKey_default_fallback",
            ms: Date.now() - t0,
          };
        } catch (e: unknown) {
          modules[`${moduleKey}_retry_default`] = {
            ok: false,
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : "request failed",
          };
        }
      };
      await maybeRetryWithDefaultKey(
        "gsc_sync",
        `${origin}/api/dashboard/gsc/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
        30000,
      );
      await maybeRetryWithDefaultKey(
        "bing_sync",
        `${origin}/api/dashboard/bing/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
        30000,
      );
      await maybeRetryWithDefaultKey(
        "ads_sync",
        `${origin}/api/dashboard/ads/sync?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
        30000,
      );
      const isTimeoutFailure = (x: unknown) => {
        const rec = (x || {}) as Record<string, unknown>;
        const ok = rec.ok === true;
        const err = s(rec.error);
        return !ok && err.toLowerCase().includes("timeout");
      };
      if (isTimeoutFailure(modules.appointments_current)) {
        const t0 = Date.now();
        try {
          await fetchJson(
            `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}&preferSnapshot=1`,
            30000,
          );
          modules.appointments_current_retry = { ok: true, strategy: "preferSnapshot", ms: Date.now() - t0 };
          modules.appointments_current = {
            ok: true,
            recovered: true,
            strategy: "preferSnapshot_after_timeout",
            ms: Date.now() - t0,
          };
        } catch (e: unknown) {
          modules.appointments_current_retry = {
            ok: false,
            strategy: "preferSnapshot",
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : "request failed",
          };
        }
      }
      if (isTimeoutFailure(modules.appointments_previous) && runPrevious && prevStart && prevEnd) {
        const t0 = Date.now();
        try {
          await fetchJson(
            `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}&preferSnapshot=1`,
            30000,
          );
          modules.appointments_previous_retry = { ok: true, strategy: "preferSnapshot", ms: Date.now() - t0 };
          modules.appointments_previous = {
            ok: true,
            recovered: true,
            strategy: "preferSnapshot_after_timeout",
            ms: Date.now() - t0,
          };
        } catch (e: unknown) {
          modules.appointments_previous_retry = {
            ok: false,
            strategy: "preferSnapshot",
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : "request failed",
          };
        }
      }
      const adsSync = (modules.ads_sync || {}) as Record<string, unknown>;
      if (adsSync.ok === true && adsSync.skipped !== true) {
        const t0 = Date.now();
        try {
          await fetchJson(
            `${origin}/api/dashboard/ads/join?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
            25000,
          );
          modules.ads_join = { ok: true, ms: Date.now() - t0 };
        } catch (e: unknown) {
          modules.ads_join = {
            ok: false,
            ms: Date.now() - t0,
            error: e instanceof Error ? e.message : "request failed",
          };
        }
      } else {
        modules.ads_join = {
          ok: true,
          skipped: true,
          reason: "blocked_by_ads_sync",
          ms: 0,
        };
      }
      row.modules = modules;
      row.ok = Object.values(modules).every((m) => (m as Record<string, unknown>)?.ok === true);

      rows.push(row);
    }

    const result = {
      ok: true,
      force,
      preset,
      start,
      end,
      total: rows.length,
      errors: rows.filter((r) => r.ok !== true).length,
      rows,
    };
    await heartbeatFinish({
      jobKey,
      status: "ok",
      startedAtMs,
      result: {
        total: result.total,
        errors: result.errors,
      },
    });
    return Response.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to run dashboard hard refresh cron";
    await heartbeatFinish({
      jobKey,
      status: "error",
      startedAtMs,
      error: message,
      result: { ok: false },
    });
    return Response.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const body = {
    tenantId: s(url.searchParams.get("tenantId")),
    integrationKey: s(url.searchParams.get("integrationKey")),
    force: s(url.searchParams.get("force")) !== "0",
    appointmentsForceFull: s(url.searchParams.get("appointmentsForceFull")) === "1",
    appointmentsPreferFresh: s(url.searchParams.get("appointmentsPreferFresh")) === "1",
    secret: s(url.searchParams.get("secret")),
  } as JsonMap;
  return runHardRefresh(req, body);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as JsonMap | null;
  return runHardRefresh(req, body);
}
