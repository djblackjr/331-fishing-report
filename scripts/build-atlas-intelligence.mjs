// Builds the Atlas fishing-intelligence packet from the app's current
// conditions, archived regional bite reports, and curated authoritative
// habitat/technique sources. Regional evidence is never promoted to a
// spot-specific catch claim.

import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const CONDITIONS_PATH = fileURLToPath(new URL("../src/data/conditions.json", import.meta.url));
const HISTORY_DIR = fileURLToPath(new URL("../public/history/", import.meta.url));
const OUTPUT_PATH = fileURLToPath(new URL("../public/atlas/intelligence.json", import.meta.url));

const SPECIES = [
  { key: "spotted_seatrout", label: "Speckled trout", pattern: /\b(?:speckled |spotted sea)?trout\b/i },
  { key: "redfish", label: "Redfish", pattern: /\b(?:bull )?redfish\b|\bred drum\b|\breds\b/i },
  { key: "gulf_flounder", label: "Flounder", pattern: /\bflounder\b/i },
  { key: "black_drum", label: "Black drum", pattern: /\bblack drum\b/i },
  { key: "sheepshead", label: "Sheepshead", pattern: /\bsheepshead\b/i },
];

const SOURCES = [
  {
    id: "captain-experiences-destin",
    label: "Captain Experiences — Destin reports",
    url: "https://captainexperiences.com/fishing-reports/locations/regions/destin",
    kind: "regional_report",
    note: "Dated guide reports for Destin, Santa Rosa Beach, Freeport, and nearby Choctawhatchee Bay waters.",
  },
  {
    id: "fishingbooker-bay",
    label: "FishingBooker — Choctawhatchee Bay reports",
    url: "https://fishingbooker.com/reports/destination/us/choctawhatchee-bay",
    kind: "regional_report",
    note: "Dated charter and angler reports for Choctawhatchee Bay.",
  },
  {
    id: "fishingbooker-freeport",
    label: "FishingBooker — Freeport charter archive",
    url: "https://fishingbooker.com/reports/charter/7020",
    kind: "regional_report",
    note: "Archived Freeport reports, including live-shrimp catches around structure.",
  },
  {
    id: "halfhitch-destin",
    label: "Half Hitch — Destin fishing reports",
    url: "https://halfhitch.com/blog/category/destin-fishing-reports",
    kind: "regional_report",
    note: "Dated reports from a local Destin tackle shop.",
  },
  {
    id: "30a-shallow-water",
    label: "30A Shallow Water Guide Service reports",
    url: "https://www.30ashallowwaterguideservice.com/",
    kind: "regional_report",
    note: "Dated reports from a Choctawhatchee Bay guide service.",
  },
  {
    id: "fwc-saltwater-tips",
    label: "FWC — Saltwater fishing tips",
    url: "https://myfwc.com/fishing/saltwater/outreach/how-to-fish/",
    kind: "authoritative_guidance",
    note: "Florida habitat, tide, flats, and fishing-technique guidance.",
  },
  {
    id: "fwc-marine-habitats",
    label: "FWC — Marine fisheries habitats",
    url: "https://myfwc.com/wildlifehabitats/habitat/marine/",
    kind: "authoritative_guidance",
    note: "Estuary and salt-marsh habitat relationships.",
  },
  {
    id: "fwc-redfish",
    label: "FWC — Red drum species profile",
    url: "https://myfwc.com/wildlifehabitats/profiles/saltwater/drums/red-drum/",
    kind: "authoritative_guidance",
    note: "Redfish habitat, prey, and fishing techniques.",
  },
  {
    id: "fwc-seatrout",
    label: "FWC — Spotted seatrout species profile",
    url: "https://myfwc.com/wildlifehabitats/profiles/saltwater/drums/spotted-seatrout/",
    kind: "authoritative_guidance",
    note: "Seatrout habitat, prey, and fishing techniques.",
  },
  {
    id: "fwc-flounder",
    label: "FWC — Gulf flounder species profile",
    url: "https://myfwc.com/wildlifehabitats/profiles/saltwater/flounder/gulf-flounder/",
    kind: "authoritative_guidance",
    note: "Gulf flounder habitat and feeding behavior.",
  },
  {
    id: "fwc-sheepshead",
    label: "FWC — Sheepshead species profile",
    url: "https://myfwc.com/wildlifehabitats/profiles/saltwater/porgy/sheepshead/",
    kind: "authoritative_guidance",
    note: "Sheepshead habitat and natural-bait techniques.",
  },
];

