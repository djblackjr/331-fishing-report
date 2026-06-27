import { useState } from "react";

// ── SHARED CONDITIONS ─────────────────────────────────────────────────────────
const CONDITIONS = {
  date: "Sunday, June 28, 2026",
  wind: { speed: 7, dir: "W", description: "WNW light · shifting SW 5–10 mph by morning · calm bay" },
  weather: "Sunny · High 92°F · Heat index 103°F · No storm threat — excellent day",
  tide: "Incoming ~6:20 AM · Outgoing ~12:45 PM · Sunrise 5:43 AM · Smooth to light chop",
  moonPhase: "Waxing Crescent (Day 3)",
  waterClarity: "Slightly stained",
  sky: "Bright sun",
  lastUpdated: "June 28, 2026 · NWS weather.gov (live fetch) · Updated 4:16 PM CDT Jun 27",
  launch: "Shipyard Marina · 116 Shipyard Rd, Freeport FL 32439 · (850) 866-3865 · Open 7:30 AM–5 PM. Cruise 4 miles down the creek to east Choctawhatchee Bay. Fuel on-site. Copeland's Bait & Tackle: 17290 US-331 S · open 6 AM · (850) 835-4277.",
  windGuidance: [
    { dir: "N", icon: "↓", advice: "Fish protected south shore — calm water, grass flats east of bridge" },
    { dir: "S", icon: "↑", advice: "Fish north shoreline — LaGrange Bayou mouth and creek edges" },
    { dir: "E", icon: "→", advice: "Fish the bridge — east wind pushes bait against west pilings" },
    { dir: "W", icon: "←", advice: "Fish bayou mouths — LaGrange and Alaqua mouths concentrate fish" },
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

// ── 3-DAY LOOK AHEAD ──────────────────────────────────────────────────────────
const FORECAST = [
  {
    day: "Sun Jun 28",
    label: "Today",
    high: 92,
    low: 76,
    wind: "WNW light → SW 5-10",
    storms: 0,
    headline: "Sunny · Heat index 103°F",
    fishingScore: 8.0,
    aiCall: "Excellent — all-morning window, calm bay, no storms. Heat is the only caution. Be off the water by 11 AM.",
    emoji: "☀️",
  },
  {
    day: "Mon Jun 29",
    label: "Tomorrow",
    high: 93,
    low: 77,
    wind: "Calm → WSW 5",
    storms: 30,
    headline: "Mostly sunny · PM storms possible after 1 PM",
    fishingScore: 7.5,
    aiCall: "Strong morning bite likely — sun and heat similar to Sunday. Storm chance jumps after 1 PM, so plan to be in by noon.",
    emoji: "⛅",
  },
  {
    day: "Tue Jun 30",
    label: "Tuesday",
    high: 92,
    low: 75,
    wind: "Variable",
    storms: 70,
    headline: "T-storms likely · 70% chance",
    fishingScore: 5.0,
    aiCall: "First real weather day — storms likely mainly after 1 PM but can fire earlier. Fish hard from sunrise to 11 AM and watch radar closely.",
    emoji: "⛈️",
  },
];



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
      { order: 1, name: "Bridge Pilings (East Side)", tide: "Incoming tide · sunrise", steps: ["Bone/white Spook Jr. topwater along pilings pre-dawn", "Switch to chartreuse paddle-tail as sun rises", "W wind today — bait stacks on east face of pilings"] },
      { order: 2, name: "Channel Edge", tide: "Mid-incoming", steps: ["Gold Johnson spoon slow-retrieved through the channel", "Live shrimp under popping cork in 4–6 ft", "Target the depth change between grass and sand"] },
      { order: 3, name: "South Shore Grass Flats", tide: "Outgoing", steps: ["Weedless paddle-tail in white or new penny", "Sight fish tailing reds in 1–2 ft", "W wind = protected water on south shore today"] },
    ],
    aiNote: "Sunday is a green light day — sunny, high 92°F, no storm threat, light WNW wind shifting SW by morning. The bay will be calm and fishable all morning. Launch at 5:30 AM and work the east face of the 331 bridge pilings on the incoming tide with a bright topwater or white paddle-tail. With no weather pressure you can fish through late morning — but heat index hits 103°F so bring plenty of water and consider heading in by 11 AM before the heat gets serious. Watch for isolated afternoon sea breeze storms after 2 PM.",
  },
  {
    id: "alaqua",
    label: "Alaqua Bayou",
    emoji: "🌿",
    overallScore: 7.0,
    conditions: "Good",
    species: [
      { name: "Redfish", confidence: 90, note: "Oyster bars and creek bends, gold spoon or live shrimp" },
      { name: "Speckled Trout", confidence: 75, note: "Grass flat edges at bayou mouth on incoming tide" },
      { name: "Flounder", confidence: 65, note: "Mud bottom near oyster bars, mud minnow on jig" },
      { name: "Black Drum", confidence: 55, note: "Deeper holes in the bayou, shrimp on bottom" },
      { name: "Largemouth Bass", confidence: 45, note: "Upper creek near freshwater inflow, soft plastics" },
    ],
    stops: [
      { order: 1, name: "Bayou Mouth Oyster Bars", tide: "Incoming tide", steps: ["Gold spoon along oyster bar edges", "Live shrimp under popping cork", "W wind today concentrates fish at the mouth — prime spot"] },
      { order: 2, name: "Creek Bends (Mid-Bayou)", tide: "Mid-incoming", steps: ["Slow-roll paddle-tail through bends", "Topwater along overhanging banks at dawn", "Mud minnow on 1/4 oz jig for flounder on bottom"] },
      { order: 3, name: "Upper Alaqua Creek", tide: "Any", steps: ["Transitions to bass-fishing style in upper reaches", "Soft plastics and small swimbaits near structure", "Watch for alligators — keep hooks away from the bank"] },
    ],
    aiNote: "Alaqua Bayou is protected water — today's west wind and incoming storm threat makes this the best alternative to the open bay. The bayou mouth oyster bars should hold redfish all morning. W wind today is actually ideal here: it concentrates baitfish at the creek mouth where it meets the bay. Start at the oyster bars at first light with a gold spoon, then work up the bayou as the tide rises. You can fish later into the morning here safely — the tree line gives you shelter and a clear view of incoming weather.",
  },
  {
    id: "basin",
    label: "Basin Bayou",
    emoji: "🦅",
    overallScore: 7.0,
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
    aiNote: "Basin Bayou sees less pressure than Alaqua and LaGrange, which means less-educated fish. The interior grass flats are classic sight-fishing territory for reds — poling or drifting quietly in under 2 feet. West wind today should push bait into the mouth on the incoming tide, setting up a good early bite. Pompano occasionally show at the mouth on moving tides in late June — worth a few casts with a small jig before moving inside.",
  },
  {
    id: "lagrange",
    label: "LaGrange Bayou",
    emoji: "🦪",
    overallScore: 7.5,
    conditions: "Good",
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
      { order: 3, name: "Deep Holes (Storm Shelter)", tide: "Any — especially if weather builds", steps: ["If storms develop, retreat inside LaGrange", "Fish deeper holes with shrimp on bottom", "Protected water — safe haven if bay gets rough"] },
    ],
    aiNote: "With morning storms in the forecast, LaGrange is actually your smartest call for Sunday — it's both the top trout producer and your built-in storm shelter. Fish the oyster bars at the mouth on the incoming tide from 5:30–8 AM with a popping cork and live shrimp. If clouds build before expected, you're already inside protected water. Fish the deeper interior holes until it passes, then move back to the mouth on the outgoing tide. You don't have to race back to Shipyard — LaGrange has you covered.",
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
    aiNote: "Four Mile Creek is your backyard fishery — the water you run through every trip but may not have fished seriously. The tidal influence from Choctawhatchee Bay pushes bait fish up the creek on the incoming tide, concentrating reds and trout in the bends and grass edges. The upper section near Shipyard transitions toward brackish and holds bass as well as small reds. On a day with a tight storm window like today, this is your safest option — you are never more than a few minutes from the dock. Fish it hard on the way out at first light, then make your bay run. If storms develop early, turn around and finish the morning right here.",
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
    aiNote: "Hogtown Bayou is the signature fishing spot of the Santa Rosa Beach guides and one of the most productive trout flats on Choctawhatchee Bay. It sees regular pressure but produces consistently from a boat or kayak. Summer mornings are peak — trout stack on the grass in 2-4 feet. West wind today protects the interior; fish the bayou mouth first on the incoming tide then work inside as the tide builds. Less crowded than the bridge area on weekends. It is further from the 331 bridge — plan your run time accordingly relative to the storm window.",
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
    aiNote: "Rocky Bayou sits inside Fred Gannon Rocky Bayou State Park near Niceville — protected, scenic, and significantly less pressured than the bayous closer to the 331 bridge. The freshwater influence from Rocky Creek makes flounder fishing here excellent, and the glass-calm coves in the state park are ideal for sight fishing reds on a flat tide. It is the furthest location from Shipyard Marina in this report — factor in run time. On a day with a tight storm window like today, the extra distance makes this a lower priority unless you want protected water with guaranteed solitude.",
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
      <text x="41" y="38" textAnchor="middle" fill={color} fontSize="16" fontWeight="700" fontFamily="'Space Grotesk',sans-serif">{score}</text>
      <text x="41" y="51" textAnchor="middle" fill="#7ab898" fontSize="9" fontFamily="'Space Grotesk',sans-serif">/10</text>
    </svg>
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
    <span style={{ background: color, color: text, borderRadius: 4, padding: "3px 10px", fontSize: 14, fontWeight: 600, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.03em", border: `1px solid ${text}22` }}>{children}</span>
  );
}

