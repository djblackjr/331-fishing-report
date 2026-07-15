// scripts/update-conditions.mjs
// Fetches live weather (NWS), tides (NOAA CO-OPS), and sunrise/sunset (sunrise-sunset.org)
// for the 331 Bridge / Freeport, FL area, computes the moon phase locally, and rewrites
// src/data/conditions.json. All sources are free and require no API key.
//
// Run manually:   node scripts/update-conditions.mjs
// Run on schedule: see .github/workflows/daily-refresh.yml

import { writeFile, readFile, mkdir } from "fs/promises";

const LAT = 30.48;   // approx. 331 Bridge / Shipyard Marina
const LON = -86.14;
const TIDE_STATION = "8729511"; // NOAA: Destin, East Pass, FL
const USER_AGENT = "331-fishing-report (github.com/djblackjr/331-fishing-report)";
const OUT_PATH = new URL("../src/data/conditions.json", import.meta.url);
// Files under public/ are deployed as plain static assets (Vite copies them
// as-is, doesn't bundle them into the JS) — so the app can fetch any day's
// archive at runtime with a normal fetch('/history/2026-07-08.json') call,
// no database or backend needed. This is what lets the Trip Log look up real
// recorded conditions for a past date instead of relying on manual guesses.
const HISTORY_DIR = new URL("../public/history/", import.meta.url);

async function getJson(url, opts = {}) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, ...opts.headers } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

// ── Weather: National Weather Service (api.weather.gov) ─────────────────────
async function getForecast() {
  const point = await getJson(`https://api.weather.gov/points/${LAT},${LON}`);
  const forecast = await getJson(point.properties.forecast);
  return forecast.properties.periods; // array of day/night periods
}

function emojiFor(shortForecast) {
  const s = shortForecast.toLowerCase();
  if (s.includes("thunder") || s.includes("storm")) return "⛈️";
  if (s.includes("rain") || s.includes("shower")) return "🌧️";
  if (s.includes("cloud")) return "⛅";
  return "☀️";
}

function heatIndexFrom(text) {
  const m = text.match(/heat index[^.]*?(\d{2,3})/i);
  return m ? m[1] : null;
}

// The lure recommendations in App.jsx switch between a "Cloudy morning" and
// "Bright sun" tackle box based on the `sky` field — but that field was never
// actually being set by this script, so it stayed stuck at whatever the seed
// file said ("Bright sun") forever, regardless of real conditions. This maps
// NWS's shortForecast text to the two buckets the app's LURE_MATRIX expects.
function deriveSky(shortForecast) {
  return /cloud|overcast|rain|shower|storm/i.test(shortForecast) ? "Cloudy" : "Bright sun";
}

// NWS gives wind speed as a string, often a range like "0 to 10 mph" or a
// single value like "10 mph". parseInt() alone grabs only the first number in
// a range — for "0 to 10 mph" that's 0, which silently produced speed:0 even
// on a real 10 mph day. This pulls every number in the string and uses the
// highest one, since the upper bound is what matters for wind-warning
// thresholds (a "0 to 10 mph" day can still gust to 10).
function parseWindSpeed(str) {
  const nums = (str.match(/\d+/g) || []).map(Number);
  return nums.length ? Math.max(...nums) : 0;
}

// Simple, transparent fishing-score heuristic. Tune freely — this is not a
// scientific model, just a reasonable starting point based on wind/rain/storms.
function scoreFor({ windMph, pop, storms }) {
  let score = 9;
  if (windMph > 15) score -= 1.5;
  else if (windMph > 10) score -= 0.5;
  score -= (pop || 0) / 25;
  if (storms) score -= 0.5;
  return Math.max(3, Math.min(9.5, Math.round(score * 10) / 10));
}

function buildForecastEntries(periods) {
  const daytime = periods.filter((p) => p.isDaytime).slice(0, 3);
  const labels = ["Today", "Tomorrow"];
  return daytime.map((p, i) => {
    const windMph = parseWindSpeed(p.windSpeed);
    const pop = p.probabilityOfPrecipitation?.value ?? 0;
    const storms = /thunder|storm/i.test(p.shortForecast);
    const heat = heatIndexFrom(p.detailedForecast);
    return {
      day: new Date(p.startTime).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
      label: labels[i] || p.name,
      high: p.temperature,
      low: null, // filled in from the following night period by caller if desired
      wind: `${p.windDirection} ${p.windSpeed}`,
      storms: storms ? Math.max(pop, 20) : pop,
      headline: `${p.shortForecast}${heat ? ` · Heat index ${heat}` : ""}`,
      fishingScore: scoreFor({ windMph, pop, storms }),
      aiCall: p.detailedForecast,
      emoji: emojiFor(p.shortForecast),
    };
  });
}

