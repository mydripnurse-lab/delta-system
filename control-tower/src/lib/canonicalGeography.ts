import "server-only";

const CENSUS_GEOCODER = "https://geocoding.geo.census.gov/geocoder/geographies/coordinates";
const CENSUS_COUNTIES = "https://api.census.gov/data/2020/dec/pl";
const TIGER_COUNTIES = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1/query";
const TIGER_PLACES = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer";

type StateDefinition = { code: string; fips: string; name: string };

const STATES: StateDefinition[] = ([
  ["AL", "01", "Alabama"], ["AK", "02", "Alaska"], ["AZ", "04", "Arizona"],
  ["AR", "05", "Arkansas"], ["CA", "06", "California"], ["CO", "08", "Colorado"],
  ["CT", "09", "Connecticut"], ["DE", "10", "Delaware"], ["DC", "11", "District of Columbia"],
  ["FL", "12", "Florida"], ["GA", "13", "Georgia"], ["HI", "15", "Hawaii"],
  ["ID", "16", "Idaho"], ["IL", "17", "Illinois"], ["IN", "18", "Indiana"],
  ["IA", "19", "Iowa"], ["KS", "20", "Kansas"], ["KY", "21", "Kentucky"],
  ["LA", "22", "Louisiana"], ["ME", "23", "Maine"], ["MD", "24", "Maryland"],
  ["MA", "25", "Massachusetts"], ["MI", "26", "Michigan"], ["MN", "27", "Minnesota"],
  ["MS", "28", "Mississippi"], ["MO", "29", "Missouri"], ["MT", "30", "Montana"],
  ["NE", "31", "Nebraska"], ["NV", "32", "Nevada"], ["NH", "33", "New Hampshire"],
  ["NJ", "34", "New Jersey"], ["NM", "35", "New Mexico"], ["NY", "36", "New York"],
  ["NC", "37", "North Carolina"], ["ND", "38", "North Dakota"], ["OH", "39", "Ohio"],
  ["OK", "40", "Oklahoma"], ["OR", "41", "Oregon"], ["PA", "42", "Pennsylvania"],
  ["RI", "44", "Rhode Island"], ["SC", "45", "South Carolina"], ["SD", "46", "South Dakota"],
  ["TN", "47", "Tennessee"], ["TX", "48", "Texas"], ["UT", "49", "Utah"],
  ["VT", "50", "Vermont"], ["VA", "51", "Virginia"], ["WA", "53", "Washington"],
  ["WV", "54", "West Virginia"], ["WI", "55", "Wisconsin"], ["WY", "56", "Wyoming"],
  ["PR", "72", "Puerto Rico"],
] as Array<[string, string, string]>).map(([code, fips, name]) => ({ code, fips, name }));

const stateByCode = new Map(STATES.map((state) => [state.code, state]));
const stateByFips = new Map(STATES.map((state) => [state.fips, state]));

export type CanonicalGeography = {
  stateName: string;
  stateCode: string;
  stateFips: string;
  countyName: string;
  countyFips: string;
  countyGeoid: string;
  placeName: string;
  placeGeoid: string;
  countryCode: "US" | "PR";
  source: "census_coordinates" | "census_county_catalog";
  confidence: "exact" | "catalog";
};

export type OfficialCommunity = {
  name: string;
  geoid: string;
  kind: "incorporated_place" | "census_designated_place";
};

type CountyCatalogRow = {
  stateName: string;
  stateCode: string;
  stateFips: string;
  countyName: string;
  countyFips: string;
  countyGeoid: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeGeographyName(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipio|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stateDefinition(value: unknown) {
  const candidate = normalizeGeographyName(value);
  return STATES.find((state) =>
    normalizeGeographyName(state.name) === candidate
    || state.code.toLowerCase() === candidate
    || state.fips === candidate,
  ) || null;
}

function withTimeout(milliseconds: number) {
  return AbortSignal.timeout(milliseconds);
}

function censusPlace(geographies: Record<string, unknown>) {
  const groups = ["Incorporated Places", "Census Designated Places", "County Subdivisions"];
  for (const group of groups) {
    const rows = geographies[group];
    if (!Array.isArray(rows) || !rows[0] || typeof rows[0] !== "object") continue;
    const row = rows[0] as Record<string, unknown>;
    return { name: text(row.NAME || row.BASENAME), geoid: text(row.GEOID) };
  }
  return { name: "", geoid: "" };
}

export async function resolveCanonicalGeographyByCoordinates(input: {
  latitude: number;
  longitude: number;
}): Promise<CanonicalGeography> {
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)) {
    throw new Error("A verified latitude and longitude are required to confirm coverage.");
  }
  const url = new URL(CENSUS_GEOCODER);
  url.searchParams.set("x", String(input.longitude));
  url.searchParams.set("y", String(input.latitude));
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("vintage", "Current_Current");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { cache: "no-store", signal: withTimeout(8_000) });
  if (!response.ok) throw new Error("The official coverage service could not verify this address.");
  const payload = await response.json() as {
    result?: { geographies?: Record<string, unknown> };
  };
  const geographies = payload.result?.geographies || {};
  const counties = geographies.Counties;
  if (!Array.isArray(counties) || !counties[0] || typeof counties[0] !== "object") {
    throw new Error("This address could not be assigned to an official U.S. county or Puerto Rico municipio.");
  }
  const county = counties[0] as Record<string, unknown>;
  const stateFips = text(county.STATE);
  const countyFips = text(county.COUNTY);
  const countyGeoid = text(county.GEOID) || `${stateFips}${countyFips}`;
  const state = stateByFips.get(stateFips);
  if (!state || !/^\d{5}$/.test(countyGeoid)) {
    throw new Error("The official county identifier returned for this address is invalid.");
  }
  const place = censusPlace(geographies);
  return {
    stateName: state.name,
    stateCode: state.code,
    stateFips,
    countyName: text(county.NAME || county.BASENAME),
    countyFips,
    countyGeoid,
    placeName: place.name,
    placeGeoid: place.geoid,
    countryCode: state.code === "PR" ? "PR" : "US",
    source: "census_coordinates",
    confidence: "exact",
  };
}

