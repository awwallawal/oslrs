# Story prep.8: Update Story 3.1 ACs — Admin Form Preview

Status: done

## Story

As a Scrum Master,
I want Story 3.1's acceptance criteria updated to include admin form preview functionality,
so that when the native form renderer is built, it includes a read-only sandbox mode reusable from the Form Builder.

## Context & Background

**Source:** Combined Epic 2+2.5 Retrospective (2026-02-10), Action Item EP2.

The ODK pivot was triggered by the inability to preview forms in ODK Central. After building the native Form Builder (Stories 2.7-2.10), the team identified a gap: the Form Builder's "Preview" tab only shows a JSON schema dump and a field summary table — a developer-oriented view. There is no visual preview showing how the form will look to end-users (one-question-per-screen with skip logic, navigation, progress indicator).

**Current State:**

| What Exists | What It Shows |
|-------------|--------------|
| Form Builder "Preview" tab (`PreviewTab.tsx`) | Statistics (sections/questions/choices/skip logic counts) + field summary table + raw JSON |
| `GET /api/v1/questionnaires/:id/preview` | Backend endpoint returning flattened form data (exists, ready to use) |
| Skip logic evaluator (`SkipLogicService`) | Moved to `packages/utils/src/skip-logic.ts` (shared package) — ready for client-side import |
| `@oslsr/types` native form types | Full type definitions (`NativeFormSchema`, `Section`, `Question`, `Condition`, etc.) |
| **Visual form preview for admin** | **DOES NOT EXIST** |

**Resolution:** Story 3.1 (Native Form Renderer) will be updated to include an admin preview requirement. The `FormFillerPage` component will accept a `mode` prop supporting both `fill` (normal data collection) and `preview` (read-only sandbox for admins). The Form Builder will link to this preview mode instead of (or in addition to) the current JSON/table preview.

## Acceptance Criteria

1. **Given** the current Story 3.1 definition in `epics.md`, **when** this prep task is complete, **then** a new AC is added requiring `FormFillerPage` to support a read-only sandbox/preview mode accessible to Super Admins from the Form Builder.

2. **Given** the new AC, **when** the dev agent reads it, **then** it clearly specifies:
   - `FormFillerPage` accepts a `mode` prop (`'fill' | 'preview'`)
   - In `preview` mode: form renders one-question-per-screen with navigation, progress indicator, and skip logic — but submit is disabled, no data is persisted, and a "Preview Mode" banner is shown
   - The Form Builder's existing "Preview" tab is enhanced (or a new "Live Preview" button is added) to launch the form renderer in preview mode
   - Route: `/dashboard/super-admin/questionnaires/:formId/preview` renders `FormFillerPage` in preview mode

3. **Given** the new tasks added to Story 3.1, **when** the dev agent plans implementation, **then** the preview mode tasks are clearly separated and can be completed after the core renderer without blocking.

## Tasks / Subtasks

- [x] Task 1: Add new AC to Story 3.1 in `epics.md` (AC: 1, 2)
  - [x] 1.1 Add AC3.1.6 for admin form preview (read-only sandbox mode)
  - [x] 1.2 Add AC3.1.7 for Form Builder integration (route + link from builder)

- [x] Task 2: Add new tasks to Story 3.1 task list in `epics.md` (AC: 3)
  - [x] 2.1 Add Task 3.1.4: Add `mode` prop to `FormFillerPage` (`'fill' | 'preview'`)
  - [x] 2.2 Add Task 3.1.5: Create preview route and wire from Form Builder
  - [x] 2.3 Add Task 3.1.6: Update `FormBuilderPage` to include "Live Preview" button/link

- [x] Task 3: Update sprint status
  - [x] 3.1 Update `prep-8-update-story-3.1-acs` status in sprint-status.yaml (backlog → review)

### Review Follow-ups (AI)

- [x] [AI-Review][H1] Fix sprint status false claim: Completion Notes said ready-for-dev → in-progress → review, actual was backlog → review [story file: Completion Notes, Task 3.1]
- [x] [AI-Review][H2] Fix stale skip logic path in Context table: referenced non-existent `apps/api/src/services/skip-logic.service.ts`, corrected to `packages/utils/src/skip-logic.ts` [story file: Context table]
- [x] [AI-Review][M1] Add explicit `fill` mode default to AC3.1.6 — ACs only described `preview`, not `fill` as default [epics.md: AC3.1.6]
- [x] [AI-Review][M2] Fix File List: story file described as "modified" but is new/untracked, corrected to "created" [story file: File List]
- [x] [AI-Review][M3] Specify Live Preview button placement in AC3.1.7 (on existing Preview tab) [epics.md: AC3.1.7]
- [x] [AI-Review][L1] Add non-blocking annotation to Tasks 3.1.4–3.1.6 in epics.md [epics.md: Tasks]
- [x] [AI-Review][L2] Merge duplicate Change Log entries, add review record [story file: Change Log]

## Dev Notes

- This is a **planning/documentation task** — no code changes required
- The deliverable is updated `epics.md` with enriched Story 3.1 ACs and tasks
- The Form Builder already has a `readOnly` flag pattern (`localSchema.status !== 'draft'`) — preview mode follows a similar concept but for the renderer
- The `GET /api/v1/questionnaires/:id/preview` endpoint already returns flattened data suitable for the renderer
- Skip logic already lives in the shared package at `packages/utils/src/skip-logic.ts` (not an API-only service) — Story 3.1 Task 3.1.3 may only need to import this existing utility rather than create a new one

### References

- [Source: _bmad-output/implementation-artifacts/epic-2-2.5-retrospective-2026-02-10.md] — EP2 action item
- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.1] — Current Story 3.1 definition
- [Source: apps/web/src/features/questionnaires/components/PreviewTab.tsx] — Current preview (JSON + table)
- [Source: apps/web/src/features/questionnaires/pages/FormBuilderPage.tsx] — Form Builder with tabs

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- All 3 tasks completed: Added AC3.1.6 (admin preview sandbox mode) and AC3.1.7 (Form Builder integration) to Story 3.1 in epics.md
- Added Tasks 3.1.4-3.1.6 to Story 3.1 task list, clearly separated from core renderer tasks (3.1.1-3.1.3) so preview mode can be implemented independently
- AC3.1.6 specifies: `FormFillerPage` in `mode='preview'` — one-question-per-screen, navigation, progress, skip logic, submit disabled, no persistence, "Preview Mode" banner
- AC3.1.7 specifies: "Live Preview" button in Form Builder navigating to `/dashboard/super-admin/questionnaires/:formId/preview`
- Sprint status updated from backlog → review

### Change Log

- 2026-02-11: Added AC3.1.6, AC3.1.7, and Tasks 3.1.4–3.1.6 to Story 3.1 in epics.md for admin form preview capability (per EP2 action item from Epic 2+2.5 retrospective)
- 2026-02-11: [Code Review] 7 findings (2H, 3M, 2L) — all fixed. Corrected sprint status claims, fixed stale file paths, improved AC specificity in epics.md

### File List

- `_bmad-output/planning-artifacts/epics.md` (modified — added AC3.1.6, AC3.1.7, Tasks 3.1.4-3.1.6 to Story 3.1)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — prep-8 status: ready-for-dev → review)
- `_bmad-output/implementation-artifacts/prep-8-update-story-3.1-acs.md` (created — story file with tasks marked complete, status → review)
