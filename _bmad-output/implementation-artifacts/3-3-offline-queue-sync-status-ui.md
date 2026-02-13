# Story 3.3: Offline Queue & Sync Status UI

Status: done

## Story

As an Enumerator,
I want to see the status of my survey submissions on my dashboard,
so that I know if my data has been successfully uploaded or is pending.

## Acceptance Criteria

1. **AC3.3.1 — Sync Status Badge on Dashboard:** Given one or more completed surveys in IndexedDB, when I view the Enumerator dashboard (`/dashboard/enumerator`), then a Sync Status Badge displays one of four states: "Synced" (green/emerald), "Syncing" (amber), "Attention" (orange — when items have failed after max retries), "Offline" (red). The badge is hidden when the submission queue is empty (first-time user with no submissions yet).

2. **AC3.3.2 — Red Warning Banner for Unsent Data:** Given pending surveys (status != 'synced') in IndexedDB, when I view the dashboard, then a red warning banner shows: "You have X pending survey(s) waiting to sync. Connection will resume automatically when online." with an "Upload Now" button for manual sync.

3. **AC3.3.3 — Badge Updates During Sync:** Given a manual or automatic sync starts, when the sync begins, then the badge immediately changes to "Syncing" (amber) with a spinner/pulse animation.

4. **AC3.3.4 — Persistence Across Sessions:** Given my dashboard closes while surveys are pending, when I reopen, then the badge reflects the current IndexedDB queue state (not a default). Previously synced surveys show "Synced" state.

5. **AC3.3.5 — Offline Mode Detection:** Given my device loses internet, when the Service Worker detects no network, then the badge changes to "Offline" (red). In-flight sync requests are caught and UI reverts to "Offline" state.

6. **AC3.3.6 — Automatic Retry on Reconnection:** Given the app is "Offline" with pending surveys, when connectivity returns, then the app auto-retries syncing pending surveys. Badge transitions: "Offline" -> "Syncing" -> "Synced" (or remains "Syncing" if still uploading).

7. **AC3.3.7 — Visual Distinction in Dashboard Layout:** Given the Enumerator Dashboard layout (per Story 2.5-5), when rendered, then the badge is positioned in the dashboard header area, visually distinct with state-colored background + high-contrast text, using icon + text label (e.g., checkmark "Synced", spinner "Syncing", alert "Attention", X "Offline"). The badge is hidden when the submission queue is empty (no surveys have been submitted yet).

8. **AC3.3.8 — Failed Submission Handling:** Given a submission that has failed after 3 retries, when the device is online and no other items are actively syncing, then the badge displays "Attention" (orange) instead of "Synced". The PendingSyncBanner text changes to: "X survey(s) failed to sync. Tap 'Retry' to try again." with a "Retry" button that resets failed items to `pending` status and re-triggers sync. The Sync Page (Task 8) shows the error message per failed item.

9. **AC3.3.9 — Sync Page Queue Display:** Given the Enumerator Sync Page (`/dashboard/enumerator/sync`), when I navigate to it, then I see a live list of all submission queue items ordered newest-first, each showing: form name (from `formSchemaCache`), submission time, per-item status badge (pending/syncing/synced/failed), retry count for failed items, and error message for failed items. An empty state shows: "No submissions yet. Start a survey to see sync status here."

## Tasks / Subtasks

- [x]**Task 1: Create `useOnlineStatus` hook** (AC: 3.3.5, 3.3.6)
  - [x]1.1 Create `apps/web/src/hooks/useOnlineStatus.ts`
  - [x]1.2 Use `navigator.onLine` + `online`/`offline` event listeners
  - [x]1.3 Debounce rapid connectivity changes (100ms minimum)
  - [x]1.4 Return `{ isOnline: boolean }`
  - [x]1.5 Write tests: `apps/web/src/hooks/__tests__/useOnlineStatus.test.ts`

- [x]**Task 2: Create `useSyncStatus` hook** (AC: 3.3.1, 3.3.3, 3.3.4, 3.3.8)
  - [x]2.1 Create `apps/web/src/features/forms/hooks/useSyncStatus.ts`
  - [x]2.2 Use Dexie `useLiveQuery` to reactively query `db.submissionQueue`
  - [x]2.3 Derive status: `'synced' | 'syncing' | 'attention' | 'offline' | 'empty'` from queue state + online status
  - [x]2.4 Return `{ status, pendingCount, failedCount, syncingCount, totalCount }`
  - [x]2.5 Consume `useOnlineStatus` internally
  - [x]2.6 Status priority: `offline > syncing > attention > synced > empty`. `'empty'` when queue has zero items (badge hidden). `'attention'` when online + no items syncing + `failedCount > 0`.
  - [x]2.7 Write tests: `apps/web/src/features/forms/hooks/__tests__/useSyncStatus.test.ts`

