import { getDbPool } from "@/lib/db";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toBool(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function resolveAuthCandidates() {
  return [
    s(process.env.PROSPECTING_CRON_SECRET),
    s(process.env.CRON_SECRET),
    s(process.env.DASHBOARD_CRON_SECRET),
  ].filter(Boolean);
}

function resolveForwardSecret() {
  return s(
    process.env.PROSPECTING_CRON_SECRET ||
      process.env.CRON_SECRET ||
      process.env.DASHBOARD_CRON_SECRET,
  );
}

function extractToken(req: Request) {
  const qs = new URL(req.url).searchParams;
  const header = s(req.headers.get("x-dashboard-cron-secret"));
  const auth = s(req.headers.get("authorization"));
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const query = s(qs.get("secret"));
  return header || bearer || query;
}

function isAuthorized(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const expected = resolveAuthCandidates();
  if (!expected.length) return true;
  const token = extractToken(req);
  return expected.includes(token);
}

function toInt(v: unknown, fallback: number, min = 1, max = 500) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const t = Math.trunc(n);
  if (t < min) return min;
  if (t > max) return max;
  return t;
}

async function listActiveTenantIds(maxTenants: number) {
  const pool = getDbPool();
  const q = await pool.query<{ id: string }>(
    `
      select id
      from app.organizations
      where status = 'active'
      order by created_at asc
      limit $1
    `,
    [maxTenants],
  );
  return q.rows.map((r) => s(r.id)).filter(Boolean);
}

async function runPushForTenant(input: {
  origin: string;
  tenantId: string;
  maxLeads: number;
  testOnly: boolean;
  includeAlreadySent: boolean;
  includeUnapproved: boolean;
  statuses: string[];
  secret: string;
}) {
  const payload: Record<string, unknown> = {
    tenantId: input.tenantId,
    maxLeads: input.maxLeads,
    testOnly: input.testOnly,
    includeAlreadySent: input.includeAlreadySent,
    includeUnapproved: input.includeUnapproved,
    statuses: input.statuses.length ? input.statuses : ["validated", "new"],
  };
  if (input.secret) payload.secret = input.secret;

  const endpoint = new URL("/api/dashboard/prospecting/push-ghl", input.origin);
  const res = await fetch(endpoint.toString(), {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(input.secret ? { "x-prospecting-cron-secret": input.secret } : {}),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  return {
    ok: res.ok,
    status: res.status,
    body: json && typeof json === "object" ? json : null,
    detail: json ? "" : await res.text().catch(() => ""),
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const url = new URL(req.url);
  const tenantId = s(url.searchParams.get("tenantId"));
  const statuses = s(url.searchParams.get("statuses"))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const secret = resolveForwardSecret();
  const maxLeads = toInt(url.searchParams.get("maxLeads"), 100, 1, 1000);
  const testOnly = toBool(url.searchParams.get("testOnly"), false);
  const includeAlreadySent = toBool(url.searchParams.get("includeAlreadySent"), false);
  const includeUnapproved = toBool(url.searchParams.get("includeUnapproved"), false);

  // Single-tenant mode when tenantId is provided.
  if (tenantId) {
    const single = await runPushForTenant({
      origin: url.origin,
      tenantId,
      maxLeads,
      testOnly,
      includeAlreadySent,
      includeUnapproved,
      statuses,
      secret,
    });
    if (single.body && typeof single.body === "object") {
      return Response.json(single.body, { status: single.status });
    }
    return Response.json(
      {
        ok: false,
        error: `Upstream non-JSON (${single.status})`,
        detail: s(single.detail).slice(0, 500),
      },
      { status: single.status >= 400 ? single.status : 502 },
    );
  }

  // Multi-tenant mode: resolves active tenants dynamically.
  const maxTenants = toInt(url.searchParams.get("maxTenants"), 100, 1, 1000);
  const tenantIds = await listActiveTenantIds(maxTenants);
  if (!tenantIds.length) {
    return Response.json({ ok: true, mode: "all-tenants", totalTenants: 0, results: [] });
  }

  const results: Array<Record<string, unknown>> = [];
  let success = 0;
  let failed = 0;

  for (const id of tenantIds) {
    try {
      const run = await runPushForTenant({
        origin: url.origin,
        tenantId: id,
        maxLeads,
        testOnly,
        includeAlreadySent,
        includeUnapproved,
        statuses,
        secret,
      });
      const ok = run.ok;
      if (ok) success += 1;
      else failed += 1;
      results.push({
        tenantId: id,
        ok,
        status: run.status,
        response: run.body || { detail: s(run.detail).slice(0, 500) },
      });
    } catch (e: unknown) {
      failed += 1;
      results.push({
        tenantId: id,
        ok: false,
        status: 500,
        error: e instanceof Error ? e.message : "Failed to push leads",
      });
    }
  }

  return Response.json({
    ok: failed === 0,
    mode: "all-tenants",
    totalTenants: tenantIds.length,
    success,
    failed,
    results,
  });
}
