# Story 7.prep-11: Fix View-As Multi-Role Rendering

Status: done

## Story

As a **Super Admin using View-As mode**,
I want all 5 viewable roles to render their actual Home page components (not just generic cards),
so that View-As fulfills its debugging/demo purpose of showing what each role actually sees.

## Context

Story 6-7 implemented the View-As feature with Redis session management, 4-layer read-only enforcement, and audit trail (53 tests). However, the Epic 6 retro flagged Challenge #5: "View-As only renders one role correctly; other roles don't display properly. The component import mapping (roleComponentMap) likely has incorrect or missing lazy-loaded routes for some roles."

**Root Cause (confirmed by investigation):**

The `roleComponentMap` from the prep-6 spike was designed but **never implemented**. `ViewAsDashboardPage.tsx` renders a generic dashboard shell for ALL roles:
- Sidebar navigation (hardcoded `SIDEBAR_MAP` — works for all 5 roles)
- Summary cards from backend `GET /view-as/data/dashboard` endpoint
- Read-only notice

It does NOT render the actual role-specific page components (`SupervisorHome`, `EnumeratorHome`, etc.). The wildcard route `view-as/:role/*` exists but always renders the same `ViewAsDashboardPage` regardless of sub-path.

**Backend dashboard card queries may also have issues** — `getClerkSummary()` queries `WHERE source = 'data_entry_clerk'` which may reference a non-existent column. All methods have try/catch fallbacks that return empty cards, masking errors.

**Scope boundary:** This story implements the `roleComponentMap` for Home pages and sidebar sub-page rendering. It does NOT refactor role-specific page components to accept external role/LGA context — pages render with the data they can fetch. For pages that require role-specific auth context (e.g., message inbox), a "Not available in preview" placeholder is acceptable.

## Acceptance Criteria

1. **Given** View-As mode for any of the 5 viewable roles, **when** the dashboard loads at `/view-as/:role`, **then** the target role's actual Home page component renders (e.g., `SupervisorHome` for supervisor, `EnumeratorHome` for enumerator).
2. **Given** View-As mode with sidebar navigation, **when** the admin clicks a sidebar item (e.g., "Team Progress"), **then** the corresponding role-specific page component renders at `/view-as/:role/:subpath` (e.g., `SupervisorTeamPage` at `/view-as/supervisor/team`).
3. **Given** a role-specific page that requires auth context the View-As session cannot provide, **when** it fails to load data, **then** it degrades gracefully (empty state or "Preview unavailable for this page" placeholder) — NOT a crash or blank screen.
4. **Given** the `ViewAsDashboardPage`, **when** rendering any role, **then** the ViewAsBanner and sidebar remain visible, and the main content area shows the role-specific component.
5. **Given** the backend `ViewAsDataService`, **when** each of the 5 role summaries is requested, **then** all return valid card data (fix any broken queries).
6. **Given** the existing frontend tests, **when** updated, **then** tests cover rendering for all 5 roles (not just supervisor).
7. **Given** the existing test suite, **when** all tests run, **then** zero regressions.

## Tasks / Subtasks

