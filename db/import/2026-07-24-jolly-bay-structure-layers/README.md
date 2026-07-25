# Jolly Bay structure-layer import

Imported on 2026-07-24 from the user-supplied
`jolly_bay_structure_layers.geojson` packet.

The packet contributes 14 visually reviewed, explicitly
`not_for_navigation` features:

- 3 channel centerlines (`LineString`)
- 3 creek mouths (`Point`)
- 3 shoreline points (`Point`)
- 3 visible shoals in the existing sand-holes layer (`Polygon`)
- 2 navigation cautions (`Polygon`)

`scripts/import-structure-layers.mjs` validates the packet before opening a
write transaction and upserts by its stable `feature_id`. The migration adds
that identifier as `habitat_features.external_id`, safely changes the empty
creek-mouth layer from `Polygon` to `Point`, and adds the two packet layers
that were not already registered.

No feature is represented as field verified, and navigation cautions remain
distinct from the existing point-based Hazards layer.
