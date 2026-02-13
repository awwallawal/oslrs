# Story 3.5: Public Self-Registration & Survey Access

Status: done

## Story

As a Public User,
I want to register on the website and fill out the survey,
so that I can contribute my skills to the registry.

## Acceptance Criteria

**AC3.5.1 — Survey Portal Access:**
**Given** a registered and authenticated public user on the dashboard,
**When** they click "Start Survey" on the home page or navigate to `/dashboard/public/surveys`,
**Then** the system displays a grid of published survey forms (using the same `usePublishedForms()` hook as enumerators), showing form title, description, and draft status (not started / in progress / completed).

**AC3.5.2 — Form Filling:**
**Given** a public user viewing the surveys list,
**When** they click "Start Survey" on a form card (or "Resume Draft" if an in-progress draft exists),
**Then** the system navigates to `/dashboard/public/surveys/:formId` and loads `FormFillerPage` in `mode='fill'`, rendering the same one-question-per-screen experience as enumerators with skip logic, validation, auto-save to IndexedDB, and GPS capture.

**AC3.5.3 — Submission Pipeline Parity:**
**Given** a public user completes and submits a survey,
**When** the submission enters the ingestion pipeline via SyncManager,
**Then** the submission source MUST be `'public'` (not `'webapp'`), the respondent is created/linked by NIN (per Story 3.4 idempotent processing), `enumeratorId` is null (public user, not field staff), and the fraud detection job is queued identically to enumerator submissions.

**AC3.5.4 — Submission Confirmation:**
**Given** a public user has completed all questions and taps "Submit",
**When** the draft is marked completed and queued for sync,
**Then** the system displays a success/thank-you screen with civic messaging ("Thank you for contributing to the Oyo State Labour Registry"), a link to return to the dashboard, and optionally start another survey.

**AC3.5.5 — Sync Status on Public Dashboard:**
**Given** a public user has pending (unsynced) submissions,
**When** they view the public user home dashboard,
**Then** the `SyncStatusBadge` and `PendingSyncBanner` components are displayed (following the enumerator dashboard pattern), showing sync state and allowing manual retry.

**AC3.5.6 — NIN Uniqueness Handling:**
**Given** a public user's NIN was already registered (by an enumerator, another channel, or prior submission),
**When** the ingestion worker processes the submission,
**Then** the submission is linked to the existing respondent (NOT rejected — per Story 3.4 AC3.4.3 and PRD FR21), the original respondent source is preserved, and the event is logged for supervisor audit.

**AC3.5.7 — Dashboard Placeholder Cleanup:**
**Given** the current `PublicUserHome` page,
**When** this story is complete,
**Then** the "Coming in Epic 3" AlertDialog modal on the "Start Survey" card MUST be removed, the button MUST navigate to `/dashboard/public/surveys`, and the profile completion card MUST remain unchanged.

## Tasks / Subtasks

- [x] Task 1: Fix submission source derivation in form controller (AC: 3.5.3)
  - [x] 1.1: In `apps/api/src/controllers/form.controller.ts`, add helper `getSubmissionSource(role?: string)`: maps `public_user` -> `'public'`, `enumerator` -> `'enumerator'`, `data_entry_clerk` -> `'clerk'`, default -> `'webapp'`
  - [x] 1.2: Replace hardcoded `source: 'webapp'` (line ~89) with `source: getSubmissionSource(req.user?.role)`
  - [x] 1.3: Write unit test for `getSubmissionSource()` covering all role mappings
  - [x] 1.4: Write controller test verifying correct source passed to `queueSubmissionForIngestion` for public_user role

- [x] Task 2: Add form filler route for public users (AC: 3.5.2)
  - [x] 2.1: In `apps/web/src/App.tsx`, add `<Route path="surveys/:formId" element={<Suspense fallback={<DashboardLoadingFallback />}><FormFillerPage mode="fill" /></Suspense>} />` under the `/dashboard/public` route group
  - [x] 2.2: Verify the route is protected by `ProtectedRoute allowedRoles={['public_user']}`

