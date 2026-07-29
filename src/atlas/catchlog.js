// src/atlas/catchlog.js
// A per-device catch log, tied to specific mapped fishing_locations. The
// Atlas is a static site with no backend (see docs/atlas.md) — there's no
// way to write back to db/atlas.db from a visitor's browser — so this uses
// localStorage instead of pretending to be a shared/synced log. That's a
// real, honest limitation: entries live on one device/browser only, same
// as the main dashboard's Trip Log is honest about window.storage only
// working inside a Claude artifact. Unlike that one, though, this actually
// works on the real deployed GitHub Pages site, since localStorage needs no
// backend at all.

const STORAGE_KEY = "atlasCatchLog";

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full or disabled (private browsing) — fail silently, same
    // spirit as the main app's window.storage try/catches.
  }
}

export function getCatchesForLocation(locationId) {
  return readAll()
    .filter((entry) => entry.locationId === locationId)
    .sort((a, b) => b.loggedAt - a.loggedAt);
}

// `conditions` is a snapshot (wind, tide, pressure) taken at log time, not a
// live reference — the whole point is preserving "what it was like when this
// bit" even after today's conditions.json is overwritten tomorrow.
export function addCatch(locationId, { species, note, conditions }) {
  const entries = readAll();
  entries.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    locationId,
    species: species || "Unspecified",
    note: note || "",
    conditions: conditions || null,
    loggedAt: Date.now(),
  });
  writeAll(entries);
}

export function deleteCatch(id) {
  writeAll(readAll().filter((entry) => entry.id !== id));
}