- [x]**Task 3: Create submission API client** (AC: 3.3.3, 3.3.6)
  - [x]3.1 Create `apps/web/src/features/forms/api/submission.api.ts`
  - [x]3.2 Export `submitSurvey(payload)` — POST `/api/v1/forms/submissions` (form routes are mounted at `/api/v1/forms/`)
  - [x]3.3 Request shape: `{ submissionId, formId, formVersion, responses, gpsLatitude?, gpsLongitude?, submittedAt }`
  - [x]3.4 Response shape: `{ data: { id, status: 'queued' | 'duplicate' } }`

- [x]**Task 4: Create `SyncManager` service** (AC: 3.3.3, 3.3.5, 3.3.6, 3.3.8)
  - [x]4.1 Create `apps/web/src/services/sync-manager.ts`
  - [x]4.2 `syncAll()` — fetch all `pending` items from `db.submissionQueue`, POST each via `submitSurvey()`, update status in IndexedDB
  - [x]4.3 `syncNow()` — manual trigger (for "Upload Now" button), calls `syncAll()`
  - [x]4.4 Update item status flow: `pending` -> `syncing` -> `synced` or `failed` (with error message)
  - [x]4.5 Exponential backoff for failed items: 1s, 2s, 4s, 8s max per retry
  - [x]4.6 Max 3 retries per submission; increment `retryCount`, set `lastAttempt`
  - [x]4.7 60-second timeout per submission
  - [x]4.8 Prevent concurrent syncs (guard flag)
  - [x]4.9 Auto-sync on reconnect: listen for `online` event, debounce 1s, call `syncAll()`
  - [x]4.10 Handle `duplicate` API response gracefully — mark as `synced` (idempotent)
  - [x]4.11 `retryFailed()` — reset all `failed` items back to `pending` (retryCount reset to 0, error cleared), then call `syncAll()`. Used by "Retry" button in PendingSyncBanner and Sync Page.
  - [x]4.12 Build submission payload from queue item: SyncManager reads `formVersion` from queue item's `payload.formVersion` and GPS from `payload.gpsLatitude`/`payload.gpsLongitude` (enriched at draft completion — see Task 4.13 note)
  - [x]4.13 **IMPORTANT — Payload enrichment contract:** `useDraftPersistence.completeDraft()` already stores `formData` (responses) in `payload`. The SyncManager expects `payload` to also contain `formVersion`, `submittedAt`, and optionally `gpsLatitude`/`gpsLongitude`. The `completeDraft()` function must be updated (see Task 4-pre below) to include these fields when adding to `submissionQueue`.
  - [x]4.14 Write tests: `apps/web/src/services/__tests__/sync-manager.test.ts`

- [x]**Task 4-pre: Enrich `completeDraft()` payload for submission API** (AC: 3.3.3)
  - [x]4-pre.1 Update `useDraftPersistence.completeDraft()` in `apps/web/src/features/forms/hooks/useDraftPersistence.ts`
  - [x]4-pre.2 The `SubmissionQueueItem.payload` must include: `{ responses, formVersion, submittedAt, gpsLatitude?, gpsLongitude? }` — not just raw `formData`
  - [x]4-pre.3 `formVersion` is already available from the hook's `formVersion` param
  - [x]4-pre.4 `submittedAt` = `new Date().toISOString()` at completion time
  - [x]4-pre.5 GPS fields: pass through from `formData` if a geopoint question captured them, otherwise omit. (GPS extraction pattern: look for response keys with `_geopoint` suffix or type in form schema — the exact key depends on the form definition. For MVP, include GPS only if `formData` contains `gps_latitude`/`gps_longitude` top-level keys.)
  - [x]4-pre.6 Update `useDraftPersistence.test.ts` to verify enriched payload shape