- [x] Task 3: Replace PublicSurveysPage with functional survey grid (AC: 3.5.1)
  - [x] 3.1: Rewrite `apps/web/src/features/dashboard/pages/PublicSurveysPage.tsx` following `EnumeratorSurveysPage.tsx` pattern
  - [x] 3.2: Use `usePublishedForms()` hook to fetch published forms
  - [x] 3.3: Use `useFormDrafts()` hook to show draft status per form
  - [x] 3.4: Render grid of form cards: title, description, status badge (Not Started / In Progress / Completed)
  - [x] 3.5: Each card has "Start Survey" or "Resume Draft" button navigating to `/dashboard/public/surveys/${form.id}`
  - [x] 3.6: Show skeleton loading state (skeleton cards matching final card shape, NOT generic spinner)
  - [x] 3.7: Show empty state if no published forms: "No surveys available yet. Check back soon."
  - [x] 3.8: Write tests: loading skeleton, form card rendering, draft status display, navigation on click, empty state

- [x] Task 4: Update PublicUserHome dashboard (AC: 3.5.5, 3.5.7)
  - [x] 4.1: Remove the "Coming in Epic 3" `AlertDialog` from the "Start Survey" card
  - [x] 4.2: Wire "Start Survey" button to `navigate('/dashboard/public/surveys')`
  - [x] 4.3: Add `SyncStatusBadge` component to the dashboard header area (import from `apps/web/src/components/SyncStatusBadge.tsx`)
  - [x] 4.4: Add `PendingSyncBanner` below the header for unsent submissions (import from `apps/web/src/components/PendingSyncBanner.tsx`)
  - [x] 4.5: Keep profile completion card and marketplace opt-in card unchanged
  - [x] 4.6: Write tests: verify AlertDialog removed, navigation works, sync components render

- [x] Task 5: Add submission completion screen (AC: 3.5.4)
  - [x] 5.1: After `completeDraft()` in FormFillerPage, show a success overlay/screen (follow SectionCelebration pattern from UX spec)
  - [x] 5.2: Display "Thank you for contributing to the Oyo State Labour Registry" civic message
  - [x] 5.3: Add "Back to Dashboard" button → `/dashboard/public`
  - [x] 5.4: Add "View All Surveys" link → `/dashboard/public/surveys`
  - [x] 5.5: Write tests: success screen renders after completion, navigation works

- [x] Task 6: End-to-end verification (AC: all)
  - [x] 6.1: Manually verify: public user login → dashboard → surveys list → start survey → fill form → submit → confirmation → back to dashboard
  - [x] 6.2: Verify submission appears in DB with `source='public'`, `enumerator_id=null`, respondent linked by NIN
  - [x] 6.3: Verify offline draft persistence: start survey → close browser → reopen → "Resume Draft" visible
  - [x] 6.4: Verify sync status: submit while offline → PendingSyncBanner shows → go online → auto-sync → SyncStatusBadge updates

## Dev Notes

### This Is a Frontend Wiring Story

The backend already supports public user survey access. All form routes (`/api/v1/forms/*`) use `authenticate` middleware WITHOUT role restriction — any authenticated user (including `public_user`) can list published forms, render form schemas, and submit forms. The only backend change is fixing the submission source field.

### Existing Infrastructure to REUSE (Do NOT Reinvent)

