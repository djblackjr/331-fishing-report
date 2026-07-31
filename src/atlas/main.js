// src/atlas/main.js
// Fishing Intelligence Atlas — standalone vanilla-JS + Leaflet page.
// Deliberately kept out of the React SPA (src/App.jsx) — see docs/atlas.md
// for why. This is the single entry point for atlas.html.

import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import { buildLocationPopup, buildFeaturePopup } from "./popup.js";
import { DEFAULT_FILTERS, locationMatchesFilters } from "./filters.js";
import { addCatch, deleteCatch } from "./catchlog.js";
import { getRun, toggleStop, moveStop, clearRun, nauticalMilesBetween } from "./tripplan.js";

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
        <span class="atlas-title-sub">Choctawhatchee Bay</span>
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

        <section class="atlas-panel" id="atlas-intelligence-panel" hidden>
          <h2 class="atlas-panel-title">Current Bay Fishing</h2>
          <div id="atlas-intelligence-content"></div>
        </section>

        <section class="atlas-panel" id="atlas-run-panel" hidden>
          <h2 class="atlas-panel-title">Today's Run</h2>
          <ol class="atlas-run-list" id="atlas-run-list"></ol>
          <div class="atlas-run-total" id="atlas-run-total"></div>
          <button class="atlas-reset" id="atlas-run-clear" type="button">Clear run</button>
          <p class="atlas-panel-hint">Straight-line distance only — not a real boating route. Saved on this device only.</p>
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
      <div class="atlas-sidebar-backdrop" id="atlas-sidebar-backdrop"></div>
      <div id="atlas-map"></div>
    </div>
  </div>