// ── Weather: Open-Meteo (second source, shown side-by-side with NWS) ────────
// Free, no API key, non-commercial use up to 10,000 requests/day (see
// open-meteo.com). This is a genuinely different data pipeline than NWS (it
// blends multiple global models rather than being the US government's own
// forecast), so showing both gives a real second opinion rather than two
// views of the same underlying data.
const WMO_CODES = {
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
  45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
  61: "Light rain", 63: "Rain", 65: "Heavy rain",
  80: "Rain showers", 81: "Rain showers", 82: "Violent rain showers",
  95: "Thunderstorm", 96: "Thunderstorm w/ hail", 99: "Thunderstorm w/ hail",
};
function degToCompass(deg) {
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return dirs[Math.round(deg / 45) % 8];
}
async function getOpenMeteo() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max,winddirection_10m_dominant,weathercode&timezone=America%2FChicago&forecast_days=3&temperature_unit=fahrenheit&windspeed_unit=mph`;
  const data = await getJson(url);
  const d = data.daily;
  return d.time.map((_, i) => ({
    high: Math.round(d.temperature_2m_max[i]),
    low: Math.round(d.temperature_2m_min[i]),
    stormChance: d.precipitation_probability_max[i],
    windSpeed: Math.round(d.windspeed_10m_max[i]),
    windDir: degToCompass(d.winddirection_10m_dominant[i]),
    summary: WMO_CODES[d.weathercode[i]] || "Unknown",
  }));
}
// ── Water temp: Open-Meteo Marine API ────────────────────────────────────────
// NOAA's tide station here (8729511) has no water-temperature sensor, and
// relying on whatever guide blog posts happen to mention ("low 80s") is
// often stale by days. This is a real (model-derived) sea surface temp
// reading for the exact bay coordinates, free and no key required.
async function getWaterTemp() {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=sea_surface_temperature&temperature_unit=fahrenheit`;
  const data = await getJson(url);
  return Math.round(data.current.sea_surface_temperature);
}

async function getTideData() {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, "");
  const url = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&application=331FishingReport&begin_date=${ymd}&end_date=${ymd}&datum=MLLW&station=${TIDE_STATION}&time_zone=lst_ldt&units=english&interval=hilo&format=json`;
  const data = await getJson(url);
  const preds = data.predictions || [];
  const fmt = (t) => new Date(t.replace(" ", "T")).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  const events = preds.map((p) => ({ type: p.type, time: fmt(p.t) })); // structured, for the tide-curve graph
  const highs = events.filter((e) => e.type === "H").map((e) => e.time);
  const lows = events.filter((e) => e.type === "L").map((e) => e.time);
  const text = `High tide ~${highs[0] || "n/a"} · Low tide ~${lows[0] || "n/a"}`;
  return { text, events };
}

// ── Sunrise/sunset: sunrise-sunset.org ────────────────────────────────────────
async function getSunTimes() {
  const url = `https://api.sunrise-sunset.org/json?lat=${LAT}&lng=${LON}&formatted=0`;
  const data = await getJson(url);
  const fmt = (iso) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" });
  return { sunrise: fmt(data.results.sunrise), sunset: fmt(data.results.sunset) };
}

