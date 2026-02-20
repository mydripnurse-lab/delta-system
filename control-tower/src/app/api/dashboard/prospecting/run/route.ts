import { createHash } from "crypto";
import { getDbPool } from "@/lib/db";
import {
  readLeadStore,
  upsertLeadRows,
  writeLeadStore,
  type ProspectLead,
} from "@/lib/prospectingStore";

export const runtime = "nodejs";

type JsonMap = Record<string, unknown>;

type PlaceCandidate = {
  placeId: string;
  businessName: string;
  website: string;
  phone: string;
  address: string;
  sourceUrl: string;
  source: "google_places" | "osm_overpass" | "overture";
};

type SourceFlags = {
  googlePlaces: boolean;
  osmOverpass: boolean;
  overture: boolean;
};

type EnrichmentFlags = {
  crawlWebsite: boolean;
  hunterDomainSearch: boolean;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function norm(v: unknown) {
  return s(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function toList(raw: unknown) {
  if (Array.isArray(raw)) return raw.map((x) => s(x)).filter(Boolean);
  return s(raw)
    .split(/[,\n|;]/g)
    .map((x) => s(x))
    .filter(Boolean);
}

function safeUrl(raw: string) {
  const v = s(raw);
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  return `https://${v}`;
}

function stripMailto(v: string) {
  return s(v).replace(/^mailto:/i, "");
}

function phoneDigits(v: string) {
  return s(v).replace(/[^\d]/g, "");
}

function hostFromUrl(v: string) {
  const u = safeUrl(v);
  if (!u) return "";
  try {
    return s(new URL(u).hostname).replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function uniqueFirst(items: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = norm(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

async function fetchJson(url: string, init?: RequestInit) {
  const res = await fetch(url, { cache: "no-store", ...(init || {}) });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) {
    const err = (json?.error as JsonMap | undefined) || {};
    const msg = s(err.message) || s(json?.error) || `HTTP ${res.status}`;
    const status = s(err.status);
    throw new Error(status ? `${status} - ${msg}` : msg);
  }
  return json || {};
}

async function fetchJsonSafe(url: string, init?: RequestInit) {
  try {
    return await fetchJson(url, init);
  } catch {
    return null;
  }
}

function boolish(v: unknown, fallback = false) {
  const x = s(v).toLowerCase();
  if (!x) return fallback;
  return x === "1" || x === "true" || x === "yes" || x === "on" || x === "active";
}

async function loadTenantPlacesApiKey(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{
    config: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
  }>(
    `
      select config, metadata
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider in ('google_maps', 'google_places', 'google_cloud')
        and integration_key in ('default', 'owner')
      order by case when integration_key = 'default' then 0 else 1 end
      limit 1
    `,
    [tenantId],
  );
  const row = q.rows[0];
  const cfg = row?.config || {};
  const meta = row?.metadata || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v =
        s((cfg as Record<string, unknown>)[k]) ||
        s((meta as Record<string, unknown>)[k]);
      if (v) return v;
    }
    return "";
  };
  return pick("apiKey", "mapsApiKey", "placesApiKey", "key");
}

async function loadTenantHunterApiKey(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{
    config: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
  }>(
    `
      select config, metadata
      from app.organization_integrations
      where organization_id = $1::uuid
        and provider in ('hunter', 'email_enrichment')
        and integration_key in ('default', 'owner')
      order by case when integration_key = 'default' then 0 else 1 end
      limit 1
    `,
    [tenantId],
  );
  const row = q.rows[0];
  const cfg = row?.config || {};
  const meta = row?.metadata || {};
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v =
        s((cfg as Record<string, unknown>)[k]) ||
        s((meta as Record<string, unknown>)[k]);
      if (v) return v;
    }
    return "";
  };
  return pick("apiKey", "hunterApiKey", "key");
}

async function fetchText(url: string, timeoutMs = 7000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; ProspectingBot/1.0)",
      },
    });
    if (!res.ok) return "";
    const ct = s(res.headers.get("content-type"));
    if (ct && !ct.toLowerCase().includes("text/html")) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(to);
  }
}

