import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Application installable (PWA). `autoUpdate` : chaque déploiement remplace
    // le service worker silencieusement, la version suivante arrive au
    // prochain chargement — personne ne reste bloqué sur un vieux bundle.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mon board',
        short_name: 'Mon board',
        description: 'Tableau kanban, objectifs SMART, rappels et calendrier.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f6f9fc',
        theme_color: '#346ecd',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Précache du bundle seulement : les appels Supabase restent réseau
        // pur — aucune donnée n'est mise en cache par le service worker.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
      },
    }),
  ],
  server: {
    port: 5180,
    // En dev, les fonctions Vercel n'existent pas : on relaie /api vers la
    // production. Même projet Supabase des deux côtés, le jeton de session
    // reste donc valide.
    proxy: {
      '/api': { target: 'https://perso-board.vercel.app', changeOrigin: true },
    },
  },
})
