/* Service Worker — Web Push + clique na notificação (abre o recurso certo).
   Sem cache de páginas: dados comerciais não ficam guardados no aparelho. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Nova notificação', body: '' };
  }
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/notificacoes';
  event.waitUntil(
    self.registration.showNotification(data.title || 'Nova notificação', {
      body: data.body || '',
      icon: '/icon.png',
      badge: '/icon.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      requireInteraction: data.priority === 'CRITICAL',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/notificacoes', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.startsWith(self.location.origin) && 'focus' in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
