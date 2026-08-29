import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Reader is the public root ("/"). Admin is a separate, noindex-protected route ("/admin").
// PWA manifest is scoped to the reader experience only — the admin shell is not installable.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Для тебя',
        short_name: 'Для тебя',
        description: 'Личная история, которая продолжается',
        theme_color: '#4A1B2F',
        background_color: '#FBF3EE',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // App-shell only offline support. Timeline content/media is fetched live from Supabase —
        // we deliberately do not try to cache the full (potentially tens-of-thousands-of-messages) history.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        navigateFallbackDenylist: [/^\/admin/],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    sourcemap: false,
    target: 'es2020',
  },
});
