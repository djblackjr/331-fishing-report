import { useState, useRef } from "react";
import dailyData from "./data/conditions.json";

// ── SHARED CONDITIONS ─────────────────────────────────────────────────────────
// Only the truly evergreen config lives here. Everything that changes day-to-day
// (date, wind, weather, tide, moon phase, forecast, local bite report) comes from
// src/data/conditions.json, which the daily GitHub Action overwrites automatically.
const STATIC_CONDITIONS = {
  launch: "Shipyard Marina · 116 Shipyard Rd, Freeport FL 32439 · (850) 866-3865 · Open 7:30 AM–5 PM. Cruise 4 miles down the creek to east Choctawhatchee Bay. Fuel on-site. Copeland's Bait & Tackle: 17290 US-331 S · open 6 AM · (850) 835-4277.",
  windGuidance: [
    { dir: "N", icon: "↓", advice: "Fish protected south shore — calm water, grass flats east of bridge" },
    { dir: "S", icon: "↑", advice: "Fish north shoreline — LaGrange Bayou mouth and creek edges" },
    { dir: "E", icon: "→", advice: "Fish the bridge — east wind pushes bait against west pilings" },
    { dir: "W", icon: "←", advice: "Fish bayou mouths — LaGrange and Alaqua mouths concentrate fish" },
    { dir: "SW", icon: "↖", advice: "Fish LaGrange/Alaqua mouths and north shoreline — SW wind pushes bait toward both" },
    { dir: "NW", icon: "↘", advice: "Fish south shore and bayou mouths — NW wind pushes bait that direction" },
    { dir: "SE", icon: "↖", advice: "Fish the bridge and north shoreline — SE wind behaves like a mix of E and S" },
    { dir: "NE", icon: "↙", advice: "Fish the bridge and south shore — NE wind behaves like a mix of E and N" },
  ],
  windWarning: "Winds over 15 knots: Stay inside LaGrange Bayou. Avoid crossing open bay water.",
  lureMatrix: {
    "Cloudy morning": [
      { lure: "Spook Jr.", detail: "Bone color · Walk-the-dog across structure" },
      { lure: "MirrOlure Top Dog", detail: "Black/silver · Low light topwater" },
    ],
    "Bright sun": [
      { lure: "White paddle-tail", detail: "1/8 oz jig · Slow bottom bounce" },
      { lure: "Gulp! Shrimp", detail: "New penny · Under popping cork" },
    ],
    "Dirty water": [
      { lure: "New Penny soft plastic", detail: "High contrast in stained water" },
      { lure: "Gold spoon", detail: "Johnson weedless · Flash draws strikes" },
      { lure: "Live shrimp", detail: "Can't beat the real thing in off-color water" },
    ],
    "Slightly stained": [
      { lure: "Chartreuse paddle-tail", detail: "1/8 oz jig · Visible in off-color water" },
      { lure: "White/chartreuse Z-Man", detail: "MinnowZ · Slow retrieve near grass" },
    ],
  },
  regulations: [
    { species: "Redfish", rules: "18–27 in · 1 per person per day" },
    { species: "Speckled Trout", rules: "15–19 in slot · 3 per person per day · 1 over-slot (19+ in) per vessel · Closed February · (FWC rule eff. April 1, 2026)" },
    { species: "Flounder", rules: "14 in min · 5 per person per day · Gulf season closed Oct 15–Nov 30" },
    { species: "Pompano", rules: "11 in fork length min · 6 per person per day" },
    { species: "Black Drum", rules: "14 in min · 25 in max slot · 5 per person per day" },
    { species: "License", rules: "FL saltwater fishing license required" },
    { species: "Verify", rules: "Always confirm at myfwc.com — regulations change" },
  ],
};

const CONDITIONS = { ...dailyData, ...STATIC_CONDITIONS };
const FORECAST = dailyData.forecast;

// ── UNIFIED RATING SYSTEM ──────────────────────────────────────────────────
// Every score on the page (top forecast AND each location) uses this same
// scale and the same today's-storms/wind penalty, so "Excellent" never shows
// next to a 40% storm day while the forecast card says "Fair" for the same day.
function ratingLabel(score) {
  if (score >= 8) return "Excellent";
  if (score >= 7) return "Good";
  if (score >= 5.5) return "Fair";
  return "Poor";
}
function ratingColor(score) {
  return score >= 7.5 ? "#4ade80" : score >= 6 ? "#facc15" : "#f87171";
}
function todaysAdjustedScore(baseScore) {
  const today = FORECAST[0] || {};
  let score = baseScore;
  score -= (today.storms || 0) / 40; // 40% storm chance ≈ -1.0
  if ((CONDITIONS.wind?.speed || 0) > 15) score -= 1;
  return Math.max(3, Math.round(score * 10) / 10);
}

