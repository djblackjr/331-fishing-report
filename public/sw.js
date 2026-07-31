// Offline support for the GitHub Pages project site.
// This file is served at /331-fishing-report/sw.js, so relative URLs stay
// inside the repository instead of leaking to the github.io domain root.

const CACHE_NAME = "331-fishing-report-v4";
const APP_ROOT = new URL("./", self.location.href).href;
const APP_SHELL = [
  APP_ROOT,
  new URL("manifest.json", APP_ROOT).href,
  new URL("icon.svg", APP_ROOT).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
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
          return (await cache.match(request)) || cache.match(APP_ROOT);
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
          return (await cache.match(request)) || Response.error();
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;

      const response = await fetch(request);
      if (response.ok) {
        event.waitUntil(cache.put(request, response.clone()));
      }
      return response;
    })
  );
});