function Collapsible({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 10, border: "1px solid #1a3828", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", background: "#0f2a1c", border: "none", padding: "11px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif" }}>
        <span style={{ fontSize: 14, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>{title}</span>
        <span style={{ color: "#7ab898", fontSize: 14, transform: open ? "rotate(180deg)" : "none", transition: "0.2s" }}>▾</span>
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
          const color = sc >= 7.5 ? "#4ade80" : sc >= 6 ? "#facc15" : "#f87171";
          const rating = sc >= 8 ? "Excellent" : sc >= 7 ? "Good" : sc >= 5.5 ? "Fair" : "Poor";
          const stormColor = day.storms >= 60 ? "#f87171" : day.storms >= 30 ? "#facc15" : "#4ade80";
          return (
            <div key={i} style={{ marginBottom: 10, padding: "14px 14px", background: "#0f2a1c", borderRadius: 10, border: `1px solid ${color}33` }}>
              {/* Top row: day info + big score ring */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                <ScoreRing score={sc} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: "#7ab898", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>{day.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: "#d1f0e0", marginBottom: 2 }}>{day.day}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: color }}>{rating} conditions</div>
                </div>
                <div style={{ fontSize: 32 }}>{day.emoji}</div>
              </div>

              {/* Headline */}
              <div style={{ fontSize: 14, color: "#d1f0e0", marginBottom: 8 }}>{day.headline}</div>

              {/* Metrics row */}
              <div style={{ display: "flex", gap: 14, fontSize: 13, color: "#7ab898", marginBottom: 10, flexWrap: "wrap" }}>
                <span>🌡️ {day.high}°/{day.low}°F</span>
                <span>💨 {day.wind}</span>
                <span style={{ color: stormColor }}>⛈️ {day.storms}%</span>
              </div>

              {/* AI call */}
              <div style={{ fontSize: 14, color: "#86c7a0", lineHeight: 1.6, paddingTop: 10, borderTop: "1px solid #1a3828" }}>
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
                <span style={{ fontSize: 19 }}>{b.emoji}</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: on ? "#4ade80" : "#7ab898", lineHeight: 1.3 }}>{b.label}</span>
                {on && <span style={{ marginLeft: "auto", color: "#4ade80", fontSize: 14 }}>✓</span>}
              </button>
            );
          })}
        </div>

        {/* Tips */}
        {tips.map((tip, i) => (
          <div key={i} style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 14, color: "#d1f0e0", lineHeight: 1.65 }}>
            💡 {tip}
          </div>
        ))}

        {/* Rigs */}
        {recs.length > 0 ? recs.map((r, i) => (
          <div key={i} style={{ marginBottom: 8, padding: "10px 13px", background: "#0f2a1c", borderRadius: 8, border: "1px solid #1a3828" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#86c7a0" }}>{r.name}</div>
            <div style={{ fontSize: 14, color: "#7ab898", marginTop: 3, lineHeight: 1.6 }}>{r.detail}</div>
          </div>
        )) : (
          <div style={{ textAlign: "center", color: "#7ab898", fontSize: 14, padding: "16px 0" }}>Select what you have above to see rigging tips.</div>
        )}
      </div>
    </Collapsible>
  );
}

