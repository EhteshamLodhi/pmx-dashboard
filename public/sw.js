const CACHE_NAME = 'powermatix-attendance-shell-v4';
const APP_SHELL = [
  '/',
  '/dashboard',
  '/offline',
  '/manifest.json',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/maskable-icon-512.png',
  '/badge-72.png',
];

function readPushPayload(event) {
  if (!event.data) {
    return {
      title: 'PowerMatix',
      message: 'You have a new notification.',
      body: 'You have a new notification.',
      category: 'admin',
      type: 'admin',
      url: '/dashboard',
      link: '/dashboard',
    };
  }

  try {
    const jsonPayload = event.data.json();
    if (jsonPayload && typeof jsonPayload === 'object') {
      return jsonPayload;
    }
  } catch (error) {
    console.error('Unable to parse push payload as JSON', error);
  }

  try {
    const textPayload = event.data.text();
    if (textPayload) {
      return {
        title: 'PowerMatix',
        message: textPayload,
        body: textPayload,
        category: 'admin',
        type: 'admin',
        url: '/dashboard',
        link: '/dashboard',
      };
    }
  } catch (error) {
    console.error('Unable to parse push payload as text', error);
  }

  return {
    title: 'PowerMatix',
    message: 'You have a new notification.',
    body: 'You have a new notification.',
    category: 'admin',
    type: 'admin',
    url: '/dashboard',
    link: '/dashboard',
  };
}

function notificationVibration(category) {
  if (category === 'approval') return [300, 120, 300, 120, 600];
  if (category === 'attendance') return [250, 100, 250, 100, 250];
  return [200, 100, 200, 100, 400];
}

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
  const payload = readPushPayload(event);

  event.waitUntil(
    self.registration.showNotification(payload.title || 'PowerMatix', {
      body: payload.message || payload.body || 'You have a new notification.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      requireInteraction: payload.category === 'approval' || payload.category === 'attendance' || payload.type === 'approval' || payload.type === 'attendance',
      renotify: true,
      tag: payload.tag || payload.notificationId || payload.category || payload.type || 'powermatix-notification',
      timestamp: Date.now(),
      vibrate: payload.vibrate || notificationVibration(payload.category || payload.type),
      data: {
        url: payload.url || payload.link || '/dashboard',
        link: payload.url || payload.link || '/dashboard',
        notificationId: payload.notificationId,
        type: payload.type || payload.category,
      },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.url || event.notification.data?.link || '/dashboard';
  const targetUrl = new URL(link, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.includes(self.location.origin));
      if (existingClient) {
        existingClient.focus();
        return existingClient.navigate(targetUrl);
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'powermatix-attendance-sync') {
    event.waitUntil(self.registration.showNotification('PowerMatix is back online', {
      body: 'Attendance changes can now sync with the portal.',
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      vibrate: notificationVibration('attendance'),
      data: { link: '/attendance' },
    }));
  }
});
