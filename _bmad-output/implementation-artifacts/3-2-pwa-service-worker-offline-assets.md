# Story 3.2: PWA Service Worker & Offline Assets

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Enumerator,
I want the survey form to load even when I have no internet access,
So that I can work in remote areas without interruption.

## Dependencies

- Story 3.1 (Native Form Renderer & Dashboard) — In Review (all 9 tasks complete, 104 tests pass)
- prep-5 (Service Worker & IndexedDB Spike) — Complete (spike-sw.ts, offline-db.ts, Dexie schema, SpikeOfflinePage PoC)
- prep-4 (Playwright Framework Setup) — Complete

**Blocks:** Story 3.3 (Offline Queue & Sync Status UI), Story 3.4 (Idempotent Submission Ingestion)

## Acceptance Criteria

### AC3.2.1: Offline App Shell Loading

**Given** a device that has previously loaded the app while online,
**When** I access the survey interface without a network connection,
**Then** the Service Worker must serve the app shell (HTML, JS, CSS, fonts, images) from the precache,
**And** the app must render the Enumerator Dashboard and form navigation without network access.

### AC3.2.2: Offline Form Schema Loading

**Given** a form schema that was previously fetched while online,
**When** I access the survey form without a network connection,
**Then** the Service Worker must serve the form schema definition from the cache,
**And** the form renderer must display the cached form with all questions, choices, and skip logic intact.

### AC3.2.3: Persistent Storage

**Given** an Enumerator using the app on a mobile device,
**When** the app loads for the first time after authentication,
**Then** the app must request browser Persistent Storage (`navigator.storage.persist()`) to prevent cache eviction,
**And** if Persistent Storage is denied, a warning banner must display: "Storage not secured. Avoid clearing browser data to prevent data loss."

### AC3.2.4: Service Worker Update Prompt

**Given** a new version of the app is deployed,
**When** the Service Worker detects updated assets,
**Then** a non-intrusive "New version available" banner must appear at the top of the screen,
**And** the banner must include a "Refresh" button that triggers the update,
**And** the Service Worker must NEVER auto-skipWaiting (user controls when to update to prevent data loss mid-survey).

### AC3.2.5: Spike Cleanup

**Given** the spike artifacts from prep-5,
**When** the production Service Worker is implemented,
**Then** `apps/web/src/spike-sw.ts` must be removed,
**And** the spike route `/spike/offline` must be removed from `App.tsx`,
**And** `apps/web/src/features/spike/SpikeOfflinePage.tsx` must be deleted,
**And** the no-op `apps/web/public/sw.js` must be removed,
**And** `apps/web/src/lib/offline-db.ts` must be promoted from spike to production (remove `// SPIKE: prep-5` comments).

### AC3.2.6: Cache Strategy Compliance

**Given** the architecture requirements (ADR-004, ADR-005),
**When** caching is configured,
**Then** the strategies must be:
  - **Precache:** App shell (HTML, JS, CSS, fonts, icons) — versioned via Workbox manifest
  - **CacheFirst:** Static assets (images, self-hosted fonts) — 30 days, max 100 entries
  - **CacheFirst:** face-api.js ML models (`/models/*.shard*`, `*.json` in models dir) — 90 days, max 20 entries (cacheName `oslrs-ml-models-v1`)
  - **StaleWhileRevalidate:** Form schemas (`GET /api/v1/forms/*/render`) — 7 days, max 30 entries
  - **StaleWhileRevalidate:** Published forms list (`GET /api/v1/forms/published`) — 7 days
  - **NetworkOnly:** Auth endpoints (`/api/v1/auth/*`) — NEVER cache credentials
  - **NetworkOnly:** POST/PUT/DELETE requests — handled by IndexedDB queue (Story 3.3)

## Tasks / Subtasks

- [x] Task 1: Create production Service Worker (AC: 1, 2, 6)
  - [x] 1.1: Create `apps/web/src/sw.ts` — evolve from spike-sw.ts with production caching strategies. **IMPORTANT:** Remove `BackgroundSyncPlugin` import and registration from spike code — Background Sync is Story 3.3 scope. Non-GET requests must use `NetworkOnly` only.
  - [x] 1.2: Import and call `precacheAndRoute(self.__WB_MANIFEST)` for app shell precaching
  - [x] 1.3: Register CacheFirst route for static assets (images, fonts: `*.woff2`, `*.png`, `*.svg`, `*.ico`) — cacheName `oslrs-static-v1`, 30 days, 100 entries
  - [x] 1.4: Register StaleWhileRevalidate route for form schemas (`/api/v1/forms/*/render`) — cacheName `oslrs-form-schemas-v1`, 7 days, 30 entries
  - [x] 1.5: Register StaleWhileRevalidate route for published forms list (`/api/v1/forms/published`) — cacheName `oslrs-api-forms-v1`, 7 days
  - [x] 1.6: Register NetworkOnly routes for auth endpoints (`/api/v1/auth/*`) and all non-GET requests
  - [x] 1.7: Add `message` listener for `SKIP_WAITING` event (triggered by user accepting update)
  - [x] 1.8: Add `activate` event handler to clean up old caches by prefix (`oslrs-`)
  - [x] 1.9: Add NavigationRoute fallback to serve `/index.html` for SPA client-side routing
  - [x] 1.10: Register CacheFirst route for face-api.js ML models (`/models/` directory — `*.shard*`, `*_manifest.json`) — cacheName `oslrs-ml-models-v1`, 90 days, 20 entries. Models are ~2MB, rarely change.

