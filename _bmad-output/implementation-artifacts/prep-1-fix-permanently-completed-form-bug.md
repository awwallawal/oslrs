# Story prep-1: Fix Permanently Completed Form Bug

Status: done

## Story

As an Enumerator / Data Entry Clerk / Public User,
I want to start a new survey submission for the same form after completing a previous one,
so that I can collect data from multiple respondents using the same questionnaire.

## Bug Description

**Discovered by:** Awwal (UAT during Epic 3 retrospective)
**Severity:** CRITICAL — blocks real-world field use
**Source:** [epic-3-retro-2026-02-14.md, Bug 1]

After submitting a survey, the form card on Enumerator/Clerk/Public surveys pages shows a non-clickable green "Completed" badge permanently. Users cannot start a new submission for the same form. Enumerators and clerks need to submit the same form dozens of times per day for different respondents.

## Root Cause Analysis

The bug is a **client-side UI blocker** in the offline-first draft system:

1. `completeDraft()` in `useDraftPersistence.ts:141-194` marks the IndexedDB draft status as `'completed'` but **never deletes it**
2. `useFormDrafts()` in `useForms.ts:61-85` queries drafts with status `'in-progress'` OR `'completed'`, building `draftMap[formId] = 'completed'`
3. All three survey pages check `draftMap[form.id] === 'completed'` and render a non-clickable `<div>` with "Completed" badge instead of a button
4. `SyncManager` syncs the submission queue item but **never cleans up the completed draft** from `db.drafts`
5. `resetForNewEntry()` in `useDraftPersistence.ts:196-200` only resets React state (refs), not the IndexedDB record — works within a session but not across navigations

**The backend is NOT blocking re-submission.** The API accepts multiple submissions from the same user for the same form. The block is entirely client-side.

## Acceptance Criteria

