import { NextResponse } from "next/server";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

function s(v: unknown) {
  return String(v ?? "").trim();
}

function n(v: unknown, fallback: number) {
  const x = Number(v);
  return Number.isFinite(x) ? x : fallback;
}

function extractGeoTiffId(urlRaw: unknown) {
  const raw = s(urlRaw);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return s(url.searchParams.get("id"));
  } catch {
    return "";
  }
}

async function readSolarApiKeys(tenantId: string) {
  const integration = await getTenantIntegration(tenantId, "custom", "solar_survey");
  const cfg = integration?.config && typeof integration.config === "object"
    ? (integration.config as Record<string, unknown>)
    : {};
  const maps = s(cfg.googleMapsApiKey);
  const solar = s(cfg.googleSolarApiKey) || maps;
  return { mapsApiKey: maps, solarApiKey: solar };
}

async function googleGetJson(baseUrl: string, params: URLSearchParams) {
  const response = await fetch(`${baseUrl}?${params.toString()}`, { cache: "no-store" });
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    payload = { raw: text.slice(0, 500) };
  }
  return { ok: response.ok, status: response.status, payload };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenantId = s(body.tenantId);
    const lat = n(body.lat, Number.NaN);
    const lng = n(body.lng, Number.NaN);
    const radiusMeters = n(body.radiusMeters, 60);
    const pixelSizeMeters = n(body.pixelSizeMeters, 0.5);

    if (!tenantId) {
      return NextResponse.json({ ok: false, error: "Missing tenantId." }, { status: 400 });
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, error: "lat/lng are required numeric values." }, { status: 400 });
    }

    const keys = await readSolarApiKeys(tenantId);
    if (!keys.solarApiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing GOOGLE_SOLAR_API_KEY (or GOOGLE_MAPS_API_KEY fallback) for this tenant." },
        { status: 400 },
      );
    }

    const buildingParams = new URLSearchParams({
      "location.latitude": String(lat),
      "location.longitude": String(lng),
      requiredQuality: "MEDIUM",
      exactQualityRequired: "false",
      key: keys.solarApiKey,
    });
    const layersParams = new URLSearchParams({
      "location.latitude": String(lat),
      "location.longitude": String(lng),
      radiusMeters: String(radiusMeters),
      view: "FULL_LAYERS",
      requiredQuality: "MEDIUM",
      exactQualityRequired: "false",
      pixelSizeMeters: String(pixelSizeMeters),
      key: keys.solarApiKey,
    });

    const [building, layers] = await Promise.all([
      googleGetJson("https://solar.googleapis.com/v1/buildingInsights:findClosest", buildingParams),
      googleGetJson("https://solar.googleapis.com/v1/dataLayers:get", layersParams),
    ]);

    const errors: Array<Record<string, unknown>> = [];
    if (!building.ok) errors.push({ endpoint: "buildingInsights", status: building.status, details: building.payload });
    if (!layers.ok) errors.push({ endpoint: "dataLayers", status: layers.status, details: layers.payload });

    if (!building.ok && !layers.ok) {
      return NextResponse.json(
        { ok: false, error: "Solar API request failed.", errors },
        { status: 502 },
      );
    }

    const layerIds = {
      rgb: extractGeoTiffId((layers.payload as Record<string, unknown>)?.rgbUrl),
      annualFlux: extractGeoTiffId((layers.payload as Record<string, unknown>)?.annualFluxUrl),
      mask: extractGeoTiffId((layers.payload as Record<string, unknown>)?.maskUrl),
    };

    return NextResponse.json({
      ok: true,
      buildingInsights: building.ok ? building.payload : null,
      dataLayers: layers.ok ? layers.payload : null,
      layerIds,
      errors,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unexpected error" },
      { status: 500 },
    );
  }
}
