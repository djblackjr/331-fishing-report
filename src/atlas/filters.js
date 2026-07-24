// src/atlas/filters.js
// STEP 9 filtering: species, habitat, confidence, season, validation
// status, access type. Pure functions over a fishing_locations Feature's
// properties, so they're easy to unit-test later and don't depend on
// Leaflet at all.

export const DEFAULT_FILTERS = {
  species: "all",
  habitat: "all",
  minConfidence: 0,
  season: "all",
  validationStatus: "all",
  accessType: "all",
};

export function locationMatchesFilters(props, filters) {
  if (filters.species !== "all" && !(props.species || []).some((s) => s.key === filters.species)) {
    return false;
  }
  if (filters.habitat !== "all" && props.habitat !== filters.habitat) {
    return false;
  }
  if ((props.confidence ?? 0) < filters.minConfidence) {
    return false;
  }
  if (filters.season !== "all") {
    const season = (props.bestSeason || "").toLowerCase();
    if (!season.includes(filters.season)) return false;
  }
  if (filters.validationStatus !== "all" && props.validationStatus !== filters.validationStatus) {
    return false;
  }
  if (filters.accessType !== "all" && props.accessType !== filters.accessType) {
    return false;
  }
  return true;
}
