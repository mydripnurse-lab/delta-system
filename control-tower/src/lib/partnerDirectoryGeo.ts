import { cache } from "react";

import type { PartnerServiceArea } from "@/lib/partnerProfiles";

export type PartnerMapPoint = PartnerServiceArea & {
  latitude: number;
  longitude: number;
};

const STATE_FIPS: Record<string, string> = {
  alabama: "01", alaska: "02", arizona: "04", arkansas: "05", california: "06",
  colorado: "08", connecticut: "09", delaware: "10", "district of columbia": "11",
  florida: "12", georgia: "13", hawaii: "15", idaho: "16", illinois: "17",
  indiana: "18", iowa: "19", kansas: "20", kentucky: "21", louisiana: "22",
  maine: "23", maryland: "24", massachusetts: "25", michigan: "26", minnesota: "27",
  mississippi: "28", missouri: "29", montana: "30", nebraska: "31", nevada: "32",
  "new hampshire": "33", "new jersey": "34", "new mexico": "35", "new york": "36",
  "north carolina": "37", "north dakota": "38", ohio: "39", oklahoma: "40", oregon: "41",
  pennsylvania: "42", "rhode island": "44", "south carolina": "45", "south dakota": "46",
  tennessee: "47", texas: "48", utah: "49", vermont: "50", virginia: "51",
  washington: "53", "west virginia": "54", wisconsin: "55", wyoming: "56",
  "puerto rico": "72",
};

type TigerWebResponse = {
  features?: Array<{
    attributes?: {
      CENTLAT?: string;
      CENTLON?: string;
    };
  }>;
};

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function sqlString(value: string) {
  return value.replace(/'/g, "''");
}

async function resolvePlaceCoordinates(area: PartnerServiceArea) {
  const city = clean(area.city);
  const stateFips = STATE_FIPS[clean(area.state).toLowerCase()];
  if (!city || !stateFips) return null;
  const where = `STATE='${stateFips}' AND (NAME='${sqlString(city)}' OR BASENAME='${sqlString(city)}')`;

  try {
    for (const layer of [4, 5]) {
      const params = new URLSearchParams({
        where,
        outFields: "NAME,BASENAME,CENTLAT,CENTLON,STATE",
        returnGeometry: "false",
        f: "json",
      });
      const response = await fetch(
        `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/${layer}/query?${params.toString()}`,
        {
          headers: { Accept: "application/json" },
          next: { revalidate: 60 * 60 * 24 * 30 },
        },
      );
      if (!response.ok) continue;
      const body = (await response.json()) as TigerWebResponse;
      const attributes = body.features?.[0]?.attributes;
      const latitude = Number(attributes?.CENTLAT);
      const longitude = Number(attributes?.CENTLON);
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
    }
    return null;
  } catch {
    return null;
  }
}

export const resolveCountyCoordinates = cache(async function resolveCountyCoordinates(
  area: PartnerServiceArea,
): Promise<PartnerMapPoint | null> {
  const state = clean(area.state);
  const county = clean(area.county);
  const stateFips = STATE_FIPS[state.toLowerCase()];
  if (!stateFips || !county) return null;

  const baseCounty = county.replace(/\s+(county|parish|borough|municipality|census area)$/i, "");
  const where = `STATE='${stateFips}' AND (NAME='${sqlString(county)}' OR BASENAME='${sqlString(baseCounty)}')`;
  const params = new URLSearchParams({
    where,
    outFields: "CENTLAT,CENTLON",
    returnGeometry: "false",
    f: "json",
  });

  try {
    const response = await fetch(
      `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/19/query?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 * 60 * 24 * 30 },
      },
    );
    if (!response.ok) return null;
    const body = (await response.json()) as TigerWebResponse;
    const attributes = body.features?.[0]?.attributes;
    const latitude = Number(attributes?.CENTLAT);
    const longitude = Number(attributes?.CENTLON);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { ...area, latitude, longitude };
  } catch {
    return null;
  }
});

export const resolvePartnerAreaCoordinates = cache(async function resolvePartnerAreaCoordinates(
  area: PartnerServiceArea,
): Promise<PartnerMapPoint | null> {
  const cityCoordinates = await resolvePlaceCoordinates(area);
  if (cityCoordinates) return { ...area, ...cityCoordinates };
  return resolveCountyCoordinates(area);
});