`;

function toggleSidebar(open) {
  const sidebar = document.getElementById("atlas-sidebar");
  const backdrop = document.getElementById("atlas-sidebar-backdrop");
  const next = open ?? !sidebar.classList.contains("atlas-sidebar-open");
  sidebar.classList.toggle("atlas-sidebar-open", next);
  backdrop.classList.toggle("atlas-sidebar-open", next);
}
document.getElementById("atlas-sidebar-toggle").addEventListener("click", () => toggleSidebar());
document.getElementById("atlas-sidebar-backdrop").addEventListener("click", () => toggleSidebar(false));

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

const satelliteImagery = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
});

// World_Imagery is pixels only — no place names, water-body labels, or
// boundaries baked in. Esri's own reference/labels overlay (below) only
// carries towns and political boundaries; it has no hydrography at all, so
// on an unincorporated stretch like Jolly Bay it renders completely blank —
// verified directly (curl'd the raw tile) before relying on it. Water names
// (bays, rivers, creeks — the ones that actually matter here) come from a
// separate source: USGS National Map's USGSHydroCached service, a
// public-domain, transparent-background overlay built specifically to sit
// on top of imagery. Verified against Jolly Bay's own bounding box: it
// renders "Jolly Bay", "Mitchell River", "Black Creek", "Bear Creek", etc.
// It's also an ArcGIS Server REST tile endpoint under the hood, so — like
// the Esri services below, and unlike Leaflet's own {z}/{x}/{y} default —
// it takes {z}/{y}/{x} (row before column); confirmed with curl after the
// {z}/{x}/{y} guess produced ERR_BLOCKED_BY_ORB in a real browser for every
// tile.
const satelliteHydroLabels = L.tileLayer("https://basemap.nationalmap.gov/arcgis/rest/services/USGSHydroCached/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 16,
  attribution: "Hydrography &copy; USGS National Map",
});
const satellitePlaceLabels = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", {
  maxZoom: 19,
  attribution: "Labels &copy; Esri",
});
// Bundle imagery + both label overlays into one LayerGroup so "Satellite
// (Esri)" behaves as a single toggleable base layer instead of leaving the
// labels as separate control entries the user would have to remember to
// also switch on. Hydro labels sit just above the imagery so their light
// water tint and linework read directly against the photo; place labels go
// on top so town names stay legible over both.
const satellite = L.layerGroup([satelliteImagery, satelliteHydroLabels, satellitePlaceLabels]);

// NOAA Chart Display Service (NCDS) — replaces the retired RNC Tile Service.
// The service has no single "all symbology" layer name; each S-57 category
// (0=chart info, 1=natural/man-made features, 2=depths/currents, 3=seabed,
// 4=traffic routes, 5=special areas, 6=buoys/beacons/lights, 7=services,
// 8=data quality, 9=low accuracy, 10=additional info, 11=shallow water
// pattern, 12=overscale warning) is a separate sublayer that must be listed
// explicitly, or you get bare land/water polygons with no chart detail.
// Deliberately only requesting 1/2/3/11 (shoreline, depth soundings,
// seabed/obstructions, shallow-water pattern) here rather than the full
// 0-12 stack: this app is fishing reference, not navigation, and layers
// 8/9 render as a tiled "CATZOC" triangle-and-star pattern (NOAA's own
// survey-confidence rating, not depth data) that just obscures the actual
// sounding numbers anglers care about — 0/4/5/6/7/10/12 are chart-display
// boxes, traffic routes, and overscale warnings, none of it fishing-relevant.
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

function makeNoaaChartLayer(sublayers) {
  return L.tileLayer.wms("https://gis.charttools.noaa.gov/arcgis/rest/services/MCS/NOAAChartDisplay/MapServer/exts/MaritimeChartService/WMSServer", {
    layers: sublayers,
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
}

const noaaChart = makeNoaaChartLayer("1,2,3,11");

// Same base chart plus sublayer 5 (special areas), 6 (buoys, beacons,
// lights, fog signals, radar), 7 (services), and 10 (additional info) for
// anglers who want the full aids-to-navigation picture shown — kept as a
// separate radio option rather than folded into the default chart so the
// fishing-focused view (see comment above) stays uncluttered by default.
const noaaChartNav = makeNoaaChartLayer("1,2,3,5,6,7,10,11");

// Retry a failed tile a couple of times (genuine transient network errors
// often succeed on a second attempt) before letting Leaflet fall back to
// FALLBACK_TILE. Retry count is tracked per <img> element since Leaflet
// reuses/recycles tile elements as you pan.
const TILE_RETRY_LIMIT = 2;
const tileRetries = new WeakMap();
function retryFailedTile(e) {
  const img = e.tile;
  const attempts = tileRetries.get(img) || 0;
  if (attempts >= TILE_RETRY_LIMIT) return;
  tileRetries.set(img, attempts + 1);
  const src = img.src;
  setTimeout(() => {
    img.src = "";
    img.src = src;
  }, 400 * (attempts + 1));
}
noaaChart.on("tileerror", retryFailedTile);
noaaChartNav.on("tileerror", retryFailedTile);

// NOAA/NCEI CUDEM (Continuously Updated Digital Elevation Model) — a ~3m
// bathymetric-topographic grid. Added because NOAA's own nautical chart
// rates its survey confidence for Jolly Bay as CATZOC D, its lowest
// category (see docs/atlas.md); this is real, meaningfully finer-resolution
// elevation data that does cover this exact water (verified directly
// against Jolly Bay's coordinates — NOAA's own BlueTopo bathymetric
// compilation, by contrast, returns NoData here entirely).
//
// Served from an Esri ImageServer, not a pre-styled WMS chart layer, so
// tiles are built by hand via exportImage rather than L.tileLayer.wms.
// Uses the service's own built-in "ColorHillshade" rendering rule (a
// shaded-relief bathy/topo color ramp NOAA/NCEI ship specifically for this
// dataset) rather than a hand-rolled colormap — it already renders the
// marsh creek network and shoreline clearly. Values are NAVD88 elevation,
// not MLLW tidal depth, so treat this as relative shallow/deep relief and
// creek-network reference, not exact soundings.
const CUDEM_URL = "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_tiles_mosaic/ImageServer/exportImage";
const CUDEM_RENDERING_RULE = JSON.stringify({ rasterFunction: "ColorHillshade" });

const CudemTileLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const tileBounds = this._tileCoordsToBounds(coords);
    const nw = L.CRS.EPSG3857.project(tileBounds.getNorthWest());
    const se = L.CRS.EPSG3857.project(tileBounds.getSouthEast());
    const params = new URLSearchParams({
      bbox: [nw.x, se.y, se.x, nw.y].join(","),
      bboxSR: "102100",
      imageSR: "102100",
      size: `${this.options.tileSize},${this.options.tileSize}`,
      format: "png",
      renderingRule: CUDEM_RENDERING_RULE,
      f: "image",
    });
    return `${CUDEM_URL}?${params.toString()}`;
  },
});

const bathymetry = new CudemTileLayer("", {
  tileSize: 256,
  maxZoom: 17,
  attribution: "Bathymetry: NOAA/NCEI CUDEM",
  errorTileUrl: FALLBACK_TILE,
});

// Fish sit on a depth CHANGE — a ledge, a channel edge, a drop-off — not on
// a depth number by itself. The bathymetry layer above shows relief but not
// precisely where the breaks are; tight contour lines (every 0.5m, using the
// same ImageServer's built-in Contour function) make those breaks legible
// the way a topo map does, and are a checkbox overlay (not a base layer) so
// they can be combined with Satellite or the bathymetry layer underneath.
const CONTOUR_RENDERING_RULE = JSON.stringify({
  rasterFunction: "Contour",
  rasterFunctionArguments: { ContourType: 0, ZFactor: 1, Interval: 0.5 },
});

const DepthContourLayer = L.TileLayer.extend({
  getTileUrl(coords) {
    const tileBounds = this._tileCoordsToBounds(coords);
    const nw = L.CRS.EPSG3857.project(tileBounds.getNorthWest());
    const se = L.CRS.EPSG3857.project(tileBounds.getSouthEast());
    const params = new URLSearchParams({
      bbox: [nw.x, se.y, se.x, nw.y].join(","),
      bboxSR: "102100",
      imageSR: "102100",
      size: `${this.options.tileSize},${this.options.tileSize}`,
      format: "png32",
      transparent: "true",
      renderingRule: CONTOUR_RENDERING_RULE,
      f: "image",
    });
    return `${CUDEM_URL}?${params.toString()}`;
  },
});

const depthContours = new DepthContourLayer("", {
  tileSize: 256,
  maxZoom: 17,
  attribution: "Depth contours: NOAA/NCEI CUDEM",
  opacity: 0.85,
});

osm.addTo(map);

const layersControl = L.control.layers(
  { "OpenStreetMap": osm, "Satellite (Esri)": satellite, "NOAA Nautical Chart": noaaChart, "NOAA Nautical Chart w/ NAV": noaaChartNav, "Bathymetry (NOAA/NCEI)": bathymetry },
  { "Depth Contours (0.5m)": depthContours },
  { collapsed: window.innerWidth < 700 }
).addTo(map);

// ── "MY LOCATION" (GPS) ───────────────────────────────────────────────────
// This map is meant to be read from a boat — knowing where you actually are
// relative to the mapped spots matters more here than in most web maps.
// `watch: true` keeps updating as you move rather than a one-shot fix.
let locationMarker = null;
let locationAccuracyCircle = null;

const LocateControl = L.Control.extend({
  options: { position: "topleft" },
  onAdd() {
    const container = L.DomUtil.create("div", "leaflet-bar atlas-locate-control");
    const button = L.DomUtil.create("a", "", container);
    button.href = "#";
    button.title = "Show my location";
    button.setAttribute("role", "button");
    button.setAttribute("aria-label", "Show my location");
    button.textContent = "📍";
    L.DomEvent.on(button, "click", (evt) => {
      L.DomEvent.stop(evt);
      button.classList.add("atlas-locate-pending");
      map.locate({ watch: true, enableHighAccuracy: true, setView: false, maxZoom: 17 });
    });
    return container;
  },
});
map.addControl(new LocateControl());

map.on("locationfound", (e) => {
  document.querySelector(".atlas-locate-control a")?.classList.remove("atlas-locate-pending");
  if (!locationMarker) {
    locationMarker = L.circleMarker(e.latlng, { radius: 8, color: "#38bdf8", weight: 2, fillColor: "#38bdf8", fillOpacity: 0.9 })
      .addTo(map)
      .bindPopup("You are here", { autoPanPaddingTopLeft: [56, 130], autoPanPaddingBottomRight: [220, 10] });
    locationAccuracyCircle = L.circle(e.latlng, { radius: e.accuracy, color: "#38bdf8", weight: 1, fillOpacity: 0.08 }).addTo(map);
    map.setView(e.latlng, Math.max(map.getZoom(), 14));
  } else {
    locationMarker.setLatLng(e.latlng);
    locationAccuracyCircle.setLatLng(e.latlng).setRadius(e.accuracy);
  }
});

map.on("locationerror", (e) => {
  document.querySelector(".atlas-locate-control a")?.classList.remove("atlas-locate-pending");
  L.popup({ className: "atlas-leaflet-popup", autoPanPaddingTopLeft: [56, 130], autoPanPaddingBottomRight: [220, 10] })
    .setLatLng(map.getCenter())
    .setContent(`<div class="atlas-popup"><div class="atlas-popup-title">Couldn't get your location</div><div class="atlas-popup-caveat">${escapeHtml(e.message)}</div></div>`)
    .openOn(map);
});

