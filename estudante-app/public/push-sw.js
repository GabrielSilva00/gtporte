/*
 * Importado pelo service worker gerado pelo vite-plugin-pwa
 * (workbox.importScripts em vite.config.ts). Recebe o Web Push enviado
 * pela Edge Function `enviar-push` e abre o app ao tocar na notificacao.
 */
self.addEventListener('push', (event) => {
  let dados = {}
  try {
    dados = event.data ? event.data.json() : {}
  } catch {
    dados = { titulo: 'GTPORTE', corpo: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(dados.titulo || 'GTPORTE', {
      body: dados.corpo || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: dados.id || undefined,
      data: { url: '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) if ('focus' in c) return c.focus()
      return self.clients.openWindow('/')
    }),
  )
})
