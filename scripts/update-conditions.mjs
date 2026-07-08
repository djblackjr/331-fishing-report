// scripts/update-conditions.mjs
// Fetches live weather (NWS), tides (NOAA CO-OPS), and sunrise/sunset (sunrise-sunset.org)
// for the 331 Bridge / Freeport, FL area, computes the moon phase locally, and rewrites
// src/data/conditions.json. All sources are free and require no API key.
//
// Run manually:   node scripts/update-conditions.mjs
// Run on schedule: see .github/workflows/daily-refresh.yml

import { writeFile, readFile } from "fs/promises";

const LAT = 30.48;   // approx. 331 Bridge / Shipyard Marina
const LON = -86.14;
const TIDE_STATION = "8729511"; // NOAA: Destin, East Pass, FL
const USER_AGENT = "331-fishing-report (github.com/djblackjr/331-fishing-report)";
const OUT_PATH = new URL("../src/data/conditions.json", import.meta.url);

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
    const windMph = parseInt(p.windSpeed, 10) || 0;
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
  const windMph = parseInt(today.windSpeed, 10) || 0;
  const windDir = (today.windDirection.match(/[NSEW]+/) || ["E"])[0];

  const forecast = buildForecastEntries(periods);
  const tide = await getTideData().catch(() => ({ text: existing.tide, events: existing.tideEvents || [] }));
  const sun = await getSunTimes().catch(() => ({ sunrise: existing.sunrise, sunset: existing.sunset }));
  const openMeteo = await getOpenMeteo().catch((err) => {
    console.warn("Open-Meteo fetch failed, keeping previous value:", err.message);
    return existing.openMeteo || null;
  });
  const moon = moonPhase();
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
    wind: { speed: windMph, dir: windDir, description: `${today.windDirection} ${today.windSpeed}` },
    weather: `${today.shortForecast} · High ${today.temperature}°F${heatIndexFrom(today.detailedForecast) ? ` · Heat index up to ${heatIndexFrom(today.detailedForecast)}°F` : ""}`,
    tide: `${tide.text} · Sunrise ${sun.sunrise}`,
    tideEvents: tide.events.length ? tide.events : existing.tideEvents,
    sunrise: sun.sunrise,
    sunset: sun.sunset,
    stormWindow,
    stormChance,
    moonPhase: moon,
    lastUpdated: `${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })} CT · Source: National Weather Service + NOAA Tides (station ${TIDE_STATION}) · Auto-refreshed`,
    forecast,
    openMeteo, // array of 3 days, same shape as `forecast` but from a different model source — see getOpenMeteo()
    previousDay,
    // localBiteReport / localBiteSource / localBiteUpdated intentionally left
    // untouched — there's no reliable free API for guide/charter reports, so
    // this only updates when you ask Claude to refresh it manually. The app
    // shows a "days since refreshed" flag on this box using localBiteUpdated.
  };

  await writeFile(OUT_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log("conditions.json updated:", updated.lastUpdated);
}

main().catch((err) => {
  console.error("Update failed, leaving conditions.json untouched:", err);
  process.exit(1);
});
