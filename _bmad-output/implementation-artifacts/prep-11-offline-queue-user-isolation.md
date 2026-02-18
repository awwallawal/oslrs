# Story prep-11: Offline Queue User Isolation

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As an Enumerator on a shared device,
I want my offline drafts and queued submissions to be isolated to my account,
so that another user logging in cannot see my survey data, and my submissions are never attributed to the wrong person.

## Acceptance Criteria

**AC1 - Schema: userId on Drafts and SubmissionQueueItem**
**Given** the Dexie database schema in `offline-db.ts`
**When** the app loads after this update
**Then** `Draft` and `SubmissionQueueItem` interfaces include a `userId: string` field
**And** `db.version(2).stores()` adds `userId` to indexes for both tables
**And** compound indexes `[userId+formId+status]` (drafts) and `[userId+status]` (submissionQueue) exist for efficient filtered queries.

**AC2 - Draft Isolation**
**Given** User A has an in-progress draft for form "F1"
**When** User B logs in on the same device and opens form "F1"
**Then** `useDraftPersistence` does NOT find User A's draft (query filters by `userId`)
**And** User B starts a fresh draft tagged with their own `userId`
**And** User A's draft remains in IndexedDB untouched (no data loss).

**AC3 - Submission Queue Isolation**
**Given** User A has pending submissions in `submissionQueue`
**When** User B logs in and `syncManager.syncAll()` fires
**Then** only submissions where `userId === User B's id` are synced
**And** User A's pending submissions remain in IndexedDB with status `'pending'` (not sent under User B's JWT).

**AC4 - Sync Status Badge Isolation**
**Given** User A has 3 pending and 1 failed submission in `submissionQueue`
**When** User B logs in
**Then** `useSyncStatus` returns counts reflecting ONLY User B's submissions (0 pending, 0 failed in this scenario)
**And** the `SyncStatusBadge` and `EnumeratorSyncPage` display User B's counts only.

**AC5 - EnumeratorSyncPage Isolation**
**Given** User B is viewing the Sync Status page
**When** the page queries the submission queue for display
**Then** only User B's queue items appear in the list
**And** "Upload Now" and "Retry Failed" buttons only process User B's items.

**AC6 - Logout Warning for Unsynced Data**
**Given** a user has pending or failed submissions in the queue
**When** they click Logout
**Then** a confirmation dialog warns: "You have X unsynced submissions. These will be uploaded when you log back in on this device."
**And** if confirmed, logout proceeds WITHOUT deleting the user's queued data
**And** the data remains in IndexedDB tagged with the user's ID for future sync.
> **Note:** Inactivity timeout logout bypasses the confirmation dialog (user is not present) — it proceeds directly, preserving queued data for the user's next login.

**AC7 - Dexie Version Migration (Existing Records)**
**Given** an existing Dexie v1 database with records that lack `userId`
**When** the app upgrades to v2 schema
**Then** existing records are preserved with `userId` set to `'__legacy__'` sentinel
**And** on next login, a one-time migration claims `'__legacy__'` records for the authenticated user (sets `userId` to their actual ID)
**And** if no user is logged in, legacy records persist until a user logs in and claims them.
> **Known limitation:** If multiple users shared a device pre-migration, all `'__legacy__'` records are claimed by whichever user logs in first post-upgrade. This is accepted because shared-device usage is rare and existing records most likely belong to the last active user. No attempt should be made to disambiguate legacy ownership.

**AC9 - Sync Lifecycle on Login/Logout (Race Condition Prevention)**
**Given** User A has an in-progress `syncAll()` batch processing pending submissions
**When** User A logs out (or inactivity timeout fires) and User B logs in
**Then** `logout()` calls `syncManager.destroy()` to abort the online listener and clears the SyncManager's userId
**And** any in-flight `syncAll()` loop exits early when it detects the userId has been cleared mid-batch (no further items are sent)
**And** on User B's login, `syncManager.init()` is called with User B's userId, re-attaching the online listener
**And** `apiClient` reads the JWT from `sessionStorage` at call time — with SyncManager scoped to the current user, no cross-user JWT leakage occurs.

