-- Supports repeatable imports of externally identified habitat features.
ALTER TABLE habitat_features ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX idx_habitat_features_external_id
  ON habitat_features(external_id) WHERE external_id IS NOT NULL;

-- Creek mouths in this atlas are mapped as precise outlets, not areas.
-- This migration is safe only while the layer has no incompatible geometry;
-- scripts/import-structure-layers.mjs checks that invariant before updating.
UPDATE layers SET geometry_type = 'Point' WHERE key = 'creek_mouths';

INSERT INTO layers (key, label, geometry_type, category, color, default_visible, sort_order)
VALUES
  ('shoreline_points', 'Shoreline Points', 'Point', 'habitat', '#2dd4bf', 0, 17),
  ('navigation_cautions', 'Navigation Cautions', 'Polygon', 'hazard', '#f97316', 0, 41);
