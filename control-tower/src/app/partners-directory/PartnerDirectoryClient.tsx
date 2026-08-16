"use client";

import { geoAlbersUsa, geoPath } from "d3-geo";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { feature } from "topojson-client";
import usStates from "us-atlas/states-10m.json";

import type { PartnerCountyCoverage, PartnerMapPoint } from "@/lib/partnerDirectoryGeo";
import type { PublicPartnerProfile } from "@/lib/partnerProfiles";

import styles from "./PartnerDirectory.module.css";
import MapboxPartnerMap from "./MapboxPartnerMap";

export type DirectoryPartner = PublicPartnerProfile & {
  mapPoints: PartnerMapPoint[];
  countyCoverages: PartnerCountyCoverage[];
  ranking: {
    availabilityConfigured: boolean;
    acceptanceRate: number;
    completedAppointments: number;
    organicScore: number;
  };
  reviewSummary: {
    averageRating: number;
    reviewCount: number;
  };
};

type Props = {
  partners: DirectoryPartner[];
  preview?: boolean;
};

type ViewMode = "split" | "grid";

type MapTransform = {
  scale: number;
  x: number;
  y: number;
};

const MAP_WIDTH = 960;
const MAP_HEIGHT = 610;
const projection = geoAlbersUsa().translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]).scale(1240);
const path = geoPath(projection);
const stateFeatures = (
  feature(
    usStates as Parameters<typeof feature>[0],
    (usStates as unknown as { objects: { states: Parameters<typeof feature>[1] } }).objects.states,
  ) as unknown as { features: Array<{ id?: string | number; type: string; geometry: unknown }> }
).features;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function haversineMiles(a: { latitude: number; longitude: number }, b: PartnerMapPoint) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthMiles = 3958.8;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const lat1 = radians(a.latitude);
  const lat2 = radians(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthMiles * Math.asin(Math.sqrt(h));
}

