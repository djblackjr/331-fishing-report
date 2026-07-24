-- Fishing Intelligence Atlas — SQLite schema
--
-- This is the authoritative data model for the Atlas. db/atlas.db (built by
-- scripts/build-atlas-db.mjs, then edited directly with the sqlite3 CLI or
-- any SQLite GUI) is the live datastore, committed to git like any other
-- source file — GitHub Pages has no server/database, so the repo itself is
-- the only persistence layer. scripts/export-atlas-geojson.mjs reads this
-- database and writes the static GeoJSON the map actually fetches.
--
-- Every schema change should be made in this file (so `git log db/schema.sql`
-- documents the change), then applied by re-running build-atlas-db.mjs
-- (destructive — see that script's header) or by hand-migrating atlas.db.

PRAGMA foreign_keys = ON;

-- ── LAYERS ───────────────────────────────────────────────────────────────
-- Registry of every map layer. Drives both the layer control UI (exported
-- to public/atlas/layers.json) and the allowed values for
-- habitat_features.layer_key below — add a layer here first, then features
-- can reference it.
CREATE TABLE layers (
  key             TEXT PRIMARY KEY,
  label           TEXT NOT NULL,
  geometry_type   TEXT NOT NULL CHECK (geometry_type IN ('Point', 'LineString', 'Polygon')),
  category        TEXT NOT NULL CHECK (category IN ('waypoints', 'habitat', 'species', 'access', 'hazard', 'user')),
  color           TEXT NOT NULL,               -- hex color used for default styling
  default_visible INTEGER NOT NULL DEFAULT 1,  -- 0/1 — whether the layer starts checked on
  sort_order      INTEGER NOT NULL DEFAULT 0
);

-- ── HABITATS ─────────────────────────────────────────────────────────────
CREATE TABLE habitats (
  id          INTEGER PRIMARY KEY,
  key         TEXT UNIQUE NOT NULL,
  label       TEXT NOT NULL,
  description TEXT
);

-- ── SPECIES ──────────────────────────────────────────────────────────────
CREATE TABLE species (
  id    INTEGER PRIMARY KEY,
  key   TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL
);

-- ── LOCATIONS ────────────────────────────────────────────────────────────
-- Fishing waypoints — the "fishing_locations" layer, and the richest table
-- (backs the STEP 7 popup: name, habitat, depth, tide, wind, season, lures,
-- access, confidence, validation, source, last updated).
-- lat/lng are nullable on purpose — a location can exist (named, described,
-- pending field verification) before its coordinates are known. Never
-- populate lat/lng with an invented value; leave NULL until validated.
CREATE TABLE locations (
  id                INTEGER PRIMARY KEY,
  region            TEXT NOT NULL,             -- e.g. 'jolly_bay' — supports future regions
  name              TEXT NOT NULL,
  habitat_id        INTEGER REFERENCES habitats(id),
  lat               REAL,
  lng               REAL,
  depth_typical     TEXT,
  best_tide         TEXT,
  best_wind         TEXT,
  best_season       TEXT,
  best_lures_json   TEXT,                      -- JSON array of strings, e.g. '["Gold spoon","Live shrimp"]'
  access_notes      TEXT,
  access_type       TEXT CHECK (access_type IN ('boat', 'kayak', 'wade', 'shore') OR access_type IS NULL),
  confidence        INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  -- Staged pipeline, earliest to most confirmed: placeholder (no data) ->
  -- proposed (candidate, insufficient evidence to place — geometry stays
  -- NULL) -> visually_reviewed (map-reviewed only, provisional coordinates)
  -- -> user_reported -> field_verified -> guide_verified. Extended
  -- 2026-07-24 (see db/migrations/2026-07-24-review-pipeline-statuses.sql)
  -- to accommodate imported map-review packets that fall short of a field
  -- visit.
  validation_status TEXT NOT NULL DEFAULT 'placeholder' CHECK (validation_status IN ('placeholder', 'proposed', 'visually_reviewed', 'user_reported', 'field_verified', 'guide_verified')),
  -- Stable id from an external import source (e.g. 'JB-PROP-001'), so
  -- re-running that import later can upsert by this id instead of
  -- duplicating rows. NULL for anything entered directly, not imported.
  external_id       TEXT,
  source            TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Many-to-many: a location can hold several species, each with its own
-- confidence + note (mirrors the `species: [...]` arrays already used per
-- spot in src/App.jsx's LOCATIONS, so future integration stays consistent).
CREATE TABLE location_species (
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  species_id  INTEGER NOT NULL REFERENCES species(id),
  confidence  INTEGER CHECK (confidence BETWEEN 0 AND 100),
  note        TEXT,
  PRIMARY KEY (location_id, species_id)
);

-- ── CATCH HISTORY ────────────────────────────────────────────────────────
CREATE TABLE catches (
  id          INTEGER PRIMARY KEY,
  location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  species_id  INTEGER REFERENCES species(id),
  caught_at   TEXT,                            -- ISO date/time
  length_in   REAL,
  weight_lb   REAL,
  method      TEXT,                            -- lure/bait used
  kept        INTEGER,                         -- 0/1, NULL if unknown
  angler      TEXT,
  notes       TEXT,
  source      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── ENVIRONMENTAL OBSERVATIONS ───────────────────────────────────────────
-- A snapshot of conditions tied to a location at a point in time — distinct
-- from a catch (an observation can exist with no fish caught).
CREATE TABLE observations (
  id           INTEGER PRIMARY KEY,
  location_id  INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  observed_at  TEXT NOT NULL DEFAULT (datetime('now')),
  water_temp   REAL,
  water_clarity TEXT,
  tide_stage   TEXT,
  wind_dir     TEXT,
  wind_speed   REAL,
  notes        TEXT,
  source       TEXT
);

-- ── HABITAT / AREA FEATURES ──────────────────────────────────────────────
-- Generic geometry store for every layer that ISN'T a named fishing
-- waypoint: grass flats, oyster areas, hard bottom, channels, drop-offs,
-- creek mouths, sand holes, redfish routes, trout/flounder habitat, kayak
-- launches, boat ramps, hazards, user catches. One table instead of ~13
-- near-identical ones — geometry_json/properties_json hold the
-- layer-specific shape and attributes, keyed to `layers.key`.
-- geometry_json is a raw GeoJSON geometry object (Point/LineString/Polygon)
-- as text, NULL until the feature has been surveyed/digitized.
CREATE TABLE habitat_features (
  id                INTEGER PRIMARY KEY,
  layer_key         TEXT NOT NULL REFERENCES layers(key),
  region            TEXT NOT NULL,
  name              TEXT,
  geometry_json     TEXT,
  properties_json   TEXT,
  confidence        INTEGER CHECK (confidence BETWEEN 0 AND 100),
  validation_status TEXT NOT NULL DEFAULT 'placeholder' CHECK (validation_status IN ('placeholder', 'proposed', 'visually_reviewed', 'user_reported', 'field_verified', 'guide_verified')),
  source            TEXT,
  last_updated      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_locations_region ON locations(region);
CREATE UNIQUE INDEX idx_locations_external_id ON locations(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_habitat_features_layer_region ON habitat_features(layer_key, region);
CREATE INDEX idx_catches_location ON catches(location_id);
CREATE INDEX idx_observations_location ON observations(location_id);
