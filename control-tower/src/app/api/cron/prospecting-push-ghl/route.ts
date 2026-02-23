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

function enforceCronAuth() {
  const v = s(process.env.ENFORCE_PROSPECTING_CRON_AUTH).toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
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

function isVercelCronRequest(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const vercelId = s(req.headers.get("x-vercel-id"));
  if (vercelId) return true;
  const ua = s(req.headers.get("user-agent")).toLowerCase();
  return ua.includes("vercel-cron");
}

function authPath(req: Request) {
  if (isVercelCronRequest(req)) return "vercel-cron";
  const expected = resolveAuthCandidates();
  if (!expected.length) return "no-secret-configured";
  const token = extractToken(req);
  if (token && expected.includes(token)) return "secret-match";
  return "";
}

function isAuthorized(req: Request) {
  if (!enforceCronAuth()) return true;
  return !!authPath(req);
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
  xVercelCron?: string;
  xVercelId?: string;
  userAgent?: string;
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
      "x-internal-cron-call": "1",
      ...(input.secret ? { "x-prospecting-cron-secret": input.secret } : {}),
      ...(input.xVercelCron ? { "x-vercel-cron": input.xVercelCron } : {}),
      ...(input.xVercelId ? { "x-vercel-id": input.xVercelId } : {}),
      ...(input.userAgent ? { "user-agent": input.userAgent } : {}),
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
  const url = new URL(req.url);
  if (url.searchParams.get("diag") === "1") {
    return Response.json({
      ok: true,
      route: "prospecting-push-ghl",
      diag: true,
      version: "cron-wrapper-open-2026-02-23-1",
      ua: s(req.headers.get("user-agent")) || null,
      xVercelCron: s(req.headers.get("x-vercel-cron")) || null,
      xVercelId: s(req.headers.get("x-vercel-id")) ? "present" : null,
    });
  }

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
  const incomingIsVercelCron = isVercelCronRequest(req);
  const fwdXVercelCron = s(req.headers.get("x-vercel-cron"));
  const fwdXVercelId = s(req.headers.get("x-vercel-id"));
  const fwdUa = s(req.headers.get("user-agent"));

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
      xVercelCron: fwdXVercelCron || (incomingIsVercelCron ? "1" : ""),
      xVercelId: fwdXVercelId,
      userAgent: fwdUa,
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
        xVercelCron: fwdXVercelCron || (incomingIsVercelCron ? "1" : ""),
        xVercelId: fwdXVercelId,
        userAgent: fwdUa,
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
