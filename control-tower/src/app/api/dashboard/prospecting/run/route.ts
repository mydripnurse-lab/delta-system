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

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as JsonMap | null;
  if (!res.ok) throw new Error(s(json?.error) || `HTTP ${res.status}`);
  return json || {};
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

async function googlePlacesSearch(query: string, key: string) {
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

async function googlePlacesDetails(placeId: string, key: string) {
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

async function discoverByGooglePlaces(opts: {
  services: string[];
  locationText: string;
  apiKey: string;
  maxResults: number;
}) {
  const out: PlaceCandidate[] = [];
  const perService = Math.max(1, Math.ceil(opts.maxResults / Math.max(1, opts.services.length)));
  for (const service of opts.services) {
    if (out.length >= opts.maxResults) break;
    const query = `${service} in ${opts.locationText}`;
    const rows = await googlePlacesSearch(query, opts.apiKey);
    for (const row of rows.slice(0, perService)) {
      if (out.length >= opts.maxResults) break;
      const placeId = s(row.place_id);
      if (!placeId) continue;
      const detail = await googlePlacesDetails(placeId, opts.apiKey).catch(() => ({} as JsonMap));
      out.push({
        placeId,
        businessName: s(detail.name) || s(row.name),
        website: safeUrl(s(detail.website)),
        phone: s(detail.international_phone_number) || s(detail.formatted_phone_number),
        address: s(detail.formatted_address) || s(row.formatted_address),
        sourceUrl: s(detail.url),
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

function leadId(candidate: PlaceCandidate, geoType: string, geoName: string) {
  const stable = [candidate.placeId, candidate.businessName, candidate.website, geoType, geoName].join("|");
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

    const placesApiKey =
      (await loadTenantPlacesApiKey(tenantId)) ||
      s(process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY);
    if (!placesApiKey) {
      return Response.json(
          {
            ok: false,
            error:
              "Missing Places API key. Configure tenant integration provider=google_cloud (or google_maps/google_places) with integrationKey=default and config.apiKey, or set GOOGLE_MAPS_API_KEY.",
          },
          { status: 400 },
        );
    }

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
    const candidates = await discoverByGooglePlaces({
      services: servicesFinal,
      locationText,
      apiKey: placesApiKey,
      maxResults,
    });

    const enrichedRows = await Promise.all(
      candidates.map(async (row) => {
        const enriched = await enrichFromWebsite(row.website).catch(() => ({ email: "", phone: "" }));
        return {
          row,
          email: s(enriched.email),
          phone: s(row.phone) || s(enriched.phone),
        };
      }),
    );

    const now = new Date().toISOString();
    const builtLeads: ProspectLead[] = enrichedRows.map(({ row, email, phone }) => ({
      id: leadId(row, geoType, geoName),
      businessName: row.businessName || "Unknown Business",
      website: row.website,
      email,
      phone,
      category: s(profile.businessCategory),
      services: servicesFinal.join(", "),
      state,
      county,
      city,
      source: row.sourceUrl || "google_places",
      status: email || phone ? "validated" : "new",
      notes: `Geo run: ${geoType}=${geoName}. Address: ${row.address}`,
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
      },
      results: {
        discovered: candidates.length,
        processed: builtLeads.length,
        created,
        updated,
        withEmail: builtLeads.filter((x) => Boolean(s(x.email))).length,
        withPhone: builtLeads.filter((x) => Boolean(s(x.phone))).length,
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