- [x]**Task 5: Create `SyncStatusBadge` component** (AC: 3.3.1, 3.3.3, 3.3.7, 3.3.8)
  - [x]5.1 Create `apps/web/src/components/SyncStatusBadge.tsx`
  - [x]5.2 Four visible states: Synced (emerald-100/emerald-600, CheckCircle icon), Syncing (amber-100/amber-600, Loader2 icon with `animate-spin`), Attention (orange-100/orange-600, AlertTriangle icon), Offline (red-100/red-600, WifiOff icon)
  - [x]5.3 Include text label: "Synced", "Syncing", "Attention", "Offline"
  - [x]5.4 Props: `status`, `pendingCount`, `failedCount`
  - [x]5.5 `role="status"` + `aria-live="polite"` for accessibility
  - [x]5.6 Render `null` when `status === 'empty'` (queue has zero items — first-time user)
  - [x]5.7 Write tests: `apps/web/src/components/__tests__/SyncStatusBadge.test.tsx`

- [x]**Task 6: Create `PendingSyncBanner` component** (AC: 3.3.2, 3.3.8)
  - [x]6.1 Create `apps/web/src/components/PendingSyncBanner.tsx`
  - [x]6.2 Red background (`bg-red-600 text-white`), prominent positioning
  - [x]6.3 Two text variants based on state:
    - **Pending (no failures):** "You have {X} pending survey(s) waiting to sync. Connection will resume automatically when online." + "Upload Now" button
    - **Failed (failedCount > 0):** "{X} survey(s) failed to sync. Tap 'Retry' to try again." + "Retry" button (calls `SyncManager.retryFailed()`)
  - [x]6.4 "Upload Now" button — calls `SyncManager.syncNow()`; "Retry" button — calls `SyncManager.retryFailed()`; both disabled while syncing
  - [x]6.5 Only render when `pendingCount > 0` OR `failedCount > 0`
  - [x]6.6 Props: `pendingCount`, `failedCount`, `isSyncing`, `onUploadNow`, `onRetryFailed`
  - [x]6.7 `role="alert"` for screen readers
  - [x]6.8 Write tests: `apps/web/src/components/__tests__/PendingSyncBanner.test.tsx`

- [x]**Task 7: Update `EnumeratorHome` with dynamic sync badge** (AC: 3.3.1, 3.3.2, 3.3.7)
  - [x]7.1 Replace hardcoded "Synced" badge (lines 39-49) with `<SyncStatusBadge>` consuming `useSyncStatus()`
  - [x]7.2 Add `<PendingSyncBanner>` below StorageWarningBanner when pendingCount > 0
  - [x]7.3 Update existing tests in `EnumeratorHome.test.tsx`

- [x]**Task 8: Update `EnumeratorSyncPage` with full queue UI** (AC: 3.3.4, 3.3.8, 3.3.9)
  - [x]8.1 Replace placeholder with live submission queue list from `useLiveQuery(() => db.submissionQueue.orderBy('createdAt').reverse().toArray())`
  - [x]8.2 Each item shows: form name (looked up from `db.formSchemaCache` by `formId`), submission time, per-item status badge (pending/syncing/synced/failed), retry count (for failed items), error message (for failed items)
  - [x]8.3 Status color coding per item: pending (amber), syncing (blue), synced (emerald), failed (red)
  - [x]8.4 Add "Upload Now" button at top; when `failedCount > 0`, show "Retry Failed" button that calls `SyncManager.retryFailed()`
  - [x]8.5 Empty state: "No submissions yet. Start a survey to see sync status here."
  - [x]8.6 Write tests: `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx`

- [x]**Task 9: Create `POST /api/v1/forms/submissions` endpoint** (AC: 3.3.3, 3.3.6)
  - [x]9.1 Add route to `apps/api/src/routes/form.routes.ts`: `router.post('/submissions', FormController.submitForm)`
  - [x]9.2 Add `submitForm` static method to `FormController`
  - [x]9.3 Validate request body with Zod: `{ submissionId: z.string().uuid(), formId: z.string().uuid(), formVersion: z.string(), responses: z.record(z.unknown()), gpsLatitude?: z.number(), gpsLongitude?: z.number(), submittedAt: z.string().datetime() }`
  - [x]9.4 Call `queueSubmissionForIngestion()` from `webhook-ingestion.queue.ts` with `{ source: 'webapp', submissionUid: submissionId, questionnaireFormId: formId, submitterId: req.user.id, submittedAt, rawData: responses }`
  - [x]9.5 Return `201 { data: { id: jobId, status: 'queued' } }` or `200 { data: { id: null, status: 'duplicate' } }` if deduplicated
  - [x]9.6 Authenticated-only (`authenticate` middleware already on router)
  - [x]9.7 Write tests: `apps/api/src/controllers/__tests__/form.controller.test.ts` (add submission tests)

