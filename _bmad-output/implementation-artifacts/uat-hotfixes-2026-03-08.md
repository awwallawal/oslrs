# UAT Hotfixes — 2026-03-08

**Context**: During Epic 7 retrospective, Awwal performed live UAT and surfaced production issues requiring immediate fixes. These bypass the standard story/code-review workflow by design — a full codebase audit is planned afterwards.

**Tester**: Awwal (Super Admin, Enumerator, Clerk roles)
**Fixer**: Claude Opus 4.6

---

## Fix 1: XLSForm converter drops questions and hides sections

**Reported symptom**: OSLRS questionnaire with 30+ questions only shows 12 for all roles.

**Root cause** (three bugs):
1. `extractSections()` silently dropped questions outside `begin_group`/`end_group` blocks (e.g., `gps_location`)
2. `calculate` fields (e.g., `age`) were stripped as metadata, but section-level `showWhen` referenced them — making the Labour section (9 questions) **permanently invisible**
3. Section-level `showWhen` (consent gating Identity section) prevented progressive reveal due to stale formData in navigation callbacks

**Fix**: Strip ALL section-level `showWhen` from the converter. XLSForm section gating depends on ODK engine features (calculated fields, cascading logic) the native form system doesn't support. Individual question-level skip logic fully preserved.

**Files changed**:
- `apps/api/src/services/xlsform-to-native-converter.ts` — removed section showWhen, added "General" section for ungrouped questions
- `scripts/__tests__/xlsform-to-native-converter.test.ts` — updated 34 tests to match new behavior

**Result**: 7 sections, 39 questions. 24 always visible, 15 progressively revealed by question-level skip logic.

**User action required**: Delete existing questionnaire and re-upload `oslsr_master_v3.xlsx`.

---

## Fix 2: Preview mode shows only visible questions (skip logic applied to disabled inputs)

**Reported symptom**: Super Admin preview shows only 14 questions after re-upload.

**Root cause**: Preview mode used the same `getVisibleQuestions()` skip logic as fill mode, but inputs are `disabled` — so the user can never enter data to trigger conditional reveals.

**Fix**: In preview mode, bypass skip logic entirely — show ALL questions sequentially. Navigation also bypasses skip logic in preview.

**Files changed**:
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — `visibleQuestions`, `handleContinue`, `handleBack`, `hasNextQuestion` all check `isPreview` to bypass skip logic

**Result**: Preview shows all 39 questions regardless of skip logic state.

---

## Fix 3: Form submissions not syncing to database

**Reported symptom**: Enumerator dashboard count increases but respondents don't appear in PostgreSQL. Supervisor shows 3 failed submissions.

**Root cause** (two bugs):
1. `SyncManager.syncAll()` only triggered on the browser `online` event (offline→online transition). When already online, completed submissions sat in IndexedDB queue indefinitely.
2. The 3 failed submissions referenced the OLD form UUID (deleted questionnaire). Server returns permanent error: "Form schema not found".

**Fix**: Added `syncManager.syncNow()` call immediately after `completeDraft()` in both `FormFillerPage` and `ClerkDataEntryPage`. Fire-and-forget — doesn't block the completion screen.

**Files changed**:
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — import syncManager, call syncNow after completeDraft
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — same

**User action required**: Hard refresh browser (Ctrl+Shift+R) to clear stale form UUID. Re-enter the 3 failed submissions.

---

## Fix 4: Respondent name fields not captured (surname/firstname unmapped)

**Reported symptom**: Discovered during Fix 3 investigation — respondent records created with null firstName/lastName.

**Root cause**: `RESPONDENT_FIELD_MAP` only mapped `first_name`/`firstName` and `last_name`/`lastName`, but the OSLRS XLSForm uses `firstname` and `surname`.

**Fix**: Added `firstname` → firstName and `surname` → lastName to the field map.

**Files changed**:
- `apps/api/src/services/submission-processing.service.ts` — added 2 field mapping entries

---

## Fix 5: "Upload Now" button has no feedback

**Reported symptom**: Enumerator clicks Upload Now, nothing visible happens — no loading state, no success/failure indication.

**Root cause**: Both the `PendingSyncBanner` and `EnumeratorSyncPage` buttons showed static text ("Upload Now" / "Retry") regardless of sync state. No spinner or disabled state during active sync.

