# Story 9.18: Wizard NIN-first capture + Review-and-Save summary on Step 5

Status: ready-for-dev

<!--
Authored 2026-05-12 by Bob (SM) via canonical *create-story --yolo workflow.

Strategic UX redesign of the public registration wizard surfaced during
the 2026-05-12 UAT session with Awwal. Replaces the Story 9-12 Step 5
state-aware dispatcher (A/B/C) with a single canonical NIN capture point
at Step 1 and a Review-and-Save summary on Step 5.

Bundles three structural changes:
  PART A — NIN moves from Step 5 to Step 1 (alongside identity basics).
  PART B — Step 4 questionnaire auto-fills NIN (extends 9-17 Pattern C).
  PART C — Step 5 becomes a Review-and-Save summary page.

Awwal's UX directive captured verbatim in Dev Notes "Step structure
change — Awwal's proposal" subsection. Do NOT relocate NIN back to
Step 5; the entire premise of the story is single-place NIN capture.

Numbering: 9-14 is RESERVED (SSH firewall re-narrow follow-up from
Story 9-9 Operate-phase). 9-15 (prod-gate-telegram-alerts) shipped to
`done` 2026-05-12. 9-16 (magic-link-login JWT) authored 2026-05-11.
9-17 (form-pin UI + Pattern C field dedup) authored 2026-05-12. 9-18
is the next sequential slot in Epic 9.

