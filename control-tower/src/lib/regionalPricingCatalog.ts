import "server-only";
import { gzipSync, gunzipSync } from "node:zlib";
import { unstable_cache, revalidateTag } from "next/cache";
import { getDbPool } from "@/lib/db";
import { getMyDripNurseOrganizationId } from "@/lib/myDripNurseServiceCatalog";
import { REGIONAL_PRICING_TAG, regionId, stateName, countyToken, pricingHost, type PricingRegion, type PricingLevel, type RegionalPrice } from "@/lib/regionalPricing";

export type RegionSnapshot = { syncedAt: string; regions: PricingRegion[]; warnings: string[] };
const KEY = "active-regions-v1";
const MODULE = "regional_pricing";
const empty = (): RegionSnapshot => ({ syncedAt: "", regions: [], warnings: [] });
const text = (value: unknown) => String(value ?? "").trim();
const truth = (value: unknown) => ["true", "1", "yes", "y"].includes(text(value).toLowerCase());

// Store a compact, compressed snapshot, rather than retransferring all Sheet rows.
const getPackedPricingRegions = unstable_cache(async (): Promise<string> => {
  const organizationId = await getMyDripNurseOrganizationId();
  const result = await getDbPool().query<{ key_value: string }>(
    `select key_value from app.organization_custom_values where organization_id = $1 and provider = 'custom' and scope = 'module' and module = $2 and key_name = $3 and is_active = true limit 1`,
    [organizationId, MODULE, KEY],
  );
  return result.rows[0]?.key_value || "";
}, ["mdn-active-pricing-regions-v1"], { revalidate: 3600, tags: [REGIONAL_PRICING_TAG] });

// One bounded immutable decoded copy per server instance, keyed by snapshot contents.
let decoded: { packed: string; snapshot: RegionSnapshot } | undefined;
export async function loadPricingRegions(): Promise<RegionSnapshot> {
  const packed = await getPackedPricingRegions();
  if (!packed) return empty();
  if (decoded?.packed === packed) return decoded.snapshot;
  const snapshot = JSON.parse(gunzipSync(Buffer.from(packed, "base64"), { maxOutputLength: 32 * 1024 * 1024 }).toString("utf8")) as RegionSnapshot;
  decoded = { packed, snapshot };
  return snapshot;
}

