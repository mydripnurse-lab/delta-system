import { google } from "googleapis";

import { getTenantGoogleAuth } from "@/lib/tenantGoogleAuth";
import { getTenantIntegration } from "@/lib/tenantIntegrations";
import { PARTNER_SITE_ORIGIN } from "@/lib/partnerSeo";

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

function enabled(value: unknown, defaultValue = true) {
  const raw = s(value).toLowerCase();
  if (!raw) return defaultValue;
  return !["false", "0", "no", "off", "disabled"].includes(raw);
}

async function submitGoogleSitemap(organizationId: string, sitemapUrl: string) {
  try {
    const integration = await getTenantIntegration(
      organizationId,
      "google_search_console",
      "default",
    );
    const config = integration?.config && typeof integration.config === "object"
      ? integration.config
      : {};
    if (!enabled(config.indexGoogleEnabled ?? config.indexingEnabled ?? config.enabled)) {
      return { ok: false, skipped: true, reason: "Google indexing is disabled." };
    }

    const siteUrl =
      s(integration?.externalPropertyId) ||
      s(config.siteUrl) ||
      s(config.gscProperty) ||
      "sc-domain:mydripnurse.com";
    const auth = await getTenantGoogleAuth(organizationId, [
      "https://www.googleapis.com/auth/webmasters",
    ]);
    const webmasters = google.webmasters({ version: "v3", auth });
    await webmasters.sitemaps.submit({ siteUrl, feedpath: sitemapUrl });
    return { ok: true, siteUrl, sitemapUrl };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Google sitemap submission failed.",
    };
  }
}

function bingConfig(raw: Record<string, unknown>) {
  const auth = raw.auth && typeof raw.auth === "object"
    ? (raw.auth as Record<string, unknown>)
    : {};
  return {
    apiKey:
      s(raw.webmasterApiKey) ||
      s(raw.webmaster_api_key) ||
      s(raw.apiKey) ||
      s(raw.api_key) ||
      s(auth.webmasterApiKey) ||
      s(auth.webmaster_api_key) ||
      s(auth.apiKey) ||
      s(auth.api_key),
    endpoint: s(raw.webmasterEndpoint) || s(raw.webmaster_endpoint) || s(raw.endpoint),
    siteUrl: s(raw.siteUrl) || s(raw.site_url),
  };
}

async function submitBingSitemap(organizationId: string, sitemapUrl: string) {
  try {
    let integration = await getTenantIntegration(organizationId, "bing_webmaster", "owner");
    if (!integration) {
      integration = await getTenantIntegration(organizationId, "bing_webmaster", "default");
    }
    const config = integration?.config && typeof integration.config === "object"
      ? integration.config
      : {};
    const parsed = bingConfig(config);
    const apiKey = parsed.apiKey || s(process.env.BING_WEBMASTER_API_KEY);
    if (!apiKey) {
      return { ok: false, skipped: true, reason: "Bing Webmaster API key is not configured." };
    }

    const endpoint = (
      parsed.endpoint ||
      s(process.env.BING_WEBMASTER_API_ENDPOINT) ||
      "https://ssl.bing.com/webmaster/api.svc/json"
    ).replace(/\/+$/, "").replace(/\/SubmitFeed$/i, "");
    const siteUrl =
      toOrigin(integration?.externalPropertyId) ||
      toOrigin(parsed.siteUrl) ||
      toOrigin(process.env.BING_WEBMASTER_SITE_URL) ||
      "https://mydripnurse.com/";
    const response = await fetch(`${endpoint}/SubmitFeed?apikey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({ siteUrl, feedUrl: sitemapUrl }),
      cache: "no-store",
    });
    const responseText = await response.text().catch(() => "");
    return {
      ok: response.ok,
      siteUrl,
      sitemapUrl,
      status: response.status,
      error: response.ok
        ? undefined
        : `Bing sitemap submission failed (HTTP ${response.status}). ${responseText.slice(0, 180)}`.trim(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Bing sitemap submission failed.",
    };
  }
}

export async function notifyPartnerSitePublished(organizationId: string) {
  const sitemapUrl = `${PARTNER_SITE_ORIGIN}/sitemap.xml`;
  const [googleResult, bingResult] = await Promise.all([
    submitGoogleSitemap(organizationId, sitemapUrl),
    submitBingSitemap(organizationId, sitemapUrl),
  ]);
  return { sitemapUrl, google: googleResult, bing: bingResult };
}
