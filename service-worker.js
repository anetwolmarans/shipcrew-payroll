/**
 * service-worker.js — Makes the app work offline.
 *
 * PLAIN ENGLISH: the first time the app is opened online, this worker saves a
 * copy of every app file inside the browser ("pre-caching"). From then on the
 * app opens instantly and works fully offline — even weeks later at sea.
 * Live data still comes from Firebase when online; anything created offline
 * waits in the sync queue (see js/core/sync.service.js).
 *
 * UPDATES: when you deploy a new version, change SW_VERSION in js/config.js
 * AND CACHE_NAME below. Browsers then fetch fresh files and the app offers
 * an "Update & reload" prompt.
 */
const CACHE_NAME = 'shipcrew-v2.0.2-phase2';

/* Every file the app needs to start and run (the "app shell"). */
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './offline.html',
  './css/styles.css',
  './js/main.js',
  './js/config.js',
  './js/firebase-config.js',
  './js/core/idb.js',
  './js/core/security.js',
  './js/core/time.js',
  './js/core/events.js',
  './js/core/permissions.js',
  './js/core/firebase.service.js',
  './js/core/audit.service.js',
  './js/core/store.js',
  './js/core/auth.service.js',
  './js/core/sync.service.js',
  './js/core/ui.js',
  './js/core/router.js',
  './js/core/operations.service.js',
  './js/screens/login.screen.js',
  './js/screens/lock.screen.js',
  './js/screens/crew/home.screen.js',
  './js/screens/admin/layout.js',
  './js/screens/admin/dashboard.screen.js',
  './js/screens/admin/crew.screen.js',
  './js/screens/admin/vessels.screen.js',
  './js/screens/admin/trips.screen.js',
  './js/screens/admin/attendance.screen.js',
  './js/screens/admin/users.screen.js',
  './js/screens/admin/devices.screen.js',
  './js/screens/admin/audit.screen.js',
  './js/screens/admin/settings.screen.js',
  './js/screens/admin/statutory.screen.js',
  './js/screens/admin/roadmap.screen.js',
  './js/screens/admin/module.screen.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/* Network with a short timeout, falling back to the cached app shell. */
async function networkFirstForNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 4000));
    const fresh = await Promise.race([fetch(request), timeout]);
    if (fresh && fresh.ok) {
      cache.put('./index.html', fresh.clone());
      return fresh;
    }
  } catch {}
  const cached = (await cache.match('./index.html')) || (await cache.match(request));
  if (cached) return cached;
  return (await cache.match('./offline.html')) || Response.error();
}

/* Cache first, then network (and fill the cache for next time). */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && fresh.ok && fresh.type === 'basic') {
    cache.put(request, fresh.clone());
  }
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // uploads are never cached here
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(networkFirstForNavigation(req));
    } else {
      event.respondWith(cacheFirst(req));
    }
    return;
  }

  // Cross-origin: only the Firebase SDK files from gstatic.com are cached
  // (static JavaScript needed to talk to Firebase offline-first installs).
  // Firestore/cloud endpoints are always left to the network layer.
  if (url.hostname.endsWith('gstatic.com')) {
    event.respondWith(cacheFirst(req));
  }
});
