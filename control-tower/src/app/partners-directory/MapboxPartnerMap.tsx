"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DirectoryPartner } from "./PartnerDirectoryClient";
import styles from "./MapboxPartnerMap.module.css";

type MapPoint = {
  partner: DirectoryPartner;
  point: {
    latitude: number;
    longitude: number;
    city?: string;
    county: string;
    state: string;
    locationId: string;
  };
};

type Props = {
  points: MapPoint[];
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
const CLUSTER_MAX_ZOOM = 8;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function pointKey({ partner, point }: MapPoint) {
  return `${partner.id}:${point.locationId}:${point.city || point.county}:${point.latitude.toFixed(4)}:${point.longitude.toFixed(4)}`;
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

export default function MapboxPartnerMap({ points, selectedPointKey, onSelect }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const avatarMarkersRef = useRef<Map<string, MapboxMarker>>(new Map());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
  const styleUrl =
    process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim() ||
    "mapbox://styles/mapbox/light-v11";

  const geoJson = useMemo(
    () => ({
      type: "FeatureCollection",
      features: points.map((item) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [item.point.longitude, item.point.latitude] },
        properties: {
          pointKey: pointKey(item),
          partnerId: item.partner.id,
          displayName: item.partner.displayName,
          initials: initials(item.partner.displayName),
          locationLabel: item.point.city
            ? `${item.point.city}, ${item.point.state}`
            : `${item.point.county}, ${item.point.state}`,
          selected: pointKey(item) === selectedPointKey,
        },
      })),
    }),
    [points, selectedPointKey],
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
          map.addSource("partner-network", {
            type: "geojson",
            data: geoJson,
            cluster: true,
            clusterMaxZoom: CLUSTER_MAX_ZOOM,
            clusterRadius: 44,
          });
          map.addLayer({
            id: "partner-clusters",
            type: "circle",
            source: "partner-network",
            filter: ["has", "point_count"],
            paint: {
              "circle-color": ["step", ["get", "point_count"], "#42bba8", 5, "#188e8d", 12, "#075c68"],
              "circle-radius": ["step", ["get", "point_count"], 21, 5, 27, 12, 33],
              "circle-stroke-width": 4,
              "circle-stroke-color": "#ffffff",
              "circle-opacity": 0.96,
            },
          });
          map.addLayer({
            id: "partner-cluster-count",
            type: "symbol",
            source: "partner-network",
            filter: ["has", "point_count"],
            layout: {
              "text-field": ["get", "point_count_abbreviated"],
              "text-size": 13,
              "text-font": ["DIN Pro Medium", "Arial Unicode MS Bold"],
            },
            paint: { "text-color": "#ffffff" },
          });
          const handleClusterClick = (event: MapboxEvent) => {
            const feature = event.features?.[0];
            const clusterId = feature?.properties?.cluster_id;
            if (clusterId === undefined || !map) return;
            const source = map.getSource("partner-network") as unknown as {
              getClusterExpansionZoom?: (id: number, callback: (error: Error | null, zoom?: number) => void) => void;
            };
            source.getClusterExpansionZoom?.(Number(clusterId), (error, zoom) => {
              if (!error && zoom && event.lngLat) {
                map?.easeTo({ center: [event.lngLat.lng, event.lngLat.lat], zoom, duration: 520 });
              }
            });
          };
          map.on("click", "partner-clusters", handleClusterClick);
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
      const visible = map.getZoom() > CLUSTER_MAX_ZOOM;
      avatarMarkersRef.current.forEach((marker) => {
        marker.getElement().style.visibility = visible ? "visible" : "hidden";
      });
    };

    points.forEach((item) => {
      const key = pointKey(item);
      activeKeys.add(key);
      let marker = avatarMarkersRef.current.get(key);
      if (!marker) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = styles.avatarMarker;
        button.setAttribute(
          "aria-label",
          `${item.partner.displayName} coverage in ${item.point.city || item.point.county}, ${item.point.state}`,
        );
        const body = document.createElement("span");
        body.className = styles.avatarMarkerBody;
        button.appendChild(body);
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelect(item.partner.id, key);
        });
        marker = new mapbox.Marker({ element: button, anchor: "center" })
          .setLngLat([item.point.longitude, item.point.latitude])
          .addTo(map);
        avatarMarkersRef.current.set(key, marker);
      } else {
        marker.setLngLat([item.point.longitude, item.point.latitude]);
      }

      const element = marker.getElement();
      const body = element.firstElementChild as HTMLElement | null;
      if (!body) return;
      body.classList.toggle(styles.avatarMarkerSelected, pointKey(item) === selectedPointKey);
      const imageUrl = item.partner.profilePhotoUrl.trim();
      if (element.dataset.avatarUrl !== imageUrl) {
        element.dataset.avatarUrl = imageUrl;
        body.replaceChildren();
        if (imageUrl) {
          const image = document.createElement("img");
          image.src = imageUrl;
          image.alt = "";
          image.loading = "lazy";
          image.addEventListener("error", () => {
            image.remove();
            const fallback = document.createElement("span");
            fallback.className = styles.avatarMarkerInitials;
            fallback.textContent = initials(item.partner.displayName);
            body.appendChild(fallback);
          });
          body.appendChild(image);
        } else {
          const fallback = document.createElement("span");
          fallback.className = styles.avatarMarkerInitials;
          fallback.textContent = initials(item.partner.displayName);
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
  }, [loadState, onSelect, points, selectedPointKey]);

  useEffect(() => {
    const source = mapRef.current?.getSource("partner-network");
    if (source) source.setData(geoJson);
  }, [geoJson]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !points.length || loadState !== "ready") return;
    const longitudes = points.map(({ point }) => point.longitude);
    const latitudes = points.map(({ point }) => point.latitude);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...longitudes), Math.min(...latitudes)],
      [Math.max(...longitudes), Math.max(...latitudes)],
    ];
    map.fitBounds(bounds, { padding: 78, maxZoom: 9, duration: 850 });
  }, [loadState, points]);

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
        <strong>{points.length}</strong>
        <span>{points.length === 1 ? "coverage point" : "coverage points"}</span>
      </div>
      <div className={styles.mapLegend}>
        <span><i className={styles.legendPoint} /> Partner location</span>
        <span><i className={styles.legendCluster} /> Multiple locations</span>
      </div>
    </div>
  );
}
