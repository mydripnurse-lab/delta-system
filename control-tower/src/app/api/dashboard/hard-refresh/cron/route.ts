import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

function s(v: unknown) {
  return String(v ?? "").trim();
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
  return json || {};
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
    const tenantIds = singleTenantId ? [singleTenantId] : await listActiveTenantIds();
    const origin = new URL(req.url).origin;

    const rows: Array<Record<string, unknown>> = [];
    for (const tenantId of tenantIds) {
      const row: Record<string, unknown> = { tenantId, ok: true };
      try {
        await fetchJson(
          `${origin}/api/dashboard/overview?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&preset=${encodeURIComponent(preset)}&compare=1${force ? "&force=1" : ""}`,
        );
      } catch (e: unknown) {
        row.overviewError = e instanceof Error ? e.message : "overview failed";
        row.ok = false;
      }

      try {
        await fetchJson(
          `${origin}/api/dashboard/conversations?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${force ? "&bust=1" : ""}`,
        );
      } catch (e: unknown) {
        row.conversationsError = e instanceof Error ? e.message : "conversations failed";
        row.ok = false;
      }

      try {
        await fetchJson(
          `${origin}/api/dashboard/appointments?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}${force ? "&bust=1" : ""}`,
        );
      } catch (e: unknown) {
        row.appointmentsError = e instanceof Error ? e.message : "appointments failed";
        row.ok = false;
      }

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
