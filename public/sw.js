const CACHE_NAME = 'powermatix-attendance-shell-v2';
const APP_SHELL = ['/', '/dashboard', '/offline', '/manifest.json', '/manifest.webmanifest', '/icon.svg', '/maskable-icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => response)
        .catch(async () => (await caches.match(event.request)) || caches.match('/offline') || caches.match('/')),
    );
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        return cached || caches.match('/dashboard') || caches.match('/');
      }),
  );
});

self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() ?? {
    title: 'PowerMatix',
    message: 'You have a new notification.',
    link: '/dashboard',
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || 'PowerMatix', {
      body: payload.message || payload.body || 'You have a new notification.',
      icon: '/icon.svg',
      badge: '/maskable-icon.svg',
      data: {
        link: payload.link || '/dashboard',
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/dashboard';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.includes(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        return existingClient.navigate(link);
      }
      return self.clients.openWindow(link);
    }),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'powermatix-attendance-sync') {
    event.waitUntil(self.registration.showNotification('PowerMatix is back online', {
      body: 'Attendance changes can now sync with the portal.',
      icon: '/icon.svg',
      data: { link: '/attendance' },
    }));
  }
});