**Fix**: Added visual feedback to both components:
- `PendingSyncBanner`: Button text changes to "Uploading..." / "Retrying..." and disables during sync (was already partially wired via `isSyncing` prop but text didn't change)
- `EnumeratorSyncPage`: Added `Loader2` spinner icon + text change ("Uploading..." / "Retrying...") and disabled state keyed to `syncingCount > 0`

**Files changed**:
- `apps/web/src/components/PendingSyncBanner.tsx` — button text changes during sync
- `apps/web/src/features/dashboard/pages/EnumeratorSyncPage.tsx` — spinner icon + loading text + disabled state
- `apps/web/src/components/__tests__/PendingSyncBanner.test.tsx` — updated 2 test matchers for new button text
- `apps/web/src/features/dashboard/pages/__tests__/EnumeratorSyncPage.test.tsx` — updated test matcher for syncing state

**Result**: Upload Now shows spinner + "Uploading...", Retry Failed shows spinner + "Retrying...", both disable during sync.

---

## Fix 6: Skip logic questions invisible — form answers lost between questions

**Reported symptom**: Enumerator never sees questions 3.6-3.9 (employment type, years of experience, hours worked, monthly income) or 5.6-5.8 (business registration, address, apprentice count), even after answering "Yes" to triggering questions. Submissions arrive at server with empty `raw_data`.

**Root cause**: `react-hook-form`'s `useWatch()` (and `watch()`) only returns values for currently mounted `Controller` components. In one-question-per-screen mode, when the user navigates from question A to question B, A's Controller unmounts and its value is dropped from the form state — even with `shouldUnregister: false`. This meant `formData` only ever contained the **current** question's answer. Skip logic evaluation (`getNextVisibleIndex`) checked `formData['employment_status']` but found `undefined`, so all conditional questions were skipped. The same bug caused `completeDraft()` to save nearly-empty payloads (only the last question's value + `_completionTimeSeconds`).

**Fix**: Replaced `useWatch()`/`watch()` with a manual answer accumulator (`useRef` + `useState`). Each `Controller.onChange` now merges the answer into a persistent `allAnswersRef`, and `setFormData` triggers re-renders with the full accumulated state. Draft resume also restores the accumulator.

**Files changed**:
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — replaced useWatch with allAnswersRef accumulator, updated Controller onChange, draft resume restores accumulator
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — same pattern
- `apps/web/src/features/forms/utils/skipLogic.ts` — removed debug logging (temporary instrumentation)

**Result**: All 32 answerable questions visible (with skip logic correctly applied). Submissions arrive with complete `raw_data`. 5 submissions = 5 respondents.

---

## Fix 7: GPS coordinates missing from submissions (never extracted from GeopointInput)

**Reported symptom**: GPS longitude/latitude not appearing in submissions table or CSV exports.

**Root cause**: `useDraftPersistence.completeDraft()` looked for flat keys `formData.gps_latitude` and `formData.gps_longitude`, but `GeopointInput` stores GPS as a nested object under the question name: `formData.gps_location = { latitude, longitude, accuracy }`. The flat keys never existed, so GPS was silently dropped from every submission payload.

**Fix**: Updated GPS extraction to check for the `gps_location` object format first, with flat key fallback for backwards compatibility.

**Files changed**:
- `apps/web/src/features/forms/hooks/useDraftPersistence.ts` — extract GPS from `gps_location` object
- `apps/web/src/features/forms/hooks/__tests__/useDraftPersistence.test.ts` — updated GPS test to use object format, added flat key backwards compat test

**Result**: GPS coordinates now included in submission payloads. Full Response CSV export includes GPS Latitude/GPS Longitude columns.

**User action required**: Re-submit surveys to capture GPS data (existing submissions without GPS cannot be retroactively fixed).

---

## Pending Issues (awaiting Awwal's UAT)

_Awwal indicated he will surface more issues. This section will be updated as they come in._

---

## CI Note

The CI error in `new_errorrr.txt` (`"super_admin" not assignable to UserRole`) was already fixed in commit `e491cbe`. The artifact download failures were cascading from the build failure. Current `main` builds clean locally.