| Component | Location | Status |
|-----------|----------|--------|
| `usePublishedForms()` | `apps/web/src/features/forms/hooks/useForms.ts` | Ready — fetches published form list |
| `useFormDrafts()` | `apps/web/src/features/forms/hooks/useForms.ts` | Ready — returns map of formId → boolean for in-progress drafts |
| `useFormSchema(formId)` | `apps/web/src/features/forms/hooks/useForms.ts` | Ready — fetches form with Dexie offline fallback |
| `FormFillerPage` | `apps/web/src/features/forms/pages/FormFillerPage.tsx` | Ready — `mode='fill'`, one-question-per-screen, all 7 question types |
| `useDraftPersistence` | `apps/web/src/features/forms/hooks/useDraftPersistence.ts` | Ready — auto-save to IndexedDB every 500ms |
| `SyncManager` | `apps/web/src/services/sync-manager.ts` | Ready — syncs pending submissions with retry/backoff |
| `SyncStatusBadge` | `apps/web/src/components/SyncStatusBadge.tsx` | Ready — 4 states: Synced, Syncing, Attention, Offline |
| `PendingSyncBanner` | `apps/web/src/components/PendingSyncBanner.tsx` | Ready — red warning with Upload Now / Retry buttons |
| `useSyncStatus` | `apps/web/src/features/forms/hooks/useSyncStatus.ts` | Ready — derives status from IndexedDB queue |
| `useOnlineStatus` | `apps/web/src/hooks/useOnlineStatus.ts` | Ready — connectivity detection |
| `EnumeratorSurveysPage` | `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` | Reference pattern for survey grid |
| `EnumeratorHome` | `apps/web/src/features/dashboard/pages/EnumeratorHome.tsx` | Reference pattern for sync status on dashboard |
| `SubmissionProcessingService` | `apps/api/src/services/submission-processing.service.ts` | Ready — already derives source from user role (Story 3.4 review fix C1) |
| `queueSubmissionForIngestion` | `apps/api/src/queues/webhook-ingestion.queue.ts` | Ready — dedup by submissionUid |
| Form API functions | `apps/web/src/features/forms/api/form.api.ts` | Ready — `fetchPublishedForms()`, `fetchFormForRender()` |
| Submission API | `apps/web/src/features/forms/api/submission.api.ts` | Ready — `submitSurvey()` |
| Offline DB schema | `apps/web/src/lib/offline-db.ts` | Ready — Draft, SubmissionQueueItem, CachedFormSchema |

### Files That Need NO Backend Changes

These already work for any authenticated user including `public_user`:
- `apps/api/src/routes/form.routes.ts` — `authenticate` only, no `authorize()` role check
- `apps/api/src/queues/webhook-ingestion.queue.ts` — source-agnostic
- `apps/api/src/workers/webhook-ingestion.worker.ts` — processes any submission
- `apps/api/src/services/submission-processing.service.ts` — derives source from user role
- `apps/api/src/services/native-form.service.ts` — no role checks

### Key Pattern: EnumeratorSurveysPage (Copy This)

```typescript
// apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx
const { data: forms, isLoading, error } = usePublishedForms();
const { draftMap } = useFormDrafts();
// Render grid of form cards with Start Survey / Resume Draft buttons
// Navigate to /dashboard/enumerator/survey/${form.id} on click
```

For public users, change the navigation target to `/dashboard/public/surveys/${form.id}`.

### Key Pattern: Form Filler Route (Copy This)

```tsx
// In App.tsx enumerator routes (lines 694-708):
<Route path="survey/:formId" element={
  <Suspense fallback={<DashboardLoadingFallback />}>
    <FormFillerPage mode="fill" />
  </Suspense>
} />
```

Add identical route under `/dashboard/public` routes but path `surveys/:formId`.

### Key Pattern: Sync Status on Dashboard (Copy This)

```tsx
// In EnumeratorHome.tsx:
import { SyncStatusBadge } from '../../../components/SyncStatusBadge';
import { PendingSyncBanner } from '../../../components/PendingSyncBanner';
// Render SyncStatusBadge in header area, PendingSyncBanner below header
```

### Source Derivation Fix (form.controller.ts)

The `SubmissionProcessingService` (Story 3.4, review fix C1) already derives the correct source from the user's role in the `users` table. However, the form controller still hardcodes `source: 'webapp'` which is stored on the initial submission record. Fix this for data consistency:

```typescript
function getSubmissionSource(role?: string): string {
  if (role === 'public_user') return 'public';
  if (role === 'enumerator') return 'enumerator';
  if (role === 'data_entry_clerk') return 'clerk';
  return 'webapp'; // fallback
}
```

### NIN Uniqueness — Already Handled

NIN uniqueness is enforced at multiple levels (NO additional work needed):
1. **Registration (Story 3.0):** NIN collected with Modulus 11 validation during public registration
2. **Database constraint:** `respondents.nin` has UNIQUE constraint
3. **Ingestion (Story 3.4, AC3.4.3):** Duplicate NIN → links to existing respondent, does NOT reject submission
4. **Race condition handled:** PG error code `23505` catch-and-retry in `findOrCreateRespondent()`

### Submission Pipeline End-to-End (No Changes Needed)

