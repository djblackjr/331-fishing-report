import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

// GitHub Pages serves project sites at username.github.io/repo-name/, not at
// the root — without `base` set, all asset links (JS/CSS) would 404 because
// they'd be requested from the root instead of under /331-fishing-report/.
export default defineConfig({
  plugins: [react()],
  base: '/331-fishing-report/',
  build: {
    rollupOptions: {
      // Two-page site: the daily conditions SPA (index.html) and the
      // standalone Fishing Intelligence Atlas (atlas.html) — see docs/atlas.md.
      // Vite only bundles index.html by default; a multi-entry build needs
      // every HTML page listed explicitly here.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        atlas: fileURLToPath(new URL('./atlas.html', import.meta.url)),
      },
    },
  },
})
