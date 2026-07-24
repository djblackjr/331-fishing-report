-- Applies jolly_bay_map_reviewed_locations.geojson (this same directory) to
-- the 9 existing Jolly Bay placeholder locations seeded in Phase 1.
-- location_id in the packet (JB-PROP-00X) maps 1:1, in order, onto
-- locations.id 1-9 via original_concept — this is an UPDATE of existing
-- rows, not an INSERT of new ones. Requires
-- db/migrations/2026-07-24-review-pipeline-statuses.sql to already be
-- applied (adds external_id, extends validation_status).
--
-- Judgment calls made while mapping packet -> schema, approved 2026-07-24:
-- - habitat_id cleared to NULL wherever the packet's own evidence text says
--   the habitat isn't resolvable (rows 1, 2, 3, 8), rather than keeping the
--   original Phase-1 guess sitting next to real review data.
-- - Row 4 (Channel Drop) remapped from 'drop_off' to 'channel' — the
--   evidence confirms a visible channel boundary but explicitly says the
--   drop-off itself is unconfirmed.
-- - Nothing promoted past 'visually_reviewed'; rows 2/3/8 stay 'proposed'
--   with NULL geometry, matching the packet exactly.

UPDATE locations SET
  external_id = 'JB-PROP-001',
  lat = 30.428283, lng = -86.128438,
  validation_status = 'visually_reviewed',
  confidence = 46,
  habitat_id = NULL,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Aerial tonal transition beside the north shoreline; submerged grass is not resolved. | Uncertainty: Flat edge is visible, but vegetation and depth are unverified.',
  last_updated = datetime('now')
WHERE id = 1;

UPDATE locations SET
  external_id = 'JB-PROP-002',
  lat = NULL, lng = NULL,
  validation_status = 'proposed',
  confidence = 15,
  habitat_id = NULL,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: No defensible oyster or hard-bottom signature in the reviewed aerial. | Uncertainty: Requires clearer imagery, side-scan/sonar, or on-water review before placement.',
  last_updated = datetime('now')
WHERE id = 2;

UPDATE locations SET
  external_id = 'JB-PROP-003',
  lat = NULL, lng = NULL,
  validation_status = 'proposed',
  confidence = 15,
  habitat_id = NULL,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Water clarity and image appearance do not resolve submerged grass or sand pockets. | Uncertainty: Keep unlocated until vegetation is visible in another image date or field evidence exists.',
  last_updated = datetime('now')
WHERE id = 3;

UPDATE locations SET
  external_id = 'JB-PROP-004',
  lat = 30.424067, lng = -86.121250,
  validation_status = 'visually_reviewed',
  confidence = 58,
  habitat_id = (SELECT id FROM habitats WHERE key = 'channel'),
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Distinct dark channel boundary against the adjacent marsh shallows. | Uncertainty: Channel edge is visible; an actual drop-off and depth require chart/sonar confirmation.',
  last_updated = datetime('now')
WHERE id = 4;

UPDATE locations SET
  external_id = 'JB-PROP-005',
  lat = 30.428283, lng = -86.118906,
  validation_status = 'visually_reviewed',
  confidence = 70,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Clearly visible narrow marsh drain entering the bay/channel system. | Uncertainty: Flow timing, depth, and navigability remain unverified.',
  last_updated = datetime('now')
WHERE id = 5;

UPDATE locations SET
  external_id = 'JB-PROP-006',
  lat = 30.422307, lng = -86.130531,
  validation_status = 'visually_reviewed',
  confidence = 66,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Clearly visible point at the west end of a marsh island with adjacent color transition. | Uncertainty: Bottom type and water depth are unverified.',
  last_updated = datetime('now')
WHERE id = 6;

UPDATE locations SET
  external_id = 'JB-PROP-007',
  lat = 30.421683, lng = -86.123281,
  validation_status = 'visually_reviewed',
  confidence = 63,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Visible transition where the confined marsh channel opens toward broader bay water. | Uncertainty: Hydrodynamics and usable depth require tide/field review.',
  last_updated = datetime('now')
WHERE id = 7;

UPDATE locations SET
  external_id = 'JB-PROP-008',
  lat = NULL, lng = NULL,
  validation_status = 'proposed',
  confidence = 15,
  habitat_id = NULL,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: No point can be classified as oyster or hard bottom from this image alone. | Uncertainty: Requires clearer low-water imagery, sonar, or field inspection before placement.',
  last_updated = datetime('now')
WHERE id = 8;

UPDATE locations SET
  external_id = 'JB-PROP-009',
  lat = 30.424067, lng = -86.112500,
  validation_status = 'visually_reviewed',
  confidence = 55,
  source = 'Aerial image review — Esri World Imagery export, reviewed 2026-07-24 (db/import/2026-07-24-jolly-bay-review/)',
  notes = 'Evidence: Pronounced outside bend is visible in the eastern marsh channel. | Uncertainty: The bend is mapped; greater depth is only a hypothesis until measured.',
  last_updated = datetime('now')
WHERE id = 9;
