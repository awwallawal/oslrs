# Story 9.17: Wizard Form-Pin UI on Questionnaire Management + Questionnaire Field Dedup

Status: ready-for-dev

<!--
Authored 2026-05-12 by Bob (SM) via canonical *create-story --yolo workflow.

Two Story-9-12 follow-ups bundled into a single story per Awwal directive
during the 2026-05-12 UAT session. Both close UX gaps that surfaced after
Story 9-12 shipped to production (commits aa621ce + b537663 on 2026-05-11,
plus 427a80d on 2026-05-12 with the URL-race regression fix).

PART A — Form-pin UI on the Questionnaire Management page.
PART B — Wizard questionnaire field dedup (Pattern C: auto-fill + banner).

The UI placement decision in Part A is load-bearing UX from the UAT
session: Awwal flagged that sending Super Admin from Questionnaire
Management to Settings to pin a published form breaks the natural
workflow. The pin control belongs on the Questionnaire Management page,
immediately next to publish. Settings landing page gets a read-only
mirror card so the pinned form is also discoverable there. This story
file preserves that decision verbatim — do NOT relocate the primary
pin control to Settings.

Numbering: 9-14 is RESERVED (SSH firewall re-narrow follow-up from
Story 9-9 Operate-phase), 9-15 (prod-gate-telegram-alerts) was
authored 2026-05-11 and shipped to `done` via the parallel
`story/9-15-prod-gate-telegram-alerts` branch, 9-16 (magic-link-login)
was authored 2026-05-11. 9-17 is the next sequential slot in Epic 9.
-->

## Story

As the **Super Admin** managing questionnaires for the Oyo State Skills Registry,
I want **to pin a published form as the active public-wizard form directly from the Questionnaire Management page, immediately after publishing it**,
So that **the workflow stays in one place — and so that public respondents only ever see one curated survey at a time even when multiple published forms coexist in the system**.

AND

As a **public respondent registering through the 5-step wizard**,
I want **the questionnaire to NOT ask me for my name, phone, or email again if I already typed them in Step 1 or Step 2**,
So that **the registration flow feels coherent rather than asking the same questions twice**.

## Acceptance Criteria

### Part A — Form-pin UI on the Questionnaire Management page

1. **AC#A1 — Pin status badge on each published form row.** `QuestionnaireManagementPage` (`apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx`) — via its child `QuestionnaireList` at `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` (which is the actual row-renderer; verified 2026-05-12 via grep) — shows for each `status === 'published'` form a badge indicating its public-wizard pin state: `🌐 Active for public wizard` (Success-600 background, Success-50 foreground, `data-testid="qm-pinned-badge"`) on the pinned form, no badge on the others. Badge carries `aria-label="Currently active as the public-registration form"`. Draft / archived rows are unaffected. The badge sits next to the existing status badge ("draft" / "published" / "archived") for visual proximity.

2. **AC#A2 — Pin action button on each published form row.** Below or next to each published form's existing "Edit / Preview" affordances in `QuestionnaireList`, render one of two buttons depending on the form's pin state:
   - **Unpinned**: `Pin for Public Wizard` (primary outline button, `data-testid="qm-pin-button"`). Clicking opens an `AlertDialog` (the project already uses shadcn/ui AlertDialog elsewhere in this page per [Source: apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx:7-16]) with title "Pin for public wizard?" and body "Replace **<current pinned form title or 'none'>** with **<this form title>**? Existing in-flight registrations will continue against the previous form for up to 5 minutes due to client-side caching, then the new form takes effect." Two actions: Cancel + Confirm (primary).
   - **Pinned**: `📌 Pinned · Unpin` (success outline + small unpin link, `data-testid="qm-unpin-button"`). Clicking opens an `AlertDialog` with title "Un-pin this form?" and body "Public users won't see any survey questions until you pin a form. Continue?" Two actions: Cancel + Un-pin (danger).

3. **AC#A3 — Backend endpoint REUSED, not net-new.** The pin / unpin mutation calls `PATCH /api/v1/admin/settings/wizard.public_form_id` with `{ value: '<form-uuid>' | null }`. That endpoint already exists from `prep-settings-landing-and-feature-flags` [Source: apps/api/src/routes/settings.routes.ts] and writes via `SettingsService.setSetting('wizard.public_form_id', value, actorId, description)` which audit-logs `SETTINGS_FLIPPED` per Story 6-1 hash chain. Existing super-admin authz + per-bucket rate limit + Zod validation all apply transparently. **NO NEW BACKEND ENDPOINT, NO NEW SERVICE METHOD, NO MIGRATION.** Part A is purely a frontend wrapper around the existing settings PATCH route.

