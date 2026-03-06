import { NextResponse } from "next/server";
import { getDbPool } from "@/lib/db";
import { requireTenantPermission } from "@/lib/authz";
import { getTenantIntegration } from "@/lib/tenantIntegrations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const PROVIDER = "custom";
const SCOPE = "module";
const BUILDER_MODULE = "solar_survey_builder";
const PUBLISH_MODULE = "solar_survey_publish";
const FILES_MODULE = "search_builder_files";
const BUILDER_KEY = "config_v1";
const PUBLISH_KEY = "default";
const SEARCH_EMBEDDED_HOST = "search-embedded.telahagocrecer.com";

type PublishManifest = {
  tenantId: string;
  folder: string;
  fileName: string;
  host: string;
  url: string;
  generatedAt: string;
};

function s(v: unknown) {
  return String(v ?? "").trim();
}

function esc(v: unknown) {
  return s(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kebabToken(input: string) {
  return s(input)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeColor(input: unknown, fallback: string) {
  const raw = s(input).toLowerCase();
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(raw)) return raw;
  return fallback;
}

function normalizeNum(input: unknown, fallback: number, min: number, max: number) {
  const n = Number(input);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeButtonPosition(input: unknown): "left" | "center" | "right" {
  const v = s(input).toLowerCase();
  if (v === "left" || v === "right") return v;
  return "center";
}

function normalizeBuilder(input: Record<string, unknown> | null | undefined) {
  return {
    folder: kebabToken(s(input?.folder) || "solar-survey") || "solar-survey",
    pageSlug: kebabToken(s(input?.pageSlug) || "solar-survey-widget") || "solar-survey-widget",
    query: s(input?.query) || "embed=1",
    buttonText: s(input?.buttonText) || "Get Solar Estimate",
    buttonPosition: normalizeButtonPosition(input?.buttonPosition),
    modalTitle: s(input?.modalTitle) || "What Will Your Solar System Cost?",
    modalSubtitle:
      s(input?.modalSubtitle) || "Enter your street address to get an accurate solar estimate instantly.",
    addressLabel: s(input?.addressLabel) || "Property address",
    addressPlaceholder: s(input?.addressPlaceholder) || "Ex: 1157 Palo Alto St SE, Palm Bay, FL",
    stepAddressLabel: s(input?.stepAddressLabel) || "Address",
    stepInfoLabel: s(input?.stepInfoLabel) || "Info",
    stepPricingLabel: s(input?.stepPricingLabel) || "Pricing",
    nextLabel: s(input?.nextLabel) || "Next Step",
    submitLabel: s(input?.submitLabel) || "See My Prices",
    themeAccent: normalizeColor(input?.themeAccent, "#2f6df6"),
    themeAccentSecondary: normalizeColor(input?.themeAccentSecondary, "#1ecf98"),
    themeSurface: normalizeColor(input?.themeSurface, "#0f1219"),
    modalTitleFontSize: normalizeNum(input?.modalTitleFontSize, 64, 28, 100),
    modalBodyFontSize: normalizeNum(input?.modalBodyFontSize, 15, 12, 30),
  };
}

async function tenantExists(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query(`select 1 from app.organizations where id = $1::uuid limit 1`, [tenantId]);
  return !!q.rows[0];
}

async function readBuilder(tenantId: string) {
  const pool = getDbPool();
  const q = await pool.query<{ key_value: string | null }>(
    `
      select key_value
      from app.organization_custom_values
      where organization_id = $1::uuid
        and provider = $2
        and scope = $3
        and module = $4
        and key_name = $5
      limit 1
    `,
    [tenantId, PROVIDER, SCOPE, BUILDER_MODULE, BUILDER_KEY],
  );
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(s(q.rows[0]?.key_value) || "{}") as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return normalizeBuilder(parsed);
}

async function readIntegrationKeys(tenantId: string) {
  const integration = await getTenantIntegration(tenantId, "custom", "solar_survey");
  const cfg = integration?.config && typeof integration.config === "object"
    ? (integration.config as Record<string, unknown>)
    : {};
  return {
    googleMapsApiKey: s(cfg.googleMapsApiKey),
  };
}

function buildWidgetHtml(args: {
  tenantId: string;
  googleMapsApiKey: string;
  folder: string;
  pageSlug: string;
  query: string;
  buttonText: string;
  buttonPosition: "left" | "center" | "right";
  modalTitle: string;
  modalSubtitle: string;
  addressLabel: string;
  addressPlaceholder: string;
  stepAddressLabel: string;
  stepInfoLabel: string;
  stepPricingLabel: string;
  nextLabel: string;
  submitLabel: string;
  themeAccent: string;
  themeAccentSecondary: string;
  themeSurface: string;
  modalTitleFontSize: number;
  modalBodyFontSize: number;
}) {
  const cfg = {
    tenantId: s(args.tenantId),
    mapsApiKey: s(args.googleMapsApiKey),
    buttonText: s(args.buttonText),
    buttonPosition: normalizeButtonPosition(args.buttonPosition) as "left" | "center" | "right",
    modalTitle: s(args.modalTitle),
    modalSubtitle: s(args.modalSubtitle),
    addressLabel: s(args.addressLabel),
    addressPlaceholder: s(args.addressPlaceholder),
    stepAddressLabel: s(args.stepAddressLabel),
    stepInfoLabel: s(args.stepInfoLabel),
    stepPricingLabel: s(args.stepPricingLabel),
    nextLabel: s(args.nextLabel),
    submitLabel: s(args.submitLabel),
    themeAccent: normalizeColor(args.themeAccent, "#2f6df6"),
    themeAccentSecondary: normalizeColor(args.themeAccentSecondary, "#1ecf98"),
    themeSurface: normalizeColor(args.themeSurface, "#0f1219"),
    modalTitleFontSize: normalizeNum(args.modalTitleFontSize, 64, 28, 100),
    modalBodyFontSize: normalizeNum(args.modalBodyFontSize, 15, 12, 30),
  };
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(cfg.modalTitle)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap" rel="stylesheet" />
  <style>
    :root{--accent:${esc(cfg.themeAccent)};--accent2:${esc(cfg.themeAccentSecondary)};--surface:${esc(cfg.themeSurface)};--text:#171b27;--muted:#5f6a7d;--line:#d8deea;--title-size:${cfg.modalTitleFontSize}px;--body-size:${cfg.modalBodyFontSize}px;}
    *{box-sizing:border-box}body{margin:0;font-family:Manrope,system-ui,-apple-system,Segoe UI,Roboto,Arial;color:var(--text);background:linear-gradient(180deg,#eef2f9,#e8edf7)}
    .shell{min-height:100vh;padding:18px;display:flex;align-items:center;justify-content:${cfg.buttonPosition === "left" ? "flex-start" : cfg.buttonPosition === "right" ? "flex-end" : "center"}}
    .launch{border:0;border-radius:999px;padding:14px 24px;font-weight:800;color:#fff;background:linear-gradient(90deg,var(--accent),#4275ff,var(--accent2));cursor:pointer;box-shadow:0 16px 36px rgba(0,0,0,.35)}
    .modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:10px;z-index:20}
    .modal.open{display:flex}
    .backdrop{position:absolute;inset:0;background:rgba(232,238,248,.52);backdrop-filter:blur(2px)}
    .card{position:relative;z-index:2;width:min(1040px,92%);max-height:calc(100vh - 60px);overflow:auto;border:1px solid rgba(255,255,255,.82);border-radius:20px;background:radial-gradient(80rem 24rem at -5% -10%,rgba(47,109,246,.08),transparent 40%),radial-gradient(80rem 24rem at 120% 120%,rgba(30,207,152,.06),transparent 45%),#f4f6fb;padding:22px 22px 18px;box-shadow:0 14px 42px rgba(10,20,40,.18)}
    h1{margin:0;font-size:clamp(26px,3vw,var(--title-size));letter-spacing:-.03em;max-width:22ch}
    .sub{margin:8px 0 0;color:var(--muted);font-size:var(--body-size)}
    .progressLabel{margin:14px 0 6px;font-size:var(--body-size);color:#5b6882;font-weight:700}
    .track{height:8px;border-radius:999px;background:#dde3ef;overflow:hidden}
    .fill{height:100%;width:33.33%;background:linear-gradient(90deg,var(--accent),var(--accent2));transition:width .24s ease}
    .step{display:none;margin-top:14px}.step.on{display:block}
    label{display:block;font-size:var(--body-size);font-weight:700;margin-bottom:6px;color:#2a3241}
    input,textarea,button{font:inherit}
    input,textarea{width:100%;border:1px solid var(--line);background:#fff;color:var(--text);border-radius:14px;padding:11px 12px;font-size:var(--body-size)}
    .grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .mapWrap{margin-top:10px;position:relative}
    #map{height:min(45vh,500px);border-radius:18px;border:1px solid #d8deea;overflow:hidden;background:#eef2f8}
    .mapEditFab{position:absolute;right:12px;top:50%;transform:translateY(-50%);border:1px solid rgba(39,47,66,.12);border-radius:999px;background:rgba(255,255,255,.98);color:#374154;width:44px;height:44px;cursor:pointer;display:grid;place-items:center;box-shadow:0 12px 26px rgba(8,12,22,.18)}
    .mapEditFab.on{background:rgba(46,108,246,.12);border-color:rgba(46,108,246,.36);color:#1942ad}
    .mapEditFab svg{width:18px;height:18px;fill:currentColor}
    .mapTip{display:none}
    .price{margin-top:8px;border:1px solid #dce2ef;border-radius:16px;background:#fff;padding:10px}
    .price h3{margin:0 0 8px;font-size:16px}
    .pg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .pg article{border:1px solid #e1e6f1;border-radius:10px;padding:8px}
    .pg p{margin:0;font-size:11px;color:#6a768d}.pg strong{display:block;margin-top:3px}
    .actions{margin-top:10px;display:flex;gap:8px}
    .btn{border:0;border-radius:12px;padding:11px 14px;font-weight:700;cursor:pointer}
    .ghost{background:#e8edf6;color:#253146}
    .primary{margin-left:auto;color:#fff;background:linear-gradient(90deg,var(--accent),#4c7aff)}
    .status{margin-top:10px;min-height:19px;font-size:var(--body-size);color:#355db7}.err{color:#d42253}
    .embedMode .shell{display:none}
    .embedMode{background:transparent}
    .embedMode .modal{padding:12px}
    .embedMode .backdrop{background:rgba(232,238,248,.36);backdrop-filter:blur(1px)}
    .embedMode .card{width:min(1040px,92%);max-height:calc(100vh - 34px);border-radius:20px;border:1px solid rgba(255,255,255,.8);box-shadow:0 12px 36px rgba(10,20,40,.16)}
    @media (max-width:760px){.grid2,.pg{grid-template-columns:1fr}.actions{flex-wrap:wrap}.btn,.primary{width:100%;margin-left:0}}
  </style>
</head>
<body>
  <main class="shell"><button id="openBtn" class="launch" type="button">${esc(cfg.buttonText)}</button></main>
  <div class="modal" id="modal" aria-hidden="true">
    <div class="backdrop" id="backdrop"></div>
    <div class="card">
      <h1 id="title">${esc(cfg.modalTitle)}</h1>
      <p class="sub" id="subtitle">${esc(cfg.modalSubtitle)}</p>
      <div class="progressLabel" id="pLabel">Step 1 of 3 · ${esc(cfg.stepAddressLabel)}</div>
      <div class="track"><div id="fill" class="fill"></div></div>
      <form id="form" novalidate>
        <section class="step on" data-step="1">
          <label for="address">${esc(cfg.addressLabel)}</label>
          <input id="address" name="address" placeholder="${esc(cfg.addressPlaceholder)}" required />
          <div class="mapWrap">
            <div id="map"></div>
            <button type="button" id="roofEditBtn" class="mapEditFab" aria-label="Draw roof">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 17.25V21h3.75L18.37 9.38l-3.75-3.75L3 17.25zm2.92 2.33h-.84v-.84l8.9-8.9.84.84-8.9 8.9zM20.71 7.04a1.003 1.003 0 0 0 0-1.42L18.37 3.29a1.003 1.003 0 0 0-1.42 0L15.13 5.1l3.75 3.75 1.83-1.81z"/>
              </svg>
            </button>
            <span class="mapTip" id="roofTip">Draw roof</span>
          </div>
        </section>
        <section class="step" data-step="2">
          <div class="grid2">
            <div><label for="fullName">Full name</label><input id="fullName" name="fullName" placeholder="First and last name" required /></div>
            <div><label for="phone">Phone</label><input id="phone" name="phone" placeholder="(555) 555-5555" required /></div>
          </div>
          <div class="grid2" style="margin-top:10px">
            <div><label for="email">Email</label><input id="email" name="email" type="email" placeholder="you@email.com" required /></div>
            <div><label for="monthlyBill">Monthly electric bill ($)</label><input id="monthlyBill" name="monthlyBill" type="number" min="0" placeholder="250" required /></div>
          </div>
          <label for="notes" style="margin-top:10px">Notes</label>
          <textarea id="notes" name="notes" rows="3" placeholder="Roof type, urgency, or details"></textarea>
        </section>
        <section class="step" data-step="3">
          <div class="price">
            <h3>Estimated Solar Pricing</h3>
            <div class="pg">
              <article><p>Estimated System</p><strong id="estSystem">-</strong></article>
              <article><p>Panels</p><strong id="estPanels">-</strong></article>
              <article><p>Batteries</p><strong id="estBatteries">-</strong></article>
              <article><p>Monthly Payment</p><strong id="estPayment">-</strong></article>
              <article><p>Year 1 Savings</p><strong id="estSavings">-</strong></article>
              <article><p>Address</p><strong id="estAddress">-</strong></article>
            </div>
          </div>
        </section>
        <div class="actions">
          <button id="backBtn" class="btn ghost" type="button">Back</button>
          <button id="nextBtn" class="btn primary" type="button">${esc(cfg.nextLabel)}</button>
          <button id="submitBtn" class="btn primary" type="submit" style="display:none">${esc(cfg.submitLabel)}</button>
        </div>
        <div id="status" class="status"></div>
      </form>
    </div>
  </div>
  <script>
  (() => {
    const cfg = ${JSON.stringify(cfg)};
    const params = new URLSearchParams(window.location.search);
    const embedMode = params.get("embed") === "1";
    const state = { step:1, selectedPlace:null, solarSummary:null, roofPolygon:null };
    const modal = document.getElementById("modal");
    const openBtn = document.getElementById("openBtn");
    const backdrop = document.getElementById("backdrop");
    const pLabel = document.getElementById("pLabel");
    const fill = document.getElementById("fill");
    const form = document.getElementById("form");
    const backBtn = document.getElementById("backBtn");
    const nextBtn = document.getElementById("nextBtn");
    const submitBtn = document.getElementById("submitBtn");
    const status = document.getElementById("status");
    const roofEditBtn = document.getElementById("roofEditBtn");
    const roofTip = document.getElementById("roofTip");
    const steps = Array.from(document.querySelectorAll(".step"));
    const billInput = document.getElementById("monthlyBill");
    const addressInput = document.getElementById("address");
    let map = null, marker = null, autocomplete = null, geocoder = null, drawingManager = null, roofOverlay = null;
    function setStatus(msg, err){ status.textContent = String(msg || ""); status.className = err ? "status err" : "status"; }
    function stepLabel(s){ return s===1?cfg.stepAddressLabel:s===2?cfg.stepInfoLabel:cfg.stepPricingLabel; }
    function renderStep(){
      steps.forEach((el) => el.classList.toggle("on", Number(el.dataset.step) === state.step));
      pLabel.textContent = "Step " + state.step + " of 3 · " + stepLabel(state.step);
      fill.style.width = (state.step/3*100).toFixed(2) + "%";
      backBtn.style.visibility = state.step === 1 ? "hidden" : "visible";
      nextBtn.style.display = state.step === 3 ? "none" : "inline-flex";
      submitBtn.style.display = state.step === 3 ? "inline-flex" : "none";
    }
    function openModal(){ modal.classList.add("open"); modal.setAttribute("aria-hidden","false"); setTimeout(() => { if (map && window.google) google.maps.event.trigger(map, "resize"); }, 60); }
    function closeModal(){
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden","true");
      if (embedMode && window.parent && window.parent !== window) {
        try { window.parent.postMessage({ type: "solar-survey-close", tenantId: cfg.tenantId }, "*"); } catch {}
      }
    }
    function getPolygonPathCoords(polygon){
      if (!polygon) return [];
      const path = polygon.getPath();
      const out = [];
      for (let i = 0; i < path.getLength(); i += 1) {
        const p = path.getAt(i);
        out.push({ lat: Number(p.lat()), lng: Number(p.lng()) });
      }
      return out;
    }
    function saveRoofPolygon(){ state.roofPolygon = getPolygonPathCoords(roofOverlay); }
    function clearRoofPolygon(){
      if (roofOverlay) roofOverlay.setMap(null);
      roofOverlay = null;
      state.roofPolygon = null;
      if (roofEditBtn) roofEditBtn.classList.remove("on");
      if (roofTip) roofTip.textContent = "Draw roof";
    }
    function setRoofEditable(editable){
      if (!roofOverlay) return;
      roofOverlay.setEditable(!!editable);
      roofOverlay.setDraggable(false);
      if (roofEditBtn) roofEditBtn.classList.toggle("on", !!editable);
      if (roofTip) roofTip.textContent = editable ? "Editing roof" : "Draw roof";
    }
    function attachRoofPathListeners(){
      if (!roofOverlay || !window.google) return;
      const path = roofOverlay.getPath();
      const sync = () => saveRoofPolygon();
      google.maps.event.addListener(path, "set_at", sync);
      google.maps.event.addListener(path, "insert_at", sync);
      google.maps.event.addListener(path, "remove_at", sync);
    }
    function cross(o,a,b){ return (a.lng-o.lng)*(b.lat-o.lat) - (a.lat-o.lat)*(b.lng-o.lng); }
    function convexHull(points){
      if (!Array.isArray(points) || points.length < 3) return points || [];
      const sorted = [...points].sort((p1,p2) => (p1.lng === p2.lng ? p1.lat - p2.lat : p1.lng - p2.lng));
      const lower = [];
      for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper = [];
      for (let i = sorted.length - 1; i >= 0; i -= 1) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      lower.pop();
      upper.pop();
      return lower.concat(upper);
    }
    function drawRoofHullFromPanels(panels){
      if (!Array.isArray(panels) || !map || !window.google) return;
      const points = panels
        .slice(0, 320)
        .map((panel) => panel && panel.center ? panel.center : null)
        .filter(Boolean)
        .map((c) => ({ lat: Number(c.latitude), lng: Number(c.longitude) }))
        .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
      if (points.length < 3) return;
      const hull = convexHull(points);
      if (hull.length < 3) return;
      if (roofOverlay) roofOverlay.setMap(null);
      roofOverlay = new google.maps.Polygon({
        map,
        paths: hull,
        strokeColor: "#2f6df6",
        strokeOpacity: 0.96,
        strokeWeight: 2,
        fillColor: "#2f6df6",
        fillOpacity: 0.23,
        editable: false,
        draggable: false,
      });
      attachRoofPathListeners();
      saveRoofPolygon();
      setRoofEditable(false);
    }
    async function loadMaps(){
      if (!cfg.mapsApiKey) {
        document.getElementById("map").innerHTML = "<p style='padding:12px;color:#ff9ab2;font-size:12px'>Missing GOOGLE_MAPS_API_KEY</p>";
        return;
      }
      if (!window.google || !window.google.maps) {
        await new Promise((resolve, reject) => {
          const sc = document.createElement("script");
          sc.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(cfg.mapsApiKey) + "&libraries=places,drawing";
          sc.async = true; sc.defer = true;
          sc.onload = () => resolve();
          sc.onerror = () => reject(new Error("Unable to load Google Maps"));
          document.head.appendChild(sc);
        });
      }
      map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 28.5383, lng: -81.3792 },
        zoom: 17,
        mapTypeId: "satellite",
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });
      geocoder = new google.maps.Geocoder();
      autocomplete = new google.maps.places.Autocomplete(addressInput, {
        fields: ["formatted_address", "geometry", "place_id"],
        componentRestrictions: { country: ["us","pr"] },
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place || !place.geometry || !place.geometry.location) return;
        placeOnMap(place);
      });
      addressInput.addEventListener("keydown", async (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        await resolveAddressFromInput();
      });
      addressInput.addEventListener("blur", async () => {
        const raw = String(addressInput.value || "").trim();
        if (!raw) return;
        if (state.selectedPlace && state.selectedPlace.formattedAddress === raw) return;
        await resolveAddressFromInput();
      });
      addressInput.addEventListener("input", () => {
        state.selectedPlace = null;
      });
      drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false,
        polygonOptions: {
          strokeColor: "#2f6df6",
          strokeOpacity: 0.96,
          strokeWeight: 2,
          fillColor: "#2f6df6",
          fillOpacity: 0.23,
          editable: true,
          draggable: false,
        },
      });
      drawingManager.setMap(map);
      google.maps.event.addListener(drawingManager, "overlaycomplete", (evt) => {
        if (!evt || evt.type !== google.maps.drawing.OverlayType.POLYGON) return;
        clearRoofPolygon();
        roofOverlay = evt.overlay;
        drawingManager.setDrawingMode(null);
        attachRoofPathListeners();
        saveRoofPolygon();
        setRoofEditable(false);
        setStatus("");
      });
    }
    async function resolveAddressFromInput() {
      const raw = String(addressInput.value || "").trim();
      if (!raw || !geocoder || !map) return false;
      try {
        const result = await geocoder.geocode({ address: raw, bounds: map.getBounds() || undefined, region: "us" });
        const first = result.results && result.results[0];
        if (!first || !first.geometry || !first.geometry.location) return false;
        placeOnMap({ formatted_address: first.formatted_address || raw, place_id: first.place_id || "", geometry: { location: first.geometry.location } });
        return true;
      } catch {
        return false;
      }
    }
    function placeOnMap(place){
      const loc = place.geometry.location;
      map.setCenter(loc); map.setZoom(20);
      if (!marker) marker = new google.maps.Marker({ map, position: loc, animation: google.maps.Animation.DROP });
      else marker.setPosition(loc);
      state.selectedPlace = {
        formattedAddress: place.formatted_address || addressInput.value || "",
        placeId: place.place_id || "",
        lat: Number(loc.lat()),
        lng: Number(loc.lng())
      };
      addressInput.value = state.selectedPlace.formattedAddress;
      void loadSolarInsights();
    }
    async function loadSolarInsights(){
      if (!state.selectedPlace || !Number.isFinite(state.selectedPlace.lat) || !Number.isFinite(state.selectedPlace.lng)) return;
      setStatus("Analyzing solar potential...");
      try {
        const res = await fetch("/api/public/solar/insights", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantId: cfg.tenantId,
            lat: state.selectedPlace.lat,
            lng: state.selectedPlace.lng,
            radiusMeters: 60,
            pixelSizeMeters: 0.5,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || ("Solar API error " + res.status));
        const sp = (data.buildingInsights && data.buildingInsights.solarPotential) || {};
        const panels = Array.isArray(sp.solarPanels) ? sp.solarPanels : [];
        state.solarSummary = {
          maxPanels: Number(sp.maxArrayPanelsCount || 0) || null,
          maxSystemKw: sp.maxArrayAreaMeters2 ? Number((Number(sp.maxArrayAreaMeters2) / 5.2).toFixed(1)) : null,
          maxSunHoursYear: Number(sp.maxSunshineHoursPerYear || 0) || null,
          panelCapacityWatts: Number(sp.panelCapacityWatts || 400) || 400
        };
        clearRoofPolygon();
        drawRoofHullFromPanels(panels);
        setStatus(state.solarSummary.maxPanels ? ("Roof detected: up to " + state.solarSummary.maxPanels + " potential panels.") : "Address validated.");
        if (state.step === 3) renderEstimate();
      } catch (error) {
        state.solarSummary = null;
        setStatus("Unable to load solar data: " + (error && error.message ? error.message : "unexpected error"), true);
      }
    }
    function renderEstimate() {
      const bill = Number(billInput.value || 0);
      const summary = state.solarSummary || {};
      if (!bill || bill < 40) {
        document.getElementById("estSystem").textContent = "-";
        document.getElementById("estPanels").textContent = "-";
        document.getElementById("estBatteries").textContent = "-";
        document.getElementById("estPayment").textContent = "-";
        document.getElementById("estSavings").textContent = "-";
        document.getElementById("estAddress").textContent = state.selectedPlace ? state.selectedPlace.formattedAddress : "-";
        return;
      }
      const utilityRate = 0.27;
      const monthlyKwh = bill / Math.max(0.01, utilityRate);
      const panelKw = Number(summary.panelCapacityWatts || 400) / 1000;
      const sunHoursYear = Number(summary.maxSunHoursYear || 1550);
      const annualKwhPerPanel = panelKw * sunHoursYear * 0.82;
      const targetAnnualKwh = monthlyKwh * 12 * 0.95;
      const rawPanels = Math.max(4, Math.ceil(targetAnnualKwh / Math.max(1, annualKwhPerPanel)));
      const maxPanels = Number(summary.maxPanels || 0) || 0;
      const panels = maxPanels ? Math.min(rawPanels, maxPanels) : rawPanels;
      const systemKw = Number(summary.maxSystemKw || 0) ? Math.min(Math.max(4, bill/30), Number(summary.maxSystemKw)) : Math.max(4, bill/30);
      const batteries = Math.max(1, Math.ceil(systemKw / 5));
      const projectCost = (systemKw * 3050) + (batteries * 14900);
      const monthlyPayment = projectCost * 0.0068;
      const savings = Math.max(0, (bill - monthlyPayment) * 12);
      document.getElementById("estSystem").textContent = systemKw.toFixed(1) + " kW";
      document.getElementById("estPanels").textContent = String(panels);
      document.getElementById("estBatteries").textContent = String(batteries);
      document.getElementById("estPayment").textContent = "$" + monthlyPayment.toFixed(0) + "/mo";
      document.getElementById("estSavings").textContent = "$" + savings.toFixed(0);
      document.getElementById("estAddress").textContent = state.selectedPlace ? state.selectedPlace.formattedAddress : "-";
    }
    function validateStep(step){
      if (step === 1 && !String(addressInput.value || "").trim()) return "Enter an address to continue.";
      if (step === 2) {
        if (!String(document.getElementById("fullName").value || "").trim()) return "Enter your full name.";
        if (!String(document.getElementById("phone").value || "").trim()) return "Enter a contact phone number.";
        if (!String(document.getElementById("email").value || "").trim()) return "Enter your email.";
        if (!String(document.getElementById("monthlyBill").value || "").trim()) return "Enter your monthly electric bill.";
      }
      return "";
    }
    nextBtn.addEventListener("click", async () => {
      if (state.step === 1 && !state.selectedPlace) {
        const resolved = await resolveAddressFromInput();
        if (!resolved) {
          setStatus("We could not find that address. Select an autocomplete result or refine the text.", true);
          return;
        }
      }
      const err = validateStep(state.step);
      if (err) { setStatus(err, true); return; }
      setStatus("");
      if (state.step < 3) state.step += 1;
      if (state.step === 3) renderEstimate();
      renderStep();
    });
    backBtn.addEventListener("click", () => { if (state.step > 1) state.step -= 1; setStatus(""); renderStep(); });
    billInput.addEventListener("input", () => { if (state.step === 3) renderEstimate(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const err = validateStep(3);
      if (err) { setStatus(err, true); return; }
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting...";
      try {
        const payload = {
          tenantId: cfg.tenantId,
          fullName: String(document.getElementById("fullName").value || "").trim(),
          phone: String(document.getElementById("phone").value || "").trim(),
          email: String(document.getElementById("email").value || "").trim(),
          monthlyBill: String(document.getElementById("monthlyBill").value || "").trim(),
          notes: String(document.getElementById("notes").value || "").trim(),
          address: state.selectedPlace || {
            formattedAddress: String(addressInput.value || "").trim(),
            placeId: "",
            lat: null,
            lng: null
          },
          context: {
            pageUrl: window.location.href,
            referrer: document.referrer || "",
            solarSummary: state.solarSummary,
            roofPolygon: state.roofPolygon
          }
        };
        const res = await fetch("/api/public/solar/lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || ("Lead submit failed " + res.status));
        setStatus("Perfect. We will contact you with detailed pricing.");
      } catch (error) {
        setStatus(error && error.message ? error.message : "Unexpected error.", true);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = cfg.submitLabel || "See My Prices";
      }
    });
    openBtn.addEventListener("click", openModal);
    backdrop.addEventListener("click", closeModal);
    roofEditBtn.addEventListener("click", () => {
      if (!drawingManager || !window.google) return;
      const isDrawing = drawingManager.getDrawingMode() === google.maps.drawing.OverlayType.POLYGON;
      if (isDrawing) {
        drawingManager.setDrawingMode(null);
        if (roofEditBtn) roofEditBtn.classList.remove("on");
        if (roofTip) roofTip.textContent = "Draw roof";
        return;
      }
      if (roofOverlay) {
        const editable = !!roofOverlay.getEditable();
        if (editable) {
          setRoofEditable(false);
        } else {
          setRoofEditable(true);
        }
        return;
      }
      drawingManager.setDrawingMode(google.maps.drawing.OverlayType.POLYGON);
      if (roofEditBtn) roofEditBtn.classList.add("on");
      if (roofTip) roofTip.textContent = "Drawing roof";
    });
    window.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
    if (embedMode) document.body.classList.add("embedMode");
    if (params.get("open") === "1" || embedMode) openModal();
    renderStep();
    loadMaps().catch((e) => setStatus(e && e.message ? e.message : "Map bootstrap failed.", true));
  })();
  </script>
</body>
</html>`;
}

async function writePublishedManifest(tenantId: string, manifest: PublishManifest) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_custom_values (
        organization_id, provider, scope, module, key_name,
        key_value, value_type, is_secret, is_active, description
      ) values (
        $1::uuid, $2, $3, $4, $5,
        $6, 'json', false, true, 'Solar Survey publish manifest'
      )
      on conflict (organization_id, provider, scope, module, key_name)
      do update set
        key_value = excluded.key_value,
        value_type = excluded.value_type,
        is_secret = excluded.is_secret,
        is_active = excluded.is_active,
        description = excluded.description,
        updated_at = now()
    `,
    [tenantId, PROVIDER, SCOPE, PUBLISH_MODULE, PUBLISH_KEY, JSON.stringify(manifest)],
  );
}

async function upsertPublishedFile(tenantId: string, keyName: string, html: string) {
  const pool = getDbPool();
  await pool.query(
    `
      insert into app.organization_custom_values (
        organization_id, provider, scope, module, key_name,
        key_value, value_type, is_secret, is_active, description
      ) values (
        $1::uuid, $2, $3, $4, $5,
        $6, 'text', false, true, 'Solar Survey widget file'
      )
      on conflict (organization_id, provider, scope, module, key_name)
      do update set
        key_value = excluded.key_value,
        value_type = excluded.value_type,
        is_secret = excluded.is_secret,
        is_active = excluded.is_active,
        description = excluded.description,
        updated_at = now()
    `,
    [tenantId, PROVIDER, SCOPE, FILES_MODULE, keyName, html],
  );
}

async function readPublishedManifest(tenantId: string): Promise<PublishManifest | null> {
  const pool = getDbPool();
  const q = await pool.query<{ key_value: string | null }>(
    `
      select key_value
      from app.organization_custom_values
      where organization_id = $1::uuid
        and provider = $2
        and scope = $3
        and module = $4
        and key_name = $5
      limit 1
    `,
    [tenantId, PROVIDER, SCOPE, PUBLISH_MODULE, PUBLISH_KEY],
  );
  const raw = s(q.rows[0]?.key_value);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PublishManifest;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.read");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const manifest = await readPublishedManifest(tenantId);
    return NextResponse.json({ ok: true, manifest });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to read publish manifest" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const tenantId = s(id);
  if (!tenantId) return NextResponse.json({ ok: false, error: "Missing tenant id" }, { status: 400 });
  const auth = await requireTenantPermission(req, tenantId, "tenant.manage");
  if ("response" in auth) return auth.response;
  if (!(await tenantExists(tenantId))) return NextResponse.json({ ok: false, error: "Tenant not found" }, { status: 404 });

  try {
    const builder = await readBuilder(tenantId);
    const keys = await readIntegrationKeys(tenantId);
    const folder = builder.folder;
    const fileName = `${builder.pageSlug}.html`;
    const keyName = `${folder}/${fileName}`;
    const html = buildWidgetHtml({
      tenantId,
      googleMapsApiKey: keys.googleMapsApiKey,
      folder: builder.folder,
      pageSlug: builder.pageSlug,
      query: builder.query,
      buttonText: builder.buttonText,
      buttonPosition: builder.buttonPosition,
      modalTitle: builder.modalTitle,
      modalSubtitle: builder.modalSubtitle,
      addressLabel: builder.addressLabel,
      addressPlaceholder: builder.addressPlaceholder,
      stepAddressLabel: builder.stepAddressLabel,
      stepInfoLabel: builder.stepInfoLabel,
      stepPricingLabel: builder.stepPricingLabel,
      nextLabel: builder.nextLabel,
      submitLabel: builder.submitLabel,
      themeAccent: builder.themeAccent,
      themeAccentSecondary: builder.themeAccentSecondary,
      themeSurface: builder.themeSurface,
      modalTitleFontSize: builder.modalTitleFontSize,
      modalBodyFontSize: builder.modalBodyFontSize,
    });

    await upsertPublishedFile(tenantId, keyName, html);
    const url = `https://${SEARCH_EMBEDDED_HOST}/embedded/${tenantId}/${folder}/${fileName}`;
    const manifest: PublishManifest = {
      tenantId,
      folder,
      fileName,
      host: SEARCH_EMBEDDED_HOST,
      url,
      generatedAt: new Date().toISOString(),
    };
    await writePublishedManifest(tenantId, manifest);

    return NextResponse.json({ ok: true, manifest });
  } catch (error: unknown) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to publish solar survey widget" },
      { status: 500 },
    );
  }
}
