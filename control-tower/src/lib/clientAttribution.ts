"use client";

import type { AttributionEventType } from "@/lib/bookingAttribution";

const VISITOR_COOKIE = "mdn_vid";
const SESSION_COOKIE = "mdn_sid";
const SESSION_ACTIVITY = "mdn_attribution_session_activity";
const SESSION_WINDOW_MS = 30 * 60 * 1000;
const ATTRIBUTION_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "gclid", "fbclid", "ref", "source"];

function randomId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function cookieValue(name: string) {
  const prefix = `${name}=`;
  return document.cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length) || "";
}

function writeCookie(name: string, value: string, maxAge: number) {
  const sharedDomain = location.hostname === "mydripnurse.com" || location.hostname.endsWith(".mydripnurse.com") ? "; Domain=.mydripnurse.com" : "";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}${sharedDomain}`;
}

function safeStoredValue(key: string) {
  try { return localStorage.getItem(key) || ""; } catch { return ""; }
}

function storeValue(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage is optional */ }
}

function identifier(name: string, persistent: boolean) {
  const queryName = name === VISITOR_COOKIE ? "mdn_vid" : "mdn_sid";
  const fromQuery = new URLSearchParams(location.search).get(queryName) || "";
  const current = fromQuery || decodeURIComponent(cookieValue(name) || "") || safeStoredValue(name);
  const value = current || randomId();
  writeCookie(name, value, persistent ? 60 * 60 * 24 * 365 : 60 * 30);
  storeValue(name, value);
  return value;
}

export type ClientAttributionContext = {
  visitorId: string;
  sessionId: string;
  pageUrl: string;
  referrer: string;
  attribution: Record<string, string>;
};

export function currentAttributionContext(): ClientAttributionContext {
  const params = new URLSearchParams(location.search);
  const activity = Number(safeStoredValue(SESSION_ACTIVITY) || 0);
  if (activity && Date.now() - activity > SESSION_WINDOW_MS) {
    storeValue(SESSION_COOKIE, "");
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
    if (location.hostname === "mydripnurse.com" || location.hostname.endsWith(".mydripnurse.com")) {
      document.cookie = `${SESSION_COOKIE}=; Path=/; Domain=.mydripnurse.com; Max-Age=0; SameSite=Lax${secure}`;
    }
  }
  const visitorId = identifier(VISITOR_COOKIE, true);
  const sessionId = identifier(SESSION_COOKIE, false);
  storeValue(SESSION_ACTIVITY, String(Date.now()));
  const parentUrl = params.get("mdn_parent_url") || "";
  const parentReferrer = params.get("mdn_parent_referrer") || "";
  const attribution = Object.fromEntries(ATTRIBUTION_KEYS.flatMap((key) => {
    const value = params.get(key) || "";
    return value ? [[key, value]] : [];
  }));
  return {
    visitorId,
    sessionId,
    pageUrl: /^https?:\/\//i.test(parentUrl) ? parentUrl : location.href,
    referrer: /^https?:\/\//i.test(parentReferrer) ? parentReferrer : document.referrer,
    attribution,
  };
}

export function trackBookingAttribution(
  eventType: AttributionEventType,
  overrides: Partial<ClientAttributionContext> & { serviceSlug?: string; partnerProfileId?: string; source?: string; channel?: string; campaign?: string } = {},
) {
  const base = currentAttributionContext();
  const payload = {
    eventId: randomId(),
    eventType,
    visitorId: overrides.visitorId || base.visitorId,
    sessionId: overrides.sessionId || base.sessionId,
    pageUrl: overrides.pageUrl || base.pageUrl,
    referrer: overrides.referrer || base.referrer || undefined,
    attribution: { ...base.attribution, ...(overrides.attribution || {}) },
    serviceSlug: overrides.serviceSlug || undefined,
    partnerProfileId: overrides.partnerProfileId || undefined,
    source: overrides.source || undefined,
    channel: overrides.channel || undefined,
    campaign: overrides.campaign || undefined,
    occurredAt: new Date().toISOString(),
  };
  const endpoint = ["localhost", "127.0.0.1", "care.mydripnurse.com"].includes(location.hostname)
    ? "/api/public/attribution/events"
    : "https://care.mydripnurse.com/api/public/attribution/events";
  void fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
  return { ...base, ...overrides, visitorId: payload.visitorId, sessionId: payload.sessionId, pageUrl: payload.pageUrl, referrer: payload.referrer || "", attribution: payload.attribution };
}
