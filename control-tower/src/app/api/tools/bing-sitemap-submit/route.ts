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
      s(raw.endpoint) ||
      "https://ssl.bing.com/webmaster/api.svc/json",
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

    const row = await getTenantIntegration(tenantId, "bing_webmaster", integrationKey);
    const config = row?.config && typeof row.config === "object"
      ? (row.config as Record<string, unknown>)
      : {};
    const { apiKey, endpoint, siteUrl: configuredSiteUrl } = parseConfig(config);
    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing Bing Webmaster API key in tenant integration (bing_webmaster:${integrationKey}).`,
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
