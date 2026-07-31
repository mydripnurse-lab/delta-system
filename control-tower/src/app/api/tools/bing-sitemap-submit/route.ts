import { NextResponse } from "next/server";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

function s(value: unknown) {
  return String(value ?? "").trim();
}

function toOrigin(value: unknown) {
  const raw = s(value);
  if (!raw) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return `${url.protocol}//${url.host}/`;
  } catch {
    return "";
  }
}

function parseConfig(raw: Record<string, unknown>) {
  const auth = raw.auth && typeof raw.auth === "object"
    ? (raw.auth as Record<string, unknown>)
    : {};
  return {
    apiKey:
      s(raw.apiKey) ||
      s(raw.api_key) ||
      s(auth.apiKey) ||
      s(auth.api_key),
    endpoint:
      s(raw.webmasterEndpoint) ||
      s(raw.webmaster_endpoint) ||
      s(raw.endpoint),
    siteUrl: s(raw.siteUrl) || s(raw.site_url),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body.tenantId);
    const integrationKey = s(body.integrationKey) || "default";
    const domainOrigin = toOrigin(body.domainUrl);
    const sitemapUrl =
      s(body.sitemapUrl) || (domainOrigin ? `${domainOrigin}sitemap.xml` : "");

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    if (!domainOrigin || !sitemapUrl) {
      return NextResponse.json(
        { ok: false, error: "Missing or invalid domainUrl/sitemapUrl" },
        { status: 400 },
      );
    }

    const candidateKeys = Array.from(
      new Set(
        integrationKey === "owner"
          ? ["owner", "default"]
          : integrationKey === "default"
            ? ["default", "owner"]
            : [integrationKey, "default", "owner"],
      ),
    );
    let row = null as Awaited<ReturnType<typeof getTenantIntegration>>;
    let matchedIntegrationKey = "";
    for (const key of candidateKeys) {
      const candidate = await getTenantIntegration(tenantId, "bing_webmaster", key);
      if (candidate) {
        row = candidate;
        matchedIntegrationKey = key;
        break;
      }
    }
    const config = row?.config && typeof row.config === "object"
      ? (row.config as Record<string, unknown>)
      : {};
    const parsed = parseConfig(config);
    const apiKey = parsed.apiKey || s(process.env.BING_WEBMASTER_API_KEY);
    const endpoint =
      parsed.endpoint ||
      s(process.env.BING_WEBMASTER_API_ENDPOINT) ||
      "https://ssl.bing.com/webmaster/api.svc/json";
    const configuredSiteUrl =
      parsed.siteUrl || s(process.env.BING_WEBMASTER_SITE_URL);
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            `Missing Bing Webmaster API key. Checked tenant integrations ` +
            `${candidateKeys.map((key) => `bing_webmaster:${key}`).join(", ")} ` +
            "and BING_WEBMASTER_API_KEY.",
        },
        { status: 400 },
      );
    }

    // Bing Webmaster accepts the county/city sitemap as a feed belonging to the
    // registered root property. This mirrors the existing manual workflow in
    // which all subdomain sitemaps live under mydripnurse.com in one property.
    const siteUrl =
      toOrigin(row?.externalPropertyId) ||
      toOrigin(configuredSiteUrl) ||
      domainOrigin;

    const base = endpoint.replace(/\/+$/, "").replace(/\/SubmitFeed$/i, "");
    const submitEndpoint = `${base}/SubmitFeed?apikey=${encodeURIComponent(apiKey)}`;
    const bingRes = await fetch(submitEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ siteUrl, feedUrl: sitemapUrl }),
      cache: "no-store",
    });
    const responseText = await bingRes.text().catch(() => "");

    return NextResponse.json({
      ok: bingRes.ok,
      target: "bing",
      mode: "sitemap",
      status: bingRes.status,
      credentialSource: parsed.apiKey
        ? `tenant:bing_webmaster:${matchedIntegrationKey || integrationKey}`
        : "environment",
      siteUrl,
      sitemapUrl,
      responsePreview: responseText.slice(0, 500) || undefined,
      error: bingRes.ok
        ? undefined
        : `Bing Webmaster sitemap submission failed (HTTP ${bingRes.status}). ${responseText.slice(0, 240)}`.trim(),
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        target: "bing",
        mode: "sitemap",
        error: error instanceof Error ? error.message : "Bing sitemap submission failed.",
      },
      { status: 500 },
    );
  }
}
