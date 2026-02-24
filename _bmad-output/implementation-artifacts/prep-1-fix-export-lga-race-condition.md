# Prep 1: Fix Export LGA Race Condition

Status: done

## Story

As a Super Admin (or Assessor, or Government Official),
I want the Export Reports page to load reliably on first navigation,
so that I can immediately begin filtering and exporting respondent data without encountering errors.

## Problem

**Bug B1** (discovered during Epic 5 UAT, severity MEDIUM): Navigating to `/dashboard/super-admin/export` (or `/dashboard/assessor/export`, `/dashboard/official/export`) throws `lgas.map is not a function` on initial page load, then works on retry/refresh. Both local and production.

**Root Cause**: The `ExportPage` component destructures `useLgas()` without a default value:
```tsx
const { data: lgas, isLoading: lgasLoading } = useLgas();
```

The skeleton guard at line 122 only checks `lgasLoading`:
```tsx
{lgasLoading ? ( <skeleton> ) : ( <filters with lgas?.map()> )}
```

When TanStack Query transitions states — specifically when `isLoading` becomes `false` before `data` is populated (or on error/network race) — `lgas` is `undefined` or a non-array value. The optional chaining `lgas?.map()` protects against `undefined` but not against non-array values. The component renders filter controls with no data, causing the crash.

**Why retry works**: On second navigation, TanStack Query serves the cached response (staleTime: 5 min), so `data` is immediately an array on mount.

## Acceptance Criteria

**AC1**: Given the Export page, when a user navigates to it for the first time, then the page loads without errors and displays the filter skeleton until LGA data is available.

**AC2**: Given the `useLgas()` hook returns `{ data: undefined, isLoading: false }` (error or transition state), when the ExportPage renders, then it renders gracefully without crashing (filter controls shown with empty LGA dropdown via `= []` default).

**AC3**: Given the LGA data loads successfully, when the skeleton transitions to filter controls, then all 6 filter dropdowns (LGA, Source, Date From, Date To, Severity, Status) render correctly with LGA options populated.

**AC4**: Given the fix is applied, when running the existing ExportPage test suite, then all existing tests pass with zero regressions.

**AC5**: Given the race condition scenario (`isLoading: false`, `data: undefined`), when tested, then a new test case verifies the component renders gracefully (no crash, filter controls shown with empty dropdown).

**AC6**: Given the fix is applied, when a 403 Forbidden is returned from `/api/v1/lgas` (unauthorized role), then the page shows a skeleton or empty state — never a crash. (A7: 403 authorization guard test.)

## Tasks / Subtasks

