// cron-worker/index.js
//
// Cloudflare Worker Cron Trigger — replaces the external cron-job.org ping
// that silently stopped firing around 2026-10-08 with no warning anywhere
// (see CLAUDE.md and .github/workflows/daily-refresh.yml for the history).
// This runs on Cloudflare's own scheduling infrastructure instead of a free
// third-party cron website, and — critically — a failed dispatch shows up
// as an error in the Cloudflare dashboard's Cron Triggers invocation log,
// rather than just vanishing the way cron-job.org's death did.
//
// All this does is POST to GitHub's workflow_dispatch API for
// daily-refresh.yml. Every bit of actual refresh logic (weather/tide fetch,
// the paid bite-report call, committing, deploying) lives entirely in that
// workflow — this Worker's only job is to kick it off on time. GitHub's own
// `schedule` trigger (08:13 UTC, in daily-refresh.yml) stays wired up as a
// same-day fallback in case this Worker ever fails silently too.
//
// Deploy (run these locally, never in a shared/remote session — the GitHub
// PAT below should never be pasted into a chat transcript):
//   wrangler login
//   wrangler secret put GITHUB_PAT
//     — paste a fine-grained PAT scoped to ONLY this repo, with
//       "Actions: Read and write" permission and nothing else.
//   wrangler deploy
//
// Sanity-check without waiting for the schedule:
//   curl -X POST https://<your-worker-subdomain>.workers.dev/trigger

const OWNER = "djblackjr";
const REPO = "331-fishing-report";
const WORKFLOW = "daily-refresh.yml";

async function dispatch(env) {
  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_PAT}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "331-fishing-report-cron-worker",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  // GitHub returns 204 No Content on success. Throwing on a non-2xx makes
  // the invocation show up as a failed run in Cloudflare's dashboard
  // instead of silently succeeding on a bad dispatch (a stale/revoked PAT,
  // a renamed workflow file, etc.) — the exact failure mode that let the
  // old cron-job.org ping's death go unnoticed for 12 days.
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`workflow_dispatch failed: ${res.status} ${body}`);
  }
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env));
  },

  // Lets you fire the dispatch on demand (e.g. via curl) to confirm the
  // Worker and its secret are wired up correctly, without waiting for the
  // actual cron schedule.
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/trigger") {
      try {
        await dispatch(env);
        return new Response("dispatched\n", { status: 200 });
      } catch (err) {
        return new Response(`${err.message}\n`, { status: 502 });
      }
    }
    return new Response(
      "331-fishing-report cron worker — POST /trigger to fire the daily refresh on demand.\n",
      { status: 200 }
    );
  },
};