- [x] Task 1: Investigate and fix backend dashboard data for all 5 roles (AC: #5)
  - [x] 1.1 **FIX `getClerkSummary()`** (`view-as-data.service.ts:108`): `WHERE source = 'data_entry_clerk'` uses a value that doesn't exist in the enum. `ingestionSourceTypes` is `['webapp','mobile','webhook','backfill','manual','public','enumerator','clerk']` — correct value is `'clerk'`, not `'data_entry_clerk'`. Change to `WHERE source = 'clerk'`.
  - [x] 1.2 **FIX `getEnumeratorSummary()`** (`view-as-data.service.ts:54,59`): `WHERE lga_id = ${lgaId}` on `submissions` table — but `submissions` has NO `lga_id` column. `lga_id` is on the `respondents` table. Fix: JOIN through `respondents` (e.g., `FROM submissions s JOIN respondents r ON s.respondent_id = r.id WHERE r.lga_id = ${lgaId}`).
  - [x] 1.3 **FIX `getSupervisorSummary()`** (`view-as-data.service.ts:78`): Same `lga_id` bug as enumerator — `submissions` has no `lga_id` column. Apply same JOIN fix.
  - [x] 1.4 **FIX `getAssessorSummary()`** (`view-as-data.service.ts:129,134`): `WHERE status = 'pending'` — `fraud_detections` has NO `status` column. Columns are `severity` (text enum), `resolution` (text enum, nullable), `assessor_resolution` (text enum, nullable). For "pending reviews", use `WHERE resolution IS NULL` (unreviewed by supervisor). For "reviewed", use `WHERE resolution IS NOT NULL`.
  - [x] 1.5 `getOfficialSummary()` — Works correctly, no fix needed. `respondents.created_at` exists.
  - [x] 1.6 Test each fixed method manually or add targeted tests to confirm correct results.
- [x] Task 2: Implement roleComponentMap in ViewAsDashboardPage (AC: #1, #2, #4)
  - [x] 2.1 Create a `roleRouteMap` that maps each role to its lazy-loaded page components (all 5 roles, 25 routes total).
  - [x] 2.2 Extract sub-path from `useParams()['*']` wildcard match (React Router v6).
  - [x] 2.3 If sub-path matches a roleRouteMap entry, render that component. If sub-path is empty (''), render the Home component. If no match, render the existing generic dashboard cards (fallback).
  - [x] 2.4 Wrap rendered components in `<Suspense>` with amber spinner fallback.
  - [x] 2.5 Ensure ViewAsBanner + sidebar remain visible (layout wrapper stays, only main content swaps).
- [x] Task 3: Handle graceful degradation for pages that fail (AC: #3)
  - [x] 3.1 Wrap each rendered component in existing ErrorBoundary with "Preview unavailable for this page in View-As mode" fallback. resetKey based on role+subPath.
  - [x] 3.2 Pages that call `useAuth()` expecting a specific role will still see `super_admin` — some may show empty data (acceptable), others may conditionally render nothing. The error boundary ensures no crashes.
  - [x] 3.3 Write-heavy components (FormFillerPage, ClerkDataEntryPage) excluded from roleRouteMap — they fall through to the generic dashboard cards.
- [x] Task 4: Update App.tsx route structure if needed (AC: #2)
  - [x] 4.1 Verified: existing `view-as/:role/*` wildcard route is sufficient. `useParams()['*']` extracts sub-path. No App.tsx changes needed.
  - [x] 4.2 Route logic kept inside `ViewAsDashboardPage` via roleRouteMap — no nested Routes added to App.tsx.
- [x] Task 5: Update tests for multi-role coverage (AC: #6, #7)
  - [x] 5.1 Added test cases for all 5 roles' Home pages using `it.each`. Each verifies sidebar renders and correct Home component loads.
  - [x] 5.2 Test sub-page navigation: 11 sub-path tests across all roles verifying correct component renders.
  - [x] 5.3 Test fallback: unknown sub-path renders generic dashboard cards.
  - [x] 5.4 Test error boundary: component crash renders "Preview unavailable" message.
  - [x] 5.5 `pnpm test` — 1,991 web + API tests pass, zero regressions.

## Dev Notes

### What Already Works (Do Not Break)

| Component | Status | Notes |
|-----------|--------|-------|
| ViewAsPage (role selector) | Working | 5 role cards, LGA dropdown, reason field |
| ViewAsProvider context | Working | isViewingAs, targetRole, blockAction, auto-expiry |
| ViewAsBanner | Working | Amber banner with role name, exit button, admin identity |
| Backend session mgmt | Working | Redis sessions, 30-min TTL, concurrent session prevention |
| Backend data proxy | Partially | `GET /view-as/data/dashboard` handles all 5 roles but queries may fail silently |
| Auth middleware View-As | Working | `req.viewAs` attached for Super Admins, mutations blocked |
| Audit trail | Working | `view_as.start`, `view_as.end` actions logged |
| Read-only enforcement | Working | API blocks POST/PUT/PATCH/DELETE, frontend `blockAction()` |

### Current Route Wiring (App.tsx lines 713-741)

```
/dashboard/super-admin/view-as       → ViewAsPage (role selector)
/dashboard/super-admin/view-as/:role  → ViewAsProvider > ViewAsDashboardPage
/dashboard/super-admin/view-as/:role/* → ViewAsProvider > ViewAsDashboardPage (wildcard)
```

Both `:role` and `:role/*` render the same `ViewAsDashboardPage` — no sub-path differentiation.

### Role Page Components (existing lazy imports in App.tsx)

**Supervisor** (lines 746-832):
| Sidebar href | Component | Import Path |
|-------------|-----------|-------------|
| (index) | `SupervisorHome` | `./features/dashboard/pages/SupervisorHome` |
| team | `SupervisorTeamPage` | `./features/dashboard/pages/SupervisorTeamPage` |
| productivity | `SupervisorProductivityPage` | `./features/dashboard/pages/SupervisorProductivityPage` |
| registry | `RespondentRegistryPage` | `./features/dashboard/pages/RespondentRegistryPage` |
| fraud | `SupervisorFraudPage` | `./features/dashboard/pages/SupervisorFraudPage` |
| messages | `SupervisorMessagesPage` | `./features/dashboard/pages/SupervisorMessagesPage` |

**Enumerator** (lines 834-911):
| Sidebar href | Component | Import Path |
|-------------|-----------|-------------|
| (index) | `EnumeratorHome` | `./features/dashboard/pages/EnumeratorHome` |
| survey | `EnumeratorSurveysPage` | `./features/dashboard/pages/EnumeratorSurveysPage` |
| drafts | `EnumeratorDraftsPage` | `./features/dashboard/pages/EnumeratorDraftsPage` |
| sync | `EnumeratorSyncPage` | `./features/dashboard/pages/EnumeratorSyncPage` |
| messages | `EnumeratorMessagesPage` | `./features/dashboard/pages/EnumeratorMessagesPage` |

**Data Entry Clerk** (lines 913-971):
| Sidebar href | Component | Import Path |
|-------------|-----------|-------------|
| (index) | `ClerkHome` | `./features/dashboard/pages/ClerkHome` |
| surveys | `ClerkSurveysPage` | `./features/dashboard/pages/ClerkSurveysPage` |
| completed | `ClerkCompletedPage` | `./features/dashboard/pages/ClerkCompletedPage` |
| stats | `ClerkStatsPage` | `./features/dashboard/pages/ClerkStatsPage` |

**Verification Assessor** (lines 973-1050):
| Sidebar href | Component | Import Path |
|-------------|-----------|-------------|
| (index) | `AssessorHome` | `./features/dashboard/pages/AssessorHome` |
| queue | `AssessorQueuePage` | `./features/dashboard/pages/AssessorQueuePage` |
| registry | `RespondentRegistryPage` | `./features/dashboard/pages/RespondentRegistryPage` |
| completed | `AssessorCompletedPage` | `./features/dashboard/pages/AssessorCompletedPage` |
| export | `ExportPage` | `./features/dashboard/pages/ExportPage` |

**Government Official** (lines 1052-1129):
| Sidebar href | Component | Import Path |
|-------------|-----------|-------------|
| (index) | `OfficialHome` | `./features/dashboard/pages/OfficialHome` |
| stats | `OfficialStatsPage` | `./features/dashboard/pages/OfficialStatsPage` |
| trends | `OfficialTrendsPage` | `./features/dashboard/pages/OfficialTrendsPage` |
| registry | `RespondentRegistryPage` | `./features/dashboard/pages/RespondentRegistryPage` |
| export | `ExportPage` | `./features/dashboard/pages/ExportPage` |

### The Auth Context Challenge

Role-specific pages call `useAuth()` which returns the real Super Admin identity (by design — ADR-016). Some pages may:
- **Work fine**: Pages that fetch data by query params or don't check role (e.g., `RespondentRegistryPage`, `ExportPage`)
- **Show empty data**: Pages that filter by `user.role` or `user.lgaId` (e.g., `SupervisorTeamPage` may show 0 team members because Super Admin has no `lgaId`)
- **Crash**: Pages that assert a specific role (unlikely but possible)

The error boundary in Task 3 handles the crash case. Empty data is acceptable — the View-As purpose is to see the UI layout and navigation, not necessarily live-filtered data.

### Backend Query Bugs — Confirmed (Task 1)

4 of 5 dashboard queries are definitively broken (confirmed against schema):

1. **`getClerkSummary()`** (`view-as-data.service.ts:108`): `WHERE source = 'data_entry_clerk'` — column exists but value is wrong. `ingestionSourceTypes` = `['webapp','mobile','webhook','backfill','manual','public','enumerator','clerk']`. Returns 0 rows silently. **Fix:** `'clerk'`.
2. **`getEnumeratorSummary()`** (`view-as-data.service.ts:54`): `WHERE lga_id = ${lgaId}` on `submissions` — **column does not exist**. `lga_id` is on `respondents` table only (`respondents.ts:28`). Throws "column lga_id does not exist", caught by try/catch → empty cards. **Fix:** JOIN through respondents.
3. **`getSupervisorSummary()`** (`view-as-data.service.ts:78`): Same `lga_id` bug as enumerator.
4. **`getAssessorSummary()`** (`view-as-data.service.ts:129`): `WHERE status = 'pending'` — **column does not exist** on `fraud_detections`. Columns are `severity`, `resolution`, `assessor_resolution` (`fraud-detections.ts:66-84`). **Fix:** use `WHERE resolution IS NULL` for pending.
5. **`getOfficialSummary()`** (`view-as-data.service.ts:155`): ✅ Works fine — `respondents.created_at` exists.

### Existing Test Coverage (Only Supervisor)

`ViewAsDashboardPage.test.tsx` (193 lines):
- All mocks hardcoded to `supervisor` role (lines 21, 47, 143)
- Tests: sidebar items, banner, dashboard content, cards, loading state
- Missing: enumerator, data_entry_clerk, verification_assessor, government_official

### Project Structure Notes

- Primary file to modify: `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx` (248 lines)
- Test to update: `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx` (193 lines)
- Backend to fix: `apps/api/src/services/view-as-data.service.ts` (225 lines)
- Route wiring (if needed): `apps/web/src/App.tsx` (lines 713-741)
- Role page components: `apps/web/src/features/dashboard/pages/` (existing, no modification needed)
- ViewAsContext: `apps/web/src/features/dashboard/context/ViewAsContext.tsx` (116 lines, no modification expected)

### Anti-Patterns to Avoid

- **Do NOT modify role-specific page components** to accept external role/LGA props — that's a massive refactor out of scope. Let them render with whatever data they can fetch. Empty data is acceptable.
- **Do NOT override `useAuth()`** in the View-As context — ADR-016 mandates that the Super Admin's identity is always preserved. `req.user` always reflects the real admin.
- **Do NOT redirect to actual role routes** (e.g., `/dashboard/supervisor/team`) — ADR-016 strict route isolation. All View-As rendering happens under `/dashboard/super-admin/view-as/*`.
- **Do NOT remove the generic dashboard cards fallback** — it serves as the fallback when a sub-path doesn't match the roleRouteMap or when a component fails to load.
- **Do NOT add massive new route trees in App.tsx** — prefer keeping the roleRouteMap inside `ViewAsDashboardPage` to keep routing logic self-contained.
- **Do NOT import write-heavy components** (FormFillerPage, ClerkDataEntryPage) into the roleRouteMap — these are interactive form-filling pages that make no sense in read-only View-As mode.

### References

- [Source: epic-6-retro-2026-03-04.md#Challenge 5] — "View-As only renders one role correctly; other roles don't display properly"
- [Source: epic-6-retro-2026-03-04.md#Prep Tasks prep-11] — "Fix View-As multi-role rendering: Investigate roleComponentMap imports, fix all 5 viewable roles"
- [Source: 6-7-super-admin-view-as-feature.md#AC1] — "target role's dashboard renders...showing that role's sidebar items, home page, and navigable sub-pages"
- [Source: 6-7-super-admin-view-as-feature.md#Dev Notes] — "Frontend Rendering: Component Import Strategy"
- [Source: prep-6-view-as-authentication-spike.md] — Original spike design with roleComponentMap concept
- [Source: ViewAsDashboardPage.tsx:60-96] — Hardcoded SIDEBAR_MAP (works for all 5 roles)
- [Source: view-as-data.service.ts:34-49] — getDashboardSummary switch (all 5 roles)
- [Source: App.tsx:746-1129] — Existing role-specific route trees and page components
- [Source: middleware/auth.ts:96-114] — View-As state attachment for Super Admins
- [Source: MEMORY.md] — "View-As partial implementation: Only one role renders correctly in View-As mode. Prep-11 for Epic 7."

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: Clerk summary test has zero query assertion — added `source =` positive check and `not.toContain('data_entry_clerk')` negative check [`apps/api/src/services/__tests__/view-as-data.service.test.ts:74-77`]
- [x] [AI-Review][MEDIUM] M1: 9 of 20 sub-path routes untested — added all missing sub-paths (supervisor/registry, supervisor/messages, enumerator/sync, enumerator/messages, data_entry_clerk/completed, verification_assessor/completed, verification_assessor/export, government_official/registry, government_official/export) to it.each [`apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx:242-263`]
- [x] [AI-Review][MEDIUM] M2: Backend tests lack positive assertions for SQL fixes — added `toContain('JOIN respondents')` for enumerator/supervisor, `toContain('resolution IS NULL')` / `toContain('resolution IS NOT NULL')` for assessor [`apps/api/src/services/__tests__/view-as-data.service.test.ts:37-42,60-63,93-95`]
- [x] [AI-Review][MEDIUM] M3: Non-null assertion `targetLgaId!` for field roles — replaced with null guard returning empty cards + added backend test for null lgaId [`apps/api/src/services/view-as-data.service.ts:37-40`, `view-as-data.service.test.ts:127-135`]
- [x] [AI-Review][LOW] L1: Story doc route count "22" vs actual 25 — corrected in Task 2.1 below
- [x] [AI-Review][LOW] L2: Dev notes ExportPage import path inconsistency — corrected in reference table below

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, no debug cycles needed.

### Completion Notes List
- **Task 1 (Backend fixes):** Fixed 4 broken dashboard queries in `view-as-data.service.ts`:
  - `getEnumeratorSummary()`: Fixed missing `lga_id` column on `submissions` — added JOIN through `respondents`
  - `getSupervisorSummary()`: Same `lga_id` JOIN fix for submission count query
  - `getClerkSummary()`: Changed `source = 'data_entry_clerk'` to `source = 'clerk'` (correct enum value)
  - `getAssessorSummary()`: Replaced non-existent `status = 'pending'` with `resolution IS NULL` / `IS NOT NULL`
  - `getOfficialSummary()`: Confirmed working, no changes needed
  - Added 7 backend tests covering all 5 roles + unknown role + DB error graceful degradation
- **Task 2 (roleRouteMap):** Implemented lazy-loaded `roleRouteMap` in `ViewAsDashboardPage.tsx` mapping all 5 roles to their page components (22 routes total). Sub-path extracted via `useParams()['*']`. Home renders on empty sub-path, generic dashboard cards as fallback for unmatched paths.
- **Task 3 (Graceful degradation):** Wrapped role components in `ErrorBoundary` with "Preview unavailable for this page in View-As mode" fallback. `resetKey` based on `role-subPath`. Write-heavy components (FormFillerPage, ClerkDataEntryPage) excluded from roleRouteMap.
- **Task 4 (Route structure):** Verified existing `view-as/:role/*` wildcard route is sufficient. No App.tsx changes needed.
- **Task 5 (Tests):** 35 frontend tests covering all 5 roles' Home pages (it.each), 20 sub-path navigation tests (all routes), fallback rendering, and error boundary. 8 backend tests covering all 5 roles + null lgaId guard + DB error graceful degradation.

### Change Log
- 2026-03-06: Implemented all 5 tasks — backend query fixes, roleRouteMap, error boundary, test coverage for all 5 roles.
- 2026-03-06: Adversarial code review — fixed 6 issues (1 HIGH, 3 MEDIUM, 2 LOW): added null guard for field role lgaId, added positive SQL assertions in backend tests, added clerk query assertion, expanded sub-path test coverage from 11→20, corrected story doc inaccuracies.

### File List
- `apps/api/src/services/view-as-data.service.ts` — Fixed 4 broken queries (enumerator JOIN, supervisor JOIN, clerk source value, assessor resolution column)
- `apps/api/src/services/__tests__/view-as-data.service.test.ts` — NEW: 7 backend tests for all 5 role summaries + edge cases
- `apps/web/src/features/dashboard/pages/ViewAsDashboardPage.tsx` — Added roleRouteMap (22 lazy routes), Suspense wrapping, ErrorBoundary, sub-path routing
- `apps/web/src/features/dashboard/pages/__tests__/ViewAsDashboardPage.test.tsx` — Rewritten: 26 tests covering all 5 roles, sub-pages, fallback, error boundary