// ── DEPTH SAMPLING (click the Bathymetry layer) ──────────────────────────
// The CUDEM tiles above are a visual backdrop only — this makes them an
// actual tool by querying the same ImageServer's `identify` operation for
// the exact elevation under the click. Endpoint sends
// Access-Control-Allow-Origin: * (verified directly), so a plain fetch()
// works without a proxy.
const CUDEM_IDENTIFY_URL = "https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_tiles_mosaic/ImageServer/identify";

async function fetchCudemElevation(lat, lng) {
  const params = new URLSearchParams({
    geometry: JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }),
    geometryType: "esriGeometryPoint",
    returnGeometry: "false",
    f: "json",
  });
  const res = await fetch(`${CUDEM_IDENTIFY_URL}?${params.toString()}`);
  if (!res.ok) throw new Error(`identify request failed (${res.status})`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "identify error");
  return data;
}

map.on("click", async (e) => {
  if (!map.hasLayer(bathymetry)) return; // only meaningful while the depth layer is actually showing
  const popup = L.popup({ className: "atlas-leaflet-popup", maxWidth: 260, autoPanPaddingTopLeft: [56, 130], autoPanPaddingBottomRight: [220, 10] })
    .setLatLng(e.latlng)
    .setContent(`<div class="atlas-popup"><div class="atlas-popup-title">Sampling depth…</div></div>`)
    .openOn(map);

  try {
    const result = await fetchCudemElevation(e.latlng.lat, e.latlng.lng);
    const raw = result?.value;
    const meters = raw != null && raw !== "NoData" ? Number.parseFloat(raw) : null;
    popup.setContent(
      meters != null && Number.isFinite(meters)
        ? `<div class="atlas-popup">
            <div class="atlas-popup-title">${meters <= 0 ? "Depth" : "Elevation"} here</div>
            <div class="atlas-popup-row"><span class="atlas-popup-label">NAVD88</span><span class="atlas-popup-value">${Math.abs(meters).toFixed(2)} m (${Math.abs(meters * 3.28084).toFixed(1)} ft) ${meters <= 0 ? "below" : "above"}</span></div>
            <div class="atlas-popup-caveat">NAVD88 elevation, not tidal (MLLW) depth — treat as relative relief, not an exact sounding at low tide. Source: NOAA/NCEI CUDEM.</div>
          </div>`
        : `<div class="atlas-popup">
            <div class="atlas-popup-title">No data here</div>
            <div class="atlas-popup-caveat">NOAA/NCEI's bathymetry grid has no coverage at this exact point.</div>
          </div>`
    );
  } catch (err) {
    popup.setContent(`<div class="atlas-popup"><div class="atlas-popup-title">Couldn't fetch depth</div><div class="atlas-popup-caveat">${escapeHtml(err.message)}</div></div>`);
  }
});

