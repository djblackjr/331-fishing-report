// scripts/update-bite-report.mjs
// Calls the Claude API (with web search enabled) once a day to research
// current Choctawhatchee Bay fishing reports and write a fresh summary into
// conditions.json. This is the one piece of the daily refresh that costs
// real money (a fraction of a cent per run) rather than being free, since
// there's no structured API for "current fishing chatter" the way there is
// for weather/tides — this genuinely needs a model reading and synthesizing
// text, same as when you'd ask Claude manually in a chat.

import { readFile, writeFile } from "fs/promises";

const OUT_PATH = new URL("../src/data/conditions.json", import.meta.url);
const API_KEY = process.env.ANTHROPIC_API_KEY;

if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY not set — skipping bite report update (non-fatal).");
  process.exit(0); // exit 0 on purpose: missing key shouldn't fail the whole daily refresh
}

const PROMPT = `Search for current fishing reports (this week if possible) for Choctawhatchee Bay, Freeport/Destin/Santa Rosa Beach, Florida. Focus on inshore species relevant to a bay fishing report app: redfish, speckled trout, flounder, black drum, sheepshead — not offshore species like red snapper/grouper/mahi unless there's genuinely nothing else current.

Write a short (3-5 sentence) summary in your own words — paraphrase everything, never quote any source directly, even in quotation marks. If the most recent available reports are more than a week old (charter report blogs often update weekly, not daily), say so plainly rather than presenting stale info as brand new.

Respond with ONLY a JSON object, no other text, no markdown fences:
{"localBiteReport": "your summary here", "localBiteSource": "brief attribution, e.g. site names you drew from"}`;

async function callClaude() {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: PROMPT }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  // Response may include multiple content blocks (tool use, tool results, text).
  // The final text block is what we want; find it rather than assuming position.
  const textBlocks = data.content.filter((b) => b.type === "text").map((b) => b.text);
  const raw = textBlocks.join("\n").trim();
  // Strip markdown fences if the model added them despite instructions not to
  const cleaned = raw.replace(/^```json\s*|\s*```$/g, "");
  return JSON.parse(cleaned);
}

async function main() {
  const existing = JSON.parse(await readFile(OUT_PATH, "utf-8"));

  let result;
  try {
    result = await callClaude();
  } catch (err) {
    console.error("Bite report update failed, leaving previous value in place:", err.message);
    process.exit(0); // non-fatal — keep yesterday's bite report rather than breaking the whole refresh
  }

  if (!result.localBiteReport) {
    console.error("Unexpected response shape, leaving previous value in place.");
    process.exit(0);
  }

  const dateISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  const updated = {
    ...existing,
    localBiteReport: result.localBiteReport,
    localBiteSource: `${result.localBiteSource} · Auto-refreshed via Claude API`,
    localBiteUpdated: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }),
  };

  await writeFile(OUT_PATH, JSON.stringify(updated, null, 2) + "\n");
  console.log("Bite report updated:", updated.localBiteUpdated);
}

main();
