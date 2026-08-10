import { cache } from "react";

import { getDbPool } from "@/lib/db";
import type { PartnerServiceArea } from "@/lib/partnerProfiles";

type StateFileRow = {
  state_slug: string;
  state_name: string;
  payload: {
    counties?: Array<{
      countyName?: string;
      cities?: Array<{ cityName?: string }>;
    }>;
  } | null;
};

export type PartnerCity = {
  name: string;
  state: string;
  county?: string;
};

const TEMPLATE_PREVIEW_CITIES = [
  "Apopka",
  "Bay Lake",
  "Belle Isle",
  "Eatonville",
  "Edgewood",
  "Lake Buena Vista",
  "Maitland",
  "Oakland",
  "Ocoee",
  "Orlando",
  "Windermere",
  "Winter Garden",
  "Winter Park",
  "Kissimmee",
  "St. Cloud",
].map((name) => ({ name, state: "Florida" }));

function text(value: unknown) {
  return String(value ?? "").trim();
}

function normalized(value: unknown) {
  return text(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(county|parish|borough|municipality|census area)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stateMatches(areaState: string, row: StateFileRow) {
  const candidate = normalized(areaState);
  return candidate === normalized(row.state_name) || candidate === normalized(row.state_slug);
}

export const loadPartnerCities = cache(async function loadPartnerCities(
  organizationIdRaw: string,
  serviceAreas: PartnerServiceArea[],
): Promise<PartnerCity[]> {
  const organizationId = text(organizationIdRaw);
  if (!organizationId) return TEMPLATE_PREVIEW_CITIES;
  if (!serviceAreas.length) return [];

  const result = await getDbPool().query<StateFileRow>(
    `select state_slug, state_name, payload
       from app.organization_state_files
      where organization_id = $1`,
    [organizationId],
  );

  const cities: PartnerCity[] = [];
  const seen = new Set<string>();
  for (const area of serviceAreas) {
    const stateRow = result.rows.find((row) => stateMatches(area.state, row));
    if (!stateRow) continue;
    const counties = Array.isArray(stateRow.payload?.counties) ? stateRow.payload.counties : [];
    const county = counties.find((item) => normalized(item.countyName) === normalized(area.county));
    for (const city of county?.cities || []) {
      const name = text(city.cityName);
      if (!name) continue;
      const state = text(stateRow.state_name) || text(area.state);
      const countyName = text(county?.countyName) || text(area.county);
      const key = `${normalized(name)}:${normalized(state)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cities.push({ name, state, county: countyName });
    }
  }

  return cities.sort((a, b) => a.name.localeCompare(b.name));
});