const CURATED_SOURCE_REPORTS = [
  {
    kind: "archived_source_report",
    date: "2026-07-13",
    displayDate: "July 13, 2026",
    summary: "A Santa Rosa Beach guide reported a hot speckled-trout bite with bull redfish beginning to show.",
    attribution: "Captain Experiences — dated Santa Rosa Beach guide report",
    sourceIds: ["captain-experiences-destin"],
    species: ["spotted_seatrout", "redfish"],
    conditions: {},
  },
  {
    kind: "archived_source_report",
    date: "2026-07-01",
    displayDate: "July 1, 2026",
    summary: "A Freeport charter reported over-slot redfish, keeper redfish, and a large sheepshead across morning and afternoon trips.",
    attribution: "FishingBooker — Choctawhatchee Bay Fishing Charters",
    sourceIds: ["fishingbooker-freeport"],
    species: ["redfish", "sheepshead"],
    conditions: {},
  },
  {
    kind: "archived_source_report",
    date: "2026-06-22",
    displayDate: "June 22, 2026",
    summary: "A Freeport charter reported redfish, speckled trout, and black drum taken on live shrimp around structure.",
    attribution: "FishingBooker — Choctawhatchee Bay Fishing Charters",
    sourceIds: ["fishingbooker-freeport"],
    species: ["redfish", "spotted_seatrout", "black_drum"],
    conditions: {},
  },
];

const PROFILES = {
  channels: {
    label: "Channel-edge pattern",
    targetSpecies: ["spotted_seatrout", "redfish", "gulf_flounder", "black_drum"],
    bestTide: "Prioritize moving water; work the edge and current seam rather than the mapped centerline.",
    approach: "Start at first light in summer. Cast along depth transitions and let the current carry the presentation past ambush water.",
    baits: "Live shrimp near structure; soft-bodied jigs or paddle-tails; spoons or topwater for actively feeding trout and reds.",
    sourceIds: ["captain-experiences-destin", "fishingbooker-freeport", "fwc-saltwater-tips", "fwc-redfish", "fwc-seatrout", "fwc-flounder"],
  },
  creek_mouths: {
    label: "Tidal-drain and creek-mouth pattern",
    targetSpecies: ["redfish", "spotted_seatrout", "gulf_flounder", "sheepshead"],
    bestTide: "Fish moving water. Incoming water can push fish onto the adjacent flat; outgoing water can concentrate bait leaving the marsh.",
    approach: "Cover the current seam and bottom transition without blocking the narrow drain. Look for bait movement, wakes, or diving birds.",
    baits: "Live shrimp under a popping cork for reds and trout; a shrimp or soft jig near bottom for flounder; shrimp or fiddler crab near hard structure for sheepshead.",
    sourceIds: ["fishingbooker-freeport", "fwc-saltwater-tips", "fwc-marine-habitats", "fwc-redfish", "fwc-flounder", "fwc-sheepshead"],
  },
  shoreline_points: {
    label: "Marsh-point pattern",
    targetSpecies: ["redfish", "spotted_seatrout"],
    bestTide: "Use current direction to choose the down-current side where bait is swept past the point.",
    approach: "Stay off the point and cast along both shoreline edges. Watch for mullet, bait sprays, wakes, and feeding birds before committing.",
    baits: "Popping-cork shrimp, soft-bodied jigs or paddle-tails, spoons, and low-light topwater.",
    sourceIds: ["captain-experiences-destin", "fwc-saltwater-tips", "fwc-marine-habitats", "fwc-redfish", "fwc-seatrout"],
  },
  sand_holes: {
    label: "Visible-shoal edge pattern",
    targetSpecies: ["spotted_seatrout", "redfish", "gulf_flounder"],
    bestTide: "Work the edge when water is moving; avoid assuming the pale area is sand or safe depth until field checked.",
    approach: "Fish the color-change perimeter, not the unverified shallow interior. Use a slow presentation near bottom for flounder.",
    baits: "Soft jig or paddle-tail, live shrimp, spoon, or a float-rigged bait worked above adjacent grass.",
    sourceIds: ["fwc-saltwater-tips", "fwc-seatrout", "fwc-redfish", "fwc-flounder"],
  },
  fishing_locations: {
    label: "Regional estuary pattern",
    targetSpecies: ["spotted_seatrout", "redfish", "gulf_flounder", "black_drum", "sheepshead"],
    bestTide: "Use the mapped habitat profile where available and prioritize moving water.",
    approach: "Treat the waypoint as visually reviewed structure, not a verified fishing spot. Confirm depth, bottom, and safe access on the water.",
    baits: "Match the linked habitat profile and current regional report; live shrimp and soft-bodied jigs are the broadest starting choices.",
    sourceIds: ["fishingbooker-bay", "fwc-saltwater-tips", "fwc-marine-habitats"],
  },
};

const HABITAT_PROFILE_MAP = {
  channel: "channels",
  drop_off: "channels",
  deep_hole: "channels",
  creek_mouth: "creek_mouths",
  point: "shoreline_points",
  sand_hole: "sand_holes",
  grass_flat: "sand_holes",
};

function positiveSpeciesMentions(text) {
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  return SPECIES.filter((species) => sentences.some((sentence) => {
    if (!species.pattern.test(sentence)) return false;
    if (/^\s*no\b/i.test(sentence)) return false;
    return !/\bno (?:specific |current |recent )?.{0,40}(?:reports?|catches?|mention)/i.test(sentence);
  })).map((species) => species.key);
}