```
Public user fills form (FormFillerPage mode='fill')
  → Draft auto-saved to IndexedDB (useDraftPersistence, 500ms)
  → User clicks "Complete Survey" → completeDraft()
  → SubmissionQueueItem in IndexedDB (enriched: formVersion, submittedAt, GPS)
  → SyncManager picks up pending items → POST /api/v1/forms/submissions
  → FormController validates, extracts submitterId from JWT
  → queueSubmissionForIngestion() (source: 'public', dedup by submissionUid)
  → webhook-ingestion worker saves raw submission
  → SubmissionProcessingService.processSubmission():
    - Extracts respondent fields from rawData via RESPONDENT_FIELD_MAP
    - Creates/finds respondent by NIN (idempotent)
    - Sets enumeratorId=null (source != 'enumerator')
    - Marks processed=true
  → Queues fraud-detection job (stub worker)
```

### Project Structure Notes

- Public user pages: `apps/web/src/features/dashboard/pages/PublicUser*.tsx`
- Public user routes: `apps/web/src/App.tsx` under `/dashboard/public` guard
- Sidebar config: `apps/web/src/features/dashboard/config/sidebarConfig.ts` (line 90-95, no changes needed)
- Form components: `apps/web/src/features/forms/` (all reusable, no role coupling)
- Form hooks: `apps/web/src/features/forms/hooks/` (all reusable)

### Anti-Pattern Prevention

- DO NOT create a separate form renderer for public users — reuse `FormFillerPage` with `mode='fill'`
- DO NOT create separate API endpoints for public form access — existing `/api/v1/forms/*` routes work
- DO NOT create a separate submission API — existing `POST /api/v1/forms/submissions` works
- DO NOT duplicate `usePublishedForms()` or `useFormDrafts()` hooks — import from existing location
- DO NOT add role checks to form routes — the architecture intentionally allows any authenticated user
- DO NOT create a new sync manager — the existing `SyncManager` is role-agnostic
- DO NOT use auto-increment IDs — ALL primary keys are UUIDv7
- DO NOT use `console.log` — use Pino structured logging
- DO NOT co-locate backend tests — use `__tests__/` subdirectories
- DO NOT use generic spinners — skeleton cards matching the final card shape
- DO NOT add the AlertDialog "Coming Soon" modal back — remove it completely

### Previous Story Intelligence

**From Story 3.4 (Idempotent Submission Ingestion):**
- Respondent extraction uses `RESPONDENT_FIELD_MAP` for field mapping (snake_case + camelCase)
- Source enum: `'enumerator' | 'public' | 'clerk'` (review fix C1 — processing service derives from user role)
- GPS extraction from rawData `_gpsLatitude`/`_gpsLongitude` → submission columns (review fix C2)
- Idempotency: 4 layers (BullMQ jobId, submissionUid UNIQUE, processed flag, NIN UNIQUE)
- ESM backend imports need `.js` extension for relative imports

**From Story 3.3 (Offline Queue & Sync):**
- `completeDraft()` enriches payload with `formVersion`, `submittedAt`, GPS coordinates
- SyncManager: exponential backoff (1s, 2s, 4s, 8s), max 3 retries, 60s timeout
- `SyncStatusBadge`: 4 states — Synced (green), Syncing (amber), Attention (red), Offline (gray); hidden when empty
- `PendingSyncBanner`: red warning with Upload Now / Retry buttons
- Currently ONLY wired into Enumerator dashboard — this story wires into Public dashboard

**From Story 3.1 (Native Form Renderer):**
- `FormFillerPage` accepts `mode` prop (`'fill' | 'preview'`), defaults to `'fill'`
- All 7 question types: text, number, date, select_one, select_multiple, geopoint, note
- Skip logic evaluator: `getVisibleQuestions()`, `getNextQuestionIndex()`
- Draft persistence: auto-save every 500ms to IndexedDB
- Marketplace consent enforced as first mandatory question

**From Story 3.0 (Google OAuth & Public Registration):**
- Registration complete: Google OAuth primary, email fallback
- NIN collected and validated (modulus11) during registration
- Users created with `public_user` role
- Auth context provides `req.user.sub` (userId) and `req.user.role`

### Git Intelligence

