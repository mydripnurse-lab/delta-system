"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl";

import styles from "@/app/partner-admin/partnerAdmin.module.css";
import { CountyPartnerProspecting } from "@/components/partner-admin/CountyPartnerProspecting";
import type { AppointmentGeoPoint, AppointmentMapHistoryItem, AppointmentMapPerson, BusinessCoverageArea } from "@/lib/adminAppointmentAnalytics";

type CoverageBoundaryFeature = {
  type: "Feature";
  geometry: BusinessCoverageArea["geometry"];
  properties: { GEOID: string; STATE: string; NAME: string; BASENAME: string };
};

type CoverageBoundaryCollection = { type: "FeatureCollection"; features: CoverageBoundaryFeature[] };

export function AppointmentAnalyticsMap({ points, people, coverageAreas, coverageVisible, coverageGapsVisible }: { points: AppointmentGeoPoint[]; people: AppointmentMapPerson[]; coverageAreas: BusinessCoverageArea[]; coverageVisible: boolean; coverageGapsVisible: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [coverageBoundaries, setCoverageBoundaries] = useState<CoverageBoundaryCollection | null>(null);
  const [coverageGapsState, setCoverageGapsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [selectedKey, setSelectedKey] = useState("");
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim() || "";
  const styleUrl = process.env.NEXT_PUBLIC_MAPBOX_STYLE_URL?.trim() || "mapbox://styles/mapbox/light-v11";
  const selectedPoint = useMemo(() => points.find((point) => point.key === selectedKey) || null, [points, selectedKey]);
  const selectedPeople = useMemo(() => people.filter((person) => person.pointKeys.includes(selectedKey)), [people, selectedKey]);

  useEffect(() => {
    if (selectedKey && !points.some((point) => point.key === selectedKey)) setSelectedKey("");
  }, [points, selectedKey]);

  useEffect(() => {
    if (!token) { setState("missing"); return; }
    if (!containerRef.current) return;
    let cancelled = false;
    let map: MapboxMap | null = null;
    void import("mapbox-gl").then(({ default: mapboxgl }) => {
      if (cancelled || !containerRef.current) return;
      mapboxgl.accessToken = token;
      map = new mapboxgl.Map({ container: containerRef.current, style: styleUrl, center: [-98.5, 38.5], zoom: 3.1, minZoom: 2.2, cooperativeGestures: true });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
      map.on("load", () => {
        if (!map) return;
        map.addSource("business-coverage-gaps", { type: "geojson", data: emptyCoverageBoundaryCollection() });
        map.addLayer({ id: "business-coverage-gaps-fill", type: "fill", source: "business-coverage-gaps", layout: { visibility: "none" }, paint: { "fill-color": "#d37e63", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, .08, 7, .13, 11, .07] } });
        map.addLayer({ id: "business-coverage-gaps-outline", type: "line", source: "business-coverage-gaps", layout: { visibility: "none" }, paint: { "line-color": "#bb745f", "line-width": ["interpolate", ["linear"], ["zoom"], 2, .25, 8, .8], "line-opacity": .35 } });
        map.addSource("business-coverage", { type: "geojson", data: coverageFeatureCollection(coverageAreas) });
        map.addLayer({ id: "business-coverage-fill", type: "fill", source: "business-coverage", paint: { "fill-color": "#39b8a6", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 2, .11, 7, .18, 11, .1] } });
        map.addLayer({ id: "business-coverage-outline", type: "line", source: "business-coverage", paint: { "line-color": "#078596", "line-width": ["interpolate", ["linear"], ["zoom"], 2, .8, 8, 1.8], "line-opacity": .72 } });
        map.addSource("appointments", { type: "geojson", data: featureCollection(points), cluster: true, clusterRadius: 48, clusterMaxZoom: 7 });
        map.addLayer({ id: "appointment-clusters", type: "circle", source: "appointments", filter: ["has", "point_count"], paint: { "circle-color": ["step", ["get", "point_count"], "#19a89d", 5, "#087d88", 15, "#044c5c"], "circle-radius": ["step", ["get", "point_count"], 20, 5, 27, 15, 34], "circle-stroke-width": 4, "circle-stroke-color": "#fff" } });
        map.addLayer({ id: "appointment-cluster-label", type: "symbol", source: "appointments", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 12 }, paint: { "text-color": "#fff" } });
        map.addLayer({ id: "appointment-markets", type: "circle", source: "appointments", filter: ["!", ["has", "point_count"]], paint: { "circle-color": ["case", [">", ["get", "lost"], ["get", "total"]], "#d95455", ["interpolate", ["linear"], ["get", "completionRate"], 0, "#d95455", 50, "#e9a443", 100, "#16a077"]], "circle-radius": ["interpolate", ["linear"], ["get", "activity"], 1, 9, 10, 18, 50, 30], "circle-opacity": .92, "circle-stroke-width": 3, "circle-stroke-color": "#fff" } });
        map.addLayer({ id: "appointment-market-count", type: "symbol", source: "appointments", filter: ["!", ["has", "point_count"]], layout: { "text-field": ["to-string", ["get", "activity"]], "text-size": 10 }, paint: { "text-color": "#fff" } });
        map.on("click", "appointment-markets", (event) => {
          const feature = event.features?.[0] as unknown as { properties?: Record<string, unknown> } | undefined;
          const properties = feature?.properties;
          if (!properties) return;
          setSelectedKey(String(properties.key || ""));
        });
        map.on("mouseenter", "appointment-markets", () => { if (map) map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "appointment-markets", () => { if (map) map.getCanvas().style.cursor = ""; });
        setState("ready");
      });
    }).catch(() => setState("error"));
    return () => { cancelled = true; map?.remove(); mapRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, styleUrl]);

  useEffect(() => {
    if (!coverageGapsVisible || coverageBoundaries) return;
    const controller = new AbortController();
    setCoverageGapsState("loading");
    void fetch("/api/partner-admin/analytics/coverage-boundaries", { cache: "force-cache", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { ok?: boolean; boundaries?: CoverageBoundaryCollection; error?: string };
        if (!response.ok || !payload.ok || !payload.boundaries) throw new Error(payload.error || "Coverage boundaries are unavailable.");
        setCoverageBoundaries(payload.boundaries);
        setCoverageGapsState("ready");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof DOMException && loadError.name === "AbortError") return;
        setCoverageGapsState("error");
      });
    return () => controller.abort();
  }, [coverageBoundaries, coverageGapsVisible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    (map.getSource("appointments") as GeoJSONSource | undefined)?.setData(featureCollection(points));
    (map.getSource("business-coverage") as GeoJSONSource | undefined)?.setData(coverageFeatureCollection(coverageAreas));
    const geographicPoints = [...points, ...coverageAreas];
    if (!geographicPoints.length) return;
    const longitudes = geographicPoints.map((point) => point.longitude);
    const latitudes = geographicPoints.map((point) => point.latitude);
    map.fitBounds([[Math.min(...longitudes), Math.min(...latitudes)], [Math.max(...longitudes), Math.max(...latitudes)]], { padding: 56, maxZoom: 8, duration: 650 });
  }, [coverageAreas, points, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready" || !coverageBoundaries) return;
    (map.getSource("business-coverage-gaps") as GeoJSONSource | undefined)?.setData(coverageGapFeatureCollection(coverageBoundaries, coverageAreas));
  }, [coverageAreas, coverageBoundaries, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    const visibility = coverageVisible ? "visible" : "none";
    map.setLayoutProperty("business-coverage-fill", "visibility", visibility);
    map.setLayoutProperty("business-coverage-outline", "visibility", visibility);
  }, [coverageVisible, state]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || state !== "ready") return;
    const visibility = coverageGapsVisible && coverageGapsState === "ready" ? "visible" : "none";
    map.setLayoutProperty("business-coverage-gaps-fill", "visibility", visibility);
    map.setLayoutProperty("business-coverage-gaps-outline", "visibility", visibility);
  }, [coverageGapsState, coverageGapsVisible, state]);

  return <div className={styles.analyticsMapWrap}>
    <div ref={containerRef} className={styles.analyticsMap} />
    {state === "loading" ? <div className={styles.analyticsMapState}>Preparing the appointment map…</div> : null}
    {state === "missing" ? <div className={styles.analyticsMapState}><strong>Mapbox setup required</strong><span>Add `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` in Vercel to display the live map.</span></div> : null}
    {state === "error" ? <div className={styles.analyticsMapState}><strong>The map could not load</strong><span>The tables and geographic metrics remain available.</span></div> : null}
    {state === "ready" && coverageGapsVisible && coverageGapsState === "loading" ? <div className={styles.analyticsMapLayerState}>Loading USA &amp; Puerto Rico coverage gaps…</div> : null}
    {state === "ready" && coverageGapsVisible && coverageGapsState === "error" ? <div className={`${styles.analyticsMapLayerState} ${styles.analyticsMapLayerError}`}>Coverage gaps could not be loaded.</div> : null}
    {selectedPoint ? <section className={styles.analyticsLeadPanel} role="dialog" aria-modal="false" aria-label={`Patient activity for ${pointName(selectedPoint)}`}>
      <header>
        <div><span>Location activity</span><h3>{pointName(selectedPoint)}</h3><p>{selectedPoint.people} {selectedPoint.people === 1 ? "person" : "people"} · {selectedPoint.total} appointments · {selectedPoint.intents} booking attempts</p></div>
        <button type="button" onClick={() => setSelectedKey("")} aria-label="Close lead details">×</button>
      </header>
      <div className={styles.analyticsLeadPanelBody}>
      {selectedPeople.length ? <>
        <div className={styles.analyticsLeadPanelIntro}>
          <strong>{selectedPeople.length} {selectedPeople.length === 1 ? "patient record" : "patient records"} at this location</strong>
          <span>One marker represents this physical street address. Repeat visits, hotel rooms and suites remain grouped here while each record keeps its complete address.</span>
        </div>
        <div className={styles.analyticsLeadList}>
          {selectedPeople.map((person) => <article key={person.id} className={styles.analyticsLeadCard}>
            <span className={styles.analyticsCardSectionLabel}>Client information</span>
            <div className={styles.analyticsLeadIdentity}>
              <span aria-hidden="true">{initials(person.fullName)}</span>
              <div><strong>{person.fullName || "Unnamed patient"}</strong><small>{person.appointmentCount} appointments · {person.intentCount} attempts · {person.locations.length} {person.locations.length === 1 ? "address" : "addresses"}</small></div>
            </div>
            <dl className={styles.analyticsLeadDetails}>
              <div><dt>Email</dt><dd>{person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : "Not provided"}</dd></div>
              <div><dt>Phone</dt><dd>{person.phone ? <a href={`tel:${person.phone}`}>{person.phone}</a> : "Not provided"}</dd></div>
              <div><dt>Date of birth</dt><dd>{formatDate(person.dateOfBirth)}</dd></div>
              <div><dt>BMI reference</dt><dd>{person.bmi === null ? "Not available" : person.bmi.toFixed(1)}</dd></div>
              <div><dt>Height</dt><dd>{formatHeight(person.heightInches)}</dd></div>
              <div><dt>Weight</dt><dd>{formatWeight(person.weightPounds)}</dd></div>
              <div><dt>Completed visits</dt><dd>{person.completedCount}</dd></div>
            </dl>
            <section className={styles.analyticsPersonLocations} aria-label="Known service addresses">
              <span>Service addresses</span>
              {person.locations.map((location) => <p key={location.pointKey} data-current={location.pointKey === selectedKey}>{historyAddress(location)}{location.pointKey === selectedKey ? <b>Selected pin</b> : null}</p>)}
            </section>
            <details className={`${styles.analyticsDisclosure} ${styles.analyticsPersonHistory}`}>
              <summary className={styles.analyticsDisclosureSummary}>
                <span className={styles.analyticsDisclosureTitle}>
                  <strong>Service interest &amp; appointment history</strong>
                  <small>{person.history.length} {person.history.length === 1 ? "record" : "records"} · Newest first</small>
                </span>
                <span className={styles.analyticsDisclosureAction} aria-hidden="true">
                  <span className={styles.analyticsDisclosureShow}>Show all</span>
                  <span className={styles.analyticsDisclosureHide}>Hide</span>
                  <i />
                </span>
              </summary>
              <div className={styles.analyticsDisclosureContent}>
                {person.history.map((item) => <HistoryItem key={`${item.kind}:${item.id}`} item={item} />)}
              </div>
            </details>
          </article>)}
        </div>
      </> : <div className={styles.analyticsLeadEmpty}><strong>No patient history is attached to this point.</strong><span>Refresh the filters or choose another activity marker.</span></div>}
      {selectedPoint.county && selectedPoint.state ? <CountyPartnerProspecting county={selectedPoint.county} state={selectedPoint.state} /> : null}
      </div>
    </section> : null}
  </div>;
}