- [x] Task 2: Update Vite PWA configuration (AC: 1)
  - [x] 2.1: Update `apps/web/vite.config.ts` — change `filename` from `spike-sw.ts` to `sw.ts`
  - [x] 2.2: Set `injectRegister: 'auto'` (was `false` for spike-only registration)
  - [x] 2.3: Verify `globPatterns` includes self-hosted font files (`**/*.{js,css,html,ico,png,svg,woff,woff2}`)
  - [x] 2.4: Add `maximumFileSizeToCacheInBytes: 3_000_000` to handle larger chunks
  - [x] 2.5: Create `apps/web/tsconfig.worker.json` with `lib: ["webworker"]` and `include: ["src/sw.ts"]` for full ServiceWorkerGlobalScope type safety (prep-5 flagged: spike-sw.ts was excluded from tsc and lacked strict type-checking)
  - [x] 2.6: Update `apps/web/tsconfig.json` — change exclude from `spike-sw.ts` to `sw.ts` (SW compiled separately by vite-plugin-pwa's Rollup pipeline, not tsc)

- [x] Task 3: Service Worker registration & lifecycle hook (AC: 4)
  - [x] 3.1: Create `apps/web/src/hooks/useServiceWorker.ts` using `registerSW` from `virtual:pwa-register`
  - [x] 3.2: Expose `needRefresh` state and `updateServiceWorker()` action
  - [x] 3.3: Call `onOfflineReady` to set an `offlineReady` flag (for UI feedback)
  - [x] 3.4: DO NOT auto-call `skipWaiting` — user must explicitly trigger via update banner

- [x] Task 4: SW Update Banner component (AC: 4)
  - [x] 4.1: Create `apps/web/src/components/SWUpdateBanner.tsx` — fixed top banner, Oyo Red (#9C1E23) background
  - [x] 4.2: Text: "A new version is available" + "Refresh" button (white text on Oyo Red)
  - [x] 4.3: Dismiss ("X") button to postpone update
  - [x] 4.4: Only renders when `needRefresh` is true from `useServiceWorker`
  - [x] 4.5: Wire into DashboardLayout (render above main content)
  - [x] 4.6: Tests in `apps/web/src/components/__tests__/SWUpdateBanner.test.tsx`

- [x] Task 5: Persistent Storage hook (AC: 3)
  - [x] 5.1: Create `apps/web/src/hooks/usePersistentStorage.ts` — requests `navigator.storage.persist()` on mount
  - [x] 5.2: Expose `isPersisted`, `storageQuota` (usage/quota from `navigator.storage.estimate()`), `isSupported`
  - [x] 5.3: If `isPersisted === false`, show warning via returned `showWarning` flag
  - [x] 5.4: Create `apps/web/src/components/StorageWarningBanner.tsx` — amber warning banner: "Storage not secured. Avoid clearing browser data to prevent data loss."
  - [x] 5.5: Wire `usePersistentStorage` into EnumeratorHome — request on mount, show warning if denied
  - [x] 5.6: Tests in `apps/web/src/hooks/__tests__/usePersistentStorage.test.ts`

- [x] Task 6: Form schema dual-layer caching (AC: 2)
  - [x] 6.1: Update `apps/web/src/features/forms/hooks/useForms.ts` — on successful fetch, also write to Dexie `formSchemaCache` table
  - [x] 6.2: Add offline fallback: if fetch fails and SW cache misses, read from `db.formSchemaCache.get(formId)`
  - [x] 6.3: Promote `offline-db.ts` formSchemaCache table from spike to production. Note: `version` was already typed as `string` in current code — no fix needed.
  - [x] 6.4: Tests verifying: online fetch + Dexie write, offline fallback from Dexie, cache miss returns error

- [x] Task 7: Update EnumeratorHome SW registration (AC: 1, 3, 4)
  - [x] 7.1: Remove manual `navigator.serviceWorker.register('/sw.js')` from `EnumeratorHome.tsx`
  - [x] 7.2: SW registration now handled globally by `vite-plugin-pwa` auto-registration (Task 2.2)
  - [x] 7.3: Add `usePersistentStorage()` call in EnumeratorHome
  - [x] 7.4: Add `StorageWarningBanner` conditional render

- [x] Task 8: Remove spike artifacts (AC: 5)
  - [x] 8.1: Delete `apps/web/src/spike-sw.ts`
  - [x] 8.2: Delete `apps/web/src/features/spike/SpikeOfflinePage.tsx`
  - [x] 8.3: Delete `apps/web/src/features/spike/` directory (if empty after deletion)
  - [x] 8.4: Remove spike route from `apps/web/src/App.tsx` (the `import.meta.env.DEV && <Route path="spike/offline" ...>` block)
  - [x] 8.5: Delete `apps/web/public/sw.js` (no-op placeholder)
  - [x] 8.6: Remove `// SPIKE: prep-5` comments from `apps/web/src/lib/offline-db.ts`

- [x] Task 9: Tests (AC: 1, 2, 3, 4, 5, 6)
  - [x] 9.1: Tests for `useServiceWorker` hook — `apps/web/src/hooks/__tests__/useServiceWorker.test.ts` (mock `virtual:pwa-register`, verify needRefresh/offlineReady states, verify updateServiceWorker calls)
  - [x] 9.2: Tests for `SWUpdateBanner` — renders when needRefresh, dismiss hides, refresh calls update
  - [x] 9.3: Tests for `usePersistentStorage` — granted/denied/unsupported scenarios
  - [x] 9.4: Tests for `StorageWarningBanner` — renders when warning, hides when persisted
  - [x] 9.5: Tests for form schema caching — online fetch writes to Dexie, offline fallback reads from Dexie
  - [x] 9.6: Verify spike artifacts are removed (no imports of spike-sw.ts or SpikeOfflinePage anywhere)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] ML model caching route dead code — sw.ts route matches local `/models/` but LiveSelfieCapture loads from `cdn.jsdelivr.net`. Fixed: route now matches CDN origin. [sw.ts:50-65]
- [x] [AI-Review][HIGH] `apps/web/package.json` not documented in File List despite `workbox-cacheable-response` devDep install. Fixed: added to File List.
- [x] [AI-Review][MEDIUM] EnumeratorHome.test.tsx violates team agreement A3 — uses `data-slot` attribute selector (line 97) and lucide CSS class selectors (lines 155-158). Fixed: replaced with `data-testid` and removed icon CSS test. [EnumeratorHome.test.tsx:97,155-158]
- [x] [AI-Review][MEDIUM] `offlineReady` state from useServiceWorker never consumed — Dev Notes UX describes offline-ready toast but no component wired it. Fixed: added toast in DashboardLayout with sessionStorage dedup. [DashboardLayout.tsx]
- [x] [AI-Review][MEDIUM] StorageWarningBanner uses `bg-amber-500` (#f59e0b) but spec says `#D97706` (amber-600). Fixed: changed to `bg-amber-600`. [StorageWarningBanner.tsx:28]
- [x] [AI-Review][MEDIUM] ML model cache route pattern narrower than AC (`_manifest.json` only vs AC's `*.json`). Fixed: CDN route now matches all model files. [sw.ts:50-65]
- [x] [AI-Review][LOW] `pnpm-lock.yaml` not documented in File List. Fixed.
- [x] [AI-Review][LOW] SWUpdateBanner only renders in DashboardLayout — public/auth pages don't show SW update notification. Known limitation: acceptable for enumerator-focused story scope; broader coverage deferred to future story.

## Dev Notes

### Architecture Compliance

**Offline Data Flow (ADR-004):**
```
1. First visit (online): Vite PWA precaches app shell + SW registers
2. Enumerator opens survey list → GET /api/v1/forms/published → cached by SW (StaleWhileRevalidate)
3. Enumerator starts survey → GET /api/v1/forms/:id/render → cached by SW + written to Dexie formSchemaCache
4. Subsequent offline visit: SW serves app shell from precache, form data from SW cache (or Dexie fallback)
5. Form filling: formData saved to Dexie drafts table (Story 3.1, already working)
6. Submission queue: completed forms in Dexie submissionQueue (Story 3.1, already working)
7. Background sync of submissions: Story 3.3 (NOT this story)
```

**Cache Layer Architecture:**
```
Layer 1: Workbox Precache (app shell — versioned, updated on deploy)
Layer 2: Workbox Runtime Cache (API responses — StaleWhileRevalidate; ML models + static assets — CacheFirst)
Layer 3: Dexie IndexedDB (form schemas + drafts — application-level, reactive)
```

### Caching Strategy: StaleWhileRevalidate vs NetworkFirst (Deliberate Deviation from Spike)

The prep-5 spike recommended **NetworkFirst** for form schemas and API responses. This story uses **StaleWhileRevalidate** instead. This is a **conscious decision**, not an oversight:

- **StaleWhileRevalidate** serves from cache immediately, then updates in the background. This gives instant load on slow/flaky field networks — critical for enumerator UX in remote Oyo State.
- **NetworkFirst** tries the network first with a timeout, then falls back to cache. This adds latency on every request when network is slow but reachable (the most common field scenario — partial connectivity, not full offline).
- The risk of stale schemas is low: form publishing is an admin action, not frequent. When an admin publishes a new form version, the SWR background revalidation updates the cache within seconds for online users. Offline users get the update on their next online visit.
- The dual-layer Dexie fallback (Task 6) provides defense-in-depth: even if the SW cache is evicted, IndexedDB has the schema.

**Bottom line:** SWR optimizes for the common case (slow field networks) at the cost of a brief staleness window that is acceptable for this use case.

### Existing Code to Reuse (DO NOT reinvent)

| What | Where | How to Reuse |
|------|-------|-------------|
| Spike SW (Workbox patterns) | `apps/web/src/spike-sw.ts` | Evolve into production `sw.ts` — keep Workbox strategy patterns, update cache names/TTLs |
| Dexie schema | `apps/web/src/lib/offline-db.ts` | Use as-is — `formSchemaCache` table already has correct schema (formId PK, version, schema, cachedAt, etag) |
| PWA manifest | `apps/web/public/site.webmanifest` | Already correct — standalone mode, icons, theme color #8B0000 |
| Vite PWA config | `apps/web/vite.config.ts` | Already configured with injectManifest mode — just update filename and injectRegister |
| Spike PoC page | `apps/web/src/features/spike/SpikeOfflinePage.tsx` | Reference for Dexie CRUD, useLiveQuery, storage APIs — then DELETE |
| Form API hooks | `apps/web/src/features/forms/hooks/useForms.ts` | Modify to add Dexie write-through + offline fallback |
| Toast hook | `apps/web/src/hooks/useToast.ts` | Use for "Offline ready" notification |
| DashboardLayout | `apps/web/src/layouts/DashboardLayout.tsx` | Wire SWUpdateBanner into layout header |

### TypeScript Interfaces (Critical Reference)

**Dexie formSchemaCache table (already in offline-db.ts):**
```typescript
interface FormSchemaCache {
  formId: string;       // Primary key
  version: string;      // Form version for cache validation
  schema: unknown;      // Full FlattenedForm JSON
  cachedAt: string;     // ISO timestamp
  etag?: string;        // HTTP ETag for validation
}
```

**registerSW from virtual:pwa-register:**
```typescript
import { registerSW } from 'virtual:pwa-register';

const updateSW = registerSW({
  onNeedRefresh(): void;    // New SW waiting — show update banner
  onOfflineReady(): void;   // SW activated, precache complete — app works offline
  onRegisteredSW?(swUrl: string, registration: ServiceWorkerRegistration | undefined): void;
  onRegisterError?(error: Error): void;
});

// updateSW(reloadPage?: boolean): Promise<void> — calls skipWaiting + reload
```

### Service Worker Implementation Notes

**Production SW structure (src/sw.ts):**
```typescript
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { createHandlerBoundToURL } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

// 1. Precache app shell (vite-plugin-pwa injects manifest)
precacheAndRoute(self.__WB_MANIFEST);

// 2. SPA navigation fallback
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler, {
  denylist: [/^\/api\//, /^\/sw\.js$/],  // Don't intercept API calls
});
registerRoute(navigationRoute);

// 3. CacheFirst: Static assets
registerRoute(
  ({ request }) => ['font', 'image'].includes(request.destination),
  new CacheFirst({
    cacheName: 'oslrs-static-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  })
);

// 4. CacheFirst: face-api.js ML models (~2MB, rarely changes)
registerRoute(
  ({ url }) => url.pathname.startsWith('/models/') && (url.pathname.includes('.shard') || url.pathname.endsWith('_manifest.json')),
  new CacheFirst({
    cacheName: 'oslrs-ml-models-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 90 * 24 * 60 * 60 }),
    ],
  })
);

// 5. StaleWhileRevalidate: Form schemas
registerRoute(
  ({ url }) => url.pathname.match(/\/api\/v1\/forms\/[\w-]+\/render$/),
  new StaleWhileRevalidate({
    cacheName: 'oslrs-form-schemas-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// 5. StaleWhileRevalidate: Published forms list
registerRoute(
  ({ url }) => url.pathname === '/api/v1/forms/published',
  new StaleWhileRevalidate({
    cacheName: 'oslrs-api-forms-v1',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 7 * 24 * 60 * 60 }),
    ],
  })
);

// 6. NetworkOnly: Auth endpoints (NEVER cache credentials)
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/v1/auth'),
  new NetworkOnly()
);

// 7. NetworkOnly: Non-GET requests (mutations not cached)
registerRoute(
  ({ request }) => request.method !== 'GET',
  new NetworkOnly()
);

// 8. skipWaiting on user request
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 9. Cleanup old caches on activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('oslrs-') && !['oslrs-static-v1', 'oslrs-ml-models-v1', 'oslrs-form-schemas-v1', 'oslrs-api-forms-v1'].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
});
```

**IMPORTANT: The above is a reference pattern, NOT copy-paste code. Adapt based on actual import paths and project conventions.**

### Vite Config Changes

**Current (spike):**
```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'spike-sw.ts',          // ← Change to 'sw.ts'
  injectRegister: false,             // ← Change to 'auto'
  manifest: false,
  devOptions: { enabled: false },
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
  },
})
```

**Target (production):**
```typescript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',                 // Production SW
  injectRegister: 'auto',            // Auto-register in all routes
  manifest: false,                   // Using public/site.webmanifest
  devOptions: { enabled: false },    // Keep disabled in dev
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    maximumFileSizeToCacheInBytes: 3_000_000,  // Handle large chunks
  },
})
```

### Dual-Layer Form Schema Caching

**Why dual-layer (SW cache + Dexie)?**
- SW cache: Transparent network-level caching. Fast. Handles standard HTTP requests automatically.
- Dexie formSchemaCache: Application-level fallback. If SW cache is evicted (storage pressure) or cleared, the app can still read from IndexedDB. Also enables reactive queries via `useLiveQuery`.

**Modified useForms.ts pattern:**
```typescript
export function useFormSchema(formId: string) {
  return useQuery({
    queryKey: ['forms', 'render', formId],
    queryFn: async () => {
      try {
        const schema = await fetchFormForRender(formId);
        // Write-through to Dexie for offline fallback
        await db.formSchemaCache.put({
          formId,
          version: schema.version,
          schema: JSON.stringify(schema),
          cachedAt: new Date().toISOString(),
        });
        return schema;
      } catch (error) {
        // Offline fallback: try Dexie
        const cached = await db.formSchemaCache.get(formId);
        if (cached) {
          return JSON.parse(cached.schema as string) as FlattenedForm;
        }
        throw error;  // No cache available — rethrow
      }
    },
    enabled: !!formId,
  });
}
```

### UX Requirements

**SWUpdateBanner:**
- Position: fixed top, full width, above DashboardLayout header
- Background: Oyo Red #9C1E23, white text
- Content: "A new version is available" + "Refresh" button (white outline) + "X" dismiss
- Height: 48px, z-index above all content
- Accessible: `role="alert"`, `aria-live="polite"`

**StorageWarningBanner:**
- Position: inside EnumeratorHome, below dashboard header
- Background: Amber/Warning #D97706, white text
- Content: "Storage not secured. Avoid clearing browser data to prevent data loss."
- Dismiss: "X" button, remembers dismissal in sessionStorage
- Only shown to enumerator role

**Offline-ready toast:**
- On first successful SW activation: `success('App ready for offline use!')` (3s auto-dismiss)
- Only show once per session (track in sessionStorage)

### Previous Story Intelligence

**From Story 3.1 (Native Form Renderer):**
- `FormFillerPage` loads form via `useFormSchema(formId)` hook — this is the hook we modify for dual-layer caching
- Draft persistence already uses Dexie `drafts` table via `useDraftPersistence` hook — proven patterns
- Skip logic utility at `features/forms/utils/skipLogic.ts` — pure TS, works offline with cached schema
- All question renderers are pure components — work with any data source, no network dependency
- Test baseline: 98 web tests + 6 API tests from Story 3.1 — new tests must not break existing
- Feature organization: `features/forms/` for renderer, `features/questionnaires/` for builder

**From prep-5 (Offline PWA Spike):**
- `spike-sw.ts` has working Workbox patterns for all strategies — adapt, don't rewrite from scratch
- **WARNING:** `spike-sw.ts` includes `BackgroundSyncPlugin` for POST requests — this MUST be removed when evolving to production `sw.ts` (Background Sync is Story 3.3 scope)
- **WARNING:** `offline-db.ts` has `CachedFormSchema.version` typed as `number` — must be changed to `string` (semver). Source of truth: `packages/types/src/native-form.ts` line 90
- `SpikeOfflinePage.tsx` demonstrates `navigator.storage.persist()`, `navigator.storage.estimate()`, and SW status check — reference then delete
- Storage budget estimated at ~9.25MB (0.8% of typical 1.2GB quota on low-end Android)
- Spike validated: SW registration, precache, runtime caching, Dexie CRUD all work correctly
- `vite-plugin-pwa@1.2.0` with `injectManifest` mode is the correct approach (validated in spike)
- Spike recommends `tsconfig.worker.json` for production SW type safety (spike excluded `spike-sw.ts` from tsc entirely)

**From prep-1 (ODK Cleanup) and perf-1 (LCP Optimization):**
- Fonts are now self-hosted at `apps/web/public/fonts/` (Inter, Poppins) — these MUST be in CacheFirst strategy
- `apps/web/public/fonts/inter-*.woff2` and `apps/web/public/fonts/poppins-*.woff2`
- Font preloads in `index.html` — SW precache should also include these

**From Story 1.5 (Live Selfie Capture):**
- face-api.js models (~2MB) at `apps/web/public/models/` — these MUST be in CacheFirst strategy for offline selfie capture
- Models are loaded on-demand (not at app startup) — CacheFirst with 90-day expiry is correct
- Prep-5 spike caching matrix explicitly recommends: `CacheFirst, cacheName 'ml-models', 90 days`
- If models are not cached, selfie capture will fail offline — this is why face-api caching is in scope for this story

### Git Intelligence

**Recent commit patterns:**
```
6b46cbb perf: self-host Inter + Poppins fonts to fix LCP (PERF-1 round 2)
39a5db6 feat: LCP optimization, sitemap/robots.txt & code review fixes (PERF-1)
e548827 fix: remove invalid locale prop from GoogleLogin component
93eff32 fix: CI type errors — add loginWithGoogle to mock AuthContext
b33dcfd feat: Google OAuth & enhanced public registration (Story 3.0)
```

**Relevant insights:**
- Self-hosted fonts at `public/fonts/` — critical for CacheFirst strategy
- Feature-based organization strictly followed
- Code review discipline: every story gets 3-10 finding adversarial review
- Tests co-located in `__tests__/` directories

### Library & Framework Requirements

| Library | Version | Status | Purpose |
|---------|---------|--------|---------|
| `vite-plugin-pwa` | 1.2.0 | Installed (devDep) | PWA build plugin with Workbox integration |
| `workbox-precaching` | 7.4.0 | Installed (devDep) | App shell precaching |
| `workbox-routing` | 7.4.0 | Installed (devDep) | Route-based cache strategies |
| `workbox-strategies` | 7.4.0 | Installed (devDep) | CacheFirst, StaleWhileRevalidate, NetworkOnly |
| `workbox-expiration` | 7.4.0 | Installed (devDep) | Cache entry expiration |
| `workbox-cacheable-response` | 7.4.0 | **INSTALL** (devDep) | Prevents caching error responses in SWR strategies |
| `workbox-background-sync` | 7.4.0 | Installed (devDep) | NOT used in this story (Story 3.3) |
| `dexie` | 4.3.0 | Installed | IndexedDB wrapper for form schema cache |
| `dexie-react-hooks` | 4.2.0 | Installed | Reactive Dexie queries |
| `fake-indexeddb` | 6.2.5 | Installed (devDep) | Mock IndexedDB for unit tests |

**One new dependency required:**
- `workbox-cacheable-response` must be installed as devDep — it is NOT bundled with `workbox-strategies` (contrary to prior assumption). Required for `CacheableResponsePlugin` which prevents caching error responses (e.g., a 500 replacing a good cached form schema in SWR strategies).

### Critical Guardrails

1. **DO NOT implement background sync for submissions** — that is Story 3.3. Completed forms stay in Dexie `submissionQueue` table only.
2. **DO NOT implement the "Upload Now" button** — that is Story 3.3 (Emergency sync per ADR-008).
3. **DO NOT implement sync status indicators** (Green/Amber/Red badges) — that is Story 3.3.
4. **DO NOT cache POST/PUT/DELETE requests** in the Service Worker — mutations go through IndexedDB queue only.
5. **NEVER cache auth endpoints** (`/api/v1/auth/*`) — credentials must never be stored in SW cache.
6. **NEVER auto-skipWaiting** — user must explicitly trigger SW update to prevent data loss mid-survey.
7. **Use `injectManifest` mode** — NOT `generateSW`. We need custom caching logic.
8. **Use Skeleton screens** for loading states — NEVER spinners (project-context.md rule #4).
9. **All IDs use UUIDv7** — NEVER auto-increment or UUIDv4.
10. **Test selectors: text content, `data-testid`, ARIA roles ONLY** — NEVER CSS classes (team agreement A3).
11. **Install `workbox-cacheable-response` as devDep before Task 1** — it is NOT bundled with workbox-strategies. Required for `CacheableResponsePlugin({ statuses: [0, 200] })` to guard against caching error responses.

### File Structure (New Files)

```
apps/web/src/
├── sw.ts                                    # NEW: Production service worker
├── hooks/
│   ├── useServiceWorker.ts                  # NEW: SW lifecycle hook
│   ├── usePersistentStorage.ts              # NEW: Persistent storage hook
│   └── __tests__/
│       ├── useServiceWorker.test.ts         # NEW
│       └── usePersistentStorage.test.ts     # NEW
├── components/
│   ├── SWUpdateBanner.tsx                   # NEW: "New version available" banner
│   ├── StorageWarningBanner.tsx             # NEW: "Storage not secured" warning
│   └── __tests__/
│       ├── SWUpdateBanner.test.tsx          # NEW
│       └── StorageWarningBanner.test.tsx    # NEW
├── lib/
│   └── offline-db.ts                        # MODIFIED: Remove SPIKE comments
└── features/
    ├── forms/
    │   └── hooks/
    │       └── useForms.ts                  # MODIFIED: Add dual-layer caching
    ├── dashboard/
    │   └── pages/
    │       └── EnumeratorHome.tsx            # MODIFIED: Remove manual SW reg, add persistent storage
    └── spike/                               # DELETED: Entire directory
        └── SpikeOfflinePage.tsx             # DELETED
```

**Other Modified Files:**
- `apps/web/vite.config.ts` — Update PWA plugin config (filename, injectRegister)
- `apps/web/src/App.tsx` — Remove spike route
- `apps/web/src/layouts/DashboardLayout.tsx` — Wire SWUpdateBanner
- `apps/web/tsconfig.json` — Update exclude from `spike-sw.ts` to `sw.ts`
- `apps/web/tsconfig.worker.json` — NEW: Worker-specific tsconfig with `lib: ["webworker"]`
- `apps/web/public/sw.js` — DELETED (replaced by compiled sw.ts)

### Testing Strategy

**Hook tests (4+ tests per hook):**
- `useServiceWorker`: needRefresh triggers on callback, updateServiceWorker calls registerSW updater, offlineReady flag set
- `usePersistentStorage`: granted scenario, denied scenario, unsupported browser, quota estimation

**Component tests (3+ tests per component):**
- `SWUpdateBanner`: renders when needRefresh=true, dismiss hides banner, refresh button triggers update
- `StorageWarningBanner`: renders when isPersisted=false, hides when persisted, dismiss via X button

**Integration tests (3+ tests):**
- Form schema dual-layer caching: online fetch writes to Dexie, offline fallback reads from Dexie, cache miss rethrows error

**Regression verification:**
- All existing 978+ web tests pass after changes
- EnumeratorHome tests still pass after removing manual SW registration
- Form hooks tests still pass after adding dual-layer caching

### Project Structure Notes

- `src/sw.ts` lives at the web app root (not in features/) because it's a build-time entry point for Workbox
- Hooks (`useServiceWorker`, `usePersistentStorage`) go in shared `src/hooks/` because they're used across features (not feature-specific)
- Banner components go in shared `src/components/` because `SWUpdateBanner` is used in `DashboardLayout` (cross-feature)
- `offline-db.ts` stays in `src/lib/` — it's shared infrastructure, not feature-specific

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004 (Offline Data Responsibility Model)]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-005 (Degraded Mode Strategy)]
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-008 (Emergency Data Sync Control)]
- [Source: docs/spike-offline-pwa.md — prep-5 spike decisions and recommendations]
- [Source: apps/web/src/spike-sw.ts — spike service worker (evolve into production)]
- [Source: apps/web/src/lib/offline-db.ts — Dexie schema with formSchemaCache table]
- [Source: apps/web/src/features/spike/SpikeOfflinePage.tsx — persistent storage and SW patterns]
- [Source: apps/web/vite.config.ts — existing VitePWA configuration]
- [Source: apps/web/public/site.webmanifest — PWA manifest]
- [Source: apps/web/src/features/forms/hooks/useForms.ts — hooks to modify for dual-layer caching]
- [Source: apps/web/src/features/dashboard/pages/EnumeratorHome.tsx — manual SW registration to replace]
- [Source: _bmad-output/implementation-artifacts/3-1-native-form-renderer-dashboard.md — previous story intelligence]
- [Source: _bmad-output/project-context.md — loading states, testing organization, naming conventions]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed `offline-db.ts` after `replace_all` for SPIKE comments left orphaned text (bare code not in comments). Resolved by removing the leftover lines individually.
- `virtual:pwa-register` Vite virtual module not available in vitest — resolved by creating `__mocks__/virtual-pwa-register.ts` and adding resolve alias in `vitest.config.ts`.
- `useFormSchema.test.ts` had wrong relative mock paths (5 levels instead of 4 for offline-db, 3 instead of 2 for form.api). Fixed to correct relative paths.
- `CachedFormSchema.version` was already typed as `string` in the current `offline-db.ts` — the story note about fixing `number` to `string` was stale (already correct).

### Completion Notes List

- **Task 1:** Created `apps/web/src/sw.ts` with all 10 caching routes: precache app shell, NavigationRoute SPA fallback, CacheFirst static assets (30d/100), CacheFirst ML models (90d/20), SWR form schemas (7d/30), SWR published forms (7d/5), NetworkOnly auth, NetworkOnly non-GET, SKIP_WAITING listener, activate old cache cleanup. Uses `CacheableResponsePlugin` to guard against caching error responses. No BackgroundSyncPlugin (Story 3.3 scope).
- **Task 2:** Updated `vite.config.ts`: filename `sw.ts`, `injectRegister: 'auto'`, `maximumFileSizeToCacheInBytes: 3_000_000`. Created `tsconfig.worker.json` with `lib: ["WebWorker"]`. Updated `tsconfig.json` exclude from `spike-sw.ts` to `sw.ts`.
- **Task 3:** Created `useServiceWorker` hook using `registerSW` from `virtual:pwa-register`. Exposes `needRefresh`, `offlineReady`, `updateServiceWorker()`. No auto-skipWaiting.
- **Task 4:** Created `SWUpdateBanner` — fixed top, Oyo Red `#9C1E23`, "A new version is available" + Refresh + dismiss. Wired into `DashboardLayout` with `pt-12` offset when visible. `role="alert"` + `aria-live="polite"`.
- **Task 5:** Created `usePersistentStorage` hook (requests `navigator.storage.persist()` on mount, exposes `isPersisted`, `storageQuota`, `isSupported`, `showWarning`). Created `StorageWarningBanner` (amber, dismiss persists to sessionStorage).
- **Task 6:** Modified `useFormSchema` in `useForms.ts` for dual-layer caching: write-through to Dexie `formSchemaCache` on successful fetch, offline fallback reads from Dexie on fetch failure.
- **Task 7:** Removed manual `navigator.serviceWorker.register('/sw.js')` from `EnumeratorHome.tsx`. Added `usePersistentStorage()` + `StorageWarningBanner` conditional render.
- **Task 8:** Deleted spike artifacts: `spike-sw.ts`, `SpikeOfflinePage.tsx`, `spike/` directory, `public/sw.js`. Removed spike route + lazy import from `App.tsx`. Cleaned all `// SPIKE: prep-5` comments from `offline-db.ts`.
- **Task 9:** 31 new/updated tests across 6 test files. All 1,096 web tests pass (107 files), 290 API tests pass (28 files). Zero regressions.

### Change Log

- 2026-02-12: Story 3.2 implementation complete — PWA Service Worker, offline asset caching, dual-layer form schema caching, persistent storage, SW update banner, spike cleanup. 1,386 total tests pass (1,096 web + 290 API).
- 2026-02-12: Code review (AI) — 8 findings (2 HIGH, 4 MEDIUM, 2 LOW). All fixed: ML model cache route corrected to CDN origin, offline-ready toast wired, StorageWarningBanner color fixed, test A3 violations resolved, File List updated. 1,096 web tests pass post-fix.

### File List

**New files:**
- `apps/web/src/sw.ts` — Production service worker with Workbox caching strategies
- `apps/web/src/hooks/useServiceWorker.ts` — SW lifecycle hook (needRefresh, offlineReady, updateServiceWorker)
- `apps/web/src/hooks/usePersistentStorage.ts` — Persistent storage request hook
- `apps/web/src/components/SWUpdateBanner.tsx` — "New version available" update banner
- `apps/web/src/components/StorageWarningBanner.tsx` — "Storage not secured" warning banner
- `apps/web/tsconfig.worker.json` — SW-specific tsconfig with WebWorker lib
- `apps/web/src/__mocks__/virtual-pwa-register.ts` — Test mock for Vite virtual module
- `apps/web/src/hooks/__tests__/useServiceWorker.test.ts` — 4 tests
- `apps/web/src/hooks/__tests__/usePersistentStorage.test.ts` — 4 tests
- `apps/web/src/components/__tests__/SWUpdateBanner.test.tsx` — 4 tests
- `apps/web/src/components/__tests__/StorageWarningBanner.test.tsx` — 4 tests
- `apps/web/src/features/forms/hooks/__tests__/useFormSchema.test.ts` — 3 tests

**Modified files:**
- `apps/web/package.json` — Added workbox-cacheable-response devDep
- `pnpm-lock.yaml` — Lockfile update for workbox-cacheable-response
- `apps/web/vite.config.ts` — PWA config: filename sw.ts, injectRegister auto, maxFileSize 3MB
- `apps/web/vitest.config.ts` — Added resolve alias for virtual:pwa-register mock
- `apps/web/tsconfig.json` — Updated exclude from spike-sw.ts to sw.ts
- `apps/web/src/App.tsx` — Removed spike lazy import + spike/offline route
- `apps/web/src/layouts/DashboardLayout.tsx` — Added SWUpdateBanner + useServiceWorker + offline-ready toast
- `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx` — Removed manual SW reg, added usePersistentStorage + StorageWarningBanner + data-testid
- `apps/web/src/features/forms/hooks/useForms.ts` — Added dual-layer Dexie caching to useFormSchema
- `apps/web/src/lib/offline-db.ts` — Removed SPIKE comments
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorHome.test.tsx` — Updated: removed AC5 SW tests, added AC3 persistent storage tests, fixed A3 selector violations

**Deleted files:**
- `apps/web/src/spike-sw.ts` — Spike service worker (replaced by production sw.ts)
- `apps/web/src/features/spike/SpikeOfflinePage.tsx` — Spike offline PoC page
- `apps/web/src/features/spike/` — Spike feature directory
- `apps/web/public/sw.js` — No-op placeholder SW