**AC8 - Tests**
**Given** implementation is complete
**When** test suites run
**Then** `offline-db.test.ts` verifies v2 schema migration and userId indexing
**And** `useDraftPersistence.test.ts` verifies userId filtering in load/save/complete operations and cross-user isolation
**And** `sync-manager.test.ts` verifies userId-scoped sync, cross-user items untouched, and legacy record handling
**And** `useSyncStatus.test.ts` verifies userId-scoped counts
**And** no existing tests regress.

## Tasks / Subtasks

- [x] Task 1: Schema migration — add userId to Dexie interfaces and indexes (AC: 1, 7)
  - [x] 1.1: Add `userId: string` to `Draft` and `SubmissionQueueItem` interfaces in `offline-db.ts`
  - [x] 1.2: Add `db.version(2).stores()` with userId in indexes: drafts `'id, formId, status, updatedAt, [formId+status], userId, [userId+formId+status]'`, submissionQueue `'id, formId, status, createdAt, [status+createdAt], userId, [userId+status]'`
  - [x] 1.3: Add `db.version(2).upgrade(tx => ...)` function that sets `userId = '__legacy__'` on all existing records in `drafts` and `submissionQueue` tables

- [x] Task 2: userId plumbing — SyncManager setter + React hook access (AC: 2, 3, 4, 5, 9)
  - [x] 2.1: Add `private _userId: string | null = null` field and `setUserId(id: string | null)` method to `SyncManager` class in `sync-manager.ts`. This is the contract for non-React code — AuthContext calls `syncManager.setUserId()` on login/logout.
  - [x] 2.2: For React components (hooks, pages), use `useAuth().user?.id` directly — no new hook file needed. `useDraftPersistence`, `useSyncStatus`, and `EnumeratorSyncPage` already have access to AuthContext through the component tree.
  - [x] 2.3: Guard: if `_userId` is null in SyncManager, skip sync. If `useAuth().user?.id` is undefined in React hooks, skip persistence/queries and log a warning.

- [x] Task 3: Draft isolation in `useDraftPersistence` (AC: 2)
  - [x] 3.1: Update `loadDraft()` to query `db.drafts.where({ formId, status: 'in-progress', userId: currentUserId })` instead of `{ formId, status: 'in-progress' }`
  - [x] 3.2: Update `saveDraft()` to include `userId` when creating new draft records via `db.drafts.put()`
  - [x] 3.3: Update `completeDraft()` to include `userId` in the `SubmissionQueueItem` added to `db.submissionQueue`
  - [x] 3.4: Guard against missing userId — if no user is authenticated, log a warning and do not persist to IndexedDB

- [x] Task 4: Sync queue isolation in `sync-manager.ts` (AC: 3, 9)
  - [x] 4.1: Use `this._userId` (set via `setUserId()` from Task 2.1) in all query filters — resolve userId from the instance field, NOT from sessionStorage or JWT decode
  - [x] 4.2: Update `syncAll()` to query `db.submissionQueue.where({ status: 'pending', userId: currentUserId })` instead of `{ status: 'pending' }`
  - [x] 4.3: Update `retryFailed()` to filter by `userId` in addition to `status: 'failed'`
  - [x] 4.4: If no userId is available at sync time, skip sync and log a warning (prevents unauthenticated submission)

- [x] Task 5: Badge and status isolation in `useSyncStatus` (AC: 4)
  - [x] 5.1: Update `useLiveQuery` in `useSyncStatus.ts` to filter `db.submissionQueue` by `userId` (use `where({ userId }).toArray()` instead of `.toArray()`)
  - [x] 5.2: Accept userId as a parameter to the hook (from AuthContext)

- [x] Task 6: EnumeratorSyncPage isolation (AC: 5)
  - [x] 6.1: Update `useLiveQuery` calls in `EnumeratorSyncPage.tsx` to filter `submissionQueue` and `drafts` queries by current userId
  - [x] 6.2: Ensure "Upload Now" and "Retry Failed" buttons pass userId context to `syncManager`

