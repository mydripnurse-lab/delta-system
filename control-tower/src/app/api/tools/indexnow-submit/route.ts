import { NextResponse } from "next/server";
import { requireAgencyPermission } from "@/lib/authz";

export const runtime = "nodejs";

const DEFAULT_INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const MAX_URLS_PER_REQUEST = 10_000;
const MAX_SITEMAP_DOCUMENTS = 40;
const FETCH_TIMEOUT_MS = 20_000;

function s(value: unknown) {
  return String(value ?? "").trim();
}

function decodeXml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function parseLocations(xml: string) {
  return Array.from(xml.matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc>/gi))
    .map((match) => decodeXml(s(match[1])))
    .filter(Boolean);
}

function normalizePartnerOrigin(value: unknown) {
  const raw = s(value);
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (
      url.protocol !== "https:" ||
      hostname === "mydripnurse.com" ||
      !hostname.endsWith(".mydripnurse.com")
    ) {
      return null;
    }
    return new URL(`https://${hostname}/`);
  } catch {
    return null;
  }
}

function normalizeSameHostUrl(value: unknown, hostname: string) {
  try {
    const url = new URL(s(value));
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== hostname) {
      return "";
    }
    url.hash = "";
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: { accept: "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.5" },
    });
    const text = await response.text().catch(() => "");
    if (!response.ok) {
      throw new Error(`Unable to read sitemap (HTTP ${response.status}).`);
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function collectSitemapUrls(sitemapUrl: string, hostname: string) {
  const queue = [sitemapUrl];
  const visited = new Set<string>();
  const pageUrls = new Set<string>();

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    if (visited.size >= MAX_SITEMAP_DOCUMENTS) {
      throw new Error(
        `Sitemap index exceeds the safe limit of ${MAX_SITEMAP_DOCUMENTS} documents.`,
      );
    }
    visited.add(next);

    const xml = await fetchText(next);
    const locations = parseLocations(xml);
    const isSitemapIndex = /<sitemapindex\b/i.test(xml);

    if (isSitemapIndex) {
      for (const location of locations) {
        const nested = normalizeSameHostUrl(location, hostname);
        if (nested && !visited.has(nested)) queue.push(nested);
      }
      continue;
    }

    for (const location of locations) {
      const pageUrl = normalizeSameHostUrl(location, hostname);
      if (pageUrl) pageUrls.add(pageUrl);
    }
  }

  return {
    urls: Array.from(pageUrls),
    sitemapDocuments: visited.size,
  };
}

function chunk<T>(items: T[], size: number) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAgencyPermission(request, "agency.manage");
    if ("response" in auth) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const origin = normalizePartnerOrigin(body.domainUrl);
    if (!origin) {
      return NextResponse.json(
        {
          ok: false,
          error: "IndexNow only accepts HTTPS subdomains of mydripnurse.com.",
        },
        { status: 400 },
      );
    }

    const hostname = origin.hostname.toLowerCase();
    const providedUrls = Array.isArray(body.urlList)
      ? Array.from(
          new Set(
            body.urlList
              .map((value) => normalizeSameHostUrl(value, hostname))
              .filter(Boolean),
          ),
        )
      : [];
    const sitemapUrl = normalizeSameHostUrl(
      s(body.sitemapUrl) || new URL("sitemap.xml", origin).toString(),
      hostname,
    );

    let urlList = providedUrls;
    let sitemapDocuments = 0;
    if (urlList.length === 0) {
      if (!sitemapUrl) {
        return NextResponse.json(
          { ok: false, error: "Missing or invalid sitemap URL." },
          { status: 400 },
        );
      }
      const collected = await collectSitemapUrls(sitemapUrl, hostname);
      urlList = collected.urls;
      sitemapDocuments = collected.sitemapDocuments;
    }

    if (urlList.length === 0) {
      return NextResponse.json(
        { ok: false, error: "The sitemap did not contain any valid URLs for this host." },
        { status: 422 },
      );
    }

    const keyLocation = `https://${hostname}/indexnow-key.txt`;
    const indexNowKey = s(await fetchText(keyLocation));
    if (!/^[A-Za-z0-9-]{8,128}$/.test(indexNowKey)) {
      return NextResponse.json(
        {
          ok: false,
          target: "indexnow",
          host: hostname,
          keyLocation,
          error: "The public IndexNow verification key is missing or invalid.",
        },
        { status: 422 },
      );
    }

    const endpoint =
      s(process.env.INDEXNOW_ENDPOINT) || DEFAULT_INDEXNOW_ENDPOINT;

    const batches = chunk(urlList, MAX_URLS_PER_REQUEST);
    const responses: Array<{
      batch: number;
      status: number;
      ok: boolean;
      responsePreview?: string;
    }> = [];

    for (let index = 0; index < batches.length; index += 1) {
      const indexNowResponse = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          host: hostname,
          key: indexNowKey,
          keyLocation,
          urlList: batches[index],
        }),
      });
      const responseText = await indexNowResponse.text().catch(() => "");
      responses.push({
        batch: index + 1,
        status: indexNowResponse.status,
        ok: indexNowResponse.ok,
        responsePreview: responseText.slice(0, 300) || undefined,
      });

      console.info("[indexnow-submit] batch", {
        host: hostname,
        batch: index + 1,
        batches: batches.length,
        urls: batches[index].length,
        status: indexNowResponse.status,
        ok: indexNowResponse.ok,
      });

      if (!indexNowResponse.ok) {
        return NextResponse.json(
          {
            ok: false,
            target: "indexnow",
            mode: "direct",
            host: hostname,
            sitemapUrl: sitemapUrl || undefined,
            keyLocation,
            sitemapDocuments,
            submittedUrls: index * MAX_URLS_PER_REQUEST,
            totalUrls: urlList.length,
            batches: batches.length,
            responses,
            responsePreview: responseText.slice(0, 300) || undefined,
            error: `IndexNow rejected batch ${index + 1} (HTTP ${indexNowResponse.status}).`,
          },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      ok: true,
      target: "indexnow",
      mode: "direct",
      host: hostname,
      sitemapUrl: sitemapUrl || undefined,
      keyLocation,
      sitemapDocuments,
      submittedUrls: urlList.length,
      totalUrls: urlList.length,
      batches: batches.length,
      responsePreview: responses.at(-1)?.responsePreview,
      responses,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "IndexNow submission failed.";
    return NextResponse.json(
      { ok: false, target: "indexnow", error: message },
      { status: 500 },
    );
  }
}