export async function syncPricingRegions(): Promise<RegionSnapshot> {
  // Google Sheets is only needed for an explicit admin sync, never a public read.
  const { getTenantSheetConfig, loadTenantSheetTabIndex } = await import("@/lib/tenantSheets");
  const organizationId = await getMyDripNurseOrganizationId();
  const cfg = await getTenantSheetConfig(organizationId);
  const [counties, cities, indexResult] = await Promise.all([
    loadTenantSheetTabIndex({ tenantId: organizationId, spreadsheetId: cfg.spreadsheetId, sheetName: cfg.countyTab, range: "A:AZ" }),
    loadTenantSheetTabIndex({ tenantId: organizationId, spreadsheetId: cfg.spreadsheetId, sheetName: cfg.cityTab, range: "A:AZ" }),
    getDbPool().query<{ key_value: string }>(`select key_value from app.organization_custom_values where organization_id = $1 and provider = 'custom' and scope = 'module' and module = 'search_builder_indexes' and key_name = 'location-nav' and is_active = true limit 1`, [organizationId]),
  ]);
  let index: { items?: Record<string, unknown>[]; states?: Record<string, unknown>[] } = {};
  if (indexResult.rows[0]) index = JSON.parse(indexResult.rows[0].key_value);
  const regions = new Map<string, PricingRegion>();
  const candidates = new Map<string, Set<string>>();
  const stateUrls = new Map<string, Set<string>>();
  let skipped = 0;
  let missingUrl = 0;
  function addUrl(map: Map<string, Set<string>>, key: string, raw: unknown) {
    const value = text(raw);
    const hostname = pricingHost(value);
    if (!hostname || hostname === "mydripnurse.com") return;
    const urls = map.get(key) || new Set<string>();
    urls.add(`https://${hostname}`);
    map.set(key, urls);
  }
  for (const item of index.items || []) {
    const state = stateName(text(item.state));
    if (!state) continue;
    const county = text(item.county), city = text(item.city);
    if (county) addUrl(candidates, regionId("county", { state, county }), item.countyUrl || item.countyDomain);
    if (city) addUrl(candidates, regionId("city", { state, county, city }), item.cityUrl || item.cityDomain);
    addUrl(stateUrls, state, item.stateUrl);
  }
  for (const item of index.states || []) addUrl(stateUrls, stateName(text(item.stateName)), item.stateUrl);
  for (const [tab, level] of [[counties, "county"], [cities, "city"]] as const) {
    for (const required of ["State", "County", "Status", "Location Id", "Domain Created", ...(level === "city" ? ["City"] : [])]) {
      if (!tab.headerMap.has(required)) throw new Error(`The ${tab.sheetName} sheet is missing ${required}. The previous location snapshot was preserved.`);
    }
    for (const row of tab.rows) {
      const get = (header: string) => text(row[tab.headerMap.get(header) ?? -1]);
      if (!truth(get("Status")) || !get("Location Id") || !truth(get("Domain Created"))) { skipped++; continue; }
      const state = stateName(get("State"));
      let county = get("County");
      const city = level === "city" ? get("City") : "";
      if (!state || !county || (level === "city" && !city)) { skipped++; continue; }
      // The legacy PR umbrella row is the territory, not a county.
      let actualLevel: PricingLevel = level;
      if (state === "Puerto Rico" && countyToken(county) === "puerto rico") { county = ""; if (!city) actualLevel = "state"; }
      const id = regionId(actualLevel, { state, county, city });
      // A Cities row may also carry its parent county's Domain. Never use it
      // for city pricing when the dedicated City Domain column exists.
      const sheetUrl = level === "city" ? (tab.headerMap.has("City Domain") ? get("City Domain") : get("Domain")) : get("Domain") || get("County Domain");
      const known = new Set(candidates.get(id) || []);
      const directHost = pricingHost(sheetUrl);
      if (directHost && directHost !== "mydripnurse.com") { known.clear(); known.add(`https://${directHost}`); }
      if (actualLevel === "state") for (const url of stateUrls.get(state) || []) known.add(url);
      if (known.size !== 1) { missingUrl++; continue; }
      const countyDisplay = county ? (/\b(county|parish|borough|municipality|municipio)\b/i.test(county) ? county : `${county} ${state === "Louisiana" ? "Parish" : state === "Puerto Rico" ? "Municipality" : "County"}`) : "";
      const label = city ? [city, countyDisplay, state].filter(Boolean).join(", ") : countyDisplay ? `${countyDisplay}, ${state}` : state;
      const previous = regions.get(id);
      regions.set(id, { id, level: actualLevel, state, county, city, label, urls: [...new Set([...(previous?.urls || []), ...known])] });
      const stateId = regionId("state", { state });
      if (!regions.has(stateId)) regions.set(stateId, { id: stateId, level: "state", state, county: "", city: "", label: state, urls: [...(stateUrls.get(state) || [])] });
    }
  }
  if (!regions.size) throw new Error("No active locations with an unambiguous My Drip Nurse domain were found. The previous snapshot was preserved.");
  const snapshot: RegionSnapshot = {
    syncedAt: new Date().toISOString(),
    regions: [...regions.values()].sort((a, b) => a.label.localeCompare(b.label)),
    warnings: [skipped ? `${skipped} inactive or incomplete rows excluded.` : "", missingUrl ? `${missingUrl} rows without an unambiguous domain excluded.` : ""].filter(Boolean),
  };
  // Retain known hosts for already-published pages. Publication status is
  // separate from geographic eligibility; a sync must never change prices.
  const previous = await loadPricingRegions();
  const currentIds = new Set(snapshot.regions.map(region => region.id));
  snapshot.regions.push(...previous.regions.filter(region => !currentIds.has(region.id)).map(region => ({ ...region, active: false })));
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized) > 32 * 1024 * 1024) throw new Error("The location catalog is too large. The previous snapshot was preserved.");
  const packed = gzipSync(serialized).toString("base64");
  if (Buffer.byteLength(packed) > 1_500_000) throw new Error("The location snapshot exceeds the safe cache size. The previous snapshot was preserved.");
  await getDbPool().query(`insert into app.organization_custom_values (organization_id, provider, scope, module, key_name, key_value, value_type, is_secret, is_active, description)
    values ($1, 'custom', 'module', $2, $3, $4, 'text', false, true, 'Compressed active pricing geography; manual sync')
    on conflict (organization_id, provider, scope, module, key_name) do update set key_value = excluded.key_value, is_active = true, updated_at = now()`, [organizationId, MODULE, KEY, packed]);
  revalidateTag(REGIONAL_PRICING_TAG, { expire: 0 });
  return snapshot;
}

/** Geographic selections are independent of which marketing pages are active. */
let selectable: { source: RegionSnapshot; regions: PricingRegion[] } | undefined;
export async function loadSelectablePricingRegions(selectedState?: string): Promise<RegionSnapshot> {
  const snapshot = await loadPricingRegions();
  if (selectable?.source !== snapshot) {
    // Only admin/coverage selectors load the full geographic catalog. Public
    // visitor requests continue to read the small, cached host snapshot.
    const { PRICING_GEOGRAPHY } = await import("@/lib/pricingGeography");
    const all = new Map(PRICING_GEOGRAPHY.map(region => [region.id, region]));
    for (const page of snapshot.regions) {
      // Preserve existing page IDs and links, including legacy municipality names.
      all.set(page.id, { ...(all.get(page.id) || page), urls: page.urls, active: true });
    }
    selectable = { source: snapshot, regions: [...all.values()] };
  }
  const state = selectedState ? stateName(selectedState) : '';
  return { ...snapshot, warnings: snapshot.warnings.map(w => `Page links: ${w}`), regions: selectable.regions.filter(r => selectedState === undefined || r.level === 'state' || r.state === state) };
}

export async function validateRegionalPrices(input: Array<{ regionId: string; price: number }>): Promise<RegionalPrice[]> {
  if (!input.length) return [];
  const snapshot = await loadSelectablePricingRegions();
  const byId = new Map(snapshot.regions.map(region => [region.id, region]));
  const seen = new Set<string>();
  return input.map(rule => {
    const region = byId.get(rule.regionId);
    if (!region || region.active === false) throw new Error("A selected location was not found in the geographic catalog. Review the selected state and region.");
    if (seen.has(region.id)) throw new Error("Each region can have only one price per service.");
    seen.add(region.id);
    return { region, price: Math.round(rule.price * 100) / 100 };
  });
}
