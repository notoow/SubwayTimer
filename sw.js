const CACHE_NAME = 'subway-timer-v5';
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

// 요청 가로채기 (네트워크 우선, 실패시 캐시)
self.addEventListener('fetch', event => {
  // API 요청은 캐시하지 않음
  if (event.request.url.includes('swopenapi.seoul.go.kr') ||
      event.request.url.includes('corsproxy.io') ||
      event.request.url.includes('allorigins.win')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 성공하면 캐시 업데이트
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패시 캐시에서 반환
        return caches.match(event.request);
      })
  );
});
