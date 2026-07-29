-- Migration: 2026-07-28 — add exposed_directions_json to locations
--
-- Guides pick a spot based on which shoreline today's wind protects before
-- almost anything else. Adds a nullable JSON array of 8-point compass
-- directions (e.g. '["SW","S","W"]') a location has open-water fetch
-- toward — i.e. the directions FROM WHICH wind creates chop/exposure at
-- that spot, not the directions it's protected from. NULL/empty means
-- "not yet assessed", not "protected from everything".
--
-- SQLite supports ALTER TABLE ... ADD COLUMN directly (no CHECK constraint
-- involved, so none of the rebuild dance the 2026-07-24 migration needed).
-- Run once:
--   sqlite3 db/atlas.db < db/migrations/2026-07-28-wind-exposure.sql

ALTER TABLE locations ADD COLUMN exposed_directions_json TEXT;