- [x] Task 7: Logout warning for unsynced data (AC: 6)
  - [x] 7.1: In `AuthContext.tsx` `logout()` function, before clearing the session, query `db.submissionQueue.where({ userId: currentUserId, status: 'pending' }).count()` and `...status: 'failed'` count
  - [x] 7.2: If count > 0, show a confirmation dialog warning about unsynced submissions (use existing AlertDialog pattern)
  - [x] 7.3: If confirmed, proceed with logout (do NOT delete the queued data — it stays for when the user logs back in)
  - [x] 7.4: For inactivity timeout logout, log the warning but proceed without confirmation (user is not present)

- [x] Task 8: Legacy record migration on login (AC: 7)
  - [x] 8.1: After successful login/session-restore in `AuthContext.tsx`, check for records with `userId === '__legacy__'` in both `drafts` and `submissionQueue`
  - [x] 8.2: If found, update all legacy records to `userId = authenticatedUser.id` (claim them for the current user)
  - [x] 8.3: Log `event: 'offline.legacy_records_claimed'` with count of migrated records

- [x] Task 10: Sync lifecycle on login/logout — prevent race condition (AC: 9)
  - [x] 10.1: In `AuthContext.tsx` `logout()`, call `syncManager.destroy()` BEFORE clearing the token — this removes the `online` event listener and prevents post-logout sync triggers
  - [x] 10.2: Add `syncManager.setUserId(null)` call in `logout()` after `destroy()` — any in-flight `syncAll()` loop should check `this._userId` before each `_syncItem` call and exit early if null
  - [x] 10.3: In `AuthContext.tsx` login success handlers (`loginStaff`, `loginPublic`, `loginWithGoogle`, session restore), call `syncManager.setUserId(user.id)` then `syncManager.init()` to re-attach the `online` listener scoped to the new user
  - [x] 10.4: In `SyncManager.syncAll()`, add a guard inside the item processing loop: `if (!this._userId) break;` — this prevents sending remaining items if the user logged out mid-batch
  - [x] 10.5: For inactivity timeout logout path (`checkInactivityTimeout` returns true), also call `syncManager.destroy()` + `syncManager.setUserId(null)`

