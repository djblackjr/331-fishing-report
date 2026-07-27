// src/atlas/main.js
// Fishing Intelligence Atlas — standalone vanilla-JS + Leaflet page.
// Deliberately kept out of the React SPA (src/App.jsx) — see docs/atlas.md
// for why. This is the single entry point for atlas.html.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { buildLocationPopup, buildFeaturePopup } from "./popup.js";
import { DEFAULT_FILTERS, locationMatchesFilters } from "./filters.js";

// Jolly Bay, Walton County, FL — verified coordinates (USGS topo data via
// topozone.com), not a fabricated fishing spot, just the map's starting
// center point. See docs/atlas.md for the source.
const JOLLY_BAY_CENTER = [30.4272691, -86.1280154];
const JOLLY_BAY_ZOOM = 14;

const BASE = import.meta.env.BASE_URL; // '/331-fishing-report/' in prod, '/' in dev

const root = document.getElementById("atlas-root");
root.innerHTML = `
  <div class="atlas-shell">
    <header class="atlas-header">
      <a class="atlas-back" href="./">&larr; 331 Bridge Report</a>
      <div class="atlas-title">
        <span class="atlas-title-main">Fishing Intelligence Atlas</span>
        <span class="atlas-title-sub">Jolly Bay pilot region</span>
      </div>
      <button class="atlas-sidebar-toggle" id="atlas-sidebar-toggle" type="button" aria-label="Toggle filters">Filters</button>
    </header>
    <div class="atlas-body">
      <aside class="atlas-sidebar" id="atlas-sidebar">
        <section class="atlas-panel">
          <h2 class="atlas-panel-title">Filter Locations</h2>
          <label class="atlas-field">
            <span>Species</span>
            <select id="filter-species"><option value="all">All species</option></select>
          </label>
          <label class="atlas-field">
            <span>Habitat</span>
            <select id="filter-habitat"><option value="all">All habitats</option></select>
          </label>
          <label class="atlas-field">
            <span>Season</span>
            <select id="filter-season">
              <option value="all">All seasons</option>
              <option value="spring">Spring</option>
              <option value="summer">Summer</option>
              <option value="fall">Fall</option>
              <option value="winter">Winter</option>
            </select>
          </label>
          <label class="atlas-field">
            <span>Validation status</span>
            <select id="filter-validation">
              <option value="all">All statuses</option>
              <option value="placeholder">Placeholder</option>
              <option value="proposed">Proposed</option>
              <option value="visually_reviewed">Visually reviewed</option>
              <option value="user_reported">User reported</option>
              <option value="field_verified">Field verified</option>
              <option value="guide_verified">Guide verified</option>
            </select>
          </label>
          <label class="atlas-field">
            <span>Access type</span>
            <select id="filter-access">
              <option value="all">Any access</option>
              <option value="boat">Boat</option>
              <option value="kayak">Kayak</option>
              <option value="wade">Wade</option>
              <option value="shore">Shore</option>
            </select>
          </label>
          <label class="atlas-field">
            <span>Min. confidence: <b id="filter-confidence-value">0%</b></span>
            <input type="range" id="filter-confidence" min="0" max="100" step="5" value="0" />
          </label>
          <button class="atlas-reset" id="filter-reset" type="button">Reset filters</button>
        </section>

        <section class="atlas-panel" id="atlas-pending-panel" hidden>
          <h2 class="atlas-panel-title">Pending Field Validation</h2>
          <p class="atlas-panel-hint">No coordinates yet — not plotted on the map until surveyed.</p>
          <ul class="atlas-pending-list" id="atlas-pending-list"></ul>
        </section>

        <section class="atlas-panel">
          <h2 class="atlas-panel-title">About this map</h2>
          <p class="atlas-panel-hint">
            Phase 1 pilot for Jolly Bay. Use the layer control (top right of the map) to toggle populated habitat and structure layers. The number beside each layer is its plotted feature count.
          </p>
        </section>
      </aside>
      <div id="atlas-map"></div>
    </div>
  </div>
`;

document.getElementById("atlas-sidebar-toggle").addEventListener("click", () => {
  document.getElementById("atlas-sidebar").classList.toggle("atlas-sidebar-open");
});

// ── MAP + BASE LAYERS ────────────────────────────────────────────────────
const map = L.map("atlas-map", { zoomControl: true }).setView(JOLLY_BAY_CENTER, JOLLY_BAY_ZOOM);
L.control.scale({ imperial: true, metric: false }).addTo(map);

