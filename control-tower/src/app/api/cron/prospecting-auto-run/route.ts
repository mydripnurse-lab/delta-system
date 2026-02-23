export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toBool(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

function resolveExpectedSecret() {
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
  const expected = resolveExpectedSecret();
  if (!expected) return true;
  return extractToken(req) === expected;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
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

  const secret = resolveExpectedSecret();
  if (secret) payload.secret = secret;

  const endpoint = new URL("/api/dashboard/prospecting/auto-run", url.origin);
  const res = await fetch(endpoint.toString(), {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-prospecting-cron-secret": secret } : {}),
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
