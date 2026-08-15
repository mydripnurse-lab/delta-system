import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import type { PartnerAdminProspect } from "@/lib/prospectingStore";

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  addressComponents?: GoogleAddressComponent[];
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  googleMapsUri?: string;
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  types?: string[];
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  pureServiceAreaBusiness?: boolean;
};

const QUERY_GROUPS = [
  ["mobile IV therapy", "IV hydration clinic", "IV vitamin therapy", "mobile wellness clinic"],
  ["medical spa IV therapy", "wellness clinic vitamin therapy", "concierge medicine IV therapy", "nurse practitioner wellness clinic"],
  ["infusion clinic", "hydration spa", "mobile nurse service", "home health agency registered nurse"],
];

const STRONG_TYPES = new Set(["medical_clinic", "medical_spa", "wellness_center", "home_health_care_service", "nurse_practitioner"]);
const RELEVANT_WORDS = ["iv", "hydration", "infusion", "wellness", "vitamin", "nurse", "medical spa", "concierge", "mobile"];
const WEAK_WORDS = ["hospital", "urgent care", "emergency", "pharmacy", "chiropractic", "dental"];
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalizedMarket(value: string) {
  return text(value).toLowerCase().replace(/\bcounty\b/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function component(place: GooglePlace, type: string) {
  return text(place.addressComponents?.find((entry) => entry.types?.includes(type))?.longText);
}

function googlePlacesKey() {
  return text(process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY);
}

export function isGooglePartnerProspectingConfigured() {
  return Boolean(googlePlacesKey());
}

export function prospectingQueries(runCount: number) {
  return QUERY_GROUPS[Math.abs(runCount) % QUERY_GROUPS.length];
}

async function searchPlaces(query: string, county: string, state: string) {
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": googlePlacesKey(),
      "x-goog-fieldmask": [
        "places.id", "places.displayName", "places.formattedAddress", "places.addressComponents",
        "places.websiteUri", "places.nationalPhoneNumber", "places.internationalPhoneNumber",
        "places.googleMapsUri", "places.primaryType", "places.primaryTypeDisplayName", "places.types",
        "places.rating", "places.userRatingCount", "places.businessStatus", "places.pureServiceAreaBusiness",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: `${query} in ${county}, ${state}`,
      languageCode: "en",
      regionCode: "US",
      maxResultCount: 10,
      includePureServiceAreaBusinesses: true,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const detail = text(await response.text()).slice(0, 500);
    throw new Error(`Google Places returned ${response.status}${detail ? `: ${detail}` : ""}`);
  }
  const payload = await response.json() as { places?: GooglePlace[] };
  return payload.places || [];
}

function belongsToCounty(place: GooglePlace, county: string) {
  const resultCounty = component(place, "administrative_area_level_2");
  if (resultCounty) return normalizedMarket(resultCounty) === normalizedMarket(county);
  const address = normalizedMarket(text(place.formattedAddress));
  return Boolean(place.pureServiceAreaBusiness || address.includes(normalizedMarket(county)));
}

function scorePlace(place: GooglePlace, email = "") {
  const haystack = [place.displayName?.text, place.primaryTypeDisplayName?.text, ...(place.types || [])].join(" ").toLowerCase().replaceAll("_", " ");
  let score = 24;
  const reasons: string[] = [];
  const matches = RELEVANT_WORDS.filter((word) => haystack.includes(word));
  if (matches.length) {
    score += Math.min(34, 12 + matches.length * 6);
    reasons.push(`Matches ${matches.slice(0, 3).join(", ")}`);
  }
  if ((place.types || []).some((type) => STRONG_TYPES.has(type))) {
    score += 15;
    reasons.push("Relevant wellness or clinical category");
  }
  if (place.websiteUri) {
    score += 8;
    reasons.push("Official website available");
  }
  if (place.nationalPhoneNumber || place.internationalPhoneNumber) score += 4;
  if (email) {
    score += 6;
    reasons.push("Public business email found");
  }
  if ((place.rating || 0) >= 4.3) {
    score += 6;
    reasons.push("Strong Google rating");
  }
  if ((place.userRatingCount || 0) >= 25) score += 4;
  if (place.pureServiceAreaBusiness) {
    score += 6;
    reasons.push("Mobile or service-area business");
  }
  const weakMatches = WEAK_WORDS.filter((word) => haystack.includes(word));
  if (weakMatches.length) score -= Math.min(20, weakMatches.length * 8);
  if (place.businessStatus && place.businessStatus !== "OPERATIONAL") score -= 35;
  score = Math.max(5, Math.min(99, Math.round(score)));
  return {
    score,
    label: score >= 80 ? "Excellent fit" : score >= 65 ? "Strong fit" : score >= 50 ? "Possible fit" : "Lower fit",
    reasons: reasons.slice(0, 4),
  };
}

function toProspect(place: GooglePlace, county: string, state: string, email = ""): PartnerAdminProspect {
  const fit = scorePlace(place, email);
  const now = new Date();
  const expires = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    placeId: text(place.id),
    businessName: text(place.displayName?.text) || "Unnamed business",
    formattedAddress: text(place.formattedAddress),
    city: component(place, "locality") || component(place, "postal_town"),
    county,
    state: component(place, "administrative_area_level_1") || state,
    website: text(place.websiteUri),
    email,
    phone: text(place.nationalPhoneNumber || place.internationalPhoneNumber),
    googleMapsUrl: text(place.googleMapsUri),
    category: text(place.primaryTypeDisplayName?.text) || text(place.primaryType).replaceAll("_", " "),
    types: (place.types || []).map(text).filter(Boolean),
    rating: place.rating == null ? null : Number(place.rating),
    userRatingCount: Number(place.userRatingCount || 0),
    businessStatus: text(place.businessStatus),
    serviceAreaBusiness: Boolean(place.pureServiceAreaBusiness),
    fitScore: fit.score,
    fitLabel: fit.label,
    fitReasons: fit.reasons,
    discoveredAt: now.toISOString(),
    lastRefreshedAt: now.toISOString(),
    googleDetailsExpireAt: expires.toISOString(),
    stale: false,
  };
}

export async function findGooglePartnerProspects(input: { county: string; state: string; runCount: number }) {
  if (!isGooglePartnerProspectingConfigured()) throw new Error("GOOGLE_PLACES_SETUP_REQUIRED");
  const queries = prospectingQueries(input.runCount);
  const settled = await Promise.allSettled(queries.map((query) => searchPlaces(query, input.county, input.state)));
  const places = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!places.length) {
    const failure = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failure?.reason instanceof Error ? failure.reason : new Error("Google Places did not return businesses for this county.");
  }
  const unique = new Map<string, GooglePlace>();
  for (const place of places) {
    const placeId = text(place.id);
    if (!placeId || !belongsToCounty(place, input.county)) continue;
    unique.set(placeId, place);
  }
  const ranked = [...unique.values()].sort((a, b) => scorePlace(b).score - scorePlace(a).score);
  const emailEntries = await mapWithConcurrency(ranked.slice(0, 16), 4, async (place) => [text(place.id), await discoverPublicBusinessEmail(text(place.websiteUri))] as const);
  const emails = new Map(emailEntries);
  const prospects = ranked.map((place) => toProspect(place, input.county, input.state, emails.get(text(place.id)) || ""));
  prospects.sort((a, b) => b.fitScore - a.fitScore || b.userRatingCount - a.userRatingCount);
  return { queries, discovered: unique.size, prospects };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  }));
  return output;
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

