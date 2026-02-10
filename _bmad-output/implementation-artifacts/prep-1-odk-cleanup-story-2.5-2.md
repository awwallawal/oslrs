# Story prep.1: ODK Cleanup from Story 2.5-2

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a Super Admin,
I want all dead ODK Central components removed from Story 2.5-2's codebase and Form Builder links properly wired,
so that the codebase is clean, navigable, and free of dead code before Epic 3 begins.

## Context & Background

**Source:** Combined Epic 2+2.5 Retrospective (2026-02-10), Action Items T1 + EP1.

Story 2.5-2 originally implemented "Super Admin Dashboard - Questionnaire & ODK Integration" which created:
- OdkHealthPage, OdkWarningBanner, odk-health.api.ts, useOdkHealth.ts
- ODK publish/unpublish buttons in QuestionnaireList
- ODK Health sidebar nav item and route
- ODK_FAILURE_THRESHOLD constant
- 6 bug fix items (BF-2.5-2-1 through BF-2.5-2-6) for ODK integration
- 5 diagnostic scripts for ODK debugging

**SCP-2026-02-05-001** removed ODK Central from the project. Stories 2.7-2.10 replaced ODK with a native form system. During that work, most ODK components were already cleaned up.

## Pre-Implementation Analysis (Codebase Scan Results)

### Already Cleaned (No Action Required)

| Component | Status | Evidence |
|-----------|--------|----------|
| `OdkHealthPage.tsx` | REMOVED | Not found in `apps/web/src/` |
| `OdkWarningBanner.tsx` | REMOVED | Not found in `apps/web/src/` |
| `odk-health.api.ts` | REMOVED | Not found in `apps/web/src/` |
| `useOdkHealth.ts` | REMOVED | Not found in `apps/web/src/` |
| ODK Health sidebar nav item | REMOVED | `sidebarConfig.ts` has no ODK entry |
| `/dashboard/super-admin/odk-health` route | REMOVED | `App.tsx` has no odk-health route |
| ODK publish/unpublish in QuestionnaireList | REMOVED | Uses native `VALID_STATUS_TRANSITIONS` instead |
| `debug-odk-health.ts` script | REMOVED | Not found in `apps/api/scripts/` |
| `test-odk-connection.ts` script | REMOVED | Not found in `apps/api/scripts/` |
| `republish-odk-form.ts` script | REMOVED | Not found in `apps/api/scripts/` |
| SuperAdminHome ODK cards | REMOVED | Dashboard has 3 cards: Questionnaires, Staff, Quick Stats |
| ODK references in tests | REMOVED | Zero matches in `apps/web/src/` test files |
| ODK references in API source | REMOVED | Zero matches in `apps/api/src/` (only in drizzle migrations) |

### Form Builder Links Already Wired

| Feature | Status | Location |
|---------|--------|----------|
| FormBuilder page route | WIRED | `App.tsx:555` — `<FormBuilderPage />` at `/builder/:id` |
| Edit button in QuestionnaireList | WIRED | `QuestionnaireList.tsx:165-171` — navigates to builder for native drafts |
| "Create New Form" button | WIRED | `QuestionnaireManagementPage.tsx:48-54` — opens dialog, creates form, navigates to builder |
| Native form API functions | WIRED | `questionnaire.api.ts:117-141` — create, get schema, update schema, publish |
| Native form hooks | WIRED | `useQuestionnaires.ts:94-158` — useNativeFormSchema, useUpdateNativeFormSchema, etc. |

### Remaining Cleanup Items

| Item | Location | Issue |
|------|----------|-------|
| ODK references in validate-xlsform.ts | `apps/api/scripts/validate-xlsform.ts:4,95,140,155` | User-facing messages mention "ODK Central" — should say "form system" |
| Empty constants.ts | `apps/web/src/features/questionnaires/constants.ts` | Contains only a placeholder comment, no actual constants |
| Drizzle migration files | `apps/api/drizzle/0009-0014` | Historical ODK migration SQL — MUST NOT be removed (migration history) |

## Acceptance Criteria

### AC1: Zero ODK References in Active Source Code
**Given** the codebase after cleanup
**When** searching for "odk" or "ODK" or "Enketo" or "enketo" in `apps/web/src/` and `apps/api/src/`
**Then** zero matches are found (drizzle migration files excluded)