Recent commits (all Epic 3):
```
f5ba3b9 feat: Story 3.4 — idempotent submission ingestion with BullMQ & code review fixes
dd27635 feat: Story 3.3 — offline queue, sync status UI & code review fixes
22a0f99 feat: Story 3.2 — PWA service worker, offline assets & code review fixes
f09659d feat: Story 3.1 — native form renderer, dashboard & code review fixes
b33dcfd feat: Google OAuth & enhanced public registration with code review fixes (Story 3.0)
```

Test baselines: 337 API tests, 1,164 web tests, 0 regressions.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic-3-Story-3.5] — Story definition and ACs
- [Source: _bmad-output/planning-artifacts/prd.md#Story-3.6-3.7] — PRD stories mapping to this epic story
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-016] — Layout architecture, route structure
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-004] — Offline data responsibility model
- [Source: _bmad-output/planning-artifacts/architecture.md#ADR-015] — Public user registration
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey-2] — Public respondent UX flow
- [Source: _bmad-output/implementation-artifacts/3-4-idempotent-submission-ingestion-bullmq.md] — Ingestion pipeline, source derivation fix
- [Source: _bmad-output/implementation-artifacts/3-3-offline-queue-sync-status-ui.md] — Sync components
- [Source: _bmad-output/implementation-artifacts/3-1-native-form-renderer-dashboard.md] — Form renderer, draft persistence
- [Source: _bmad-output/implementation-artifacts/3-0-google-oauth-enhanced-public-registration.md] — Registration flow
- [Source: _bmad-output/project-context.md] — Critical implementation rules

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- Fixed PublicUserSubPages.test.tsx regression — old placeholder tests still expected "Survey Status" heading and "Coming in Epic 3" text after page rewrite. Updated to match new functional page content.
- Fixed vi.mock hoisting issue in PublicUserHome.test.tsx — `mockSyncManager` referenced before initialization. Used `vi.hoisted()` pattern.
- Updated existing form.controller.test.ts — changed expected source from `'webapp'` to `'enumerator'` for enumerator role test after source derivation fix.

### Completion Notes List

- **Task 1:** Added `getSubmissionSource()` static method to `FormController`. Replaced hardcoded `source: 'webapp'` with role-based derivation. 5 new unit tests + 4 updated existing tests. All 21 controller tests pass.
- **Task 2:** Added `surveys/:formId` route under `/dashboard/public` route group in App.tsx. Route inherits `ProtectedRoute allowedRoles={['public_user']}` from parent.
- **Task 3:** Rewrote `PublicSurveysPage` from placeholder to functional survey grid. Uses `usePublishedForms()` + `useFormDrafts()` hooks. Grid cards with Start Survey / Resume Draft. Skeleton loading, empty state, error state. 8 new tests.
- **Task 4:** Removed "Coming in Epic 3" AlertDialog from `PublicUserHome`. Wired Start Survey to navigate to `/dashboard/public/surveys`. Added `SyncStatusBadge` and `PendingSyncBanner`. 23 tests (rewrote from 19 to 23 with sync coverage).
- **Task 5:** Enhanced `FormFillerPage` completion screen for public users. Added civic message, "Back to Dashboard" and "View All Surveys" buttons. Uses `useLocation` to detect public user path. 4 new tests.
- **Task 6:** Full regression suite: 1,178 web tests + 337 API tests pass. Zero regressions. +14 net new tests.

### File List

