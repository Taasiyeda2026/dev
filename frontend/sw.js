const SW_VERSION = 'dashboard2026-v3';
const STATIC_CACHE = `${SW_VERSION}-static`;
const RUNTIME_CACHE = `${SW_VERSION}-runtime`;
const IMAGE_CACHE = `${SW_VERSION}-images`;

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './api.js',
  './state.js',
  './data-engine.js',
  './data-contracts.js',
  './manifest.webmanifest',
  './assets/logo.png',
  './assets/logo-dark.png',
  './assets/logo-mark.png',
  './assets/logo-white.png',
  './assets/favicon.ico',
  './assets/favicon-16.png',
  './assets/favicon-32.png',
  './assets/apple-touch-icon.png',
  './assets/og-image.png',
  './assets/login-bg-soft.png',
  './assets/avatar-admin.png',
  './assets/avatar-instructor.png',
  './assets/avatar-manager.png',
  './assets/courses-empty-state.png',
  './assets/dashboard-empty-state.png',
  './assets/illustration-activity.png',
  './assets/illustration-approvals.png',
  './assets/illustration-courses.png',
  './assets/illustration-instructors.png',
  './assets/requests-empty-state.png',
  './assets/splash-1290x2796.png',
  './assets/splash-1668x2388.png',
  './assets/splash-2048x2732.png',
  './assets/pwa/icon-72.png',
  './assets/pwa/icon-96.png',
  './assets/pwa/icon-128.png',
  './assets/pwa/icon-144.png',
  './assets/pwa/icon-152.png',
  './assets/pwa/icon-192.png',
  './assets/pwa/icon-384.png',
  './assets/pwa/icon-512.png',
  './assets/pwa/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, RUNTIME_CACHE, IMAGE_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

function isApiRequest(url) {
  return url.pathname.includes('/api') || url.searchParams.has('action');
}

function isNavigationRequest(request) {
  return request.mode === 'navigate' || request.destination === 'document';
}

async function networkFirstWithShellFallback(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok) {
      runtimeCache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (_) {
    const cached = await runtimeCache.match(request);
    if (cached) return cached;
    return caches.match('./index.html');
  }
}

async function staleWhileRevalidate(request) {
  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const cached = await runtimeCache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.ok) runtimeCache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) {
    networkFetch.catch(() => null);
    return cached;
  }

  const networkResponse = await networkFetch;
  if (networkResponse) return networkResponse;
  return caches.match(request);
}

async function cacheFirstImages(request) {
  const imageCache = await caches.open(IMAGE_CACHE);
  const cached = await imageCache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) imageCache.put(request, response.clone());
    return response;
  } catch (_) {
    return caches.match('./assets/logo.png');
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isApiRequest(url)) return;

  if (isNavigationRequest(request)) {
    event.respondWith(networkFirstWithShellFallback(request));
    return;
  }

  if (request.destination === 'image') {
    event.respondWith(cacheFirstImages(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});
