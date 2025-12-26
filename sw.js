const CACHE_NAME = 'subway-timer-v1';
const urlsToCache = [
  '/SubwayTimer/',
  '/SubwayTimer/index.html',
  '/SubwayTimer/style.css',
  '/SubwayTimer/app.js',
  '/SubwayTimer/stations.js',
  '/SubwayTimer/manifest.json'
];

// 설치
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
  self.skipWaiting();
});

// 활성화
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 요청 가로채기
self.addEventListener('fetch', event => {
  // API 요청은 캐시하지 않음
  if (event.request.url.includes('swopenapi.seoul.go.kr')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