### AC2: XLSForm Utility Script Updated
**Given** the XLSForm utility script `apps/api/scripts/validate-xlsform.ts`
**When** reviewing user-facing messages
**Then** references to "ODK Central" are replaced with appropriate wording (e.g., "form system" or "publishing")

### AC3: No Dead Code or Empty Placeholders
**Given** the questionnaires feature
**When** reviewing all files
**Then** no empty placeholder files exist (either populate with real constants or remove)

### AC4: Form Builder Navigation Verified
**Given** the Super Admin dashboard
**When** navigating to Questionnaires and clicking "Create New Form" or editing a native form
**Then** the Form Builder page loads correctly

### AC5: All Existing Tests Pass
**Given** the cleanup changes
**When** running the full test suite
**Then** all existing tests pass with zero regressions

## Tasks / Subtasks

- [x] Task 1: Update XLSForm utility script (AC: #2)
  - [x] 1.1 Update `apps/api/scripts/validate-xlsform.ts` — replace ODK references in user-facing messages
- [x] Task 2: Clean up empty constants.ts (AC: #3)
  - [x] 2.1 Either remove `apps/web/src/features/questionnaires/constants.ts` (if nothing uses it) or populate with real constants
  - [x] 2.2 Update any imports of this file if removed
- [x] Task 3: Verification sweep (AC: #1, #4)
  - [x] 3.1 Run `grep -ri "odk\|enketo" apps/web/src/ apps/api/src/` and confirm zero matches (exclude drizzle/)
  - [x] 3.2 Verify Form Builder navigation works: SuperAdminHome → Questionnaires → Create New Form → Builder
  - [x] 3.3 Verify Form Builder navigation works: QuestionnaireList → Edit button on native draft → Builder
- [x] Task 4: Run test suite (AC: #5)
  - [x] 4.1 Run `pnpm test` and confirm all tests pass
  - [x] 4.2 Specifically run web tests: `cd apps/web && pnpm vitest run`

## Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] M1: Add sprint-status.yaml to File List — modified but not documented [sprint-status.yaml]
- [x] [AI-Review][MEDIUM] M2: AC4 verified via code inspection only (no runtime/UAT evidence) — acceptable for cleanup story with no UI changes; documented in review notes
- [x] [AI-Review][LOW] L1: ODK references remain in `packages/` scope (outside AC1) — fixed in `packages/types/src/native-form.ts:3`, `packages/utils/src/skip-logic.ts:163`, `packages/utils/src/__tests__/crypto.test.ts:22`
- [x] [AI-Review][LOW] L2: Usage comment uses `npx` instead of `pnpm` (pre-existing) — fixed `npx tsx` → `pnpm tsx` in validate-xlsform.ts:6,:16
- [x] [AI-Review][LOW] L3: Re-run test suite to independently verify AC5

## Dev Notes

### Scope Is Intentionally Minimal

This story was identified during the Combined Epic 2+2.5 Retrospective (2026-02-10) as action item T1 + EP1. However, the SCP-2026-02-05-001 course correction (Stories 2.7-2.10) already performed the bulk of the ODK cleanup. The native form system (Stories 2.7-2.10) was built from scratch and didn't carry over ODK components.

**What was already done during the SCP:**
- All ODK frontend components removed
- All ODK backend routes/controllers/services removed
- All ODK diagnostic scripts removed
- SuperAdminHome rewritten without ODK
- Sidebar config updated
- App.tsx routes updated
- Form Builder fully wired

**What this story handles:**
- Final sweep of utility scripts with stale ODK references
- Empty placeholder cleanup
- Verification that nothing was missed

### Architecture Compliance

- **No new files created** — this is purely cleanup
- **No API changes** — backend API is already clean
- **No route changes** — routes are already correct
- **No database changes** — drizzle migrations must be preserved as-is

### Project Structure Notes

- XLSForm upload (Story 2-1) was RETAINED even after ODK removal — the XLSForm parser feeds the migration script (Story 2-9)
- The `validate-xlsform.ts` and `fix-xlsform-labels.ts` scripts are still useful for XLSForm debugging, just need ODK-specific language updated
- Drizzle migration files (`0009-0014`) contain ODK references — these are historical migration SQL and MUST NOT be modified or deleted

### References

- [Source: _bmad-output/implementation-artifacts/2.5-2-super-admin-questionnaires-odk.md] — Original story with ODK components
- [Source: _bmad-output/implementation-artifacts/epic-2-2.5-retrospective-2026-02-10.md#Action-Items] — T1 + EP1 source
- [Source: _bmad-output/project-context.md#Technology-Stack] — Architecture v8.0 confirms ODK removed
- [Source: apps/web/src/features/dashboard/config/sidebarConfig.ts] — No ODK sidebar items
- [Source: apps/web/src/App.tsx:555] — FormBuilderPage route already wired
- [Source: apps/web/src/features/questionnaires/components/QuestionnaireList.tsx:165-171] — Form Builder Edit button

### Previous Story Intelligence

**From Story 2.5-2 (the original ODK story):**
- Dev notes documented 6 bug fixes (BF-2.5-2-1 through BF-2.5-2-6)
- All diagnostic scripts created during those bug fixes have already been cleaned up
- The XLSForm validation improvements (BF-2.5-2-1) in `xlsform-parser.service.ts` should be RETAINED (these are still valuable for XLSForm upload validation)
- The dotenv loading order fix (BF-2.5-2-5) in `apps/api/src/index.ts` should be RETAINED (general ESM fix)

### Git Intelligence

Recent commits show:
- `f6b4fec` fix: resolve web build errors — UserRole enum, AuthContext mock
- `a5b29b5` fix: resolve CI build errors in FormWithVersions type
- `2d14ac9` docs: combined Epic 2+2.5 retrospective
- `637ac57` feat: Public User dashboard & RBAC tests (Story 2.5-8)

No recent commits touch the questionnaires feature or ODK cleanup. The cleanup was done incrementally during Stories 2.7-2.10.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (claude-opus-4-6)

### Debug Log References

No debug issues encountered. All changes were straightforward text replacements and file deletion.

### Completion Notes List

- **Task 1:** Updated 4 ODK references in `validate-xlsform.ts` — "uploading to ODK Central" → "importing into the form system", "ODK error" → "form validation error", "ODK will generate one" → "one will be auto-generated", "ODK to reject" → "the form to be rejected"
- **Task 2:** Removed empty `constants.ts` placeholder — confirmed zero imports via codebase grep, no update needed
- **Task 3:** Verification sweep confirmed zero ODK/Enketo matches in `apps/web/src/` and `apps/api/src/` (including `apps/api/scripts/`). Form Builder navigation verified wired: Create New Form → builder route (QuestionnaireManagementPage:33), Edit button → builder route (QuestionnaireList:167), FormBuilderPage route at App.tsx:555
- **Task 4:** Full test suite passed: 117 test files, 1,290 tests, zero failures, zero regressions (API: 268, Web: 957, Utils: 65)

### Change Log

- 2026-02-10: ODK cleanup from Story 2.5-2 — updated 4 ODK references in validate-xlsform.ts, removed empty constants.ts placeholder. Full test suite (1,290 tests) passes with zero regressions.
- 2026-02-10: **Code Review (AI)** — 0 HIGH, 2 MEDIUM, 3 LOW findings. Fixed: M1 (sprint-status.yaml added to File List), M2 (documented AC4 code-only verification), L2 (npx→pnpm in validate-xlsform.ts), L3 (tests re-verified: 1,290 pass). Deferred: L1 (ODK refs in packages/ — out of AC scope). Status → done.

### File List

- `apps/api/scripts/validate-xlsform.ts` — Modified (4 ODK references replaced with neutral wording; npx→pnpm fix from review)
- `apps/web/src/features/questionnaires/constants.ts` — Deleted (empty placeholder, zero imports)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — Modified (prep-epic-3→in-progress, prep-1-odk-cleanup→done)
- `packages/types/src/native-form.ts` — Modified (removed ODK/Enketo reference from comment)
- `packages/utils/src/skip-logic.ts` — Modified (removed "ODK" from JSDoc comment)
- `packages/utils/src/__tests__/crypto.test.ts` — Modified (renamed test fixture token from "odk-" to "test-")
