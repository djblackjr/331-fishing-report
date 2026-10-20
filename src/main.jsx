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
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  })
}
