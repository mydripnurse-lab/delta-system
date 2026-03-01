import { NextResponse } from "next/server";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";
const INDEXNOW_CANONICAL_HOST = "www.mydripnurse.com";
const INDEXNOW_CANONICAL_ORIGIN = `https://${INDEXNOW_CANONICAL_HOST}/`;

function s(v: unknown) {
  return String(v ?? "").trim();
}

function toUrlMaybe(v: string) {
  const d = s(v);
  if (!d) return "";
  if (d.startsWith("http://") || d.startsWith("https://")) return d;
  return `https://${d}`;
}

function toOriginUrlMaybe(v: string) {
  const full = toUrlMaybe(v);
  if (!full) return "";
  try {
    const u = new URL(full);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

function resolveKeyLocation(origin: string, host: string, key: string, rawOverride = "") {
  const raw = s(rawOverride);
  if (!raw) return `${origin}${key}.txt`;
  if (raw.includes("{host}")) return raw.replaceAll("{host}", host);
  return raw;
}

function parseTenantBingConfig(raw: Record<string, unknown>) {
  const auth = raw.auth && typeof raw.auth === "object" ? (raw.auth as Record<string, unknown>) : {};
  return {
    apiKey:
      s(raw.indexNowKey) ||
      s(raw.index_now_key) ||
      s(raw.apiKey) ||
      s(raw.api_key) ||
      s(auth.indexNowKey) ||
      s(auth.index_now_key) ||
      s(auth.apiKey) ||
      s(auth.api_key),
    endpoint:
      s(raw.indexNowEndpoint) ||
      s(raw.index_now_endpoint) ||
      s(raw.endpoint) ||
      "https://api.indexnow.org/indexnow",
    keyLocation:
      s(raw.indexNowKeyLocation) ||
      s(raw.index_now_key_location) ||
      s(raw.keyLocation) ||
      s(raw.key_location),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body?.tenantId);
    const integrationKey = s(body?.integrationKey) || "default";
    const domainUrl = toOriginUrlMaybe(s(body?.domainUrl));
    if (!domainUrl) {
      return NextResponse.json({ ok: false, error: "Missing domainUrl" }, { status: 400 });
    }
    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }

    let key = "";
    let endpoint = "";
    let keyLocationOverride = "";

    const row = await getTenantIntegration(tenantId, "bing_webmaster", integrationKey);
    const cfg = row?.config && typeof row.config === "object" ? (row.config as Record<string, unknown>) : {};
    const parsed = parseTenantBingConfig(cfg);
    key = parsed.apiKey;
    endpoint = parsed.endpoint;
    keyLocationOverride = parsed.keyLocation;

    if (!key) {
      return NextResponse.json(
        {
          ok: false,
          error: `Missing Bing IndexNow key in tenant integration (bing_webmaster:${integrationKey}).`,
        },
        { status: 400 },
      );
    }

    const host = INDEXNOW_CANONICAL_HOST;
    const keyLocation = resolveKeyLocation(
      INDEXNOW_CANONICAL_ORIGIN,
      INDEXNOW_CANONICAL_HOST,
      key,
      keyLocationOverride,
    );

    const bodyUrlList = Array.isArray(body?.urlList)
      ? body.urlList.map((u: unknown) => s(u)).filter(Boolean)
      : [];
    const urlList = bodyUrlList.length ? bodyUrlList : [domainUrl];

    const payload = {
      host,
      key,
      keyLocation,
      urlList,
    };

    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    const ok = res.ok;
    return NextResponse.json(
      {
        ok,
        target: "bing",
        mode: "indexnow",
        status: res.status,
        endpoint,
        host,
        domainUrl,
        tenantId: tenantId || undefined,
        integrationKey: integrationKey || undefined,
        keyLocation,
        submittedUrls: urlList.length,
        responsePreview: text.slice(0, 500) || undefined,
        error: ok ? undefined : `IndexNow submit failed (HTTP ${res.status})`,
      },
      { status: 200 },
    );
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e ?? "");
    return NextResponse.json(
      {
        ok: false,
        target: "bing",
        error: s(message) || "IndexNow request failed.",
      },
      { status: 500 },
    );
  }
}