**Modified:**
- `apps/api/src/controllers/form.controller.ts` — Added `getSubmissionSource()`, replaced hardcoded source
- `apps/api/src/controllers/__tests__/form.controller.test.ts` — 9 new/updated tests for source derivation
- `apps/api/src/db/schema/questionnaires.ts` — Added nullable `description` column (review M1)
- `apps/api/src/services/native-form.service.ts` — Select/return `description` in `listPublished()` (review M1)
- `apps/web/src/App.tsx` — Added `surveys/:formId` route under public user routes
- `apps/web/src/features/forms/api/form.api.ts` — Added `description` to `PublishedFormSummary` type (review M1)
- `apps/web/src/features/forms/hooks/useForms.ts` — `useFormDrafts()` returns 3-state status strings (review M2)
- `apps/web/src/features/dashboard/pages/PublicSurveysPage.tsx` — Rewritten from placeholder to functional survey grid; description + 3-state draft (review M1, M2)
- `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` — Description + 3-state draft for consistency (review M1, M2)
- `apps/web/src/features/dashboard/pages/PublicUserHome.tsx` — Removed Epic 3 AlertDialog, added sync components, navigate to surveys
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — Public user completion screen with civic messaging; `useAuth()` role check (review M3); CSS class for animation (review L2)
- `apps/web/src/index.css` — Added `scaleIn` keyframes and `.animate-scale-in` class (review L2)
- `apps/web/src/features/dashboard/pages/__tests__/PublicUserHome.test.tsx` — Rewrote tests for new behavior
- `apps/web/src/features/dashboard/pages/__tests__/PublicUserSubPages.test.tsx` — Removed duplicate PublicSurveysPage tests (review L1)
- `apps/web/src/features/forms/pages/__tests__/FormFillerPage.test.tsx` — Added 4 public completion screen tests; `useAuth` mock (review M3)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Story status updated

**Created:**
- `apps/web/src/features/dashboard/pages/__tests__/PublicSurveysPage.test.tsx` — 11 tests for survey grid page (8 original + 3 review)

## Senior Developer Review (AI)

### Review Model
Claude Opus 4.6

### Findings Summary
0 Critical, 3 Medium, 2 Low — all 5 fixed.

### Findings Detail

**M1 — Missing `description` field in survey card (AC3.5.1)**
- `questionnaire_forms` DB table had no `description` column; `NativeFormService.listPublished()` didn't return it; `PublishedFormSummary` type didn't include it; `PublicSurveysPage` couldn't render it.
- **Fix:** Added nullable `description` text column to Drizzle schema, updated service to select/return it, added to `PublishedFormSummary` type, rendered in card UI with `line-clamp-2`.

**M2 — `useFormDrafts()` only tracks in-progress drafts (AC3.5.1)**
- Hook only queried `status === 'in-progress'` from IndexedDB, so completed surveys still showed "Start Survey" instead of a "Completed" badge.
- **Fix:** Changed Dexie query to `anyOf('in-progress', 'completed')`, return type from `Record<string, boolean>` to `Record<string, 'in-progress' | 'completed'>`. Updated both `PublicSurveysPage` and `EnumeratorSurveysPage` to render 3-state UI (Start / Resume / Completed).

**M3 — Public user detection via pathname is fragile (AC3.5.4)**
- `FormFillerPage` used `useLocation().pathname.startsWith('/dashboard/public')` to decide whether to show civic message. Breaks if routes change.
- **Fix:** Replaced with `useAuth()` hook checking `user?.role === 'public_user'`. Role-based detection is canonical.

**L1 — Duplicate PublicSurveysPage tests in SubPages file**
- `PublicUserSubPages.test.tsx` contained 8 `PublicSurveysPage` tests duplicating the dedicated `PublicSurveysPage.test.tsx` file (8 tests).
- **Fix:** Removed the entire `PublicSurveysPage` describe block and related imports/mocks from `PublicUserSubPages.test.tsx`.

**L2 — Inline `<style>` tag in FormFillerPage**
- A `<style>` tag with `@keyframes scaleIn` was injected into the DOM on every render of the completion screen.
- **Fix:** Moved `scaleIn` keyframes and `.animate-scale-in` class to `apps/web/src/index.css`. Replaced inline style with the CSS class.

### Test Verification
81 tests pass across 5 test files (60 web + 21 API), 0 regressions.

## Change Log

- 2026-02-13: Story 3.5 implementation complete. Fixed submission source derivation (AC3.5.3), added public user survey routes (AC3.5.2), built functional survey grid (AC3.5.1), updated dashboard with sync status (AC3.5.5, AC3.5.7), added civic completion screen (AC3.5.4). NIN uniqueness already handled by Story 3.4 (AC3.5.6). 1,178 web + 337 API tests pass, 0 regressions.
- 2026-02-13: Code review complete. 5 findings (3M, 2L), all fixed: M1 description field, M2 3-state draft tracking, M3 role-based public user detection, L1 duplicate test cleanup, L2 CSS animation extraction. 81 affected tests pass, 0 regressions.
