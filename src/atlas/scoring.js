// src/atlas/scoring.js
// Framework for future AI fishing-recommendation scoring (Atlas brief STEP
// 10). Deliberately does NOT compute a real score yet — every factor below
// is a named, documented slot with no weight or logic behind it. When
// scoring is implemented, each factor should keep returning a
// `contribution` and a `note` explaining itself, so the final score stays
// traceable back to its inputs instead of becoming a black box.

export const SCORE_FACTORS = [
  { key: "wind", label: "Wind" },
  { key: "tide", label: "Tide" },
  { key: "current", label: "Current" },
  { key: "season", label: "Season" },
  { key: "waterTemp", label: "Water Temperature" },
  { key: "waterClarity", label: "Water Clarity" },
  { key: "rainfall", label: "Rainfall" },
  { key: "timeOfDay", label: "Time of Day" },
  { key: "historicalCatches", label: "Historical Catches" },
  { key: "habitatSuitability", label: "Habitat Suitability" },
];

// Returns an explainable, currently-unscored breakdown for a location.
// `locationProps` is a fishing_locations GeoJSON Feature's `properties`.
// `conditions` is reserved for the environmental inputs above once they're
// wired up — this app already fetches most of them for the daily
// conditions report (see src/data/conditions.json), so a future
// implementation can reuse that data rather than fetching it twice.
export function explainScore(locationProps, conditions = {}) {
  const factors = SCORE_FACTORS.map((factor) => ({
    ...factor,
    value: null,
    weight: 0,
    contribution: null,
    note: "not yet implemented",
  }));
  return {
    locationId: locationProps?.id ?? null,
    score: null,
    status: "not_yet_scored",
    factors,
  };
}
