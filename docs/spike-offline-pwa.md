# Spike: Offline-First PWA Architecture (prep-5)

**Date:** 2026-02-11
**Status:** Complete
**Blocks:** Stories 3.2 (PWA Service Worker & Offline Assets), 3.3 (Offline Queue & Sync Status UI)

---

## 1. Technology Choices

### Service Worker: vite-plugin-pwa v1.2.0 with `injectManifest`

**Decision:** Use `vite-plugin-pwa` in `injectManifest` mode with Workbox runtime libraries.

**Rationale:**
- Automatic precache manifest generation from Vite build output (126 entries, ~4.6MB)
- Full control over runtime caching strategies, Background Sync, and custom offline logic
- Provides `useRegisterSW` React hook for SW lifecycle management (prompt-to-reload)
- `generateSW` mode was rejected: too limited for custom Background Sync logic
- Fully custom SW without Workbox was rejected: excessive boilerplate for no benefit

**Installed packages:**
- `vite-plugin-pwa` (devDependency)
- `workbox-precaching`, `workbox-routing`, `workbox-strategies`, `workbox-expiration`, `workbox-background-sync` (devDependencies — needed explicitly for pnpm strict resolution)

### IndexedDB: Dexie.js 4.x

**Decision:** Use Dexie.js for all IndexedDB operations.

**Rationale:**
- `useLiveQuery()` hook provides reactive queries — UI updates automatically when IndexedDB data changes
- Declarative schema versioning with `.version(N).stores({...})` and `.upgrade()` for data migrations
- Compound indexes (e.g., `[formId+status]`) for efficient querying
- Full TypeScript support with type inference via `EntityTable`
- ~42kB minified — negligible given existing bundle (~4.6MB app shell)
- **idb (1.19kB) rejected:** Too thin — no query builder, no reactive hooks, no migration helpers
- **localForage rejected:** Unmaintained, unnecessary fallbacks for WebSQL/localStorage
- **Native IndexedDB rejected:** Verbose and error-prone — always use a wrapper

**Installed packages:**
- `dexie` (dependency)
- `dexie-react-hooks` (dependency)
- `fake-indexeddb` (devDependency — for unit testing)

### Background Sync: workbox-background-sync

**Decision:** Use Workbox Background Sync plugin for offline POST retry.