1. **Given** a user who has completed a survey for form X, **When** they navigate to their surveys page, **Then** form X shows "Start Survey" (not "Completed") so they can submit again
2. **Given** a user who is mid-draft on form X, **When** they navigate to surveys, **Then** form X still shows "Resume Draft" with amber styling
3. **Given** the ClerkDataEntryPage flow, **When** a clerk completes a form via Submit button or Ctrl+Enter, **Then** the app navigates back to `/dashboard/clerk/surveys` so the clerk can select the next form (changed from reset-on-page per user request — eliminates phantom draft bug)
4. **Given** the user completes a form offline, **When** the SyncManager later syncs the submission, **Then** the submission syncs normally (queue item has all data; draft deletion doesn't affect sync)
5. **Given** the fix is applied, **When** existing tests run, **Then** all 1,240 web tests pass with zero regressions (except updated tests for this fix)

## Tasks / Subtasks

- [x] Task 1: Delete draft from IndexedDB after queuing in `completeDraft()` (AC: 1, 4)
  - [x] 1.1 In `useDraftPersistence.ts`, after `db.submissionQueue.add(queueItem)`, add `await db.drafts.delete(draftIdRef.current)` to remove the completed draft
  - [x] 1.2 Keep the `status: 'completed'` update BEFORE deletion for crash safety (if browser crashes between queue add and draft delete, the draft stays 'completed' rather than 'in-progress')
- [x] Task 2: Simplify `useFormDrafts()` to only track in-progress drafts (AC: 1, 2)
  - [x] 2.1 In `useForms.ts`, change the Dexie query from `.anyOf('in-progress', 'completed')` to `.equals('in-progress')`
  - [x] 2.2 Simplify the `draftMap` type from `Record<string, 'in-progress' | 'completed'>` to `Record<string, 'in-progress'>`
- [x] Task 3: Remove "Completed" badge from EnumeratorSurveysPage (AC: 1)
  - [x] 3.1 Remove the `draftMap[form.id] === 'completed'` conditional and the green Completed `<div>`
  - [x] 3.2 The button now always renders: "Resume Draft" if `draftMap[form.id] === 'in-progress'`, else "Start Survey"
- [x] Task 4: Remove "Completed" badge from PublicSurveysPage (AC: 1)
  - [x] 4.1 Same change as Task 3
- [x] Task 5: Remove "Completed" badge from ClerkSurveysPage (AC: 1)
  - [x] 5.1 Same change as Task 3 (button text: "Resume Draft" / "Start Entry")
- [x] Task 6: Update `useDraftPersistence` tests (AC: 1, 4)
  - [x] 6.1 Extend mock setup: add `mockDraftsDelete` to `vi.hoisted()` block and wire `db.drafts.delete` in the `vi.mock` factory
  - [x] 6.2 Add test: `completeDraft()` deletes draft from `db.drafts` after adding to queue
  - [x] 6.3 Add test: `completeDraft()` creates draft then queues+deletes when no prior draft exists (fast Ctrl+Enter path)
  - [x] 6.4 Verify `resetForNewEntry()` behavior unchanged
- [x] Task 7: Update survey page tests (AC: 1, 2, 5)
  - [x] 7.1 Simplify `mockDraftMap` type from `Record<string, 'in-progress' | 'completed'>` to `Record<string, 'in-progress'>` in `EnumeratorSurveysPage.test.tsx`
  - [x] 7.2 Add test: form with no draft shows "Start Survey" (re-submission after completion)
  - [x] 7.3 Apply same updates to `PublicSurveysPage.test.tsx` and `ClerkSurveysPage.test.tsx`
- [x] Task 8: Regression verification (AC: 5)
  - [x] 8.1 Run full web test suite (`cd apps/web && pnpm vitest run`)
  - [x] 8.2 Verify 0 regressions against 1,240 baseline (actual: 1,241 passed — +1 from new re-submission test)

### Review Follow-ups (AI) — 2026-02-15

- [x] [AI-Review][HIGH] `completeDraft()` failure after `db.drafts.delete()` shows "Failed to save" despite submission being queued — wrap delete in try/catch [`useDraftPersistence.ts:199`]
- [x] [AI-Review][MEDIUM] AC 3 text says "behavior is unchanged" but Bonus Fix 2 changed submit flow to navigate-back — update AC text [`prep-1-fix-permanently-completed-form-bug.md:35`]
- [x] [AI-Review][MEDIUM] `sprint-status.yaml` modified in git but not in story File List — add to File List [`prep-1-fix-permanently-completed-form-bug.md`]
- [x] [AI-Review][MEDIUM] Data loss window: status update to 'completed' before queue add — reorder to queue add first [`useDraftPersistence.ts:167-199`]
- [x] [AI-Review][LOW] Task 6.4 claims `resetForNewEntry()` verified but no explicit test exists [`useDraftPersistence.test.ts`]
- [x] [AI-Review][LOW] Draft deletion test doesn't verify call ORDER (queue before delete) [`useDraftPersistence.test.ts:262-293`]
- [x] [AI-Review][LOW] `mockDraftMap` type is `Record<string, string>` instead of `Record<string, 'in-progress'>` [`ClerkSurveysPage.test.tsx:21`]

## Dev Notes

### Fix Strategy

**Delete-on-complete**: After `completeDraft()` adds the submission to the queue, delete the draft from IndexedDB. The queue item contains all data needed for sync (responses, formVersion, GPS, submittedAt). The draft is no longer needed.

**Belt and suspenders**: `useFormDrafts()` also changes to only query `'in-progress'` status. This handles the edge case where a browser crash occurs between queue add and draft delete — the orphaned 'completed' draft won't block the UI.

### Data Flow After Fix

```
User fills form → Draft created (status: 'in-progress') → Survey page shows "Resume Draft"
User completes  → Queue item added + Draft DELETED       → Survey page shows "Start Survey"
Background sync → Queue item synced                      → No draft cleanup needed
```

### Key Insight: Queue Item is the Source of Truth

The submission queue item (`db.submissionQueue`) has the same ID as the draft and contains all enriched data (responses, formVersion, GPS coordinates, submittedAt). Once the queue item exists, the draft record is redundant. Deleting it is safe.

### ClerkDataEntryPage Compatibility

`ClerkDataEntryPage.tsx:314` calls `draft.resetForNewEntry()` after `completeDraft()`. Since `completeDraft()` now deletes the draft, `resetForNewEntry()` just clears React state (draftIdRef, draftId, resumeData) — which is still needed for the in-page session reset. No change to ClerkDataEntryPage required.

### Project Structure Notes

All changes are frontend-only, confined to `apps/web/src/`:
- `features/forms/hooks/useDraftPersistence.ts` — core fix (draft deletion)
- `features/forms/hooks/useForms.ts` — query simplification
- `features/dashboard/pages/EnumeratorSurveysPage.tsx` — UI cleanup
- `features/dashboard/pages/PublicSurveysPage.tsx` — UI cleanup
- `features/dashboard/pages/ClerkSurveysPage.tsx` — UI cleanup
- Test files in corresponding `__tests__/` directories

No API changes. No database schema changes. No new dependencies.

### Testing Standards

- Tests: vitest with jsdom environment, `@testing-library/react`
- Mock pattern: `vi.hoisted()` + `vi.mock()` for Dexie db and hooks
- Selectors: text content, `data-testid`, ARIA roles ONLY (Team Agreement A3)
- Must include `afterEach(() => cleanup())` in every test file (lesson from Story 3.6)

### Existing Test Files

| File | Current Tests | Changes Needed |
|------|--------------|----------------|
| `features/forms/hooks/__tests__/useDraftPersistence.test.ts` | Draft CRUD, save, complete | Add: deletion after complete |
| `features/dashboard/pages/__tests__/EnumeratorSurveysPage.test.tsx` | 6 tests: loading, empty, error, cards, nav, resume | Remove: completed badge test (none exists yet). Add: re-submission test |
| `features/dashboard/pages/__tests__/PublicSurveysPage.test.tsx` | Similar pattern | Same changes |
| `features/dashboard/pages/__tests__/ClerkSurveysPage.test.tsx` | Similar pattern | Same changes |
| `services/__tests__/sync-manager.test.ts` | 14 tests: sync, retry, polling | No changes needed |

### References

- [Source: _bmad-output/implementation-artifacts/epic-3-retro-2026-02-14.md#Bugs Discovered During Retrospective]
- [Source: apps/web/src/features/forms/hooks/useDraftPersistence.ts — completeDraft() lines 141-194]
- [Source: apps/web/src/features/forms/hooks/useForms.ts — useFormDrafts() lines 61-85]
- [Source: apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx — lines 74-104]
- [Source: apps/web/src/features/dashboard/pages/PublicSurveysPage.tsx — lines 75-104]
- [Source: apps/web/src/features/dashboard/pages/ClerkSurveysPage.tsx — lines 76-106]
- [Source: apps/web/src/services/sync-manager.ts — no draft cleanup after sync]
- [Source: apps/web/src/lib/offline-db.ts — Draft interface, status enum]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- useDraftPersistence.test.ts was missing `// @vitest-environment jsdom` directive — all 8 tests failed with `document is not defined`. Fixed by adding the directive.
- Same test file was missing `afterEach(() => cleanup())` — debounce timer leaked between tests causing "does not save when disabled" to fail. Fixed per Dev Notes lesson from Story 3.6.

### Completion Notes List
- **Task 1**: Added `await db.drafts.delete(draftIdRef.current)` after `db.submissionQueue.add(queueItem)` in `completeDraft()`. Kept `status: 'completed'` update before deletion for crash safety.
- **Task 2**: Changed Dexie query from `.anyOf('in-progress', 'completed')` to `.equals('in-progress')`. Simplified type to `Record<string, 'in-progress'>`. Removed priority logic for same-form multiple drafts (no longer needed).
- **Tasks 3-5**: Removed `CheckCircle2` import and entire `draftMap[form.id] === 'completed'` ternary branch from all three survey pages. Button now always renders with two-state logic: "Resume Draft" (amber) or "Start Survey"/"Start Entry" (maroon).
- **Task 6**: Tests were pre-written (RED phase). Added `// @vitest-environment jsdom` and `afterEach(() => cleanup())` to fix environment issues. All 8 tests pass.
- **Task 7**: Simplified `mockDraftMap` type in Enumerator/Public test files. Replaced Completed badge tests with re-submission tests. ClerkSurveysPage test updated similarly.
- **Task 8**: Full regression: 1,241 web tests pass (1,240 baseline + 1 new). 0 regressions. 115 test files green.
- **Bonus fix (user request)**: Added visible "Submit Form" button to ClerkDataEntryPage — previously only had Ctrl+Enter. Disabled when NIN duplicate detected. 4 new tests added.
- **Bonus fix 2 (user request)**: Changed ClerkDataEntryPage submit flow — both Submit button and Ctrl+Enter now navigate back to `/dashboard/clerk/surveys` after successful submission instead of resetting form on-page. Fixes phantom empty draft bug caused by auto-save debounce firing on cleared formData. Tests updated: navigate assertions replace resetForNewEntry assertions.
- **Bonus fix 3 (user request)**: Prevented phantom draft creation when opening a form and navigating back without entering data. Two-layer fix: (1) auto-save debounce guard `if (Object.keys(formData).length === 0) return` skips draft creation until user interacts with a field; (2) `useFormDrafts()` filters out drafts with empty responses so old phantom drafts in IndexedDB are also ignored. New test added. Final regression: 1,245 pass.

### Change Log
- 2026-02-14: Fixed permanently completed form bug — draft deleted after queuing, completed badge removed from all survey pages, useFormDrafts simplified to in-progress only.
- 2026-02-14: Added visible Submit Form button to ClerkDataEntryPage (was keyboard-only Ctrl+Enter).
- 2026-02-14: Fixed submit flow — navigate back to surveys instead of reset-on-page. Eliminates phantom draft bug.
- 2026-02-14: Prevented empty-form phantom drafts — auto-save skips draft creation when formData is empty. 1,245 web tests pass.
- 2026-02-15: Code review fixes — reordered completeDraft() to queue-first (eliminates data loss window), wrapped draft delete in try/catch (prevents false failure on successful submission), updated AC 3 text, added sprint-status.yaml to File List, added resetForNewEntry() test, added call-order verification test, fixed ClerkSurveysPage.test.tsx mockDraftMap type. 1,246 web tests pass.

### File List
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — Modified: added `db.drafts.delete()` after queue add
- `apps/web/src/features/forms/hooks/useForms.ts` — Modified: simplified useFormDrafts query and type
- `apps/web/src/features/dashboard/pages/EnumeratorSurveysPage.tsx` — Modified: removed Completed badge branch + CheckCircle2 import
- `apps/web/src/features/dashboard/pages/PublicSurveysPage.tsx` — Modified: removed Completed badge branch + CheckCircle2 import
- `apps/web/src/features/dashboard/pages/ClerkSurveysPage.tsx` — Modified: removed Completed badge branch + CheckCircle2 import
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts` — Modified: added jsdom directive, cleanup, pre-existing deletion tests verified
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSurveysPage.test.tsx` — Modified: simplified draftMap type, added re-submission test
- `apps/web/src/features/dashboard/pages/__tests__/PublicSurveysPage.test.tsx` — Modified: simplified draftMap type, replaced completed badge test with re-submission test
- `apps/web/src/features/dashboard/pages/__tests__/ClerkSurveysPage.test.tsx` — Modified: replaced completed badge tests with re-submission test
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — Modified: added visible Submit Form button; changed handleSubmit to navigate(`/dashboard/clerk/surveys`) instead of resetForNewEntry + setFormData({})
- `apps/web/src/features/forms/pages/__tests__/ClerkDataEntryPage.test.tsx` — Modified: 4 submit button tests + updated submit/session/error tests to assert navigate instead of resetForNewEntry
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Modified: sprint tracking status update