function extractEmails(html: string) {
  const direct = Array.from(
    new Set((html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map((x) => stripMailto(x))),
  );
  return direct.filter((x) => !norm(x).endsWith(".png") && !norm(x).endsWith(".jpg"));
}

function extractPhones(html: string) {
  const rx = /(?:\+1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/g;
  return Array.from(new Set(html.match(rx) || []));
}

async function enrichFromWebsite(website: string) {
  const home = safeUrl(website);
  if (!home) return { email: "", phone: "" };
  const urls = [
    home,
    `${home.replace(/\/+$/, "")}/contact`,
    `${home.replace(/\/+$/, "")}/contact-us`,
    `${home.replace(/\/+$/, "")}/about`,
  ];
  const htmls = await Promise.all(urls.map((u) => fetchText(u)));
  const emails = uniqueFirst(htmls.flatMap((html) => extractEmails(html || "")));
  const phones = uniqueFirst(htmls.flatMap((html) => extractPhones(html || "")));
  return { email: s(emails[0]), phone: s(phones[0]) };
}

async function googlePlacesSearchLegacy(query: string, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", key);
  const json = (await fetchJson(url.toString())) as JsonMap;
  const status = s(json.status);
  if (status && status !== "OK" && status !== "ZERO_RESULTS") {
    throw new Error(`Google Places search failed: ${status}${s(json.error_message) ? ` - ${s(json.error_message)}` : ""}`);
  }
  const results = Array.isArray(json.results) ? json.results : [];
  return results as JsonMap[];
}

async function googlePlacesDetailsLegacy(placeId: string, key: string) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("fields", "name,website,formatted_phone_number,international_phone_number,formatted_address,url");
  url.searchParams.set("key", key);
  const json = (await fetchJson(url.toString())) as JsonMap;
  const status = s(json.status);
  if (status && status !== "OK" && status !== "ZERO_RESULTS" && status !== "NOT_FOUND") {
    throw new Error(`Google Places details failed: ${status}${s(json.error_message) ? ` - ${s(json.error_message)}` : ""}`);
  }
  return (json.result as JsonMap | undefined) || {};
}

async function googlePlacesSearchNew(query: string, key: string, maxResultCount: number) {
  const json = (await fetchJson("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.internationalPhoneNumber,places.formattedAddress,places.googleMapsUri",
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "en",
      regionCode: "US",
      maxResultCount: Math.max(1, Math.min(20, maxResultCount)),
    }),
  })) as JsonMap;
  const places = Array.isArray(json.places) ? json.places : [];
  return places as JsonMap[];
}

async function googlePlacesDetailsNew(placeId: string, key: string) {
  const resourceId = s(placeId).replace(/^places\//i, "");
  if (!resourceId) return {} as JsonMap;
  const json = (await fetchJson(`https://places.googleapis.com/v1/places/${encodeURIComponent(resourceId)}`, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "id,displayName,websiteUri,nationalPhoneNumber,internationalPhoneNumber,formattedAddress,googleMapsUri",
    },
  })) as JsonMap;
  return json || {};
}

