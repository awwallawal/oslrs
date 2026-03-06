# Story 7.prep-9: Dead Code Cleanup

Status: ready-for-dev

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
2. **Given** the `GET /view-as/data/sidebar` endpoint, **when** cleanup is complete, **then** the route, controller handler, and service method are removed (frontend uses hardcoded `SIDEBAR_MAP` instead).
3. **Given** the removals, **when** the full codebase is searched, **then** no remaining imports or references to the removed code exist.
4. **Given** any additional dead code discovered during cleanup, **when** verified as truly unused, **then** it is removed and documented in completion notes.
5. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [ ] Task 1: Remove unused `uploadXlsform` export (AC: #1, #3)
  - [ ] 1.1 In `apps/api/src/middleware/upload.middleware.ts` (lines 140-143), remove the `uploadXlsform` constant and its export
  - [ ] 1.2 Grep for `uploadXlsform` across the entire codebase to confirm zero imports
  - [ ] 1.3 Verify the other exports (`xlsformUpload`, `handleMulterError`, `validateFileContent`) are still used in `questionnaire.routes.ts`
- [ ] Task 2: Remove unused `/view-as/data/sidebar` endpoint (AC: #2, #3)
  - [ ] 2.1 In `apps/api/src/routes/view-as-data.routes.ts`, remove the inline `GET /sidebar` handler (lines 47-63) — there is no separate controller; the handler is defined inline in the route file
  - [ ] 2.2 In `apps/api/src/services/view-as-data.service.ts`, remove the `getSidebarItems()` service method (line 184) — only consumed by the removed route handler
  - [ ] 2.4 Verify the frontend comment confirms this endpoint is unused: `apps/web/src/features/dashboard/api/view-as.api.ts` (lines 64-66) — comment says "frontend uses hardcoded SIDEBAR_MAP"
  - [ ] 2.5 Remove any related tests for the sidebar endpoint
- [ ] Task 3: Opportunistic scan for other dead code (AC: #4)
  - [ ] 3.1 Search for `TODO: remove`, `DEPRECATED`, `DEAD`, `UNUSED` comments in `apps/api/src/`
  - [ ] 3.2 Check for ODK remnants beyond comments (SCP-2026-02-05-001 removed ODK but some code paths may reference it)
  - [ ] 3.3 If any additional dead code found, verify it's unused before removing
- [ ] Task 4: Verify (AC: #5)
  - [ ] 4.1 `pnpm test` — all tests pass, zero regressions

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
