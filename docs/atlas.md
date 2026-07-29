# Fishing Intelligence Atlas — Phase 1

Interactive fishing map, piloted for Jolly Bay (Walton County, FL). Lives
alongside the existing 331 Bridge daily-conditions app but is deliberately
**not** part of it — see [Why a standalone page](#why-a-standalone-page)
below.

Open it at `/atlas.html` (dev: `http://localhost:5173/331-fishing-report/atlas.html`).

## Architecture

```
db/atlas.db (SQLite, committed)
   │  edited directly with `sqlite3 db/atlas.db`, or via db/schema.sql +
   │  db/seed/*.sql for a fresh build
   ▼
scripts/export-atlas-geojson.mjs   (Node, npm run atlas:export)
   ▼
public/atlas/layers.json           (layer registry)
public/atlas/geojson/*.geojson     (one FeatureCollection per layer)
   │  static files, served by GitHub Pages exactly like public/history/*.json
   ▼
atlas.html + src/atlas/main.js     (Leaflet, vanilla JS, no React)
```

No server, no live database query at runtime — GitHub Pages only serves
static files, so the SQLite database is a **build-time authoring tool**,
not something the browser ever talks to.

### Why SQLite + Node, not SQLite + Python

The Atlas brief's preferred pipeline was `SQLite → Python export → GeoJSON`.
This repo has no Python anywhere — every existing automation script
(`scripts/*.mjs`) is Node, and CI (`.github/workflows/`) only sets up Node.
Rather than introduce a second language/toolchain for one script, the
export is `scripts/export-atlas-geojson.mjs`, using Node's built-in
`node:sqlite` module (no external dependency, no native build step — works
the same in CI as it does locally). SQLite itself is unchanged from the
brief: `db/atlas.db` is the real, evolving, committed datastore.

### Why a standalone page

`atlas.html` is a second Vite entry point (see `vite.config.js`
`build.rollupOptions.input`), not a tab inside `src/App.jsx`. Two reasons:
- Leaflet manages its own DOM imperatively; wiring it into React's render
  cycle needs either `react-leaflet` (a new dependency) or careful ref
  management. Keeping it vanilla JS avoids both.
- `App.jsx` is already the largest file in the repo (~1500 lines). The
  Atlas is a big enough feature that it deserves its own surface rather
  than growing that file further.

Both pages share the same GitHub Pages deploy (`npm run build` now emits
`dist/index.html` **and** `dist/atlas.html`) — nothing about deployment
changed. If the Atlas matures and closer integration makes sense (e.g. a
"View on map" link from a daily-conditions location card), that's a small,
deliberate follow-up, not a rewrite.

## Database (`db/schema.sql`)

| Table | Purpose |
|---|---|
| `layers` | Registry of every map layer — key, label, geometry type, color, default visibility. Drives the layer control UI and constrains `habitat_features.layer_key`. |
| `habitats` | Lookup: grass_flat, oyster_bar, hard_bottom, channel, drop_off, creek_mouth, sand_hole, point, deep_hole. |
| `species` | Lookup: redfish, speckled_trout, flounder, etc — kept consistent with the species already named in `src/App.jsx`. |
| `locations` | Named fishing waypoints — the richest table, backing the popup fields in STEP 7 (habitat, depth, tide, wind, season, lures, access, confidence, validation, source). `lat`/`lng` are nullable **on purpose** — a location can exist before it's field-validated. `exposed_directions_json` (added 2026-07-28) is a JSON array of 8-point compass directions this spot has open-water fetch toward, used for the live "protected/exposed today" wind check — see "On-the-water interaction features" below. |
| `location_species` | Many-to-many: which species at which location, each with its own confidence + note. |
| `catches` | Catch history — species, size, method, angler, date, per location. |
| `observations` | Environmental snapshots (water temp/clarity, tide stage, wind) tied to a location and a point in time — distinct from a catch. |
| `habitat_features` | One generic table for every layer that *isn't* a named waypoint (grass flats, oyster areas, channels, redfish routes, boat ramps, hazards, etc). `geometry_json` holds a raw GeoJSON geometry (Point/LineString/Polygon), `NULL` until surveyed. A single generic table instead of ~13 near-identical ones, keyed by `layer_key`. |

Every table carries `confidence` (0–100) and `validation_status`
(`placeholder` / `user_reported` / `field_verified` / `guide_verified`), per
STEP 6.

**Schema changes**: edit `db/schema.sql`, note the change in the commit
message (`git log db/schema.sql` is the change history), then either
hand-migrate `db/atlas.db` with `sqlite3` or rebuild from scratch (below).

## Building / editing the database

```bash
# Fresh clone / first time — creates db/atlas.db from schema.sql + db/seed/*.sql
npm run atlas:db

# Reset back to the seed data, discarding any hand-entered rows (guarded —
# refuses to run without --force if atlas.db already exists)
node scripts/build-atlas-db.mjs --force
```

Day to day, edit `db/atlas.db` directly:

```bash
sqlite3 db/atlas.db

-- e.g. once North Grass Flat has been field-checked:
UPDATE locations
SET lat = 30.4XXX, lng = -86.1XXX,
    validation_status = 'field_verified',
    confidence = 70,
    last_updated = datetime('now')
WHERE name = 'North Grass Flat';

-- add a species at that location:
INSERT INTO location_species (location_id, species_id, confidence, note)
SELECT l.id, s.id, 80, 'Tailing on incoming tide'
FROM locations l, species s
WHERE l.name = 'North Grass Flat' AND s.key = 'redfish';
```

`db/atlas.db` is committed to git (small binary, like any other source
file — this repo has no server, so git is the only persistence layer).
`db/schema.sql` and `db/seed/*.sql` stay as readable, versioned reference
for the original structure and pilot seed, independent of whatever
`atlas.db` has grown into since.

## Generating map data

After any edit to `db/atlas.db`:

```bash
npm run atlas:export
```

Writes `public/atlas/layers.json` and `public/atlas/geojson/<layer_key>.geojson`
(one file per layer, always a valid `FeatureCollection`, empty array if the
layer has no features yet). Commit the regenerated files alongside your
`db/atlas.db` edit — the map only ever reads these static files, never the
database.

## GeoJSON layer system

17 layers, defined in `db/seed/layers.sql` / the `layers` table:

`fishing_locations`, `grass_flats`, `oyster_areas`, `hard_bottom`,
`channels`, `drop_offs`, `creek_mouths`, `sand_holes`, `shoreline_points`, `redfish_routes`,
`trout_habitat`, `flounder_habitat`, `kayak_launches`, `boat_ramps`,
`hazards`, `navigation_cautions`, `user_catches`.

Creek mouths are stored as points (the visible outlet location). Navigation
cautions are polygons and remain separate from point-based charted hazards.
Structure packets can be validated and idempotently imported with:

```bash
npm run atlas:import-structures -- /path/to/packet.geojson
npm run atlas:export
```

The importer refuses unknown layers, mismatched geometry types, out-of-region
coordinates, promoted field-verification claims, and unsafe registry type
changes when incompatible stored geometry already exists.

Each is independently toggleable via Leaflet's layer control (top-right of
the map). `fishing_locations` is exported from the `locations` table (with
habitat/species joined in); every other layer reads `habitat_features`
filtered by `layer_key`. Most start empty (0 features) — this is
intentional per the brief ("build the framework, not the data"); they'll
populate as real habitat/route/hazard data is digitized.