function featureCollection(points: AppointmentGeoPoint[]) {
  return { type: "FeatureCollection" as const, features: points.map((point) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [point.longitude, point.latitude] }, properties: point })) };
}

function coverageFeatureCollection(areas: BusinessCoverageArea[]) {
  return { type: "FeatureCollection" as const, features: areas.map((area) => ({ type: "Feature" as const, geometry: area.geometry, properties: { key: area.key, county: area.county, state: area.state, partnerCount: area.partnerCount, serviceCount: area.serviceCount } })) };
}

function emptyCoverageBoundaryCollection(): CoverageBoundaryCollection {
  return { type: "FeatureCollection", features: [] };
}

function coverageGapFeatureCollection(boundaries: CoverageBoundaryCollection, coveredAreas: BusinessCoverageArea[]): CoverageBoundaryCollection {
  const coveredKeys = new Set(coveredAreas.map((area) => `${stateFips(area.state)}|${normalizeCounty(area.county)}`));
  return {
    type: "FeatureCollection",
    features: boundaries.features.filter((feature) => !coveredKeys.has(`${feature.properties.STATE}|${normalizeCounty(feature.properties.BASENAME || feature.properties.NAME)}`)),
  };
}

function normalizeCounty(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(county|parish|borough|municipio|municipality|census area)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function stateFips(value: string) {
  return STATE_FIPS[value.trim().toLowerCase()] || "";
}

const STATE_FIPS: Record<string, string> = {
  alabama: "01", alaska: "02", arizona: "04", arkansas: "05", california: "06", colorado: "08", connecticut: "09", delaware: "10", "district of columbia": "11", florida: "12", georgia: "13", hawaii: "15", idaho: "16", illinois: "17", indiana: "18", iowa: "19", kansas: "20", kentucky: "21", louisiana: "22", maine: "23", maryland: "24", massachusetts: "25", michigan: "26", minnesota: "27", mississippi: "28", missouri: "29", montana: "30", nebraska: "31", nevada: "32", "new hampshire": "33", "new jersey": "34", "new mexico": "35", "new york": "36", "north carolina": "37", "north dakota": "38", ohio: "39", oklahoma: "40", oregon: "41", pennsylvania: "42", "rhode island": "44", "south carolina": "45", "south dakota": "46", tennessee: "47", texas: "48", utah: "49", vermont: "50", virginia: "51", washington: "53", "west virginia": "54", wisconsin: "55", wyoming: "56", "puerto rico": "72",
};

function HistoryItem({ item }: { item: AppointmentMapHistoryItem }) {
  const assessment = item.lossReason ? lossReason(item) : null;
  return <article className={styles.analyticsHistoryItem} data-kind={item.kind}>
    <header>
      <div><span>{item.kind === "appointment" ? "Appointment" : "Booking attempt"}</span><strong>{item.service || "Service not captured"}</strong></div>
      <b data-status={item.status}>{statusLabel(item.status)}</b>
    </header>
    <p>{formatDateTime(item.requestedDate || item.createdAt)}{item.timezone ? ` · ${item.timezone}` : ""}</p>
    <small>{historyAddress(item)}</small>
    <dl>
      {item.reference ? <div><dt>Reference</dt><dd>{item.reference}</dd></div> : null}
      {item.servicePrice > 0 ? <div><dt>Service value</dt><dd>{money(item.servicePrice, item.currency)}</dd></div> : null}
      <div><dt>Patients</dt><dd>{1 + item.additionalPatientsCount}</dd></div>
      {item.partnerName || item.requestedPartnerName ? <div><dt>Partner</dt><dd>{item.partnerName || item.requestedPartnerName}</dd></div> : null}
    </dl>
    {assessment ? <div className={styles.analyticsLeadAssessment}><span>Outcome details</span><strong>{assessment.title}</strong><p>{assessment.detail}</p></div> : null}
    {item.kind === "intent" ? <div className={styles.analyticsLeadCoverage}>
      <div data-covered={captureCoverageState(item)}><span>At capture</span><strong>{captureCoverageLabel(item)}</strong></div>
      <div data-covered={item.currentCoverageAvailable ? "yes" : "no"}><span>Coverage now</span><strong>{item.currentCoverageAvailable ? `${item.currentCoveredPartnerCount} matching ${item.currentCoveredPartnerCount === 1 ? "Partner" : "Partners"}` : "Coverage gap"}</strong></div>
      <div data-covered={item.currentCoveredPartnerCount === 0 ? "unknown" : item.currentActivatedPartnerCount > 0 ? "yes" : "no"}><span>Account now</span><strong>{item.currentActivatedPartnerCount > 0 ? `${item.currentActivatedPartnerCount} activated` : item.currentCoveredPartnerCount > 0 ? "Activation pending" : "No Partner"}</strong></div>
      <div data-covered={item.currentActivatedPartnerCount === 0 ? "unknown" : item.currentScheduleReadyPartnerCount > 0 ? "yes" : "no"}><span>Availability now</span><strong>{item.currentScheduleReadyPartnerCount > 0 ? `${item.currentScheduleReadyPartnerCount} schedule-ready` : item.currentActivatedPartnerCount > 0 ? "Not configured" : "Waiting for activation"}</strong></div>
    </div> : null}
    {item.sourceUrl ? <a className={styles.analyticsHistorySource} href={item.sourceUrl} target="_blank" rel="noreferrer">Source: {sourceName(item.sourceUrl)} ↗</a> : null}
  </article>;
}

function captureCoverageState(lead: AppointmentMapHistoryItem) {
  if (lead.lossReason === "no_coverage") return "no";
  if (lead.lossReason === "no_availability" || lead.lossReason === "booking_not_completed" || lead.coverageAtCapture === true) return "yes";
  return "unknown";
}

function captureCoverageLabel(lead: AppointmentMapHistoryItem) {
  const state = captureCoverageState(lead);
  if (state === "yes") return "Coverage found";
  if (state === "no") return "No coverage";
  return "Not distinguishable";
}

function lossReason(lead: AppointmentMapHistoryItem) {
  if (lead.lossReason === "no_coverage") return { title: "No service coverage", detail: "No active Partner covered this service and location when availability was checked." };
  if (lead.lossReason === "no_availability") return { title: "No appointment times", detail: "The area was covered, but no Partner had an open time on the requested date." };
  if (lead.lossReason === "screening") return { title: "Screening required review", detail: "One or more screening answers prevented online booking from continuing." };
  if (lead.lossReason === "booking_not_completed") return { title: "Booking was not completed", detail: "Coverage and appointment options were available, but the booking was not finalized." };
  if (lead.lossReason === "coverage_or_availability") {
    if (lead.currentCoveredPartnerCount === 0) return { title: "Coverage gap today", detail: "This earlier event predates detailed diagnostics. A current check finds no matching Partner for this service and location." };
    if (lead.currentActivatedPartnerCount === 0) return { title: "Partner activation pending now", detail: "Coverage exists today, but the matching Partner has not activated their Portal account. The original event cannot safely confirm whether this was also true at capture." };
    if (lead.currentScheduleReadyPartnerCount === 0) return { title: "Partner availability not configured now", detail: "Coverage and an activated account exist today, but no matching Partner has saved working hours for this service. The original event predates detailed diagnostics." };
    return { title: "Historical availability unavailable", detail: "The original event predates detailed diagnostics. Coverage, account activation and weekly availability are ready now." };
  }
  return { title: "Reason not captured", detail: "This earlier lead predates operational diagnostics. Contact and service details remain available for follow-up." };
}

function pointName(point: AppointmentGeoPoint) {
  return [point.addressLine1, point.city || point.county, point.state].filter(Boolean).join(", ");
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "L";
}

function formatDate(value: string) {
  if (!value) return "Not provided";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function formatHeight(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "Not provided";
  const feet = Math.floor(value / 12);
  const inches = Math.round(value - feet * 12);
  return `${feet} ft ${inches} in`;
}

function formatWeight(value: number | null) {
  if (value === null || !Number.isFinite(value) || value <= 0) return "Not provided";
  return `${Math.round(value)} lb`;
}

function formatDateTime(value: string) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(parsed);
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 }).format(value);
}

function historyAddress(value: { addressLine1: string; addressLine2: string; city: string; county: string; state: string; postalCode: string }) {
  return [value.addressLine1, value.addressLine2, value.city, value.county, value.state, value.postalCode].filter(Boolean).join(", ") || "Location not provided";
}

function statusLabel(value: string) {
  const labels: Record<string, string> = {
    payment_pending: "Payment pending",
    confirmed: "Confirmed",
    partner_acknowledged: "Partner accepted",
    in_progress: "In progress",
    completed: "Completed",
    partner_declined: "Partner declined",
    cancelled: "Cancelled",
    refunded: "Refunded",
    failed: "Failed",
    lost_opportunity: "Not booked",
    converted: "Converted",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function sourceName(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return value; }
}
