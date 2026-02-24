import fs from "fs/promises";
import path from "path";
import { getTenantSheetConfig, loadTenantSheetTabIndex } from "@/lib/tenantSheets";
import { getDbPool } from "@/lib/db";
import { loadTenantProductsServices } from "@/lib/tenantProductsServices";

export const runtime = "nodejs";

type SheetTabIndex = {
  headers: string[];
  rows: unknown[][];
  headerMap: Map<string, number>;
};

type GscCacheRow = {
  query?: unknown;
  keys?: unknown[];
  clicks?: unknown;
  impressions?: unknown;
};

type GscCacheFile = {
  rows?: GscCacheRow[];
};

type BusinessProfile = {
  businessName: string;
  brandVoice: string;
  industry: string;
  primaryOffer: string;
  targetAudience: string;
  serviceArea: string;
  primaryGoal: string;
  complianceNotes: string;
  internalProjectName?: string;
  excludeInternalProjectNameFromAds?: boolean;
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

function isTrue(v: unknown) {
  const x = norm(v);
  return x === "true" || x === "1" || x === "yes" || x === "y" || x === "active";
}

function pickHeaderIndex(tab: SheetTabIndex, candidates: string[]) {
  const lookup = new Map<string, number>();
  for (const [k, i] of tab.headerMap.entries()) lookup.set(norm(k), i);
  for (const c of candidates) {
    const idx = lookup.get(norm(c));
    if (idx !== undefined) return idx;
  }
  return -1;
}

function safeUrl(raw: string) {
  const x = s(raw);
  if (!x) return "";
  if (/^https?:\/\//i.test(x)) return x;
  return `https://${x}`;
}

async function readJsonIfExists<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

function pickFirstExisting(paths: string[]) {
  for (const p of paths) {
    if (p) return p;
  }
  return "";
}

async function loadBusinessProfile() {
  const profileFile = pickFirstExisting([
    process.env.BUSINESS_PROFILE_FILE || "",
    path.resolve(process.cwd(), "../resources/config/business-profile.json"),
    path.resolve(process.cwd(), "resources/config/business-profile.json"),
  ]);

  const base =
    (await readJsonIfExists<BusinessProfile>(profileFile)) ||
    ({
      businessName: "My Drip Nurse",
      brandVoice: "professional, friendly, trustworthy",
      industry: "Mobile IV Therapy",
      primaryOffer: "At-home mobile IV therapy",
      targetAudience: "Adults looking for hydration, recovery, immunity support, and wellness IV services",
      serviceArea: "United States and Puerto Rico",
      primaryGoal: "Increase qualified leads, booked appointments, and profitable revenue growth",
      complianceNotes: "Avoid medical claims or guaranteed outcomes.",
      internalProjectName: "Delta System",
      excludeInternalProjectNameFromAds: true,
    } as BusinessProfile);

  return {
    ...base,
    businessName: s(process.env.BUSINESS_NAME) || base.businessName,
    brandVoice: s(process.env.BUSINESS_BRAND_VOICE) || base.brandVoice,
    industry: s(process.env.BUSINESS_INDUSTRY) || base.industry,
    primaryOffer: s(process.env.BUSINESS_PRIMARY_OFFER) || base.primaryOffer,
    targetAudience: s(process.env.BUSINESS_TARGET_AUDIENCE) || base.targetAudience,
    serviceArea: s(process.env.BUSINESS_SERVICE_AREA) || base.serviceArea,
    primaryGoal: s(process.env.BUSINESS_PRIMARY_GOAL) || base.primaryGoal,
    complianceNotes: s(process.env.BUSINESS_COMPLIANCE_NOTES) || base.complianceNotes,
    internalProjectName: s(process.env.BUSINESS_INTERNAL_PROJECT_NAME) || base.internalProjectName || "",
    excludeInternalProjectNameFromAds:
      s(process.env.BUSINESS_EXCLUDE_INTERNAL_PROJECT_NAME_FROM_ADS)
        ? isTrue(process.env.BUSINESS_EXCLUDE_INTERNAL_PROJECT_NAME_FROM_ADS)
        : Boolean(base.excludeInternalProjectNameFromAds),
  };
}

async function loadLandingMap(tenantId?: string) {
  const loaded = await loadTenantProductsServices(tenantId);
  return {
    file: loaded.source === "file" ? s((loaded as { file?: string }).file) : "",
    source: loaded.source,
    services: loaded.services.map((x) => ({
      id: s(x.id),
      name: s(x.name),
      description: s(x.description),
      landingPath: s(x.landingPath),
      formPath: s(x.formPath),
      bookingPath: s(x.bookingPath),
      cta: s(x.cta),
      ctaSecondary: s(x.ctaSecondary),
    })),
  };
}

async function loadSheetDomains(tenantId?: string) {
  const id = s(tenantId);
  const cfg = id ? await getTenantSheetConfig(id).catch(() => null) : null;
  const spreadsheetId = s(cfg?.spreadsheetId);

  const out = {
    spreadsheetEnabled: Boolean(spreadsheetId),
    states: {} as Record<string, { state: string; domain: string }>,
    counties: {} as Record<string, { state: string; county: string; accountName: string; domain: string; locationId: string }>,
    cities: {} as Record<string, { state: string; county: string; city: string; domain: string; locationId: string }>,
    stats: {
      activeStates: 0,
      activeCounties: 0,
      activeCities: 0,
    },
  };

  if (!spreadsheetId) return out;

  if (!id) return out;

  const stateTab = "States";
  const countyTab = s(cfg?.countyTab) || "Counties";
  const cityTab = s(cfg?.cityTab) || "Cities";

  const [statesIdx, countiesIdx, citiesIdx] = await Promise.all([
    loadTenantSheetTabIndex({ tenantId: id, spreadsheetId, sheetName: stateTab, range: "A:AZ" }).catch(() => null),
    loadTenantSheetTabIndex({ tenantId: id, spreadsheetId, sheetName: countyTab, range: "A:AZ" }).catch(() => null),
    loadTenantSheetTabIndex({ tenantId: id, spreadsheetId, sheetName: cityTab, range: "A:AZ" }).catch(() => null),
  ]);

  if (statesIdx) {
    const iStatus = pickHeaderIndex(statesIdx as SheetTabIndex, ["Status"]);
    const iState = pickHeaderIndex(statesIdx as SheetTabIndex, ["State"]);
    const iDomain = pickHeaderIndex(statesIdx as SheetTabIndex, ["Domain", "domain"]);

    for (const row of (statesIdx as SheetTabIndex).rows || []) {
      if (iStatus >= 0 && !isTrue(row?.[iStatus])) continue;
      const state = s(row?.[iState]);
      const domain = s(row?.[iDomain]);
      if (!state || !domain) continue;
      out.states[norm(state)] = { state, domain: safeUrl(domain) };
    }
  }

  if (countiesIdx) {
    const iStatus = pickHeaderIndex(countiesIdx as SheetTabIndex, ["Status"]);
    const iState = pickHeaderIndex(countiesIdx as SheetTabIndex, ["State"]);
    const iCounty = pickHeaderIndex(countiesIdx as SheetTabIndex, ["County"]);
    const iDomain = pickHeaderIndex(countiesIdx as SheetTabIndex, ["domain", "Domain"]);
    const iLocationId = pickHeaderIndex(countiesIdx as SheetTabIndex, ["Location Id", "LocationID"]);
    const iAccountName = pickHeaderIndex(countiesIdx as SheetTabIndex, ["Account Name"]);

    for (const row of (countiesIdx as SheetTabIndex).rows || []) {
      if (iStatus >= 0 && !isTrue(row?.[iStatus])) continue;
      const state = s(row?.[iState]);
      const county = s(row?.[iCounty]);
      const domain = s(row?.[iDomain]);
      const locationId = s(row?.[iLocationId]);
      const accountName = s(row?.[iAccountName]);
      if (!state || !county || !domain) continue;
      out.counties[`${norm(state)}|${norm(county)}`] = {
        state,
        county,
        domain: safeUrl(domain),
        locationId,
        accountName,
      };
    }
  }

  if (citiesIdx) {
    const iStatus = pickHeaderIndex(citiesIdx as SheetTabIndex, ["Status"]);
    const iState = pickHeaderIndex(citiesIdx as SheetTabIndex, ["State"]);
    const iCounty = pickHeaderIndex(citiesIdx as SheetTabIndex, ["County"]);
    const iCity = pickHeaderIndex(citiesIdx as SheetTabIndex, ["City"]);
    const iDomain = pickHeaderIndex(citiesIdx as SheetTabIndex, ["City Domain", "Domain", "domain"]);
    const iLocationId = pickHeaderIndex(citiesIdx as SheetTabIndex, ["Location Id", "LocationID"]);

    for (const row of (citiesIdx as SheetTabIndex).rows || []) {
      if (iStatus >= 0 && !isTrue(row?.[iStatus])) continue;
      const state = s(row?.[iState]);
      const county = s(row?.[iCounty]);
      const city = s(row?.[iCity]);
      const domain = s(row?.[iDomain]);
      const locationId = s(row?.[iLocationId]);
      if (!state || !city || !domain) continue;
      out.cities[`${norm(state)}|${norm(county)}|${norm(city)}`] = {
        state,
        county,
        city,
        domain: safeUrl(domain),
        locationId,
      };
    }
  }

  out.stats.activeStates = Object.keys(out.states).length;
  out.stats.activeCounties = Object.keys(out.counties).length;
  out.stats.activeCities = Object.keys(out.cities).length;

  return out;
}

async function loadGscTopQueries(limit: number, tenantId?: string) {
  const filePath = path.resolve(
    process.cwd(),
    "data",
    "cache",
    "tenants",
    s(tenantId) || "_default",
    "gsc",
    "queries.json",
  );
  const raw = await readJsonIfExists<GscCacheFile>(filePath);
  const rows = Array.isArray(raw?.rows) ? raw.rows : [];

  const mapped = rows
    .map((r) => {
      const query = s(r?.query || r?.keys?.[0]);
      const clicks = Number(r?.clicks || 0);
      const impressions = Number(r?.impressions || 0);
      return {
        query,
        clicks: Number.isFinite(clicks) ? clicks : 0,
        impressions: Number.isFinite(impressions) ? impressions : 0,
      };
    })
    .filter((x) => x.query)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, limit);

  return {
    available: mapped.length > 0,
    rows: mapped,
  };
}

async function loadTenantDefaultBaseUrl(tenantId?: string) {
  const id = s(tenantId);
  if (!id) return "";
  const pool = getDbPool();
  const q = await pool.query<{ root_domain: string | null }>(
    `
      select root_domain
      from app.organization_settings
      where organization_id = $1
      limit 1
    `,
    [id],
  );
  const rootDomain = s(q.rows[0]?.root_domain);
  if (!rootDomain) return "";
  return /^https?:\/\//i.test(rootDomain) ? rootDomain : `https://${rootDomain}`;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const keywordLimit = Math.max(5, Math.min(100, Number(searchParams.get("keywordLimit") || 30)));
    const tenantId = s(searchParams.get("tenantId"));

    const [business, landingMap, domains, gsc, tenantBaseUrl] = await Promise.all([
      loadBusinessProfile(),
      loadLandingMap(tenantId),
      loadSheetDomains(tenantId),
      loadGscTopQueries(keywordLimit, tenantId),
      loadTenantDefaultBaseUrl(tenantId),
    ]);

    const defaultBaseUrl =
      safeUrl(tenantBaseUrl || s(process.env.NEXT_PUBLIC_DEFAULT_BASE_URL) || s(process.env.BUSINESS_DEFAULT_BASE_URL) || "https://mydripnurse.com");

    return Response.json({
      ok: true,
      context: {
        business,
        landingMap,
        domains,
        gscTopQueries: gsc.rows,
        defaultBaseUrl,
      },
      debug: {
        tenantId: tenantId || null,
        keywordLimit,
        landingServices: landingMap.services.length,
        domains: domains.stats,
        gscAvailable: gsc.available,
      },
    });
  } catch (e: unknown) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed to load campaign context" },
      { status: 500 },
    );
  }
}
