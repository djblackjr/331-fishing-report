-- Migration: 2026-07-24 — add review-pipeline validation statuses + external_id
--
-- Prompted by importing an external map-review packet (aerial-image-based
-- coordinate proposals, not yet field verified) for the Jolly Bay pilot —
-- see db/import/2026-07-24-jolly-bay-review/. Two changes:
--
-- 1. validation_status gains two earlier pipeline stages: 'proposed' (a
--    candidate with insufficient evidence to place — geometry stays NULL)
--    and 'visually_reviewed' (map-reviewed only, provisional coordinates,
--    not field verified). Full staged vocabulary is now:
--    placeholder -> proposed -> visually_reviewed -> user_reported ->
--    field_verified -> guide_verified.
-- 2. locations gains external_id, a nullable, uniquely-indexed text column,
--    so a future re-run of an import like this one can upsert by that id
--    instead of creating duplicate rows.
--
-- SQLite can't ALTER a CHECK constraint in place, so both tables get
-- rebuilt (standard 12-step SQLite pattern: recreate, copy, drop, rename)
-- with foreign_keys off for the duration. Run once:
--   sqlite3 db/atlas.db < db/migrations/2026-07-24-review-pipeline-statuses.sql
-- db/schema.sql has already been updated to match this as the new baseline
-- for a fresh db/atlas.db build.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

CREATE TABLE locations_new (
  id                INTEGER PRIMARY KEY,
  region            TEXT NOT NULL,
  name              TEXT NOT NULL,
  habitat_id        INTEGER REFERENCES habitats(id),
  lat               REAL,
  lng               REAL,
  depth_typical     TEXT,
  best_tide         TEXT,
  best_wind         TEXT,
  best_season       TEXT,
  best_lures_json   TEXT,
  access_notes      TEXT,
  access_type       TEXT CHECK (access_type IN ('boat', 'kayak', 'wade', 'shore') OR access_type IS NULL),
  confidence        INTEGER NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 100),
  validation_status TEXT NOT NULL DEFAULT 'placeholder' CHECK (validation_status IN ('placeholder', 'proposed', 'visually_reviewed', 'user_reported', 'field_verified', 'guide_verified')),
  external_id       TEXT,
  source            TEXT,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_updated      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO locations_new (id, region, name, habitat_id, lat, lng, depth_typical, best_tide, best_wind, best_season, best_lures_json, access_notes, access_type, confidence, validation_status, external_id, source, notes, created_at, last_updated)
SELECT id, region, name, habitat_id, lat, lng, depth_typical, best_tide, best_wind, best_season, best_lures_json, access_notes, access_type, confidence, validation_status, NULL, source, notes, created_at, last_updated
FROM locations;

DROP TABLE locations;
ALTER TABLE locations_new RENAME TO locations;

CREATE INDEX idx_locations_region ON locations(region);
CREATE UNIQUE INDEX idx_locations_external_id ON locations(external_id) WHERE external_id IS NOT NULL;

CREATE TABLE habitat_features_new (
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

INSERT INTO habitat_features_new SELECT * FROM habitat_features;

DROP TABLE habitat_features;
ALTER TABLE habitat_features_new RENAME TO habitat_features;

CREATE INDEX idx_habitat_features_layer_region ON habitat_features(layer_key, region);

COMMIT;

PRAGMA foreign_keys = ON;
