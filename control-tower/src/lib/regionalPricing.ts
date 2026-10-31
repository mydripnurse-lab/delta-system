/** Shared, deterministic pricing rules. No network or database access. */
export type PricingLevel = "state" | "county" | "city";
export type PricingRegion = {
  id: string;
  level: PricingLevel;
  state: string;
  county: string;
  city: string;
  label: string;
  urls: string[];
  active?: boolean;
};
export type RegionalPrice = { region: PricingRegion; price: number };
export type PricingLocation = { state: string; county?: string; city?: string };
export type DescendantPricePolicy = "preserve" | "inherit";
export const REGIONAL_PRICING_TAG = "mdn-regional-pricing";
export const SERVICE_PRICING_TAG = "mdn-service-pricing";
const STATE_NAMES = "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|Puerto Rico".split("|");
export const PRICING_STATES: readonly string[] = STATE_NAMES;
const STATE_CODES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR".split(" ");
export function locationToken(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export function stateName(value: string) {
  const token = locationToken(value);
  const index = STATE_NAMES.findIndex((name, i) => locationToken(name) === token || STATE_CODES[i].toLowerCase() === token);
  return index >= 0 ? STATE_NAMES[index] : "";
}
export function countyToken(value: string) {
  return locationToken(value).replace(/\b(county|parish|borough|municipio|municipality|census area)\b/g, "").replace(/\s+/g, " ").trim();
}
export function regionId(level: PricingLevel, location: PricingLocation) {
  const state = stateName(location.state);
  const county = state === "Puerto Rico" && countyToken(location.county || "") === "puerto rico" ? "" : countyToken(location.county || "");
  return [level, locationToken(state), level === "state" ? "" : county, level === "city" ? locationToken(location.city || "") : ""].join(":");
}
function cityMatches(expected: string, officialName: string) {
  const actual = locationToken(officialName);
  return locationToken(expected) === actual || locationToken(expected) === actual.replace(/ (city|town|village|borough|cdp|zona urbana|comunidad)$/, "");
}
export function regionMatches(region: PricingRegion, location: PricingLocation) {
  if (!stateName(location.state) || stateName(region.state) !== stateName(location.state)) return false;
  if (region.level === "state") return true;
  // Puerto Rico's municipality rows are stored in the legacy Cities sheet.
  if (region.state === "Puerto Rico" && !countyToken(region.county)) {
    return locationToken(region.city) === countyToken(location.county || "") || cityMatches(region.city, location.city || "");
  }
  if (countyToken(region.county) !== countyToken(location.county || "")) return false;
  return region.level === "county" || cityMatches(region.city, location.city || "");
}
/** Strict descendants only: never remove siblings, ancestors or another state's rules. */
export function isPricingDescendant(parent: PricingRegion, child: PricingRegion) {
  const state = stateName(parent.state);
  if (!state || state !== stateName(child.state) || parent.id === child.id) return false;
  if (parent.level === "state") return child.level === "county" || child.level === "city";
  return parent.level === "county" && child.level === "city"
    && !!countyToken(parent.county) && countyToken(parent.county) === countyToken(child.county);
}
/** Editing the draft is local; descendants inherit without creating duplicate prices. */
export function applyRegionalPrice(rules: RegionalPrice[], region: PricingRegion, price: number, policy: DescendantPricePolicy = "preserve"): RegionalPrice[] {
  return applyRegionalPrices(rules, [region], price, policy);
}
/** Selected locations share a single draft update and the existing service save. */
export function applyRegionalPrices(rules: RegionalPrice[], regions: PricingRegion[], price: number, policy: DescendantPricePolicy = "preserve"): RegionalPrice[] {
  const unique = new Map(regions.map(region => [region.id, region]));
  const parents = [...unique.values()];
  return [...rules.filter(rule => !unique.has(rule.region.id)
    && !(policy === "inherit" && parents.some(parent => isPricingDescendant(parent, rule.region)))),
  ...parents.map(region => ({ region, price }))];
}
export function resolveRegionalPrice(basePrice: number, rules: RegionalPrice[], location?: PricingLocation | null, partnerOverride?: number | null) {
  if (partnerOverride !== null && partnerOverride !== undefined && Number.isFinite(partnerOverride) && partnerOverride >= 0) {
    return { price: partnerOverride, source: "Partner price", regionId: null as string | null };
  }
  const ranks = { state: 1, county: 2, city: 3 };
  const matches = location ? rules.filter(rule => regionMatches(rule.region, location)).sort((a, b) => {
    const levelDifference = ranks[b.region.level] - ranks[a.region.level];
    if (levelDifference) return levelDifference;
    // Prefer exact names over a Census suffix alias (e.g. Orange vs Orange City).
    return Number(locationToken(b.region.city) === locationToken(location.city || ""))
      - Number(locationToken(a.region.city) === locationToken(location.city || ""));
  }) : [];
  const winner = matches[0];
  return winner ? { price: winner.price, source: winner.region.label, regionId: winner.region.id } : { price: basePrice, source: "Default price", regionId: null as string | null };
}
export function readRegionalPrices(value: unknown): RegionalPrice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((rule): rule is RegionalPrice => !!rule && typeof rule === "object" && Number.isFinite(rule.price) && rule.price >= 0
    && !!rule.region && ["state", "county", "city"].includes(rule.region.level)
    && typeof rule.region.state === "string" && typeof rule.region.county === "string" && typeof rule.region.city === "string"
    && !!stateName(rule.region.state) && typeof rule.region.label === "string" && Array.isArray(rule.region.urls)
    && rule.region.urls.every((url: unknown) => typeof url === "string" && !!pricingHost(url))
    && rule.region.id === regionId(rule.region.level, rule.region));
}
export function pricingHost(value: string) {
  try {
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return "";
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host === "mydripnurse.com" || host.endsWith(".mydripnurse.com") ? host : "";
  } catch { return ""; }
}
const hostIndexes = new WeakMap<PricingRegion[], Map<string, PricingRegion | null>>();
export function regionForHost(regions: PricingRegion[], host: string): PricingRegion | null {
  const normalized = pricingHost(host);
  if (!normalized || normalized === "mydripnurse.com") return null;
  let index = hostIndexes.get(regions);
  if (!index) {
    index = new Map();
    for (const region of regions) for (const url of region.urls) {
      const key = pricingHost(url);
      if (!key) continue;
      if (index.has(key) && index.get(key)?.id !== region.id) index.set(key, null);
      else index.set(key, region);
    }
    hostIndexes.set(regions, index);
  }
  return index.get(normalized) || null;
}
