"use client";

import { useEffect, useRef } from "react";

import styles from "./partnerPortal.module.css";

export type AppointmentMapRoute = {
  origin: [number, number];
  destination: [number, number];
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
};

type Props = {
  accessToken: string;
  route: AppointmentMapRoute;
  onUnavailable: () => void;
};

export default function AppointmentOfferMap({ accessToken, route, onUnavailable }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let map: import("mapbox-gl").Map | null = null;
    let loadTimer: number | null = null;

    void (async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;
        if (!active || !containerRef.current) return;
        mapboxgl.accessToken = accessToken;
        map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: route.origin,
          zoom: 10,
          interactive: false,
          attributionControl: false,
          logoPosition: "bottom-left",
        });

        loadTimer = window.setTimeout(() => {
          if (active && !map?.loaded()) onUnavailable();
        }, 10_000);

        map.once("load", () => {
          if (!active || !map) return;
          if (loadTimer !== null) window.clearTimeout(loadTimer);
          map.addSource("appointment-route", {
            type: "geojson",
            data: { type: "Feature", properties: {}, geometry: route.geometry },
          });
          map.addLayer({
            id: "appointment-route-outline",
            type: "line",
            source: "appointment-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "rgba(8, 52, 58, .3)", "line-width": 9 },
          });
          map.addLayer({
            id: "appointment-route-line",
            type: "line",
            source: "appointment-route",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: { "line-color": "#087985", "line-width": 5 },
          });

          const originMarker = document.createElement("span");
          originMarker.className = styles.offerMapOriginMarker;
          originMarker.setAttribute("aria-label", "Your location");
          new mapboxgl.Marker({ element: originMarker, anchor: "center" }).setLngLat(route.origin).addTo(map);

          const destinationMarker = document.createElement("span");
          destinationMarker.className = styles.offerMapDestinationMarker;
          destinationMarker.setAttribute("aria-label", "Appointment location");
          new mapboxgl.Marker({ element: destinationMarker, anchor: "bottom" }).setLngLat(route.destination).addTo(map);

          const bounds = new mapboxgl.LngLatBounds();
          route.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate));
          map.fitBounds(bounds, { padding: { top: 46, right: 46, bottom: 76, left: 46 }, duration: 0, maxZoom: 13 });
        });
      } catch {
        if (active) onUnavailable();
      }
    })();

    return () => {
      active = false;
      if (loadTimer !== null) window.clearTimeout(loadTimer);
      map?.remove();
    };
  }, [accessToken, onUnavailable, route]);

  return <div ref={containerRef} className={styles.offerRealMap} aria-label="Driving route from your location to the appointment" />;
}
