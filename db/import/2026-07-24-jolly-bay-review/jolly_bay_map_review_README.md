# Jolly Bay map-review packet

This packet contains nine habitat concepts for the existing Fishing Atlas.

- Six concepts have provisional point geometry because their shoreline or channel structure is visible in the aerial image.
- Three concepts remain deliberately unlocated because submerged grass, oyster, and hard-bottom signatures are not defensible in this imagery.
- `visually_reviewed` means map-reviewed only. No feature is field verified.
- Coordinates are suitable for review/import, not navigation.

Files:

- `jolly_bay_map_reviewed_locations.geojson` — import-ready GeoJSON; unlocated features use `geometry: null`.
- `jolly_bay_map_reviewed_locations.csv` — flat import/review table.
- `jolly_bay_annotated_map.png` — marked-up aerial reference.

Source:

- Esri World Imagery REST export, WGS84 bbox `[-86.155, 30.405, -86.105, 30.449]`, image size 1600 × 1200.
- NOAA ENC Online was checked for the same extent but did not return useful large-scale detail for placement.

Recommended workflow:

1. Import as proposed/map-reviewed records.
2. Visually inspect each point in the Atlas.
3. Move or reject points where local knowledge disagrees.
4. Do not promote to field verified until depth/bottom/structure is confirmed on the water.