function LocationReport({ loc }) {
  const C = CONDITIONS;
  const lureKey = C.sky === "Cloudy" ? "Cloudy morning" : C.sky === "Bright sun" ? "Bright sun" : C.waterClarity === "Dirty" ? "Dirty water" : "Slightly stained";
  const lures = C.lureMatrix[lureKey] || [];
  const cc = loc.conditions === "Excellent" ? "#4ade80" : loc.conditions === "Good" ? "#86efac" : loc.conditions === "Fair" ? "#facc15" : "#f87171";
  const card = { background: "#0f2a1c", borderRadius: 10, padding: "13px 15px", border: "1px solid #1a3828", marginBottom: 10 };
  const lbl = { fontSize: 14, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 };
  const divider = <div style={{ height: 1, background: "#1a3828", margin: "11px 0" }} />;

  return (
    <div>
      {/* Score card */}
      <div style={{ ...card, display: "flex", alignItems: "center", gap: 18, marginBottom: 10 }}>
        <ScoreRing score={loc.overallScore} />
        <div>
          <div style={{ fontSize: 19, fontWeight: 700, color: cc }}>{loc.conditions}</div>
          <div style={{ fontSize: 14, color: "#86c7a0", marginTop: 2 }}>{C.weather}</div>
          <div style={{ fontSize: 14, color: "#7ab898", marginTop: 2 }}>🌊 {C.tide}</div>
          <div style={{ fontSize: 14, color: "#7ab898", marginTop: 1 }}>💨 {C.wind.description} · 🌙 {C.moonPhase}</div>
        </div>
      </div>

      {/* Species */}
      <Collapsible title="🐟 Species Confidence">
        <div style={{ marginTop: 10 }}>
          {loc.species.map(s => (
            <div key={s.name} style={{ marginBottom: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#d1f0e0", minWidth: 130 }}>{s.name}</span>
                <ConfBar pct={s.confidence} />
                <span style={{ fontSize: 14, fontWeight: 700, color: s.confidence >= 75 ? "#4ade80" : s.confidence >= 50 ? "#facc15" : "#f87171", minWidth: 36, textAlign: "right" }}>{s.confidence}%</span>
              </div>
              <div style={{ fontSize: 14, color: "#7ab898" }}>{s.note}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Strategy */}
      <Collapsible title="🗺️ Fishing Strategy">
        <div style={{ marginTop: 10 }}>
          {loc.stops.map((stop, i) => (
            <div key={stop.order}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#4ade80", color: "#0a1f14", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{stop.order}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f0faf4" }}>{stop.name}</div>
                  <div style={{ fontSize: 14, color: "#7ab898" }}>{stop.tide}</div>
                </div>
              </div>
              <ul style={{ margin: 0, padding: "0 0 0 34px", fontSize: 14, color: "#86c7a0", lineHeight: 2.0 }}>
                {stop.steps.map(s => <li key={s}>{s}</li>)}
              </ul>
              {i < loc.stops.length - 1 && divider}
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Lures */}
      <Collapsible title={`🪝 Lures — ${lureKey}`}>
        <div style={{ marginTop: 10 }}>
          {lures.map(l => (
            <div key={l.lure} style={{ marginBottom: 9, padding: "10px 12px", background: "#0f2a1c", borderRadius: 8, border: "1px solid #1a3828" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#86c7a0" }}>{l.lure}</div>
              <div style={{ fontSize: 14, color: "#7ab898", marginTop: 2 }}>{l.detail}</div>
            </div>
          ))}
        </div>
      </Collapsible>

      {/* Bait picker */}
      <BaitPicker />

            {/* AI note */}
      <div style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 10, padding: "14px 16px", marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: "#4ade80", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>🤖 AI Field Notes</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.75, color: "#d1f0e0" }}>{loc.aiNote}</p>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: "100%", background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 12px", color: "#d1f0e0", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif", outline: "none", boxSizing: "border-box" }} />
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
  const C = CONDITIONS;

  useState(() => {
    (async () => { try { const r = await window.storage.get("trips"); if (r?.value) setTrips(JSON.parse(r.value)); } catch {} })();
  });

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
  const lbl = { fontSize: 14, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 };

  return (
    <div style={{ minHeight: "100vh", background: "#0a1f14", fontFamily: "'Space Grotesk',sans-serif", color: "#d1f0e0", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 4 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.16em", color: "#4ade80", textTransform: "uppercase", marginBottom: 3 }}>🎣 Daily Fishing Intel</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#f0faf4", lineHeight: 1.2 }}>331 Bridge Area</h1>
          <div style={{ fontSize: 14, color: "#86c7a0", marginTop: 2 }}>Fishing Report · Freeport, FL · {C.date}</div>
        </div>

        {/* Storm warning */}
        <div style={{ background: "#2a1a00", border: "1px solid #4ade8066", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#86efac", margin: "12px 0", lineHeight: 1.5 }}>
          🌞 Sunday: No storm threat — extended fishing window all morning. Heat index up to 103°F · Stay hydrated · Watch for afternoon sea breeze storms after 2 PM.
        </div>

        {/* 3-day look ahead — always visible */}
        <ForecastStrip />

        {/* Main tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14, marginTop: 14 }}>
          {[["report", "📋 Report"], ["log", "📓 Trip Log"]].map(([key, label]) => (
            <button key={key} onClick={() => setMainTab(key)} style={{
              flex: 1, padding: "9px 0", borderRadius: 8, border: "none", cursor: "pointer",
              fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14,
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
              const sc = loc.overallScore;
              const dot = sc >= 7.5 ? "#4ade80" : sc >= 6 ? "#facc15" : "#f87171";
              return (
                <button key={loc.id} onClick={() => setLocTab(loc.id)} style={{
                  padding: "10px 10px", borderRadius: 8, border: active ? "1px solid #4ade8066" : "1px solid #1a3828",
                  cursor: "pointer", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 14,
                  background: active ? "#0d2918" : "#0f2a1c", color: active ? "#f0faf4" : "#7ab898",
                  textAlign: "center", lineHeight: 1.4, transition: "all 0.15s",
                  flexShrink: 0, minWidth: 72,
                }}>
                  <div style={{ fontSize: 19, marginBottom: 3 }}>{loc.emoji}</div>
                  <div style={{ fontSize: 13, whiteSpace: "nowrap" }}>{loc.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: dot, marginTop: 3 }}>{loc.overallScore}</div>
                </button>
              );
            })}
          </div>

          {/* Active location name */}
          <div style={{ fontSize: 17, fontWeight: 700, color: "#f0faf4", marginBottom: 12 }}>
            {activeLoc.emoji} {activeLoc.label}
          </div>

          {/* Location report */}
          {activeLoc && <LocationReport loc={activeLoc} />}

          {/* Shared sections */}
          <div style={{ height: 1, background: "#1a3828", margin: "14px 0" }} />

          {/* Wind guidance */}
          <div style={{ border: "1px solid #1a3828", borderRadius: 10, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ background: "#0f2a1c", padding: "11px 16px" }}>
              <span style={{ fontSize: 14, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>💨 Wind Guidance — All Locations</span>
            </div>
            <div style={{ padding: "10px 16px 14px", background: "#0a1f14" }}>
              {C.windGuidance.map(w => {
                const active = C.wind.dir === w.dir;
                return (
                  <div key={w.dir} style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 9, padding: "9px 12px", borderRadius: 8, background: active ? "#0d2918" : "transparent", border: active ? "1px solid #4ade8044" : "1px solid transparent" }}>
                    <div style={{ fontSize: 17, minWidth: 22, textAlign: "center" }}>{w.icon}</div>
                    <div><span style={{ fontSize: 14, fontWeight: 700, color: active ? "#4ade80" : "#86c7a0" }}>{w.dir} wind{active ? " ← today" : ""} · </span><span style={{ fontSize: 14, color: "#d1f0e0" }}>{w.advice}</span></div>
                  </div>
                );
              })}
              <div style={{ background: "#2a1a00", border: "1px solid #facc1566", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#fde68a", marginTop: 4 }}>⚠️ {C.windWarning}</div>
            </div>
          </div>

          {/* Launch */}
          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
            <div style={lbl}>🚤 Launch & Bait</div>
            <div style={{ fontSize: 14, color: "#d1f0e0", lineHeight: 1.7 }}>{C.launch}</div>
          </div>

          {/* Regs */}
          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
            <div style={lbl}>📋 Regulations</div>
            {C.regulations.map(r => (
              <div key={r.species} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "6px 0", borderBottom: "1px solid #1a3828" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#86c7a0" }}>{r.species}</span>
                <span style={{ fontSize: 14, color: "#d1f0e0", textAlign: "right", maxWidth: "60%" }}>{r.rules}</span>
              </div>
            ))}
          </div>

          {/* Refresh */}
          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 6 }}>
            <div style={lbl}>🔄 Refresh This Report</div>
            <div style={{ fontSize: 14, color: "#d1f0e0", lineHeight: 1.7 }}>Say <span style={{ color: "#4ade80", fontWeight: 700 }}>"refresh my fishing report"</span> in this chat and Claude will re-search live conditions and rebuild it fresh.</div>
          </div>
        </>}

        {/* ── TRIP LOG ── */}
        {mainTab === "log" && <>
          {patterns && (
            <div style={{ background: "#0d2918", border: "1px solid #4ade8033", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: "#4ade80", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>📈 Your Patterns ({patterns.totalTrips} trips · {patterns.totalKept} kept)</div>
              {patterns.bestTide && <div style={{ fontSize: 14, color: "#d1f0e0", marginBottom: 4 }}>🌊 Best tide: <span style={{ color: "#4ade80", fontWeight: 600 }}>{patterns.bestTide[0]}</span> — {patterns.bestTide[1]} fish kept</div>}
              {patterns.bestWind && <div style={{ fontSize: 14, color: "#d1f0e0" }}>💨 Best wind: <span style={{ color: "#4ade80", fontWeight: 600 }}>{patterns.bestWind[0]}</span> — {patterns.bestWind[1]} fish kept</div>}
            </div>
          )}

          <div style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontSize: 14, color: "#7ab898", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>➕ Log a Trip</div>
            <Input label="Date" value={form.date} onChange={v => setForm(f => ({ ...f, date: v }))} placeholder="June 28, 2026" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Input label="Hours fished" value={form.hours} onChange={v => setForm(f => ({ ...f, hours: v }))} placeholder="4" />
              <div>
                <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Location</div>
                <select value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <option value="">Select…</option>
                  {["331 Bridge", "Alaqua Bayou", "Basin Bayou", "LaGrange Bayou", "Grass Flats", "Multiple"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Tide</div>
                <select value={form.tide} onChange={e => setForm(f => ({ ...f, tide: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif" }}>
                  <option value="">Select…</option>
                  {["Incoming", "High slack", "Outgoing", "Low slack"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#7ab898", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Wind</div>
                <select value={form.wind} onChange={e => setForm(f => ({ ...f, wind: e.target.value }))}
                  style={{ width: "100%", background: "#0a1f14", border: "1px solid #1a3828", borderRadius: 6, padding: "8px 10px", color: "#d1f0e0", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif" }}>
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
            <button onClick={saveTrip} disabled={!form.date} style={{ width: "100%", marginTop: 4, padding: "11px 0", borderRadius: 8, border: "none", background: form.date ? "#4ade80" : "#1a3828", color: form.date ? "#0a1f14" : "#7ab898", fontWeight: 700, fontSize: 14, cursor: form.date ? "pointer" : "not-allowed", fontFamily: "'Space Grotesk',sans-serif" }}>
              {saved ? "✓ Saved!" : "Save Trip"}
            </button>
          </div>

          {trips.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#7ab898", fontSize: 14 }}>No trips logged yet. Patterns appear after 3 entries.</div>
          ) : trips.map(t => (
            <div key={t.id} style={{ background: "#0f2a1c", border: "1px solid #1a3828", borderRadius: 10, padding: "13px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#d1f0e0" }}>{t.date}</div>
                  <div style={{ fontSize: 14, color: "#7ab898", marginTop: 2 }}>{t.hours && `${t.hours}h`}{t.start && ` · ${t.start}`}{t.tide && ` · ${t.tide}`}{t.wind && ` · ${t.wind}`}</div>
                </div>
                <button onClick={() => deleteTrip(t.id)} style={{ background: "none", border: "none", color: "#7ab898", cursor: "pointer", fontSize: 17, padding: "0 0 0 10px" }}>✕</button>
              </div>
              {t.species && <div style={{ fontSize: 14, color: "#86c7a0", marginTop: 6 }}>🐟 {t.species}{t.kept && ` · ${t.kept} kept`}</div>}
              {t.lures && <div style={{ fontSize: 14, color: "#7ab898", marginTop: 3 }}>🪝 {t.lures}</div>}
              {t.notes && <div style={{ fontSize: 14, color: "#7ab898", marginTop: 3, fontStyle: "italic" }}>"{t.notes}"</div>}
            </div>
          ))}
        </>}

        <div style={{ height: 36 }} />
        <div style={{ textAlign: "center", fontSize: 14, color: "#7ab898", lineHeight: 1.7 }}>
          Data sourced by Claude · Always verify conditions before heading out<br />{C.lastUpdated}
        </div>
      </div>
    </div>
  );
}