Pre-impl decision flagged: AC#C3 retires the magic-link / password /
skip auth-choice radio set. Awwal must confirm this is intentional
BEFORE the dev agent starts (the alternative is keeping the radio set
on Step 5 alongside the summary; current spec assumes retirement
based on Awwal's verbatim message "the 5th step would be the message").
-->

## Story

As a **public respondent registering through the OSLSR wizard**,
I want **to provide my NIN early in Step 1 alongside the other identity fields, have the questionnaire skip the questions I already answered, and confirm my registration with a clear summary and a single Save button on Step 5**,
So that **the wizard feels coherent, my NIN gets validated immediately rather than at the end, and the final step is a confidence-building review rather than another configuration screen**.

## Acceptance Criteria

### Part A — NIN moves to Step 1 (identity basics + NIN unified)

1. **AC#A1 — Step 1 contains the NIN input field.** `Step1BasicInfo` ([Source: apps/web/src/features/registration/pages/Step1BasicInfo.tsx]) gains a NIN input field as the FIRST required field (above full name, DOB, gender). Markup mirrors the existing Step 5 State C input at [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:115-159] verbatim: `type="text"`, `inputMode="numeric"`, `maxLength={11}`, `inputmode` numeric, `onChange` strips non-digits, validation banner colors track an `ninStatus` state machine (incomplete / valid / invalid) per the same rendering at [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:97-103]. `NinHelpHint` renders inline below the input (variant="inline"). `PendingNinToggle` renders directly below the help hint. `data-testid="wizard-step1-nin-input"`.

2. **AC#A2 — Live NIN duplicate check at Step 1.** The Step 1 NIN field consumes the `useNinCheck` hook ([Source: apps/web/src/features/forms/hooks/useNinCheck.ts]) the same way `FormFillerPage` does at [Source: apps/web/src/features/forms/pages/FormFillerPage.tsx]. The hook fires its debounced backend check whenever a checksum-valid 11-digit NIN is typed. If the backend returns the FR21 duplicate-NIN error code, Step 1 renders the duplicate-block UI (mirror the pattern from `CompleteNinPage.tsx:NIN_DUPLICATE` branch — see [Source: apps/web/src/features/registration/pages/__tests__/CompleteNinPage.test.tsx] test "renders FR21 duplicate-NIN block on NIN_DUPLICATE error" for the canonical UX). Continue is disabled while the duplicate block is showing.

3. **AC#A3 — Step 1 Continue is gated on (NIN checksum-valid) OR (pending toggle pressed).** The Continue button is disabled until at least one of:
   - The NIN field contains 11 digits AND `modulus11Check(nin)` returns true AND `useNinCheck` is not currently reporting duplicate, OR
   - `pendingNinToggle === true`
   PLUS the existing Step 1 validations (full name, DOB if required, gender if required) all pass. Validation feedback uses the same `aria-invalid="true"` + colored-border pattern as [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:131-138]. Continue's `disabled` attribute carries `aria-describedby="step1-validation-summary"` pointing to the visible validation summary above the button.

4. **AC#A4 — Pending toggle on Step 1 reveals the consequence-preview card.** When the user presses the pending-NIN switch and `pendingNinToggle` flips to `true`:
   - The NIN input field becomes disabled (visual + `disabled` attribute) mirroring [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:128].
   - Any value previously typed in the NIN field is RETAINED in `formData.nin` (toggle-OFF restores it without re-typing — matches Story 9-12 Dev Notes line "State C contract preserves the value").
   - A consequence-preview card renders below the toggle with the EXACT verbatim copy from `CONSEQUENCE_COPY` at [Source: apps/web/src/features/registration/components/PendingNinToggle.tsx:36]: *"Your registration will be saved as pending. We'll email you to complete it. We'll also remind you in 2 days, 7 days, and 14 days."* Card styling clones the info-banner pattern from [Source: apps/web/src/features/registration/pages/Step5PendingNin.tsx:44-49] (border-left-4 + bg-info-50 + text-info-800). `data-testid="step1-pending-consequence"`.
   - This card replaces the entire Step 5 State B page (which is deleted by AC#C2).

5. **AC#A5 — `NinHelpHint` retains the "I don't have my NIN now" link on Step 1.** The inline link inside `NinHelpHint` at [Source: apps/web/src/features/registration/components/NinHelpHint.tsx:123-130] calls `onPendingNinClick` which Step 1 wires to `() => mergeFields({ pendingNinToggle: true })`. Clicking the link is functionally equivalent to pressing the toggle switch. Both code paths produce the same `formData.pendingNinToggle === true` state.

### Part B — Step 4 questionnaire auto-fills NIN (extends 9-17 Pattern C)

6. **AC#B1 — Add `nin` to `WIZARD_PROVIDED_FIELD_NAMES`.** The dedup-map module created by 9-17 Part B AC#B1 at `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` gains a new key:
   ```ts
   nin: ['nin', 'national_id'],
   ```
   The aliases match the `NIN_QUESTION_NAMES` constant currently at [Source: apps/web/src/features/registration/lib/nin-question-names.ts:14] exactly, so no behavior drift between the two paths. The collision-detector test at 9-17 AC#B7 bullet 2.3 (which today asserts `'nin' NOT IN WIZARD_PROVIDED_FIELD_NAMES`) flips to assert `'nin' IN WIZARD_PROVIDED_FIELD_NAMES` — both polarities documented as conscious choices per the 9-17 forward-compat addendum at [Source: _bmad-output/implementation-artifacts/9-17-wizard-form-pin-ui-and-field-dedup.md § "Forward-compat with proposed Story 9-18"].

7. **AC#B2 — Delete `nin-question-names.ts` (consolidation, not migration).** With NIN merged into `WIZARD_PROVIDED_FIELD_NAMES`, the standalone `nin-question-names.ts` becomes redundant. Delete it. Migrate the two import sites — `FormFillerPage.tsx` and `ClerkDataEntryPage.tsx` — to import from `wizard-provided-field-names.ts` (they only use the array for the inline `pending-NIN` link gate; the union type can be re-exported from the dedup module or replaced with `string` since the use sites just do `.includes()` checks). Per project "no technical debt" discipline: no shim, no `_deprecated` re-export, the file is gone after this change.

8. **AC#B3 — Step 4 auto-fills questionnaire NIN from wizard data.** The schema-introspection useEffect at [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76] (which 9-17 Part B already extended to introspect identity fields) gains a NIN branch. On schema-land:
   - Find all questionnaire questions whose `name` is in `WIZARD_PROVIDED_FIELD_NAMES.nin`.
   - For each match, if `formData.nin` is set: write `formData.nin` into `questionnaireResponses[questionName]`.
   - Add the matched question names to the `hideQuestionNames` Set passed to `<FormRenderer>` (the prop added by 9-17 Part B AC#B3 at [Source: apps/web/src/features/forms/components/FormRenderer.tsx]).
   - The Step 4 banner copy (per 9-17 Part B AC#B4) extends to include "NIN" in the comma-separated list: e.g., *"We've pre-filled NIN, Name, Phone, Email from your earlier answers."* — banner enumeration logic is field-agnostic so adding NIN requires no banner-component change beyond the alias map.

9. **AC#B4 — Pending-NIN inline link retires from `<FormRenderer>` wizard context.** The inline "I don't have my NIN now" link inside FormRenderer at [Source: apps/web/src/features/forms/components/FormRenderer.tsx:281-289] is no longer needed in the wizard context (NIN is captured at Step 1, never re-asked in Step 4). The link still exists for clerk-data-entry / form-filler-page contexts where NIN is asked directly. Implementation: gate the inline-link rendering on the `onPendingNinClick` prop being truthy (already the case at line 281 — `{isCurrentNin && onPendingNinClick && !disabled && (...)}`). Then in `Step4Questionnaire.tsx`, pass `onPendingNinClick={undefined}` to FormRenderer. Net: no FormRenderer source change; just the wizard caller stops passing the callback. Clerk contexts continue to pass it.

10. **AC#B5 — `handlePendingNinTriggered` in `WizardPage.tsx` is deleted.** The callback at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:150-159] exists solely to bridge the Step-4 inline link to the wizard draft. With AC#B4 removing the inline link from the wizard context, this callback has no caller. Delete it. Step 4 no longer needs the `onPendingNinTriggered` prop in its `Step4Props` interface ([Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:38]) — remove the prop.

### Part C — Step 5 becomes Review-and-Save summary

11. **AC#C1 — Replace `Step5NinAndAuth` with `Step5ReviewAndSave`.** New file `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` renders a single summary view (NO state dispatcher, NO sub-pages):

    **Summary card** showing all wizard-collected fields in a labeled list:
    - **Full name**: `formData.fullName`
    - **Date of birth**: `formData.dateOfBirth` (formatted YYYY-MM-DD)
    - **Gender**: `formData.gender`
    - **NIN**: `formData.nin` (formatted as `XXXXX-XXXXX-X`) OR `📌 Pending — we'll email you` badge if `pendingNinToggle === true`
    - **Phone**: `formData.phone`
    - **Email**: `formData.email`
    - **LGA**: LGA name (resolved from `formData.lgaId` via the existing public LGA list query)
    - **Consent**: `formData.consentMarketplace` + `formData.consentEnriched` as `✓ Allowed` / `— Declined` chips

    **Edit affordance**: each row carries a small `Edit` link (`<button>` styled as text link) that calls `goToStep(stepIndexForField(fieldName))`. Map: name/DOB/gender/NIN → Step 0, phone/email/LGA → Step 1, consent flags → Step 2, questionnaire pre-fills → Step 3. Result: users can jump back to fix any field without restarting.

    **Save button**: single button at the bottom labeled `Save Registration` OR `Save as Pending` (label flips on `pendingNinToggle`). `data-testid="wizard-save-button"`.

    **No auth-choice fieldset.** Per AC#C3.

12. **AC#C2 — Delete the four Step 5 sub-pages and their test files.** Remove:
    - `apps/web/src/features/registration/pages/Step5NinAndAuth.tsx`
    - `apps/web/src/features/registration/pages/Step5NinCaptured.tsx`
    - `apps/web/src/features/registration/pages/Step5PendingNin.tsx`
    - `apps/web/src/features/registration/pages/Step5NinInput.tsx`
    - `apps/web/src/features/registration/pages/__tests__/Step5NinAndAuth.test.tsx`

    Their useful sub-components migrate as follows:
    - `AuthChoiceFieldset` (currently exported from `Step5NinCaptured.tsx`): DELETED (auth-choice retires per AC#C3). If it survives anywhere as a reused component, it shouldn't — the only caller after this story is the new `Step5ReviewAndSave` which doesn't use it.
    - NIN input markup + `ninStatus` state machine: migrates inline into `Step1BasicInfo.tsx` per AC#A1.
    - Pending-NIN consequence card: migrates inline into `Step1BasicInfo.tsx` per AC#A4.

    Per project "no technical debt" discipline: no `_deprecated` files left around. No re-export shims. The deletions are explicit and complete in the same PR.

13. **AC#C3 — Auth-choice retires (DECISION FLAGGED — Awwal pre-impl confirm).** Today Step 5 forces users to pick `magic-link` / `password` / `skip` BEFORE submit per Story 9-12 AC#3-5 + the `AuthChoiceFieldset` at [Source: apps/web/src/features/registration/pages/Step5NinCaptured.tsx]. After 9-18:
    - The `authChoice` field is removed from the wizard UI entirely.
    - Every successful submission triggers a `purpose: 'login'` magic-link email (or `purpose: 'pending_nin_complete'` if pending) — the backend behavior already supports this default at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:202-208].
    - The submit-time choice between password creation and magic-link disappears from this surface; users who want password access can set one from the post-login Profile page (no UI work needed in this story — confirm with Awwal).

    **Awwal: this AC needs your confirmation BEFORE the dev agent starts.** The alternative is keeping the AuthChoiceFieldset on Step 5 alongside the summary card. Default assumption: retirement, per your verbatim *"the 5th step would be the message"* directive 2026-05-12.

14. **AC#C4 — `RegistrationCompletePage` gains a magic-link confirmation line.** [Source: apps/web/src/features/registration/pages/RegistrationCompletePage.tsx] — append a line below the existing success copy:
    - For ACTIVE submissions: *"We've emailed you a one-click link at <email> to view, edit, or withdraw your registration anytime."*
    - For PENDING-NIN submissions: *"We've emailed you a one-click link at <email> — click it to add your NIN when you have it."*
    Implementation: add an `email` + `pendingNin` field to the `CompletionData` prop interface (already there per Story 9-12 — `pendingNin` is set; just add `email`). Render copy via a conditional.

15. **AC#C5 — Wizard submit payload shape STAYS THE SAME.** `POST /api/v1/registration/wizard` continues to accept the existing `submitWizardSchema` at [Source: apps/api/src/controllers/registration.controller.ts]:
    ```
    fullName, dateOfBirth, gender, phone, email, lgaId,
    consentMarketplace, consentEnriched, nin, pendingNin,
    deferReasonNin, questionnaireResponses, authChoice
    ```
    The frontend always sends `authChoice: 'magic-link'` as a constant (no longer user-selected). Backend code path is unchanged — no migration, no new endpoints, no controller change. **Dev agent verifies at impl time** that the backend doesn't have a hidden assumption that `authChoice` ever takes any other value (a quick grep should confirm `authChoice === 'password'` and `authChoice === 'skip'` branches still exist in the controller for any future direct API consumers — they just never fire from the wizard frontend).

### Part D — Tests + zero regression

16. **AC#D1 — `Step1BasicInfo.test.tsx` extensions** covering:
    - NIN input field renders with all aria attributes per AC#A1
    - Typing 11 checksum-valid digits → Continue enabled
    - Typing 11 checksum-invalid digits → Continue disabled + aria-invalid="true" + "NIN failed the Modulus 11 checksum" error
    - Typing < 11 digits → Continue disabled + "NIN must be 11 digits" error (only on blur per the existing `touched` pattern)
    - `NinHelpHint` inline link click → `pendingNinToggle: true` in mergeFields call
    - `PendingNinToggle` press → NIN field disabled + consequence card visible + Continue allowed (with other required fields filled)
    - `useNinCheck` reports DUPLICATE → duplicate-block UI renders + Continue disabled
    - `useNinCheck` reports OK → no duplicate UI, Continue enabled (other fields filled)

17. **AC#D2 — `Step5ReviewAndSave.test.tsx` (new)** covering:
    - Summary card lists all 8 fields (full name / DOB / gender / NIN / phone / email / LGA / consent)
    - NIN row shows formatted NIN when `formData.nin` set
    - NIN row shows "Pending — we'll email you" badge when `pendingNinToggle === true`
    - Save button label is "Save Registration" by default
    - Save button label flips to "Save as Pending" when `pendingNinToggle === true`
    - Each Edit link calls `goToStep` with the correct step index for that field
    - Save click invokes the `onSubmit` prop callback
    - No `AuthChoiceFieldset` is rendered (regression assertion)

18. **AC#D3 — `Step5NinAndAuth.test.tsx` is DELETED.** Per AC#C2. Test count delta is documented in the Dev Agent Record so review can verify the deletion was intentional, not accidental. Expected delta: -9 tests (the current count) + ~14 new tests across AC#D1 / AC#D2 = net +5 tests.

19. **AC#D4 — `Step4Questionnaire.test.tsx` (added by 9-17) gains a NIN dedup test:**
    - Form with `nin` question + `formData.nin` set → questionnaire response auto-filled + question name in `hideQuestionNames` + banner copy includes "NIN"
    - Form with `national_id` question (legacy alias) → same auto-fill behavior
    - Form with NIN question + `pendingNinToggle === true` → NIN question STILL hidden (don't ask) + banner copy reads "NIN (pending), Name, Phone, ..." or omits NIN from the prefilled list

20. **AC#D5 — Playwright e2e refresh.** Update the two affected specs:
    - [Source: apps/web/e2e/wizard-registration.spec.ts] — Step 1 now has a NIN field; the happy-path spec types a valid NIN at Step 1 (not Step 5).
    - [Source: apps/web/e2e/nin-validation.spec.ts] — covers Step 1 validation (Modulus-11 reject + 11-digit shape check + duplicate-NIN block + pending toggle flow). The Step 5 sub-page coverage is REMOVED because the sub-pages no longer exist; that coverage migrates entirely to Step 1 specs.
    - Both specs verify the Step 5 summary view + magic-link confirmation copy in the success screen.

21. **AC#D6 — Zero regression on Story 9-12 flows that survive intact.** The following flows are NOT changed by 9-18 and must continue passing their existing tests:
    - Magic-link landing page (login / wizard-resume / complete-NIN / defer-reminder) — `MagicLinkLandingPage.test.tsx`
    - Staff invitation flow (entirely separate code path) — `LoginForm.test.tsx`, `ActivationWizard.test.tsx`
    - Password-based login — `LoginPage.tsx` + existing test coverage
    - MFA challenge — Story 9-13 surface area
    - Public form discovery via `wizard.public_form_id` setting — `Step4Questionnaire` empty-state coverage + the Q.M. pin UI from 9-17
    - WizardPage URL ↔ state sync race fix from commit `427a80d` — `WizardPage.test.tsx` (5 tests)

    Dev Agent Record reports the test-suite total before and after; deltas larger than the expected ~+5 require justification.

### Part E — Section-as-step questionnaire restructure (AMENDMENT 2026-05-19, data-driven)

Added 2026-05-19 after 5 days of production data confirmed the Step-4 stall pattern (63% of all wizard drafts stuck at Step 4 — the unified questionnaire screen). The 39-question / 7-section survey rendered as a single "Step 4 of 5" is the single biggest UX bottleneck blocking actual completions. Folding section-as-step into 9-18 because both are wizard structural redesigns (same surface, same dev context, same UAT cycle). Effort estimate revised: 3-5 days → **6-10 days** total.

22. **AC#E1 — Each questionnaire section becomes its own wizard step**. The current single "Step 4 — Questionnaire" expands into one step per section. The pinned form has 7 sections (General / Introduction & Consent / Identity & Demographics / Employment & Income / Household / Skills & Business / Marketplace consent), so the post-9-18-E wizard has **11 steps total**:
    ```
    Step 1   Identity + NIN  (from Part A)
    Step 2   Contact + LGA
    Step 3   Consent
    Step 4   Section: General
    Step 5   Section: Introduction & Consent
    Step 6   Section: Identity & Demographics  (auto-fills + hides name/DOB/phone via Pattern C)
    Step 7   Section: Employment & Income
    Step 8   Section: Household
    Step 9   Section: Skills & Business
    Step 10  Section: Marketplace consent
    Step 11  Review-and-Save summary  (from Part C)
    ```
    Step indicator shows `Step 6 of 11 — Identity & Demographics` so users see realistic progress.

23. **AC#E2 — `FormRenderer` gains `renderSectionByIndex` mode**. Currently `<FormRenderer>` renders the full questionnaire as one component with internal section/question navigation. New prop `sectionIndex?: number` tells it to render ONLY the indexed section (questions within still iterate one-at-a-time). Existing all-sections mode preserved for clerk-data-entry / form-filler-page contexts.

24. **AC#E3 — Wizard step machinery extends to N steps**. `apps/web/src/features/registration/pages/WizardPage.tsx` `STEPS` array dynamically lengthens based on the loaded form's section count (Steps 1-3 fixed, Steps 4..N-1 = form.sections.length, Step N = summary). `useWizardDraft` schema absorbs the extra steps transparently (`currentStep` is just an integer; no schema migration needed).

25. **AC#E4 — Skip-logic across step boundaries**. Conditional questions whose visibility depends on a question in an earlier section continue to work — the renderer's `getNextVisibleIndex` logic operates within a section; cross-section dependencies use `showWhen` resolved against the cumulative `questionnaireResponses` map.

26. **AC#E5 — Empty-section handling**. If `showWhen` rules hide ALL questions in a section, the wizard auto-skips that step (does not show an empty page). `WizardStepIndicator` greys out the skipped step.

27. **AC#E6 — Section title in step header**. Step 4-N's header reads `<section.title>` instead of generic "Questionnaire". Provides scent-of-information so users know what's coming.

28. **AC#E7 — URL state per section**. `?step=4` advances to the General section; `?step=6` jumps to Identity & Demographics. Combined with the `427a80d` URL-race fix, deep-linking + browser-back work correctly across all 11 steps.

29. **AC#E8 — Tests + e2e refresh**. Playwright spec exercises a full wizard walk across all 11 steps. Section-skipping `showWhen` rules tested. ~10-15 additional tests.

30. **AC#E9 — Step-4 stall ratio drops measurably post-deploy**. The success metric for Part E is Story 9-19's dashboard `Step 4 stall %` metric dropping from baseline ~63% to <30% within 7 days of deploy. If it doesn't, the redesign hasn't worked and we re-open.

## Tasks / Subtasks

- [ ] **Task 1: Pre-impl decision confirmation (AC: #C3)** — BLOCKER
  - [ ] 1.1: Get Awwal's explicit confirmation on AC#C3 (auth-choice retirement). Document the decision in this story file's Dev Notes "Pre-impl Decision Log" subsection before proceeding to Task 2.
  - [ ] 1.2: If Awwal opts to KEEP the AuthChoiceFieldset, update AC#C1 + AC#C2 + AC#D2 to retain it. (Story stays internally consistent.)

- [ ] **Task 2: NIN moves to Step 1 (AC: #A1, #A2, #A3, #A4, #A5)**
  - [ ] 2.1: Add NIN input + `NinHelpHint` + `PendingNinToggle` to `Step1BasicInfo.tsx` mirroring the markup at [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:115-159].
  - [ ] 2.2: Add the `ninStatus` state machine (incomplete / valid / invalid) using `modulus11Check` from `@oslsr/utils/src/validation`.
  - [ ] 2.3: Wire `useNinCheck` hook ([Source: apps/web/src/features/forms/hooks/useNinCheck.ts]) for live duplicate detection. Render duplicate-block UI on FR21 error mirroring `CompleteNinPage` pattern.
  - [ ] 2.4: Gate the Continue button per AC#A3 (NIN-valid OR pending-pressed) PLUS existing Step 1 validations.
  - [ ] 2.5: Wire pending-toggle press → NIN field disabled + consequence card visible.
  - [ ] 2.6: Wire `NinHelpHint` inline link → `mergeFields({ pendingNinToggle: true })`.
  - [ ] 2.7: Verify `useWizardDraft` correctly persists `nin` + `pendingNinToggle` via the existing debounced autosave (no hook changes required; just confirm at impl time).

- [ ] **Task 3: Step 4 questionnaire auto-fills NIN (AC: #B1, #B2, #B3, #B4, #B5)**
  - [ ] 3.1: Extend `wizard-provided-field-names.ts` (created by 9-17) with the `nin: ['nin', 'national_id']` key.
  - [ ] 3.2: Delete `apps/web/src/features/registration/lib/nin-question-names.ts`. Migrate the two import sites (`FormFillerPage.tsx`, `ClerkDataEntryPage.tsx`) to import the NIN aliases from the dedup module — they only use it for `.includes()` checks so a simple destructure works.
  - [ ] 3.3: Extend the Step 4 schema-introspection useEffect at [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76] to auto-fill questionnaire NIN from `formData.nin` and add the question name(s) to `hideQuestionNames`.
  - [ ] 3.4: Extend the banner copy enumeration logic to include "NIN" when the NIN question was hidden.
  - [ ] 3.5: Delete `handlePendingNinTriggered` from `WizardPage.tsx` ([Source: apps/web/src/features/registration/pages/WizardPage.tsx:150-159]). Remove the `onPendingNinTriggered` prop from `Step4Props` interface. Stop passing it to FormRenderer (so the inline link disappears in wizard context; FormRenderer's existing `{isCurrentNin && onPendingNinClick && ...}` gate handles this transparently).

- [ ] **Task 4: Step 5 becomes Review-and-Save summary (AC: #C1, #C2, #C4, #C5)**
  - [ ] 4.1: Create `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` per AC#C1. Renders the summary card + Save button + Edit links.
  - [ ] 4.2: Wire the LGA-name resolution via the existing public LGA query (`useQuery(['public-lgas'], fetchPublicLgas)` — already in use by Step 2; reuse).
  - [ ] 4.3: Wire each Edit link to call `props.onGoToStep(targetStepIndex)`. The wizard's `goToStep` handler at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:131-141] is passed through.
  - [ ] 4.4: Wire Save button → `onSubmit` callback (the wizard's `handleSubmit` at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:161]). Set `authChoice: 'magic-link'` as a constant in the submit payload (the `WizardPage.tsx` submit handler is updated, not Step5ReviewAndSave).
  - [ ] 4.5: Delete `Step5NinAndAuth.tsx`, `Step5NinCaptured.tsx`, `Step5PendingNin.tsx`, `Step5NinInput.tsx`, and `Step5NinAndAuth.test.tsx`. Update `WizardPage.tsx` to import + render `Step5ReviewAndSave` instead of `Step5NinAndAuth`.
  - [ ] 4.6: Update `RegistrationCompletePage.tsx` with the magic-link confirmation copy per AC#C4. Extend `CompletionData` interface with `email`.
  - [ ] 4.7: Verify the submit payload shape per AC#C5 (no backend code change; just confirm wizard frontend always sends `authChoice: 'magic-link'`).

- [ ] **Task 5: Tests (AC: #D1, #D2, #D3, #D4, #D5, #D6)**
  - [ ] 5.1: Extend `Step1BasicInfo.test.tsx` with the 8 cases in AC#D1.
  - [ ] 5.2: Create `Step5ReviewAndSave.test.tsx` with the 8 cases in AC#D2.
  - [ ] 5.3: Confirm `Step5NinAndAuth.test.tsx` is DELETED (was 9 tests). Document the count in Dev Agent Record.
  - [ ] 5.4: Extend `Step4Questionnaire.test.tsx` with the 3 NIN dedup cases in AC#D4.
  - [ ] 5.5: Update `e2e/wizard-registration.spec.ts` + `e2e/nin-validation.spec.ts` per AC#D5.
  - [ ] 5.6: Run the full registration-feature test suite + Playwright. Confirm no regressions per AC#D6. Document test-count delta in Dev Agent Record.

- [ ] **Task 6: Documentation + sprint-status update**
  - [ ] 6.1: Update `_bmad-output/implementation-artifacts/sprint-status.yaml` flip 9-18 from `ready-for-dev` → `in-progress` at dev start, → `review` at dev end.
  - [ ] 6.2: Update Story 9-12's status to add a note: "Step 5 state-aware dispatcher superseded by 9-18; the `bea7545` hotfix kept production correct in the gap." (Story 9-12 doesn't get re-opened — just a footnote so future readers trace the supersession.)
  - [ ] 6.3: Update memory files if applicable (CLAUDE.md, MEMORY.md).

- [ ] **Task 7: Pre-merge review (BMAD code-review workflow on uncommitted tree)**
  - [ ] 7.1: Per project feedback "review-before-commit": run the canonical `/bmad:bmm:workflows:code-review` workflow on the uncommitted working tree before any push. Auto-fix findings per the established Story 9-12 / 9-17 pattern.
  - [ ] 7.2: Verify Modulus-11 is enforced exactly ONCE in the new design (Step 1 entry-time validation). No duplicate validation hooks. Grep for `modulus11Check` calls before / after — the count should drop from 3 (Step5NinAndAuth.tsx readQuestionnaireNin + Step5NinInput.tsx ninStatus + WizardPage.tsx readQuestionnaireNin) to 1 (Step1BasicInfo.tsx ninStatus).

## Dev Notes

### Step structure change — Awwal's verbatim proposal

Captured 2026-05-12 during local UAT after Story 9-12 shipped to production (commits `aa621ce` + `b537663` 2026-05-11 + `427a80d` URL-race regression fix 2026-05-12 + `bea7545` Modulus-11-in-State-A + State-B-undo hotfix 2026-05-12):

> *"Also, I have issues with the last step of the wizard as it is not picking the NIN filled in the Questionnaire form. As it still says You can add your NIN later. We'll email you a one-click link to finish. Perhaps rather than make the NIN the last step of the wizard, why dont we just add it to step 1 or 2 and the 5th step would be the message as it is about Email and the other things and/or if the steps are done successful a success message is added and message about sending and email of the magic link for editing/redacting consent purposes and a summary of what was filled. Thus, if all steps have been filled correctly the button on step 5 should read Save. Also the verification of the NIN using the modulus function is not incorporated in the wizard process (or was it used)."*

This story preserves that proposal verbatim. **Do NOT relocate NIN back to Step 5.** The entire premise is single-place NIN capture eliminating the State A/B/C dispatcher.

### Today's wizard (before 9-18)

| Step | Content | NIN handling |
|---|---|---|
| 1 | Identity basics: full name, DOB, gender | — |
| 2 | Contact + LGA: phone, email, lga | — |
| 3 | Consent: marketplace + enriched | — |
| 4 | Questionnaire (rendered survey) | NIN-in-questionnaire optional (via NIN question) |
| 5 | NIN + auth | State-aware dispatcher A/B/C per [Source: apps/web/src/features/registration/pages/Step5NinAndAuth.tsx:32-47] |

### After 9-18

| Step | Content | NIN handling |
|---|---|---|
| 1 | Identity basics + NIN | NIN captured here (Modulus-11 + useNinCheck + pending toggle) |
| 2 | Contact + LGA: phone, email, lga | — |
| 3 | Consent: marketplace + enriched | — |
| 4 | Questionnaire | NIN auto-filled from Step 1 + hidden (9-17 Pattern C extended) |
| 5 | Review-and-Save summary | NIN displayed in summary card (or "Pending" badge); Save button |

### Why this beats today's design

1. **Eliminates the State A/B/C dispatcher entirely.** Today's three states exist only because NIN handling was deferred until Step 5. With Step-1 capture, there's ONE canonical store (`formData.nin`), ONE validation pass (Modulus-11 + duplicate check at Step 1 entry), ONE recovery surface (the pending toggle next to the field). The ~50 lines of `deriveStep5State` + `readQuestionnaireNin` + the three Step 5 sub-page components collapse to a single `Step5ReviewAndSave` page.

2. **NIN dedup follows the EXACT same Pattern C as the other identity fields** (added by 9-17). No special-casing. Step 4 auto-fills from wizard data; hides from FormRenderer iteration via the `hideQuestionNames` Set. Same code path for name / phone / email / DOB / NIN.

3. **Single Modulus-11 enforcement point.** Today's Modulus-11 fires in State C (Step5NinInput.tsx:88) and — post-hotfix `bea7545` — in State A's extractor (Step5NinAndAuth.tsx:55 + WizardPage.tsx:402). After 9-18: one validation hook at Step 1. The hotfix becomes redundant (and gets deleted as part of Task 4.5's Step 5 sub-page removal — the duplicated `readQuestionnaireNin` in WizardPage.tsx is also deleted).

4. **Step 5 "Save Registration" + summary card is genuinely intuitive UX.** Today's Step 5 has three different submit-label states (Submit Registration / Save as Pending / [State C variants]). After 9-18, Step 5 always shows "Save Registration" (or "Save as Pending" if pending). The summary card lets the user verify before committing — a confidence-building review screen rather than a configuration screen.

5. **Magic-link becomes a post-save confirmation, not a pre-submit choice.** Today the user picks `magic-link` / `password` / `skip` on Step 5 BEFORE seeing the submission outcome. After 9-18, magic-link is the default delivery channel for the post-registration "view / edit / withdraw" link. Users who want password access can set one from the post-login Profile page (existing UX surface — no new work).

### Trade-off (don't pretend it doesn't exist)

**Pro 9-12 today**: Front-loading identity (Steps 1-3) before NIN (Step 5) had a theoretical "psychological commitment" effect — users invested in the wizard before facing the sensitive ID ask. Abandonment risk after Step 5 was assumed lower because of sunk-cost completion bias.

**9-18 counter**: With NIN moved to Step 1, users who don't have NIN handy can immediately press the pending-NIN toggle and proceed. The wizard never gates on NIN existence — only on user choice. So abandonment risk is bounded by the pending-NIN affordance being visible and friendly at Step 1, not by step ordering. AC#A4 + AC#A5 require the toggle + inline link to be visible directly alongside the NIN field on Step 1. Validate with Awwal UAT before story sign-off.

If abandonment metrics post-launch indicate Step 1 NIN gating IS causing dropouts, the recovery path is to add a "Skip for now" button on Step 1 that auto-presses the pending toggle — a one-line UX change.

### Supersession of hotfix commit `bea7545` (CRITICAL — do NOT revert before 9-18 ships)

Commit `bea7545` (2026-05-12) shipped two changes that are STRUCTURALLY superseded by 9-18:

1. **Modulus-11 wired into `readQuestionnaireNin`** in both `Step5NinAndAuth.tsx:55` AND the duplicate in `WizardPage.tsx:396-407`. After 9-18, both functions are DELETED (Step5NinAndAuth.tsx file gone per AC#C2; WizardPage.tsx duplicate removed per Task 4.5). The Modulus-11 enforcement migrates to the single Step 1 validation hook per Task 2.2.

2. **State B undo-pending button** on `Step5PendingNin.tsx`. After 9-18, Step5PendingNin.tsx is DELETED per AC#C2. The pending-toggle on Step 1 already supports undo (just press the toggle again to flip it back) so no replacement is needed — the affordance is native to the toggle pattern.

**Do NOT revert `bea7545` before 9-18 ships.** The hotfix is the bridge keeping production correct between 2026-05-12 and the 9-18 release date. The supersession is documented here so the dev agent doesn't get confused when AC#C2 deletes "code that was just hotfixed two days ago" — it's intentional.

### Pre-impl Decision Log

| Decision | Status | Default | Confirmer | Notes |
|---|---|---|---|---|
| AC#C3: Retire `magic-link` / `password` / `skip` auth-choice radio set | **PENDING** | Retire (default) | Awwal | Per his 2026-05-12 verbatim *"the 5th step would be the message"*. Alternative: keep `AuthChoiceFieldset` on Step 5 alongside summary. |
| AC#B2: Delete `nin-question-names.ts` (consolidate into dedup map) | Default OK | Delete | Auto | Project "no technical debt" discipline. Two import sites migrate via the dedup module re-export. |
| AC#B4: Gate FormRenderer inline link via existing prop (not new gate prop) | Default OK | Gate via existing `onPendingNinClick` prop | Auto | Already gated at FormRenderer.tsx:281 — wizard just stops passing the prop. |
| AC#A4: NIN value retained when pending toggle ON (not cleared) | Default OK | Retain | Auto | Matches Story 9-12 Dev Notes "State C contract preserves the value". |

**Task 1.1 blocks all other tasks until Awwal confirms AC#C3.**

### Forward-compat with 9-17 — extension contract honored

The 9-17 forward-compat addendum at [Source: _bmad-output/implementation-artifacts/9-17-wizard-form-pin-ui-and-field-dedup.md § "Forward-compat with proposed Story 9-18"] documented these contracts. 9-18 honors all of them:

1. ✅ **`WIZARD_PROVIDED_FIELD_NAMES` open for additions** — AC#B1 adds `nin` key (no closed type union violated).
2. ✅ **`FormRenderer.hideQuestionNames` as canonical extension point** — AC#B3 adds NIN names to the same Set; no FormRenderer source change.
3. ✅ **Banner copy reads generically** — AC#B3 extends the field-agnostic enumeration logic; no step-number hardcoding.
4. ✅ **Collision-detector test polarity flips consciously** — AC#B1 explicitly documents the flip from "NIN NOT in map" → "NIN IN map" + updates the test assertion.
5. ✅ **Part A of 9-17 (form-pin UI) is orthogonal — unaffected by 9-18** — 9-18 doesn't touch Q.M. page or Settings landing mirror card.

### Dependencies

- **Story 9-12** (HARD) — provides the wizard skeleton (`WizardPage`, `useWizardDraft`, `Step1`-`Step4` components), public form discovery (`fetchPublicActiveForm`, `getPublicActiveForm`, `wizard.public_form_id` setting), magic-link service (`magic-link.service.ts`), pending-NIN respondent status (`pending_nin_capture`), `RegistrationCompletePage`, draft persistence schema, and URL-race fix from `427a80d`. 9-18 evolves Steps 1/4/5 but does NOT rewrite the foundation.

- **Story 9-17** (HARD) — provides `WIZARD_PROVIDED_FIELD_NAMES` map + `FormRenderer.hideQuestionNames` prop + Step 4 introspection extension + banner UX pattern. 9-18 cannot ship before 9-17 because Part B of this story directly extends 9-17 Part B's machinery. The 9-17 forward-compat addendum encodes the extension contract; 9-18 honors it.

- **Story 9-12 hotfix commit `bea7545`** — Modulus-11 in State A + State B undo. Currently in production. SUPERSEDED by 9-18's dispatcher elimination (the entire Step5NinAndAuth file is deleted) — but the hotfix stays in place until 9-18 ships, since it's the only line of defense against the State-B-stuck-at-true bug in the meantime.

- **Story 3-7** — global NIN uniqueness enforcement via `respondents.nin` unique index + the FR21 duplicate-NIN error code. Unchanged; reused by `useNinCheck` at Step 1.

- **Story 6-1** — audit hash chain. Used transitively by `wizard.public_form_id` settings PATCH (9-17). Not directly touched by 9-18.

### Risks

1. **Pending-NIN at Step 1 visibility-vs-friction balance.** If the NIN field is the first thing users see and the pending option isn't surfaced clearly enough, abandonment risk goes up. Mitigation: AC#A4 + AC#A5 require the toggle + the inline link to be visible directly alongside the NIN field. Visual ordering: NIN input first → `NinHelpHint` (with "I don't have my NIN now" link visible) → `PendingNinToggle` switch → consequence card (visible only when pressed). Validate with Awwal UAT before sign-off.

2. **`useNinCheck` calls a public endpoint per Step 1 keystroke.** Today this hook only fires on `FormFillerPage` (clerk-data-entry context, authenticated). Putting it on Step 1 of the public wizard means an UNAUTHENTICATED endpoint ping per keystroke. Risks: rate-limit pressure on the underlying `/respondents/check-nin` (or equivalent) endpoint + DoS surface from anonymous probing. Mitigations:
   - The existing `useNinCheck` debounce should bound the rate to ~1 call per 500ms regardless of typing speed.
   - Check `apps/api/src/routes/respondents.routes.ts` for the current rate-limit posture on the check-NIN endpoint — if it's authenticated-only today, expose an unauthenticated variant with a stricter per-IP rate limit (~30 req/min/IP).
   - Confirm with a Redis-store rate limiter, same pattern as `magic-link-rate-limit.ts` from Story 9-12.
   - Dev agent investigates at impl time and either confirms the existing limit is sufficient OR adds a new public-friendlier endpoint as part of Task 2.3.

3. **AC#C3 (auth-choice retirement) is a Story 9-12 AC#5 behavior change.** The current AC#5 of 9-12 explicitly supports magic-link / password / skip choice. Retiring this is a conscious deletion of supported behavior. Awwal pre-impl confirms before Task 2 starts (per Task 1.1 BLOCKER).

4. **Backend `submitWizard` payload may have implicit assumptions about `authChoice`.** AC#C5 asserts no schema change. Dev agent grep-verifies at impl time that the controller doesn't have a hidden branch on `authChoice === 'password'` or `authChoice === 'skip'` that would silently no-op when the wizard always sends `'magic-link'`. The existing code already handles `'magic-link'` as default per [Source: apps/web/src/features/registration/pages/WizardPage.tsx:202-208] which fires the magic-link as best-effort after submit; the backend treats this as additive, not as a required step.

5. **`mergeFields` race re-introduction.** Step 1 today writes name/DOB/gender; after 9-18 it ALSO writes NIN + `pendingNinToggle`. Multiple fields change in close succession at Step 1 entry. Verify no race re-introduction by:
   - Calling `mergeFields` ONCE per Step 1 form-submit (the existing pattern), not per-field-change.
   - Live-validation hooks (`useNinCheck`, `modulus11Check`) read from local component state, not from `formData` directly, until the user clicks Continue.
   - The 9-12 URL-race lesson via commit `427a80d` is still load-bearing — re-read `WizardPage.tsx`'s URL-state-sync useEffects before touching any wizard step.

6. **Test count delta sanity check.** Expected: -9 (Step5NinAndAuth.test.tsx deleted) + ~14 added (Step1 NIN tests + Step5ReviewAndSave tests + Step4 NIN dedup test) = net +5. If the delta in either direction is >10, scope/coverage drift — flag in Dev Agent Record and pause for review.

7. **Form authors might already include NIN questions in their questionnaires for audit-trail purposes.** Today's wizard treats questionnaire-NIN as a valid capture path. After 9-18, NIN is always pre-filled from Step 1; questionnaire NIN questions become read-only (auto-filled + hidden). Confirm with Awwal: are questionnaire authors expected to STOP including NIN questions, or will they continue including them as an audit-trail (with the wizard auto-filling them)? Default assumption: latter — continue including, auto-fill behavior is transparent. AC#B3 handles this.

8. **Edit-link affordance on Step 5 summary card (AC#C1) could re-introduce the URL-race bug.** Each Edit link calls `goToStep`. The wizard's URL-state-sync useEffects need to handle programmatic step transitions correctly. The `427a80d` regression-test suite at `WizardPage.test.tsx` covers the URL ↔ state race for Continue / Back navigation — extending it for Edit-link navigation per AC#D6 is required.

9. **Cosmetic: the NIN format on the Step 5 summary card.** AC#C1 says `formData.nin` is displayed as `XXXXX-XXXXX-X` (a common Nigerian NIN display format). Confirm this matches the format Awwal uses elsewhere in the platform (e.g., respondent profile, ID card). If a different format is used, harmonize before impl. Dev agent grep-verifies `nin` display formatting across the codebase at impl time.

## File List

(Populated by dev agent at implementation time.)
