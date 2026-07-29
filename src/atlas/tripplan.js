// src/atlas/tripplan.js
// "Today's run" — a simple ordered list of fishing_locations to hit in one
// trip (the kind of sequencing a guide already does mentally for e.g. a
// Mack/Hewett/Buck Bayou day on the main dashboard). Device-local via
// localStorage, same honesty tradeoff as catchlog.js — no backend, so no
// cross-device sync, but it actually works on the real deployed site.

const STORAGE_KEY = "atlasTodaysRun";

function readRun() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRun(ids) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Storage full/disabled — fail silently.
  }
}

export function getRun() {
  return readRun();
}

export function isInRun(locationId) {
  return readRun().includes(locationId);
}

export function toggleStop(locationId) {
  const run = readRun();
  const idx = run.indexOf(locationId);
  if (idx === -1) run.push(locationId);
  else run.splice(idx, 1);
  writeRun(run);
  return run;
}

export function moveStop(locationId, direction) {
  const run = readRun();
  const idx = run.indexOf(locationId);
  if (idx === -1) return run;
  const swapWith = idx + direction;
  if (swapWith < 0 || swapWith >= run.length) return run;
  [run[idx], run[swapWith]] = [run[swapWith], run[idx]];
  writeRun(run);
  return run;
}

export function clearRun() {
  writeRun([]);
  return [];
}

// Great-circle distance in nautical miles — the unit a boater actually
// thinks in, not statute miles or km. Straight-line only: this has no
// marine routing data (no channel/depth-aware pathing), so it's "as the
// pelican flies" between stops, not an actual boating route.
export function nauticalMilesBetween(lat1, lng1, lat2, lng2) {
  const R_NM = 3440.065;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R_NM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
