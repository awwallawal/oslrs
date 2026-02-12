/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import {
  CacheFirst,
  StaleWhileRevalidate,
  NetworkOnly,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

// Current cache names — used by activate handler to clean stale versions
const CURRENT_CACHES = [
  'oslrs-static-v1',
  'oslrs-ml-models-v1',
  'oslrs-form-schemas-v1',
  'oslrs-api-forms-v1',
];

// 1. Precache app shell (vite-plugin-pwa injects manifest at build time)
precacheAndRoute(self.__WB_MANIFEST);

// 2. SPA navigation fallback — serve index.html for client-side routes
const navigationHandler = createHandlerBoundToURL('/index.html');
registerRoute(
  new NavigationRoute(navigationHandler, {
    denylist: [/^\/api\//, /^\/sw\.js$/],
  })
);

// 3. CacheFirst: Static assets (images, fonts) — 30 days, max 100 entries
registerRoute(
  ({ request }) =>
    request.destination === 'font' || request.destination === 'image',
  new CacheFirst({
    cacheName: 'oslrs-static-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60,
      }),
    ],
  })
);

// 4. CacheFirst: @vladmandic/human ML models from CDN (~2MB, rarely change) — 90 days, max 20 entries
registerRoute(
  ({ url }) =>
    url.origin === 'https://cdn.jsdelivr.net' &&
    url.pathname.includes('@vladmandic/human/models'),
  new CacheFirst({
    cacheName: 'oslrs-ml-models-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 90 * 24 * 60 * 60,
      }),
    ],
  })
);

// 5. StaleWhileRevalidate: Form schemas — 7 days, max 30 entries
registerRoute(
  ({ url }) => /\/api\/v1\/forms\/[\w-]+\/render$/.test(url.pathname),
  new StaleWhileRevalidate({
    cacheName: 'oslrs-form-schemas-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

// 6. StaleWhileRevalidate: Published forms list — 7 days
registerRoute(
  ({ url }) => url.pathname === '/api/v1/forms/published',
  new StaleWhileRevalidate({
    cacheName: 'oslrs-api-forms-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 5,
        maxAgeSeconds: 7 * 24 * 60 * 60,
      }),
    ],
  })
);

// 7. NetworkOnly: Auth endpoints — NEVER cache credentials
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/auth'),
  new NetworkOnly()
);

// 8. NetworkOnly: Non-GET requests — mutations handled by IndexedDB queue (Story 3.3)
registerRoute(
  ({ request }) => request.method !== 'GET',
  new NetworkOnly()
);

// 9. Skip waiting on user request (triggered by update banner refresh button)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 10. Clean up old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith('oslrs-') && !CURRENT_CACHES.includes(key)
          )
          .map((key) => caches.delete(key))
      )
    )
  );
});
