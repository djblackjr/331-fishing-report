# 331 Bridge Fishing Report

A daily fishing conditions app for the 331 Bridge / Choctawhatchee Bay area (Freeport, FL), covering 7 spots: 331 Bridge, Alaqua Bayou, Basin Bayou, LaGrange Bayou, Four Mile Creek, Hogtown Bayou, and Rocky Bayou.

## What this is
- React + Vite single-page app
- Main component: `src/App.jsx`
- Trip log data persists via `window.storage` (Claude artifact storage) — this only works when run as a Claude artifact, not on a plain Netlify deploy. On Netlify, the Trip Log tab's save/delete calls will silently fail (wrapped in try/catch), everything else works fine.

## How to keep this alive (read this before you lose it again)

**1. This code must live in Git, not just in a chat.**
Every time you get an updated version of `App.jsx` from Claude, replace the file in this repo and commit it:
```bash
git add src/App.jsx
git commit -m "Update conditions for <date>"
git push
```
Once it's committed, it's permanent — you can always `git log` and roll back to any prior day's version.

**2. Connect this repo to Netlify (one-time setup).**
- Go to https://app.netlify.com → "Add new site" → "Import an existing project"
- Connect GitHub → select `djblackjr/331-fishing-report`
- Build command: `npm run build`
- Publish directory: `dist`
- Deploy

Once connected, **every `git push` automatically triggers a new live deploy.** No manual redeploying, no losing the link.

## Daily update workflow
The `CONDITIONS`, `FORECAST`, and the "What's Being Caught" block at the top of `App.jsx` are the only parts meant to change day-to-day. Everything else (species notes, fishing strategy stops, regulations, bait rigs) is evergreen reference content.

Each morning:
1. Ask Claude (a fresh chat, or this one) to look up current WeatherBug conditions for Freeport, FL 32459 and current local Choctawhatchee Bay fishing reports.
2. Ask it to update `CONDITIONS`, `FORECAST`, and `localBiteReport` in `App.jsx` accordingly.
3. Commit and push the updated file (step 1 above). Netlify redeploys automatically.

Because a new Claude chat has no memory of past sessions, always paste in either this README or the current `App.jsx` so it has full context — don't assume it remembers building this.

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
- `Yr.no` — free independent forecast from the Norwegian Meteorological Institute

## How to inspect the change
- `git diff`
- `git status`
- `git log --oneline`