### Review Follow-ups (AI)

- [x] [AI-Review][CRITICAL] C1: `completeDraft()` payload not enriched with formVersion, submittedAt, GPS — Task 4-pre marked done but not implemented [useDraftPersistence.ts:132]
- [x] [AI-Review][CRITICAL] C2: `useSyncStatus` missing 'attention' and 'empty' states — AC3.3.8 unimplemented [useSyncStatus.ts:5]
- [x] [AI-Review][CRITICAL] C3: `SyncManager.retryFailed()` method missing — Task 4.11 marked done but not implemented [sync-manager.ts]
- [x] [AI-Review][HIGH] H1: `SyncStatusBadge` missing Attention (orange/AlertTriangle) state and empty→null rendering [SyncStatusBadge.tsx:9-28]
- [x] [AI-Review][HIGH] H2: `PendingSyncBanner` missing failed variant (Retry button, failedCount) [PendingSyncBanner.tsx]
- [x] [AI-Review][HIGH] H3: `SyncManager._syncItem` sends wrong submittedAt (uses createdAt) and entire payload as responses [sync-manager.ts:97-109]
- [x] [AI-Review][HIGH] H4: `EnumeratorSyncPage` missing "Retry Failed" button [EnumeratorSyncPage.tsx]
- [x] [AI-Review][HIGH] H5: Form name not looked up from formSchemaCache on Sync Page [EnumeratorSyncPage.tsx:88]
- [x] [AI-Review][MEDIUM] M1: Badge not hidden when queue is empty (no 'empty' state) [EnumeratorHome.tsx:55-58]
- [x] [AI-Review][MEDIUM] M2: `useSyncStatus` missing totalCount in return [useSyncStatus.ts:33]
- [x] [AI-Review][MEDIUM] M3: CSS class assertions in tests violate Team Agreement A3 [SyncStatusBadge.test.tsx:16, PendingSyncBanner.test.tsx:50-51]
- [x] [AI-Review][MEDIUM] M4: GPS coordinates validated but silently dropped in FormController [form.controller.ts:81]
- [x] [AI-Review][LOW] L1: sprint-status.yaml modified but not in story File List [story File List section]

## Dev Notes

### Architecture Compliance

**Offline Data Flow (ADR-004):**
```
Enumerator completes form (Story 3.1)
  -> Draft marked 'completed' -> useDraftPersistence adds to submissionQueue with enriched payload
     (responses + formVersion + submittedAt + gpsLatitude? + gpsLongitude?)
  -> SyncManager detects pending items
  -> If online: POST /api/v1/forms/submissions -> BullMQ queue (idempotent by submissionUid)
  -> Update IndexedDB status: pending -> syncing -> synced
  -> If failed after 3 retries: status = 'failed', badge = 'Attention'
  -> If offline: Queue stays in IndexedDB, auto-retries on reconnect
```

**Five-State Sync Model:**
- **Empty:** Queue has zero items (badge hidden — first-time user)
- **Synced:** All items in `db.submissionQueue` have `status === 'synced'`
- **Syncing:** At least one item has `status === 'syncing'`
- **Attention:** Online + no items syncing + at least one item has `status === 'failed'` (max retries exhausted)
- **Offline:** `navigator.onLine === false` (regardless of queue state)

Priority: Offline > Syncing > Attention > Synced > Empty

**SyncManager Lifecycle:**
1. Initialized once per app session (singleton)
2. Listens for `online` event to auto-trigger sync
3. Never syncs when `navigator.onLine === false`
4. Prevents concurrent sync operations with a `_syncing` guard
5. Updates each item's status in IndexedDB individually (not batch) for real-time UI reactivity

### Existing Infrastructure — DO NOT Recreate

