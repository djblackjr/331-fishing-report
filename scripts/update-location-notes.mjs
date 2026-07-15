// scripts/update-location-notes.mjs
// Calls the Claude API once a day to write a fresh bay-wide "AI Summary" plus
// per-location "Why this spot" (aiNote) and "Today's advice" (todaysCall)
// copy, grounded in the weather/tide/bite-report data already sitting in
// conditions.json. Unlike update-bite-report.mjs this doesn't need web
// search — it's synthesis over data we already fetched, not research — so
// it's cheaper and can safely run every day rather than weekly.
//
// Run manually:   ANTHROPIC_API_KEY=... node scripts/update-location-notes.mjs
// Run on schedule: see .github/workflows/daily-refresh.yml

import { readFile, writeFile } from "fs/promises";

const OUT_PATH = new URL("../src/data/conditions.json", import.meta.url);
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY not set — skipping location notes update (non-fatal).");
  process.exit(0); // exit 0 on purpose: missing key shouldn't fail the whole daily refresh
}

// Reference facts for each spot, kept in sync manually with the `id`/`label`/
// `aiNote` fields in the LOCATIONS array in src/App.jsx. Passed to the model
// as grounding so it can't invent geography/species facts it has no basis
// for — it's only allowed to vary phrasing and fold in today's conditions.
const LOCATIONS = [
  {
    id: "bridge",
    label: "331 Bridge",
    topSpecies: "speckled trout, redfish, black drum, sheepshead",
    background: "Spans the narrow neck of Choctawhatchee Bay, creating a current funnel where bait gets pushed through on both tides. Pilings hold trout, reds, sheepshead, and black drum year-round; lee-side pilings are the prime ambush zone on incoming tides. Open water here is exposed to weather and chop — first spot to become unfishable when wind picks up.",
  },
  {
    id: "alaqua",
    label: "Alaqua Bayou",
    topSpecies: "redfish, speckled trout, flounder",
    background: "Protected water with a strong year-round redfish population, plus trout and flounder at the mouth. Oyster bars at the creek mouth are the prime spot. Tree cover keeps it a few degrees cooler than the open bay and offers shelter from wind and weather. Upper creek transitions toward brackish and holds bass alongside small reds.",
  },
  {
    id: "basin",
    label: "Basin Bayou",
    topSpecies: "redfish, speckled trout, pompano",
    background: "Sees less pressure than Alaqua and LaGrange, meaning less-educated fish. Interior grass flats are classic sight-fishing territory for reds in under 2 feet. Pompano occasionally show at the mouth on moving tides in late spring/early summer. Less protected than LaGrange when weather builds.",
  },
  {
    id: "lagrange",
    label: "LaGrange Bayou",
    topSpecies: "speckled trout, redfish, black drum, sheepshead",
    background: "Top trout producer in this report — oyster bars at the mouth are legendary, interior grass flats hold reds year-round. Deep holes inside hold black drum and sheepshead. Most protected water on this side of the bay, making it the go-to spot when weather builds.",
  },
  {
    id: "fourmile",
    label: "Four Mile Creek",
    topSpecies: "redfish, speckled trout, flounder",
    background: "Tidal creek running between Shipyard Marina and the bay. Tidal flow pushes baitfish up the creek on incoming tides, concentrating reds and trout in the bends and grass edges. Upper section transitions toward brackish and holds bass alongside small reds. Creek mouth is a prime flounder zone. Short and protected — the safest fishery when weather threatens.",
  },
  {
    id: "hogtown",
    label: "Hogtown Bayou",
    topSpecies: "speckled trout, redfish, Spanish mackerel",
    background: "Signature Santa Rosa Beach guide spot and one of the most productive trout flats on the bay. Sees regular pressure but produces consistently; summer mornings are peak with trout stacked on grass in 2-4 feet. Spanish mackerel show at the mouth on moving tides. Further from the 331 bridge than the other bayous — factor in run time.",
  },
  {
    id: "rocky",
    label: "Rocky Bayou",
    topSpecies: "redfish, speckled trout, flounder, mangrove snapper",
    background: "Sits inside Fred Gannon Rocky Bayou State Park near Niceville — protected, scenic, significantly less pressured than bayous closer to the 331 bridge. Freshwater influence from Rocky Creek makes flounder fishing excellent; glass-calm state park coves are ideal for sight-fishing reds. Mangrove snapper hold near dock pilings. Furthest location from Shipyard Marina — factor in run time.",
  },
];

function buildPrompt(c) {
  const locList = LOCATIONS.map(
    (l) => `- id: "${l.id}" | ${l.label} | top species: ${l.topSpecies}\n  background: ${l.background}`
  ).join("\n");

  return `You write copy for a fishing conditions dashboard covering Choctawhatchee Bay near Freeport, FL. Today's real conditions:

Date: ${c.date}
Weather: ${c.weather}
Wind: ${c.wind?.description ?? "unknown"}
Water temp: ${c.waterTemp ? `${c.waterTemp}°F (measured today — use this exact figure, not an approximation)` : "unknown"}
Tide: ${c.tide}
Storm chance: ${c.stormChance}% (window: ${c.stormWindow || "none expected"})
Moon phase: ${c.moonPhase}
Water clarity: ${c.waterClarity}
Sky: ${c.sky}
Recent bay-wide bite report: ${c.localBiteReport || "no recent report available"}

Here are the 7 locations on this dashboard, with reference facts for each (do not contradict or invent facts beyond these):

${locList}

Write:
1. "aiSummary": a 2-3 sentence bay-wide overview for today, combining the weather/storm picture with the bite report. This appears once at the top of the dashboard.
2. For each location id, a "locations" entry with:
   - "aiNote": 2-4 sentences of evergreen background on that spot. Base this closely on the reference facts given — light rephrasing is fine, do not invent new facts, do NOT mention today's specific weather/tide numbers here (this text does not change day to day).
   - "todaysCall": 3-5 sentences of concrete, actionable advice for fishing THAT SPOT today specifically. Ground it in today's actual wind direction/speed, tide timing, storm chance/window, and moon/clarity data above. Reference the bay-wide bite report only if it's genuinely relevant to that spot's species — do not fabricate spot-specific catches that aren't in the report.

Respond with ONLY a JSON object, no other text, no markdown fences, matching exactly this shape:
{"aiSummary": "...", "locations": {"bridge": {"aiNote": "...", "todaysCall": "..."}, "alaqua": {...}, "basin": {...}, "lagrange": {...}, "fourmile": {...}, "hogtown": {...}, "rocky": {...}}}`;
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
  const raw = textBlocks.join("\n").trim();
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
}

async function main() {
  const existing = JSON.parse(await readFile(OUT_PATH, "utf-8"));

  let result;
  try {
    result = await callClaude(buildPrompt(existing));
  } catch (err) {
    console.error("Location notes update failed, leaving previous values in place:", err.message);
    process.exit(0); // non-fatal — keep yesterday's notes rather than breaking the whole refresh
  }

  if (!result.aiSummary || !result.locations || Object.keys(result.locations).length !== LOCATIONS.length) {
    console.error("Unexpected response shape, leaving previous values in place.");
    process.exit(0);
  }

  const updated = {
    ...existing,
    aiSummary: result.aiSummary,
    locationNotes: result.locations,
  };

  await writeFile(OUT_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log("Location notes updated for", Object.keys(result.locations).length, "locations.");
}

main();
