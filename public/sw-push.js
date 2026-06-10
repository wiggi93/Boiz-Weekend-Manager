// Web-Push handlers, pulled into the generated service worker via
// workbox `importScripts`. Shows incoming pushes and deep-links into the
// app on tap (e.g. straight to the Challenges tab of the right event).

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || 'Boiz Weekend Manager 🍺';
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: data.tag || undefined,           // collapses duplicate notifications
    data: { url: data.url || '/' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // App already open → focus it and let it navigate in-place (no reload).
    for (const client of all) {
      if ('focus' in client) {
        await client.focus();
        client.postMessage({ type: 'push-navigate', url });
        return;
      }
    }
    // Not open → launch with the deep link in the URL.
    await self.clients.openWindow(url);
  })());
});
