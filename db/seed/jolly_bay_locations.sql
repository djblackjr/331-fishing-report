-- Jolly Bay pilot — STEP 11 placeholder framework.
-- Nine locations, named only. Deliberately no lat/lng, no species, no tide/
-- wind/lure guidance, no depth — none of that is validated yet, and none of
-- it should be invented. Update these rows directly (sqlite3 db/atlas.db)
-- once a location has been field-checked, then re-run
-- scripts/export-atlas-geojson.mjs.
INSERT INTO locations (region, name, habitat_id, confidence, validation_status, source, notes) VALUES
  ('jolly_bay', 'North Grass Flat', (SELECT id FROM habitats WHERE key = 'grass_flat'),  0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Oyster Edge',      (SELECT id FROM habitats WHERE key = 'oyster_bar'),  0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Interior Grass',   (SELECT id FROM habitats WHERE key = 'grass_flat'),  0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Channel Drop',     (SELECT id FROM habitats WHERE key = 'drop_off'),    0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Drain',            (SELECT id FROM habitats WHERE key = 'creek_mouth'), 0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'South Point',      (SELECT id FROM habitats WHERE key = 'point'),       0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Bayou Mouth',      (SELECT id FROM habitats WHERE key = 'creek_mouth'), 0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Oyster Point',     (SELECT id FROM habitats WHERE key = 'oyster_bar'),  0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.'),
  ('jolly_bay', 'Deep Bend',        (SELECT id FROM habitats WHERE key = 'deep_hole'),   0, 'placeholder', 'Atlas Phase 1 pilot framework', 'Placeholder location awaiting field validation — no coordinates or species data yet.');
