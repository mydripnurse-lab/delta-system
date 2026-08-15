type MapboxContext = {
  id?: string;
  text?: string;
  short_code?: string;
};

type MapboxFeature = {
  id?: string;
  text?: string;
  address?: string;
  place_name?: string;
  center?: [number, number];
  context?: MapboxContext[];
};

export type VerifiedMapboxAddress = {
  addressLine1: string;
  city: string;
  county: string;
  state: string;
  postalCode: string;
  countryCode: string;
  mapboxFeatureId: string;
  verifiedLabel: string;
  longitude: number;
  latitude: number;
};

export type MapboxAddressCoordinates = {
  longitude: number;
  latitude: number;
  mapboxFeatureId: string;
  verifiedLabel: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function contextValue(feature: MapboxFeature, prefixes: string[]) {
  return feature.context?.find((item) => prefixes.some((prefix) => item.id?.startsWith(prefix)));
}

/**
 * Resolves one physical street address for read-only analytics. Unlike the
 * interactive verifier, this does not need a previously selected feature ID.
 * The complete query URL is cached by Next so legacy activity is geocoded once
 * instead of on every analytics render.
 */
export async function resolveMapboxAddressCoordinates(input: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode?: string;
}): Promise<MapboxAddressCoordinates | null> {
  const token = text(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);
  const addressLine1 = text(input.addressLine1);
  if (!token || !addressLine1) return null;

  const query = [addressLine1, input.city, input.state, input.postalCode, input.countryCode || "US"]
    .map(text)
    .filter(Boolean)
    .join(", ");
  const params = new URLSearchParams({
    autocomplete: "false",
    limit: "1",
    types: "address",
    country: "us,pr",
    language: "en",
    access_token: token,
  });

  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`,
      {
        headers: { Accept: "application/json" },
        next: { revalidate: 60 * 60 * 24 * 30 },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const payload = await response.json() as { features?: MapboxFeature[] };
    const feature = payload.features?.[0];
    const [longitude, latitude] = feature?.center || [];
    if (!feature?.id?.startsWith("address.") || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
    return {
      longitude: Number(longitude),
      latitude: Number(latitude),
      mapboxFeatureId: feature.id,
      verifiedLabel: text(feature.place_name) || query,
    };
  } catch {
    return null;
  }
}

export async function verifyMapboxAddress(input: {
  addressLine1: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  selectedFeatureId: string;
}): Promise<VerifiedMapboxAddress> {
  const token = text(process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN);
  if (!token) throw new Error("Address verification is temporarily unavailable.");

  const query = [input.addressLine1, input.city, input.state, input.postalCode, input.countryCode]
    .map(text)
    .filter(Boolean)
    .join(", ");
  const params = new URLSearchParams({
    autocomplete: "false",
    limit: "1",
    types: "address",
    country: "us,pr",
    language: "en",
    access_token: token,
  });
  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`,
    { cache: "no-store", signal: AbortSignal.timeout(8_000) },
  );
  if (!response.ok) throw new Error("We could not verify that address right now.");
  const payload = await response.json() as { features?: MapboxFeature[] };
  const feature = payload.features?.[0];
  const line1 = [feature?.address, feature?.text].filter(Boolean).join(" ").trim();
  const city = text(contextValue(feature || {}, ["place", "locality", "municipality"])?.text);
  const county = text(contextValue(feature || {}, ["district", "county"])?.text);
  const state = text(contextValue(feature || {}, ["region"])?.text);
  const postalCode = text(contextValue(feature || {}, ["postcode"])?.text);
  const countryCode = text(contextValue(feature || {}, ["country"])?.short_code || input.countryCode || "US").toUpperCase();
  const [longitude, latitude] = feature?.center || [];

  if (
    !feature?.id || feature.id !== input.selectedFeatureId || !feature.id.startsWith("address.") ||
    !line1 || !city || !county || !state || !postalCode ||
    !Number.isFinite(longitude) || !Number.isFinite(latitude)
  ) {
    throw new Error("Choose a complete verified address from the suggestions.");
  }

  return {
    addressLine1: line1,
    city,
    county,
    state,
    postalCode,
    countryCode,
    mapboxFeatureId: feature.id,
    verifiedLabel: text(feature.place_name) || [line1, city, state, postalCode].join(", "),
    longitude: Number(longitude),
    latitude: Number(latitude),
  };
}
