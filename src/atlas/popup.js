// src/atlas/popup.js
// Builds popup HTML for map features. Kept as plain string templates (no
// framework) since this is a standalone vanilla-JS page — see docs/atlas.md
// for why the Atlas isn't part of the React SPA.

import { getCatchesForLocation } from "./catchlog.js";
import { isInRun } from "./tripplan.js";

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

// 8-point compass centers, degrees. Matched against a 16-point wind reading
// (e.g. "WNW") within a 45° arc either side, so a wind that's "close enough"
// to an exposed direction still counts — this is a visually-assessed
// approximation (see db/migrations/2026-07-28-wind-exposure.sql), not a
// precise fetch calculation, so a generous tolerance is the honest choice.
const DIR8_TO_DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const DIR16_TO_DEG = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};
function angleDiff(a, b) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}
function windShelterStatus(exposedDirections, windDir) {
  if (!Array.isArray(exposedDirections) || !windDir) return null;
  const windDeg = DIR16_TO_DEG[windDir] ?? DIR8_TO_DEG[windDir];
  if (windDeg == null) return null;
  if (exposedDirections.length === 0) return { exposed: false };
  const exposed = exposedDirections.some((dir) => {
    const dirDeg = DIR8_TO_DEG[dir];
    return dirDeg != null && angleDiff(windDeg, dirDeg) <= 45;
  });
  return { exposed };
}

// Device-local catch log (see catchlog.js) — a form plus whatever's already
// logged here. Rendered fresh on every popupopen (main.js re-sets popup
// content then), not just once at map load, so a catch logged a minute ago
// shows up without needing to reload the page.
function buildCatchLogSection(locationId) {
  const entries = getCatchesForLocation(locationId);
  const entriesHtml = entries.length
    ? entries.map((entry) => {
        const date = new Date(entry.loggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        const c = entry.conditions;
        const conditionsBits = c
          ? [c.wind, c.tide, c.pressure ? `${c.pressure.direction} (${c.pressure.inHg}" Hg)` : null].filter(Boolean).join(" · ")
          : "";
        return `
          <li class="atlas-catchlog-entry" data-catch-id="${escapeHtml(entry.id)}">
            <div class="atlas-catchlog-entry-head">
              <strong>${escapeHtml(entry.species)}</strong>
              <span>${escapeHtml(date)}</span>
              <button type="button" class="atlas-catchlog-delete" data-catch-id="${escapeHtml(entry.id)}" aria-label="Delete this entry" title="Delete">&times;</button>
            </div>
            ${entry.note ? `<div class="atlas-catchlog-note">${escapeHtml(entry.note)}</div>` : ""}
            ${conditionsBits ? `<div class="atlas-catchlog-conditions">${escapeHtml(conditionsBits)}</div>` : ""}
          </li>`;
      }).join("")
    : `<div class="atlas-popup-empty">No catches logged here yet</div>`;

  return `
    <div class="atlas-popup-divider"></div>
    <div class="atlas-popup-section-label">Your catch log</div>
    <ul class="atlas-catchlog-list">${entriesHtml}</ul>
    <form class="atlas-catchlog-form" data-location-id="${escapeHtml(locationId)}">
      <input type="text" name="species" placeholder="Species (e.g. Redfish)" class="atlas-catchlog-input" required />
      <input type="text" name="note" placeholder="Note (bait, size, tide stage...)" class="atlas-catchlog-input" />
      <button type="submit" class="atlas-catchlog-submit">Log catch</button>
    </form>
    <div class="atlas-popup-caveat">Saved on this device only — not shared, not backed up, and not visible to anyone else.</div>
  `;
}

function buildRunToggleButton(locationId) {
  const inRun = isInRun(locationId);
  return `
    <button type="button" class="atlas-run-toggle ${inRun ? "atlas-run-toggle-active" : ""}" data-location-id="${escapeHtml(locationId)}">
      ${inRun ? "✓ In today's run — tap to remove" : "+ Add to today's run"}
    </button>
  `;
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

  const windDirToday = fishingContext?.packet?.currentConditions?.windDir;
  const shelter = windShelterStatus(props.exposedDirections, windDirToday);
  const shelterHtml = shelter
    ? `<div class="atlas-popup-shelter ${shelter.exposed ? "atlas-popup-shelter-exposed" : "atlas-popup-shelter-protected"}">
        ${shelter.exposed ? "🔴 Exposed today" : "🟢 Protected today"} (wind ${escapeHtml(windDirToday)})
      </div>`
    : "";

  return `
    <div class="atlas-popup">
      <div class="atlas-popup-title">${escapeHtml(props.name)}</div>
      ${shelterHtml}
      ${buildRunToggleButton(props.id)}
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
      ${buildCatchLogSection(props.id)}
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