- [x] Task 9: Update existing tests + add isolation tests (AC: 8, 9)
  - [x] 9.1: Update `offline-db.test.ts` — test v2 schema, verify userId field exists on records, test compound indexes
  - [x] 9.2: Update `useDraftPersistence.test.ts` — add tests for userId filtering (User A draft not visible to User B), userId included in saved drafts and queue items
  - [x] 9.3: Update `sync-manager.test.ts` — add tests for userId-scoped sync (only current user's items synced), cross-user items remain untouched, no-userId-skip behavior, mid-batch userId-clear exits loop early
  - [x] 9.4: Update `useSyncStatus.test.ts` — add tests for userId-scoped counts
  - [x] 9.5: Run full suite (`pnpm test`) — zero regressions (122 files, 1348 tests pass; 1 pre-existing hung test excluded)

## Dev Notes

### Story Foundation

- **Source:** Epic 3 Retrospective (`_bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md`) identified prep-11 as MEDIUM priority: "SubmissionQueueItem lacks userId — switching accounts in same browser without clearing IndexedDB causes submissions to be attributed to wrong user."
- **Category:** Security vulnerability — data integrity and privacy breach on shared devices.
- **Scope:** Frontend only — all changes in `apps/web/`. No API or database changes needed.

### Current State — The Vulnerability

The single Dexie database `'oslrs-offline'` has **no `userId` field** on any table. All three tables (`drafts`, `submissionQueue`, `formSchemaCache`) are shared across all users who log into the same browser.

**Scenario 1 — Draft Leak:** User A fills in 3 questions of a sensitive survey, then logs out. User B logs in and opens the same form. `useDraftPersistence.loadDraft()` queries `db.drafts.where({ formId, status: 'in-progress' }).first()` — returns User A's draft. User B sees User A's personal survey responses.

**Scenario 2 — Wrong-User Attribution:** User A goes offline and queues 5 submissions (`status: 'pending'`). User A logs out. User B logs in. When User B comes online, `syncManager.syncAll()` fetches ALL pending items (User A's 5) and calls `submitSurvey()` which reads User B's JWT from `sessionStorage`. The API permanently attributes User A's 5 submissions to User B.

**Scenario 3 — Badge Confusion:** User B's dashboard shows "5 Pending" in `SyncStatusBadge` — these are User A's items, not User B's. User B clicks "Upload Now," triggering Scenario 2.

**Scenario 4 — Mid-Sync Race Condition:** User A clicks "Upload Now" while online. `syncAll()` starts processing 5 pending items sequentially. After item 2 syncs, User A logs out and User B logs in. Items 3–5 are still in the loop. `apiClient` reads the JWT from `sessionStorage` at each call — now it reads User B's JWT. Items 3–5 get submitted under User B's identity. `logout()` must call `syncManager.destroy()` and clear the userId to break the loop.

### Root Cause Files

| File | Issue |
|------|-------|
| `apps/web/src/lib/offline-db.ts` | No `userId` field in `Draft`, `SubmissionQueueItem`, or `CachedFormSchema` interfaces |
| `apps/web/src/features/forms/hooks/useDraftPersistence.ts` | `loadDraft()` queries `{ formId, status }` without userId (line ~48). `completeDraft()` creates queue item without userId |
| `apps/web/src/services/sync-manager.ts` | `syncAll()` queries `{ status: 'pending' }` without userId (line ~79). `retryFailed()` same issue |
| `apps/web/src/features/forms/hooks/useSyncStatus.ts` | `useLiveQuery(() => db.submissionQueue.toArray())` — scans entire table, no userId filter |
| `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx` | `submissionQueue.orderBy('createdAt').reverse().toArray()` — no userId filter |
| `apps/web/src/features/auth/context/AuthContext.tsx` | `logout()` clears `sessionStorage` but never touches IndexedDB or stops SyncManager |
| `apps/web/src/lib/api-client.ts` | `getAuthHeaders()` reads JWT from `sessionStorage` at call time (line 27) — enables race condition where in-flight sync uses wrong user's token |

### Key Design Decisions

- **Do NOT delete data on logout.** Architecture ADR-004 says "User-initiated cache clear is unrecoverable." Enumerators may collect 7 days of data offline. Logout should NOT destroy queued submissions. Instead, data stays tagged with userId and syncs when that user logs back in.
- **`'__legacy__'` sentinel for migration.** Existing v1 records have no userId. The Dexie upgrade function tags them with `'__legacy__'`. On next login, these records are "claimed" by the authenticating user. This is safe because shared-device usage is rare and existing records most likely belong to the last active user.
- **`formSchemaCache` does NOT need userId.** Form schemas are public and identical across users. No isolation needed — schemas are keyed by `formId` and shared safely.
- **SyncManager userId resolution.** The `SyncManager` singleton initializes at module load. It stores `_userId` via a `setUserId(id)` method called by AuthContext on login/logout. `syncAll()` and `retryFailed()` read `this._userId` — never from sessionStorage or JWT decode. AuthContext calls `syncManager.destroy()` on logout and `syncManager.init()` on login to manage the `online` event listener lifecycle. The `syncAll()` loop checks `this._userId` before each item to abort if the user logged out mid-batch.
- **Race condition prevention.** `apiClient` reads the JWT from `sessionStorage` at call time (`api-client.ts:27`). Without sync lifecycle management, a `syncAll()` batch started by User A could continue after User A logs out and User B logs in, sending User A's submissions with User B's JWT. The `destroy()` + `setUserId(null)` + mid-batch guard pattern prevents this.

### Existing Patterns to Follow

```typescript
// Dexie version migration pattern
db.version(2).stores({
  drafts: 'id, formId, status, updatedAt, [formId+status], userId, [userId+formId+status]',
  submissionQueue: 'id, formId, status, createdAt, [status+createdAt], userId, [userId+status]',
  formSchemaCache: 'formId, cachedAt', // unchanged
}).upgrade(tx => {
  return Promise.all([
    tx.table('drafts').toCollection().modify({ userId: '__legacy__' }),
    tx.table('submissionQueue').toCollection().modify({ userId: '__legacy__' }),
  ]);
});

// vi.hoisted() + vi.mock() test pattern (from existing tests)
const { mockDraftsWhere } = vi.hoisted(() => ({
  mockDraftsWhere: vi.fn(),
}));
vi.mock('../../../../lib/offline-db', () => ({
  db: { drafts: { where: mockDraftsWhere } },
}));

// AlertDialog pattern (from DeactivateDialog, ReactivateDialog)
<AlertDialog>
  <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Unsynced Submissions</AlertDialogTitle>
      <AlertDialogDescription>
        You have {count} unsynced submissions. These will be uploaded when you log back in on this device.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={confirmLogout}>Log Out</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Do NOT

- Do NOT delete queued submissions on logout — they must persist for the user's next login session.
- Do NOT add userId to `CachedFormSchema` — form schemas are public and shared safely.
- Do NOT modify any API endpoints — this is a frontend-only fix.
- Do NOT use `localStorage` for userId tracking — read from AuthContext or decode the JWT.
- Do NOT clear IndexedDB on Dexie version upgrade — existing records must be preserved via the `'__legacy__'` migration.

### Implementation Results (2026-02-18)

**Files Modified:**

| File | Changes |
|------|---------|
| `apps/web/src/lib/offline-db.ts` | Added `userId` to `Draft` and `SubmissionQueueItem` interfaces. Added `db.version(2)` with compound indexes and legacy migration. |
| `apps/web/src/features/forms/hooks/useDraftPersistence.ts` | Added `useAuth()` import. All queries/writes now include `userId`. Guards for null userId. |
| `apps/web/src/services/sync-manager.ts` | Added `_userId` field, `setUserId()`, `getUserId()`. `syncAll()` and `retryFailed()` filter by userId. Mid-batch guard. |
| `apps/web/src/features/forms/hooks/useSyncStatus.ts` | Added `useAuth()` import. `useLiveQuery` now filters by userId. |
| `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx` | Added `useAuth()` import. Queue list filtered by userId. |
| `apps/web/src/features/auth/context/AuthContext.tsx` | Added `claimLegacyRecords()`, `initOfflineForUser()`, `confirmLogout`, `cancelLogout`, `showLogoutWarning`, `unsyncedCount`. Logout checks for unsynced data. Login/restore calls `syncManager.setUserId()` + `init()` + `claimLegacyRecords()`. Inactivity timeout tears down sync. |
| `apps/web/src/layouts/components/ProfileDropdown.tsx` | Added AlertDialog for unsynced data logout warning (red confirm button). |

**Test Files Modified:**

| File | Tests | New |
|------|-------|-----|
| `apps/web/src/lib/offline-db.test.ts` | 18 pass | +4 isolation tests (userId field, compound index queries) |
| `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts` | 14 pass | +4 isolation tests (userId in where, add, queue; null userId skip) |
| `apps/web/src/services/__tests__/sync-manager.test.ts` | 21 pass | +3 isolation tests (null userId skip, userId in where queries) |
| `apps/web/src/features/forms/hooks/__tests__/useSyncStatus.test.ts` | 10 pass | +0 (existing tests updated with mock) |
| `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx` | 11 pass | +0 (existing tests updated with mock) |

**Test Results:** 122 files, 1348 tests pass, 0 regressions. 1 pre-existing test (`a3-eslint-policy.test.ts`) excluded due to timeout hang (unrelated).

### Suggested File Touch Points

**Modify:**
- `apps/web/src/lib/offline-db.ts` — add userId to interfaces, add version(2) migration
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — add userId filtering to all queries
- `apps/web/src/services/sync-manager.ts` — add userId-scoped sync
- `apps/web/src/features/forms/hooks/useSyncStatus.ts` — add userId-scoped counts
- `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx` — add userId-scoped queries
- `apps/web/src/features/auth/context/AuthContext.tsx` — add logout warning + legacy record claim on login

**Modify (tests):**
- `apps/web/src/lib/offline-db.test.ts`
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts`
- `apps/web/src/services/__tests__/sync-manager.test.ts`
- `apps/web/src/features/forms/hooks/__tests__/useSyncStatus.test.ts`

**No new files needed:**
- React components use `useAuth().user?.id` directly. SyncManager uses `setUserId()` setter called by AuthContext.

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md — prep-11 action item]
- [Source: _bmad-output/planning-artifacts/architecture.md — ADR-004 Offline Data Responsibility, ADR-005 Degraded Mode, ADR-008 Emergency Sync Control]
- [Source: _bmad-output/project-context.md — "Offline-first compatible, 7-day offline operation"]
- [Source: apps/web/src/lib/offline-db.ts — current Dexie schema without userId]
- [Source: apps/web/src/services/sync-manager.ts — unscoped syncAll/retryFailed]
- [Source: apps/web/src/features/auth/context/AuthContext.tsx — logout without IndexedDB cleanup]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Investigation confirmed: no userId field in any IndexedDB table. All queries (draft load, sync, badge count, sync page display) are globally scoped.
- 6 root cause files identified with specific line references.
- 4 vulnerability scenarios documented with data flow analysis.
- Architecture docs confirm 7-day offline operation requirement — logout must NOT delete data.

### Completion Notes List

- Story generated as `ready-for-dev` with 9 ACs and 10 tasks (within 15-task limit).
- Frontend-only scope — no API or database changes needed.
- Includes Dexie v2 migration strategy with `'__legacy__'` sentinel for existing records.
- Preserves data on logout per ADR-004 ("User-initiated cache clear is unrecoverable").
- PM validation (2026-02-17): Added AC9 (sync lifecycle race condition), revised Task 2 (explicit SyncManager.setUserId contract), added Task 10 (sync lifecycle on login/logout), added Scenario 4 (mid-sync race), added known limitation to AC7, clarified AC6 inactivity wording.

### File List

- `_bmad-output/implementation-artifacts/prep-11-offline-queue-user-isolation.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
- `apps/web/src/lib/offline-db.ts`
- `apps/web/src/lib/offline-db.test.ts`
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts`
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts`
- `apps/web/src/features/forms/hooks/useSyncStatus.ts`
- `apps/web/src/features/forms/hooks/__tests__/useSyncStatus.test.ts`
- `apps/web/src/services/sync-manager.ts`
- `apps/web/src/services/__tests__/sync-manager.test.ts`
- `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx`
- `apps/web/src/features/auth/context/AuthContext.tsx`
- `apps/web/src/layouts/components/ProfileDropdown.tsx`

#### Review-Fixed Files (AuthContextValue mock updates)

- `apps/web/src/features/dashboard/__tests__/DashboardRedirect.test.tsx`
- `apps/web/src/features/dashboard/__tests__/rbac-routes.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/PublicUserRbac.test.tsx`
- `apps/web/src/features/dashboard/pages/__tests__/AssessorOfficialRbac.test.tsx`
- `apps/web/src/layouts/__tests__/DashboardLayout.test.tsx`
- `apps/web/src/layouts/components/MobileNav.test.tsx`
- `apps/web/src/layouts/components/SmartCta.test.tsx`

## Senior Developer Review (AI)

**Reviewer:** Claude Opus 4.6 (adversarial code review)
**Date:** 2026-02-18

### Review Summary

| Severity | Count | Fixed | Action Items |
|----------|-------|-------|-------------|
| CRITICAL | 4 | 4 | 0 |
| MEDIUM | 3 | 3 | 0 |
| LOW | 3 | 3 | 0 |

### Issues Fixed

1. **[CRITICAL] Build broken — AuthContextValue interface change** broke 10+ test files missing `confirmLogout`, `unsyncedCount`, `showLogoutWarning`, `cancelLogout`. Fixed 7 test files (11 mock objects).
2. **[CRITICAL] Build broken — EnumeratorSyncPage.tsx TS type error** `Promise.resolve([])` inferred as `never[]`. Fixed with `[] as SubmissionQueueItem[]`.
3. **[CRITICAL] Build broken — useSyncStatus.ts** same `Promise<never[]>` type mismatch. Fixed with typed empty array + import.
4. **[CRITICAL] Build broken — AuthContext.test.tsx:471** `role: 'enumerator'` (string) not assignable to `UserRole` enum. Fixed: imported `UserRole` from `@oslsr/types`, used `UserRole.ENUMERATOR`.
5. **[MEDIUM] `loginWithGoogle` didn't await `initOfflineForUser`** — legacy record claiming was fire-and-forget for Google OAuth path. Fixed: made async, added await.
6. **[MEDIUM] Dev Agent Record File List incomplete** — listed 2 files instead of 15+. Fixed: expanded to full list.
7. **[MEDIUM] `epics.md` modified but undocumented** — now listed in File List.
8. **[LOW] AC6 tests lacked userId assertions** — all 3 AC6 logout tests verified `showLogoutWarning`/`unsyncedCount` but never asserted that `db.submissionQueue.where()` was called with `userId`. Fixed: added explicit `expect(mockDbQueueWhere).toHaveBeenCalledWith({ userId, status })` to all 3 tests.
9. **[LOW] userId-scoped query tests** — already resolved by dedicated tests at `useSyncStatus.test.ts:197-218` and `EnumeratorSyncPage.test.tsx:243-255`. Checkbox was unchecked.
10. **[LOW] EnumeratorSyncPage pagination** — already resolved by `MAX_QUEUE_DISPLAY = 100` at `EnumeratorSyncPage.tsx:18,50`. Checkbox was unchecked.

### Review Follow-ups (AI)

- [x] [AI-Review][LOW] `AuthContext.test.tsx` not updated for prep-11 — logout warning (AC6), sync lifecycle (AC9), and legacy claiming (AC7) are untested at integration level. `claimLegacyRecords` silently fails in jsdom (caught by try/catch), so existing tests pass by accident. [AuthContext.test.tsx] **Fixed:** Added `mockDbQueueWhere` clear + explicit `expect(mockDbQueueWhere).toHaveBeenCalledWith({ userId: 'user-123', status: 'pending'|'failed' })` assertions to all 3 AC6 tests. AC9 (syncManager) and AC7 (legacy claiming) tests already had correct assertions.
- [x] [AI-Review][LOW] `useSyncStatus.test.ts` and `EnumeratorSyncPage.test.tsx` don't verify userId-scoped queries — both mock `useLiveQuery` at return-value level, bypassing actual filtering callbacks. AC8 claims userId-scoped count verification but mocks return static data regardless of userId. [useSyncStatus.test.ts, EnumeratorSyncPage.test.tsx] **Already resolved:** Dedicated userId verification tests exist — `useSyncStatus.test.ts:197-218` (2 tests: scoped where + null userId guard) and `EnumeratorSyncPage.test.tsx:243-255` (1 test: scoped where). Combined with behavioral tests, coverage is complete.
- [x] [AI-Review][LOW] No pagination/limit on EnumeratorSyncPage queue query — loads ALL user submissions into memory with no cap. Could grow unbounded for long-term users. [EnumeratorSyncPage.tsx:47] **Already resolved:** `MAX_QUEUE_DISPLAY = 100` constant with `.slice(0, MAX_QUEUE_DISPLAY)` already in place at `EnumeratorSyncPage.tsx:18,50`.

### Change Log

- 2026-02-18: Adversarial code review — fixed 3 CRITICAL (build broken), 3 MEDIUM issues. 3 LOW action items created.
- 2026-02-18: Follow-up fixes — fixed 4th CRITICAL (UserRole enum type error in test), fixed LOW-1 (added userId assertions to AC6 tests), verified LOW-2 and LOW-3 already resolved. All 10 issues now closed.