A `Feature` with no coordinates yet (`geometry: null`) is valid GeoJSON and
is what unlocated `locations` rows export as. Leaflet silently skips
null-geometry features when rendering — `src/atlas/main.js` instead lists
them in the sidebar's "Pending Field Validation" panel, so they're visible
without being (inaccurately) plotted anywhere.

## Popups (STEP 7)

`src/atlas/popup.js` builds popup HTML for `fishing_locations` features:
a wind-shelter badge, an "add to today's run" toggle, name, habitat, species
(with confidence), typical depth, best tide/wind/season, best lures, access
notes, confidence, validation status, source, last updated, catch count
(from `catches`, once any exist), and the device-local catch log form (see
"On-the-water interaction features" below). `habitat_features` layers get a
lighter generic popup (name, layer, confidence, validation, source, updated)
— no shelter badge, run toggle, or catch log, since those are specific to
named fishing spots, not generic habitat/hazard geometry.

Both popup types also consume `public/atlas/intelligence.json`, generated by
`npm run atlas:intelligence`. That packet combines the current regional bite
report, archived app snapshots, dated source reports, and curated FWC habitat
guidance. Regional evidence can support likely species, timing, and techniques,
but it is explicitly kept separate from spot-specific catches or field
verification. Source URLs and report dates remain visible in the Atlas.

The daily refresh rebuilds and commits the intelligence packet after updating
conditions and bite-report research, so the Atlas trend view follows the same
current-and-archived reporting pipeline as the main report.

## Filtering (STEP 9)

`src/atlas/filters.js` — species, habitat, confidence (minimum, slider),
season (substring match against `best_season`), validation status, access
type. The species/habitat dropdowns populate from whatever data actually
exists (not a hardcoded list), so they only ever offer real options.

## Scoring framework (STEP 10)