async function discoverByGooglePlaces(opts: {
  services: string[];
  locationText: string;
  apiKey: string;
  maxResults: number;
}) {
  const out: PlaceCandidate[] = [];
  const perService = Math.max(1, Math.ceil(opts.maxResults / Math.max(1, opts.services.length)));
  const useNewFirst = true;
  for (const service of opts.services) {
    if (out.length >= opts.maxResults) break;
    const query = `${service} in ${opts.locationText}`;
    let rows: JsonMap[] = [];
    let usingNew = useNewFirst;
    try {
      rows = await googlePlacesSearchNew(query, opts.apiKey, perService);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "";
      const canFallbackLegacy =
        msg.includes("REQUEST_DENIED") ||
        msg.includes("PERMISSION_DENIED") ||
        msg.includes("API key") ||
        msg.includes("Legacy");
      if (!canFallbackLegacy) throw e;
      usingNew = false;
      rows = await googlePlacesSearchLegacy(query, opts.apiKey);
    }
    for (const row of rows.slice(0, perService)) {
      if (out.length >= opts.maxResults) break;
      const placeId = s(row.id) || s(row.place_id);
      if (!placeId) continue;
      const detail = usingNew
        ? await googlePlacesDetailsNew(placeId, opts.apiKey).catch(() => ({} as JsonMap))
        : await googlePlacesDetailsLegacy(placeId, opts.apiKey).catch(() => ({} as JsonMap));
      const displayName = (detail.displayName as JsonMap | undefined) || (row.displayName as JsonMap | undefined);
      out.push({
        placeId,
        businessName: s(detail.name) || s(displayName?.text) || s(row.name),
        website:
          safeUrl(s(detail.websiteUri)) ||
          safeUrl(s(detail.website)) ||
          safeUrl(s(row.websiteUri)),
        phone:
          s(detail.internationalPhoneNumber) ||
          s(detail.nationalPhoneNumber) ||
          s(detail.international_phone_number) ||
          s(detail.formatted_phone_number) ||
          s(row.internationalPhoneNumber) ||
          s(row.nationalPhoneNumber),
        address: s(detail.formattedAddress) || s(detail.formatted_address) || s(row.formattedAddress) || s(row.formatted_address),
        sourceUrl: s(detail.googleMapsUri) || s(detail.url) || s(row.googleMapsUri),
        source: "google_places",
      });
    }
  }
  const byId = new Map<string, PlaceCandidate>();
  for (const item of out) {
    if (!item.placeId) continue;
    byId.set(item.placeId, item);
  }
  return Array.from(byId.values()).slice(0, opts.maxResults);
}

async function geocodeLocation(locationText: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", locationText);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  const json = (await fetchJsonSafe(url.toString(), {
    headers: { "user-agent": "ProspectingBot/1.0 (control-tower)" },
  })) as unknown[] | null;
  const first = Array.isArray(json) ? (json[0] as JsonMap | undefined) : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

