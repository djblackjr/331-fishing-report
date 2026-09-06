# 331 Bridge Fishing Report

A daily fishing conditions app for the 331 Bridge / Choctawhatchee Bay area (Freeport, FL), covering 7 spots: 331 Bridge, Alaqua Bayou, Basin Bayou, LaGrange Bayou, Four Mile Creek, Hogtown Bayou, and Rocky Bayou.

## What this is
- React + Vite single-page app
- Main component: `src/App.jsx`
- Trip log data persists via `window.storage` (Claude artifact storage) — this only works when run as a Claude artifact, not on a plain static deploy. On GitHub Pages, the Trip Log tab's save/delete calls will silently fail (wrapped in try/catch), everything else works fine.

## Hosting: GitHub Pages
This repo is hosted on GitHub Pages, not Netlify — `.github/workflows/deploy-pages.yml` builds the app (`npm run build`) and publishes `dist/` on every push to `main`, no separate hosting account or manual redeploy step involved. `daily-refresh.yml`'s automated commits also dispatch this workflow directly (see the "Trigger Pages deploy" step) since a push made with the workflow's default token doesn't trigger other workflows on its own.

- Live site: `https://djblackjr.github.io/331-fishing-report/`
- Enable/inspect: repo Settings → Pages (source: GitHub Actions)
- `vite.config.js` sets `base: '/331-fishing-report/'` to match Pages' project-site URL structure — change this if the repo is ever renamed or moved to a custom domain (in which case `base` becomes `/`).

**This code must live in Git, not just in a chat.** Every time you get an updated version of a file from Claude, replace it in this repo and commit it:
```bash
git add <file>
git commit -m "Update <what changed>"
git push
```
Once it's committed, it's permanent — you can always `git log` and roll back to any prior day's version.

## Daily update workflow
`.github/workflows/daily-refresh.yml` runs this automatically — no manual Claude-chat step needed day to day. On its schedule (plus an external cron-job.org ping, since GitHub's native cron proved unreliable for this repo) it:
1. Fetches live weather/tide/forecast data (`scripts/update-conditions.mjs`) — free, no API key needed.
2. Refreshes the "What's Being Caught" bite report (`scripts/update-bite-report.mjs`) — the one piece that calls the Anthropic API, since it genuinely reads and paraphrases external fishing-report sites. Requires the `ANTHROPIC_API_KEY` repo secret to have a funded Anthropic account; the workflow now fails loudly (red run + GitHub's normal failure notification) if that call errors out, instead of silently going stale.
3. Rebuilds the Atlas intelligence packet and commits+pushes `conditions.json` if anything changed, which triggers the GitHub Pages deploy above.

Per-location "Today's advice" and the bay-wide daily summary are computed client-side in `App.jsx` from that same data (`getTodaysCall`/`getDailySummary`) — no API call needed for those.

## Claude Code transfer setup
To transfer this repo into Claude Code and keep the daily refresh working:

1. Create a local `.env` file with your Anthropic API key:
```bash
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY
```

2. Make sure `.env` is ignored by Git. This repo already includes `.gitignore` with `.env`.

3. Install dependencies and verify locally:
```bash
npm install
node scripts/update-conditions.mjs
node scripts/update-bite-report.mjs
```

4. If you use GitHub Actions for daily refresh, configure these repository secrets:
- `ANTHROPIC_API_KEY`
- `DEPLOY_TOKEN`

5. For local preview in Claude Code, run:
```bash
npm run dev
```

6. To build the app for production, run:
```bash
npm run build
```

## What the app now compares
- `NWS` — official U.S. forecast
- `Open-Meteo` — free global model forecast

(A third source, Yr.no, was tried and dropped — its API only returns forward-looking timeseries entries, so by the time the daily refresh ran, there was often no remaining "today" data left to compute a high/low from.)

## Fishing Intelligence Atlas
An interactive map (Leaflet + GeoJSON, SQLite-backed) at `/atlas.html`, separate from this daily-conditions app. Phase 1 pilot covers Jolly Bay with a placeholder location framework — see [docs/atlas.md](docs/atlas.md) for the architecture, database, and how to add/edit locations.

## How to inspect the change
- `git diff`
- `git status`
- `git log --oneline`