// ── DATA LOADING ─────────────────────────────────────────────────────────
async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function fishingContextForFeature(layerMeta, feature, intelligence) {
  if (!intelligence) return null;
  let profileKey = layerMeta.key;
  if (layerMeta.key === "fishing_locations") {
    profileKey = intelligence.habitatProfileMap?.[feature.properties?.habitat] || "fishing_locations";
  }
  const profile = intelligence.profiles?.[profileKey] || intelligence.profiles?.fishing_locations;
  return profile ? { profile, packet: intelligence } : null;
}

// A same-color stroke on a filled marker gives no edge contrast against a
// busy basemap — a light green dot on light green marsh reads as almost
// nothing. A black outline reads against any background color, so most
// point/polygon shapes get one regardless of fill; LineStrings (the
// channel centerlines) keep their own color as the stroke since a line has
// no separate fill to outline. creek_mouths/shoreline_points are excluded
// by request — their own fill color as a thin same-color edge instead of
// the black ring, once they got distinct pink/violet fills of their own.
const MARKER_OUTLINE = "#000000";
const NO_BLACK_OUTLINE = new Set(["creek_mouths", "shoreline_points"]);

function buildFeatureLayer(layerMeta, featureCollection, intelligence) {
  const outlineColor = NO_BLACK_OUTLINE.has(layerMeta.key) ? layerMeta.color : MARKER_OUTLINE;
  return L.geoJSON(featureCollection, {
    pointToLayer: (feature, latlng) => L.circleMarker(latlng, {
      radius: layerMeta.key === "fishing_locations" ? 9 : 6,
      color: outlineColor,
      weight: 2,
      fillColor: layerMeta.color,
      fillOpacity: 0.9,
    }),
    style: (feature) => ({
      color: feature.geometry?.type === "LineString" ? layerMeta.color : outlineColor,
      weight: feature.geometry?.type === "LineString" ? 3 : 2,
      fillColor: layerMeta.color,
      fillOpacity: feature.geometry?.type === "Point"
        ? 0.9
        : feature.geometry?.type === "Polygon" ? 0.25 : 0,
    }),
    onEachFeature: (feature, leafletLayer) => {
      const fishingContext = fishingContextForFeature(layerMeta, feature, intelligence);
      const isLocation = layerMeta.key === "fishing_locations";
      const buildHtml = () => isLocation
        ? buildLocationPopup(feature.properties, fishingContext)
        : buildFeaturePopup(feature.properties, layerMeta.label, fishingContext);
      // Extra autoPan padding on all four sides: Leaflet's controls (zoom
      // + GPS locate top-left, layer control top-right, the header bar)
      // sit ABOVE popups in z-index by Leaflet's own default CSS, so a
      // popup opening close to any of them renders partly underneath —
      // its buttons (or even its title) become unclickable/unreadable
      // because the control captures the click/paints over the text
      // instead. Confirmed directly for the easternmost marker (Deep
      // Bend, layer control) and for Hewett Bayou on a mobile viewport
      // (the zoom+locate column, measured via getBoundingClientRect at
      // 44x118px, is far wider/taller than the old 10px left padding).
      // This keeps the autopan far enough from all of them.
      leafletLayer.bindPopup(buildHtml(), {
        maxWidth: 340,
        maxHeight: 420,
        className: "atlas-leaflet-popup",
        autoPanPaddingTopLeft: [56, 130],
        autoPanPaddingBottomRight: [220, 10],
      });

      // fishing_locations popups carry a device-local catch-log form (see
      // catchlog.js) — regenerate content fresh on every open (so a catch
      // logged a minute ago shows up) and re-wire the form/delete buttons,
      // since Leaflet tears down the popup's DOM node when it closes.
      if (isLocation) {
        leafletLayer.on("popupopen", (e) => {
          e.popup.setContent(buildHtml());
          wirePopupInteractivity(e.popup, feature.properties.id, intelligence, buildHtml, featureCollection.features);
        });
      }
    },
  });
}

