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

function isVercelCronRequest(req: Request) {
  const vercelCron = s(req.headers.get("x-vercel-cron"));
  if (vercelCron === "1") return true;
  const vercelId = s(req.headers.get("x-vercel-id"));
  if (vercelId) return true;
  const ua = s(req.headers.get("user-agent")).toLowerCase();
  return ua.includes("vercel-cron");
}

function isAuthorized(req: Request) {
  if (isVercelCronRequest(req)) return true;
  const expected = resolveAuthCandidates();
  if (!expected.length) return true;
  const token = extractToken(req);
  return expected.includes(token);
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    const ua = s(req.headers.get("user-agent"));
    const xVercelCron = s(req.headers.get("x-vercel-cron"));
    const xVercelId = s(req.headers.get("x-vercel-id"));
    return Response.json(
      {
        ok: false,
        error: "Unauthorized.",
        detail: {
          ua,
          xVercelCron: xVercelCron || null,
          xVercelId: xVercelId ? "present" : null,
          hasConfiguredSecret: resolveAuthCandidates().length > 0,
        },
      },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const tenantId = s(url.searchParams.get("tenantId"));
  const integrationKey = s(url.searchParams.get("integrationKey")) || "owner";
  const batchSize = Number(url.searchParams.get("batchSize") || 6);
  const cooldownMinutes = Number(url.searchParams.get("cooldownMinutes") || 180);
  const maxResultsPerGeo = Number(url.searchParams.get("maxResultsPerGeo") || 20);
  const payload: Record<string, unknown> = {
    integrationKey,
    batchSize,
    cooldownMinutes,
    maxResultsPerGeo,
    sources: {
      googlePlaces: toBool(url.searchParams.get("googlePlaces"), true),
      osmOverpass: toBool(url.searchParams.get("osmOverpass"), true),
      overture: toBool(url.searchParams.get("overture"), true),
    },
    enrichment: {
      crawlWebsite: toBool(url.searchParams.get("crawlWebsite"), true),
      hunterDomainSearch: toBool(url.searchParams.get("hunterDomainSearch"), false),
    },
  };
  if (tenantId) payload.tenantId = tenantId;

  const secret = resolveForwardSecret();
  if (secret) payload.secret = secret;

  const endpoint = new URL("/api/dashboard/prospecting/auto-run", url.origin);
  const fwdXVercelCron = s(req.headers.get("x-vercel-cron"));
  const fwdXVercelId = s(req.headers.get("x-vercel-id"));
  const fwdUa = s(req.headers.get("user-agent"));
  const res = await fetch(endpoint.toString(), {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-prospecting-cron-secret": secret } : {}),
      ...(fwdXVercelCron ? { "x-vercel-cron": fwdXVercelCron } : {}),
      ...(fwdXVercelId ? { "x-vercel-id": fwdXVercelId } : {}),
      ...(fwdUa ? { "user-agent": fwdUa } : {}),
    },
    body: JSON.stringify(payload),
  });

  const json = await res.json().catch(() => null);
  if (json && typeof json === "object") {
    return Response.json(json, { status: res.status });
  }
  const text = await res.text().catch(() => "");
  return Response.json(
    { ok: false, error: `Upstream non-JSON (${res.status})`, detail: text.slice(0, 500) },
    { status: res.status >= 400 ? res.status : 502 },
  );
}