// Do not use Google map tiles directly (brief STEP 4) — OSM, Esri, and NOAA
// below are all license-compatible with a static, attributed, non-Google
// GitHub Pages site.
const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
});

const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
});

// NOAA Chart Display Service (NCDS) — replaces the retired RNC Tile Service.
// The service has no single "all symbology" layer name; each S-57 category
// (0=chart info, 1=natural/man-made features, 2=depths/currents, 3=seabed,
// 4=traffic routes, 5=special areas, 6=buoys/beacons/lights, 7=services,
// 8=data quality, 9=low accuracy, 10=additional info, 11=shallow water
// pattern, 12=overscale warning) is a separate sublayer that must be listed
// explicitly, or you get bare land/water polygons with no chart detail.
// WMS endpoint verified directly against Jolly Bay's bounding box before
// shipping — see docs/atlas.md.
// A 1x1 PNG solid-filled with the chart's own open-water color (verified by
// sampling a real NCDS response: rgb(175,205,225)), used as the last-resort
// fallback below. It used to be fully transparent, which let the page's dark
// theme background (#0a1f14) show through as a solid black square everywhere
// a tile failed — since failures used to cluster over water, that made the
// whole bay look like a black hole instead of a merely-lower-detail patch.
const FALLBACK_TILE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNYf/YhAASMAl4vKx8FAAAAAElFTkSuQmCC";

const noaaChart = L.tileLayer.wms("https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer", {
  layers: "0,1,2,3,4,5,6,7,8,9,10,11,12",
  format: "image/png",
  transparent: true,
  version: "1.3.0",
  maxZoom: 18,
  attribution: "Chart data: NOAA/NOS Office of Coast Survey",
  // NO crossOrigin here, deliberately: an earlier version set
  // crossOrigin: "anonymous" believing NOAA's WMS sends
  // Access-Control-Allow-Origin. It doesn't (checked with curl -I) — so that
  // setting forced every tile <img> into CORS mode against a server that
  // never satisfies it, and the browser blocked 100% of tiles outright
  // ("blocked by CORS policy", confirmed in a real headless-Chromium run),
  // which is what actually produced the solid-black water, not occasional
  // ORB flakiness. Plain opaque cross-origin <img> loads need no CORS header
  // at all for on-screen display, so dropping it is the real fix.
  errorTileUrl: FALLBACK_TILE,
});

// Retry a failed tile a couple of times (genuine transient network errors
// often succeed on a second attempt) before letting Leaflet fall back to
// FALLBACK_TILE. Retry count is tracked per <img> element since Leaflet
// reuses/recycles tile elements as you pan.
const TILE_RETRY_LIMIT = 2;
const tileRetries = new WeakMap();
noaaChart.on("tileerror", (e) => {
  const img = e.tile;
  const attempts = tileRetries.get(img) || 0;
  if (attempts >= TILE_RETRY_LIMIT) return;
  tileRetries.set(img, attempts + 1);
  const src = img.src;
  setTimeout(() => {
    img.src = "";
    img.src = src;
  }, 400 * (attempts + 1));
});

osm.addTo(map);

const layersControl = L.control.layers(
  { "OpenStreetMap": osm, "Satellite (Esri)": satellite, "NOAA Nautical Chart": noaaChart },
  {},
  { collapsed: window.innerWidth < 700 }
).addTo(map);

// ── DATA LOADING ─────────────────────────────────────────────────────────
async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function buildFeatureLayer(layerMeta, featureCollection) {
  return L.geoJSON(featureCollection, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: layerMeta.key === "fishing_locations" ? 9 : 6,
      color: layerMeta.color,
      weight: 2,
      fillColor: layerMeta.color,
      fillOpacity: 0.85,
    }),
    style: (feature) => ({
      color: layerMeta.color,
      weight: feature.geometry?.type === "LineString" ? 3 : 2,
      fillColor: layerMeta.color,
      fillOpacity: feature.geometry?.type === "Point"
        ? 0.85
        : feature.geometry?.type === "Polygon" ? 0.25 : 0,
    }),
    onEachFeature: (feature, leafletLayer) => {
      const html = layerMeta.key === "fishing_locations"
        ? buildLocationPopup(feature.properties)
        : buildFeaturePopup(feature.properties, layerMeta.label);
      leafletLayer.bindPopup(html, { maxWidth: 300, className: "atlas-leaflet-popup" });
    },
  });
}

function populateSelectOptions(select, values) {
  for (const { value, label } of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = label;
    select.appendChild(opt);
  }
}

