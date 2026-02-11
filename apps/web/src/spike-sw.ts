// SPIKE: prep-5 — Custom service worker for offline-first PWA PoC
// This file is compiled by vite-plugin-pwa (injectManifest mode).
// Workbox injects the precache manifest at the self.__WB_MANIFEST marker.
// Production version will be built in Story 3.2.

/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { BackgroundSyncPlugin } from 'workbox-background-sync';

// SPIKE: prep-5 — Precache app shell assets (HTML, JS, CSS) from Vite build manifest
precacheAndRoute(self.__WB_MANIFEST);

// SPIKE: prep-5 — CacheFirst for static assets (images, fonts)
// Rarely change; serve from cache first. Styles excluded (handled by precache).
registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    request.destination === 'font',
  new CacheFirst({
    cacheName: 'static-assets',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 100,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// SPIKE: prep-5 — NetworkFirst for API GET requests
// Fresh data preferred; stale fallback when offline
registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: 'api-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60, // 1 hour
      }),
    ],
  })
);

// SPIKE: prep-5 — Background Sync for API POST requests (submission queue)
// Queue failed POST requests in IndexedDB, retry on connectivity restore
const bgSyncPlugin = new BackgroundSyncPlugin('submission-queue', {
  maxRetentionTime: 60 * 24 * 7, // 7 days (10,080 minutes)
});

registerRoute(
  ({ url, request }) =>
    url.pathname.startsWith('/api/') && request.method === 'POST',
  new NetworkOnly({
    plugins: [bgSyncPlugin],
  }),
  'POST'
);

// SPIKE: prep-5 — SW lifecycle: skip waiting on message from client
// (Prompt-to-reload pattern: client sends message after user clicks "Update")
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
