// src/atlas/popup.js
// Builds popup HTML for map features. Kept as plain string templates (no
// framework) since this is a standalone vanilla-JS page — see docs/atlas.md
// for why the Atlas isn't part of the React SPA.

const VALIDATION_LABELS = {
  placeholder: "Placeholder — unvalidated",
  user_reported: "User reported",
  field_verified: "Field verified",
  guide_verified: "Guide verified",
};

const VALIDATION_COLORS = {
  placeholder: "#7a8578",
  user_reported: "#facc15",
  field_verified: "#4ade80",
  guide_verified: "#34d399",
};

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function row(label, value) {
  if (value == null || value === "") return "";
  return `<div class="atlas-popup-row"><span class="atlas-popup-label">${escapeHtml(label)}</span><span class="atlas-popup-value">${escapeHtml(value)}</span></div>`;
}

// STEP 7: name, habitat, species, typical depth, best tide, best wind, best
// season, best lures, access notes, confidence, validation status, source,
// last updated, future catch history.
export function buildLocationPopup(props) {
  const validationColor = VALIDATION_COLORS[props.validationStatus] || "#7a8578";
  const validationLabel = VALIDATION_LABELS[props.validationStatus] || props.validationStatus;

  const speciesHtml = (props.species || []).length
    ? `<div class="atlas-popup-species">${props.species.map((s) =>
        `<span class="atlas-popup-chip">${escapeHtml(s.label)}${s.confidence != null ? ` · ${s.confidence}%` : ""}</span>`
      ).join("")}</div>`
    : `<div class="atlas-popup-empty">No species data yet</div>`;

  const luresHtml = (props.bestLures || []).length
    ? props.bestLures.map(escapeHtml).join(", ")
    : null;

  const catchHtml = props.catchCount > 0
    ? `${props.catchCount} recorded catch${props.catchCount === 1 ? "" : "es"}`
    : "No catch history yet";

  return `
    <div class="atlas-popup">
      <div class="atlas-popup-title">${escapeHtml(props.name)}</div>
      ${row("Habitat", props.habitatLabel)}
      <div class="atlas-popup-section-label">Species</div>
      ${speciesHtml}
      ${row("Typical depth", props.depthTypical)}
      ${row("Best tide", props.bestTide)}
      ${row("Best wind", props.bestWind)}
      ${row("Best season", props.bestSeason)}
      ${row("Best lures", luresHtml)}
      ${row("Access", props.accessNotes)}
      ${row("Catch history", catchHtml)}
      <div class="atlas-popup-divider"></div>
      <div class="atlas-popup-row">
        <span class="atlas-popup-label">Confidence</span>
        <span class="atlas-popup-value">${props.confidence ?? 0}%</span>
      </div>
      <div class="atlas-popup-row">
        <span class="atlas-popup-label">Status</span>
        <span class="atlas-popup-value" style="color:${validationColor}">${escapeHtml(validationLabel)}</span>
      </div>
      ${row("Source", props.source)}
      ${row("Last updated", props.lastUpdated)}
    </div>
  `;
}

// Generic popup for habitat/access/hazard layers (grass flats, boat ramps,
// etc) — fewer fields than a named fishing location, since these are areas
// or utility points rather than curated waypoints.
export function buildFeaturePopup(props, layerLabel) {
  const validationColor = VALIDATION_COLORS[props.validationStatus] || "#7a8578";
  const validationLabel = VALIDATION_LABELS[props.validationStatus] || props.validationStatus;
  return `
    <div class="atlas-popup">
      <div class="atlas-popup-title">${escapeHtml(props.name || layerLabel)}</div>
      ${row("Layer", layerLabel)}
      <div class="atlas-popup-row">
        <span class="atlas-popup-label">Confidence</span>
        <span class="atlas-popup-value">${props.confidence ?? 0}%</span>
      </div>
      <div class="atlas-popup-row">
        <span class="atlas-popup-label">Status</span>
        <span class="atlas-popup-value" style="color:${validationColor}">${escapeHtml(validationLabel)}</span>
      </div>
      ${row("Source", props.source)}
      ${row("Last updated", props.lastUpdated)}
    </div>
  `;
}