// ── TIME HELPERS ─────────────────────────────────────────────────────────────
// Parse "6:44 AM" style strings into minutes-since-midnight for math/graphing.
function timeToMinutes(t) {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let [, h, min, ap] = m;
  h = parseInt(h, 10); min = parseInt(min, 10);
  if (/PM/i.test(ap) && h !== 12) h += 12;
  if (/AM/i.test(ap) && h === 12) h = 0;
  return h * 60 + min;
}
function minutesToTime(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  let h = Math.floor(mins / 60), m = Math.round(mins % 60);
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
// Both CONDITIONS.date and previousDay.date are plain strings like "July 7,
// 2026" — JS's Date constructor parses that format natively, no custom
// parser needed.
function daysBetween(dateStrEarlier, dateStrLater) {
  const a = Date.parse(dateStrEarlier), b = Date.parse(dateStrLater);
  if (isNaN(a) || isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
}

// ── BEST BET TODAY ───────────────────────────────────────────────────────────
// Ranks all 7 locations by today's-adjusted score and returns the top pick.
function getBestBet() {
  const ranked = LOCATIONS.map(loc => ({ loc, score: todaysAdjustedScore(loc.overallScore) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0];
}

// ── BEST FISHING WINDOW ──────────────────────────────────────────────────────
// Combines sunrise, storm timing, and heat index into a single "fish from X to Y" call.
function getBestWindow() {
  const sunrise = timeToMinutes(CONDITIONS.sunrise || "6:00 AM");
  let end = sunrise + 5 * 60; // default: 5-hour morning window
  let reason = "before the afternoon heat builds";
  const stormWindow = CONDITIONS.stormWindow || "";
  const stormMatch = stormWindow.match(/before\s+(\d+)\s*(AM|PM)/i);
  if (stormMatch) {
    const stormEnd = timeToMinutes(`${stormMatch[1]}:00 ${stormMatch[2]}`);
    if (stormEnd && stormEnd < end) {
      end = stormEnd - 30; // build in a 30-min buffer before storms arrive
      reason = `before storms build (${stormWindow})`;
    }
  }
  return { start: sunrise, end, startText: minutesToTime(sunrise), endText: minutesToTime(end), reason };
}

// ── WHAT CHANGED SINCE YESTERDAY ─────────────────────────────────────────────
// Compares today's conditions against the previousDay snapshot the automation
// script captures each morning before overwriting. Returns a short plain-
// English line, or null if there's nothing to compare against yet (e.g. the
// very first run, before any previousDay data exists).
function getConditionsDiff() {
  const prev = CONDITIONS.previousDay;
  if (!prev) return null;
  const changes = [];
  if (prev.wind?.dir && prev.wind.dir !== CONDITIONS.wind.dir) {
    changes.push(`wind shifted ${prev.wind.dir} → ${CONDITIONS.wind.dir}`);
  }
  const todayHigh = FORECAST[0]?.high;
  if (typeof prev.high === "number" && typeof todayHigh === "number" && prev.high !== todayHigh) {
    const dir = todayHigh > prev.high ? "up" : "down";
    changes.push(`high ${dir} ${Math.abs(todayHigh - prev.high)}° (${prev.high}° → ${todayHigh}°)`);
  }
  const todayStorms = CONDITIONS.stormChance ?? FORECAST[0]?.storms ?? 0;
  if (typeof prev.stormChance === "number" && prev.stormChance !== todayStorms) {
    const dir = todayStorms > prev.stormChance ? "up" : "down";
    changes.push(`storm chance ${dir} ${Math.abs(todayStorms - prev.stormChance)}% (${prev.stormChance}% → ${todayStorms}%)`);
  }
  if (changes.length === 0) return "Conditions steady since yesterday — no meaningful change in wind, temps, or storm risk.";
  return `Since yesterday: ${changes.join(" · ")}.`;
}

// ── BAIT INVENTORY & RECOMMENDATIONS ─────────────────────────────────────────
const ALL_BAITS = [
  { id: "live_shrimp",    label: "Live Shrimp",      emoji: "🦐" },
  { id: "mud_minnow",     label: "Mud Minnows",       emoji: "🐟" },
  { id: "fiddler_crab",   label: "Fiddler Crabs",     emoji: "🦀" },
  { id: "mullet",         label: "Live/Cut Mullet",   emoji: "🐠" },
  { id: "frozen_shrimp",  label: "Frozen Shrimp",     emoji: "🧊" },
  { id: "squid",          label: "Squid",             emoji: "🦑" },
  { id: "no_bait",        label: "Artificials Only",  emoji: "🪝" },
];

// Rigging & tips keyed to bait id
const BAIT_RECS = {
  live_shrimp: {
    rigs: [
      { name: "Popping Cork", detail: "18-inch leader · 1/0 kahle hook · Cork 18 inches above shrimp · Twitch every 10–15 sec" },
      { name: "Free-lined", detail: "No weight · 1/0 hook through tail · Deadly on calm days near structure" },
      { name: "Under a float", detail: "Slip float · Set depth to 1–2 ft off bottom · Drift over grass flats" },
      { name: "Bottom rig", detail: "Split shot 8 inches above hook · 2/0 kahle · For drum and sheepshead near pilings" },
    ],
    tip: "Hook through the tail for free-lining or cork rigs — keeps it alive longest. Hook through the horn (head) when bottom fishing so it can't burrow.",
  },
  mud_minnow: {
    rigs: [
      { name: "Jig head", detail: "1/4 oz jig · Hook up through lower lip · Hop along bottom for flounder" },
      { name: "Carolina rig", detail: "1/4 oz egg sinker · 12-inch fluorocarbon leader · 2/0 hook · Drag slowly on bottom" },
      { name: "Under cork", detail: "Popping cork · 18-inch leader · Hook through lips · Best near oyster bars" },
    ],
    tip: "Mud minnows are the top flounder bait in the bayous. Keep them in an aerated bucket — they die fast. Fish slowly on the bottom near structure.",
  },
  fiddler_crab: {
    rigs: [
      { name: "Bottom rig", detail: "1/0–2/0 hook · Thread through top of shell · No weight needed near pilings" },
      { name: "Split shot rig", detail: "Light split shot · 12-inch leader · Drift along oyster bar edges for sheepshead" },
    ],
    tip: "Best bait for sheepshead and black drum at the 331 Bridge pilings. Let it sit on the bottom — don't move it much. Use 20 lb fluorocarbon leader.",
  },
  mullet: {
    rigs: [
      { name: "Live under float", detail: "Large popping cork · 2/0–3/0 hook through back · Redfish and big trout" },
      { name: "Cut chunk on jig", detail: "1-inch chunk on 1/4 oz jig head · Drag on bottom · Deadly for flounder" },
      { name: "Free-lined live", detail: "No weight · 3/0 hook · Let it swim near grass edges and creek mouths" },
    ],
    tip: "Live finger mullet are top-tier redfish bait — free-lined near oyster bars. Cut mullet chunks on a jig head are arguably the best flounder bait in the bayous.",
  },
  frozen_shrimp: {
    rigs: [
      { name: "Bottom rig", detail: "1/4 oz egg sinker · 2/0 kahle hook · Whole shrimp with shell on · Drum, sheepshead" },
      { name: "Jig head", detail: "1/8 oz jig · Peeled shrimp on hook · Slow hop near oyster bars · Trout and reds" },
      { name: "Under cork", detail: "Popping cork · 18-inch leader · Peeled or whole · Works but not as well as live" },
    ],
    tip: "Thaw in saltwater, not fresh water. Keep it cold — warm frozen shrimp falls apart fast. Peel for jig fishing, leave shell on for bottom rigs so it stays on the hook longer.",
  },
  squid: {
    rigs: [
      { name: "Strip on bottom", detail: "1-inch strip on 2/0 hook · Egg sinker rig · Black drum and sheepshead at pilings" },
      { name: "Tipped jig", detail: "Small strip on paddle-tail jig · Adds scent to artificial — good in dirty water" },
    ],
    tip: "Squid is tough and stays on the hook well — great for fishing hard structure like pilings where you get snagged often. Black drum love it.",
  },
  no_bait: {
    rigs: [
      { name: "Gold Johnson Spoon", detail: "Slow retrieve over grass and oyster bars — most versatile artificial here" },
      { name: "Z-Man MinnowZ 3in", detail: "White or chartreuse · 1/8 oz jig · Slow twitch near grass edges" },
      { name: "Gulp! Shrimp", detail: "New Penny or Pumpkinseed · Closest artificial to live shrimp · Fish under cork" },
      { name: "MirrOlure Top Dog", detail: "Bone/chrome · Walk-the-dog at first light along pilings and bars" },
      { name: "MirrOlure 52M", detail: "Suspending twitch bait · Count down to depth, twitch and pause for trout" },
      { name: "Rat-L-Trap 1/2 oz", detail: "Chrome/blue · Fan cast grass flats when fish are scattered" },
    ],
    tip: "Gold spoon covers all four locations. Gulp! Shrimp in New Penny comes closest to live shrimp for trout. Work topwater until the sun clears the tree line, then switch to soft plastics.",
  },
};

// ── WIND HELPERS (drive dynamic stop text so it can never drift from actual conditions) ──
const DIR_WORD = { N: "north", S: "south", E: "east", W: "west", NE: "northeast", NW: "northwest", SE: "southeast", SW: "southwest" };
const OPPOSITE_DIR = { N: "S", S: "N", E: "W", W: "E", NE: "SW", SW: "NE", SE: "NW", NW: "SE" };
function leeSide(dir) { return DIR_WORD[OPPOSITE_DIR[dir]] || dir; }
function windWord(dir) { return DIR_WORD[dir] || dir; }
function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ── PER-LOCATION REPORTS ──────────────────────────────────────────────────────
const LOCATIONS = [
  {
    id: "bridge",
    label: "331 Bridge",
    emoji: "🌉",
    overallScore: 8.0,
    conditions: "Excellent",
    species: [
      { name: "Speckled Trout", confidence: 88, note: "Along pilings on incoming tide, topwater at first light" },
      { name: "Redfish", confidence: 82, note: "East side channel edge, gold spoon or live shrimp" },
      { name: "Black Drum", confidence: 72, note: "Bottom near pilings, cut crab or shrimp" },
      { name: "Sheepshead", confidence: 55, note: "Tight to pilings with fiddler crab" },
      { name: "Flounder", confidence: 40, note: "Deep channel under bridge, mud minnow on jig" },
    ],
    stops: [
      { order: 1, name: (wind) => `Bridge Pilings (${capitalize(leeSide(wind.dir))} Side)`, tide: "Incoming tide · sunrise", steps: [
        "Bone/white Spook Jr. topwater along pilings pre-dawn",
        "Switch to chartreuse paddle-tail as sun rises",
        (wind) => `${capitalize(windWord(wind.dir))} wind today — bait stacks on the ${leeSide(wind.dir)} face of pilings`,
      ] },
      { order: 2, name: "Channel Edge", tide: "Mid-incoming", steps: ["Gold Johnson spoon slow-retrieved through the channel", "Live shrimp under popping cork in 4–6 ft", "Target the depth change between grass and sand"] },
      { order: 3, name: "South Shore Grass Flats", tide: "Outgoing", steps: ["Weedless paddle-tail in white or new penny", "Sight fish tailing reds in 1–2 ft", (wind) => `${wind.description} — check for chop before committing here`] },
    ],
    aiNote: "The 331 Bridge spans the narrow neck of Choctawhatchee Bay, creating a current funnel where bait gets pushed through on both tides. The pilings hold trout, reds, sheepshead, and black drum year-round. The lee-side pilings are the prime ambush zone on incoming tides. Open water here is exposed to weather and chop — it is the first spot to become unfishable when wind picks up.",
    todaysCall: "Storm-watch day for the bridge — 40% chance of showers and thunderstorms, mainly before 4 PM, so launch early and keep an eye on the radar. SW wind at 5-10 mph stacks bait against the northeast pilings. This matches what guides are seeing bay-wide right now — reds and trout schooling tight to bridge structure as the summer pattern locks in. Get your fishing in during the morning window and be ready to head in if storms build.",
  },
  {
    id: "alaqua",
    label: "Alaqua Bayou",
    emoji: "🌿",
    overallScore: 7.5,
    conditions: "Good",
    species: [
      { name: "Redfish", confidence: 90, note: "Oyster bars and creek bends, gold spoon or live shrimp" },
      { name: "Speckled Trout", confidence: 75, note: "Grass flat edges at bayou mouth on incoming tide" },
      { name: "Flounder", confidence: 65, note: "Mud bottom near oyster bars, mud minnow on jig" },
      { name: "Black Drum", confidence: 55, note: "Deeper holes in the bayou, shrimp on bottom" },
      { name: "Largemouth Bass", confidence: 45, note: "Upper creek near freshwater inflow, soft plastics" },
    ],
    stops: [
      { order: 1, name: "Bayou Mouth Oyster Bars", tide: "Incoming tide", steps: ["Gold spoon along oyster bar edges", "Live shrimp under popping cork", (wind) => `${wind.description} — calm conditions concentrate fish at the mouth, prime spot`] },
      { order: 2, name: "Creek Bends (Mid-Bayou)", tide: "Mid-incoming", steps: ["Slow-roll paddle-tail through bends", "Topwater along overhanging banks at dawn", "Mud minnow on 1/4 oz jig for flounder on bottom"] },
      { order: 3, name: "Upper Alaqua Creek", tide: "Any", steps: ["Transitions to bass-fishing style in upper reaches", "Soft plastics and small swimbaits near structure", "Watch for alligators — keep hooks away from the bank"] },
    ],
    aiNote: "Alaqua Bayou is protected water with a strong year-round redfish population, plus trout and flounder at the mouth. The oyster bars at the creek mouth are the prime spot. Tree cover keeps it a few degrees cooler than the open bay and offers shelter from wind and weather. The upper creek transitions toward brackish and holds bass alongside small reds.",
    todaysCall: "Fish the oyster bars at the bayou mouth early on the incoming tide with a gold spoon — a 40% chance of storms moves in by afternoon, mainly before 4 PM, so this is a morning-window day. SW wind 5-10 mph. Water temps sitting in the low 80s bay-wide right now, and the trout bite has been strong the last several days — good sign for the mouth flats. Tree line offers some storm shelter if you need to duck in.",
  },
  {
    id: "basin",
    label: "Basin Bayou",
    emoji: "🦅",
    overallScore: 7.5,
    conditions: "Good",
    species: [
      { name: "Redfish", confidence: 85, note: "Shallow grass flats and oyster bars throughout" },
      { name: "Speckled Trout", confidence: 70, note: "Bayou mouth and deeper grass flat edges" },
      { name: "Flounder", confidence: 60, note: "Sandy pockets near the mouth, mud minnow" },
      { name: "Black Drum", confidence: 50, note: "Deeper holes, shrimp or cut crab on bottom" },
      { name: "Pompano", confidence: 35, note: "Bayou mouth on moving tide, small jig or sand flea" },
    ],
    stops: [
      { order: 1, name: "Basin Bayou Mouth", tide: "Incoming tide", steps: ["Live shrimp under popping cork", "Work the tide line where bay meets bayou", "Pompano possible on small jigs near the mouth"] },
      { order: 2, name: "Interior Grass Flats", tide: "Mid-incoming", steps: ["Weedless gold spoon — slow retrieve over grass", "Sight fish for tailing reds in skinny water", "Stay shallow — most reds here are in under 2 feet"] },
      { order: 3, name: "Oyster Bar Edges", tide: "Outgoing", steps: ["Switch to paddle-tail on falling tide", "Work parallel to oyster edges, not over them", "Flounder stack in sandy pockets adjacent to bars"] },
    ],
    aiNote: "Basin Bayou sees less pressure than Alaqua and LaGrange, which means less-educated fish. The interior grass flats are classic sight-fishing territory for reds — poling or drifting quietly in under 2 feet. Pompano occasionally show at the mouth on moving tides in late spring and early summer. Less protected than LaGrange when weather builds.",
    todaysCall: "Sunny calm day — smooth water is ideal for sight-fishing the interior grass flats. Perfect for spotting tailing reds in skinny water, and guides have been finding some genuinely big reds on the flats this week — including a 40+ inch bull redfish reported near Santa Rosa Beach. Start at the mouth with small jigs for pompano on the moving tide, then pole inside as the sun climbs.",
  },
  {
    id: "lagrange",
    label: "LaGrange Bayou",
    emoji: "🦪",
    overallScore: 8.5,
    conditions: "Excellent",
    species: [
      { name: "Speckled Trout", confidence: 92, note: "Oyster bars and grass flats — best trout spot in the area" },
      { name: "Redfish", confidence: 85, note: "Shallow flats and creek edges, especially on falling tide" },
      { name: "Flounder", confidence: 60, note: "Sandy bottom near oyster bars, mud minnow on jig" },
      { name: "Black Drum", confidence: 55, note: "Deep holes inside bayou, shrimp on bottom" },
      { name: "Sheepshead", confidence: 45, note: "Dock pilings and any hard structure inside bayou" },
    ],
    stops: [
      { order: 1, name: "LaGrange Mouth Oyster Bars", tide: "Incoming tide", steps: ["Popping cork with live shrimp — classic setup", "Bone topwater along bar edges at first light", "Best trout spot in the area on incoming tide"] },
      { order: 2, name: "Interior Grass Flats", tide: "Mid-incoming", steps: ["Gold spoon or weedless paddle-tail", "Slow retrieve over submerged grass", "Reds and trout both active here mid-morning"] },
      { order: 3, name: "Deep Holes (Interior)", tide: "Outgoing or any falling water", steps: ["Fish deeper holes with shrimp on bottom for black drum", "Sheepshead near any dock pilings or hard structure", "Protected water makes a good late-morning stop as heat builds"] },
    ],
    aiNote: "LaGrange is the top trout producer in this report — its oyster bars at the mouth are legendary, and the interior grass flats hold reds year-round. Deep holes inside hold black drum and sheepshead. The bayou is also the most protected water on this side of the bay, making it the go-to spot when weather builds. Premium spot in both calm and rough conditions.",
    todaysCall: "Premium trout day — sunny, calm, no weather pressure. Hit the oyster bars at the mouth at sunrise with popping cork and live shrimp. Guides across the bay have been calling the trout bite genuinely strong this week with water temps in the low 80s, and LaGrange's oyster bars are exactly the kind of structure that's been producing. As the sun climbs, switch to gold spoon on the interior grass flats. This is the best trout chance of the week.",
  },
  {
    id: "fourmile",
    label: "Four Mile Creek",
    emoji: "🛶",
    overallScore: 7.5,
    conditions: "Good",
    species: [
      { name: "Redfish", confidence: 85, note: "Grass flat edges and creek bends — tailing reds in skinny water" },
      { name: "Speckled Trout", confidence: 75, note: "Deeper bends and channel edges, especially near the bay end" },
      { name: "Flounder", confidence: 65, note: "Sandy bottom at creek bends and the bay mouth, mud minnow on jig" },
      { name: "Largemouth Bass", confidence: 50, note: "Upper creek near freshwater transition, soft plastics near overhangs" },
      { name: "Black Drum", confidence: 45, note: "Deeper holes mid-creek, shrimp on bottom" },
    ],
    stops: [
      { order: 1, name: "Upper Creek (Near Shipyard)", tide: "Any — fish on the way out", steps: ["Overhanging banks and fallen structure hold bass and juvenile reds", "Small paddle-tail or soft plastic near shaded banks", "Quiet water — pole or drift, no running the motor"] },
      { order: 2, name: "Mid-Creek Grass Flats", tide: "Incoming tide — bait pushes up from bay", steps: ["Weedless gold spoon along grass edges", "Popping cork with live shrimp in 2-4 ft", "Watch for wakes and surface disturbances — reds visible here"] },
      { order: 3, name: "Creek Mouth (Bay Entry)", tide: "Incoming or outgoing — best on moving water", steps: ["Prime flounder zone where creek meets bay", "Mud minnow on 1/4 oz jig dragged on bottom", "Free-line live shrimp on the current seam for trout and reds"] },
    ],
    aiNote: "Four Mile Creek is the tidal creek that runs between Shipyard Marina and Choctawhatchee Bay. Tidal flow pushes baitfish up the creek on incoming tides, concentrating reds and trout in the bends and grass edges. The upper section near Shipyard transitions toward brackish and holds bass alongside small reds. The creek mouth where it joins the bay is a prime flounder zone. Because it is short and protected, it is your safest fishery when weather threatens — you are minutes from the dock anywhere on it.",
    todaysCall: "Glass-smooth creek conditions — pole or drift the bends quietly for tailing reds and trout. Hit the mid-creek grass flats and the creek mouth at first light on the incoming tide. Bay-wide reports have the trout bite running hot with water in the low 80s, so don't overlook this creek just because it's small — that pattern of fish stacking tight to structure applies here too. No weather pressure means you can work the creek fully or continue out to the bay.",
  },
  {
    id: "hogtown",
    label: "Hogtown Bayou",
    emoji: "🌾",
    overallScore: 7.5,
    conditions: "Good",
    species: [
      { name: "Speckled Trout", confidence: 88, note: "Grass flats and grassy patches — peak summer bite, schools active early morning" },
      { name: "Redfish", confidence: 82, note: "Oyster bars and marsh grass edges, especially incoming tide" },
      { name: "Spanish Mackerel", confidence: 55, note: "Open bay side of mouth on moving tide, Clark spoon trolled slow" },
      { name: "Flounder", confidence: 50, note: "Sandy bottom transition zones, mud minnow on jig" },
      { name: "Black Drum", confidence: 45, note: "Deeper holes inside bayou, shrimp or crab on bottom" },
    ],
    stops: [
      { order: 1, name: "Bayou Mouth Grass Flats", tide: "Incoming tide · first light", steps: ["Topwater along grass bed edges — trout active pre-dawn", "Switch to chartreuse paddle-tail as sun rises", "Wade or drift quietly — less boat pressure here than bridge area"] },
      { order: 2, name: "Interior Grassy Patches", tide: "Mid-incoming", steps: ["Popping cork with live shrimp over grass in 2-4 ft", "Gold spoon slow-retrieved parallel to grass edges", "Watch for surface wakes — tailing reds visible in clear water"] },
      { order: 3, name: "Bay Side Drop-off", tide: "Outgoing", steps: ["Troll a Clark spoon for Spanish mackerel on falling tide", "Free-line live shrimp along the depth change", "Deeper channel holds flounder on outgoing current"] },
    ],
    aiNote: "Hogtown Bayou is the signature fishing spot of the Santa Rosa Beach guides and one of the most productive trout flats on Choctawhatchee Bay. It sees regular pressure but produces consistently. Summer mornings are peak — trout stack on the grass in 2-4 feet. Spanish mackerel show at the mouth on moving tides. Notably further from the 331 bridge than the other bayous — factor in run time when planning.",
    todaysCall: "Green light for Hogtown today — the long run is now safe. Smooth water and no storm threat make this a top pick for trout numbers, and the timing lines up: this is the Santa Rosa Beach spot where guides landed a 40+ inch, 26 lb bull redfish just this week, and the trout bite has been strong bay-wide. Fish the mouth at first light on the incoming tide with popping cork, then work interior grass flats. Plan run time so you are off by 10:30 AM before heat builds.",
  },
  {
    id: "rocky",
    label: "Rocky Bayou",
    emoji: "🪨",
    overallScore: 7.5,
    conditions: "Good",
    species: [
      { name: "Redfish", confidence: 85, note: "Tidal marshes and glass-calm coves — top red drum bayou near Niceville" },
      { name: "Speckled Trout", confidence: 72, note: "Grass flats and tidal creek edges, mornings on incoming tide" },
      { name: "Flounder", confidence: 68, note: "Sandy bottom and creek mouths — freshwater influence from Rocky Creek concentrates them" },
      { name: "Mangrove Snapper", confidence: 45, note: "Near dock pilings and structure inside bayou" },
      { name: "Mullet", confidence: 80, note: "Abundant baitfish — cast net here to load up before fishing" },
    ],
    stops: [
      { order: 1, name: "Rocky Bayou State Park Coves", tide: "Incoming tide", steps: ["Glass-calm protected coves — ideal sight fishing for reds", "Gold spoon or paddle-tail along marsh grass edges", "Low fishing pressure — fewer boats than other bayous"] },
      { order: 2, name: "Tidal Creek Mouths", tide: "Mid-incoming", steps: ["Freshwater influence from Rocky Creek concentrates baitfish and flounder", "Mud minnow on 1/4 oz jig dragged on bottom", "Popping cork with shrimp for trout on the edges"] },
      { order: 3, name: "Dock and Structure Zone", tide: "Any", steps: ["Mangrove snapper hold near dock pilings — small jig or live shrimp", "Free-line live mullet near structure for big reds", "Cast net for mullet first — abundant here and great live bait"] },
    ],
    aiNote: "Rocky Bayou sits inside Fred Gannon Rocky Bayou State Park near Niceville — protected, scenic, and significantly less pressured than the bayous closer to the 331 bridge. The freshwater influence from Rocky Creek makes flounder fishing here excellent, and the glass-calm coves in the state park are ideal for sight fishing reds on a flat tide. Mangrove snapper hold near dock pilings. The furthest location from Shipyard Marina in this report — factor in run time.",
    todaysCall: "Green light for Rocky today — the long run is safe. Glass-smooth state park coves ideal for sight-fishing reds. Target flounder at the tidal creek mouths. Water temps are running low 80s bay-wide and the bite has been consistent — Rocky's low pressure means these fish are less picky than what you'd find near the bridge. Launch by 5:30 AM to maximize water time and beat the midday heat. Solid full-morning trip today.",
  },
];

// ── TRIP LOG ──────────────────────────────────────────────────────────────────
const EMPTY_TRIP = { date: "", hours: "", start: "", tide: "", wind: "", species: "", kept: "", lures: "", notes: "" };

// ── COMPONENTS ────────────────────────────────────────────────────────────────
function ScoreRing({ score }) {
  const r = 34, circ = 2 * Math.PI * r, fill = (score / 10) * circ;
  const color = score >= 7.5 ? "#4ade80" : score >= 6 ? "#facc15" : "#f87171";
  return (
    <svg width="82" height="82" viewBox="0 0 82 82">
      <circle cx="41" cy="41" r={r} fill="none" stroke="#1a3828" strokeWidth="7" />
      <circle cx="41" cy="41" r={r} fill="none" stroke={color} strokeWidth="7"
        strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 41 41)" style={{ transition: "all 0.8s ease" }} />
      <text x="41" y="38" textAnchor="middle" fill={color} fontSize="18" fontWeight="700" fontFamily="'Space Grotesk',sans-serif">{score}</text>
      <text x="41" y="51" textAnchor="middle" fill="#7ab898" fontSize="10" fontFamily="'Space Grotesk',sans-serif">/10</text>
    </svg>
  );
}

// Compass-style wind indicator — faster to read at a glance than "SW 5-10 mph"
// text, especially with sun glare on a phone screen.
const DIR_DEGREES = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
function WindCompass({ dir, size = 64 }) {
  const deg = DIR_DEGREES[dir] ?? 0;
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={c} cy={c} r={c - 3} fill="none" stroke="#1a3828" strokeWidth="2" />
      {["N", "E", "S", "W"].map((d) => {
        const a = (DIR_DEGREES[d] - 90) * (Math.PI / 180);
        const x = c + (c - 12) * Math.cos(a), y = c + (c - 12) * Math.sin(a);
        return <text key={d} x={x} y={y + 4} textAnchor="middle" fontSize="10" fill="#4a6b58" fontFamily="'Space Grotesk',sans-serif">{d}</text>;
      })}
      {/* Arrow points in the direction wind is blowing TOWARD (i.e. where it pushes bait) */}
      <g transform={`rotate(${deg} ${c} ${c})`}>
        <line x1={c} y1={c + 14} x2={c} y2={c - 14} stroke="#4ade80" strokeWidth="3" strokeLinecap="round" />
        <polygon points={`${c - 6},${c - 8} ${c + 6},${c - 8} ${c},${c - 18}`} fill="#4ade80" />
      </g>
    </svg>
  );
}

// Simple tide curve — a smooth rise/fall between today's high and low, with a
// marker for the current time. Easier to read at a glance on a moving boat
// than parsing "High ~6:44 AM · Low ~7:03 PM" as text.
//
// Layout note: all label Y-positions below are deliberately spelled out as
// explicit numbers (not relative offsets) and checked against vbH, because a
// prior version computed the Low time's Y position as 212 while the viewBox
// only went to 200 — it was silently clipped off the bottom edge. Every text
// element's Y here is comfortably inside 0..vbH.
//
// Parses "before 4 PM" / "after 1 PM" style strings into a shaded time range
// so storm risk shows up directly on the same timeline as the tide, instead
// of needing to cross-reference the text banner separately.
function parseStormRange(stormWindow) {
  if (!stormWindow) return null;
  const m = stormWindow.match(/(before|after)\s+(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  const mins = timeToMinutes(`${m[2]}:00 ${m[3]}`);
  if (mins == null) return null;
  return m[1].toLowerCase() === "before" ? [0, mins] : [mins, 1440];
}

function TideCurve({ events, sunrise, sunset, stormWindow, stormChance }) {
  if (!events || events.length < 2) return null;
  const pts = events.map(e => ({ ...e, mins: timeToMinutes(e.time) })).filter(e => e.mins != null).sort((a, b) => a.mins - b.mins);
  if (pts.length < 2) return null;
  const nowMins = (() => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); })();

  const vbW = 400, vbH = 230;
  const padX = 30;
  const curveTopY = 54;     // where the High point sits on the curve
  const curveBottomY = 138; // where the Low point sits on the curve
  const axisY = 200;        // horizontal hour-axis line
  const tickLabelY = 222;   // hour numbers below the axis line

  const w = vbW - padX * 2;
  const yFor = (type) => type === "H" ? curveTopY : curveBottomY;
  const xFor = (mins) => padX + (mins / 1440) * w;
  const first = pts[0], last = pts[pts.length - 1];

  // Build the curve with cosine (ease-in/ease-out) interpolation between each
  // known point, sampled densely, instead of hand-placed bezier control
  // points. A prior version used "Q x-25,y x,y" control points, which looked
  // fine for interior points but produced a visibly wrong hook on the left
  // edge — the very first segment ran from a far-away virtual start point
  // through a control point placed close to the destination, creating an
  // unnaturally sharp bend instead of a smooth tidal rise. Cosine
  // interpolation between many sample points has no control points to place
  // badly, so this class of bug can't recur here.
  const anchors = [
    { mins: 0, type: first.type === "H" ? "L" : "H" }, // virtual start: opposite of the first real event
    ...pts,
    { mins: 1440, type: last.type === "H" ? "L" : "H" }, // virtual end: opposite of the last real event
  ];
  const SAMPLES_PER_SEGMENT = 24;
  const pathPoints = [];
  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i], b = anchors[i + 1];
    const yA = yFor(a.type), yB = yFor(b.type);
    for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
      if (i > 0 && s === 0) continue; // avoid duplicating the shared point between segments
      const f = s / SAMPLES_PER_SEGMENT;
      const eased = (1 - Math.cos(f * Math.PI)) / 2; // smooth ease, no overshoot
      const mins = a.mins + (b.mins - a.mins) * f;
      const y = yA + (yB - yA) * eased;
      pathPoints.push([xFor(mins), y]);
    }
  }
  const path = pathPoints.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");

  const hourTicks = [0, 360, 720, 1080, 1440].map((m, i) => ({ mins: m, label: ["12A", "6A", "12P", "6P", "12A"][i] }));
  const stormRange = (stormChance >= 20) ? parseStormRange(stormWindow) : null;
  const sunriseMins = sunrise ? timeToMinutes(sunrise) : null;
  const sunsetMins = sunset ? timeToMinutes(sunset) : null;

  return (
    <div style={{ width: "100%", aspectRatio: `${vbW} / ${vbH}`, maxWidth: 460, margin: "0 auto" }}>
      <svg width="100%" height="100%" viewBox={`0 0 ${vbW} ${vbH}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>

        {/* Storm-risk shading, drawn first so it sits behind the curve and labels */}
        {stormRange && (
          <rect x={xFor(stormRange[0])} y="4" width={xFor(stormRange[1]) - xFor(stormRange[0])} height={axisY - 4} fill="#f87171" opacity="0.12" />
        )}

        <path d={path} fill="none" stroke="#4ade80" strokeWidth="4" strokeLinecap="round" />

        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={xFor(p.mins)} cy={yFor(p.type)} r="7" fill="#4ade80" />
            {/* High labels sit above the curve point; Low labels sit below it — each pair (name + time) is grouped tightly together and fully inside the viewBox */}
            <text x={xFor(p.mins)} y={p.type === "H" ? curveTopY - 18 : curveBottomY + 30} textAnchor="middle" fontSize="19" fontWeight="700" fill="#d1f0e0" fontFamily="'Space Grotesk',sans-serif">{p.type === "H" ? "High" : "Low"}</text>
            <text x={xFor(p.mins)} y={p.type === "H" ? curveTopY - 2 : curveBottomY + 48} textAnchor="middle" fontSize="17" fill="#86c7a0" fontFamily="'Space Grotesk',sans-serif">{p.time}</text>
          </g>
        ))}

        {/* Now marker */}
        <line x1={xFor(nowMins)} y1="14" x2={xFor(nowMins)} y2={axisY} stroke="#facc15" strokeWidth="2" strokeDasharray="4,4" />
        <text x={xFor(nowMins)} y="12" textAnchor="middle" fontSize="13" fontWeight="700" fill="#facc15" fontFamily="'Space Grotesk',sans-serif">now</text>

        {/* X-axis: hour markers so the curve has actual time context, not just two labeled dots */}
        <line x1={padX} y1={axisY} x2={vbW - padX} y2={axisY} stroke="#2a4a38" strokeWidth="1.5" />
        {hourTicks.map((t, i) => (
          <g key={i}>
            <line x1={xFor(t.mins)} y1={axisY - 4} x2={xFor(t.mins)} y2={axisY + 4} stroke="#2a4a38" strokeWidth="1.5" />
            <text x={xFor(t.mins)} y={tickLabelY} textAnchor="middle" fontSize="13" fill="#7ab898" fontFamily="'Space Grotesk',sans-serif">{t.label}</text>
          </g>
        ))}

        {/* Sunrise/sunset markers on the axis, so you can see at a glance whether
            the best tide window overlaps daylight without cross-referencing separately */}
        {sunriseMins != null && (
          <g>
            <line x1={xFor(sunriseMins)} y1={axisY - 4} x2={xFor(sunriseMins)} y2={axisY + 4} stroke="#facc15" strokeWidth="2" />
            <text x={xFor(sunriseMins)} y={axisY - 16} textAnchor="middle" fontSize="26">🌅</text>
          </g>
        )}
        {sunsetMins != null && (
          <g>
            <line x1={xFor(sunsetMins)} y1={axisY - 4} x2={xFor(sunsetMins)} y2={axisY + 4} stroke="#facc15" strokeWidth="2" />
            <text x={xFor(sunsetMins)} y={axisY - 16} textAnchor="middle" fontSize="26">🌇</text>
          </g>
        )}
        {sunsetMins != null && (
          <g>
            <line x1={xFor(sunsetMins)} y1={axisY - 4} x2={xFor(sunsetMins)} y2={axisY + 4} stroke="#facc15" strokeWidth="2" />
            <text x={xFor(sunsetMins)} y={axisY - 10} textAnchor="middle" fontSize="14">🌇</text>
          </g>
        )}
      </svg>
    </div>
  );
}

function ConfBar({ pct }) {
  const c = pct >= 75 ? "#4ade80" : pct >= 50 ? "#facc15" : "#f87171";
  return (
    <div style={{ flex: 1, height: 5, background: "#1a3828", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 3, transition: "width 0.8s ease" }} />
    </div>
  );
}

function Tag({ children, color = "#1e3a2f", text = "#4ade80" }) {
  return (
    <span style={{ background: color, color: text, borderRadius: 4, padding: "3px 10px", fontSize: 16, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.03em", border: `1px solid ${text}22` }}>{children}</span>
  );
}

function Collapsible({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10, border: "1px solid #1a3828", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "#0f2a1c", border: "none", padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}>
        <span style={{ fontSize: 16, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{title}</span>
        <span style={{ color: "#7ab898", fontSize: 16, transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
      </button>
      {open && <div style={{ padding: "0 16px 14px", background: "#0a1f14" }}>{children}</div>}
    </div>
  );
}



// ── FORECAST COMPONENT ─────────────────────────────────────────────────────────
function ForecastStrip() {
  return (
    <Collapsible title="📅 3-Day Look Ahead" defaultOpen={true}>
      <div style={{ marginTop: 12 }}>
        {FORECAST.map((day, i) => {
          const sc = day.fishingScore;
          const color = ratingColor(sc);
          const rating = ratingLabel(sc);
          const stormColor = day.storms >= 60 ? "#f87171" : day.storms >= 30 ? "#facc15" : "#4ade80";
          return (
            <div key={i} style={{ marginBottom: 10, padding: "14px 14px", background: "#0f2a1c", borderRadius: 10, border: `1px solid ${color}33` }}>
              {/* Top row: day info + big score ring */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <ScoreRing score={sc} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, color: "#7ab898", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{day.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#d1f0e0", marginBottom: 2 }}>{day.day}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: color }}>{rating} conditions</div>
                </div>
                <div style={{ fontSize: 37 }}>{day.emoji}</div>
              </div>

              {/* Headline */}
              <div style={{ fontSize: 16, color: "#d1f0e0", marginBottom: 8 }}>{day.headline}</div>

              {/* Metrics row */}
              <div style={{ display: "flex", gap: 14, fontSize: 15, color: "#7ab898", marginBottom: 10, flexWrap: "wrap" }}>
                <span>🌡️ {day.high}°/{day.low}°F</span>
                <span>💨 {day.wind}</span>
                <span style={{ color: stormColor }}>⛈️ {day.storms}%</span>
              </div>

              {/* AI call */}
              <div style={{ fontSize: 16, color: "#86c7a0", lineHeight: 1.6, paddingTop: 10, borderTop: "1px solid #1a3828" }}>
                💡 {day.aiCall}
              </div>
            </div>
          );
        })}
      </div>
    </Collapsible>
  );
}

// ── BAIT PICKER COMPONENT ─────────────────────────────────────────────────────
function BaitPicker() {
  const [selected, setSelected] = useState(["live_shrimp"]);

  function toggle(id) {
    if (id === "no_bait") {
      setSelected(["no_bait"]);
      return;
    }
    setSelected(prev => {
      const without_none = prev.filter(x => x !== "no_bait");
      return without_none.includes(id)
        ? without_none.filter(x => x !== id)
        : [...without_none, id];
    });
  }

  const recs = selected.flatMap(id => BAIT_RECS[id]?.rigs || []);
  const tips = [...new Set(selected.map(id => BAIT_RECS[id]?.tip).filter(Boolean))];

  return (
    <Collapsible title="🪝 What Bait Do You Have?" defaultOpen={false}>
      <div style={{ marginTop: 12 }}>

        {/* Bait toggle grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
          {ALL_BAITS.map(b => {
            const on = selected.includes(b.id);
            return (
              <button key={b.id} onClick={() => toggle(b.id)} style={{
                padding: "10px 10px", borderRadius: 8, border: on ? "1px solid #4ade80" : "1px solid #1a3828",
                background: on ? "#0d2918" : "#0f2a1c", cursor: "pointer",
                fontFamily: "'Space Grotesk',sans-serif", textAlign: "left",
                display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
              }}>
                <span style={{ fontSize: 22 }}>{b.emoji}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: on ? "#4ade80" : "#7ab898", lineHeight: 1.3 }}>{b.label}</span>
                {on && <span style={{ marginLeft: "auto", color: "#4ade80", fontSize: 16 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Tips */}
        {tips.map((tip, i) => (
          <div key={i} style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 16, color: "#d1f0e0", lineHeight: 1.65 }}>
            💡 {tip}
          </div>
        ))}

        {/* Rigs */}
        {recs.length > 0 ? recs.map((r, i) => (
          <div key={i} style={{ marginBottom: 8, padding: "10px 13px", background: "#0f2a1c", borderRadius: 8, border: "1px solid #1a3828" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#86c7a0" }}>{r.name}</div>
            <div style={{ fontSize: 16, color: "#7ab898", marginTop: 3, lineHeight: 1.6 }}>{r.detail}</div>
          </div>
        )) : (
          <div style={{ textAlign: "center", color: "#7ab898", fontSize: 16, padding: "16px 0" }}>Select what you have above to see rigging tips.</div>
        )}
      </div>
    </Collapsible>
  );
}

function LocationReport({ loc }) {
  const C = CONDITIONS;
  const lureKey = C.sky === "Cloudy" ? "Cloudy morning" : C.sky === "Bright sun" ? "Bright sun" : C.waterClarity === "Dirty" ? "Dirty water" : "Slightly stained";
  const lures = C.lureMatrix[lureKey] || [];
  const todaysScore = todaysAdjustedScore(loc.overallScore);
  const todaysLabel = ratingLabel(todaysScore);
  const cc = ratingColor(todaysScore);
  const card = { background: "#0f2a1c", borderRadius: 10, padding: "13px 15px", border: "1px solid #1a3828", marginBottom: 10 };
  const lbl = { fontSize: 16, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 };
  const divider = <div style={{ height: 1, background: "#1a3828", margin: "11px 0" }} />;

  return (
    <div>
      {/* Score card */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 18, marginBottom: 10, flexWrap: "wrap" }}>
        <ScoreRing score={todaysScore} />
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: cc }}>{todaysLabel} today{todaysLabel !== ratingLabel(loc.overallScore) ? ` (usually ${ratingLabel(loc.overallScore)})` : ""}</div>
          <div style={{ fontSize: 16, color: "#86c7a0", marginTop: 2 }}>{C.weather}</div>
          <div style={{ fontSize: 16, color: "#7ab898", marginTop: 2 }}>🌊 {C.tide}</div>
          <div style={{ fontSize: 16, color: "#7ab898", marginTop: 1 }}>💨 {C.wind.description} · 🌙 {C.moonPhase}</div>
        </div>
        <WindCompass dir={C.wind.dir} />
      </div>

      {/* Tide curve — faster to read at a glance than the text description above */}
      {C.tideEvents && (
        <div style={{ ...card, width: "100%", boxSizing: "border-box" }}>
          <TideCurve events={C.tideEvents} sunrise={C.sunrise} sunset={C.sunset} stormWindow={C.stormWindow} stormChance={C.stormChance} />
        </div>
      )}

      {/* Species */}
      <Collapsible title="🐟 Species Confidence">
        <div style={{ marginTop: 10 }}>
          {loc.species.map(s => (
            <div key={s.name} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#d1f0e0", minWidth: 130 }}>{s.name}</span>
                <ConfBar pct={s.confidence} />
                <span style={{ fontSize: 16, fontWeight: 700, color: s.confidence >= 75 ? "#4ade80" : s.confidence >= 50 ? "#facc15" : "#f87171", minWidth: 36, textAlign: "right" }}>{s.confidence}%</span>
              </div>
              <div style={{ fontSize: 16, color: "#7ab898" }}>{s.note}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Strategy */}
      <Collapsible title="🗺️ Fishing Strategy">
        <div style={{ marginTop: 10 }}>
          {loc.stops.map((stop, i) => {
            const stopName = typeof stop.name === "function" ? stop.name(C.wind) : stop.name;
            return (
            <div key={stop.order}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#4ade80", color: "#0a1f14", fontSize: 16, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{stop.order}</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f0faf4" }}>{stopName}</div>
                  <div style={{ fontSize: 16, color: "#7ab898" }}>{stop.tide}</div>
                </div>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 34px", fontSize: 16, color: "#86c7a0", lineHeight: 2.0 }}>
                {stop.steps.map((s, idx) => <li key={idx}>{typeof s === "function" ? s(C.wind) : s}</li>)}
              </ul>
              {i < loc.stops.length - 1 && divider}
            </div>
            );
          })}
        </div>
      </Collapsible>

      {/* Lures */}
      <Collapsible title={`🪝 Lures — ${lureKey}`}>
        <div style={{ marginTop: 10 }}>
          {lures.map(l => (
            <div key={l.lure} style={{ marginBottom: 9, padding: "10px 12px", background: "#0f2a1c", borderRadius: 8, border: "1px solid #1a3828" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#86c7a0" }}>{l.lure}</div>
              <div style={{ fontSize: 16, color: "#7ab898", marginTop: 2 }}>{l.detail}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Bait picker */}
      <BaitPicker />

            {/* AI note — split into static "About this spot" + dynamic "Today's call" */}
      <div style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 15, color: "#4ade80", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>🤖 AI Field Notes</div>

        {/* Static: about this spot */}
        <div style={{ fontSize: 15, color: "#7ab898", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>About this spot</div>
        <p style={{ margin: "0 0 12px 0", fontSize: 16, lineHeight: 1.75, color: "#d1f0e0" }}>{loc.aiNote}</p>

        {/* Dynamic: today's call */}
        {loc.todaysCall && <>
          <div style={{ height: 1, background: "#1a3828", margin: "10px 0 12px 0" }} />
          <div style={{ fontSize: 15, color: "#4ade80", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>📍 Today's Call</div>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.75, color: "#d1f0e0" }}>{loc.todaysCall}</p>
        </>}
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 15, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 12px", color: "#d1f0e0", fontSize: 16, fontFamily: "'Space Grotesk',sans-serif", outline: "none", boxSizing: "border-box" }} />
    </div>
  );
}

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const [mainTab, setMainTab] = useState("report");
  const [locTab, setLocTab] = useState("bridge");
  const [trips, setTrips] = useState([]);
  const [form, setForm] = useState(EMPTY_TRIP);
  const [saved, setSaved] = useState(false);
  const [shared, setShared] = useState(false);
  const swipeStartX = useRef(null);

  // Swipe left/right between location tabs — natural on a phone instead of
  // only being able to tap the small tab strip. A 50px threshold avoids
  // triggering on ordinary vertical scrolling.
  function handleSwipeStart(e) {
    swipeStartX.current = e.touches[0].clientX;
  }
  function handleSwipeEnd(e) {
    if (swipeStartX.current == null) return;
    const deltaX = e.changedTouches[0].clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(deltaX) < 50) return; // too small — probably just a scroll/tap
    const idx = LOCATIONS.findIndex(l => l.id === locTab);
    if (idx === -1) return;
    const nextIdx = deltaX < 0
      ? (idx + 1) % LOCATIONS.length          // swipe left → next location
      : (idx - 1 + LOCATIONS.length) % LOCATIONS.length; // swipe right → previous
    selectLocTab(LOCATIONS[nextIdx].id);
  }
  const C = CONDITIONS;
  const bestBet = getBestBet();
  const bestWindow = getBestWindow();
  const conditionsDiff = getConditionsDiff();
  const bitReportAge = C.localBiteUpdated ? daysBetween(C.localBiteUpdated, C.date) : null;

  useState(() => {
    (async () => { try { const r = await window.storage.get("trips"); if (r?.value) setTrips(JSON.parse(r.value)); } catch {} })();
    // Remember whichever location tab you last viewed, so the app opens back
    // to your usual spot instead of always defaulting to the Bridge.
    (async () => { try { const r = await window.storage.get("lastLocTab"); if (r?.value) setLocTab(r.value); } catch {} })();
  });

  function selectLocTab(id) {
    setLocTab(id);
    window.storage.set("lastLocTab", id).catch(() => {});
  }

  async function shareReport() {
    const text = `331 Bridge Area Fishing Report — ${C.date}\n${C.weather}\n${C.tide}\nBest bet today: ${bestBet.loc.label} (${bestBet.score}/10)\nBest window: ${bestWindow.startText}–${bestWindow.endText} (${bestWindow.reason})`;
    if (navigator.share) {
      try { await navigator.share({ title: "Fishing Report", text }); return; } catch { /* user cancelled or unsupported, fall through */ }
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared(true); setTimeout(() => setShared(false), 2000);
    } catch { /* clipboard unavailable, nothing more we can do silently */ }
  }

  function goToLogTab() {
    setMainTab("log");
    // Pre-fill the location with whichever spot you were just viewing, so you
    // don't have to pick it again from scratch after fishing there.
    const active = LOCATIONS.find(l => l.id === locTab);
    if (active && !form.start) setForm(f => ({ ...f, start: active.label }));
  }

  async function saveTrip() {
    const updated = [{ ...form, id: Date.now() }, ...trips];
    setTrips(updated);
    try { await window.storage.set("trips", JSON.stringify(updated)); } catch {}
    setForm(EMPTY_TRIP); setSaved(true); setTimeout(() => setSaved(false), 2500);
  }

  async function deleteTrip(id) {
    const updated = trips.filter(t => t.id !== id);
    setTrips(updated);
    try { await window.storage.set("trips", JSON.stringify(updated)); } catch {}
  }

  function getPatterns() {
    if (trips.length < 3) return null;
    const withCatch = trips.filter(t => t.species && parseInt(t.kept) > 0);
    if (withCatch.length < 2) return null;
    const tG = {}, wG = {};
    withCatch.forEach(t => {
      if (t.tide) tG[t.tide] = (tG[t.tide] || 0) + parseInt(t.kept || 0);
      if (t.wind) wG[t.wind] = (wG[t.wind] || 0) + parseInt(t.kept || 0);
    });
    return {
      bestTide: Object.entries(tG).sort((a, b) => b[1] - a[1])[0],
      bestWind: Object.entries(wG).sort((a, b) => b[1] - a[1])[0],
      totalTrips: trips.length,
      totalKept: trips.reduce((s, t) => s + parseInt(t.kept || 0), 0),
    };
  }

  const patterns = getPatterns();
  const activeLoc = LOCATIONS.find(l => l.id === locTab);
  const lbl = { fontSize: 16, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a1f14", fontFamily: "'Space Grotesk',sans-serif", color: "#d1f0e0", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, letterSpacing: "0.16em", color: "#4ade80", textTransform: "uppercase", marginBottom: 3 }}>🎣 Daily Fishing Intel</div>
            <h1 style={{ margin: 0, fontSize: 25, fontWeight: 700, color: "#f0faf4", lineHeight: 1.2 }}>331 Bridge Area</h1>
            <div style={{ fontSize: 16, color: "#86c7a0", marginTop: 2 }}>Fishing Report · Freeport, FL · {C.date}</div>
          </div>
          <button onClick={shareReport} style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 8, padding: "8px 12px", color: "#7ab898", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", whiteSpace: "nowrap", flexShrink: 0 }}>
            {shared ? "✓ Copied" : "📤 Share"}
          </button>
        </div>

        {/* Best Bet + Best Window — the two fastest things to check before heading out */}
        <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px", background: "#0d2918", border: "1px solid #4ade8066", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>🏆 Best Bet Today</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#4ade80" }}>{bestBet.loc.emoji} {bestBet.loc.label}</div>
            <div style={{ fontSize: 14, color: "#86c7a0" }}>{bestBet.score}/10 · {ratingLabel(bestBet.score)}</div>
          </div>
          <div style={{ flex: "1 1 140px", background: "#0d2918", border: "1px solid #4ade8066", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>⏰ Best Window</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#facc15" }}>{bestWindow.startText} – {bestWindow.endText}</div>
            <div style={{ fontSize: 14, color: "#86c7a0" }}>{bestWindow.reason}</div>
          </div>
        </div>

        {/* What changed since yesterday — a quick delta instead of re-reading the full report */}
        {conditionsDiff && (
          <div style={{ fontSize: 14, color: "#7ab898", padding: "2px 4px 10px", lineHeight: 1.6 }}>
            🔄 {conditionsDiff}
          </div>
        )}

        {/* NWS vs Open-Meteo — two independent forecast sources side by side.
            Worth showing both rather than picking one: NWS is the US
            government's own forecast; Open-Meteo blends multiple global
            models. When they roughly agree, that's reassuring. When they
            don't, that disagreement itself is useful information (e.g. real
            uncertainty about whether storms will actually develop). */}
        {C.openMeteo?.[0] && (
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <div style={{ flex: 1, background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>NWS (official)</div>
              <div style={{ fontSize: 15, color: "#d1f0e0" }}>{FORECAST[0].high}°F · {FORECAST[0].storms}% storms</div>
              <div style={{ fontSize: 14, color: "#7ab898" }}>{FORECAST[0].wind}</div>
            </div>
            <div style={{ flex: 1, background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Open-Meteo</div>
              <div style={{ fontSize: 15, color: "#d1f0e0" }}>{C.openMeteo[0].high}°F · {C.openMeteo[0].stormChance}% storms</div>
              <div style={{ fontSize: 14, color: "#7ab898" }}>{C.openMeteo[0].windDir} {C.openMeteo[0].windSpeed} mph</div>
            </div>
          </div>
        )}

        {/* Storm warning */}
        <div style={{ background: "#0d2918", border: "1px solid #4ade8066", borderRadius: 8, padding: "10px 14px", fontSize: 16, color: "#86efac", margin: "12px 0", lineHeight: 1.5 }}>
          ⛈️ Tuesday: 40% chance of showers/thunderstorms, mainly before 4 PM — plan a morning trip and watch the radar. Otherwise mostly sunny, high 91°F, heat index up to 105°F. SW wind 5–10 mph.
        </div>

        {/* Local bite report — grounded in real recent guide/charter reports */}
        <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 4 }}>
          <div style={{ fontSize: 16, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>🎣 What's Being Caught — Local Reports</div>
          <p style={{ margin: "0 0 6px 0", fontSize: 16, color: "#d1f0e0", lineHeight: 1.7 }}>{C.localBiteReport}</p>
          <div style={{ fontSize: 15, color: "#7ab898", fontStyle: "italic" }}>{C.localBiteSource}</div>
          {bitReportAge != null && (
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6, color: bitReportAge > 14 ? "#f87171" : bitReportAge > 7 ? "#facc15" : "#7ab898" }}>
              {bitReportAge === 0 ? "Refreshed today" : `Last refreshed ${bitReportAge} day${bitReportAge === 1 ? "" : "s"} ago`}
              {bitReportAge > 7 ? " — consider asking Claude to refresh this" : ""}
            </div>
          )}
        </div>

        {/* 3-day look ahead — always visible */}
        <ForecastStrip />

        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, marginTop: 14 }}>
          {[["report", "📋 Report"], ["log", "📓 Trip Log"]].map(([key, label]) => (
            <button key={key} onClick={() => key === "log" ? goToLogTab() : setMainTab(key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16,
              background: mainTab === key ? "#4ade80" : "#0f2a1c",
              color: mainTab === key ? "#0a1f14" : "#7ab898", transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>

        {mainTab === "report" && <>

          {/* Location tabs — horizontal scroll */}
          <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }}>
            {LOCATIONS.map(loc => {
              const active = locTab === loc.id;
              const sc = todaysAdjustedScore(loc.overallScore);
              const dot = ratingColor(sc);
              return (
                <button key={loc.id} onClick={() => selectLocTab(loc.id)} style={{
                  padding: "10px 10px", borderRadius: 8, border: active ? "1px solid #4ade8066" : "1px solid #1a3828",
                  cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 16,
                  background: active ? "#0d2918" : "#0f2a1c", color: active ? "#f0faf4" : "#7ab898",
                  textAlign: "center", lineHeight: 1.4, transition: "all 0.15s",
                  flexShrink: 0, minWidth: 72,
                }}>
                  <div style={{ fontSize: 22, marginBottom: 3 }}>{loc.emoji}</div>
                  <div style={{ fontSize: 15, whiteSpace: "nowrap" }}>{loc.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: dot, marginTop: 3 }}>{sc}</div>
                </button>
              );
            })}
          </div>

          {/* Active location name + report — swipeable on touch devices */}
          <div onTouchStart={handleSwipeStart} onTouchEnd={handleSwipeEnd}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#f0faf4", marginBottom: 12 }}>
              {activeLoc.emoji} {activeLoc.label} <span style={{ fontSize: 13, color: "#4a6b58", fontWeight: 400 }}>· swipe for next spot</span>
            </div>

            {/* Location report */}
            {activeLoc && <LocationReport loc={activeLoc} />}
          </div>

          {/* Shared sections */}
          <div style={{ height: 1, background: "#1a3828", margin: "14px 0" }} />

          {/* Live radar — makes "watch the radar" actually actionable instead of requiring a second app */}
          <Collapsible title="🌧️ Live Radar" defaultOpen={CONDITIONS.stormChance >= 30}>
            <div style={{ marginTop: 10, borderRadius: 8, overflow: "hidden", border: "1px solid #1a3828" }}>
              <iframe
                title="Live radar — Freeport, FL"
                src="https://embed.windy.com/embed2.html?lat=30.48&lon=-86.14&detailLat=30.48&detailLon=-86.14&width=650&height=400&zoom=8&level=surface&overlay=radar&menu=&message=true&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
                width="100%" height="320" frameBorder="0" style={{ display: "block" }}
              />
            </div>
            <div style={{ fontSize: 13, color: "#7ab898", marginTop: 6, textAlign: "center" }}>Live radar via Windy.com</div>
          </Collapsible>

          {/* Wind guidance */}
          <div style={{ border: "1px solid #1a3828", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ background: "#0f2a1c", padding: "11px 16px" }}>
              <span style={{ fontSize: 16, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>💨 Wind Guidance — All Locations</span>
            </div>
            <div style={{ padding: "10px 16px 14px", background: "#0a1f14" }}>
              {C.windGuidance.map(w => {
                const active = C.wind.dir === w.dir;
                return (
                  <div key={w.dir} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 9, padding: "9px 12px", borderRadius: 8, background: active ? "#0d2918" : "transparent", border: active ? "1px solid #4ade8044" : "1px solid transparent" }}>
                    <div style={{ fontSize: 20, minWidth: 22, textAlign: "center" }}>{w.icon}</div>
                    <div><span style={{ fontSize: 16, fontWeight: 700, color: active ? "#4ade80" : "#86c7a0" }}>{w.dir} wind{active ? " ← today" : ""} · </span><span style={{ fontSize: 16, color: "#d1f0e0" }}>{w.advice}</span></div>
                  </div>
                );
              })}
              <div style={{ background: "#2a1a00", border: "1px solid #facc1566", borderRadius: 8, padding: "9px 12px", fontSize: 16, color: "#fde68a", marginTop: 4 }}>⚠️ {C.windWarning}</div>
            </div>
          </div>

          {/* Launch */}
          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
            <div style={lbl}>🚤 Launch & Bait</div>
            <div style={{ fontSize: 16, color: "#d1f0e0", lineHeight: 1.7 }}>{C.launch}</div>
          </div>

          {/* Regs */}
          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
            <div style={lbl}>📋 Regulations</div>
            {C.regulations.map(r => (
              <div key={r.species} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid #1a3828" }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: "#86c7a0" }}>{r.species}</span>
                <span style={{ fontSize: 16, color: "#d1f0e0", textAlign: "right", maxWidth: "60%" }}>{r.rules}</span>
              </div>
            ))}
          </div>
        </>}

        {/* ── TRIP LOG ── */}
        {mainTab === "log" && <>
          {patterns && (
            <div style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 15, color: "#4ade80", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>📈 Your Patterns ({patterns.totalTrips} trips · {patterns.totalKept} kept)</div>
              {patterns.bestTide && <div style={{ fontSize: 16, color: "#d1f0e0", marginBottom: 4 }}>🌊 Best tide: <span style={{ color: "#4ade80", fontWeight: 600 }}>{patterns.bestTide[0]}</span> — {patterns.bestTide[1]} fish kept</div>}
              {patterns.bestWind && <div style={{ fontSize: 16, color: "#d1f0e0" }}>💨 Best wind: <span style={{ color: "#4ade80", fontWeight: 600 }}>{patterns.bestWind[0]}</span> — {patterns.bestWind[1]} fish kept</div>}
            </div>
          )}

          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 16, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>➕ Log a Trip</div>
            <Input label="Date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} placeholder="June 28, 2026" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Hours fished" value={form.hours} onChange={v => setForm(f => ({ ...f, hours: v }))} placeholder="4" />
              <div>
                <div style={{ fontSize: 15, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Location</div>
                <select value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 16, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <option value="">Select…</option>
                  {["331 Bridge", "Alaqua Bayou", "Basin Bayou", "LaGrange Bayou", "Grass Flats", "Multiple"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 15, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Tide</div>
                <select value={form.tide} onChange={e => setForm(f => ({ ...f, tide: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 16, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <option value="">Select…</option>
                  {["Incoming", "High slack", "Outgoing", "Low slack"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 15, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Wind</div>
                <select value={form.wind} onChange={e => setForm(f => ({ ...f, wind: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 16, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <option value="">Select…</option>
                  {["N under 10", "N over 15", "S under 10", "S over 15", "E under 10", "E over 15", "W under 10", "W over 15", "SW under 10", "SW over 15", "SE under 10", "SE over 15", "Calm"].map(w => <option key={w} value={w}>{w}</option>)}
                </select>
              </div>
            </div>
            <Input label="Species caught" value={form.species} onChange={v => setForm(f => ({ ...f, species: v }))} placeholder="Trout, reds, drum…" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Number kept" value={form.kept} onChange={v => setForm(f => ({ ...f, kept: v }))} placeholder="3" type="number" />
              <Input label="Best lure" value={form.lures} onChange={v => setForm(f => ({ ...f, lures: v }))} placeholder="Gold spoon, shrimp…" />
            </div>
            <Input label="Notes" value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="What worked, what didn't…" />
            <button onClick={saveTrip} disabled={!form.date} style={{ width: "100%", marginTop: 4, padding: "11px 0", borderRadius: 8, border: "none", background: form.date ? "#4ade80" : "#1a3828", color: form.date ? "#0a1f14" : "#7ab898", fontWeight: 700, fontSize: 16, cursor: form.date ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk',sans-serif" }}>
              {saved ? "✓ Saved!" : "Save Trip"}
            </button>
          </div>

          {trips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#7ab898", fontSize: 16 }}>No trips logged yet. Patterns appear after 3 entries.</div>
          ) : trips.map(t => (
            <div key={t.id} style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#d1f0e0" }}>{t.date}</div>
                  <div style={{ fontSize: 16, color: "#7ab898", marginTop: 2 }}>{t.hours && `${t.hours}h`}{t.start && ` · ${t.start}`}{t.tide && ` · ${t.tide}`}{t.wind && ` · ${t.wind}`}</div>
                </div>
                <button onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#7ab898", cursor: "pointer", fontSize: 20, padding: "0 0 0 10px" }}>✕</button>
              </div>
              {t.species && <div style={{ fontSize: 16, color: "#86c7a0", marginTop: 6 }}>🐟 {t.species}{t.kept && ` · ${t.kept} kept`}</div>}
              {t.lures && <div style={{ fontSize: 16, color: "#7ab898", marginTop: 3 }}>🪝 {t.lures}</div>}
              {t.notes && <div style={{ fontSize: 16, color: "#7ab898", marginTop: 3, fontStyle: "italic" }}>"{t.notes}"</div>}
            </div>
          ))}
        </>}

        <div style={{ height: 36 }} />
        <div style={{ textAlign: "center", fontSize: 16, color: "#7ab898", lineHeight: 1.7 }}>
          Data sourced by Claude · Always verify conditions before heading out<br />{C.lastUpdated}
        </div>
      </div>
    </div>
  );
}
