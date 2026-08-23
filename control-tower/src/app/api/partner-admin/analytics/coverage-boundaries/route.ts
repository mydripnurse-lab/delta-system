import { NextRequest, NextResponse } from "next/server";

import { requirePartnerAdmin } from "@/lib/partnerAdminAuth";
import { stateFipsForCode } from "@/lib/usStateOptions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TIGER_COUNTIES = "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/19/query";
const INCLUDED_STATE_FIPS = [
  "01", "02", "04", "05", "06", "08", "09", "10", "11", "12", "13", "15", "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40", "41", "42", "44", "45", "46", "47", "48", "49", "50", "51", "53", "54", "55", "56", "72",
];

type TigerBoundaryCollection = {
  type?: string;
  exceededTransferLimit?: boolean;
  features?: Array<{
    type?: string;
    geometry?: { type?: string; coordinates?: unknown };
    properties?: Record<string, unknown>;
  }>;
};

export async function GET(request: NextRequest) {
  const auth = await requirePartnerAdmin(request, { module: "analytics" });
  if ("response" in auth) return auth.response;

  const scopedFips = auth.access.isOwner
    ? INCLUDED_STATE_FIPS
    : auth.access.stateCodes.map(stateFipsForCode).filter(Boolean);
  if (!scopedFips.length) {
    return NextResponse.json({ ok: true, boundaries: { type: "FeatureCollection", features: [] } });
  }

  const params = new URLSearchParams({
    where: `STATE IN (${scopedFips.map((fips) => `'${fips}'`).join(",")})`,
    outFields: "GEOID,STATE,NAME,BASENAME",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "3",
    maxAllowableOffset: "0.01",
    orderByFields: "GEOID",
    resultRecordCount: "100000",
    f: "geojson",
  });

  try {
    const response = await fetch(`${TIGER_COUNTIES}?${params.toString()}`, {
      headers: { Accept: "application/geo+json,application/json" },
      next: { revalidate: 60 * 60 * 24 * 30 },
    });
    if (!response.ok) throw new Error(`TIGERweb returned ${response.status}.`);
    const payload = await response.json() as TigerBoundaryCollection;
    if (payload.exceededTransferLimit || !Array.isArray(payload.features)) throw new Error("TIGERweb returned an incomplete boundary collection.");

    const features = payload.features.flatMap((feature) => {
      const geometryType = feature.geometry?.type;
      if ((geometryType !== "Polygon" && geometryType !== "MultiPolygon") || !feature.geometry?.coordinates) return [];
      return [{
        type: "Feature" as const,
        geometry: feature.geometry,
        properties: {
          GEOID: String(feature.properties?.GEOID || ""),
          STATE: String(feature.properties?.STATE || ""),
          NAME: String(feature.properties?.NAME || ""),
          BASENAME: String(feature.properties?.BASENAME || ""),
        },
      }];
    });

    return NextResponse.json({ ok: true, boundaries: { type: "FeatureCollection", features } }, {
      headers: { "cache-control": "private, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    console.error("[partner-admin coverage boundaries] failed", error);
    return NextResponse.json({ ok: false, error: "Could not load USA and Puerto Rico coverage boundaries." }, { status: 502 });
  }
}
