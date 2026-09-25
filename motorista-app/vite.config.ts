import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'GTPORTE Motorista',
        short_name: 'Motorista',
        description: 'Viagem, check-in e mensagens do motorista do transporte universitário.',
        lang: 'pt-BR',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Recebe o Web Push (public/push-sw.js).
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            // So as consultas de dados (GET no PostgREST). Auth, storage e
            // as RPCs (POST) nao entram: o Workbox nem guarda POST, e a
            // sessao nao deve ficar num cache compartilhado.
            urlPattern: ({ url, request }) =>
              request.method === 'GET' && url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/v1/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              // Sinal fraco: em 4 s sem resposta usa o que ja tem.
              networkTimeoutSeconds: 4,
              // Um dia: cobre a viagem inteira sem internet. Apagado no logout.
              expiration: { maxEntries: 200, maxAgeSeconds: 24 * 3600 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Mapa do trajeto: os blocos ja vistos continuam aparecendo sem rede.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mapa',
              expiration: { maxEntries: 400, maxAgeSeconds: 14 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  envDir: path.resolve(__dirname, '..'),
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
