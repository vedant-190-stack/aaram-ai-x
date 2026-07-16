const CACHE_NAME = 'aarambh-cache-v1';
const STATIC_ASSETS = [
  '/',
  '/aarambh-ai-x.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

// Install Event - Cache Core Assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Fetch Event - Network First for APIs, Cache First for Static
self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/') || event.request.url.includes('api.open-meteo.com')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request)) // Fallback to cache if offline
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(response => response || fetch(event.request))
    );
  }
});
