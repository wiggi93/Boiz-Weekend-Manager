import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'prompt' so the SW enters the "waiting" state on update; the React
      // app's onNeedRefresh callback then shows the in-app "neue Version"
      // pill instead of silently swapping the SW. Combined with
      // updateSW(true) on banner tap, this gives users a visible,
      // user-initiated update flow (which iOS PWAs sorely need).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Boiz Weekend Manager',
        short_name: 'Boiz',
        description: 'Jungs-Wochenende live tracken — Drinks, Spiele, Leaderboard',
        theme_color: '#0a0a0b',
        background_color: '#0a0a0b',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        lang: 'de',
        categories: ['lifestyle', 'social'],
        icons: [
          { src: 'pwa-64x64.png',  sizes: '64x64',  type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/_/],
        // Intentionally NOT setting skipWaiting/clientsClaim here — let the
        // new SW sit in "waiting" until the user taps the in-app banner,
        // which calls updateSW(true). That sequence is what lets us actually
        // show "neue Version" before swapping.
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Never cache PocketBase API/realtime — always fresh
            urlPattern: ({ url }) => url.host.startsWith('boiz-api.'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'static-assets',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  base: process.env.VITE_BASE ?? '/Boiz-Weekend-Manager/',
});
