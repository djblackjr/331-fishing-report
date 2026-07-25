// scripts/atlas.test.mjs
// Minimal regression check for the Atlas data pipeline — nothing existed
// before this. Run with: npm run atlas:test (node's built-in test runner,
// no new dependency). Covers the two things most likely to silently break:
// the database's own constraints, and the shape of what actually gets
// served to the browser.

import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "fs/promises";
import { fileURLToPath } from "url";
import { join } from "path";

const DB_PATH = fileURLToPath(new URL("../db/atlas.db", import.meta.url));
const GEOJSON_DIR = fileURLToPath(new URL("../public/atlas/geojson/", import.meta.url));
const LAYERS_PATH = fileURLToPath(new URL("../public/atlas/layers.json", import.meta.url));

// Rough Florida-panhandle / Choctawhatchee Bay sanity box — not a precise
// boundary, just a smoke check that catches gross errors like a lat/lng
// swap or a coordinate typo landing a marker in the wrong hemisphere.
const SANITY_BBOX = { minLon: -87.7, maxLon: -85.0, minLat: 29.5, maxLat: 31.2 };

test("schema rejects an invalid validation_status", () => {
  const db = new DatabaseSync(DB_PATH);
  assert.throws(() => {
    db.exec(`INSERT INTO locations (region, name, validation_status) VALUES ('test', 'bad status test', 'not_a_real_status')`);
  }, /CHECK constraint failed/);
  db.close();
});

test("schema accepts every documented validation_status", () => {
  const db = new DatabaseSync(DB_PATH);
  const statuses = ["placeholder", "proposed", "visually_reviewed", "user_reported", "field_verified", "guide_verified"];
  db.exec("BEGIN");
  try {
    for (const status of statuses) {
      db.exec(`INSERT INTO locations (region, name, validation_status) VALUES ('test', 'status test', '${status}')`);
    }
  } finally {
    db.exec("ROLLBACK"); // never actually keep these rows
  }
  db.close();
});

test("schema rejects confidence outside 0-100", () => {
  const db = new DatabaseSync(DB_PATH);
  assert.throws(() => {
    db.exec(`INSERT INTO locations (region, name, confidence) VALUES ('test', 'bad confidence test', 150)`);
  }, /CHECK constraint failed/);
  db.close();
});

test("external_id is unique when set", () => {
  const db = new DatabaseSync(DB_PATH);
  const row = db.prepare("SELECT external_id FROM locations WHERE external_id IS NOT NULL LIMIT 1").get();
  assert.ok(row, "expected at least one location with an external_id");
  assert.throws(() => {
    db.exec(`INSERT INTO locations (region, name, external_id) VALUES ('test', 'dup external_id test', '${row.external_id}')`);
  }, /UNIQUE constraint failed/);
  db.close();
});

test("every layers.json entry has a valid geometry_type", async () => {
  const registry = JSON.parse(await readFile(LAYERS_PATH, "utf8"));
  assert.ok(registry.length > 0);
  for (const layer of registry) {
    assert.ok(["Point", "LineString", "Polygon"].includes(layer.geometryType), `${layer.key} has an invalid geometryType: ${layer.geometryType}`);
  }
});

test("every exported GeoJSON file is a valid FeatureCollection matching its layer's geometry type", async () => {
  const registry = JSON.parse(await readFile(LAYERS_PATH, "utf8"));
  const files = await readdir(GEOJSON_DIR);
  assert.deepEqual(files.sort(), registry.map((l) => `${l.key}.geojson`).sort());

  for (const layer of registry) {
    const collection = JSON.parse(await readFile(join(GEOJSON_DIR, `${layer.key}.geojson`), "utf8"));
    assert.equal(collection.type, "FeatureCollection", `${layer.key}.geojson is not a FeatureCollection`);
    for (const feature of collection.features) {
      assert.equal(feature.type, "Feature");
      if (feature.geometry === null) continue; // valid — not yet located
      assert.equal(feature.geometry.type, layer.geometryType, `${layer.key}.geojson feature ${feature.properties?.id} has geometry.type ${feature.geometry.type}, expected ${layer.geometryType}`);
      if (feature.geometry.type === "Point") {
        const [lon, lat] = feature.geometry.coordinates;
        assert.ok(
          lon >= SANITY_BBOX.minLon && lon <= SANITY_BBOX.maxLon && lat >= SANITY_BBOX.minLat && lat <= SANITY_BBOX.maxLat,
          `${layer.key}.geojson feature ${feature.properties?.id} coordinates [${lon}, ${lat}] fall outside the Florida-panhandle sanity box`
        );
      }
    }
  }
});

test("Jolly Bay structure packet is exported once with reconciled geometry types", async () => {
  const expected = {
    channels: ["LineString", 3],
    creek_mouths: ["Point", 3],
    shoreline_points: ["Point", 3],
    sand_holes: ["Polygon", 3],
    navigation_cautions: ["Polygon", 2],
  };
  const ids = new Set();

  for (const [layerKey, [geometryType, expectedCount]] of Object.entries(expected)) {
    const collection = JSON.parse(await readFile(join(GEOJSON_DIR, `${layerKey}.geojson`), "utf8"));
    const packetFeatures = collection.features.filter((feature) => feature.properties.externalId?.startsWith("JB-"));
    assert.equal(packetFeatures.length, expectedCount, `${layerKey} packet feature count`);
    for (const feature of packetFeatures) {
      assert.equal(feature.geometry.type, geometryType, `${feature.properties.externalId} geometry type`);
      assert.equal(feature.properties.validationStatus, "visually_reviewed");
      assert.equal(feature.properties.field_verified, false);
      assert.equal(feature.properties.navigation_use, "not_for_navigation");
      assert.ok(!ids.has(feature.properties.externalId), `duplicate external id ${feature.properties.externalId}`);
      ids.add(feature.properties.externalId);
    }
  }

  assert.equal(ids.size, 14);
});

test("Jolly Bay pilot: exactly 6 located + 3 unlocated fishing_locations, none promoted past visually_reviewed", async () => {
  const collection = JSON.parse(await readFile(join(GEOJSON_DIR, "fishing_locations.geojson"), "utf8"));
  const jollyBay = collection.features.filter((f) => f.properties.region === "jolly_bay");
  assert.equal(jollyBay.length, 9, "expected all 9 Jolly Bay pilot locations");

  const located = jollyBay.filter((f) => f.geometry !== null);
  const unlocated = jollyBay.filter((f) => f.geometry === null);
  assert.equal(located.length, 6, "expected 6 located Jolly Bay features");
  assert.equal(unlocated.length, 3, "expected 3 unlocated Jolly Bay features");

  const promoted = jollyBay.filter((f) => ["field_verified", "guide_verified"].includes(f.properties.validationStatus));
  assert.equal(promoted.length, 0, "no Jolly Bay pilot location should be promoted past visually_reviewed yet");
});