function renderPendingList(features) {
  const pending = features.filter((f) => !f.geometry);
  const panel = document.getElementById("atlas-pending-panel");
  const list = document.getElementById("atlas-pending-list");
  if (!pending.length) return;
  panel.hidden = false;
  list.innerHTML = pending.map((f) => `
    <li class="atlas-pending-item">
      <span class="atlas-pending-name">${f.properties.name}</span>
      <span class="atlas-pending-meta">${f.properties.habitatLabel || "Habitat TBD"} &middot; ${f.properties.validationStatus}</span>
    </li>
  `).join("");
}

async function init() {
  let registry;
  try {
    registry = await fetchJson("atlas/layers.json");
  } catch (err) {
    document.getElementById("atlas-map").innerHTML = `<div class="atlas-error">Couldn't load atlas layer data (${err.message}). Run "npm run atlas:export" and rebuild.</div>`;
    return;
  }

  let fishingLocationsLayer = null;
  let fishingLocationsRaw = [];

  for (const layerMeta of registry) {
    if (layerMeta.featureCount === 0) continue;

    let featureCollection;
    try {
      featureCollection = await fetchJson(`atlas/geojson/${layerMeta.key}.geojson`);
    } catch {
      continue; // missing/unbuilt layer file — skip rather than break the whole map
    }

    const plottedFeatureCount = featureCollection.features.filter((feature) => feature.geometry !== null).length;
    if (plottedFeatureCount === 0) continue;

    const leafletLayer = buildFeatureLayer(layerMeta, featureCollection);
    const controlLabel = `${layerMeta.label} (${plottedFeatureCount})`;
    if (layerMeta.defaultVisible) leafletLayer.addTo(map);
    layersControl.addOverlay(leafletLayer, controlLabel);

    if (layerMeta.key === "fishing_locations") {
      fishingLocationsLayer = leafletLayer;
      fishingLocationsRaw = featureCollection.features;
    }
  }

  if (!fishingLocationsRaw.length) return;

  renderPendingList(fishingLocationsRaw);

  // Populate species/habitat filter dropdowns from whatever data actually
  // exists right now, rather than a hardcoded list that might not match.
  const speciesSeen = new Map();
  const habitatsSeen = new Map();
  for (const f of fishingLocationsRaw) {
    for (const s of f.properties.species || []) speciesSeen.set(s.key, s.label);
    if (f.properties.habitat) habitatsSeen.set(f.properties.habitat, f.properties.habitatLabel);
  }
  populateSelectOptions(document.getElementById("filter-species"), [...speciesSeen].map(([value, label]) => ({ value, label })));
  populateSelectOptions(document.getElementById("filter-habitat"), [...habitatsSeen].map(([value, label]) => ({ value, label })));

  const filters = { ...DEFAULT_FILTERS };
  function applyFilters() {
    const filtered = fishingLocationsRaw.filter((f) => f.geometry && locationMatchesFilters(f.properties, filters));
    fishingLocationsLayer.clearLayers();
    fishingLocationsLayer.addData({ type: "FeatureCollection", features: filtered });
  }

  document.getElementById("filter-species").addEventListener("change", (e) => { filters.species = e.target.value; applyFilters(); });
  document.getElementById("filter-habitat").addEventListener("change", (e) => { filters.habitat = e.target.value; applyFilters(); });
  document.getElementById("filter-season").addEventListener("change", (e) => { filters.season = e.target.value; applyFilters(); });
  document.getElementById("filter-validation").addEventListener("change", (e) => { filters.validationStatus = e.target.value; applyFilters(); });
  document.getElementById("filter-access").addEventListener("change", (e) => { filters.accessType = e.target.value; applyFilters(); });
  document.getElementById("filter-confidence").addEventListener("input", (e) => {
    filters.minConfidence = Number(e.target.value);
    document.getElementById("filter-confidence-value").textContent = `${filters.minConfidence}%`;
    applyFilters();
  });
  document.getElementById("filter-reset").addEventListener("click", () => {
    Object.assign(filters, DEFAULT_FILTERS);
    document.getElementById("filter-species").value = "all";
    document.getElementById("filter-habitat").value = "all";
    document.getElementById("filter-season").value = "all";
    document.getElementById("filter-validation").value = "all";
    document.getElementById("filter-access").value = "all";
    document.getElementById("filter-confidence").value = "0";
    document.getElementById("filter-confidence-value").textContent = "0%";
    applyFilters();
  });
}

init();
