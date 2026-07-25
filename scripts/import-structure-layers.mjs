import { DatabaseSync } from "node:sqlite";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DB_PATH = fileURLToPath(new URL("../db/atlas.db", import.meta.url));
const packetPath = process.argv[2];
if (!packetPath) {
  throw new Error("Usage: node scripts/import-structure-layers.mjs <packet.geojson>");
}

const EXPECTED_LAYERS = new Map([
  ["channels", { label: "Channels", geometryType: "LineString", category: "habitat", color: "#38bdf8", sortOrder: 13 }],
  ["creek_mouths", { label: "Creek Mouths", geometryType: "Point", category: "habitat", color: "#22d3ee", sortOrder: 15 }],
  ["sand_holes", { label: "Sand Holes", geometryType: "Polygon", category: "habitat", color: "#fde68a", sortOrder: 16 }],
  ["shoreline_points", { label: "Shoreline Points", geometryType: "Point", category: "habitat", color: "#2dd4bf", sortOrder: 17 }],
  ["navigation_cautions", { label: "Navigation Cautions", geometryType: "Polygon", category: "hazard", color: "#f97316", sortOrder: 41 }],
]);
const STATUSES = new Set(["placeholder", "proposed", "visually_reviewed", "user_reported", "field_verified", "guide_verified"]);
const BBOX = { minLon: -87.7, maxLon: -85, minLat: 29.5, maxLat: 31.2 };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function visitPositions(geometry, visit) {
  if (geometry.type === "Point") return visit(geometry.coordinates);
  if (geometry.type === "LineString") return geometry.coordinates.forEach(visit);
  if (geometry.type === "Polygon") return geometry.coordinates.forEach((ring) => ring.forEach(visit));
  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function validateFeature(feature, index, seenIds) {
  const prefix = `features[${index}]`;
  assert(feature?.type === "Feature", `${prefix} must be a Feature`);
  assert(feature.geometry && typeof feature.geometry === "object", `${prefix} must have geometry`);
  const properties = feature.properties;
  assert(properties && typeof properties === "object" && !Array.isArray(properties), `${prefix} must have properties`);
  const layer = EXPECTED_LAYERS.get(properties.layer);
  assert(layer, `${prefix} has unexpected layer ${properties.layer}`);
  assert(feature.geometry.type === layer.geometryType, `${properties.feature_id}: ${feature.geometry.type} does not match ${properties.layer} (${layer.geometryType})`);
  assert(typeof properties.feature_id === "string" && /^JB-[A-Z]{2}-\d{3}$/.test(properties.feature_id), `${prefix} has invalid feature_id`);
  assert(!seenIds.has(properties.feature_id), `duplicate feature_id ${properties.feature_id}`);
  seenIds.add(properties.feature_id);
  assert(typeof properties.name === "string" && properties.name.trim(), `${properties.feature_id} has invalid name`);
  assert(Number.isInteger(properties.confidence_score) && properties.confidence_score >= 0 && properties.confidence_score <= 100, `${properties.feature_id} has invalid confidence_score`);
  assert(STATUSES.has(properties.validation_status), `${properties.feature_id} has invalid validation_status`);
  assert(properties.field_verified === false, `${properties.feature_id} must not claim field verification`);
  assert(properties.navigation_use === "not_for_navigation", `${properties.feature_id} must remain not for navigation`);
  visitPositions(feature.geometry, (position) => {
    assert(Array.isArray(position) && position.length >= 2 && position.every(Number.isFinite), `${properties.feature_id} has invalid coordinates`);
    const [lon, lat] = position;
    assert(lon >= BBOX.minLon && lon <= BBOX.maxLon && lat >= BBOX.minLat && lat <= BBOX.maxLat, `${properties.feature_id} coordinate is outside the Florida-panhandle sanity box`);
  });
  if (feature.geometry.type === "Polygon") {
    for (const ring of feature.geometry.coordinates) {
      assert(ring.length >= 4, `${properties.feature_id} polygon ring is too short`);
      assert(JSON.stringify(ring[0]) === JSON.stringify(ring.at(-1)), `${properties.feature_id} polygon ring is not closed`);
    }
  }
}

const packet = JSON.parse(await readFile(packetPath, "utf8"));
assert(packet?.type === "FeatureCollection" && Array.isArray(packet.features), "packet must be a GeoJSON FeatureCollection");
assert(packet.features.length === 14, `expected 14 features, received ${packet.features.length}`);
const seenIds = new Set();
packet.features.forEach((feature, index) => validateFeature(feature, index, seenIds));

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
db.exec("BEGIN IMMEDIATE");
try {
  const columns = db.prepare("PRAGMA table_info(habitat_features)").all();
  if (!columns.some((column) => column.name === "external_id")) {
    db.exec("ALTER TABLE habitat_features ADD COLUMN external_id TEXT");
    db.exec("CREATE UNIQUE INDEX idx_habitat_features_external_id ON habitat_features(external_id) WHERE external_id IS NOT NULL");
  }

  const existingLayer = db.prepare("SELECT geometry_type FROM layers WHERE key = ?");
  const incompatibleCount = db.prepare(`
    SELECT COUNT(*) AS count
    FROM habitat_features
    WHERE layer_key = ? AND geometry_json IS NOT NULL
      AND json_extract(geometry_json, '$.type') <> ?
  `);
  const upsertLayer = db.prepare(`
    INSERT INTO layers (key, label, geometry_type, category, color, default_visible, sort_order)
    VALUES (?, ?, ?, ?, ?, 0, ?)
    ON CONFLICT(key) DO UPDATE SET geometry_type = excluded.geometry_type
  `);

  for (const [key, meta] of EXPECTED_LAYERS) {
    const current = existingLayer.get(key);
    if (current && current.geometry_type !== meta.geometryType) {
      const { count } = incompatibleCount.get(key, meta.geometryType);
      assert(count === 0, `refusing to change ${key} from ${current.geometry_type} to ${meta.geometryType}: ${count} stored feature(s) are incompatible`);
    }
    upsertLayer.run(key, meta.label, meta.geometryType, meta.category, meta.color, meta.sortOrder);
  }

  const upsertFeature = db.prepare(`
    INSERT INTO habitat_features (
      external_id, layer_key, region, name, geometry_json, properties_json,
      confidence, validation_status, source, last_updated
    ) VALUES (?, ?, 'jolly_bay', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT DO UPDATE SET
      layer_key = excluded.layer_key,
      region = excluded.region,
      name = excluded.name,
      geometry_json = excluded.geometry_json,
      properties_json = excluded.properties_json,
      confidence = excluded.confidence,
      validation_status = excluded.validation_status,
      source = excluded.source,
      last_updated = excluded.last_updated
  `);

  for (const feature of packet.features) {
    const p = feature.properties;
    const extraProperties = {
      feature_type: p.feature_type,
      field_verified: p.field_verified,
      evidence: p.evidence,
      uncertainty: p.uncertainty,
      source_type: p.source_type,
      source_reference: p.source_reference,
      review_date: p.review_date,
      navigation_use: p.navigation_use,
    };
    upsertFeature.run(
      p.feature_id,
      p.layer,
      p.name,
      JSON.stringify(feature.geometry),
      JSON.stringify(extraProperties),
      p.confidence_score,
      p.validation_status,
      `${p.source_type}: ${p.source_reference}`,
      p.review_date,
    );
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
} finally {
  db.close();
}

console.log(`Imported ${packet.features.length} structure features from ${packetPath}.`);