- [x] Task 1: Fix ExportPage LGA race condition (AC: #1, #2, #3)
  - [x] 1.1 Add default empty array to `useLgas()` destructuring: `const { data: lgas = [], isLoading: lgasLoading } = useLgas();`
  - [x] 1.2 Skeleton guard unchanged — `lgasLoading` check is correct; default `[]` prevents the crash; no infinite skeleton risk
  - [x] 1.3 Verified optional chaining `lgas?.map()` retained at line 143 as defense-in-depth
- [x] Task 2: Add missing test cases (AC: #4, #5, #6)
  - [x] 2.1 Added test: `data: undefined, isLoading: false` — renders filter controls, no crash
  - [x] 2.2 Added test: `data: [], isLoading: false` — renders empty dropdown, no crash
  - [x] 2.3 Added test: `data: null, isLoading: false` — null safety via optional chaining `?.map()` (destructuring default `= []` only applies to `undefined`, not `null`)
  - [x] 2.4 Added test: `data: undefined, isLoading: true` — skeleton shown during initial loading
  - [x] 2.5 Added test: `isError: true, isLoading: false` — AC6 error indicator shown on query failure (403/network error)
- [x] Task 3: Verify fix across all role routes (AC: #1)
  - [x] 3.1 Confirmed ExportPage shared at 3 routes: super-admin (App.tsx:652), assessor (:950), official (:1020)
  - [x] 3.2 Full web test suite: 154 files, 1,797 passed, 0 failures, 0 regressions
- [x] Task 4: Update story status and dev agent record

## Dev Notes

### Root Cause Deep-Dive

The bug is a classic TanStack Query race condition pattern. In TanStack Query v5:
- `isLoading = isPending && isFetching` — true only during first fetch
- `data` starts as `undefined` before any fetch resolves
- On mount, the query enters pending state and `isLoading` should be `true`
- BUT there can be brief moments during React render cycles where state transitions are not atomic from the component's perspective

The safest fix pattern used across this codebase (see `AddStaffModal.tsx` line 57): `const lgasData = data?.data ?? [];` — always default to empty array.

### Existing Code to Reuse

| Component | Location | Pattern |
|-----------|----------|---------|
| `useLgas()` hook | `apps/web/src/features/dashboard/hooks/useExport.ts:35-41` | TanStack Query with 5min staleTime |
| `useLgas()` hook (staff) | `apps/web/src/features/staff/hooks/useStaff.ts:75-81` | Separate hook, same concept — uses `?.data ?? []` guard |
| `fetchLgas()` API fn | `apps/web/src/features/dashboard/api/export.api.ts:82-85` | Returns `result.data` from `/lgas` |
| ExportPage tests | `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` | vi.mock pattern for useExport hooks |
| LGA route | `apps/api/src/routes/lga.routes.ts:21-46` | Authorized for Super Admin, Assessor, Official, Supervisor |

### Key Implementation Details

1. **The fix is a 1-line change** in ExportPage.tsx line 66: add `= []` default to destructured `lgas`
2. **Do NOT change the hook itself** — the hook correctly returns `LgaItem[] | undefined` from TanStack Query
3. **Do NOT change the API function** — `fetchLgas()` correctly returns the array
4. **The optional chaining `lgas?.map()` at line 143 should remain** as defense-in-depth
5. **Test mock pattern**: The test file uses module-level `let mockLgasReturn` with reset in `beforeEach` — follow this pattern

### File Change Scope (Minimal)

**Modified files:**
- `apps/web/src/features/dashboard/pages/ExportPage.tsx` — line 66 default value
- `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` — 3-4 new test cases

**No backend changes required** — the API endpoint and hook are correct.

### Project Structure Notes

- Alignment with unified project structure: All files are in the correct feature-based locations
- No new files needed — modifications only
- Pattern consistent with `AddStaffModal.tsx` which already uses `?.data ?? []` guard

### Testing Standards

- Use `data-testid` selectors only (A3: no CSS class selectors in tests)
- Follow existing mock pattern with `vi.hoisted()` + `vi.mock()`
- Tests must be co-located at `__tests__/ExportPage.test.tsx`
- Must verify no regressions in the existing 11 test cases

### References

- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#Bug-B1] — Bug discovery during UAT
- [Source: apps/web/src/features/dashboard/pages/ExportPage.tsx#L66] — Race condition location
- [Source: apps/web/src/features/dashboard/hooks/useExport.ts#L35-41] — useLgas hook
- [Source: apps/web/src/features/dashboard/api/export.api.ts#L82-85] — fetchLgas API function
- [Source: apps/web/src/features/staff/components/AddStaffModal.tsx#L54-57] — Reference safe pattern
- [Source: apps/api/src/routes/lga.routes.ts#L21-46] — Backend LGA endpoint with role authorization
- [Source: _bmad-output/implementation-artifacts/5-4-pii-rich-csv-pdf-exports.md] — Story 5.4 (original export implementation)

### Previous Story Intelligence

**From Epic 5 prep and stories:**
- Story 5.4 created the ExportPage; code review found 9 issues (3H, 4M, 2L) including Zod validation gaps and A3 test violations
- The `useLgas` hook was added as part of Story 5.4 for the LGA filter dropdown
- Pattern from Story 5.5: `data ?? []` default used extensively for TanStack Table data guards

### Git Intelligence

Recent commits are all Epic 5 completions. Relevant pattern:
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — shows pattern of fixing data-dependent rendering across dashboards
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro where bug was discovered

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No blockers encountered.

### Completion Notes List

- Fixed race condition by adding default empty array to `useLgas()` destructuring (`= []`)
- Retained existing optional chaining `lgas?.map()` as defense-in-depth
- Added 5 new test cases covering: undefined data, empty array, null safety, loading+undefined state, and error state (isError: true)
- Verified ExportPage is shared component used at 3 routes (super-admin, assessor, official)
- Full web test suite: 154 files, 1,797 tests passed, 0 regressions
- Code review: Added `isError` destructuring from `useLgas()` with dynamic placeholder and error indicator for LGA query failures
- Code review: Fixed AC2/AC5 wording, null safety comment, AC6 test state, File List completeness

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: AC2 text said "shows filter skeleton" but implementation renders empty filter controls — fixed AC2 wording to match correct behavior [prep-1-fix-export-lga-race-condition.md:AC2]
- [x] [AI-Review][HIGH] H2: AC6 test tested `isLoading: true` (initial loading) instead of actual 403 error state (`isLoading: false, isError: true`) — renamed old test, added proper error state test [ExportPage.test.tsx:221-237]
- [x] [AI-Review][MEDIUM] M1: Test comment claimed "default empty array handles null" but JS destructuring `= []` only applies to `undefined`, not `null` — fixed comment to credit `?.map()` [ExportPage.test.tsx:217]
- [x] [AI-Review][MEDIUM] M2: `sprint-status.yaml` modified in git but missing from story File List — added to File List [prep-1-fix-export-lga-race-condition.md:File List]
- [x] [AI-Review][MEDIUM] M3: No `isError` handling on `useLgas()` — silent empty dropdown on 403/network error — added `isError` destructure, dynamic placeholder ("LGA unavailable"), and error text indicator [ExportPage.tsx:66,143-145]
- [x] [AI-Review][LOW] L1: AC5 parenthetical also said "skeleton shown" contradicting implementation — fixed AC5 wording [prep-1-fix-export-lga-race-condition.md:AC5]
- [x] [AI-Review][LOW] L2: Null test tests impossible scenario (TanStack Query never returns `null` for data) — kept as defense-in-depth, fixed misleading comment [ExportPage.test.tsx:213-219]

### Change Log

- 2026-02-24: Implemented fix and tests. All ACs satisfied. (prep-1)
- 2026-02-24: Code review — 7 findings (2H, 3M, 2L). All fixed: AC text corrections, proper AC6 error test, isError handling with UI indicator, null comment fix, File List update. Tests: 16 passed. (review)

### File List

- `apps/web/src/features/dashboard/pages/ExportPage.tsx` (modified — line 66 default value + line 66 isError destructure + LGA error indicator)
- `apps/web/src/features/dashboard/pages/__tests__/ExportPage.test.tsx` (modified — 5 new test cases, fixed comments)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — prep-epic-6, prep-1, prep-2 status updates)
