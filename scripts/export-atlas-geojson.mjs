// scripts/export-atlas-geojson.mjs
// Reads db/atlas.db (the live Atlas datastore — see db/schema.sql) and
// writes one static GeoJSON FeatureCollection per layer into
// public/atlas/geojson/, plus public/atlas/layers.json (the layer registry,
// used to build the layer control in the browser). These are plain static
// files, deployed by GitHub Pages exactly like public/history/*.json
// already is — no server, no live database query at runtime.
//
// Run manually:   node scripts/export-atlas-geojson.mjs
// Run after any edit to db/atlas.db, before committing/deploying.

import { DatabaseSync } from "node:sqlite";
import { writeFile, mkdir } from "fs/promises";
import { fileURLToPath } from "url";
import { join } from "path";

const DB_PATH = fileURLToPath(new URL("../db/atlas.db", import.meta.url));
const OUT_DIR = fileURLToPath(new URL("../public/atlas/", import.meta.url));
const GEOJSON_DIR = join(OUT_DIR, "geojson");

const db = new DatabaseSync(DB_PATH, { readOnly: true });

function rowsToObjects(stmt, params = []) {
  return stmt.all(...params);
}

// ── fishing_locations layer: built from the `locations` table, joined with
// habitat + species so each Feature's properties match the STEP 7 popup
// spec in full. geometry is null (not omitted) when lat/lng aren't set yet
// — a valid GeoJSON Feature with no located geometry — so the frontend can
// list these as "pending" rather than silently dropping them.
function exportFishingLocations() {
  const locations = rowsToObjects(db.prepare(`
    SELECT l.*, h.key AS habitat_key, h.label AS habitat_label
    FROM locations l
    LEFT JOIN habitats h ON h.id = l.habitat_id
    ORDER BY l.region, l.name
  `));

  const speciesStmt = db.prepare(`
    SELECT s.key, s.label, ls.confidence, ls.note
    FROM location_species ls
    JOIN species s ON s.id = ls.species_id
    WHERE ls.location_id = ?
    ORDER BY ls.confidence DESC
  `);

  const catchCountStmt = db.prepare(`SELECT COUNT(*) AS n FROM catches WHERE location_id = ?`);

  const features = locations.map((loc) => ({
    type: "Feature",
    geometry: loc.lat != null && loc.lng != null
      ? { type: "Point", coordinates: [loc.lng, loc.lat] }
      : null,
    properties: {
      id: loc.id,
      region: loc.region,
      name: loc.name,
      habitat: loc.habitat_key,
      habitatLabel: loc.habitat_label,
      species: rowsToObjects(speciesStmt, [loc.id]),
      depthTypical: loc.depth_typical,
      bestTide: loc.best_tide,
      bestWind: loc.best_wind,
      bestSeason: loc.best_season,
      bestLures: loc.best_lures_json ? JSON.parse(loc.best_lures_json) : [],
      accessNotes: loc.access_notes,
      accessType: loc.access_type,
      confidence: loc.confidence,
      validationStatus: loc.validation_status,
      source: loc.source,
      notes: loc.notes,
      lastUpdated: loc.last_updated,
      catchCount: catchCountStmt.get(loc.id).n,
    },
  }));

  return { type: "FeatureCollection", features };
}

// ── every other layer: generic habitat_features rows for that layer_key.
// geometry_json is stored as raw GeoJSON geometry text; NULL until surveyed.
function exportHabitatLayer(layerKey) {
  const rows = rowsToObjects(db.prepare(`
    SELECT * FROM habitat_features WHERE layer_key = ? ORDER BY region, name
  `), [layerKey]);

  const features = rows.map((row) => ({
    type: "Feature",
    geometry: row.geometry_json ? JSON.parse(row.geometry_json) : null,
    properties: {
      id: row.id,
      region: row.region,
      name: row.name,
      confidence: row.confidence,
      validationStatus: row.validation_status,
      source: row.source,
      lastUpdated: row.last_updated,
      ...(row.properties_json ? JSON.parse(row.properties_json) : {}),
    },
  }));

  return { type: "FeatureCollection", features };
}

async function main() {
  await mkdir(GEOJSON_DIR, { recursive: true });

  const layers = rowsToObjects(db.prepare(`SELECT * FROM layers ORDER BY sort_order`));

  for (const layer of layers) {
    const collection = layer.key === "fishing_locations"
      ? exportFishingLocations()
      : exportHabitatLayer(layer.key);
    await writeFile(join(GEOJSON_DIR, `${layer.key}.geojson`), JSON.stringify(collection, null, 2) + "\n");
    console.log(`  ${layer.key}.geojson — ${collection.features.length} feature(s)`);
  }

  // Layer registry for the frontend layer control — camelCase to match the
  // rest of the JS-facing JSON in this repo (conditions.json etc).
  const registry = layers.map((l) => ({
    key: l.key,
    label: l.label,
    geometryType: l.geometry_type,
    category: l.category,
    color: l.color,
    defaultVisible: !!l.default_visible,
  }));
  await writeFile(join(OUT_DIR, "layers.json"), JSON.stringify(registry, null, 2) + "\n");

  db.close();
  console.log(`Exported ${layers.length} layers to public/atlas/.`);
}

main();
