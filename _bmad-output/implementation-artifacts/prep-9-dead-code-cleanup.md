# Story 7.prep-9: Dead Code Cleanup

Status: done

## Story

As a **developer maintaining the codebase**,
I want dead/unused code removed,
so that the codebase stays lean and doesn't mislead future dev agents into calling endpoints or using exports that serve no purpose.

## Context

The Epic 6 retro flagged TD2: "Dead code cleanup (XLSForm endpoint, unused View-As APIs)." Investigation reveals the scope is **smaller than initially expected**:

- **XLSForm services are NOT dead code** — the upload endpoint, parser service, and converter are all actively used by both the questionnaire upload flow and admin scripts. Only one unused export was found.
- **View-As session endpoints are NOT dead code** — `POST /start`, `POST /end`, `GET /current` are all consumed by the frontend. Only the `/view-as/data/sidebar` endpoint is dead.
- The actual dead code is two items: one unused middleware export and one unused API endpoint.

## Acceptance Criteria

1. **Given** the `uploadXlsform` export in `upload.middleware.ts`, **when** cleanup is complete, **then** the unused export is removed.
2. **Given** the `GET /view-as/data/sidebar` endpoint, **when** cleanup is complete, **then** the route handler and service method are removed (frontend uses hardcoded `SIDEBAR_MAP` instead).
3. **Given** the removals, **when** the full codebase is searched, **then** no remaining imports or references to the removed code exist.
4. **Given** any additional dead code discovered during cleanup, **when** verified as truly unused, **then** it is removed and documented in completion notes.
5. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [x] Task 1: Remove unused `uploadXlsform` export (AC: #1, #3)
  - [x] 1.1 In `apps/api/src/middleware/upload.middleware.ts` (lines 140-143), remove the `uploadXlsform` constant and its export
  - [x] 1.2 Grep for `uploadXlsform` across the entire codebase to confirm zero imports
  - [x] 1.3 Verify the other exports (`xlsformUpload`, `handleMulterError`, `validateFileContent`) are still used in `questionnaire.routes.ts`
- [x] Task 2: Remove unused `/view-as/data/sidebar` endpoint (AC: #2, #3)
  - [x] 2.1 In `apps/api/src/routes/view-as-data.routes.ts`, remove the inline `GET /sidebar` handler (lines 47-63) — there is no separate controller; the handler is defined inline in the route file
  - [x] 2.2 In `apps/api/src/services/view-as-data.service.ts`, remove the `getSidebarItems()` service method (line 184) — only consumed by the removed route handler
  - [x] 2.3 Verify the frontend comment confirms this endpoint is unused: `apps/web/src/features/dashboard/api/view-as.api.ts` (lines 64-66) — comment says "frontend uses hardcoded SIDEBAR_MAP"
  - [x] 2.4 Remove any related tests for the sidebar endpoint
- [x] Task 3: Opportunistic scan for other dead code (AC: #4)
  - [x] 3.1 Search for `TODO: remove`, `DEPRECATED`, `DEAD`, `UNUSED` comments in `apps/api/src/`
  - [x] 3.2 Check for ODK remnants beyond comments (SCP-2026-02-05-001 removed ODK but some code paths may reference it)
  - [x] 3.3 If any additional dead code found, verify it's unused before removing
- [x] Task 4: Verify (AC: #5)
  - [x] 4.1 `pnpm test` — all tests pass, zero regressions

## Dev Notes

### What Is NOT Dead Code (Do Not Remove)

The investigation found that most of the originally flagged code is actively used:

**XLSForm — ALL ACTIVE:**
| Component | File | Used By | Verdict |
|-----------|------|---------|---------|
| Upload endpoint | `questionnaire.routes.ts:31-37` | Frontend `questionnaire.api.ts:53` | ACTIVE |
| Parser service | `xlsform-parser.service.ts` (518 lines) | `questionnaire.service.ts:11`, migration script | ACTIVE |
| Converter service | `xlsform-to-native-converter.ts` | `questionnaire.service.ts:12`, migration script | ACTIVE |
| Upload middleware (`xlsformUpload`, `handleMulterError`) | `upload.middleware.ts` | `questionnaire.routes.ts:5,33-34` | ACTIVE |
| Migration script | `scripts/migrate-xlsform-to-native.ts` | Admin CLI tool (Story 2.9) | ACTIVE |
| Validation script | `apps/api/scripts/validate-xlsform.ts` | Admin CLI tool | ACTIVE |

**View-As — 3 of 4 ACTIVE:**
| Endpoint | Route File | Frontend Consumer | Verdict |
|----------|-----------|-------------------|---------|
| `POST /view-as/start` | `view-as.routes.ts:24` | `view-as.api.ts:38` `startViewAs()` | ACTIVE |
| `POST /view-as/end` | `view-as.routes.ts:25` | `view-as.api.ts:47` `endViewAs()` | ACTIVE |
| `GET /view-as/current` | `view-as.routes.ts:26` | `view-as.api.ts:53` `getCurrentViewAs()` | ACTIVE |
| `GET /view-as/data/sidebar` | `view-as-data.routes.ts:50` | **NONE** — frontend uses hardcoded `SIDEBAR_MAP` | **DEAD** |

### Confirmed Dead Code (2 Items)

1. **`uploadXlsform` export** (`upload.middleware.ts:140-143`) — exported but never imported anywhere. The routes use `xlsformUpload.single('file')` directly instead of this pre-composed array.

2. **`GET /view-as/data/sidebar`** (`view-as-data.routes.ts:~50`) — backend endpoint exists but frontend uses `SIDEBAR_MAP` in `ViewAsDashboardPage.tsx:60-96` for instant rendering. Frontend explicitly documents this: "If sidebar config becomes dynamic, add a hook consuming that endpoint."

### Project Structure Notes

- Middleware: `apps/api/src/middleware/upload.middleware.ts` (modify — remove export)
- View-As routes: `apps/api/src/routes/view-as-data.routes.ts` (modify — remove route)
- View-As service: `apps/api/src/services/view-as-data.service.ts` (modify — remove `getSidebarItems()` method)
- View-As controller: `apps/api/src/controllers/view-as.controller.ts` (NO changes — handles session endpoints only, no sidebar code)
- Frontend confirmation: `apps/web/src/features/dashboard/api/view-as.api.ts:64-66` (read — confirms sidebar endpoint unused)

### Anti-Patterns to Avoid

- **Do NOT remove the XLSForm upload endpoint** — it's actively used by the questionnaire management frontend.
- **Do NOT remove XLSForm parser or converter services** — used by both the API and admin CLI scripts.
- **Do NOT remove the 3 active View-As session endpoints** (`/start`, `/end`, `/current`) — all consumed by frontend.
- **Do NOT remove code "just because it looks old"** — verify zero imports/references before deletion.

### References

- [Source: epic-6-retro-2026-03-04.md#Technical Debt TD2] — "Dead code cleanup (XLSForm endpoint, unused View-As APIs)"
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-9] — Task definition (LOW priority)
- [Source: view-as.api.ts:64-66] — Frontend comment confirming sidebar endpoint is unused
- [Source: SCP-2026-02-05-001] — ODK removal decision (XLSForm retained for migration)

## Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] M1: Stale frontend comment in `view-as.api.ts:64-66` references removed `/view-as/data/sidebar` endpoint as if it still exists — violates AC #3. Fixed: updated comment to reflect endpoint was removed. [apps/web/src/features/dashboard/api/view-as.api.ts:64]
- [x] [AI-Review][MEDIUM] M2: `closeEmailQueue()` exported but never called — email queue producer Redis connection leaks on graceful shutdown. Pre-existing but within Task 3 scan scope. Fixed: wired into `closeAllWorkers()`. [apps/api/src/workers/index.ts:116]
- [x] [AI-Review][LOW] L1: Task numbering gap — tasks jumped from 2.2 to 2.4 (no 2.3). Fixed: renumbered 2.4→2.3, 2.5→2.4.
- [x] [AI-Review][LOW] L2: AC #2 says "controller handler" but handler was inline in routes file, no controller involved. Fixed: updated AC wording.

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean removal, no debugging needed.

### Completion Notes List
- Removed unused `uploadXlsform` export from `upload.middleware.ts` (lines 137-143). Confirmed zero imports codebase-wide. The active exports (`xlsformUpload`, `handleMulterError`, `validateFileContent`) remain and are consumed by `questionnaire.routes.ts`.
- Removed dead `GET /view-as/data/sidebar` route handler from `view-as-data.routes.ts` (lines 47-63) and `getSidebarItems()` method from `view-as-data.service.ts` (lines 180-224). Frontend uses hardcoded `SIDEBAR_MAP` in `ViewAsDashboardPage.tsx` instead. No tests existed for this endpoint.
- (AC #4) Found and removed deprecated `emailQueue` backwards-compatibility proxy export from `email.queue.ts` (lines 73-119). Zero consumers — all 8 importing modules use named function exports (`queueStaffInvitationEmail`, `getEmailQueueStats`, etc.) instead.
- ODK scan: only a benign comment in `report.service.ts:67` — no actual ODK code remains.
- Full test suite: 1,313 API + 1,970 web = 3,283 total tests pass, zero regressions.
- (Code Review) Updated stale frontend comment in `view-as.api.ts:64-66` — was referencing the just-removed sidebar endpoint as still existing.
- (Code Review) Wired orphaned `closeEmailQueue()` into `closeAllWorkers()` in `workers/index.ts` — email queue producer Redis connection was leaking on graceful shutdown.

### Change Log
- 2026-03-06: Dead code cleanup — 3 items removed (unused uploadXlsform export, dead /view-as/data/sidebar endpoint + service method, deprecated emailQueue proxy). Zero regressions on 3,283 tests.
- 2026-03-06: Code review — 4 issues found (2M, 2L), all fixed: stale frontend comment updated, closeEmailQueue() wired into graceful shutdown, task numbering + AC wording corrected.

### File List
- `apps/api/src/middleware/upload.middleware.ts` — removed unused `uploadXlsform` export (lines 137-143)
- `apps/api/src/routes/view-as-data.routes.ts` — removed dead `GET /sidebar` route handler + updated file doc comment
- `apps/api/src/services/view-as-data.service.ts` — removed dead `getSidebarItems()` method
- `apps/api/src/queues/email.queue.ts` — removed deprecated `emailQueue` backwards-compat proxy export
- `apps/web/src/features/dashboard/api/view-as.api.ts` — (review) updated stale comment referencing removed sidebar endpoint
- `apps/api/src/workers/index.ts` — (review) wired `closeEmailQueue()` into graceful shutdown