function reportSourceIds(attribution = "") {
  const sourceIds = [];
  if (/captainexperiences/i.test(attribution)) sourceIds.push("captain-experiences-destin");
  // Only the general Bay reports page — the daily research prompt never
  // visits the specific Freeport charter archive (fishingbooker-freeport),
  // so don't attribute reports to it just because "fishingbooker" appears
  // in the attribution string. That id is reserved for the curated
  // archived_source_report entries above, which cite it explicitly.
  if (/fishingbooker/i.test(attribution)) sourceIds.push("fishingbooker-bay");
  if (/half ?hitch/i.test(attribution)) sourceIds.push("halfhitch-destin");
  if (/30a shallow/i.test(attribution)) sourceIds.push("30a-shallow-water");
  return [...new Set(sourceIds)];
}

function evidenceSourceId(url) {
  const curated = SOURCES.find((source) => source.url === url);
  if (curated) return curated.id;
  return `report-${Buffer.from(url).toString("base64url").slice(0, 18)}`;
}

function reportRecord(data, kind) {
  const evidenceIds = (data.localBiteEvidence || []).flatMap((evidence) => {
    try {
      const url = new URL(evidence.url);
      return ["http:", "https:"].includes(url.protocol) ? [evidenceSourceId(url.href)] : [];
    } catch {
      return [];
    }
  });
  return {
    kind,
    date: data.dateISO || data.localBiteUpdated || data.date,
    displayDate: data.localBiteUpdated || data.date,
    summary: data.localBiteReport || "",
    attribution: data.localBiteSource || "Source attribution unavailable",
    sourceIds: [...new Set([...reportSourceIds(data.localBiteSource), ...evidenceIds])],
    species: positiveSpeciesMentions(data.localBiteReport),
    conditions: {
      wind: data.wind?.description || null,
      tide: data.tide || null,
      tideEvents: data.tideEvents || null,
      waterTemp: data.waterTemp ?? null,
      sky: data.sky || null,
      stormChance: data.stormChance ?? null,
    },
  };
}

async function main() {
  const current = JSON.parse(await readFile(CONDITIONS_PATH, "utf8"));
  const historyFiles = (await readdir(HISTORY_DIR))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const archives = [];
  for (const file of historyFiles) {
    const data = JSON.parse(await readFile(join(HISTORY_DIR, file), "utf8"));
    if (data.localBiteReport) archives.push(reportRecord(data, "archived_app_snapshot"));
  }

  const evidenceSources = [current, ...await Promise.all(historyFiles.map(async (file) =>
    JSON.parse(await readFile(join(HISTORY_DIR, file), "utf8"))
  ))].flatMap((data) => (data.localBiteEvidence || []).flatMap((evidence) => {
    try {
      const url = new URL(evidence.url);
      if (!["http:", "https:"].includes(url.protocol)) return [];
      return [{
        id: evidenceSourceId(url.href),
        label: evidence.title || url.hostname,
        url: url.href,
        kind: "regional_report",
        reportDate: evidence.reportDate || null,
        note: "Exact source page preserved by the daily bite-report research.",
      }];
    } catch {
      return [];
    }
  }));

  const currentReport = reportRecord(current, "current_regional_report");
  const reports = [...CURATED_SOURCE_REPORTS, ...archives, currentReport]
    .filter((report) => report.summary)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const speciesSignals = SPECIES.map((species) => {
    const matches = reports.filter((report) => report.species.includes(species.key));
    const currentMatch = currentReport.species.includes(species.key);
    return {
      key: species.key,
      label: species.label,
      current: currentMatch,
      reportCount: matches.length,
      lastReported: matches.at(-1)?.date || null,
      evidenceLevel: currentMatch ? "current_regional_report" : matches.length ? "archived_regional_report" : "habitat_guidance_only",
    };
  });

  const packet = {
    type: "FishingIntelligence",
    region: "choctawhatchee_bay",
    generatedAt: current.dateISO || new Date().toISOString().slice(0, 10),
    scopeNote: "Regional reports support timing and species activity only. They do not prove a catch, depth, bottom type, or safe navigation at a mapped Jolly Bay feature.",
    currentConditions: currentReport.conditions,
    currentReport,
    archivedReports: reports
      .filter((report) => report.kind !== "current_regional_report")
      .slice(-8)
      .reverse(),
    speciesSignals,
    profiles: PROFILES,
    habitatProfileMap: HABITAT_PROFILE_MAP,
    sources: [...new Map(
      [...evidenceSources, ...SOURCES].map((source) => [source.id, source])
    ).values()],
  };

  await writeFile(OUTPUT_PATH, JSON.stringify(packet, null, 2) + "\n");
  console.log(`Built Atlas intelligence from 1 current + ${archives.length} archived report(s).`);
}

main();
