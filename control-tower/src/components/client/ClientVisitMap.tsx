"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapboxMap, Marker as MapboxMarker } from "mapbox-gl";

import styles from "@/app/client-portal/clientPortal.module.css";

type VisitMapProps = {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  markerImageUrl?: string;
  markerLabel?: string;
  showDirections?: boolean;
};

export default function ClientVisitMap({ addressLine1, addressLine2 = "", city, state, postalCode, markerImageUrl, markerLabel, showDirections = false }: VisitMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<MapboxMarker | null>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const hasMarkerImage = Boolean(markerImageUrl?.trim());
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
  const styleUrl = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim() || "mapbox://styles/mapbox/light-v11";
  const address = useMemo(() => [addressLine1, addressLine2, city, state, postalCode].filter(Boolean).join(", "), [addressLine1, addressLine2, city, state, postalCode]);

  useEffect(() => {
    if (!token || !address) { setMapState("missing"); return; }
    if (!containerRef.current) return;
    const controller = new AbortController();
    let cancelled = false;
    let map: MapboxMap | null = null;
    void fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?autocomplete=false&limit=1&types=address,place,postcode&country=us,pr&access_token=${encodeURIComponent(token)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("The visit address could not be located.");
        return response.json() as Promise<{ features?: Array<{ center?: [number, number] }> }>;
      })
      .then(async (payload) => {
        const center = payload.features?.[0]?.center;
        if (!center || cancelled || !containerRef.current) throw new Error("The visit address could not be located.");
        const { default: mapboxgl } = await import("mapbox-gl");
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = token;
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleUrl,
          center,
          zoom: 12.8,
          attributionControl: false,
          cooperativeGestures: true,
        });
        mapRef.current = map;
        const markerElement = document.createElement("span");
        markerElement.className = styles.visitMapMarker;
        markerElement.setAttribute("aria-label", markerLabel || "Appointment location");
        if (markerImageUrl) {
          markerElement.classList.add(styles.visitMapMarkerImageWrap);
          markerElement.innerHTML = "";
          const imageElement = document.createElement("img");
          imageElement.src = markerImageUrl;
          imageElement.alt = markerLabel || "Appointment service marker";
          markerElement.appendChild(imageElement);
          markerRef.current = new mapboxgl.Marker({ element: markerElement }).setLngLat(center).addTo(map);
        } else {
          markerRef.current = new mapboxgl.Marker({ element: markerElement }).setLngLat(center).addTo(map);
        }
        map.on("load", () => setMapState("ready"));
        map.on("error", () => setMapState((current) => current === "ready" ? current : "error"));
      })
      .catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setMapState("error");
      });
    return () => {
      cancelled = true;
      controller.abort();
      markerRef.current?.remove();
      markerRef.current = null;
      map?.remove();
      mapRef.current = null;
    };
  }, [address, markerImageUrl, markerLabel, styleUrl, token]);

  return (
    <div className={styles.visitMapCard}>
      <div ref={containerRef} className={styles.visitMapCanvas} aria-label="Map of the appointment location" />
      {mapState !== "ready" ? <div className={styles.visitMapFallback}>
        <span aria-hidden="true">⌖</span>
        <strong>{mapState === "loading" ? "Preparing your visit map…" : "Your service location"}</strong>
        {hasMarkerImage ? <span className={styles.visitMapFallbackMarker} aria-hidden="true">
          <img src={markerImageUrl} alt={markerLabel || "Appointment service"} />
        </span> : null}
        <small>{address}</small>
      </div> : null}
      {showDirections ? (
        <div className={styles.visitMapOverlay}>
          <span className={styles.mapSignal}><i />Service location</span>
        </div>
      ) : null}
    </div>
  );
}