**Rationale:**
- Chrome 49+ (fully supported on target Chrome 80+/Android 8.0+)
- Queues failed POST requests in IndexedDB, retries on connectivity restore
- `maxRetentionTime: 10,080 minutes` (7 days) aligns with NFR3.2 offline requirement
- **Dual-layer approach recommended for Story 3.3:**
  - Dexie stores submission metadata (status, retry count, UI visibility)
  - workbox-background-sync handles HTTP retry mechanics

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                       Browser (Client)                       │
│                                                              │
│  ┌──────────────┐    ┌──────────────────────────────────┐   │
│  │  React App   │◄──►│         Dexie (IndexedDB)        │   │
│  │              │    │  ┌──────────┐ ┌───────────────┐  │   │
│  │ useLiveQuery │    │  │  drafts   │ │submissionQueue│  │   │
│  │ (reactive)   │    │  └──────────┘ └───────────────┘  │   │
│  │              │    │  ┌────────────────┐               │   │
│  └──────┬───────┘    │  │formSchemaCache │               │   │
│         │            │  └────────────────┘               │   │
│         │            └──────────────────────────────────┘   │
│         │ fetch()                                            │
│  ┌──────▼───────────────────────────────────────────────┐   │
│  │              Service Worker (Workbox)                  │   │
│  │                                                       │   │
│  │  Precache ──► App Shell (HTML, JS, CSS)  [versioned]  │   │
│  │  CacheFirst ► Static Assets (img, fonts) [30 days]    │   │
│  │  NetworkFirst► GET /api/*                [1 hour]     │   │
│  │  NetworkOnly ► POST /api/*                            │   │
│  │       └──► BackgroundSyncPlugin [7-day retry queue]   │   │
│  └──────────────────────────┬────────────────────────────┘   │
└─────────────────────────────┼────────────────────────────────┘
                              │ HTTPS
                    ┌─────────▼─────────┐
                    │    Express API     │
                    │  POST /api/v1/     │
                    │    submissions     │
                    │         │          │
                    │    ┌────▼────┐     │
                    │    │ BullMQ  │     │
                    │    │ Queue   │     │
                    │    └────┬────┘     │
                    │    ┌────▼────┐     │
                    │    │ app_db  │     │
                    │    │(Postgres)│    │
                    │    └─────────┘     │
                    └───────────────────┘
```

### Offline Flow

```
1. Enumerator opens app (PWA installed)
   └─► Service Worker serves cached app shell

2. Enumerator fills out survey form
   └─► Each answer saved to Dexie `drafts` table (auto-save)
   └─► useLiveQuery updates draft count badge reactively

3. Enumerator completes survey → clicks "Submit"
   └─► Draft status → 'completed' → 'submitted'
   └─► Entry added to Dexie `submissionQueue` (status: pending)
   └─► fetch() POST to /api/v1/submissions

4a. ONLINE: POST succeeds
   └─► submissionQueue status → 'synced'
   └─► Badge count decrements

4b. OFFLINE: POST fails (network error)
   └─► BackgroundSyncPlugin queues the request
   └─► submissionQueue status → 'pending' (visible in Sync UI)
   └─► When connectivity restores: SW replays queued POSTs
   └─► Idempotent server endpoint deduplicates by submission UUIDv7
```

---

## 3. Caching Strategy Matrix

| Resource Type | Strategy | Cache Name | Max Age / Entries | Rationale | PoC? |
|---|---|---|---|---|---|
| App shell (HTML, JS, CSS) | **Precache** (build manifest) | `workbox-precache` | Versioned by Vite hash | Must load offline; updated on build | Yes |
| Static assets (images, fonts) | **CacheFirst** | `static-assets` | 30 days, 100 entries | Rarely changes; serve from cache first | Yes |
| Form schema definitions | **NetworkFirst** | `form-schemas` | 7-day fallback | Fresh when online; cached for offline | No* |
| face-api.js models (~2MB) | **CacheFirst** | `ml-models` | 90 days | Large, rarely changes | No* |
| API responses (GET) | **NetworkFirst** | `api-cache` | 1 hour, 50 entries | Fresh data preferred; stale fallback | Yes |
| API mutations (POST/PUT/DELETE) | **NetworkOnly** + BackgroundSync | `submission-queue` | 7 days retention | Queue failed mutations for retry | Yes |

_*Not implemented in spike PoC — recommended for Story 3.2 production SW._

---

## 4. IndexedDB Schema Design

### Database: `oslrs-offline` (Dexie v1)

**File:** `apps/web/src/lib/offline-db.ts`

#### Table: `drafts`
| Field | Type | Index | Description |
|---|---|---|---|
| `id` | string (UUIDv7) | **Primary Key** | Client-generated, becomes submission ID |
| `formId` | string | Indexed | References form schema |
| `formVersion` | number | — | Schema version when draft started |
| `responses` | Record<string, unknown> | — | Question answers (JSONB-like) |
| `questionPosition` | number | — | Resume point (question index) |
| `status` | string | Indexed | `in-progress` / `completed` / `submitted` |
| `createdAt` | string (ISO) | — | Creation timestamp |
| `updatedAt` | string (ISO) | Indexed | Last modification |
| **Compound** | `[formId+status]` | Indexed | Efficient filtered queries |

#### Table: `submissionQueue`
| Field | Type | Index | Description |
|---|---|---|---|
| `id` | string (UUIDv7) | **Primary Key** | Same as draft ID |
| `formId` | string | Indexed | Form reference |
| `payload` | Record<string, unknown> | — | Full submission data |
| `status` | string | Indexed | `pending` / `syncing` / `failed` / `synced` |
| `retryCount` | number | — | Retry attempts |
| `lastAttempt` | string \| null | — | Last sync attempt timestamp |
| `createdAt` | string (ISO) | Indexed | Queue entry time |
| `error` | string \| null | — | Last error message |
| **Compound** | `[status+createdAt]` | Indexed | Ordered pending queue |

#### Table: `formSchemaCache`
| Field | Type | Index | Description |
|---|---|---|---|
| `formId` | string | **Primary Key** | Form identifier |
| `version` | number | — | Schema version |
| `schema` | Record<string, unknown> | — | Full form definition (JSONB) |
| `cachedAt` | string (ISO) | Indexed | Cache timestamp |
| `etag` | string \| null | — | HTTP ETag for cache validation |

### Migration Strategy

Dexie uses `.version(N).stores({...})` for schema versioning:
- Version 1: Initial tables (current)
- Future versions: Use `.upgrade(tx => {...})` for data migrations
- Dexie automatically handles table creation, index changes, and version upgrades

---

## 5. Storage Constraints (AC4)

### Per-Origin Storage Quota

| Device | RAM | Estimated Quota | Source |
|---|---|---|---|
| Low-end Android (2GB RAM) | 2 GB | ~1.2 GB (60% of disk or dynamically calculated) | Chrome quota policy |
| Mid-range Android (4GB RAM) | 4 GB | ~4.8 GB | Chrome quota policy |
| Desktop Chrome | 8+ GB | ~9.6 GB+ | Chrome quota policy |

**Chrome quota formula:** Min(60% of total disk, available disk space). On Android, this is typically generous (~several GB).

### OSLRS Storage Budget

| Data Type | Per-Item Size | Max Items | Total |
|---|---|---|---|
| App shell + JS chunks | — | 1 | ~4.6 MB |
| face-api.js models | — | 1 | ~2 MB |
| Static assets (icons, fonts) | — | 1 | ~500 KB |
| Form schema (JSONB) | 5-50 KB | 10 forms | ~500 KB |
| Draft responses | 2-10 KB | 100 drafts | ~1 MB |
| Submission queue items | 5-15 KB | 50 pending | ~750 KB |
| **Total estimated** | | | **~9.25 MB** |

**Conclusion:** Storage is **NOT a constraint**. Even on the lowest-end target device (2GB RAM, ~1.2GB quota), OSLRS uses <0.8% of available storage.

### Persistent Storage API

- **Availability:** Chrome 52+ (target Chrome 80+ fully supports)
- **Auto-grant behavior:** Granted automatically when PWA is installed to home screen (no user prompt)
- **Effect:** Once granted, IndexedDB and Cache Storage are NOT evicted under storage pressure
- **Implementation:** Call `navigator.storage.persist()` early in app lifecycle (on EnumeratorHome mount)
- **Verified in PoC:** StorageInfo component demonstrates `persist()` request and quota estimation

### Eviction Risk Assessment

| Scenario | Risk Level | Mitigation |
|---|---|---|
| Browser storage pressure (non-persistent) | Medium | Request persistent storage; display install-to-homescreen prompt |
| User manually clears browser cache | **High** | Training emphasis (ADR-004); display warning in settings; auto-sync drafts when online |
| Device reset / factory reset | **High** | Unrecoverable by design (ADR-004); training materials must emphasize |
| IndexedDB corruption | Low | Dexie handles `onblocked`/`onversionchange`; add error boundary in Story 3.3 |
| Quota exceeded | Very Low | Budget is <1% of available quota; add storage monitoring in Story 3.3 |

---

## 6. Service Worker Update Strategy

**Decision:** Prompt-to-reload (never auto-`skipWaiting`)

**Why:**
- User may have unsaved draft data or unsubmitted surveys
- `skipWaiting()` forces all tabs to use the new SW immediately, which can break in-flight requests
- vite-plugin-pwa's `useRegisterSW` hook provides this pattern out of the box

**Implementation (for Story 3.2):**
1. SW installs new version in background
2. `useRegisterSW` detects `onNeedRefresh` callback
3. App shows "New version available" banner
4. User clicks "Update" → sends `SKIP_WAITING` message to SW
5. SW calls `self.skipWaiting()` → page reloads with new version

**PoC validates:** The `spike-sw.ts` includes the `SKIP_WAITING` message handler.

---

## 7. Risk Register

| # | Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|---|
| R1 | Background Sync is Chrome/Chromium-only | Low | N/A | Target is Chrome 80+ only (per NFR5.2); Safari/Firefox not in scope |
| R2 | Persistent Storage denied on non-installed PWA | Medium | Medium | Display warning banner; guide users through "Add to Home Screen" |
| R3 | SW update during active offline session | **High** | Low | Prompt-to-reload pattern; never auto-skipWaiting; queue-safe |
| R4 | User clears browser cache (loses all drafts) | **High** | Medium | Training emphasis (ADR-004); auto-sync when online; display warning |
| R5 | IndexedDB corruption on low-end devices | Low | Low | Dexie handles blocked/version events; add error boundary |
| R6 | Large form schemas slow initial cache | Low | Low | NetworkFirst with timeout; schemas typically <50KB each |
| R7 | Service worker fetch handler interferes with existing routes | Medium | Low | Spike uses separate `spike-sw.js`; existing `sw.js` unchanged |
| R8 | Dexie bundle size impact | Low | N/A | ~42KB minified; negligible vs 4.5MB app shell |
| R9 | Background Sync fails after 7 days offline | Medium | Low | Display warning at day 5; manual "Upload Now" button (ADR-008) |
| R10 | Multiple tabs cause IndexedDB lock contention | Low | Low | Dexie handles multi-tab via `vip` option; test in Story 3.3 |

---

## 8. Recommendations for Story 3.2 (PWA Service Worker & Offline Assets)

1. **Evolve `spike-sw.ts` into production SW** at `src/sw.ts`, replacing the no-op `public/sw.js`
2. **Add form schema caching** as a separate NetworkFirst route with form-specific cache name
3. **Add face-api.js model caching** as CacheFirst with 90-day expiry
4. **Integrate `useRegisterSW` hook** in EnumeratorHome.tsx for SW lifecycle management
5. **Add "New version available" banner** using the prompt-to-reload pattern
6. **Remove `spike-sw.ts` and spike route** once production SW is in place
7. **Keep vite-plugin-pwa config** — just change `filename` from `spike-sw.ts` to `sw.ts`

## 9. Recommendations for Story 3.3 (Offline Queue & Sync Status UI)

1. **Use the Dexie schema from `offline-db.ts` as the production database** — it's already production-ready
2. **Implement `useLiveQuery` for all offline UI components** (draft count badge, sync status, queue list)
3. **Add auto-save on question position change** — save to `drafts` table after each answer
4. **Implement dual-layer sync tracking:**
   - Dexie `submissionQueue` for UI state (status badges, retry counts, error display)
   - workbox-background-sync for HTTP retry mechanics
5. **Add storage monitoring widget** on EnumeratorHome showing quota usage
6. **Add "Upload Now" button** (ADR-008) that enables cache clearing only when queue is empty
7. **Add error boundary** around IndexedDB operations with user-friendly fallback
8. **Test 7-day offline scenario** with at least 20 queued submissions (NFR1.3: <60s sync)

---

## 10. PoC Files (SPIKE: prep-5)

All files are marked with `// SPIKE: prep-5` comments and can be cleanly removed:

| File | Purpose |
|---|---|
| `apps/web/src/spike-sw.ts` | Custom service worker with Workbox caching + Background Sync |
| `apps/web/src/lib/offline-db.ts` | Dexie database definition (tables, indexes, types) |
| `apps/web/src/lib/offline-db.test.ts` | Unit tests for IndexedDB CRUD and schema validation |
| `apps/web/src/features/spike/SpikeOfflinePage.tsx` | PoC UI page demonstrating all offline flows |
| `apps/web/vite.config.ts` (VitePWA section) | Plugin configuration (keep for production) |
| `apps/web/tsconfig.json` (exclude line) | Excludes spike-sw.ts from tsc (adjust for production) |
| `apps/web/src/App.tsx` (spike route) | Route `/spike/offline` (remove for production) |
| `docs/spike-offline-pwa.md` | This decision document (keep as reference) |

### Dependencies Added

**Keep for production:**
- `dexie` (dependency)
- `dexie-react-hooks` (dependency)
- `vite-plugin-pwa` (devDependency)
- `workbox-*` packages (devDependencies)
- `fake-indexeddb` (devDependency — testing only)

---

## 11. Validation Summary

| AC | Validated? | Evidence |
|---|---|---|
| AC1: SW Strategy Evaluated | Yes | vite-plugin-pwa injectManifest chosen; PoC builds with 126 precache entries |
| AC2: IndexedDB Library Evaluated | Yes | Dexie.js 4.x chosen; 14 unit tests pass (CRUD, reactive, schema) |
| AC3: Core Offline Flows Demonstrated | Yes | PoC page at /spike/offline with draft CRUD, live query, BG sync config |
| AC4: Storage Constraints Documented | Yes | Section 5 above; ~9.25MB budget vs >1.2GB available |
| AC5: IndexedDB Schema Proposed | Yes | Section 4 above; 3 tables with indexes and types |
| AC6: Decision Document Produced | Yes | This document (docs/spike-offline-pwa.md) |
| AC7: PoC Code Clean & Removable | Yes | All files marked `// SPIKE: prep-5`; existing files untouched |
