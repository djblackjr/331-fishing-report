// src/atlas/popup.js
// Builds popup HTML for map features. Kept as plain string templates (no
// framework) since this is a standalone vanilla-JS page — see docs/atlas.md
// for why the Atlas isn't part of the React SPA.

// Staged pipeline, earliest to most confirmed — see db/schema.sql.
const VALIDATION_LABELS = {
  placeholder: "Placeholder — unvalidated",
  proposed: "Proposed — insufficient evidence to place",
  visually_reviewed: "Visually reviewed — not field verified",
  user_reported: "User reported",
  field_verified: "Field verified",
  guide_verified: "Guide verified",
};

const VALIDATION_COLORS = {
  placeholder: "#7a8578",
  proposed: "#f87171",
  visually_reviewed: "#38bdf8",
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

function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function buildFishingIntelligence(context) {
  if (!context?.profile || !context?.packet) return "";
  const { profile, packet } = context;
  const signalMap = new Map((packet.speciesSignals || []).map((signal) => [signal.key, signal]));
  const targets = (profile.targetSpecies || [])
    .map((key) => signalMap.get(key))
    .filter(Boolean);
  const targetHtml = targets.length
    ? `<div class="atlas-popup-species">${targets.map((target) => {
        const status = target.current
          ? "current regional report"
          : target.reportCount > 0 ? `last reported ${target.lastReported}` : "habitat guidance";
        return `<span class="atlas-popup-chip">${escapeHtml(target.label)} · ${escapeHtml(status)}</span>`;
      }).join("")}</div>`
    : "";

  const sourceMap = new Map((packet.sources || []).map((source) => [source.id, source]));
  const sourceIds = [...new Set([
    ...(profile.sourceIds || []),
    ...(packet.currentReport?.sourceIds || []),
  ])];
  const sourceLinks = sourceIds
    .map((id) => sourceMap.get(id))
    .filter(Boolean)
    .map((source) => {
      const url = safeHttpUrl(source.url);
      return url
        ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.label)}</a>`
        : "";
    })
    .filter(Boolean)
    .join(" · ");

  return `
    <div class="atlas-popup-divider"></div>
    <div class="atlas-popup-section-label">Regional fishing intelligence</div>
    <div class="atlas-popup-intel-title">${escapeHtml(profile.label)}</div>
    ${targetHtml}
    ${row("Best tide", profile.bestTide)}
    ${row("Approach", profile.approach)}
    ${row("Baits / lures", profile.baits)}
    <div class="atlas-popup-caveat">${escapeHtml(packet.scopeNote)}</div>
    ${sourceLinks ? `<div class="atlas-popup-sources"><span>Sources:</span> ${sourceLinks}</div>` : ""}
  `;
}

// STEP 7: name, habitat, species, typical depth, best tide, best wind, best
// season, best lures, access notes, confidence, validation status, source,
// last updated, future catch history.
export function buildLocationPopup(props, fishingContext = null) {
  const validationColor = VALIDATION_COLORS[props.validationStatus] || "#7a8578";
  const validationLabel = VALIDATION_LABELS[props.validationStatus] || props.validationStatus;

  const speciesHtml = (props.species || []).length
    ? `<div class="atlas-popup-species">${props.species.map((s) =>
        `<span class="atlas-popup-chip">${escapeHtml(s.label)}${s.confidence != null ? ` · ${s.confidence}%` : ""}</span>`
      ).join("")}</div>`
    : `<div class="atlas-popup-empty">No spot-specific species records yet</div>`;

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
      ${buildFishingIntelligence(fishingContext)}
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
export function buildFeaturePopup(props, layerLabel, fishingContext = null) {
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
      ${buildFishingIntelligence(fishingContext)}
      ${row("Source", props.source)}
      ${row("Last updated", props.lastUpdated)}
    </div>
  `;
}
