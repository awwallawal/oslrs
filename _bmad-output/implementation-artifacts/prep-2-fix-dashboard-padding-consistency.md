# Prep 2: Fix Dashboard Padding Consistency

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin (or any dashboard user),
I want all dashboard pages to have consistent padding from the sidebar and edges,
so that the interface looks polished and professional across all sections.

## Problem

**Bug B2** (discovered during Epic 5 UAT, severity LOW): `/super-admin/questionnaires` and `/super-admin/registry` have content flush against the sidebar with no breathing room. Inconsistent with `/super-admin/staff` and other dashboard pages which have proper `p-6` padding. Same class of issue was fixed for SupervisorProductivityPage in Story 5-6b.

**Root Cause**: The `DashboardLayout` component's `<main>` element does NOT provide content padding — it only adds `pb-16 lg:pb-0` for mobile bottom navigation. Each page is responsible for its own `p-6` wrapper. Three pages in the questionnaires and dashboard features were created without this padding.

**Affected Pages:**
1. `QuestionnaireManagementPage.tsx` — outer div is `<div className="space-y-6">` (missing `p-6`)
2. `RespondentRegistryPage.tsx` — outer div is `<div className="space-y-4">` (missing `p-6`)
3. `FormBuilderPage.tsx` — loading state div and main return div both missing `p-6`

**Reference (correct pattern):**
- `StaffManagementPage.tsx` line 149: `<div className="p-6 space-y-6">` — this is the standard.

## Acceptance Criteria

**AC1**: Given the Questionnaire Management page (`/super-admin/questionnaires`), when a Super Admin navigates to it, then the content has consistent `p-6` padding matching the Staff Management page.

**AC2**: Given the Respondent Registry page (`/super-admin/registry`), when a Super Admin navigates to it, then the content has consistent `p-6` padding matching the Staff Management page.

**AC3**: Given the Form Builder page (`/super-admin/questionnaires/builder/:id`), when a Super Admin navigates to it (including loading state), then the content has consistent `p-6` padding.

**AC4**: Given the Form Builder error state (schema load failure), when the error view renders, then the content has consistent `p-6` padding.

**AC5**: Given the fix is applied, when running the existing web test suite, then all existing tests pass with zero regressions.

## Tasks / Subtasks