async function discoverByOsmOverpass(opts: {
  services: string[];
  locationText: string;
  maxResults: number;
}) {
  const center = await geocodeLocation(opts.locationText);
  if (!center) return [];
  const out: PlaceCandidate[] = [];
  const perService = Math.max(1, Math.ceil(opts.maxResults / Math.max(1, opts.services.length)));
  for (const service of opts.services) {
    if (out.length >= opts.maxResults) break;
    const safeService = service.replace(/"/g, "");
    const query = `[out:json][timeout:25];
(
  node["name"~"${safeService}",i](around:45000,${center.lat},${center.lon});
  way["name"~"${safeService}",i](around:45000,${center.lat},${center.lon});
  relation["name"~"${safeService}",i](around:45000,${center.lat},${center.lon});
);
out tags center ${Math.max(10, perService * 2)};`;
    const json = (await fetchJsonSafe("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "content-type": "text/plain;charset=UTF-8" },
      body: query,
    })) as JsonMap | null;
    const rows = Array.isArray(json?.elements) ? (json?.elements as JsonMap[]) : [];
    for (const row of rows.slice(0, perService)) {
      if (out.length >= opts.maxResults) break;
      const tags = ((row.tags as JsonMap | undefined) || {}) as JsonMap;
      const website = safeUrl(s(tags.website) || s(tags.contact_website));
      const phone = s(tags.phone) || s(tags.contact_phone);
      if (!website && !phone) continue;
      const lat = s((row as JsonMap).lat || (row.center as JsonMap | undefined)?.lat);
      const lon = s((row as JsonMap).lon || (row.center as JsonMap | undefined)?.lon);
      const osmType = s(row.type) || "node";
      const osmId = s(row.id);
      out.push({
        placeId: `osm:${osmType}:${osmId}`,
        businessName: s(tags.name) || `${service} (${opts.locationText})`,
        website,
        phone,
        address: s(tags["addr:full"]) || [s(tags["addr:street"]), s(tags["addr:city"]), s(tags["addr:state"])].filter(Boolean).join(", "),
        sourceUrl: osmId ? `https://www.openstreetmap.org/${osmType}/${osmId}` : (lat && lon ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}` : ""),
        source: "osm_overpass",
      });
    }
  }
  return out.slice(0, opts.maxResults);
}

async function discoverByOvertureEndpoint(opts: {
  services: string[];
  locationText: string;
  maxResults: number;
}) {
  const endpoint = s(process.env.OVERTURE_PLACE_SEARCH_URL);
  if (!endpoint) return [];
  const out: PlaceCandidate[] = [];
  const perService = Math.max(1, Math.ceil(opts.maxResults / Math.max(1, opts.services.length)));
  for (const service of opts.services) {
    if (out.length >= opts.maxResults) break;
    const url = new URL(endpoint);
    url.searchParams.set("q", service);
    url.searchParams.set("location", opts.locationText);
    url.searchParams.set("limit", String(perService));
    const json = (await fetchJsonSafe(url.toString())) as JsonMap | null;
    const rows = Array.isArray(json?.results) ? (json?.results as JsonMap[]) : [];
    for (const row of rows) {
      if (out.length >= opts.maxResults) break;
      out.push({
        placeId: s(row.id) || `overture:${createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 16)}`,
        businessName: s((row.names as JsonMap | undefined)?.primary) || s(row.name),
        website: safeUrl(s(row.website) || s((row.contacts as JsonMap | undefined)?.website)),
        phone: s(row.phone) || s((row.contacts as JsonMap | undefined)?.phone),
        address: s(row.address) || s((row.addresses as JsonMap | undefined)?.freeform),
        sourceUrl: s(row.sourceUrl) || s(row.url),
        source: "overture",
      });
    }
  }
  return out.slice(0, opts.maxResults);
}

async function enrichWithHunter(domain: string, apiKey: string) {
  const cleanDomain = s(domain).replace(/^www\./i, "");
  if (!cleanDomain || !apiKey) return "";
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", cleanDomain);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "1");
  const json = (await fetchJsonSafe(url.toString())) as JsonMap | null;
  const data = (json?.data as JsonMap | undefined) || {};
  const emails = Array.isArray(data.emails) ? (data.emails as JsonMap[]) : [];
  return s(emails[0]?.value);
}

function dedupeCandidates(candidates: PlaceCandidate[]) {
  const out = new Map<string, PlaceCandidate>();
  for (const row of candidates) {
    const domain = hostFromUrl(row.website);
    const phone = phoneDigits(row.phone);
    const name = norm(row.businessName);
    const idKey = s(row.placeId);
    const key = idKey || (domain ? `d:${domain}` : "") || (phone ? `p:${phone}` : "") || `n:${name}`;
    if (!key) continue;
    const prev = out.get(key);
    if (!prev) {
      out.set(key, row);
      continue;
    }
    const prevScore = (prev.website ? 2 : 0) + (prev.phone ? 2 : 0) + (prev.businessName ? 1 : 0);
    const nextScore = (row.website ? 2 : 0) + (row.phone ? 2 : 0) + (row.businessName ? 1 : 0);
    if (nextScore >= prevScore) out.set(key, row);
  }
  return Array.from(out.values());
}

function leadId(candidate: PlaceCandidate) {
  const stable = [candidate.placeId, hostFromUrl(candidate.website), phoneDigits(candidate.phone), candidate.businessName].join("|");
  return createHash("sha1").update(stable).digest("hex").slice(0, 20);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as JsonMap | null;
    const tenantId = s(body?.tenantId);
    if (!tenantId) {
      return Response.json({ ok: false, error: "Missing tenantId" }, { status: 400 });
    }
    const integrationKey = s(body?.integrationKey) || "owner";
    const geoType = s(body?.geoType) || "city";
    const geoName = s(body?.geoName);
    const state = s(body?.state);
    const county = s(body?.county);
    const city = s(body?.city) || (geoType === "city" ? geoName : "");
    const maxResults = Math.max(1, Math.min(100, Number(body?.maxResults || 25)));
    const serviceOverride = toList(body?.services);

    if (!geoName) {
      return Response.json({ ok: false, error: "Missing geoName" }, { status: 400 });
    }

    const rawSources = ((body?.sources as JsonMap | undefined) || {}) as JsonMap;
    const rawEnrichment = ((body?.enrichment as JsonMap | undefined) || {}) as JsonMap;
    const placesApiKey =
      (await loadTenantPlacesApiKey(tenantId)) ||
      s(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY);
    const hunterApiKey =
      (await loadTenantHunterApiKey(tenantId)) ||
      s(process.env.HUNTER_API_KEY);
    const sources: SourceFlags = {
      googlePlaces: boolish(rawSources.googlePlaces, Boolean(placesApiKey)),
      osmOverpass: boolish(rawSources.osmOverpass, true),
      overture: boolish(rawSources.overture, true),
    };
    const enrichment: EnrichmentFlags = {
      crawlWebsite: boolish(rawEnrichment.crawlWebsite, true),
      hunterDomainSearch: boolish(rawEnrichment.hunterDomainSearch, false),
    };

    const origin = new URL(req.url).origin;
    const prospecting = await fetchJson(
      `${origin}/api/dashboard/prospecting?tenantId=${encodeURIComponent(tenantId)}&integrationKey=${encodeURIComponent(integrationKey)}`,
    );
    const profile = (prospecting.businessProfile as JsonMap | undefined) || {};
    const services =
      serviceOverride.length > 0
        ? serviceOverride
        : toList(profile.servicesList).length > 0
          ? toList(profile.servicesList)
          : toList(profile.servicesOffered);
    const servicesFinal = services.slice(0, 6);
    if (!servicesFinal.length) {
      return Response.json({ ok: false, error: "No services available for discovery query." }, { status: 400 });
    }

    const locationParts = uniqueFirst([city, county, state, geoName, "USA"].filter(Boolean));
    const locationText = locationParts.join(", ");
    const warnings: string[] = [];
    const sourceCounts = {
      google_places: 0,
      osm_overpass: 0,
      overture: 0,
    };

    const discoveredRaw: PlaceCandidate[] = [];
    if (sources.googlePlaces) {
      if (!placesApiKey) {
        warnings.push("Google Places enabled but API key is missing; source skipped.");
      } else {
        const googleRows = await discoverByGooglePlaces({
          services: servicesFinal,
          locationText,
          apiKey: placesApiKey,
          maxResults,
        }).catch((e: unknown) => {
          warnings.push(`Google Places failed: ${e instanceof Error ? e.message : "unknown error"}`);
          return [] as PlaceCandidate[];
        });
        sourceCounts.google_places = googleRows.length;
        discoveredRaw.push(...googleRows);
      }
    }
    if (sources.osmOverpass) {
      const osmRows = await discoverByOsmOverpass({
        services: servicesFinal,
        locationText,
        maxResults,
      }).catch((e: unknown) => {
        warnings.push(`OSM Overpass failed: ${e instanceof Error ? e.message : "unknown error"}`);
        return [] as PlaceCandidate[];
      });
      sourceCounts.osm_overpass = osmRows.length;
      discoveredRaw.push(...osmRows);
    }
    if (sources.overture) {
      const overtureRows = await discoverByOvertureEndpoint({
        services: servicesFinal,
        locationText,
        maxResults,
      }).catch((e: unknown) => {
        warnings.push(`Overture failed: ${e instanceof Error ? e.message : "unknown error"}`);
        return [] as PlaceCandidate[];
      });
      sourceCounts.overture = overtureRows.length;
      if (!overtureRows.length && !process.env.OVERTURE_PLACE_SEARCH_URL) {
        warnings.push("Overture enabled but OVERTURE_PLACE_SEARCH_URL is not configured.");
      }
      discoveredRaw.push(...overtureRows);
    }
    if (!discoveredRaw.length) {
      return Response.json({
        ok: true,
        tenantId,
        run: {
          geoType,
          geoName,
          locationText,
          services: servicesFinal,
          maxResults,
          sources,
          enrichment,
        },
        results: {
          discovered: 0,
          processed: 0,
          created: 0,
          updated: 0,
          withEmail: 0,
          withPhone: 0,
        },
        diagnostics: { sourceCounts, warnings },
      });
    }
    const candidates = dedupeCandidates(discoveredRaw).slice(0, maxResults);

    const enrichedRows = await Promise.all(
      candidates.map(async (row) => {
        const domain = hostFromUrl(row.website);
        const enriched = enrichment.crawlWebsite
          ? await enrichFromWebsite(row.website).catch(() => ({ email: "", phone: "" }))
          : { email: "", phone: "" };
        const hunterEmail =
          enrichment.hunterDomainSearch && domain && hunterApiKey
            ? await enrichWithHunter(domain, hunterApiKey).catch(() => "")
            : "";
        return {
          row,
          email: s(enriched.email) || s(hunterEmail),
          phone: s(row.phone) || s(enriched.phone),
        };
      }),
    );

    const now = new Date().toISOString();
    const builtLeads: ProspectLead[] = enrichedRows.map(({ row, email, phone }) => ({
      id: leadId(row),
      businessName: row.businessName || "Unknown Business",
      website: row.website,
      email,
      phone,
      category: s(profile.businessCategory),
      services: servicesFinal.join(", "),
      state,
      county,
      city,
      source: row.sourceUrl || row.source,
      status: email || phone ? "validated" : "new",
      notes: `Geo run: ${geoType}=${geoName}. Source=${row.source}. Address: ${row.address}`,
      reviewStatus: "pending",
      reviewedAt: "",
      reviewedBy: "",
      notificationCreatedAt: now,
      notificationSeenAt: "",
      createdAt: now,
      updatedAt: now,
    }));

    const store = await readLeadStore(tenantId);
    const beforeById = new Map(store.leads.map((x) => [x.id, x]));
    const merged = upsertLeadRows(store.leads, builtLeads);
    const created = builtLeads.filter((x) => !beforeById.has(x.id)).length;
    const updated = builtLeads.length - created;
    store.leads = merged;
    store.updatedAt = now;
    await writeLeadStore(tenantId, store);

    return Response.json({
      ok: true,
      tenantId,
      run: {
        geoType,
        geoName,
        locationText,
        services: servicesFinal,
        maxResults,
        sources,
        enrichment,
      },
      results: {
        discovered: candidates.length,
        processed: builtLeads.length,
        created,
        updated,
        withEmail: builtLeads.filter((x) => Boolean(s(x.email))).length,
        withPhone: builtLeads.filter((x) => Boolean(s(x.phone))).length,
      },
      diagnostics: {
        sourceCounts,
        warnings,
        enrichment: {
          crawlWebsiteEnabled: enrichment.crawlWebsite,
          hunterDomainSearchEnabled: enrichment.hunterDomainSearch,
          hunterConfigured: Boolean(hunterApiKey),
        },
      },
      sample: builtLeads.slice(0, 10),
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to run prospecting discovery" },
      { status: 500 },
    );
  }
}
