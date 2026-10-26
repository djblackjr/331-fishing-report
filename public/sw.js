// Offline support for the GitHub Pages project site.
// This file is served at /331-fishing-report/sw.js, so relative URLs stay
// inside the repository instead of leaking to the github.io domain root.
//
// v5: fixes atlas.html effectively never working offline — the exact "no
// signal out on the water" case this file exists for. Three separate
// issues combined to make the whole page look like it had vanished:
//
// 1. Only the root document was ever precached at install time. A user who
//    tapped the Atlas tab before the browser had successfully fetched
//    atlas.html at least once fell through the navigate handler's catch,
//    which unconditionally served the cached ROOT document in its place —
//    URL bar says atlas.html, but the main Report app renders instead, no
//    error, nothing to suggest anything went wrong. Fixed by precaching
//    atlas.html itself (and, since Vite content-hashes every JS/CSS bundle
//    filename per build, extracting and precaching both pages' *actual*
//    current-build script/style URLs at install time too — see
//    extractAssetUrls() below).
//
// 2. Even once atlas.html's JS/CSS were genuinely in the cache, every one
//    of those requests still failed: cache.match(request) — passing the
//    real Request object, as every example of this pattern online does —
//    returned no match, while cache.match(request.url) (a plain string)
//    found the exact same entry fine. That's a Vary-header mismatch: a
//    response cached with Vary set only matches a later request whose
//    Vary-named headers are identical to the one that stored it, and a
//    real browser-issued `<script crossorigin>` request's headers don't
//    line up with the plain fetch() this file's install step used to
//    populate the cache. GitHub Pages' CDN sends Vary headers on static
//    assets, so this reproduces for real, not just in local dev. Fixed by
//    matching with `{ ignoreVary: true }` everywhere — there's exactly one
//    cache for this whole single-origin app, so Vary-based response
//    selection was never buying anything here, only silently breaking
//    matches.
//
// 3. Fixing 1 and 2 got the Atlas page and its code loading offline, but
//    with an empty map: the actual geodata (layers.json + each layer's
//    .geojson) was only ever cached by the "prefer network" handler below,
//    which only populates the cache *after* a successful fetch — nothing
//    to fall back to on a visit that's offline from the start. Fixed by
//    precacheAtlasData() fetching and caching that same data (mirroring
//    exactly what src/atlas/main.js's init() fetches at runtime) during
//    install too.
//
// Confirmed all three by killing the dev server after one normal visit to
// the root page only, then navigating fresh (a profile that had never
// loaded atlas.html) straight to atlas.html: before the fix, page title
// came back "331 Bridge Fishing Report" (wrong page, silently swapped in);
// after, "Fishing Intelligence Atlas — Jolly Bay" with its map, filters,
// and real location markers rendering normally, fully offline.
const CACHE_NAME = "331-fishing-report-v5";
const APP_ROOT = new URL("./", self.location.href).href;
const SHELL_DOCUMENTS = [APP_ROOT, new URL("atlas.html", APP_ROOT).href];
const APP_SHELL_EXTRA = [
  new URL("manifest.json", APP_ROOT).href,
  new URL("icon.svg", APP_ROOT).href,
];

// Vite content-hashes every JS/CSS bundle filename on each build (e.g.
// assets/atlas-BecW6HXf.js), so there's no fixed list of asset URLs to
// hardcode here — and no build step in this project to generate one.
// Instead, fetch each shell document at install time and pull the real
// <script src>/<link href> references straight out of its HTML, so both
// pages' actual current-build bundles get precached regardless of what
// this build's hashes happen to be.
async function extractAssetUrls(docUrl) {
  const html = await fetch(docUrl).then((r) => r.text());
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], docUrl).href;
    if (url.startsWith(APP_ROOT) && /\.(js|css)$/.test(url)) urls.add(url);
  }
  return [...urls];
}

// The Atlas's own code (never cached) could load fine offline while still
// showing an empty map, since its geodata was only ever cached by the
// "prefer network" handler below — which only populates the cache *after*
// a successful fetch. A page that's never been opened online yet would
// have nothing to fall back to. Mirrors exactly what src/atlas/main.js's
// init() fetches at runtime: layers.json, then every layer with features
// to actually plot. Best-effort and non-blocking — a user who's never once
// had a signal gets the app shell with an empty map rather than nothing,
// same as main.js's own handling of a failed/missing layer.
async function precacheAtlasData(cache) {
  const layersUrl = new URL("atlas/layers.json", APP_ROOT).href;
  await cache.add(layersUrl);
  const registry = await fetch(layersUrl).then((r) => r.json());
  const geojsonUrls = registry
    .filter((layer) => layer.featureCount > 0)
    .map((layer) => new URL(`atlas/geojson/${layer.key}.geojson`, APP_ROOT).href);
  await cache.addAll(geojsonUrls);
  // Optional packet — main.js already treats a missing one as non-fatal.
  await cache.add(new URL("atlas/intelligence.json", APP_ROOT).href).catch(() => {});
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll([...SHELL_DOCUMENTS, ...APP_SHELL_EXTRA]);
      // Best-effort: one document's asset extraction failing (e.g. a
      // transient fetch error) shouldn't block install for the other —
      // the generic fetch handler below still opportunistically caches
      // assets as they're actually requested, same as before this file
      // existed in any form.
      for (const doc of SHELL_DOCUMENTS) {
        try {
          await cache.addAll(await extractAssetUrls(doc));
        } catch {
          /* best-effort precache only */
        }
      }
      try {
        await precacheAtlasData(cache);
      } catch {
        /* best-effort precache only — see precacheAtlasData's own comment */
      }
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("331-fishing-report-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// A minimal, on-brand page for a navigation that's genuinely uncached (not
// one of the precached shell documents, and never successfully visited
// online either) — returned instead of silently substituting a different
// page's content under the requested URL, which is exactly how this file's
// original fallback made Atlas look "missing" instead of just offline.
function offlineFallback() {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>Offline</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#0a1f14;color:#d1f0e0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;text-align:center;padding:24px}
a{color:#4ade80}</style></head>
<body><div><p>This page hasn't been saved for offline use yet.</p><p><a href="./">Go to the main report</a></p></div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html" } }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(
              caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
            );
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          // ignoreVary: true — see the file-header note above. Without
          // this, a real cached entry for this exact URL is invisible to
          // match() whenever the live request's headers don't bit-for-bit
          // match whatever headers were present the moment it was cached.
          const cached = await cache.match(request, { ignoreVary: true });
          if (cached) return cached;
          // Root is a reasonable substitute for itself if its own precache
          // entry somehow went missing; any other page silently swapped
          // for a different one is worse than an honest "not cached yet".
          if (request.url === APP_ROOT) {
            const rootCached = await cache.match(APP_ROOT, { ignoreVary: true });
            if (rootCached) return rootCached;
          }
          return offlineFallback();
        })
    );
    return;
  }

  // Atlas exports keep stable filenames, so prefer the network while online.
  // Without this, a previously cached empty layer can remain empty after a
  // later data deployment.
  if (
    url.pathname.includes("/atlas/") &&
    (url.pathname.endsWith(".json") || url.pathname.endsWith(".geojson"))
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        try {
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response.clone());
          return response;
        } catch {
          return (await cache.match(request, { ignoreVary: true })) || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreVary: true });
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    })
  );
});
