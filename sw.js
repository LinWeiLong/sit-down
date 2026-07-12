const CACHE_NAME = 'sit-down-v5';
const APP_SHELL = [
  './',
  './index.html',
  './src/styles/app.css',
  './src/js/debug-bootstrap.js',
  './vendor/vconsole/vconsole.min.js',
  './src/js/posture-math.js',
  './src/js/session-model.js',
  './src/js/app.js',
  './vendor/mediapipe/pose/pose.js',
  './vendor/mediapipe/camera_utils/camera_utils.js',
  './vendor/mediapipe/drawing_utils/drawing_utils.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
        return response;
      }).catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(event.request, response.clone()));
      return response;
    }))
  );
});