- [x] Task 1: Add `p-6` to QuestionnaireManagementPage (AC: #1)
  - [x] 1.1 Change line 40 from `<div className="space-y-6">` to `<div className="p-6 space-y-6">`
- [x] Task 2: Add `p-6` to RespondentRegistryPage (AC: #2)
  - [x] 2.1 Change line 171 from `<div className="space-y-4"` to `<div className="p-6 space-y-4"`
- [x] Task 3: Add `p-6` to FormBuilderPage (AC: #3, #4)
  - [x] 3.1 Change line 135 (loading state) from `<div className="space-y-6">` to `<div className="p-6 space-y-6">`
  - [x] 3.2 Change line 160 (main return) from `<div className="space-y-4">` to `<div className="p-6 space-y-4">`
  - [x] 3.3 Change line 143 (error state) from `<div className="text-center py-16">` to `<div className="px-6 py-16 text-center">`
- [x] Task 4: Run web test suite and verify zero regressions (AC: #5)
  - [x] 4.1 Run `cd apps/web && pnpm vitest run` and confirm all tests pass
- [x] Task 5: Update story status and dev agent record

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] sprint-status.yaml not listed in File List — added to File List [sprint-status.yaml]
- [x] [AI-Review][MEDIUM] sprint-status.yaml diff contains unrelated changes (prep-4–7 status updates from other workflows) — document and stage carefully at commit time [sprint-status.yaml]
- [x] [AI-Review][LOW] Overlapping padding utilities `p-6 text-center py-16` changed to explicit `px-6 py-16 text-center` [FormBuilderPage.tsx:143]
- [x] [AI-Review][LOW] Task 3.3 referenced "line 142" but actual div is line 143 — fixed reference [prep-2-fix-dashboard-padding-consistency.md]
- [x] [AI-Review][LOW] No architectural guard preventing future p-6 regressions — added CRITICAL rule to project-context.md DashboardLayout section [systemic]
- [ ] [AI-Review][LOW] No visual regression testing for CSS layout — consider Playwright screenshot tests on dashboard pages [systemic]

## Dev Notes

### Root Cause Deep-Dive

The DashboardLayout (`apps/web/src/features/dashboard/components/DashboardLayout.tsx`) wraps page content in a `<main>` element with only mobile-specific bottom padding. Each individual page must provide its own `p-6` on the outermost container. Most pages (27+) do this correctly. Three pages were created without it — likely because they were authored in different epics/stories without referencing the established pattern.

### Existing Code to Reuse

| Component | Location | Pattern |
|-----------|----------|---------|
| StaffManagementPage (reference) | `apps/web/src/features/staff/pages/StaffManagementPage.tsx:149` | `<div className="p-6 space-y-6">` |
| SuperAdminHome (reference) | `apps/web/src/features/dashboard/pages/SuperAdminHome.tsx` | Uses `p-6` outer wrapper |
| SupervisorProductivityPage | `apps/web/src/features/dashboard/pages/SupervisorProductivityPage.tsx` | Fixed in Story 5-6b (same issue) |

### Key Implementation Details

1. **Each fix is a single-class addition** — add `p-6` to the existing `className` string
2. **Do NOT modify DashboardLayout** — the per-page padding pattern is intentional (some pages like FormFiller need full-bleed)
3. **Do NOT add or change any other classes** — only add the missing `p-6`
4. **No backend changes required** — purely frontend CSS fix
5. **No new test files needed** — existing tests cover rendering; padding is visual, not functional

### File Change Scope (Minimal)

**Modified files (3):**
- `apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx` — line 40, add `p-6`
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` — line 171, add `p-6`
- `apps/web/src/features/questionnaires/pages/FormBuilderPage.tsx` — lines 135, 142, and 160, add `p-6`

**No new files. No deleted files. No backend changes.**

### Project Structure Notes

- All files are in correct feature-based locations
- QuestionnaireManagementPage is in `features/questionnaires/` (separate from `features/dashboard/`)
- RespondentRegistryPage is in `features/dashboard/pages/` (standard location)
- FormBuilderPage is in `features/questionnaires/pages/` (co-located with management page)
- Pattern consistent with all 27+ other dashboard pages that already have `p-6`

### Testing Standards

- Run `cd apps/web && pnpm vitest run` (NOT `pnpm vitest run` from root — wrong config)
- Use `data-testid` selectors only in tests (A3: no CSS class selectors)
- RespondentRegistryPage has existing test: `apps/web/src/features/dashboard/pages/__tests__/RespondentRegistryPage.test.tsx`
- FormBuilderPage has co-located test: `apps/web/src/features/questionnaires/pages/FormBuilderPage.test.tsx`
- QuestionnaireManagementPage has existing test: `apps/web/src/features/questionnaires/__tests__/QuestionnaireManagementPage.test.tsx`
- No new tests needed — padding is not functionally testable with unit tests

### References

- [Source: _bmad-output/implementation-artifacts/epic-5-retro-2026-02-24.md#Bug-B2] — Bug discovery during UAT
- [Source: apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx#L40] — Missing padding
- [Source: apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx#L171] — Missing padding
- [Source: apps/web/src/features/questionnaires/pages/FormBuilderPage.tsx#L135,L143,L160] — Missing padding (3 locations)
- [Source: apps/web/src/features/staff/pages/StaffManagementPage.tsx#L149] — Reference correct pattern
- [Source: apps/web/src/features/dashboard/components/DashboardLayout.tsx] — Layout does not provide padding

### Previous Story Intelligence

**From prep-1-fix-export-lga-race-condition (current in-progress prep task):**
- Same prep phase (Epic 6 readiness), same source (Epic 5 retro UAT bugs)
- prep-1 is a React/TanStack Query fix, not CSS-related — no overlapping patterns
- ExportPage already has correct `p-6 space-y-6` wrapper

**From Story 5-6b (SupervisorProductivityPage fix):**
- The same `p-6` padding issue was fixed for SupervisorProductivityPage during Story 5-6b
- Pattern: pages created in different stories/epics sometimes miss established conventions

### Git Intelligence

Recent commits are Epic 5 completions and retro. Relevant:
- `92f8a2b fix(api,web): use dynamic productivity targets across all dashboards` — touched dashboard pages, maintained padding consistency
- `bd5a443 docs: complete Epic 5 retrospective and define Epic 6 prep phase` — retro where Bug B2 was discovered

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

No issues encountered — straightforward CSS class additions.

### Completion Notes List

- Added `p-6` padding to 3 dashboard pages (5 locations total) to match the established `StaffManagementPage` pattern
- QuestionnaireManagementPage: 1 location (outer wrapper)
- RespondentRegistryPage: 1 location (outer wrapper)
- FormBuilderPage: 3 locations (loading state, error state, main return)
- All 1798 web tests pass with zero regressions (154 test files)
- No new tests needed — padding is visual/CSS only, not functionally testable
- **Code Review (AI):** Fixed overlapping `p-6 py-16` → `px-6 py-16` in FormBuilderPage error state for explicit intent. Added sprint-status.yaml to File List. Corrected line reference. 2 systemic action items deferred (lint guard, visual regression).

### Change Log

- 2026-02-24: Added `p-6` padding to QuestionnaireManagementPage, RespondentRegistryPage, and FormBuilderPage (3 files, 5 edits). Bug B2 from Epic 5 UAT resolved.
- 2026-02-24: **Code Review** — 6 findings (0 HIGH, 2 MEDIUM, 4 LOW). Fixed: overlapping `p-6`/`py-16` → explicit `px-6 py-16` in error state, added sprint-status.yaml to File List, corrected line number reference. 2 systemic items remain as action items (lint guard, visual regression tests).

### File List

- `apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx` (modified)
- `apps/web/src/features/dashboard/pages/RespondentRegistryPage.tsx` (modified)
- `apps/web/src/features/questionnaires/pages/FormBuilderPage.tsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status updated to review)