async function safePublicUrl(raw: string) {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported website protocol");
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === "localhost" || hostname.endsWith(".local") || isPrivateAddress(hostname)) throw new Error("Private website address");
  const addresses = await lookup(hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("Private website address");
  return url;
}

async function fetchPublicHtml(raw: string, redirects = 0): Promise<{ html: string; url: URL }> {
  const url = await safePublicUrl(raw);
  const response = await fetch(url, {
    headers: { accept: "text/html,application/xhtml+xml", "user-agent": "MyDripNurse-PartnerResearch/1.0" },
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  if ([301, 302, 303, 307, 308].includes(response.status) && redirects < 2) {
    const location = response.headers.get("location");
    if (location) return fetchPublicHtml(new URL(location, url).toString(), redirects + 1);
  }
  if (!response.ok || !text(response.headers.get("content-type")).toLowerCase().includes("text/html")) throw new Error("Website did not return HTML");
  const html = (await response.text()).slice(0, 650_000);
  return { html, url };
}

function extractEmails(html: string) {
  const values = html.match(EMAIL_PATTERN) || [];
  return [...new Set(values.map((value) => value.toLowerCase().replace(/^mailto:/, "")).filter((value) => !/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(value) && !value.includes("example.com")))];
}

function contactPage(html: string, base: URL) {
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((match) => match[1]);
  for (const href of links) {
    try {
      const candidate = new URL(href, base);
      if (candidate.hostname === base.hostname && /\b(contact|about|team)\b/i.test(candidate.pathname)) return candidate.toString();
    } catch { /* Ignore malformed public links. */ }
  }
  return "";
}

async function discoverPublicBusinessEmail(website: string) {
  if (!website) return "";
  try {
    const home = await fetchPublicHtml(website);
    const direct = extractEmails(home.html)[0];
    if (direct) return direct;
    const contact = contactPage(home.html, home.url);
    if (!contact) return "";
    return extractEmails((await fetchPublicHtml(contact)).html)[0] || "";
  } catch {
    return "";
  }
}
