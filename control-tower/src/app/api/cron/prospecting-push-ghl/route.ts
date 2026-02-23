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
  if (!tenantId) {
    return Response.json(
      { ok: false, error: "Missing tenantId query param." },
      { status: 400 },
    );
  }

  const statuses = s(url.searchParams.get("statuses"))
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const payload: Record<string, unknown> = {
    tenantId,
    maxLeads: Number(url.searchParams.get("maxLeads") || 100),
    testOnly: toBool(url.searchParams.get("testOnly"), false),
    includeAlreadySent: toBool(url.searchParams.get("includeAlreadySent"), false),
    includeUnapproved: toBool(url.searchParams.get("includeUnapproved"), false),
    statuses: statuses.length ? statuses : ["validated", "new"],
  };

  const secret = resolveExpectedSecret();
  if (secret) payload.secret = secret;

  const endpoint = new URL("/api/dashboard/prospecting/push-ghl", url.origin);
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