function nearestDistance(
  location: { latitude: number; longitude: number },
  partner: DirectoryPartner,
) {
  if (!partner.mapPoints.length) return Number.POSITIVE_INFINITY;
  return Math.min(...partner.mapPoints.map((point) => haversineMiles(location, point)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function PartnerDirectoryClient({ partners, preview = false }: Props) {
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [countyFilter, setCountyFilter] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [selectedPartnerId, setSelectedPartnerId] = useState("");
  const [selectedPointKey, setSelectedPointKey] = useState("");
  const [mapTransform, setMapTransform] = useState<MapTransform>({ scale: 1, x: 0, y: 0 });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [isLocating, setIsLocating] = useState(false);
  const mapDrag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const mapViewport = useRef<HTMLDivElement | null>(null);
  const hasAutoFitMap = useRef(false);
  const hasCheckedLocationPermission = useRef(false);
  const recordedImpressions = useRef(new Set<string>());
  const deferredQuery = useDeferredValue(query);

  const recordDirectoryEvent = useCallback((partnerProfileIds: string[], event: "impression" | "profile_click") => {
    if (preview || !partnerProfileIds.length) return;
    void fetch("/api/public/partner-directory/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partnerProfileIds, event }),
      keepalive: true,
    }).catch(() => undefined);
  }, [preview]);

  const openDirectoryProfile = useCallback((partnerId: string) => {
    if (!preview) {
      try { window.sessionStorage.setItem("mdn:directory-attribution", JSON.stringify({ partnerId, at: Date.now() })); } catch { /* storage may be unavailable */ }
    }
    recordDirectoryEvent([partnerId], "profile_click");
  }, [preview, recordDirectoryEvent]);

  const stateOptions = useMemo(
    () => [...new Set(partners.flatMap((partner) => partner.serviceAreas.map((area) => area.state)))].sort(),
    [partners],
  );

  const countyOptions = useMemo(
    () =>
      [...new Set(
        partners.flatMap((partner) =>
          partner.serviceAreas
            .filter((area) => !stateFilter || area.state === stateFilter)
            .map((area) => area.county),
        ),
      )].sort(),
    [partners, stateFilter],
  );

  const filteredPartners = useMemo(() => {
    const needle = normalize(deferredQuery);
    const filtered = partners.filter((partner) => {
      const matchesState = !stateFilter || partner.serviceAreas.some((area) => area.state === stateFilter);
      const matchesCounty = !countyFilter || partner.serviceAreas.some((area) => area.county === countyFilter);
      const searchable = [
        partner.displayName,
        partner.businessName,
        partner.publicTitle,
        partner.professionalCredentials,
        ...partner.serviceAreas.flatMap((area) => [area.county, area.state]),
        ...partner.services.map((service) => service.name),
      ]
        .map(normalize)
        .join(" ");
      return matchesState && matchesCounty && (!needle || searchable.includes(needle));
    });

    const compareOrganicFit = (a: DirectoryPartner, b: DirectoryPartner) =>
      Number(b.ranking.availabilityConfigured) - Number(a.ranking.availabilityConfigured)
      || b.ranking.organicScore - a.ranking.organicScore
      || a.displayName.localeCompare(b.displayName);

    if (!userLocation) return [...filtered].sort(compareOrganicFit);
    return [...filtered].sort((a, b) => {
      const distanceA = nearestDistance(userLocation, a);
      const distanceB = nearestDistance(userLocation, b);
      const distanceBandDifference = Math.floor(distanceA / 10) - Math.floor(distanceB / 10);
      return distanceBandDifference || compareOrganicFit(a, b) || distanceA - distanceB;
    });
  }, [countyFilter, deferredQuery, partners, stateFilter, userLocation]);

  useEffect(() => {
    if (preview || !filteredPartners.length || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      const newlyVisible: string[] = [];
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.55) return;
        const partnerId = (entry.target as HTMLElement).dataset.directoryPartnerId || "";
        if (!partnerId || recordedImpressions.current.has(partnerId)) return;
        recordedImpressions.current.add(partnerId);
        newlyVisible.push(partnerId);
        observer.unobserve(entry.target);
      });
      if (newlyVisible.length) recordDirectoryEvent(newlyVisible, "impression");
    }, { threshold: [0.55] });
    const cards = document.querySelectorAll<HTMLElement>("[data-directory-partner-id]");
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [filteredPartners, preview, recordDirectoryEvent, viewMode]);

  const markerPoints = useMemo(
    () =>
      filteredPartners.flatMap((partner) =>
        partner.mapPoints.flatMap((point) => {
          const projected = projection([point.longitude, point.latitude]);
          if (!projected) return [];
          return [{ partner, point, x: projected[0], y: projected[1] }];
        }),
      ),
    [filteredPartners],
  );

  const markerPointKey = (point: PartnerMapPoint) =>
    `${point.locationId}:${point.city || point.county}:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;

  function resetMapView() {
    setMapTransform({ scale: 1, x: 0, y: 0 });
  }

  function zoomMap(direction: "in" | "out") {
    setMapTransform((current) => ({
      ...current,
      scale: clamp(current.scale * (direction === "in" ? 1.22 : 0.82), 1, 3.4),
    }));
  }

  function fitMapToCoverage() {
    if (!markerPoints.length) return resetMapView();
    const minX = Math.min(...markerPoints.map((marker) => marker.x));
    const maxX = Math.max(...markerPoints.map((marker) => marker.x));
    const minY = Math.min(...markerPoints.map((marker) => marker.y));
    const maxY = Math.max(...markerPoints.map((marker) => marker.y));
    const spanX = Math.max(maxX - minX, 130);
    const spanY = Math.max(maxY - minY, 110);
    const scale = clamp(Math.min(MAP_WIDTH / (spanX / 0.62), MAP_HEIGHT / (spanY / 0.58)), 1, 3.4);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const viewportWidth = mapViewport.current?.clientWidth || MAP_WIDTH;
    const viewportHeight = mapViewport.current?.clientHeight || MAP_HEIGHT;
    setMapTransform({
      scale,
      x: viewportWidth / 2 - (centerX / MAP_WIDTH) * viewportWidth,
      y: viewportHeight / 2 - (centerY / MAP_HEIGHT) * viewportHeight,
    });
  }

  useEffect(() => {
    if (hasAutoFitMap.current || !markerPoints.length) return;
    hasAutoFitMap.current = true;
    requestAnimationFrame(fitMapToCoverage);
  }, [markerPoints.length]);

  function handleMapWheel(event: React.WheelEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = event.clientX - rect.left - rect.width / 2;
    const pointerY = event.clientY - rect.top - rect.height / 2;
    setMapTransform((current) => {
      const nextScale = clamp(current.scale * (event.deltaY < 0 ? 1.12 : 0.9), 1, 3.4);
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
    });
  }

  function handleMapPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    mapDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handleMapPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!mapDrag.current || mapDrag.current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - mapDrag.current.x;
    const deltaY = event.clientY - mapDrag.current.y;
    mapDrag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    setMapTransform((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
  }

  function handleMapPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (mapDrag.current?.pointerId === event.pointerId) mapDrag.current = null;
  }

  const selectedPartner =
    filteredPartners.find((partner) => partner.id === selectedPartnerId) || filteredPartners[0] || null;
  const activeCounties = new Set(partners.flatMap((partner) => partner.serviceAreas.map((area) => `${area.state}:${area.county}`))).size;
  const activeServices = new Set(partners.flatMap((partner) => partner.services.map((service) => service.name))).size;

  function resetFilters() {
    setQuery("");
    setStateFilter("");
    setCountyFilter("");
    setUserLocation(null);
    setLocationQuery("");
    setLocationLabel("");
    setLocationStatus("");
  }

  async function findByLocation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedLocation = locationQuery.trim();
    if (!requestedLocation) {
      setLocationStatus("Enter a city or ZIP code to find nearby Partners.");
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
    if (!token) {
      setLocationStatus("Location search is temporarily unavailable. Use the state and county filters.");
      return;
    }

    setIsLocating(true);
    setLocationStatus(`Finding Partners near ${requestedLocation}…`);
    try {
      const params = new URLSearchParams({
        access_token: token,
        autocomplete: "false",
        country: "us,pr,ca",
        language: "en",
        limit: "1",
        types: "postcode,place,locality,district",
      });
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(requestedLocation)}.json?${params.toString()}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Location lookup failed");
      const payload = await response.json() as {
        features?: Array<{ center?: [number, number]; place_name?: string; text?: string }>;
      };
      const match = payload.features?.[0];
      if (!match?.center) {
        setLocationStatus("We could not find that location. Try a city with its state or a valid ZIP code.");
        return;
      }

      setStateFilter("");
      setCountyFilter("");
      setUserLocation({ latitude: match.center[1], longitude: match.center[0] });
      setLocationLabel(match.place_name || match.text || requestedLocation);
      setLocationStatus(`Recommended by distance from ${match.place_name || match.text || requestedLocation}.`);
    } catch {
      setLocationStatus("We could not search that location right now. Please try again.");
    } finally {
      setIsLocating(false);
    }
  }

  function findNearMe() {
    if (!navigator.geolocation) {
      setLocationStatus("Location is not available in this browser.");
      return;
    }
    setIsLocating(true);
    setLocationStatus("Finding Partners near you…");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocationLabel("your current location");
        setLocationStatus("Sorted by distance from your current location.");
        setIsLocating(false);
      },
      () => {
        setLocationStatus("We could not access your location. Try a city or ZIP code instead.");
        setIsLocating(false);
      },
      { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
    );
  }

  useEffect(() => {
    if (hasCheckedLocationPermission.current || !navigator.geolocation) return;
    hasCheckedLocationPermission.current = true;
    if (!("permissions" in navigator)) return;
    void navigator.permissions.query({ name: "geolocation" }).then((permission) => {
      if (permission.state !== "granted") return;
      setLocationStatus("Finding Partners near you…");
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setUserLocation({ latitude: coords.latitude, longitude: coords.longitude });
          setLocationLabel("your current location");
          setLocationStatus("Recommended by distance from your current location.");
        },
        () => setLocationStatus("Use the location button or search by county or state."),
        { enableHighAccuracy: false, maximumAge: 300000, timeout: 8000 },
      );
    }).catch(() => undefined);
  }, []);

  return (
    <section className={styles.directory}>
      <div className={styles.shell}>
        {preview ? (
          <div className={styles.previewNotice}>
            <span>Design preview</span>
            Sample profiles are shown only so we can review the directory experience.
          </div>
        ) : null}

        <div className={styles.directoryHeading}>
          <div>
            <span className={styles.eyebrow}>Verified local care</span>
            <h2>Find your My Drip Nurse Partner.</h2>
            <p>Search by service area, explore the map, and meet the professional behind your care.</p>
          </div>
          <div className={styles.networkStats} aria-label="Partner network statistics">
            <div><strong>{partners.length}</strong><span>Partners</span></div>
            <div><strong>{activeCounties}</strong><span>Counties</span></div>
            <div><strong>{activeServices}</strong><span>Services</span></div>
          </div>
        </div>

        <form className={styles.locationPanel} onSubmit={findByLocation}>
          <label className={styles.locationField}>
            <span aria-hidden="true">⌖</span>
            <span className={styles.srOnly}>City or ZIP code</span>
            <input
              type="search"
              inputMode="search"
              autoComplete="postal-code"
              value={locationQuery}
              onChange={(event) => setLocationQuery(event.target.value)}
              placeholder="Enter city or ZIP code"
            />
          </label>
          <button type="submit" className={styles.locationSearchButton} disabled={isLocating}>
            {isLocating ? "Finding nearby care…" : "Find nearby care"}
          </button>
          <span className={styles.locationDivider}>or</span>
          <button type="button" className={styles.nearButton} onClick={findNearMe} disabled={isLocating}>
            <span aria-hidden="true">◎</span> Use my location
          </button>
        </form>

        <div className={styles.searchPanel}>
          <label className={styles.searchField}>
            <span aria-hidden="true">⌕</span>
            <span className={styles.srOnly}>Search Partners</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by Partner, county, business, or service"
            />
          </label>

          <label className={styles.filterField}>
            <span>State</span>
            <select
              value={stateFilter}
              onChange={(event) => {
                setStateFilter(event.target.value);
                setCountyFilter("");
              }}
            >
              <option value="">All states</option>
              {stateOptions.map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>

          <label className={styles.filterField}>
            <span>County</span>
            <select value={countyFilter} onChange={(event) => setCountyFilter(event.target.value)}>
              <option value="">All counties</option>
              {countyOptions.map((county) => <option key={county} value={county}>{county}</option>)}
            </select>
          </label>

        </div>

        <div className={styles.resultsBar}>
          <div>
            <strong>
              {locationLabel ? `Recommended near ${locationLabel}` : `${filteredPartners.length}`}
            </strong>
            <span>
              {locationLabel
                ? `${filteredPartners.length} ${filteredPartners.length === 1 ? "Partner" : "Partners"} ordered by distance`
                : filteredPartners.length === 1 ? "Partner found" : "Partners found"}
            </span>
            {locationStatus ? <small role="status">{locationStatus}</small> : null}
          </div>
          <div className={styles.viewToggle} aria-label="Directory view">
            <button type="button" aria-pressed={viewMode === "split"} onClick={() => setViewMode("split")}>Map + List</button>
            <button type="button" aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")}>Cards</button>
          </div>
        </div>

        {filteredPartners.length ? (
          <div className={`${styles.explorer} ${viewMode === "grid" ? styles.gridMode : ""}`}>
            {viewMode === "split" ? (
              <MapboxPartnerMap
                coverages={filteredPartners.flatMap((partner) => partner.countyCoverages.map((coverage) => ({ partner, coverage })))}
                selectedPointKey={selectedPointKey}
                onSelect={(partnerId, pointKey) => {
                  setSelectedPartnerId(partnerId);
                  setSelectedPointKey(pointKey);
                }}
              />
            ) : null}

            <div className={`${styles.partnerList} ${viewMode === "grid" ? styles.cardGrid : ""}`}>
              {filteredPartners.map((partner, partnerIndex) => (
                <article
                  className={`${styles.card} ${selectedPartner?.id === partner.id ? styles.selectedCard : ""}`}
                  key={partner.id}
                  data-directory-partner-id={partner.id}
                  onMouseEnter={() => setSelectedPartnerId(partner.id)}
                >
                  <div className={styles.cardPhoto}>
                    {partner.profilePhotoUrl ? (
                      <div className={styles.cardPhotoImage}>
                        <Image
                          className={styles.cardPhotoBackdrop}
                          src={partner.profilePhotoUrl}
                          alt=""
                          aria-hidden="true"
                          fill
                          sizes={viewMode === "grid" ? "(max-width: 760px) 100vw, 33vw" : "180px"}
                        />
                        <Image
                          className={styles.cardPhotoForeground}
                          src={partner.profilePhotoUrl}
                          alt={partner.displayName}
                          fill
                          sizes={viewMode === "grid" ? "(max-width: 760px) 100vw, 33vw" : "180px"}
                        />
                      </div>
                    ) : (
                      <span>{initials(partner.displayName)}</span>
                    )}
                    <small><i /> Verified</small>
                  </div>
                  <div className={styles.cardCopy}>
                    <div className={styles.cardTitleRow}>
                      <div>
                        <h3>{partner.displayName}</h3>
                        <p>{partner.publicTitle || partner.businessName || "My Drip Nurse Partner"}</p>
                      </div>
                      <span>{partner.professionalCredentials}</span>
                    </div>
                    <div className={styles.directorySignals} aria-label="Directory match signals">
                      {userLocation && partnerIndex === 0 ? <span>Closest recommended match</span> : null}
                      {partner.ranking.availabilityConfigured ? <span>Availability ready</span> : null}
                      {partner.reviewSummary.reviewCount ? (
                        <span className={styles.reviewSignal}>
                          <b aria-hidden="true">★</b> {partner.reviewSummary.averageRating.toFixed(1)} · {partner.reviewSummary.reviewCount} verified
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.areas}>
                      {partner.serviceAreas.slice(0, 3).map((area) => (
                        <small key={`${partner.id}-${area.locationId}`}>{area.county}, {area.state}</small>
                      ))}
                    </div>
                    <div className={styles.cardMeta}>
                      <span>
                        {userLocation && partner.mapPoints.length
                          ? `${Math.round(nearestDistance(userLocation, partner))} mi away`
                          : `${partner.services.length} services`}
                      </span>
                      {partner.websiteStatus === "published" ? (
                        <Link href={`/${partner.slug}?ref=directory&directoryPartnerId=${encodeURIComponent(partner.id)}`} onClick={() => openDirectoryProfile(partner.id)}>View profile <span aria-hidden="true">→</span></Link>
                      ) : (
                        <span>Directory profile</span>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true">⌕</span>
            <strong>{partners.length ? "No Partners match those filters." : "Our Partner network is being prepared."}</strong>
            <p>
              {partners.length
                ? "Try a different county, state, or search term."
                : "Verified profiles will appear here automatically as soon as they are published."}
            </p>
            {partners.length ? <button type="button" onClick={resetFilters}>Clear all filters</button> : null}
          </div>
        )}
      </div>
    </section>
  );
}