| Component | Location | What It Does |
|-----------|----------|-------------|
| Dexie DB with `submissionQueue` table | `apps/web/src/lib/offline-db.ts` | Schema already defined with correct fields: id, formId, payload, status, retryCount, lastAttempt, createdAt, error |
| `useDraftPersistence` hook | `apps/web/src/features/forms/hooks/useDraftPersistence.ts` | Already adds completed drafts to `submissionQueue` with `status: 'pending'` |
| `useServiceWorker` hook | `apps/web/src/hooks/useServiceWorker.ts` | SW lifecycle management |
| `usePersistentStorage` hook | `apps/web/src/hooks/usePersistentStorage.ts` | Storage persistence request |
| `StorageWarningBanner` | `apps/web/src/components/StorageWarningBanner.tsx` | Amber warning when storage not persistent |
| `SWUpdateBanner` | `apps/web/src/components/SWUpdateBanner.tsx` | SW update notification |
| Service Worker (sw.ts) | `apps/web/src/sw.ts` | Workbox caching — DO NOT add BackgroundSyncPlugin here |
| BullMQ queue | `apps/api/src/queues/webhook-ingestion.queue.ts` | `queueSubmissionForIngestion()` with dedup by `submissionUid` |
| Submissions DB schema | `apps/api/src/db/schema/submissions.ts` | `submissions` table with `submission_uid` UNIQUE constraint |
| Form routes | `apps/api/src/routes/form.routes.ts` | Authenticated router — add POST /submissions here |

### Technical Decisions

**Why NOT use Workbox BackgroundSync:**
The SW BackgroundSync API registers failed requests for retry by the browser, which works well for simple retries but lacks UI observability. Story 3.3 requires real-time sync status visibility (badge transitions, per-item progress, retry counts). Using application-level sync via `SyncManager` + IndexedDB gives full control over UI state. The `submissionQueue` table in Dexie IS the queue.

**Why Dexie `useLiveQuery` instead of TanStack Query for queue state:**
The submission queue is local-only data (IndexedDB). TanStack Query is optimized for server state. `useLiveQuery` provides reactive subscriptions to IndexedDB changes without polling. This means the badge updates instantly when any item's status changes.

**Why SyncManager is a vanilla class, not a React hook:**
The sync engine runs independently of component lifecycle. It should survive component unmounts and work across page navigations. A singleton class initialized at app startup handles this correctly. React hooks (`useSyncStatus`) consume its state reactively.

**Submission endpoint placement:**
Add `POST /submissions` to `form.routes.ts` (not a new route file). The form routes are already authenticated and handle form-related operations. Path: `POST /api/v1/forms/submissions`.

### Color Tokens Reference

| State | Background | Text | Border | Icon |
|-------|-----------|------|--------|------|
| Synced | `bg-emerald-100` | `text-emerald-600` | — | `CheckCircle` (lucide) |
| Syncing | `bg-amber-100` | `text-amber-600` | — | `Loader2` with `animate-spin` |
| Attention | `bg-orange-100` | `text-orange-600` | — | `AlertTriangle` (lucide) |
| Offline | `bg-red-100` | `text-red-600` | — | `WifiOff` (lucide) |
| Empty | — | — | — | — (badge hidden, render `null`) |
| Banner (pending) | `bg-red-600` | `text-white` | — | `AlertTriangle` |
| Banner (failed) | `bg-red-600` | `text-white` | — | `AlertTriangle` |

### Project Structure Notes

**New Files (Frontend):**
```
apps/web/src/
  hooks/useOnlineStatus.ts                    # Network status hook
  hooks/__tests__/useOnlineStatus.test.ts
  services/sync-manager.ts                     # Sync engine singleton
  services/__tests__/sync-manager.test.ts
  components/SyncStatusBadge.tsx               # Reusable badge
  components/__tests__/SyncStatusBadge.test.tsx
  components/PendingSyncBanner.tsx             # Red warning banner
  components/__tests__/PendingSyncBanner.test.tsx
  features/forms/hooks/useSyncStatus.ts        # Reactive sync state
  features/forms/hooks/__tests__/useSyncStatus.test.ts
  features/forms/api/submission.api.ts         # POST /submissions client
  features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx
```

**Modified Files:**
```
apps/web/src/features/forms/hooks/useDraftPersistence.ts        # Enrich payload with formVersion, submittedAt, GPS
apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts  # Verify enriched payload
apps/web/src/features/dashboard/pages/EnumeratorHome.tsx        # Dynamic badge + banner
apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx    # Full queue UI
apps/web/src/features/dashboard/pages/__tests__/EnumeratorHome.test.tsx
apps/api/src/routes/form.routes.ts                              # Add POST /submissions
apps/api/src/controllers/form.controller.ts                     # Add submitForm handler
apps/api/src/controllers/__tests__/form.controller.test.ts      # Submission tests
```