`src/atlas/scoring.js` exports `explainScore(locationProps, conditions)` —
a named, documented slot for each future input (wind, tide, current,
season, water temp, water clarity, rainfall, time of day, historical
catches, habitat suitability). **It does not compute a score.** Every
factor returns `contribution: null, note: "not yet implemented"`. When
scoring is implemented, keep that shape — a score should always be
traceable back to which factors contributed what, not a black-box number.
`conditions` is reserved for reuse of the weather/tide data this app
already fetches for the daily report (`src/data/conditions.json`), so
scoring doesn't need to re-fetch anything.

## Base maps (STEP 4)

Switchable base layers, no Google tiles:

- **OpenStreetMap** — standard `{s}.tile.openstreetmap.org`, `©
  OpenStreetMap contributors`.
- **Satellite (Esri)** — `server.arcgisonline.com/.../World_Imagery`,
  attribution `Esri — Source: Esri, Maxar, Earthstar Geographics, and the
  GIS User Community`. Free for this kind of small-scale, non-commercial
  use under Esri's standard terms; re-check
  [Esri's terms](https://www.esri.com/en-us/legal/terms/full-master-agreement)
  if this app's traffic or use ever changes materially.
- **NOAA Nautical Chart** — NOAA's Chart Display Service (NCDS), which
  replaced the retired `tileservice.charts.noaa.gov` RNC service in 2021.
  Served as a WMS layer (`gis.charttools.noaa.gov/.../WMSServer`), requesting
  only sublayers `1,2,3,11` (natural/man-made features, depths & soundings,
  seabed/obstructions, shallow-water pattern) rather than the full `0-12`
  stack — this app is fishing reference, not a navigation aid, and layers
  `8`/`9` (data quality / low accuracy) render as a tiled "CATZOC"
  triangle-and-star pattern that just obscures the sounding numbers anglers
  actually want; `0`/`4`-`7`/`10`/`12` are chart-display boxes, traffic
  routes, and overscale warnings, none of it relevant here. Attribution
  `NOAA/NOS Office of Coast Survey`. Verified directly against Jolly Bay's
  bounding box before shipping. Public domain (US federal government work)
  — no licensing restriction, but it's a transparent overlay-style layer:
  outside charted marine areas it renders as empty transparent tiles over
  the page background, so it reads best zoomed into actual water.
- **Bathymetry (NOAA/NCEI)** — NOAA/NCEI's CUDEM (Continuously Updated
  Digital Elevation Model), a ~3m-resolution bathymetric-topographic grid,
  added because the nautical chart above rates its own survey confidence
  for Jolly Bay as CATZOC `D`, its lowest category — meaningfully finer
  data does exist and does cover this exact water (confirmed directly
  against Jolly Bay's coordinates; NOAA's BlueTopo bathymetric compilation,
  by contrast, returns NoData here entirely). Served from an Esri
  ImageServer (`gis.ngdc.noaa.gov/.../DEM_mosaics/DEM_tiles_mosaic`), so
  tiles are built by hand in `src/atlas/main.js` (`CudemTileLayer`) via
  `exportImage` rather than `L.tileLayer.wms`. Uses the service's own
  built-in `ColorHillshade` rendering rule (NOAA/NCEI's own shaded-relief
  bathy/topo color ramp for this dataset) rather than a hand-rolled
  colormap — already renders the marsh creek network and shoreline
  clearly. Values are NAVD88 elevation, not MLLW tidal depth, so treat this
  as relative shallow/deep relief and creek-network reference, not exact
  soundings — converting to a tidal datum via NOAA's VDatum would be
  needed for that. Public domain (US federal government work).

## On-the-water interaction features

Added to make the map actionable while actually out fishing, not just a
static reference:

- **Depth sampling** — clicking the map while the Bathymetry (NOAA/NCEI)
  layer is active queries that same ImageServer's `identify` operation for
  the exact elevation under the click and shows it in a popup (`src/atlas/main.js`,
  the `map.on("click", ...)` handler near "DEPTH SAMPLING"). Same NAVD88
  caveat as the layer itself applies to the sampled value.
- **Real-time tide status** — the "Current Bay Fishing" sidebar panel shows
  a computed "Incoming — high in 1h 20m" line (`describeTideNow()`) instead
  of just today's raw high/low times, using the same tide-event data and
  extend-by-average-spacing approach as the main dashboard's tide curve.
  Guarded by `isDateToday()`: if the daily refresh has fallen behind and
  `currentReport.date` isn't actually today, it falls back to the plain
  "High tide ~X · Low tide ~Y" text rather than computing a misleadingly
  confident "high in 20m" against stale times.
- **"My location" (GPS)** — a 📍 control (top-left, next to zoom) calls
  `map.locate({ watch: true })` and plots a marker + accuracy circle,
  updating live as you move. Fails gracefully (a popup, not a crash) if
  geolocation is denied or unavailable — expected on desktop/headless, real
  usage is from a phone/tablet on the water.
