import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/musculation/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Health Coach',
        short_name: 'Coach',
        description: 'Coach sportif personnalisé',
        lang: 'fr',
        start_url: '/musculation/',
        display: 'standalone',
        background_color: '#09090b',
        theme_color: '#09090b',
        icons: [
          { src: '/musculation/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/musculation/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          // Variantes maskable : contenu dans la zone de sécurité de 80% pour
          // les masques d'icône Android (cercle, squircle…).
          { src: '/musculation/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/musculation/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // original.png (1,2 Mo) est l'artwork source, pas une ressource de
        // l'app — inutile de le précacher sur chaque appareil.
        globIgnores: ['icons/original.png'],
        // Skip waiting to activate new service worker immediately
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
