import { cache } from "react";

import {
  loadOfficialCountyCommunities,
  normalizeGeographyName,
  resolveCanonicalCountyByName,
  type CanonicalGeography,
} from "@/lib/canonicalGeography";
import type { PartnerServiceArea } from "@/lib/partnerProfiles";

export type PartnerCity = {
  name: string;
  state: string;
  county: string;
  geoid?: string;
  kind?: "incorporated_place" | "census_designated_place";
};

export type PartnerCoverageCounty = {
  state: string;
  stateCode: string;
  county: string;
  countyGeoid: string;
  communities: PartnerCity[];
};

function fallbackCoverageCounty(area: PartnerServiceArea): PartnerCoverageCounty | null {
  const state = text(area.state);
  const county = text(area.county);
  if (!state || !county) return null;
  const countyGeoid = text(area.countyGeoid)
    || `legacy:${normalizeGeographyName(state)}:${normalizeGeographyName(county)}`;
  const city = text(area.city || area.placeName);
  return {
    state,
    stateCode: "",
    county,
    countyGeoid,
    communities: city
      ? [{
          name: city,
          state,
          county,
          geoid: text(area.placeGeoid),
          kind: "census_designated_place",
        }]
      : [],
  };
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function canonicalCounty(area: PartnerServiceArea): Promise<CanonicalGeography | null> {
  const countyGeoid = text(area.countyGeoid);
  if (/^\d{5}$/.test(countyGeoid)) {
    const canonical = await resolveCanonicalCountyByName({ state: area.state, county: area.county });
    if (canonical?.countyGeoid === countyGeoid) return canonical;
  }
  return resolveCanonicalCountyByName({ state: area.state, county: area.county });
}

/**
 * Public coverage is derived from official Census county and place identifiers.
 * The sitemap JSON remains a generated content asset, not a booking authority.
 */
export const loadPartnerCoverageCounties = cache(async function loadPartnerCoverageCounties(
  serviceAreas: PartnerServiceArea[],
): Promise<PartnerCoverageCounty[]> {
  if (!serviceAreas.length) return [];

  const counties = new Map<string, PartnerCoverageCounty>();
  await Promise.all(serviceAreas.map(async (area) => {
    let canonical: CanonicalGeography | null = null;
    try {
      canonical = await canonicalCounty(area);
    } catch {
      // Keep the stored county visible if the Census service is temporarily unavailable.
    }
    if (!canonical) {
      const fallback = fallbackCoverageCounty(area);
      if (!fallback) return;
      if (!counties.has(fallback.countyGeoid)) counties.set(fallback.countyGeoid, fallback);
      return;
    }
    let communities: Awaited<ReturnType<typeof loadOfficialCountyCommunities>> = [];
    try {
      communities = await loadOfficialCountyCommunities(canonical.countyGeoid);
    } catch {
      // County coverage remains visible; community enrichment can recover on the next render.
    }
    const fallbackCity = text(area.city || area.placeName);
    const officialCommunities = communities.length
      ? communities
      : fallbackCity
        ? [{ name: fallbackCity, geoid: text(area.placeGeoid), kind: "census_designated_place" as const }]
        : [];
    const countyKey = canonical.countyGeoid;
    const existing = counties.get(countyKey) || {
      state: canonical.stateName,
      stateCode: canonical.stateCode,
      county: canonical.countyName,
      countyGeoid: countyKey,
      communities: [],
    };
    const seen = new Set(existing.communities.map((community) => normalizeGeographyName(community.name)));
    for (const community of officialCommunities) {
      const key = normalizeGeographyName(community.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      existing.communities.push({
        name: community.name,
        state: canonical.stateName,
        county: canonical.countyName,
        geoid: community.geoid,
        kind: community.kind,
      });
    }
    existing.communities.sort((a, b) => a.name.localeCompare(b.name));
    counties.set(countyKey, existing);
  }));

  return [...counties.values()].sort((a, b) =>
    a.state.localeCompare(b.state) || a.county.localeCompare(b.county),
  );
});

export const loadPartnerCities = cache(async function loadPartnerCities(
  _organizationIdRaw: string,
  serviceAreas: PartnerServiceArea[],
): Promise<PartnerCity[]> {
  const counties = await loadPartnerCoverageCounties(serviceAreas);
  return counties.flatMap((county) => county.communities);
});