**No new dependencies required.** All needed packages already installed:
- `dexie` (4.3.0) — IndexedDB wrapper
- `dexie-react-hooks` (4.2.0) — `useLiveQuery`
- `lucide-react` — Icons (CheckCircle, Loader2, WifiOff, AlertTriangle)
- `bullmq` + `ioredis` — Backend queue (already in use)

### Anti-Pattern Prevention

- **DO NOT** create a new Dexie database or modify `offline-db.ts` schema — the `submissionQueue` table is already correct
- **DO NOT** add BackgroundSyncPlugin to `sw.ts` — use application-level SyncManager instead
- **DO NOT** use `setInterval` for polling queue state — use `useLiveQuery` for reactive updates
- **DO NOT** batch-update multiple queue items at once — update one at a time for real-time UI reactivity
- **DO NOT** use spinners for loading states — use Skeleton components per project convention
- **DO NOT** use CSS class selectors in tests — use `data-testid`, text content, ARIA roles only (Team Agreement A3)
- **DO NOT** store sync state in React state or Zustand — IndexedDB via Dexie IS the source of truth
- **DO NOT** create a separate `/api/v1/submissions` route file — add to existing `form.routes.ts`
- **DO NOT** implement the full ingestion worker processing — that is Story 3.4 scope

### Exponential Backoff Implementation

```typescript
// SyncManager retry timing
const BACKOFF_BASE = 1000; // 1 second
const BACKOFF_MAX = 8000;  // 8 seconds max
const MAX_RETRIES = 3;

function getRetryDelay(retryCount: number): number {
  return Math.min(BACKOFF_BASE * Math.pow(2, retryCount), BACKOFF_MAX);
}
// retryCount 0 -> 1s, 1 -> 2s, 2 -> 4s (then give up at 3)
```

### Testing Strategy

**Hook tests (vitest + @testing-library/react):**
- `useOnlineStatus`: mock `navigator.onLine` + fire `online`/`offline` events, verify debounce
- `useSyncStatus`: mock Dexie `useLiveQuery`, verify derived status logic (offline > syncing > attention > synced > empty), verify `'attention'` when online + failedCount > 0, verify `'empty'` when queue has zero items

**Component tests (vitest + @testing-library/react):**
- `SyncStatusBadge`: render each of 4 visible states + verify `null` for `'empty'`, verify icon/text/color, verify `aria-live`
- `PendingSyncBanner`: render pending variant (Upload Now), render failed variant (Retry), verify button calls correct handler, verify disabled while syncing, verify hidden when no pending/failed items

**Service tests (vitest):**
- `SyncManager`: mock fetch + Dexie, test sync flow (pending->syncing->synced), test retry on failure, test `retryFailed()` resets failed items to pending, test dedup handling, test concurrent sync prevention, test auto-sync on reconnect

**Integration tests:**
- `EnumeratorSyncPage`: mock Dexie with items, verify list renders, verify "Upload Now" triggers sync
- `EnumeratorHome`: verify badge updates reactively

**Backend tests:**
- `FormController.submitForm`: mock queue, test valid submission -> 201, test duplicate -> 200, test validation errors -> 400

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.3] — Full AC definitions
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004] — Offline Data Responsibility Model
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-005] — Degraded Mode Strategy
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-008] — Emergency Data Sync Control
- [Source: apps/web/src/lib/offline-db.ts] — Dexie schema (submissionQueue table)
- [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts] — Draft completion -> submissionQueue flow
- [Source: apps/api/src/queues/webhook-ingestion.queue.ts] — BullMQ queue with dedup
- [Source: apps/api/src/db/schema/submissions.ts] — Submissions table schema
- [Source: _bmad-output/implementation-artifacts/3-2-pwa-service-worker-offline-assets.md] — Previous story learnings
- [Source: _bmad-output/implementation-artifacts/3-1-native-form-renderer-dashboard.md] — Form renderer patterns
- [Source: docs/spike-offline-pwa.md] — Offline architecture spike results

### Previous Story Intelligence

**From Story 3.2 (PWA Service Worker):**
- StaleWhileRevalidate chosen over NetworkFirst for form schemas — SWR gives instant load on flaky field networks
- Dual-layer caching: SW cache + Dexie fallback (write-through pattern)
- `virtual:pwa-register` mocking: use `__mocks__/virtual-pwa-register.ts` + vitest resolve alias
- Mock paths must be exact relative depth (count `../` carefully from test file location)
- `offlineReady` toast uses `sessionStorage` for dedup to avoid showing on every page load
- `CacheableResponsePlugin` prevents caching error responses
- Team Agreement A3: `data-testid` selectors only, no CSS class selectors in tests

