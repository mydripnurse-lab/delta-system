"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DirectoryPartner } from "./PartnerDirectoryClient";
import styles from "./MapboxPartnerMap.module.css";

type CoverageItem = {
  partner: DirectoryPartner;
  coverage: DirectoryPartner["countyCoverages"][number];
};

type Props = {
  coverages: CoverageItem[];
  selectedPointKey: string;
  onSelect: (partnerId: string, pointKey: string) => void;
};

type MapboxMap = {
  easeTo: (options: Record<string, unknown>) => void;
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: unknown) => void;
  getSource: (id: string) => { setData: (data: unknown) => void } | undefined;
  addLayer: (layer: unknown) => void;
  on: (event: string, layerOrHandler: string | (() => void), handler?: (event: MapboxEvent) => void) => void;
  off: {
    (event: string, layer: string, handler: (event: MapboxEvent) => void): void;
    (event: string, handler: () => void): void;
  };
  fitBounds: (bounds: [[number, number], [number, number]], options?: Record<string, unknown>) => void;
  resize: () => void;
  remove: () => void;
  getCanvas: () => { style: { cursor: string } };
  getZoom: () => number;
};

type MapboxMarker = {
  setLngLat: (coordinates: [number, number]) => MapboxMarker;
  addTo: (map: MapboxMap) => MapboxMarker;
  remove: () => void;
  getElement: () => HTMLElement;
};

type MapboxEvent = {
  features?: Array<{ properties?: Record<string, unknown> }>;
  point?: { x: number; y: number };
  lngLat?: { lng: number; lat: number };
};

declare global {
  interface Window {
    mapboxgl?: {
      Map: new (options: Record<string, unknown>) => MapboxMap;
      Marker: new (options?: { element?: HTMLElement; anchor?: string }) => MapboxMarker;
      NavigationControl: new (options?: Record<string, unknown>) => unknown;
      accessToken?: string;
    };
  }
}

const MAPBOX_SCRIPT_ID = "my-drip-nurse-mapbox-gl";
const MAPBOX_STYLE_ID = "my-drip-nurse-mapbox-style";
const MAPBOX_SCRIPT_URL = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.js";
const MAPBOX_STYLE_URL = "https://api.mapbox.com/mapbox-gl-js/v3.15.0/mapbox-gl.css";
const COUNTY_MARKER_MIN_ZOOM = 4.25;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function countyKey(item: CoverageItem) {
  return `${item.coverage.state}:${item.coverage.county}`.toLowerCase();
}

type Coordinate = [number, number];

function hashValue(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number) {
  let value = seed || 1;
  return () => {
    value = Math.imul(value ^ (value >>> 15), 1 | value);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInRing([x, y]: Coordinate, ring: number[][]) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentX, currentY] = ring[current] || [];
    const [previousX, previousY] = ring[previous] || [];
    const crosses = (currentY > y) !== (previousY > y)
      && x < ((previousX - currentX) * (y - currentY)) / ((previousY - currentY) || Number.EPSILON) + currentX;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: Coordinate, geometry: CoverageItem["coverage"]["geometry"]) {
  const polygons = geometry.type === "Polygon"
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons.some((polygon) => {
    const outer = polygon[0];
    if (!outer || !pointInRing(point, outer)) return false;
    return !polygon.slice(1).some((hole) => pointInRing(point, hole));
  });
}

function geometryBounds(geometry: CoverageItem["coverage"]["geometry"]) {
  const coordinates: number[][] = [];
  const collect = (value: unknown) => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") coordinates.push(value as number[]);
    else value.forEach(collect);
  };
  collect(geometry.coordinates);
  return {
    minX: Math.min(...coordinates.map((point) => point[0])),
    maxX: Math.max(...coordinates.map((point) => point[0])),
    minY: Math.min(...coordinates.map((point) => point[1])),
    maxY: Math.max(...coordinates.map((point) => point[1])),
  };
}

function distributeCountyAvatars(group: { key: string; coverage: CoverageItem["coverage"]; partners: DirectoryPartner[] }) {
  const bounds = geometryBounds(group.coverage.geometry);
  const width = Math.max(bounds.maxX - bounds.minX, .001);
  const height = Math.max(bounds.maxY - bounds.minY, .001);
  const selected: Coordinate[] = [];
  return [...group.partners].sort((a, b) => a.id.localeCompare(b.id)).map((partner, partnerIndex) => {
    if (group.partners.length === 1) {
      const center: Coordinate = [group.coverage.longitude, group.coverage.latitude];
      selected.push(center);
      return { partner, coordinates: center };
    }
    const random = seededUnit(hashValue(`${group.key}:${partner.id}`));
    const candidates: Coordinate[] = [];
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const candidate: Coordinate = [bounds.minX + random() * width, bounds.minY + random() * height];
      if (pointInGeometry(candidate, group.coverage.geometry)) candidates.push(candidate);
    }
    const fallback: Coordinate = [group.coverage.longitude, group.coverage.latitude];
    const choice = !selected.length
      ? candidates[Math.floor(random() * candidates.length)] || fallback
      : candidates.reduce((best, candidate) => {
          const distance = Math.min(...selected.map((placed) => {
            const x = (candidate[0] - placed[0]) / width;
            const y = (candidate[1] - placed[1]) / height;
            return x * x + y * y;
          }));
          return distance > best.distance ? { point: candidate, distance } : best;
        }, { point: fallback, distance: -1 }).point;
    selected.push(choice);
    return { partner, coordinates: choice, order: partnerIndex };
  });
}