- **Barometric pressure trend** — `scripts/update-conditions.mjs`'s
  `getPressureTrend()` pulls current + 3-hours-ago sea-level pressure from
  Open-Meteo and classifies it rising/falling/steady (±0.5 hPa threshold).
  Shown on both the main dashboard's hero card and the Atlas sidebar — a
  falling barometer ahead of a front is a guide's classic "bite's about to
  turn on" signal, and neither NWS nor the app previously surfaced it at all.
- **Wind-shelter matching** — each located Jolly Bay `fishing_locations` row
  carries `exposed_directions_json` (`db/migrations/2026-07-28-wind-exposure.sql`),
  an 8-point-compass array of the directions it has open-water fetch toward,
  assessed visually against Esri imagery (same "visually_reviewed" epistemics
  as everything else in the pilot — not measured, not field verified). Popups
  compute "🟢 Protected today" / "🔴 Exposed today" against the live wind
  direction (`windShelterStatus()` in `src/atlas/popup.js`, 45° tolerance
  either side of each listed direction).
- **Depth Contours overlay** — a checkbox overlay (not a base layer, so it
  combines with Satellite or Bathymetry) drawing 0.5m contour lines from the
  same CUDEM ImageServer's built-in `Contour` rendering rule
  (`DepthContourLayer` in `src/atlas/main.js`). Fish sit on a depth *change*,
  not a depth number — this makes the breaks visually legible the way a topo
  map does, since the bathymetry layer's relief shading alone doesn't.
- **Catch log** (`src/atlas/catchlog.js`) — a per-location form in each
  fishing-location popup, storing entries in `localStorage` (key
  `atlasCatchLog`) with a snapshot of that day's wind/tide/pressure attached
  at log time. This is a static site with no backend (see Architecture
  above) — there's no way to write to `db/atlas.db` from a visitor's
  browser — so this is honestly device-local only, but unlike the main
  dashboard's Trip Log (which needs `window.storage`, a Claude-artifact-only
  API), this actually works on the real deployed GitHub Pages site.
- **Today's run** (`src/atlas/tripplan.js`) — a lightweight multi-stop trip
  sequencer: an "Add to today's run" toggle in each location popup builds an
  ordered list in the sidebar (reorderable, clearable), drawn as a dashed
  line on the map, with straight-line nautical-mile distances between
  consecutive stops (`nauticalMilesBetween()`, haversine). Also
  `localStorage`-backed (key `atlasTodaysRun`), same honesty tradeoff as the
  catch log. Explicitly *not* a real boating route — no marine routing data
  exists here, this is "as the pelican flies" between stops only.

  **Gotcha if you touch this again**: `popup.setContent()` must never be
  called synchronously from inside a native `"click"` listener on an element
  still mid-bubble — confirmed directly (stack trace) that doing so closes
  the popup, because replacing the content node while that same click is
  still dispatching breaks Leaflet's click-propagation guard on the popup.
  The catch-log form doesn't hit this because its handler is wired to
  `"submit"`, which only fires after the triggering click has already
  finished bubbling. The run-toggle button defers its whole handler body in
  a `setTimeout(fn, 0)` specifically to sidestep this.

## Jolly Bay pilot (STEP 11)

Nine placeholder locations (`db/seed/jolly_bay_locations.sql`): North Grass
Flat, Oyster Edge, Interior Grass, Channel Drop, Drain, South Point, Bayou
Mouth, Oyster Point, Deep Bend. Each has a name and a best-guess habitat
classification only — no coordinates, no species, no tide/wind/lure
guidance. **Do not invent any of that.** Fill it in only once actually
field-validated, per the location-editing example above.

The map centers on Jolly Bay itself (`30.4272691, -86.1280154` — USGS topo
data via [topozone.com](https://www.topozone.com/florida/walton-fl/bay/jolly-bay/)),
which is a real, publicly documented place name, not a fabricated fishing
spot — that's just where the map opens, not a claim about any specific
waypoint's location.

## Future expansion

- **More regions**: `locations.region` and `habitat_features.region` are
  already generic strings, not hardcoded to `jolly_bay` — a new Emerald
  Coast region is a new `region` value plus new rows, no schema change.
- **AI scoring**: implement `explainScore()` for real once there's enough
  validated location + observation + catch data to make it meaningful;
  reuse `conditions.json`'s wind/tide/weather fields as inputs.
- **Import pipeline (STEP 8)**: CSV/JSON/GeoJSON import scripts would live
  in `scripts/` alongside the existing ones, writing into `db/atlas.db`
  with the same validation rules (`CHECK` constraints on `confidence`,
  `validation_status`) already enforced by the schema.
- **Tighter integration**: a "View on Atlas" link from `src/App.jsx`'s
  location cards to `atlas.html?location=<id>`, once the Atlas has enough
  real data to be useful from the daily-conditions flow.