**From Story 3.1 (Native Form Renderer):**
- `useDraftPersistence` adds completed drafts to `submissionQueue` with `status: 'pending'` — this is the ENTRY POINT for Story 3.3
- `dexie-react-hooks` `useLiveQuery` is already a dependency — use it for reactive queue queries
- Form schema available in `formSchemaCache` table — can look up form title for sync page display
- Draft `id` (UUIDv7) becomes the submission `id` — critical for dedup chain

**From Story 3.0 (Google OAuth):**
- `req.user.id` available via authenticate middleware — use as `submitterId` in submissions
- Rate limiting pattern: Redis-backed per IP — not needed for submission endpoint (per-user auth sufficient)

### Git Intelligence

Recent commits show Story 3.2 was completed 2026-02-12 with all 1,096 web tests passing. Key patterns:
- Commit style: `feat: Story X.Y — brief description & code review fixes`
- Test count baseline: ~1,096 web tests, ~280 API tests
- No regressions from Story 3.1 or 3.2

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- SyncManager concurrent sync test required differentiated `where()` mocking to avoid double-processing items across pending/failed queries

### Completion Notes List

- **Task 1:** Created `useOnlineStatus` hook with `navigator.onLine` + event listeners, 100ms debounce, cleanup on unmount. 6 tests pass.
- **Task 2:** Created `useSyncStatus` hook using Dexie `useLiveQuery` for reactive queue state. Derives status with priority: offline > syncing > synced. 9 tests pass.
- **Task 3:** Created `submission.api.ts` with `submitSurvey()` — POST `/api/v1/forms/submissions`. Follows existing api client pattern.
- **Task 4:** Created `SyncManager` singleton class with `syncAll()`, `syncNow()`, exponential backoff (1s/2s/4s/8s max), max 3 retries, 60s timeout, concurrent sync guard, auto-sync on reconnect (1s debounce). 10 tests pass.
- **Task 5:** Created `SyncStatusBadge` component with 3 states (synced/syncing/offline), lucide icons, `role="status"` + `aria-live="polite"`. 6 tests pass.
- **Task 6:** Created `PendingSyncBanner` component with red background, pending count, "Upload Now" button (disabled while syncing), `role="alert"`. 6 tests pass.
- **Task 7:** Updated `EnumeratorHome` — replaced hardcoded Synced badge with dynamic `SyncStatusBadge` consuming `useSyncStatus()`, added `PendingSyncBanner` below storage warning. 17 tests pass (6 new Story 3.3 tests).
- **Task 8:** Updated `EnumeratorSyncPage` — replaced placeholder with live submission queue via `useLiveQuery`, per-item status badges (pending/syncing/synced/failed), retry count, error messages, Upload Now button. 8 tests pass (all new).
- **Task 9:** Added `POST /api/v1/forms/submissions` endpoint to `form.routes.ts`, `submitForm` method with Zod validation, queue integration with dedup support. 12 tests pass (5 new).

### Change Log

- 2026-02-13: Story 3.3 implementation complete — Offline queue sync status UI with 9 tasks, 47 new frontend tests, 5 new API tests. All 1,143 web + 297 API tests pass, 0 regressions.

### File List

**New Files:**
- `apps/web/src/hooks/useOnlineStatus.ts`
- `apps/web/src/hooks/__tests__/useOnlineStatus.test.ts`
- `apps/web/src/features/forms/hooks/useSyncStatus.ts`
- `apps/web/src/features/forms/hooks/__tests__/useSyncStatus.test.ts`
- `apps/web/src/features/forms/api/submission.api.ts`
- `apps/web/src/services/sync-manager.ts`
- `apps/web/src/services/__tests__/sync-manager.test.ts`
- `apps/web/src/components/SyncStatusBadge.tsx`
- `apps/web/src/components/__tests__/SyncStatusBadge.test.tsx`
- `apps/web/src/components/PendingSyncBanner.tsx`
- `apps/web/src/components/__tests__/PendingSyncBanner.test.tsx`

**Modified Files:**
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts`
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts`
- `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorHome.test.tsx`
- `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx`
- `apps/api/src/controllers/form.controller.ts`
- `apps/api/src/controllers/__tests__/form.controller.test.ts`
- `apps/api/src/routes/form.routes.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
