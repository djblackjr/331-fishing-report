# CLAUDE.md

Context for any Claude session working in this repo — local, cloud, or phone. Sessions don't share conversations; they share this file and git. If you learn something a future session would need, put it here (or in `docs/`) and commit it.

## Who and how

- Danny runs this solo as a hobby project. He's been burned by losing context between sessions, so **durable changes go into git, not just chat**. Commit and push finished work — an unpushed change in a cloud session is invisible to every other session.
- Multiple sessions may work on this repo (Mac + phone/cloud). **`git pull` before starting**, push when done, and don't edit the same thing from two sessions at once.
- For multi-phase work, commit after each phase (clean rollback points), with messages that explain *why*.
- Match the existing stack (Node, vanilla JS, Vite). Don't introduce Python or a second toolchain for one script.
- New large features ship as standalone/decoupled modules first (like the Atlas), with a light link from the main app — not merged into `App.jsx` until proven.

## What the app is

331 Bridge Fishing Report — daily fishing conditions for spots around Choctawhatchee Bay / Freeport, FL. Repo `djblackjr/331-fishing-report`.

- `src/App.jsx` — the whole main UI (one large React component). Evergreen content lives inline; per-location advice and the daily summary are computed client-side (`getTodaysCall`, `getDailySummary`, `getBestWindow`, `getEveningWindow`).
- Mobile-first: Danny mainly uses it on an iPhone (often as a home-screen app). Report/Trip Log/Atlas/Share live in a fixed bottom tab bar padded with `env(safe-area-inset-*)`. Keep tap targets ≥44px and check new UI at phone width.
- `window.storage` (used by the Trip Log) is a Claude-artifact API; `src/main.jsx` shims it onto `localStorage` for the real site. On iOS, home-screen and Safari storage are separate.
- `src/data/conditions.json` — daily data blob, overwritten by automation. Don't hand-edit except to test.
- `atlas.html` + `src/atlas/` — the Fishing Intelligence Atlas, a separate Leaflet map page (no React). Full reference: **`docs/atlas.md`**.

## Deploy — trust the workflows, not the README

`README.md`'s Netlify instructions are stale. The real pipeline is **GitHub Actions → GitHub Pages**:

- `.github/workflows/daily-refresh.yml` runs `update-conditions.mjs` (NWS + Open-Meteo + Yr.no, averaged), `update-bite-report.mjs` (paid Claude API call, once per day unless forced), and `npm run atlas:intelligence`; commits changed data; then dispatches `deploy-pages.yml` with the built-in token (a bot push alone doesn't trigger other workflows). The old `DEPLOY_TOKEN` PAT is gone — it expired and silently broke deploys.
- Triggers: a **Claude Code Remote Routine** (`331-fishing-report-refresh-backstop`, owned by Yvonne's account — `list_triggers`/`fire_trigger` via the `claude-code-remote` MCP tools to inspect/manage it) fires daily at 08:25 UTC, checks `gh run list --repo djblackjr/331-fishing-report --workflow=daily-refresh.yml` for a completed run in the last 20 hours, and dispatches one itself if none exists. This replaced a planned **Cloudflare Worker Cron Trigger** (`cron-worker/index.js` + `wrangler.jsonc` are still in the repo, unused) that was written 2026-10-20 but never deployed — it needed `wrangler login` + a GitHub PAT set up locally by Danny, which still hadn't happened two weeks later when this was revisited on 2026-11-04, so the Routine was set up instead since it needs zero action from Danny. History: an external cron-job.org ping used to fill this role before either of those, believed primary because GitHub's native schedule "proved unreliable" — a 2026-10-20 run-history check found the opposite: cron-job.org fired daily right on time until it silently stopped on Oct 8 (coinciding with `workflow_dispatch` gaining a `force_bite_report` input), while GitHub's native schedule kept firing every day throughout, just 4-10h late (12:00-18:13 UTC instead of 08:13). The in-repo `schedule` cron (08:13 UTC) stays as a second-layer fallback regardless. If investigating a cron/timing issue here again: check actual run history AND `list_triggers`'s `last_run` before trusting prior comments about which trigger is "the reliable one" — this is now the second time the "primary" trigger quietly wasn't the one actually firing. **As of 2026-11-13 the Routine is broken in two ways (fix pending Danny's OK to edit it):** (1) it has no GitHub source attached, so every run gets `HTTP 403: GitHub access to this repository is not enabled` yet still reports `SUCCEEDED`. Compare the working `30a-surf-report-refresh-backstop` routine, which lists its repo under `sources`. (2) Its "completed a run in the last 20 hours" rule would skip anyway, because the late native cron (~16:00 UTC) lands only ~16h before the 08:25 check. It should check for a run created since 00:00 UTC today. Net effect: every run since 11-04 was native-cron, and the site shows the previous day's data until ~8 AM–noon Central.
- `deploy-pages.yml` builds on every push to `main`. `vite.config.js` sets `base: '/331-fishing-report/'` (Pages project-site path) — don't remove it.
- "Today's update didn't show up" checklist: did daily-refresh run → did it detect a change → did the deploy dispatch succeed → did the bite-report step fail (it fails the run last, on purpose).

## Atlas gotchas

- `db/atlas.db` (SQLite, committed) is the source of truth, but the map reads **`public/atlas/geojson/*.geojson`**, generated by `npm run atlas:export`. `predev`/`prebuild` run the export automatically; still re-run it and commit the geojson after a DB edit so the diff is reviewable.
- After an export, sanity-check that each layer's feature count in its geojson matches what `layers.json` advertises — a past export silently zeroed `dock_zones`.
- **Point coordinates must be verified against satellite imagery** before being trusted. Many eyeballed points (from chart tiles or aerials) turned out to sit on land or 100–400 m off. Check with an Esri World Imagery crop (`server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=...`, no key) and confirm the point lands where it should. If no real feature exists nearby, delete rather than re-guess.
- **Never invent fishing data** (species, tides, lures, seasons). Leave fields blank until Danny or a real source supplies them.

## Service Worker (`public/sw.js`) gotchas

- **`cache.match(request)` needs `{ ignoreVary: true }`, always.** A real browser-issued request's headers (especially for `crossorigin` script/link tags) don't reliably line up with whatever headers were present when this file's own `fetch()` calls originally cached that URL, and GitHub Pages' CDN does send `Vary` on static assets — so without `ignoreVary`, `cache.match()` silently returns no hit on a URL that's genuinely in the cache, even though `cache.match(url_as_a_plain_string)` finds it fine. This is single-origin app with exactly one cache; Vary-based response selection was never doing anything useful here, only breaking matches. Cost real debugging time once already (2026-10-26, see git log "Fix the Atlas effectively never working offline") — don't re-derive this from scratch, just keep the option on every `match()` call.
- **A page is only reliably usable offline if `install` actually precaches it** — don't assume the generic "cache opportunistically on first successful fetch" fetch handler covers a secondary page (anything besides the root) for a user who's never visited it online yet. `atlas.html` plus its real current-build JS/CSS (extracted from the HTML at install time, since Vite hashes filenames per build — see `extractAssetUrls()`) and its actual geodata (`precacheAtlasData()`, mirroring what `src/atlas/main.js`'s `init()` fetches at runtime) are all precached now. Adding a third page/view later means giving it the same treatment, not assuming the generic handler will quietly make it work.
- To debug what this file is actually doing (Playwright's `page.on('console')` does **not** reliably surface a Service Worker's own `console.log` output in this environment): kill the dev/preview server entirely after one normal visit, then navigate fresh from the same browser profile — a real connection failure, not Playwright's `context.setOffline()` (which did not reliably simulate offline for Service-Worker-internal `fetch()` calls when tried here). A `self.addEventListener("fetch", ...)` handler that pushes into an in-memory array, exposed via a special debug route the SW itself responds to (e.g. a path ending `/sw-debug`), is a reliable way to inspect what actually happened — console capture isn't.

## Open threads

- **`cron-worker/` + `wrangler.jsonc` are superseded, not active.** The Claude Code Remote Routine (see Deploy section above) is what's actually running the backstop dispatch now. These files are a working, tested-but-undeployed alternative if Danny would rather not depend on Claude's routine infrastructure — safe to deploy instead (same `wrangler login` / `wrangler secret put GITHUB_PAT` / `npm run cron:deploy` steps as before) or safe to delete if the Routine is working out. Don't treat their presence as evidence they're doing anything.
- Dock pins at Four Mile Creek and Hogtown Bayou haven't been imagery-audited yet (the Basin and Alaqua ones were badly off).
- Jolly Bay locations lack species/tide/lure/season data, so they can't become dashboard locations yet. Bunker Cove is a known-good flats spot per Danny.
- No public boat ramp or kayak launch exists on Jolly Bay itself. This was checked by name search, GNIS, satellite imagery, and OSM tags, so don't re-research it. Only Danny's local knowledge or a field visit would change this.
