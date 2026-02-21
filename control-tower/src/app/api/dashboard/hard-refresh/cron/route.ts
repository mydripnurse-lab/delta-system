import { getDbPool } from "@/lib/db";

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
        out[task.key] = {
          ok: false,
          ms: Date.now() - t0,
          error: e instanceof Error ? e.message : "request failed",
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
  try {
    if (!isAuthorized(req, body)) {
      return Response.json({ ok: false, error: "Unauthorized cron secret." }, { status: 401 });
    }

    const singleTenantId = s(body?.tenantId);
    const integrationKey = s(body?.integrationKey) || "owner";
    const force = body?.force !== false;
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
          url: `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
          timeoutMs: 20000,
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
          key: "ads_join",
          url: `${origin}/api/dashboard/ads/join?${tq}&range=${encodeURIComponent(searchRange)}${force ? "&force=1" : ""}`,
          timeoutMs: 25000,
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
            url: `${origin}/api/dashboard/appointments?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1" : ""}`,
            timeoutMs: 20000,
          },
          {
            key: "transactions_previous",
            url: `${origin}/api/dashboard/transactions?${tq}&start=${encodeURIComponent(prevStart)}&end=${encodeURIComponent(prevEnd)}&preset=${encodeURIComponent(preset)}${force ? "&bust=1&hard=1" : ""}`,
            timeoutMs: 25000,
          },
        );
      }

      const modules = await runTasksWithConcurrency(tasks, 3);
      row.modules = modules;
      row.ok = Object.values(modules).every((m) => (m as Record<string, unknown>)?.ok === true);

      rows.push(row);
    }

    return Response.json({
      ok: true,
      force,
      preset,
      start,
      end,
      total: rows.length,
      errors: rows.filter((r) => r.ok !== true).length,
      rows,
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to run dashboard hard refresh cron" },
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
    secret: s(url.searchParams.get("secret")),
  } as JsonMap;
  return runHardRefresh(req, body);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as JsonMap | null;
  return runHardRefresh(req, body);
}
