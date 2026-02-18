import { NextResponse } from "next/server";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function decodeStateProvider(rawState: string) {
  const raw = s(rawState);
  if (!raw) return "";
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return s(parsed.provider).toLowerCase();
  } catch {
    return "";
  }
}

function targetCallbackPath(provider: string) {
  if (provider === "google_search_console" || provider === "google_analytics") {
    return "/api/auth/gsc/callback";
  }
  if (provider === "google_ads") {
    return "/api/auth/ads/callback";
  }
  if (provider === "ghl" || provider === "custom") {
    return "/api/auth/ghl/callback";
  }
  return "/api/auth/ghl/callback";
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = decodeStateProvider(s(url.searchParams.get("state")));
  const target = new URL(targetCallbackPath(provider), url.origin);
  for (const [k, v] of url.searchParams.entries()) {
    target.searchParams.set(k, v);
  }
  return NextResponse.redirect(target);
}
