import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// App.jsx was written against window.storage, which only exists inside a
// Claude artifact. On the real Pages site it was undefined, so the Trip Log
// and "last viewed spot" silently never saved. Back it with localStorage.
// Note: on iPhone, the home-screen app and Safari keep separate storage.
if (!window.storage) {
  window.storage = {
    get: async (key) => ({ value: localStorage.getItem(key) }),
    set: async (key, value) => { localStorage.setItem(key, value) },
  }
}
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Registers the offline service worker so the report still opens with
// this morning's data even without a signal out on the water.
//
// A service worker only checks for a new sw.js on navigation, by default,
// and even then can sit on a stale version for a while — on 2026-10-27
// this cost real user-visible staleness: two shipped fixes (scroll-to-top,
// Atlas offline support) were both live on the server but still invisible
// on an already-open device until the Service Worker was forced to
// update. Two pieces close that gap: `reg.update()` explicitly checks for
// a new sw.js immediately on every load instead of waiting on the
// browser's own lazy timing, and reloading once when a NEW worker
// actually takes over (controllerchange) ensures the page's already-
// loaded JS doesn't keep running stale against a cache that just changed
// out from under it. Guarded by `hadController` so this never fires an
// unwanted reload on a page's very first-ever visit (where there was no
// prior controller to replace) — only on a genuine version change.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || refreshing) return
    refreshing = true
    window.location.reload()
  })

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
      .then((reg) => reg.update())
  })
}
