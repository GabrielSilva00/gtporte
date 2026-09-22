import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
  // Porta propria, fora da faixa que o Vite escolhe sozinho (5173-5179).
  // Na 5173 o app dividia origem com outro PWA ja instalado nesta maquina,
  // e o service worker daquele projeto servia o proprio conteudo em vez
  // deste: a tela abria com o app errado e, depois, com CSS antigo.
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Sem service worker em desenvolvimento: senao o precache passa a
      // frente do dev server e as alteracoes nao aparecem.
      devOptions: { enabled: false },
      manifest: {
        name: 'GTPORTE Estudante',
        short_name: 'Estudante',
        theme_color: '#0F172A',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        // Recebe o Web Push (public/push-sw.js).
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api',
              expiration: { maxEntries: 100, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],

  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
})