function wirePopupInteractivity(popup, locationId, intelligence, buildHtml, allLocations) {
  const el = popup.getElement();
  if (!el) return;

  const form = el.querySelector(".atlas-catchlog-form");
  if (form) {
    form.addEventListener("submit", (evt) => {
      evt.preventDefault();
      const species = form.elements.species.value.trim();
      const note = form.elements.note.value.trim();
      if (!species) return;
      const cc = intelligence?.currentConditions;
      const conditions = cc ? { wind: cc.wind, tide: cc.tide, pressure: cc.pressure } : null;
      addCatch(locationId, { species, note, conditions });
      popup.setContent(buildHtml());
      wirePopupInteractivity(popup, locationId, intelligence, buildHtml, allLocations);
    });
  }

  el.querySelectorAll(".atlas-catchlog-delete").forEach((btn) => {
    btn.addEventListener("click", () => {
      deleteCatch(btn.dataset.catchId);
      popup.setContent(buildHtml());
      wirePopupInteractivity(popup, locationId, intelligence, buildHtml, allLocations);
    });
  });

  const runToggle = el.querySelector(".atlas-run-toggle");
  if (runToggle) {
    runToggle.addEventListener("click", () => {
      // Deferred to the next tick: calling popup.setContent() synchronously
      // inside a native "click" handler on an element still mid-bubble
      // closes the popup (confirmed directly — Leaflet's click-propagation
      // guard on the popup content doesn't survive the content node being
      // replaced while that same click is still dispatching). The
      // catch-log form's handlers don't hit this because they're wired to
      // "submit", which only fires after the triggering click has already
      // finished bubbling.
      setTimeout(() => {
        toggleStop(locationId);
        popup.setContent(buildHtml());
        wirePopupInteractivity(popup, locationId, intelligence, buildHtml, allLocations);
        renderTodaysRun(allLocations);
      }, 0);
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function timeToMinutes(time) {
  const m = String(time || "").match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let hours = Number.parseInt(m[1], 10) % 12;
  if (/PM/i.test(m[3])) hours += 12;
  return hours * 60 + Number.parseInt(m[2], 10);
}

// Computes "incoming, high in 1h 20m" from today's two tide events (this
// location has a diurnal tide — one high, one low per day), the same
// extend-by-average-spacing approach the main dashboard's tide curve uses so
// a single H/L near midnight doesn't break the "what's next" lookup.
function describeTideNow(tideEvents) {
  if (!Array.isArray(tideEvents) || tideEvents.length < 2) return null;
  const pts = tideEvents
    .map((e) => ({ ...e, mins: timeToMinutes(e.time) }))
    .filter((e) => e.mins != null)
    .sort((a, b) => a.mins - b.mins);
  if (pts.length < 2) return null;

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const avgInterval = (pts[pts.length - 1].mins - pts[0].mins) / (pts.length - 1) || 360;

  const anchors = [...pts];
  while (anchors[0].mins > nowMins - 720) {
    anchors.unshift({ mins: anchors[0].mins - avgInterval, type: anchors[0].type === "H" ? "L" : "H" });
  }
  while (anchors[anchors.length - 1].mins < nowMins + 720) {
    anchors.push({ mins: anchors[anchors.length - 1].mins + avgInterval, type: anchors[anchors.length - 1].type === "H" ? "L" : "H" });
  }

  let next = anchors[anchors.length - 1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (anchors[i].mins <= nowMins && anchors[i + 1].mins >= nowMins) {
      next = anchors[i + 1];
      break;
    }
  }

  const untilMins = Math.max(0, Math.round(next.mins - nowMins));
  const hours = Math.floor(untilMins / 60), mins = untilMins % 60;
  const untilLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return { direction: next.type === "H" ? "Incoming" : "Outgoing", nextLabel: next.type === "H" ? "high" : "low", untilLabel };
}

// Only trust "right now" tide timing against today's actual events — if the
// daily refresh has fallen behind (see docs/atlas.md on the deploy
// pipeline), currentReport.date is a stale day and computing "high in 20m"
// against yesterday's times would be actively misleading, worse than not
// showing it.
function isDateToday(dateISO) {
  if (!dateISO) return false;
  const now = new Date();
  const localISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return dateISO === localISO;
}

function renderCurrentIntelligence(intelligence) {
  if (!intelligence?.currentReport) return;
  const panel = document.getElementById("atlas-intelligence-panel");
  const content = document.getElementById("atlas-intelligence-content");
  const currentSpecies = (intelligence.speciesSignals || []).filter((signal) => signal.current);
  const sourceMap = new Map((intelligence.sources || []).map((source) => [source.id, source]));
  const sourceLinks = (intelligence.currentReport.sourceIds || [])
    .map((id) => sourceMap.get(id))
    .filter(Boolean)
    .map((source) => {
      const url = safeHttpUrl(source.url);
      return url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
        : "";
    })
    .filter(Boolean)
    .join(" · ");
  const conditions = intelligence.currentConditions || {};
  const tideNow = isDateToday(intelligence.currentReport.date) ? describeTideNow(conditions.tideEvents) : null;
  const signalMap = new Map((intelligence.speciesSignals || []).map((signal) => [signal.key, signal]));
  const timelineHtml = (intelligence.archivedReports || []).slice(0, 6).map((report) => {
    const species = (report.species || [])
      .map((key) => signalMap.get(key)?.label)
      .filter(Boolean)
      .join(", ");
    const source = (report.sourceIds || []).map((id) => sourceMap.get(id)).find(Boolean);
    const sourceUrl = safeHttpUrl(source?.url);
    const sourceHtml = sourceUrl
      ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
      : escapeHtml(report.attribution);
    return `<li><strong>${escapeHtml(report.displayDate || report.date)}</strong><span>${escapeHtml(species || "No positive species signal")}</span>${sourceHtml}</li>`;
  }).join("");

  content.innerHTML = `
    <div class="atlas-intel-date">Regional report · ${escapeHtml(intelligence.currentReport.displayDate)}</div>
    <div class="atlas-intel-species">
      ${currentSpecies.map((species) => `<span>${escapeHtml(species.label)}</span>`).join("")}
    </div>
    <div class="atlas-intel-conditions">
      ${conditions.waterTemp != null ? `<span>🌡️ ${escapeHtml(conditions.waterTemp)}°F water</span>` : ""}
      ${conditions.wind ? `<span>💨 ${escapeHtml(conditions.wind)}</span>` : ""}
      ${tideNow
        ? `<span>🌊 ${escapeHtml(tideNow.direction)} — ${escapeHtml(tideNow.nextLabel)} in ${escapeHtml(tideNow.untilLabel)}</span>`
        : conditions.tide ? `<span>🌊 ${escapeHtml(conditions.tide)}</span>` : ""}
      ${conditions.pressure
        ? `<span>${conditions.pressure.direction === "falling" ? "📉" : conditions.pressure.direction === "rising" ? "📈" : "➡️"} Pressure ${escapeHtml(conditions.pressure.direction)} (${escapeHtml(conditions.pressure.hpa)} mb)</span>`
        : ""}
    </div>
    <details class="atlas-intel-report">
      <summary>Read current regional report</summary>
      <p>${escapeHtml(intelligence.currentReport.summary)}</p>
    </details>
    <div class="atlas-intel-evidence">${escapeHtml(intelligence.archivedReports?.length || 0)} archived report records support the trend view.</div>
    ${timelineHtml ? `
      <details class="atlas-intel-report atlas-intel-timeline">
        <summary>View archived evidence timeline</summary>
        <ul>${timelineHtml}</ul>
      </details>
    ` : ""}
    ${sourceLinks ? `<div class="atlas-intel-sources"><span>Current sources:</span> ${sourceLinks}</div>` : ""}
    <div class="atlas-intel-caveat">${escapeHtml(intelligence.scopeNote)}</div>
  `;
  panel.hidden = false;
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

let runPolyline = null;

// Redraws both the sidebar list and the connecting line on the map from
// whatever's currently in localStorage — called after every toggle/reorder/
// clear so the two stay in sync, and once at load in case a run was already
// saved from a previous visit.
function renderTodaysRun(fishingLocationsRaw) {
  const panel = document.getElementById("atlas-run-panel");
  const list = document.getElementById("atlas-run-list");
  const totalEl = document.getElementById("atlas-run-total");
  const byId = new Map(fishingLocationsRaw.map((f) => [f.properties.id, f]));
  const stops = getRun().map((id) => byId.get(id)).filter((f) => f && f.geometry);

  if (runPolyline) {
    map.removeLayer(runPolyline);
    runPolyline = null;
  }

  if (!stops.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;

  let totalNm = 0;
  list.innerHTML = stops.map((feature, i) => {
    const legNm = i > 0
      ? nauticalMilesBetween(
          stops[i - 1].geometry.coordinates[1], stops[i - 1].geometry.coordinates[0],
          feature.geometry.coordinates[1], feature.geometry.coordinates[0]
        )
      : 0;
    totalNm += legNm;
    return `
      <li class="atlas-run-item">
        <span class="atlas-run-order">${i + 1}</span>
        <span class="atlas-run-name">${escapeHtml(feature.properties.name)}</span>
        ${i > 0 ? `<span class="atlas-run-leg">+${legNm.toFixed(1)} nm</span>` : ""}
        <button type="button" class="atlas-run-move" data-move="-1" data-location-id="${feature.properties.id}" ${i === 0 ? "disabled" : ""} aria-label="Move up">&uarr;</button>
        <button type="button" class="atlas-run-move" data-move="1" data-location-id="${feature.properties.id}" ${i === stops.length - 1 ? "disabled" : ""} aria-label="Move down">&darr;</button>
      </li>`;
  }).join("");
  totalEl.textContent = stops.length > 1 ? `Total: ${totalNm.toFixed(1)} nm straight-line` : "";

  const latlngs = stops.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]);
  runPolyline = L.polyline(latlngs, { color: "#facc15", weight: 3, dashArray: "6,8", opacity: 0.85 }).addTo(map);
}

async function init() {
  let registry;
  let intelligence = null;
  try {
    registry = await fetchJson("atlas/layers.json");
  } catch (err) {
    document.getElementById("atlas-map").innerHTML = `<div class="atlas-error">Couldn't load atlas layer data (${err.message}). Run "npm run atlas:export" and rebuild.</div>`;
    return;
  }

  try {
    intelligence = await fetchJson("atlas/intelligence.json");
    renderCurrentIntelligence(intelligence);
  } catch {
    // The map remains usable if the optional intelligence packet is absent.
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

    const leafletLayer = buildFeatureLayer(layerMeta, featureCollection, intelligence);
    const controlLabel = `${layerMeta.label} (${plottedFeatureCount})`;
    if (layerMeta.defaultVisible) leafletLayer.addTo(map);
    layersControl.addOverlay(leafletLayer, controlLabel);

    if (layerMeta.key === "fishing_locations") {
      fishingLocationsLayer = leafletLayer;
      fishingLocationsRaw = featureCollection.features;
    }
  }

  // fishing_locations is the ONLY layer with the wind-shelter badge, "add to
  // today's run" toggle, and catch log — the layer loop above adds layers in
  // db sort_order, which puts Channels/Creek Mouths/etc after (on top of)
  // fishing_locations in the SVG stacking order. Since several of those
  // lines run close to or through the small (radius-9) location markers,
  // clicking near a marker often hit the wider line underneath it instead,
  // landing on a plain habitat-feature popup with none of the new features
  // — found by clicking "the first visible interactive thing" on the live
  // site exactly as a real user would. bringToFront() fixes the z-order so
  // a click on/near a marker actually hits the marker.
  fishingLocationsLayer?.bringToFront();
  // Any other overlay toggled on later re-stacks on top by default — keep
  // fishing_locations above all of them regardless of what gets enabled.
  map.on("overlayadd", () => fishingLocationsLayer?.bringToFront());

  if (!fishingLocationsRaw.length) return;

  // Fit the initial view to whatever's actually plotted, rather than the
  // fixed Jolly-Bay-only center/zoom above — this now spans most of
  // Choctawhatchee Bay (2026-07-29: added 331 Bridge, LaGrange, Four Mile
  // Creek, Hogtown, Mack, and Hewett alongside the Jolly Bay pilot), and a
  // fixed zoom would leave most of them off-screen. Recomputes automatically
  // as more locations get added later — no hardcoded bounds to maintain.
  const located = fishingLocationsRaw.filter((f) => f.geometry);
  if (located.length > 1) {
    const bounds = L.latLngBounds(located.map((f) => [f.geometry.coordinates[1], f.geometry.coordinates[0]]));
    map.fitBounds(bounds, { padding: [40, 40] });
  }

  renderPendingList(fishingLocationsRaw);
  renderTodaysRun(fishingLocationsRaw);

  document.getElementById("atlas-run-clear").addEventListener("click", () => {
    clearRun();
    renderTodaysRun(fishingLocationsRaw);
  });
  document.getElementById("atlas-run-list").addEventListener("click", (e) => {
    const btn = e.target.closest(".atlas-run-move");
    if (!btn) return;
    moveStop(Number(btn.dataset.locationId), Number(btn.dataset.move));
    renderTodaysRun(fishingLocationsRaw);
  });

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