function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);

  const existingScript = document.getElementById(MAPBOX_SCRIPT_ID) as HTMLScriptElement | null;
  if (existingScript) {
    return new Promise<typeof window.mapboxgl>((resolve, reject) => {
      existingScript.addEventListener("load", () => resolve(window.mapboxgl));
      existingScript.addEventListener("error", () => reject(new Error("Mapbox could not be loaded.")));
    });
  }

  const stylesheet = document.createElement("link");
  stylesheet.id = MAPBOX_STYLE_ID;
  stylesheet.rel = "stylesheet";
  stylesheet.href = MAPBOX_STYLE_URL;
  document.head.appendChild(stylesheet);

  return new Promise<typeof window.mapboxgl>((resolve, reject) => {
    const script = document.createElement("script");
    script.id = MAPBOX_SCRIPT_ID;
    script.async = true;
    script.src = MAPBOX_SCRIPT_URL;
    script.onload = () => resolve(window.mapboxgl);
    script.onerror = () => reject(new Error("Mapbox could not be loaded."));
    document.head.appendChild(script);
  });
}

export default function MapboxPartnerMap({ coverages, selectedPointKey, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const avatarMarkersRef = useRef<Map<string, MapboxMarker>>(new Map());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
  const styleUrl =
    process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim() ||
    "mapbox://styles/mapbox/light-v11";

  const groupedCoverages = useMemo(() => {
    const groups = new Map<string, { key: string; coverage: CoverageItem["coverage"]; partners: DirectoryPartner[] }>();
    coverages.forEach((item) => {
      const key = countyKey(item);
      const existing = groups.get(key);
      if (existing) {
        if (!existing.partners.some((partner) => partner.id === item.partner.id)) existing.partners.push(item.partner);
      } else {
        groups.set(key, { key, coverage: item.coverage, partners: [item.partner] });
      }
    });
    return [...groups.values()];
  }, [coverages]);

  const countyGeoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: groupedCoverages.map((group) => ({
        type: "Feature",
        geometry: group.coverage.geometry,
        properties: {
          coverageKey: group.key,
          partnerId: group.partners[0]?.id || "",
          pointKey: `${group.partners[0]?.id || ""}:county:${group.key}`,
          county: group.coverage.county,
          state: group.coverage.state,
          partnerCount: group.partners.length,
          selected: selectedPointKey.includes(`:county:${group.key}`),
        },
      })),
    }),
    [groupedCoverages, selectedPointKey],
  );

  const countyAvatars = useMemo(
    () => groupedCoverages.flatMap((group) => distributeCountyAvatars(group).map((avatar) => ({ ...avatar, group }))),
    [groupedCoverages],
  );

  useEffect(() => {
    if (!token) {
      setLoadState("missing");
      return;
    }
    let cancelled = false;
    let map: MapboxMap | null = null;

    loadMapbox()
      .then((mapbox) => {
        if (cancelled || !mapbox || !containerRef.current) return;
        mapbox.accessToken = token;
        map = new mapbox.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [-98.5, 38.7],
          zoom: 3.1,
          minZoom: 2,
          maxZoom: 14,
          attributionControl: true,
          cooperativeGestures: true,
        });
        mapRef.current = map;
        map.addControl(new mapbox.NavigationControl({ showCompass: true, visualizePitch: false }), "top-right");

        map.on("load", () => {
          if (!map) return;
          map.addSource("partner-counties", {
            type: "geojson",
            data: countyGeoJson,
          });
          map.addLayer({
            id: "partner-county-coverage",
            type: "fill",
            source: "partner-counties",
            paint: {
              "fill-color": ["case", ["==", ["get", "selected"], true], "#078596", "#49b9aa"],
              "fill-opacity": ["interpolate", ["linear"], ["zoom"], 3, 0.13, 7, 0.2, 11, 0.12],
            },
          });
          map.addLayer({
            id: "partner-county-outline",
            type: "line",
            source: "partner-counties",
            paint: {
              "line-color": ["case", ["==", ["get", "selected"], true], "#075c68", "#239f92"],
              "line-width": ["case", ["==", ["get", "selected"], true], 2.5, 1.25],
              "line-opacity": 0.78,
            },
          });
          const handleCountyClick = (event: MapboxEvent) => {
            const feature = event.features?.[0];
            const partnerId = String(feature?.properties?.partnerId || "");
            const selectedKey = String(feature?.properties?.pointKey || "");
            if (partnerId && selectedKey) onSelect(partnerId, selectedKey);
          };
          map.on("click", "partner-county-coverage", handleCountyClick);
          setLoadState("ready");
        });
      })
      .catch(() => setLoadState("error"));

    return () => {
      cancelled = true;
      avatarMarkersRef.current.forEach((marker) => marker.remove());
      avatarMarkersRef.current.clear();
      map?.remove();
      mapRef.current = null;
    };
    // The map instance is intentionally created once. Data updates use setData below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    const mapbox = window.mapboxgl;
    if (!map || !mapbox?.Marker || loadState !== "ready") return;

    const activeKeys = new Set<string>();
    const setMarkerVisibility = () => {
      const visible = map.getZoom() >= COUNTY_MARKER_MIN_ZOOM;
      avatarMarkersRef.current.forEach((marker) => {
        marker.getElement().style.visibility = visible ? "visible" : "hidden";
      });
    };

    countyAvatars.forEach(({ group, partner, coordinates }) => {
      const key = `${group.key}:${partner.id}`;
      activeKeys.add(key);
      let marker = avatarMarkersRef.current.get(key);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = styles.countyPartnerMarker;
        button.setAttribute(
          "aria-label",
          `${partner.displayName}, covering ${group.coverage.county}, ${group.coverage.state}`,
        );
        const body = document.createElement("span");
        body.className = styles.countyPartnerAvatar;
        button.appendChild(body);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelect(partner.id, `${partner.id}:county:${group.key}`);
        });
        marker = new mapbox.Marker({ element: button, anchor: "center" })
          .setLngLat(coordinates)
          .addTo(map);
        avatarMarkersRef.current.set(key, marker);
      } else {
        marker.setLngLat(coordinates);
      }

      const element = marker.getElement();
      const body = element.firstElementChild as HTMLElement | null;
      if (!body) return;
      body.classList.toggle(styles.countyPartnerAvatarSelected, selectedPointKey === `${partner.id}:county:${group.key}`);
      const signature = `${partner.id}:${partner.profilePhotoUrl}`;
      if (element.dataset.avatarUrl !== signature) {
        element.dataset.avatarUrl = signature;
        body.replaceChildren();
        const imageUrl = partner.profilePhotoUrl.trim();
        if (imageUrl) {
          const image = document.createElement("img");
          image.src = imageUrl;
          image.alt = "";
          image.loading = "lazy";
          image.addEventListener("error", () => {
            image.remove();
            const fallback = document.createElement("span");
            fallback.className = styles.countyPartnerInitials;
            fallback.textContent = initials(partner.displayName);
            body.appendChild(fallback);
          });
          body.appendChild(image);
        } else {
          const fallback = document.createElement("span");
          fallback.className = styles.countyPartnerInitials;
          fallback.textContent = initials(partner.displayName);
          body.appendChild(fallback);
        }
      }
    });

    avatarMarkersRef.current.forEach((marker, key) => {
      if (!activeKeys.has(key)) {
        marker.remove();
        avatarMarkersRef.current.delete(key);
      }
    });

    map.on("zoom", setMarkerVisibility);
    setMarkerVisibility();
    return () => map.off("zoom", setMarkerVisibility);
  }, [countyAvatars, loadState, onSelect, selectedPointKey]);

  useEffect(() => {
    const source = mapRef.current?.getSource("partner-counties");
    if (source) source.setData(countyGeoJson);
  }, [countyGeoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !groupedCoverages.length || loadState !== "ready") return;
    const longitudes = groupedCoverages.map(({ coverage }) => coverage.longitude);
    const latitudes = groupedCoverages.map(({ coverage }) => coverage.latitude);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ];
    map.fitBounds(bounds, { padding: 78, maxZoom: 9, duration: 850 });
  }, [groupedCoverages, loadState]);

  const setupMessage = loadState === "missing"
    ? "Add a public Mapbox access token to activate the live map."
    : loadState === "error"
      ? "The live map could not load right now. Please refresh and try again."
      : "Loading the live partner map…";

  return (
    <div className={styles.mapPanel} aria-label="Interactive Mapbox map of My Drip Nurse Partners">
      <div ref={containerRef} className={styles.mapCanvas} />
      {loadState !== "ready" ? (
        <div className={styles.mapState} role="status">
          <span className={styles.mapStateIcon}>⌖</span>
          <strong>{loadState === "missing" ? "Mapbox setup needed" : "Preparing the live map"}</strong>
          <p>{setupMessage}</p>
        </div>
      ) : null}
      <div className={styles.mapBadge}><span /> Live partner coverage</div>
      <div className={styles.mapSummary}>
        <strong>{groupedCoverages.length}</strong>
        <span>{groupedCoverages.length === 1 ? "covered county" : "covered counties"}</span>
      </div>
      <div className={styles.mapLegend}>
        <span><i className={styles.legendPoint} /> Coverage area</span>
        <span><i className={styles.legendCluster} /> Partner team</span>
      </div>
    </div>
  );
}