4. **AC#A4 — Optimistic update + rollback (TanStack Query mutation).** Clone the optimistic-then-rollback pattern from `SmsOtpToggle` at [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50]. On Confirm click in either dialog:
   - Optimistically update the badge state in the local React state tree.
   - Invoke `useUpdateSetting()` mutation (imported from `apps/web/src/features/settings/api/settings.api.ts:49` — verified exists 2026-05-12) with `{ key: 'wizard.public_form_id', value: '<uuid>' | null }`.
   - On `onSuccess`: invalidate the published-forms query (or whatever the QM list uses — Bob's dev agent verifies the query-key at impl time; current `useQuestionnaires` hook is in `apps/web/src/features/questionnaires/hooks/useQuestionnaires.ts`) AND invalidate the new `wizard.public_form_id` setting query so the read-only Settings mirror (AC#A5) refreshes too. Toast: `"Pinned <form title>"` or `"Un-pinned <form title>"`.
   - On `onError`: rollback the optimistic badge state, toast: `"Couldn't pin the form. Please try again."` (anti-enumeration discipline — the backend error code isn't surfaced).

5. **AC#A5 — Settings landing read-only mirror card.** `SettingsLandingPage` at [Source: apps/web/src/features/settings/pages/SettingsLandingPage.tsx] gains a new card titled `Public Wizard Form` between the existing SMS OTP Toggle card and the Fraud Thresholds link card (Bob's dev agent picks the exact slot — visual order matches Sally's UX Spec section ordering if any; otherwise alphabetical or "most-recently-added-last"). Card body: either `"Currently pinned: <form title> (v<version>) — pinned <X days ago>"` (when set; date computed via the existing `intl.RelativeTimeFormat` helper if present, otherwise raw ISO short-date) or `"None — no form is active for the public wizard"`. Card footer: `<Link to="/dashboard/super-admin/questionnaires">Manage in Questionnaires →</Link>`. Card is READ-ONLY — no Pin / Unpin / Edit affordances on this card itself. `data-testid="settings-public-wizard-form-card"`.

6. **AC#A6 — No sidebar nav change.** Questionnaire Management is already in the Super Admin sidebar from Story 2-1; Settings is already in the sidebar from `prep-settings-landing`. Discoverability of the new pin control comes from the new badge on Q.M. (AC#A1) + the new Settings mirror card (AC#A5). No `apps/web/src/features/dashboard/components/sidebar` changes.

7. **AC#A7 — Retire the `pnpm pin-public-form` dev bridge script.** Once Part A is implemented + green in tests, delete:
   - `apps/api/scripts/dev-pin-public-form.ts` (the script itself)
   - The `"pin-public-form": "tsx scripts/dev-pin-public-form.ts"` entry from `apps/api/package.json` (added in commit `427a80d` 2026-05-12)
   - Any docs / comments / memory entries referencing the script — replace with "use the Pin for Public Wizard button on the Questionnaire Management page (Super Admin → Questionnaires)".

   The script was a 2026-05-12 bridge for UAT until this story landed; its TODO comment at the top says so verbatim. Do NOT keep it as "an alternative dev path" — that's exactly the kind of tech debt the project's "no technical debt" discipline rejects.

### Part B — Wizard questionnaire field dedup (Pattern C: auto-fill + banner)

8. **AC#B1 — Shared field-name aliases module.** New file `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` exports a `WIZARD_PROVIDED_FIELD_NAMES` constant that maps each wizard-collected identity field to its common questionnaire-question-name aliases:

   ```ts
   export const WIZARD_PROVIDED_FIELD_NAMES = {
     fullName:  ['full_name', 'fullname', 'name'],
     firstName: ['first_name', 'firstname', 'given_name'],
     lastName:  ['last_name', 'lastname', 'surname', 'family_name'],
     phone:     ['phone', 'phone_number', 'mobile', 'mobile_number'],
     email:     ['email', 'email_address'],
     dob:       ['date_of_birth', 'dob', 'birth_date'],
   } as const;
   ```

   **NIN deliberately NOT in this map** — NIN has its own state-aware Step 5 dispatcher (Story 9-12 Dev Notes "Step 5 NIN handling — state-aware dispatcher"; see [Source: apps/web/src/features/registration/pages/Step5NinAndAuth.tsx:32-47]) and uses the separate `NIN_QUESTION_NAMES` tuple at [Source: apps/web/src/features/registration/lib/nin-question-names.ts]. Identity-only fields (name / phone / email / DOB) go into this new map; NIN-aliasing stays exactly where it is.

9. **AC#B2 — Step 4 introspection + auto-fill of wizard answers into questionnaire responses.** In `Step4Questionnaire.tsx` [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76] — the existing `useEffect` that already stamps `formHasNinQuestion` + `questionnaireFormId` + `questionnaireFormVersionId` — extend the schema-introspection pass to ALSO:
   - Build a `prefilledQuestionNames: Set<string>` containing every question name from `form.questions` that matches (case-insensitive exact match) any alias in `WIZARD_PROVIDED_FIELD_NAMES`.
   - For each match, write the corresponding wizard `formData.<field>` value into `questionnaireResponses[questionName]` via `mergeFields` (a single `mergeFields({ questionnaireResponses: { ...existing, ...prefilled } })` call — do NOT split into per-field merges or you race the React state batching).
   - Stamp the `prefilledQuestionNames` set into a new `wizard_drafts.formData.prefilledQuestionNames` slot (TypeScript-only addition to the existing `WizardDraftData` type) so the banner copy (AC#B4) survives page refreshes.

10. **AC#B3 — `<FormRenderer>` gains a `hideQuestionNames?: Set<string>` prop.** Extend `FormRenderer` at [Source: apps/web/src/features/forms/components/FormRenderer.tsx] with a new optional prop `hideQuestionNames?: ReadonlySet<string>`. When supplied:
   - The question iteration / `currentIndex` math filters OUT those questions from the user-visible flow.
   - The skip-logic engine (`getNextVisibleIndex` per Story 9-12 Task 5.4.3) advances past hidden questions in both directions.
   - The questions still exist in the underlying schema (form-version locking unchanged); they're only skipped at the renderer level.
   - The submit payload (`onComplete`'s `allAnswers` argument) STILL includes the pre-filled answers for the hidden questions, because they're already in `initialResponses` (per AC#B2).

   Step 4 passes `hideQuestionNames={prefilledQuestionNames}` so the user never sees the duplicates. NIN handling is unaffected — `<FormRenderer>` continues to special-case the NIN question (`useNinCheck` hook + the inline `NinHelpHint` link); the new `hideQuestionNames` prop only filters questions whose names are in the supplied set, and NIN names are never in that set (per AC#B1 + AC#B6).

11. **AC#B4 — Step 4 banner copy with dynamic field list.** When `prefilledQuestionNames.size > 0`, Step 4 renders a small `<aside role="status" aria-live="polite" data-testid="step4-prefilled-banner">` ABOVE the `<FormRenderer>` with copy that names the specific fields filled. Generate the human-readable label list from the wizard-field keys (NOT the questionnaire question names), using the following label map (Bob defines verbatim so Sally's UX Spec stays in sync):

    | wizard field key | banner label |
    |---|---|
    | fullName / firstName / lastName | "Name" (collapse all three into a single "Name" if any matched) |
    | phone | "Phone" |
    | email | "Email" |
    | dob | "Date of Birth" |

    Copy template: `"We've pre-filled <comma-separated labels> from your earlier answers. Click Back to edit anything."` Comma separation uses Oxford comma for 3+ items ("Name, Phone, and Email"). When exactly 2: "Name and Phone". When 1: "Name". Banner background Info-50, text Info-800, small icon optional. No em-dashes (per 2026-05-12 copy-discipline directive).

12. **AC#B5 — Submit payload unchanged shape.** `POST /api/v1/registration/wizard` payload per [Source: apps/api/src/controllers/registration.controller.ts:66-83 `submitWizardSchema`] is unchanged. `questionnaireResponses` arrives complete with both user-answered and pre-filled values; the backend has no awareness of which fields were "originally collected by the wizard" vs "answered in the questionnaire" — that's a frontend UX concern, not a data-shape concern. Backend tests added in Story 9-12 (`registration.routes.test.ts` 25 supertests, `magic-link.routes.test.ts` 12, `sms-otp.routes.test.ts` 8) stay green unchanged.

13. **AC#B6 — Verify NO NIN regression.** Story 9-12 AC#3-5 NIN handling — the state-aware Step 5 dispatcher (`A=questionnaire-captured` / `B=pending-via-inline-toggle` / `C=form-has-no-NIN`) at [Source: apps/web/src/features/registration/pages/Step5NinAndAuth.tsx:32-47] — is COMPLETELY untouched by this story. AC#B1's alias map deliberately excludes NIN. Add the following test assertions:
    - **vitest**: `Step4Questionnaire.test.tsx` test "does not auto-fill the NIN question": render with a published form that has a NIN question (`name: 'nin'`) + wizard `formData.nin = '12345678901'`. Assert that `mergeFields` is NOT called with `questionnaireResponses.nin`. Assert the NIN question is NOT in the `prefilledQuestionNames` set. Assert the NIN question is still visible to the user (FormRenderer iterates over it).
    - **vitest**: `Step5NinAndAuth.test.tsx` (existing) — no changes required; the state-aware dispatcher's tests already cover State A/B/C transitions and they're independent of the new dedup logic.
    - **Playwright** (extension to `apps/web/e2e/wizard-registration.spec.ts`): `it.skip()` placeholder for the full happy-path with NIN-bearing form, with the same re-enable preconditions documented in 9-12 session 5 (seeded NIN-less form + `wizard.public_form_id` pinned + email-sink fixture). The skip doesn't block this story's ship; it locks in the assertion shape for when the fixture lands.

14. **AC#B7 — Tests.**
    - **`Step4Questionnaire.test.tsx`** — NEW file (was deferred in 9-12). Tests covering:
      1. Renders the loading skeleton while `formQuery.isLoading`.
      2. Renders the empty-state when `formQuery.data === null` (404 PUBLIC_FORM_NOT_CONFIGURED passthrough).
      3. Renders `<FormRenderer>` when a form is pinned.
      4. Stamps `formHasNinQuestion + questionnaireFormId + questionnaireFormVersionId` on first schema land (existing 9-12 behaviour — regression test).
      5. Pre-fills `name` question from `formData.fullName`.
      6. Pre-fills `phone` question from `formData.phone`.
      7. Pre-fills `email` question from `formData.email`.
      8. Pre-fills `date_of_birth` question from `formData.dateOfBirth`.
      9. Passes the `hideQuestionNames` set to `<FormRenderer>`.
      10. Banner copy reflects exactly which fields were pre-filled (3 cases: 1-field, 2-field, 3-field Oxford-comma).
      11. Banner is absent when no questionnaire questions match the alias map.
      12. NIN question is NOT auto-filled even when `formData.nin` is present (AC#B6 regression).
      13. Pre-filled questions persist on draft auto-save + magic-link resume (the `prefilledQuestionNames` slot in `wizard_drafts.formData`).
      14. `mergeFields` is called once per schema-land, not on every render (avoid re-introducing the URL-race-style race condition from commit `427a80d`).
    - **`wizard-provided-field-names.test.ts`** — NEW file. Unit tests:
      1. Map keys are exactly `fullName | firstName | lastName | phone | email | dob` (asserted via `Object.keys(map).sort()`).
      2. Each alias array contains lowercase strings only (case-insensitive matching is the caller's responsibility, but the canonical form is lowercase).
      3. No alias appears in BOTH the new map AND the existing `NIN_QUESTION_NAMES` tuple (collision detector — fail loudly if a future edit accidentally crosses the streams).
      4. Snapshot test of the full map shape so unintended edits surface in code review.
    - **`QuestionnaireList.test.tsx`** — extend (or create if not existing) with:
      1. Renders the `🌐 Active for public wizard` badge on the row matching `pinnedFormId`.
      2. Badge is absent on all other published rows.
      3. Pin button is present on unpinned published rows; absent on draft / archived rows.
      4. Clicking Pin opens the AlertDialog with the correct dynamic body (current title + new title).
      5. Confirming Pin invokes the `useUpdateSetting` mutation with the right payload.
      6. Confirming Pin invalidates the published-forms + setting queries on success.
      7. On mutation error, badge rolls back to the previous state + toast appears.
      8. Pin button on the currently-pinned form shows as `📌 Pinned · Unpin`.
      9. Clicking Unpin opens the AlertDialog with the unpin-warning body.
      10. Confirming Unpin sets the mutation payload's `value` to `null`.
    - **`SettingsLandingPage.test.tsx`** — extend with:
      11. New `Public Wizard Form` card renders.
      12. Card shows the pinned form title + version when a form is pinned.
      13. Card shows "None" when no form is pinned.
      14. Card's "Manage in Questionnaires" link points to `/dashboard/super-admin/questionnaires`.
      15. Card does NOT expose a Pin / Unpin button itself (read-only enforcement).

15. **AC#B8 — Zero regression discipline (cross-story).** Story 9-12 wizard flows MUST stay green unchanged:
    - Step 1-5 happy paths (NIN-present + pending-NIN + Step 5 state A/B/C dispatcher).
    - Magic-link landing page (Story 9-12 MR-8) — `/auth/magic` peek + confirm + redirect.
    - `complete-nin` flow on `/register/complete-nin`.
    - `defer-reminder` flow.
    - `/login` cutover banner (public type) + staff-login (unchanged from 9-12 Task 8).
    - Password reset flow.
    - MFA challenge flow from Story 9-13.
    - WizardPage URL ↔ state regression tests from commit `427a80d` (the 5 tests in `WizardPage.test.tsx`).
    - The 24 em-dash removals from commit `427a80d` stay removed (no new em-dashes introduced in this story's user-facing copy).

    Test counts move ONLY by the additive new tests above. No test deletions, no behaviour drift on the existing flows. Verified via pre/post `pnpm test` snapshot in the Dev Agent Record.

## Tasks / Subtasks

### Part A — Form-pin UI on the Questionnaire Management page

- [ ] **Task 1 — Write failing tests for `QuestionnaireList` pin/unpin behaviour (AC: #A1, #A2, #A4)** _(red half)_
  - [ ] 1.1 Inspect `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` to identify the existing row-renderer structure + how it consumes the questionnaires-list query + how it slot-renders the action buttons. Note the existing testids on each row for selector reuse.
  - [ ] 1.2 If `apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` doesn't exist, create it following the `SmsOtpToggle.test.tsx` pattern (TanStack Query test wrapper + mocked `useUpdateSetting` hook + `userEvent` for AlertDialog interactions).
  - [ ] 1.3 Write the 10 tests enumerated in AC#B7 bullet 3 ("`QuestionnaireList.test.tsx`"). Each one should FAIL because the badge + pin button + dialogs don't exist yet.
  - [ ] 1.4 Run `pnpm --filter @oslsr/web vitest run src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` — confirm the new tests FAIL with "element not found" errors. Existing tests in the file (if any) stay GREEN.

- [ ] **Task 2 — Implement the badge + Pin button + AlertDialog on each published form row (AC: #A1, #A2, #A4)** _(green half — Task 1 tests pass)_
  - [ ] 2.1 In `QuestionnaireList.tsx`, import `useUpdateSetting` from `apps/web/src/features/settings/api/settings.api.ts` and `useGetSetting` (or whatever the existing GET-setting hook is — verify at impl time; if absent, add it by mirroring `useUpdateSetting`'s shape).
  - [ ] 2.2 Read `wizard.public_form_id` via `useGetSetting('wizard.public_form_id')`. Expose `pinnedFormId: string | null` and `isPinnedLoading: boolean` to the row-renderer.
  - [ ] 2.3 For each published-form row, render the new badge + pin/unpin button. Reuse the existing shadcn/ui `Badge` component if present; otherwise inline-style per the existing status-badge pattern. The pin button uses `data-testid="qm-pin-button"` on unpinned rows and `data-testid="qm-unpin-button"` on the pinned row. Badge has `data-testid="qm-pinned-badge"`.
  - [ ] 2.4 Wire the click handlers to open AlertDialogs (reuse the existing `AlertDialog` imports from `apps/web/src/components/ui/alert-dialog`). Confirm-action invokes `useUpdateSetting.mutate({ key: 'wizard.public_form_id', value: '<uuid>' | null }, { onSuccess, onError })`. Toast via `sonner` (project's existing toast library; see SmsOtpToggle for exact import).
  - [ ] 2.5 `onSuccess`: invalidate the `wizard.public_form_id` setting query (so AC#A5 mirror refreshes) AND the questionnaires-list query (so the badge moves). Toast "Pinned `<title>`" or "Un-pinned `<title>`".
  - [ ] 2.6 `onError`: rollback the optimistic state. Toast "Couldn't pin the form. Please try again." (no backend error code surfaced).
  - [ ] 2.7 Run the tests from Task 1 — all 10 should now PASS.

- [ ] **Task 3 — Settings landing read-only mirror card (AC: #A5)** _(red-green)_
  - [ ] 3.1 In `apps/web/src/features/settings/pages/__tests__/SettingsLandingPage.test.tsx`, add the 5 new tests from AC#B7 bullet 4 (cards 11-15). Confirm RED.
  - [ ] 3.2 In `SettingsLandingPage.tsx`, add the new "Public Wizard Form" card. Use `useGetSetting('wizard.public_form_id')` for the pinned ID. For the form title + version, either (a) call a new `useQuestionnaireById(formId)` helper (mirror the existing `useQuestionnaires` hook shape — single-form variant) OR (b) leverage `GET /api/v1/forms/public-active` and surface its `title` + `version` directly (zero new endpoint).
  - [ ] 3.3 Render the read-only card per AC#A5 with the dynamic body + the `<Link>` to `/dashboard/super-admin/questionnaires`. Place the card between the existing SMS OTP card and the Fraud Thresholds link card (or wherever Sally's UX Spec calls for; default to alphabetical or chronological-added).
  - [ ] 3.4 Run tests — all 5 should PASS.

- [ ] **Task 4 — Retire the `pnpm pin-public-form` dev script (AC: #A7)**
  - [ ] 4.1 Delete `apps/api/scripts/dev-pin-public-form.ts`.
  - [ ] 4.2 Remove the `"pin-public-form": "tsx scripts/dev-pin-public-form.ts"` entry from `apps/api/package.json` (the entry added in commit `427a80d` 2026-05-12).
  - [ ] 4.3 Grep the repo for `pin-public-form` references in docs / memory / story files. Replace with "use the Pin for Public Wizard button on the Questionnaire Management page".
  - [ ] 4.4 Update MEMORY.md if the script is mentioned there (current state notes likely reference it).
  - [ ] 4.5 Run `pnpm --filter @oslsr/api lint` + `pnpm --filter @oslsr/api tsc --noEmit` — no orphan references remain.

### Part B — Wizard questionnaire field dedup

- [ ] **Task 5 — Write failing tests for the new aliases module + Step 4 dedup behaviour (AC: #B1, #B2, #B3, #B4, #B6, #B7)** _(red half)_
  - [ ] 5.1 Create `apps/web/src/features/registration/lib/__tests__/wizard-provided-field-names.test.ts` with the 4 unit tests from AC#B7 bullet 2.
  - [ ] 5.2 Create `apps/web/src/features/registration/pages/__tests__/Step4Questionnaire.test.tsx` with the 14 tests from AC#B7 bullet 1. Mock `fetchPublicActiveForm` (via the `wizard.api` mock pattern from `CompleteNinPage.test.tsx`) and stub `<FormRenderer>` to expose its received props for assertion.
  - [ ] 5.3 Run both test files — all new tests FAIL (the module + dedup logic + banner don't exist yet).

- [ ] **Task 6 — Implement `WIZARD_PROVIDED_FIELD_NAMES` (AC: #B1)** _(small green half — only Task 5 unit tests on the module pass after this)_
  - [ ] 6.1 Create `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` with the exact constant shape in AC#B1. Export as `WIZARD_PROVIDED_FIELD_NAMES` + a `WIZARD_PROVIDED_FIELD_KEY` type alias for the keys.
  - [ ] 6.2 Also export a small helper `function findWizardFieldForQuestionName(questionName: string): WIZARD_PROVIDED_FIELD_KEY | null` that does case-insensitive matching. This keeps the matching logic in one place + makes Step 4's introspection a one-liner per question.
  - [ ] 6.3 Add `apps/web/src/features/registration/api/wizard.api.ts` `WizardDraftData` interface extension: `prefilledQuestionNames?: ReadonlySet<string>` (TypeScript-only; the JSONB column doesn't care). Note: ReadonlySet doesn't serialize naturally to JSON — change the type to `string[]` (array form) for the persisted shape, and convert to/from Set at the React boundary.
  - [ ] 6.4 Run `wizard-provided-field-names.test.ts` — 4 tests pass.

- [ ] **Task 7 — Add `hideQuestionNames` prop to `<FormRenderer>` (AC: #B3)** _(green half — at least the FormRenderer-related assertions in Task 5's Step4 tests pass)_
  - [ ] 7.1 Add `hideQuestionNames?: ReadonlySet<string>` prop to `FormRenderer`'s props interface.
  - [ ] 7.2 In the iteration / `currentIndex` math, when `hideQuestionNames` is supplied, filter the `questions` array to exclude matching names. Update `getNextVisibleIndex` skip-logic-engine to also skip hidden questions in BOTH directions.
  - [ ] 7.3 IMPORTANT: even hidden questions stay in `initialResponses` + the submit payload. The hide is purely visual — the user doesn't see them, but their pre-filled values flow through `onAnswer` / `onComplete` exactly the same.
  - [ ] 7.4 Existing `FormFillerPage` consumers of `FormRenderer` pass `hideQuestionNames={undefined}` (the prop is optional) — verify the existing 540-line FormFillerPage test suite still passes unchanged (zero regression discipline).

- [ ] **Task 8 — Step 4 introspection + auto-fill + banner (AC: #B2, #B4)** _(remaining green half)_
  - [ ] 8.1 In `Step4Questionnaire.tsx`, extend the existing schema-introspection `useEffect` (lines 62-76) to also compute the prefilled set + auto-fill the questionnaire responses. Use the `findWizardFieldForQuestionName` helper from Task 6.2 to keep the matching logic clean.
  - [ ] 8.2 The single `mergeFields` call should include: the existing `formHasNinQuestion` + `questionnaireFormId` + `questionnaireFormVersionId` stamps AND the new `prefilledQuestionNames: [...Array.from(set)]` AND the auto-filled `questionnaireResponses` merged with whatever's already there. ONE call, NOT three — to avoid race conditions per the URL-race lesson in commit `427a80d`.
  - [ ] 8.3 Render the `<aside role="status" aria-live="polite" data-testid="step4-prefilled-banner">` above the `<FormRenderer>` when `prefilledQuestionNames.size > 0`. Banner copy per AC#B4's dynamic label generation.
  - [ ] 8.4 Pass `hideQuestionNames={prefilledQuestionNames}` to `<FormRenderer>`.
  - [ ] 8.5 Run `Step4Questionnaire.test.tsx` — all 14 tests pass.

- [ ] **Task 9 — Full zero-regression sweep (AC: #B8)**
  - [ ] 9.1 `cd apps/web && pnpm tsc --noEmit` — clean.
  - [ ] 9.2 `cd apps/web && pnpm lint` — clean.
  - [ ] 9.3 `cd apps/web && pnpm vitest run` — all green. Net test delta: +1 test file (`Step4Questionnaire.test.tsx`, 14 tests) + 1 test file (`wizard-provided-field-names.test.ts`, 4 tests) + extensions to `QuestionnaireList.test.tsx` (+10) + extensions to `SettingsLandingPage.test.tsx` (+5) = approximately **+33 net new tests**, zero deletions, zero regressions.
  - [ ] 9.4 `cd apps/api && pnpm tsc --noEmit && pnpm lint && pnpm vitest run` — clean. Backend test counts unchanged (Part B doesn't touch any backend code; Part A reuses the existing settings PATCH endpoint).
  - [ ] 9.5 Manual UAT smoke (Bob's dev agent walks through):
    - Pin a form via Q.M. → confirm dialog → see badge move + toast → Settings mirror shows the new pinned form.
    - Un-pin → confirm dialog → see badge disappear + toast → Step 4 reverts to "Survey not yet available" empty-state on next wizard refresh.
    - Pin a form whose schema has `name` + `phone` + `email` questions → start wizard → fill Step 1 + Step 2 → arrive at Step 4 → see banner "We've pre-filled Name, Phone, and Email from your earlier answers" → those questions NOT shown to user → submit → backend receives complete `questionnaireResponses`.
    - Pin a form whose schema has a NIN question → start wizard → fill Step 4 NIN → arrive at Step 5 State A (NIN captured) → submit → respondent created with `status='active'`. **NIN is NOT auto-filled by the dedup logic — confirms AC#B6.**

- [ ] **Task 10 — Code review (per `feedback_review_before_commit.md`)**
  - [ ] 10.1 Run `/bmad:bmm:workflows:code-review` on the uncommitted working tree once Tasks 1-9 are green. Auto-fix all HIGH/Medium severity findings; document Low-severity deferrals in Review Follow-ups (AI) per project convention.
  - [ ] 10.2 Only after code review passes, commit and mark status `review`.

## Dev Notes

### Bundling rationale + Bob's split-or-bundle judgment call

Awwal's brief asked for Part A + Part B in a SINGLE story. Bob preserves that grouping because:

1. Both close UX gaps surfaced by the SAME UAT session (2026-05-12).
2. Both extend the wizard's questionnaire-handling story (9-12 ships the foundation; 9-17 polishes the friction).
3. Backend scope is trivial for both (Part A reuses an existing settings endpoint; Part B is frontend-only).
4. Test coverage cross-references (Part B's NIN regression test relies on a pinned form, which Part A's UI makes easy to set up).

If a future dev agent picking this up finds the scope unwieldy, the split point is clean: Part A = Q.M. page + Settings mirror + dev-script retirement; Part B = wizard dedup + alias module. They share no production code paths, only the wizard's `wizard.public_form_id` setting key which is unchanged.

### UI placement decision is load-bearing (DO NOT relocate)

The original Story 9-12 Task 5.4 design placed the form-pin control on the Settings landing page. Awwal flagged this as a workflow break during the 2026-05-12 UAT session: after publishing a questionnaire, the natural next thought is *"how do I make this the active one?"*, and Settings is the wrong place to look.

**The pin control belongs on the Questionnaire Management page**, immediately next to the publish action, with a visual badge identifying the currently-pinned form. Settings landing page gets a read-only mirror card so the pinned form is also discoverable from there — but the primary mutation surface is Q.M.

This is the design decision the story file is preserving. Do NOT relocate the primary pin control to Settings; it would re-introduce the workflow break.

### Pattern C choice over A / B / D

Awwal's UAT message asked the question "is it possible for us to check these questions presence (for example name, phone number, email)... or what do you propose." Four patterns were considered:

| Pattern | Approach | Why not chosen for 9-17 |
|---|---|---|
| A. Suppress + auto-fill (silent) | Hide duplicates, auto-fill on submit | Silent feels dishonest; user doesn't know data crossed the boundary |
| B. Pre-fill + read-only | Show duplicates but disabled with "From Step 2" hint | Adds visual noise; "asked but answered" looks broken |
| **C. Skip + banner ⭐ (THIS STORY)** | Auto-fill + small banner "We've pre-filled..." | Transparent + zero friction; mirrors the NIN pattern's "state-aware" feel without adding a full dispatcher |
| D. Move identity into questionnaire | Wizard stops collecting identity entirely | Major rework; loses progressive-disclosure benefits; out of scope |

The 2026-05-12 thread settled on Pattern C as the recommendation, which is the spec encoded here.

### Why NIN is deliberately excluded from the dedup map

NIN already has the most sophisticated handling in the wizard — the state-aware Step 5 dispatcher (Story 9-12 Dev Notes "Step 5 NIN handling — state-aware dispatcher"; see [Source: apps/web/src/features/registration/pages/Step5NinAndAuth.tsx]). The three states (A: questionnaire-captured / B: pending-via-inline-toggle / C: form-has-no-NIN) interact with `useNinCheck`'s real-time duplicate detection + the `NinHelpHint` inline link + the pending-NIN consequence preview card. Adding NIN to the new `WIZARD_PROVIDED_FIELD_NAMES` map would short-circuit all of that logic.

`WIZARD_PROVIDED_FIELD_NAMES` is for IDENTITY fields the wizard collects FIRST and the questionnaire might ASK FOR AGAIN (a redundancy). NIN is collected in EITHER the questionnaire OR Step 5, not both — handled by a separate state machine, not a redundancy dedup. The two live in different files (`nin-question-names.ts` and the new `wizard-provided-field-names.ts`) to make this separation visually explicit and to make the collision detector test (AC#B7 bullet 2.3) trivially expressive.

### Dependencies

- **Story 9-12** (HARD) — provides the wizard infrastructure (`Step4Questionnaire`, `<FormRenderer>`, `NIN_QUESTION_NAMES` pattern), the form-discovery path (`fetchPublicActiveForm` + `getPublicActiveForm` service + `wizard.public_form_id` setting key + the `migrate-system-settings-init.ts` seed), and the URL-race fix from commit `427a80d`. 9-17 cannot ship before 9-12.
- **`prep-settings-landing-and-feature-flags`** (HARD) — provides `SettingsService.setSetting`, `PATCH /admin/settings/:key` endpoint, `SettingsLandingPage`, the `SmsOtpToggle` optimistic-mutation reference at [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50], `useUpdateSetting` hook at [Source: apps/web/src/features/settings/api/settings.api.ts:49], and the `SETTINGS_FLIPPED` audit action [Source: apps/api/src/services/audit.service.ts:78].
- **Story 2-1** — provides `QuestionnaireManagementPage` + `QuestionnaireList` + `useQuestionnaires` hook. 9-17 extends both without restructuring.
- **Story 6-1** — provides the hash-chain audit log surface used by the `SETTINGS_FLIPPED` writes.

### Risks

1. **`useGetSetting` may not exist as a hook yet.** `prep-settings-landing` exposed `useUpdateSetting` per [Source: apps/web/src/features/settings/api/settings.api.ts:49] but the GET-side may be inline-fetched in the page. Mitigation at impl time: if the hook doesn't exist, add it as a one-line extension to `settings.api.ts` mirroring `useUpdateSetting`'s shape. Used by both Q.M. (AC#A2) and Settings mirror (AC#A5).

2. **5-minute React Query staleTime on `Step4Questionnaire.tsx:51`.** When Super Admin pins a different form, in-flight wizard sessions won't see the change until their local cache expires (~5 min). This is intentional — avoids surprising users mid-wizard with a different form schema — but the AC#A2 confirmation dialog copy ("Existing in-flight registrations will continue against the previous form for up to 5 minutes due to client-side caching") makes the expectation explicit.

3. **Field-alias false-positive matches.** A form might have a question named `email` that's NOT the user's email (e.g., "Your employer's contact email"). The alias list is EXACT-MATCH (not fuzzy) so form authors who use generic names trigger the dedup; authors who use specific names (`employer_email`, `next_of_kin_phone`) don't. Future enhancement: add a `respondent: true` flag on `NativeFormSchema.question` to make field intent explicit. Out of scope for 9-17 — log as a candidate for a future `prep-questionnaire-field-intent` story if false-positives surface in production.

4. **NIN cross-contamination from alias typos.** A future edit to `WIZARD_PROVIDED_FIELD_NAMES` could accidentally add a NIN alias (e.g., copy-paste error from the NIN tuple). The collision-detector test (AC#B7 bullet 2.3) catches this at CI time before it lands.

5. **`mergeFields` race re-introduction.** Step 4's introspection + auto-fill happens in a `useEffect` that calls `mergeFields`. If `mergeFields` is called multiple times in the same effect, the URL-race-style stale-closure problem from commit `427a80d` could re-emerge. AC#B7 test #14 explicitly asserts `mergeFields is called once per schema-land, not on every render`. The single-call pattern in Task 8.2 is the implementation contract.

6. **Sequencing with Story 9-16.** 9-16 (magic-link login JWT issuance) and 9-17 both touch the wizard frontend. 9-16 touches `/login` + `MagicLinkLandingPage` login branch + new `AuthService.loginByMagicLinkToken` method; 9-17 touches `Step4Questionnaire` + `<FormRenderer>` + `QuestionnaireList` + `SettingsLandingPage`. **Zero file-level overlap.** They can ship in either order. The dev agent picking this up notes the order in the Dev Agent Record so a future code-review pass can verify.

7. **Q.M. page state-fetch pattern.** The existing `QuestionnaireManagementPage` uses `useCreateNativeForm` for the create flow; the LIST fetch likely uses `useQuestionnaires` or similar. Bob's dev agent verifies the exact query-key + invalidation pattern at impl time before wiring the `onSuccess` invalidation.

### Project Structure Notes

- **New files** (this story):
  - `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` (AC#B1)
  - `apps/web/src/features/registration/lib/__tests__/wizard-provided-field-names.test.ts` (AC#B7)
  - `apps/web/src/features/registration/pages/__tests__/Step4Questionnaire.test.tsx` (AC#B7 — was deferred in 9-12)
- **Files extended** (this story):
  - `apps/web/src/features/questionnaires/components/QuestionnaireList.tsx` — badge + pin button (AC#A1, #A2, #A4)
  - `apps/web/src/features/questionnaires/components/__tests__/QuestionnaireList.test.tsx` — new tests (AC#B7)
  - `apps/web/src/features/settings/pages/SettingsLandingPage.tsx` — read-only mirror card (AC#A5)
  - `apps/web/src/features/settings/pages/__tests__/SettingsLandingPage.test.tsx` — new tests (AC#B7)
  - `apps/web/src/features/registration/pages/Step4Questionnaire.tsx` — dedup logic + banner (AC#B2, #B4)
  - `apps/web/src/features/forms/components/FormRenderer.tsx` — `hideQuestionNames` prop (AC#B3)
  - `apps/web/src/features/registration/api/wizard.api.ts` — `WizardDraftData.prefilledQuestionNames` field (TS-only)
  - `apps/web/src/features/settings/api/settings.api.ts` — possibly add `useGetSetting` hook if it doesn't exist
- **Files deleted** (AC#A7):
  - `apps/api/scripts/dev-pin-public-form.ts`
- **package.json entry removed** (AC#A7):
  - `apps/api/package.json` `pin-public-form` script
- **NO new backend code, NO new DB migration, NO new audit-action keys, NO new env vars, NO new dependencies.**
- **NO FRC impact** — both Part A and Part B are Operate-phase polish; field-survey can launch without 9-17 landing.

### References

- Story 9-12 (wizard foundation + NIN dispatcher + Step 4 introspection origin): [Source: _bmad-output/implementation-artifacts/9-12-public-wizard-pending-nin-magic-link.md AC#1 Step 4 + AC#3-5 NIN + Dev Notes "Step 5 NIN handling — state-aware dispatcher"]
- Commit `427a80d` (URL-race regression fix + the 2026-05-12 `pnpm pin-public-form` dev bridge this story retires): see git log
- prep-settings-landing-and-feature-flags (settings infra dependency): [Source: _bmad-output/implementation-artifacts/prep-settings-landing-and-feature-flags.md]
- `Step4Questionnaire` (Part B extension point): [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76 — existing schema-introspection useEffect]
- `<FormRenderer>` (Part B prop addition): [Source: apps/web/src/features/forms/components/FormRenderer.tsx]
- `NIN_QUESTION_NAMES` pattern (canonical reference for the new aliases module): [Source: apps/web/src/features/registration/lib/nin-question-names.ts]
- Step 5 NIN dispatcher (the NIN-stays-separate contract): [Source: apps/web/src/features/registration/pages/Step5NinAndAuth.tsx:32-47]
- Settings PATCH endpoint (used by Part A — NO new endpoint): [Source: apps/api/src/routes/settings.routes.ts] + [Source: apps/api/src/services/settings.service.ts]
- `useUpdateSetting` hook (reused by Part A): [Source: apps/web/src/features/settings/api/settings.api.ts:49]
- `SmsOtpToggle` (optimistic-mutation reference for Part A): [Source: apps/web/src/features/settings/components/SmsOtpToggle.tsx:28-50]
- `SettingsLandingPage` (read-only mirror lands here): [Source: apps/web/src/features/settings/pages/SettingsLandingPage.tsx]
- `QuestionnaireManagementPage` + `QuestionnaireList` (Part A primary surface): [Source: apps/web/src/features/questionnaires/pages/QuestionnaireManagementPage.tsx] + [Source: apps/web/src/features/questionnaires/components/QuestionnaireList.tsx]
- Existing `wizard.public_form_id` seed (no changes): [Source: apps/api/scripts/migrate-system-settings-init.ts:89-115]
- Existing `getPublicActiveForm` service (no changes): [Source: apps/api/src/services/native-form.service.ts:377-418]
- `AUDIT_ACTIONS.SETTINGS_FLIPPED` (used by Part A via existing service): [Source: apps/api/src/services/audit.service.ts:78]
- Dev script to retire (AC#A7): [Source: apps/api/scripts/dev-pin-public-form.ts] + [Source: apps/api/package.json `pin-public-form` entry]
- React Query staleTime constraint (referenced in AC#A2 dialog copy): [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:51]
- `submitWizardSchema` (unchanged): [Source: apps/api/src/controllers/registration.controller.ts:66-83]
- Story 9-16 (sibling — auth surface, no overlap with this story): [Source: _bmad-output/implementation-artifacts/9-16-magic-link-login.md]
- Story 9-15 (parallel hotfix — shipped via `story/9-15-prod-gate-telegram-alerts` branch; no overlap): [Source: _bmad-output/implementation-artifacts/9-15-prod-gate-telegram-alerts.md]

## Dev Agent Record

### Agent Model Used

_(Dev agent will fill in on pickup)_

### Debug Log References

_(Dev agent will fill in on pickup)_

### Completion Notes List

_(Dev agent will fill in on pickup)_

### File List

_(Dev agent will fill in on pickup)_

### Review Follow-ups (AI)

_(Populated by code-review agent during/after `dev-story` execution per Task 10.)_

## Change Log

| Date | Change | Rationale |
|---|---|---|
| 2026-05-12 | Story drafted by Bob (SM) via `*create-story --yolo` per Awwal directive at UAT session close 2026-05-12. Bundles two Story-9-12 follow-ups: (Part A) form-pin UI on the Questionnaire Management page replacing the "go to Settings to pin" workflow gap; (Part B) wizard questionnaire field dedup using Pattern C (auto-fill + banner). 15 ACs across both parts; 10 tasks with file-path-specific red-green-refactor subtasks. NO new backend code, NO migrations, NO new audit-action keys, NO new dependencies. AC#A7 explicitly retires the `pnpm pin-public-form` dev script that commit `427a80d` shipped as the bridge between 9-12 production launch and this story landing. Effort: ~3-4 dev-days. Priority: Operate-phase polish — does NOT block field-survey. HARD deps: Story 9-12 (wizard + NIN pattern), prep-settings-landing (PATCH endpoint + SmsOtpToggle reference + audit chain), Story 2-1 (Q.M. page surface). | UI-placement decision (Q.M. primary, Settings mirror) is load-bearing UX from the 2026-05-12 UAT session. Pattern C choice (over A/B/D) prioritises transparency without adding noise. NIN stays in its own `NIN_QUESTION_NAMES` tuple + state-aware Step 5 dispatcher; the new `WIZARD_PROVIDED_FIELD_NAMES` map is identity-only and deliberately excludes NIN. Story authored autonomously from a comprehensive brief — no elicitation needed; all 15 ACs + 10 tasks + source citations derived from the brief and verified against the live codebase (commit `427a80d`). |
