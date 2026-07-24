-- Layer registry — every layer STEP 5 asks for. Point/LineString/Polygon
-- choices reflect what that kind of feature actually looks like on a chart
-- (a "channel" is a line, a "grass flat" is an area, a "boat ramp" is a
-- point). default_visible=0 keeps sparse/future layers off by default so
-- the map isn't visually noisy before there's real data in them.
INSERT INTO layers (key, label, geometry_type, category, color, default_visible, sort_order) VALUES
  ('fishing_locations', 'Fishing Locations',  'Point',      'waypoints', '#4ade80', 1, 0),
  ('grass_flats',       'Grass Flats',        'Polygon',    'habitat',   '#86c7a0', 1, 10),
  ('oyster_areas',      'Oyster Areas',       'Polygon',    'habitat',   '#b08968', 1, 11),
  ('hard_bottom',       'Hard Bottom',        'Polygon',    'habitat',   '#9ca3af', 0, 12),
  ('channels',          'Channels',           'LineString', 'habitat',   '#38bdf8', 1, 13),
  ('drop_offs',         'Drop-offs',          'LineString', 'habitat',   '#0ea5e9', 0, 14),
  ('creek_mouths',      'Creek Mouths',       'Polygon',    'habitat',   '#22d3ee', 0, 15),
  ('sand_holes',        'Sand Holes',         'Polygon',    'habitat',   '#fde68a', 0, 16),
  ('redfish_routes',    'Redfish Routes',     'LineString', 'species',   '#f87171', 0, 20),
  ('trout_habitat',     'Trout Habitat',      'Polygon',    'species',   '#a78bfa', 0, 21),
  ('flounder_habitat',  'Flounder Habitat',   'Polygon',    'species',   '#fb923c', 0, 22),
  ('kayak_launches',    'Kayak Launches',     'Point',      'access',    '#facc15', 1, 30),
  ('boat_ramps',        'Boat Ramps',         'Point',      'access',    '#facc15', 1, 31),
  ('hazards',           'Hazards',            'Point',      'hazard',    '#ef4444', 1, 40),
  ('user_catches',      'User Catches',       'Point',      'user',      '#34d399', 0, 50);