let countyCatalogPromise: Promise<CountyCatalogRow[]> | null = null;

async function loadCountyCatalog() {
  if (!countyCatalogPromise) {
    countyCatalogPromise = (async () => {
      const url = new URL(CENSUS_COUNTIES);
      url.searchParams.set("get", "NAME");
      url.searchParams.set("for", "county:*");
      url.searchParams.set("in", "state:*");
      const response = await fetch(url, { next: { revalidate: 86_400 }, signal: withTimeout(10_000) });
      if (!response.ok) throw new Error("The official county catalog is temporarily unavailable.");
      const rows = await response.json() as string[][];
      return rows.slice(1).flatMap(([name, stateFips, countyFips]) => {
        const state = stateByFips.get(stateFips);
        if (!state) return [];
        const countyName = text(name).replace(new RegExp(`,\\s*${state.name}$`, "i"), "");
        return [{
          stateName: state.name,
          stateCode: state.code,
          stateFips,
          countyName,
          countyFips,
          countyGeoid: `${stateFips}${countyFips}`,
        }];
      });
    })().catch((error) => {
      countyCatalogPromise = null;
      throw error;
    });
  }
  return countyCatalogPromise;
}

export async function resolveCanonicalCountyByName(input: {
  state: string;
  county: string;
}): Promise<CanonicalGeography | null> {
  const state = stateDefinition(input.state);
  if (!state) return null;
  const countyName = normalizeGeographyName(input.county);
  if (!countyName) return null;
  const catalog = await loadCountyCatalog();
  const county = catalog.find((candidate) =>
    candidate.stateFips === state.fips
    && normalizeGeographyName(candidate.countyName) === countyName,
  );
  if (!county) return null;
  return {
    ...county,
    placeName: "",
    placeGeoid: "",
    countryCode: state.code === "PR" ? "PR" : "US",
    source: "census_county_catalog",
    confidence: "catalog",
  };
}

const communitiesCache = new Map<string, Promise<OfficialCommunity[]>>();

async function loadOfficialCommunitiesUncached(countyGeoid: string) {
  const countyUrl = new URL(TIGER_COUNTIES);
  countyUrl.searchParams.set("where", `GEOID='${countyGeoid.replace(/[^0-9]/g, "")}'`);
  countyUrl.searchParams.set("outFields", "GEOID");
  countyUrl.searchParams.set("returnGeometry", "true");
  countyUrl.searchParams.set("outSR", "4326");
  countyUrl.searchParams.set("f", "json");
  const countyResponse = await fetch(countyUrl, { next: { revalidate: 604_800 }, signal: withTimeout(12_000) });
  if (!countyResponse.ok) return [];
  const countyPayload = await countyResponse.json() as { features?: Array<{ geometry?: unknown }> };
  const geometry = countyPayload.features?.[0]?.geometry;
  if (!geometry) return [];

  const queryLayer = async (layer: 4 | 5, kind: OfficialCommunity["kind"]) => {
    const form = new URLSearchParams({
      where: "1=1",
      geometry: JSON.stringify(geometry),
      geometryType: "esriGeometryPolygon",
      inSR: "4326",
      spatialRel: "esriSpatialRelIntersects",
      outFields: "NAME,GEOID",
      returnGeometry: "false",
      f: "json",
    });
    const response = await fetch(`${TIGER_PLACES}/${layer}/query`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
      next: { revalidate: 604_800 },
      signal: withTimeout(12_000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as { features?: Array<{ attributes?: Record<string, unknown> }> };
    return (payload.features || []).flatMap((feature) => {
      const name = text(feature.attributes?.NAME);
      const geoid = text(feature.attributes?.GEOID);
      return name ? [{ name, geoid, kind }] : [];
    });
  };

  const communities = [
    ...await queryLayer(4, "incorporated_place"),
    ...await queryLayer(5, "census_designated_place"),
  ];
  const unique = new Map(communities.map((community) => [normalizeGeographyName(community.name), community]));
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadOfficialCountyCommunities(countyGeoid: string) {
  const geoid = text(countyGeoid);
  if (!/^\d{5}$/.test(geoid)) return [];
  if (!communitiesCache.has(geoid)) {
    communitiesCache.set(geoid, loadOfficialCommunitiesUncached(geoid).catch(() => []));
  }
  return communitiesCache.get(geoid)!;
}

export function canonicalStateFromFips(stateFips: string) {
  return stateByFips.get(text(stateFips)) || null;
}

export function canonicalStateFromCode(stateCode: string) {
  return stateByCode.get(text(stateCode).toUpperCase()) || null;
}
