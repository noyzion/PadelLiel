/*
 * PadelLiel service worker: Web Push only (no offline caching, no fetch interception).
 *
 * Payload (JSON, built by the dispatcher): { id, title, body, url }.
 * Notifications open a path inside this site only; anything else falls back to /notifications.
 */

const FALLBACK_URL = '/notifications';

function safePath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return FALLBACK_URL;
  if (value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return FALLBACK_URL;
  return value;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === 'string' && data.title ? data.title : 'אימוני פאדל כוכב יאיר';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    lang: 'he',
    dir: 'rtl',
    tag: typeof data.id === 'string' ? data.id : undefined,
    data: { url: safePath(data.url) },
  };

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      // Let any open page refresh its unread counter.
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) client.postMessage({ type: 'notification-received' });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;

  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) await client.navigate(target);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
