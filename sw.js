const CACHE_NAME = 'sit-down-v10';
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
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // MediaPipe wasm/model/data files are large runtime dependencies. Let the browser
  // fetch them directly instead of wrapping them in Cache Storage, which can stall
  // wasm initialization on some mobile browsers.
  if (requestUrl.pathname.includes('/vendor/mediapipe/')) return;

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
