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
| `locations` | Named fishing waypoints — the richest table, backing the popup fields in STEP 7 (habitat, depth, tide, wind, season, lures, access, confidence, validation, source). `lat`/`lng` are nullable **on purpose** — a location can exist before it's field-validated. |
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

15 layers, defined in `db/seed/layers.sql` / the `layers` table:

`fishing_locations`, `grass_flats`, `oyster_areas`, `hard_bottom`,
`channels`, `drop_offs`, `creek_mouths`, `sand_holes`, `redfish_routes`,
`trout_habitat`, `flounder_habitat`, `kayak_launches`, `boat_ramps`,
`hazards`, `user_catches`.

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
name, habitat, species (with confidence), typical depth, best tide/wind/
season, best lures, access notes, confidence, validation status, source,
last updated, and catch count (from `catches`, once any exist).
`habitat_features` layers get a lighter generic popup (name, layer,
confidence, validation, source, updated).

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

Three switchable base layers, no Google tiles:

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
  Served as a WMS layer (`gis.charttools.noaa.gov/.../WMSServer`, layer
  `1`), attribution `NOAA/NOS Office of Coast Survey`. Verified directly
  against Jolly Bay's bounding box before shipping. Public domain (US
  federal government work) — no licensing restriction, but it's a
  transparent overlay-style layer: outside charted marine areas it renders
  as empty transparent tiles over the page background, so it reads best
  zoomed into actual water.

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