// ── Moon phase: computed locally (Conway's algorithm, no API needed) ─────────
function moonPhase(date = new Date()) {
  let y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  if (m < 3) { y--; m += 12; }
  m++;
  const c = 365.25 * y, e = 30.6 * m;
  let jd = c + e + d - 694039.09;
  jd /= 29.5305882;
  let b = Math.floor(jd);
  jd -= b;
  const age = jd * 29.5305882; // days into current lunar cycle
  const illum = Math.round((1 - Math.cos((jd) * 2 * Math.PI)) / 2 * 100);
  let name;
  if (age < 1.84) name = "New Moon";
  else if (age < 5.53) name = "Waxing Crescent";
  else if (age < 9.22) name = "First Quarter";
  else if (age < 12.91) name = "Waxing Gibbous";
  else if (age < 16.61) name = "Full Moon";
  else if (age < 20.30) name = "Waning Gibbous";
  else if (age < 23.99) name = "Last Quarter";
  else if (age < 27.68) name = "Waning Crescent";
  else name = "New Moon";
  const tidalNote = illum > 80 || illum < 20 ? "strong tidal push (spring tide)" : "moderate tidal push";
  return `${name} (~${illum}% illuminated) — ${tidalNote}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
function extractStormWindow(text) {
  const m = text.match(/(before|after)\s+(\d+\s*(?:AM|PM))/i);
  return m ? `${m[1].toLowerCase()} ${m[2].toUpperCase()}` : "";
}

async function main() {
  const existing = JSON.parse(await readFile(OUT_PATH, "utf-8"));

  const periods = await getForecast();
  const today = periods.find((p) => p.isDaytime) || periods[0];
  const windMph = parseWindSpeed(today.windSpeed);
  const windDir = (today.windDirection.match(/[NSEW]+/) || ["E"])[0];

  const forecast = buildForecastEntries(periods);
  const tide = await getTideData().catch(() => ({ text: existing.tide, events: existing.tideEvents || [] }));
  const sun = await getSunTimes().catch(() => ({ sunrise: existing.sunrise, sunset: existing.sunset }));
  const openMeteo = await getOpenMeteo().catch((err) => {
    console.warn("Open-Meteo fetch failed, keeping previous value:", err.message);
    return existing.openMeteo || null;
  });
  const moon = moonPhase();
  const waterTemp = await getWaterTemp().catch((err) => {
    console.warn("Water temp fetch failed, keeping previous value:", err.message);
    return existing.waterTemp ?? null;
  });
  const stormChance = forecast[0]?.storms || 0;
  const stormWindow = extractStormWindow(today.detailedForecast) || existing.stormWindow || "";

  // Snapshot today's about-to-be-replaced values as "previousDay" BEFORE
  // overwriting, so the app can show a "what changed since yesterday" line.
  // This only captures what the app actually displays (not a full weather
  // history) — good enough for a same-vs-different comparison, not a log.
  const previousDay = {
    date: existing.date,
    wind: { dir: existing.wind?.dir, speed: existing.wind?.speed },
    high: existing.forecast?.[0]?.high,
    stormChance: existing.stormChance ?? existing.forecast?.[0]?.storms ?? 0,
    tide: existing.tide,
  };

  const updated = {
    ...existing,
    date: new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }),
    // en-CA locale formats as YYYY-MM-DD, which is exactly what we need for a
    // reliable filename/lookup key — the human-readable `date` string above
    // isn't safe to parse back programmatically, this is.
    dateISO: new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date()),
    wind: { speed: windMph, dir: windDir, description: `${today.windDirection} ${today.windSpeed}` },
    weather: `${today.shortForecast} · High ${today.temperature}°F${heatIndexFrom(today.detailedForecast) ? ` · Heat index up to ${heatIndexFrom(today.detailedForecast)}°F` : ""}`,
    tide: `${tide.text} · Sunrise ${sun.sunrise}`,
    tideEvents: tide.events.length ? tide.events : existing.tideEvents,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    stormWindow,
    stormChance,
    sky: deriveSky(today.shortForecast),
    moonPhase: moon,
    waterTemp,
    lastUpdated: `${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT · Source: National Weather Service + NOAA Tides (station ${TIDE_STATION}) · Auto-refreshed`,
    forecast,
    openMeteo, // array of 3 days, same shape as `forecast` but from a different model source — see getOpenMeteo()
    previousDay,
    // localBiteReport / localBiteSource / localBiteUpdated intentionally left
    // untouched — there's no reliable free API for guide/charter reports, so
    // this only updates when you ask Claude to refresh it manually. The app
    // shows a "days since refreshed" flag on this box using localBiteUpdated.
  };

  // Archive the COMPLETED previous day before overwriting it. By the time
  // this script runs (~3 AM), `existing` represents a full day that's now
  // over, not "today" — so this is the right moment to freeze it. Guarded
  // with existing.dateISO in case this runs against an older conditions.json
  // that predates this field.
  if (existing.dateISO) {
    try {
      await mkdir(HISTORY_DIR, { recursive: true });
      const archivePath = new URL(`${existing.dateISO}.json`, HISTORY_DIR);
      await writeFile(archivePath, JSON.stringify(existing, null, 2) + "\n");
      console.log("Archived previous day to public/history/" + existing.dateISO + ".json");
    } catch (err) {
      console.warn("Archiving failed (non-fatal, continuing with the main update):", err.message);
    }
  } else {
    console.log("No dateISO on existing conditions.json yet — skipping archive for this run (will start archiving from tomorrow).");
  }

  await writeFile(OUT_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log("conditions.json updated:", updated.lastUpdated);
}

main().catch((err) => {
  console.error("Update failed, leaving conditions.json untouched:", err);
  process.exit(1);
});
