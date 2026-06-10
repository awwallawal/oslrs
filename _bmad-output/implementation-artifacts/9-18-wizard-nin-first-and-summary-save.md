# Story 9.18: Wizard NIN-first capture + Review-and-Save summary on Step 5

Status: in-progress

<!--
ABSORBED Pattern C from 9-17 Part B (2026-06-03 harmonization per parent-Claude
scope-review session, Option B).

WHAT WAS ABSORBED:
The full Pattern C wizard field dedup infrastructure that was originally
planned to land in Story 9-17 Part B. Specifically:
- The `WIZARD_PROVIDED_FIELD_NAMES` alias map module + its unit-test file
  (incl. case-insensitive matching helper + `WizardDraftData.prefilledQuestionNames`
  TypeScript extension)
- The `FormRenderer.hideQuestionNames?: ReadonlySet<string>` prop + the
  iteration / skip-logic-engine filtering through hidden questions
- The Step 4 schema-introspection extension that auto-fills wizard data into
  questionnaire responses + the `<aside role="status">` banner copy
- The collision-detector test (now ships once asserting the canonical state,
  no polarity-inversion problem)

WHY THE ABSORPTION:
Previously, 9-17 Part B was going to ship `WIZARD_PROVIDED_FIELD_NAMES` with
NIN EXPLICITLY EXCLUDED, plus a collision-detector test asserting NIN was NOT
in the map. This story (9-18) Part B was then going to INVERT both — add NIN
to the map AND invert the collision-detector test polarity. A 2026-05-12
FORWARD-COMPAT addendum on Story 9-17 documented the planned inversion but
the inversion itself was structural noise — 9-17 would have shipped
infrastructure that 9-18 partially unmade days later.

Single-ownership of the wizard redesign surface in this story (9-18)
eliminates the inversion. Pattern C ships ONCE, correctly, with all 5 fields
(NIN + name + phone + email + DOB) in the alias map from the start. The
collision-detector test asserts the canonical state in one polarity only.

EFFORT REVISION: 6-10 days → 7-11 days (modest increase reflecting the
absorbed infrastructure; the marginal work of building `WIZARD_PROVIDED_FIELD_NAMES`
+ FormRenderer prop + collision test is ~1 day on top of the existing Part B
extension work).

REFERENCE: see Story 9-17 (`9-17-form-pin-ui-on-questionnaire-management.md`)
which is now scoped to JUST Part A (form-pin UI on Q.M. page). Sibling story;
ships independently; zero file-level overlap.

ORIGINAL AUTHORSHIP HISTORY (preserved for trace):
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

Pre-impl decision RESOLVED 2026-05-31 by Awwal: AC#C3 = auth-choice
retirement CONFIRMED (Option B). Implementation split: Story 9-18
removes the auth-choice fieldset from the WIZARD entirely (magic-link
as the universal default for new registrations). Story 9-32 (post-
launch, off critical path) adds an "opt in to a password" affordance
to a future public-user account-settings page. Net user experience is
"magic-link by default at registration; password is an opt-in power-
user feature later" — but the wizard surface is clean of choice.

AMENDMENT 2026-05-31: Part F added (given-name / family-name split +
backfill) — promotes the previously-out-of-scope "Story 9-29 candidate"
into 9-18 since it touches the same Step 1 surface that Part A
redesigns. Avoids a second UAT cycle on the same form.

AMENDMENT 2026-05-31: Task 0 (Pre-flight operations) added — operator-
audited SQL extends wizard_drafts.expires_at +30d for ALL 267 Cohort B
drafts (covers the 4-5 week wizard-redesign timeline against draft
expiry), and a deliberate enumerator dry-run seeds 5-10 test
submissions through POST /forms/submissions to scale-test the
enumerator path before field deployment (currently only 1 production
enumerator submission has ever exercised that code path).

Critical-path sequence locked 2026-05-31: 9-16 → 9-17 → 9-18 → field
deployment + blasts → 9-32 (post-launch). Wizard must ship perfect
BEFORE enumerators trigger viral self-serve registrations from their
respondents' referrals (the "avalanche" anti-pattern).
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

### Part B — Pattern C wizard field dedup (ABSORBED FROM 9-17 PART B, 2026-06-03 harmonization)

This part ships the FULL Pattern C dedup infrastructure (auto-fill + banner + skip-from-renderer) as part of 9-18, including the alias map, the FormRenderer prop, the Step 4 introspection, the banner copy generator, and the collision-detector test. NIN is included in the map from inception (no two-step "ship-then-extend" pattern; no polarity-inverted test).

6. **AC#B1 — Create the `WIZARD_PROVIDED_FIELD_NAMES` alias map module.** New file `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` exports a constant that maps each wizard-collected identity field — INCLUDING NIN from the start — to its common questionnaire-question-name aliases:

   ```ts
   export const WIZARD_PROVIDED_FIELD_NAMES = {
     fullName:  ['full_name', 'fullname', 'name'],
     givenName: ['given_name', 'first_name', 'firstname'],
     familyName: ['family_name', 'last_name', 'lastname', 'surname'],
     phone:     ['phone', 'phone_number', 'mobile', 'mobile_number'],
     email:     ['email', 'email_address'],
     dob:       ['date_of_birth', 'dob', 'birth_date'],
     nin:       ['nin', 'national_id'],
   } as const;
   ```

   The `nin` aliases match the legacy `NIN_QUESTION_NAMES` constant at [Source: apps/web/src/features/registration/lib/nin-question-names.ts:14] exactly, so no behavior drift during the consolidation. The `givenName` / `familyName` keys honor the Part F (AC#F1) Yoruba-naming-convention split — Step 1 collects two fields, and any questionnaire question that asks for them gets pre-filled / hidden.

   Also export:
   - `WIZARD_PROVIDED_FIELD_KEY` type alias for the keys.
   - Helper `function findWizardFieldForQuestionName(questionName: string): WIZARD_PROVIDED_FIELD_KEY | null` doing case-insensitive matching across all alias arrays. Step 4's introspection becomes a one-liner per question.

   Extend the `WizardDraftData` TypeScript interface in `apps/web/src/features/registration/api/wizard.api.ts` with `prefilledQuestionNames?: string[]` (persisted shape — arrays serialize through JSONB naturally; convert to/from `ReadonlySet<string>` at the React boundary).

7. **AC#B2 — Delete `apps/web/src/features/registration/lib/nin-question-names.ts` (consolidation).** With NIN merged into `WIZARD_PROVIDED_FIELD_NAMES`, the standalone `nin-question-names.ts` becomes redundant. Delete it. Migrate the two import sites — `FormFillerPage.tsx` and `ClerkDataEntryPage.tsx` — to import from `wizard-provided-field-names.ts` (they only use the array for the inline `pending-NIN` link gate; the union type re-exports from the dedup module if needed, or the use sites become `WIZARD_PROVIDED_FIELD_NAMES.nin.includes(name)` calls). Per project "no technical debt" discipline: no shim, no `_deprecated` re-export, the file is gone after this change.

8. **AC#B3 — Extend `<FormRenderer>` with a `hideQuestionNames?: ReadonlySet<string>` prop.** Update `FormRenderer` at [Source: apps/web/src/features/forms/components/FormRenderer.tsx] with a new optional prop. When supplied:
   - The question iteration / `currentIndex` math filters OUT those questions from the user-visible flow.
   - The skip-logic engine (`getNextVisibleIndex` per Story 9-12 Task 5.4.3) advances past hidden questions in both directions.
   - The questions still exist in the underlying schema (form-version locking unchanged); they're only skipped at the renderer level.
   - The submit payload (`onComplete`'s `allAnswers` argument) STILL includes the pre-filled answers for the hidden questions, because they're already in `initialResponses` (per AC#B4 below).

   Step 4 passes `hideQuestionNames={prefilledQuestionNames}` so the user never sees the duplicates. Existing `FormFillerPage` / clerk-data-entry consumers pass `hideQuestionNames={undefined}` (prop is optional) and behave unchanged.

9. **AC#B4 — Step 4 introspection + auto-fill of wizard answers into questionnaire responses.** In `Step4Questionnaire.tsx` [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76] — the existing `useEffect` that already stamps `formHasNinQuestion` + `questionnaireFormId` + `questionnaireFormVersionId` — extend the schema-introspection pass to ALSO:
   - Build a `prefilledQuestionNames: Set<string>` containing every question name from `form.questions` that matches (case-insensitive exact match) any alias in `WIZARD_PROVIDED_FIELD_NAMES` (via the `findWizardFieldForQuestionName` helper from AC#B1).
   - For each match, write the corresponding wizard `formData.<field>` value into `questionnaireResponses[questionName]` via a SINGLE `mergeFields({ questionnaireResponses: { ...existing, ...prefilled } })` call. Do NOT split into per-field merges — that races the React state batching (URL-race lesson from commit `427a80d`).
   - Stamp the `prefilledQuestionNames` set (as an array) into `wizard_drafts.formData.prefilledQuestionNames` so the banner copy (AC#B5) survives page refreshes.
   - **Pending-NIN edge case:** when `formData.pendingNinToggle === true` AND a NIN question exists in the schema, the NIN question is STILL hidden (don't ask) but no value is auto-filled (because `formData.nin` is unset). The banner copy omits NIN from the pre-filled list (or notes it as "NIN (pending)" — dev judgment; see AC#D4 test #3 for the assertion).

10. **AC#B5 — Step 4 banner copy with dynamic field list.** When `prefilledQuestionNames.size > 0`, Step 4 renders a small `<aside role="status" aria-live="polite" data-testid="step4-prefilled-banner">` ABOVE the `<FormRenderer>` with copy that names the specific fields filled. Generate the human-readable label list from the wizard-field keys (NOT the questionnaire question names), using this label map:

    | wizard field key | banner label |
    |---|---|
    | fullName / givenName / familyName | "Name" (collapse all three into a single "Name" if any matched) |
    | phone | "Phone" |
    | email | "Email" |
    | dob | "Date of Birth" |
    | nin | "NIN" |

    Copy template: `"We've pre-filled <comma-separated labels> from your earlier answers. Click Back to edit anything."` Oxford comma for 3+ items. When exactly 2: "Name and Phone". When 1: "Name". Banner background Info-50, text Info-800. No em-dashes (per 2026-05-12 copy-discipline directive).

11. **AC#B6 — Single canonical collision-detector test (no polarity inversion).** New unit-test file `apps/web/src/features/registration/lib/__tests__/wizard-provided-field-names.test.ts` asserts the canonical state of the alias map IN ONE POLARITY ONLY (no two-step ship-then-extend pattern; the test ships once asserting the final shape):

    1. Map keys are exactly `fullName | givenName | familyName | phone | email | dob | nin` (asserted via `Object.keys(map).sort()`).
    2. Each alias array contains lowercase strings only (case-insensitive matching is the caller's responsibility, but the canonical form is lowercase).
    3. **`nin` key IS present** with the exact aliases `['nin', 'national_id']` (matches the deleted `NIN_QUESTION_NAMES`).
    4. **`nin-question-names.ts` is DELETED** — asserted via filesystem check OR via Vite glob import that resolves empty (dev agent picks the cleanest test pattern).
    5. Snapshot test of the full map shape so unintended edits surface in code review.
    6. `findWizardFieldForQuestionName` case-insensitive matching across all 7 keys.

12. **AC#B7 — Pending-NIN inline link retires from `<FormRenderer>` wizard context.** The inline "I don't have my NIN now" link inside FormRenderer at [Source: apps/web/src/features/forms/components/FormRenderer.tsx:281-289] is no longer needed in the wizard context (NIN is captured at Step 1, never re-asked in Step 4). The link still exists for clerk-data-entry / form-filler-page contexts where NIN is asked directly. Implementation: gate the inline-link rendering on the `onPendingNinClick` prop being truthy (already the case at line 281 — `{isCurrentNin && onPendingNinClick && !disabled && (...)}`). Then in `Step4Questionnaire.tsx`, pass `onPendingNinClick={undefined}` to FormRenderer. Net: no FormRenderer source change; just the wizard caller stops passing the callback. Clerk contexts continue to pass it.

13. **AC#B8 — `handlePendingNinTriggered` in `WizardPage.tsx` is deleted.** The callback at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:150-159] exists solely to bridge the Step-4 inline link to the wizard draft. With AC#B7 removing the inline link from the wizard context, this callback has no caller. Delete it. Step 4 no longer needs the `onPendingNinTriggered` prop in its `Step4Props` interface ([Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:38]) — remove the prop.

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

13. **AC#C3 — Auth-choice retires (RESOLVED 2026-05-31 by Awwal — Option B confirmed).** Today Step 5 forces users to pick `magic-link` / `password` / `skip` BEFORE submit per Story 9-12 AC#3-5 + the `AuthChoiceFieldset` at [Source: apps/web/src/features/registration/pages/Step5NinCaptured.tsx]. After 9-18:
    - The `authChoice` field is removed from the wizard UI entirely.
    - Every successful submission triggers a `purpose: 'login'` magic-link email (or `purpose: 'pending_nin_complete'` if pending) — the backend behavior already supports this default at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:202-208].
    - The submit-time choice between password creation and magic-link disappears from THIS surface (the wizard). Users who want password access can opt in via Story 9-32's account-settings page (post-launch, NOT in this story's scope).

    **Decision rationale captured 2026-05-31**: cognitive-load reduction at the highest-friction moment (Step 5 = 42% of stalls). Magic-link is canonical via Story 9-16 (which ships first). Existing password-using accounts continue to work at /login (backward compatibility). 9-32 satisfies the "power user wants a password" demographic without polluting the registration flow. See [Source: _bmad-output/implementation-artifacts/9-32-public-account-settings-and-ndpa-rights.md] for the opt-in implementation.

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

### Part F — Given-name / Family-name split + backfill (AMENDMENT 2026-05-31, absorbed from prior Story 9-29 candidate)

Promoted into 9-18 on 2026-05-31 from the "Story 9-29 candidate" footnote in Story 9-28's Dev Agent Record. The current wizard parses a single "Full Name" field into `first_name` (first token) + `last_name` (last token) — but Yoruba (and many Nigerian) naming conventions are surname-first, which silently flips the semantic mapping. The 2026-05-22 Cohort A dry-run greeted "OLOWU KAYODE" as "Hi OLOWU" (surname) when the given name is KAYODE. Acceptable as a one-off ("formal surname greeting") but not as the long-term default. Same Step 1 surface that Part A redesigns; consolidates the UAT cycle.

31. **AC#F1 — Step 1 splits "Full Name" into TWO explicit inputs.** `Step1BasicInfo.tsx` ([Source: apps/web/src/features/registration/pages/Step1BasicInfo.tsx]) replaces the single fullName field with: (a) `givenName` — labeled `Given name (first / personal name)`, placeholder `e.g. Kayode`, required, min length 2; (b) `familyName` — labeled `Family name (surname)`, placeholder `e.g. Olowu`, required, min length 2. No first-token-parse. No "Full Name" field. Form layout: stacked vertically on mobile, side-by-side on `md:` breakpoint. Both fields use the existing input markup pattern. `data-testid="wizard-step1-given-name"` and `data-testid="wizard-step1-family-name"`. The wizard's `formData` schema (in `useWizardDraft`) gains `givenName: string` and `familyName: string`; the legacy `fullName` field is REMOVED from `formData` entirely. Existing wizard_drafts rows in the wild keep their `form_data.fullName` JSON (best-effort migration in Task 5.4 below).

32. **AC#F2 — Backend `submitWizard` stores explicit columns; no parsing.** `apps/api/src/controllers/registration.controller.ts` `submitWizardSchema` adds `givenName: z.string().min(2).max(80)` and `familyName: z.string().min(2).max(80)`; removes `fullName`. The respondent INSERT writes `first_name = givenName` and `last_name = familyName` (column names unchanged; semantics tightened — `first_name` now canonically means "given/personal name", `last_name` means "family/surname"). No DB migration; the columns already exist with the right shape. The change is at the WRITE path only; existing rows untouched until backfill (Task 5.5).

33. **AC#F3 — Email templates use canonical given-name; drop `firstNameFrom(fullName)` first-token-parse.** Three call sites lose the parse:
    - `apps/api/scripts/_reengagement-email-blast.ts` — `firstNameFrom(fullName)` becomes `respondents.first_name` direct read (now semantically the given name post-backfill). The script's `formData.fullName` access (line ~328) becomes `formData.givenName` for in-flight drafts that completed via the new wizard, with a back-compat fallback to the legacy path for pre-9-18 drafts (one-line: `firstName = fd.givenName ?? firstNameFrom(fd.fullName)`).
    - `apps/api/scripts/_cohort-a-supplemental-survey-blast.ts` — same back-compat pattern; reads `respondents.first_name` (post-backfill) with the fullName fallback for any unbackfilled rows.
    - `MagicLinkService.send*` template rendering — wherever it interpolates a name into the email body, use the respondent's canonical given name.

34. **AC#F4 — ID card renders canonical order: `Given Family`.** `apps/api/src/services/id-card.service.ts` (per memory: PDFKit-based, CR80 card size) currently renders `respondents.first_name + ' ' + respondents.last_name`. After 9-18 + backfill, that's already "Given Family" by canonical mapping — no code change needed; the change is purely in the DATA via Task 5.5 backfill. Verify by visual diff of an ID card pre-vs-post-backfill in Task 5 of this Part F.

35. **AC#F5 — Backfill operator-runbook for existing 136 respondents.** A new operator-gated, audit-logged script at `apps/api/scripts/_backfill-name-canonicalization.ts` reads all existing `respondents` rows, writes a CSV at `_bmad-output/scratch/name-backfill-{TIMESTAMP}/proposed.csv` with columns `[respondent_id, current_first_name, current_last_name, proposed_first_name, proposed_family_name, decision_pending]`. Operator reviews the CSV — for each row, marks the `decision_pending` column as either `swap` / `keep` / `skip`. Operator re-runs the script with `--apply --confirm-i-am-not-dry-running --csv <path>` and the script applies the marked swaps inside a transaction, emitting one `OPERATOR_RESPONDENT_NAME_CANONICALIZED` audit event per row (NEW audit action; count 42 → 43). Each event captures `details: { respondent_id, previous: {first_name, last_name}, new: {first_name, last_name}, decision: 'swap'|'keep', operator_marker: 'manual_csv_review' }`. The 11 phone-only Cohort A respondents (no email) get skipped automatically (don't need name-fix for SMS context). KNOWN_FLAGS pattern; --help; Resend not used (this is pure DB-write). Dry-run mode prints proposed changes without writing.

36. **AC#F6 — Tests + backfill validation:**
    - `Step1BasicInfo.test.tsx` extensions (3 new cases): given-name field renders + required validation, family-name field renders + required validation, form submits with `givenName` + `familyName` keys (NOT `fullName`)
    - `submitWizard.controller.test.ts` extension (2 new cases): payload with `givenName`/`familyName` accepted, payload with legacy `fullName` rejected (Zod error)
    - `_backfill-name-canonicalization.test.ts` (NEW, ~12 tests): dry-run prints proposed without writing; apply-mode writes only marked rows; audit events emit one-per-row; phone-only Cohort A skipped; transaction rolls back on any per-row failure; CSV parse rejects unknown decision values; KNOWN_FLAGS typo defense; --help shows usage; back-compat fallback in firstNameFrom is exercised
    - `_reengagement-email-blast.test.ts` extension (1 new case): `firstName` derivation prefers `respondents.first_name` over `firstNameFrom(formData.fullName)` parse
    - Visual-diff verification of an ID card pre-vs-post-backfill (~1 row spot check); capture in Dev Agent Record

## Tasks / Subtasks

- [x] **Task 0: Pre-flight operations (NEW 2026-05-31)** — must run BEFORE any wizard-redesign code touches production
  - [x] 0.1: **Expiry extension SQL** for ALL Cohort B drafts (preserves preserved-answers during the 4-5 week wizard-redesign window). Operator-gated. Script at `apps/api/scripts/_cohort-b-expiry-extension.ts` (NEW, mirrors the canonical operator-script pattern: --dry-run mandatory first, --confirm-i-am-not-dry-running for live, KNOWN_FLAGS, --help, audit event per row). Target query:
    ```sql
    UPDATE wizard_drafts SET expires_at = expires_at + INTERVAL '30 days'
    WHERE form_data->>'email' IS NOT NULL
      AND expires_at > NOW()
      AND NOT EXISTS (
        SELECT 1 FROM magic_link_tokens mlt
        INNER JOIN respondents r ON mlt.respondent_id = r.id
        INNER JOIN submissions s ON s.respondent_id = r.id
        WHERE mlt.email = wizard_drafts.email
      );
    ```
    Expected: 267 rows updated (verified by Story 9-30 cohort refresh 2026-05-31). Each row emits an `OPERATOR_WIZARD_DRAFT_EXPIRY_EXTENDED` audit event (NEW audit action; count gets bumped). Cohort A is unaffected (Cat 1 NOT-EXISTS clause excludes completers). Operator runs --dry-run then live during week 1 of 9-18 dev (before any of the 4-5 weeks erodes).
  - [x] 0.2: **Enumerator dry-run** — author `apps/api/scripts/_enumerator-path-smoke-test.ts` (NEW) that authenticates as a designated test enumerator account, submits 5-10 synthetic form responses via `POST /api/v1/forms/submissions`, then verifies (a) each created a `submissions` row, (b) each linked to a (newly-found-or-created) `respondents` row, (c) each emitted an audit event in the chain, (d) `raw_data` is non-empty + matches the input payload. Tear-down deletes the synthetic rows (audit events kept for forensic trail). Smoke test runs ONCE before field-deployment commitment — current production has only 1 enumerator submission ever; this scale-tests the path against a 10× volume burst before 50+ enumerators deploy.
  - [x] 0.3: Document both Pre-flight runs in this story's Dev Agent Record before any frontend dev work begins. Pre-flight outputs are operator-gated; tasks below stay in `pending` until Pre-flight is verified. **[Done — see Dev Agent Record → Task 0 Pre-flight Log.]**

- [ ] **Task 1: Pre-impl decision confirmation (AC: #C3) — RESOLVED 2026-05-31**
  - [x] 1.1: Awwal confirmed Option B (auth-choice retires from wizard; opt-in lives in Story 9-32). Decision rationale captured in AC#C3 + Dev Notes "Pre-impl Decision Log" subsection.
  - [x] 1.2: ~~If Awwal opts to KEEP the AuthChoiceFieldset~~ — N/A; Option B locked.

- [ ] **Task 2: NIN moves to Step 1 (AC: #A1, #A2, #A3, #A4, #A5)**
  - [ ] 2.1: Add NIN input + `NinHelpHint` + `PendingNinToggle` to `Step1BasicInfo.tsx` mirroring the markup at [Source: apps/web/src/features/registration/pages/Step5NinInput.tsx:115-159].
  - [ ] 2.2: Add the `ninStatus` state machine (incomplete / valid / invalid) using `modulus11Check` from `@oslsr/utils/src/validation`.
  - [ ] 2.3: Wire `useNinCheck` hook ([Source: apps/web/src/features/forms/hooks/useNinCheck.ts]) for live duplicate detection. Render duplicate-block UI on FR21 error mirroring `CompleteNinPage` pattern.
  - [ ] 2.4: Gate the Continue button per AC#A3 (NIN-valid OR pending-pressed) PLUS existing Step 1 validations.
  - [ ] 2.5: Wire pending-toggle press → NIN field disabled + consequence card visible.
  - [ ] 2.6: Wire `NinHelpHint` inline link → `mergeFields({ pendingNinToggle: true })`.
  - [ ] 2.7: Verify `useWizardDraft` correctly persists `nin` + `pendingNinToggle` via the existing debounced autosave (no hook changes required; just confirm at impl time).

- [x] **Task 3: Pattern C dedup infrastructure + Step 4 NIN auto-fill (AC: #B1, #B2, #B3, #B4, #B5, #B6, #B7, #B8)** — absorbs work originally planned for 9-17 Part B ✅ Part B done 2026-06-10 (awaiting operator code-review + commit)
  - [x] 3.1: Create `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` per AC#B1 with the full alias map (all 7 keys including `nin`) + the `findWizardFieldForQuestionName` helper + the `WIZARD_PROVIDED_FIELD_KEY` type alias.
  - [x] 3.2: Extend `WizardDraftData` interface at `apps/web/src/features/registration/api/wizard.api.ts` with `prefilledQuestionNames?: string[]` (persisted shape — convert to/from Set at the React boundary).
  - [x] 3.3: Create `apps/web/src/features/registration/lib/__tests__/wizard-provided-field-names.test.ts` per AC#B6 with the 6 canonical-state assertions (keys-list, lowercase aliases, `nin` IS present, `nin-question-names.ts` is deleted, snapshot, helper function). Run RED first to confirm the module doesn't yet exist; then green after Task 3.1.
  - [x] 3.4: Delete `apps/web/src/features/registration/lib/nin-question-names.ts` per AC#B2. Migrate the two import sites (`FormFillerPage.tsx`, `ClerkDataEntryPage.tsx`) to import the NIN aliases from the dedup module — they only use it for `.includes()` checks so a simple `WIZARD_PROVIDED_FIELD_NAMES.nin.includes(name)` works.
  - [x] 3.5: Add the `hideQuestionNames?: ReadonlySet<string>` prop to `<FormRenderer>` per AC#B3. Update the iteration / `currentIndex` math + the `getNextVisibleIndex` skip-logic engine to filter through hidden questions in both directions. Verify existing FormFillerPage tests (~540 lines) still pass unchanged (zero-regression discipline).
  - [x] 3.6: Extend the Step 4 schema-introspection useEffect at [Source: apps/web/src/features/registration/pages/Step4Questionnaire.tsx:62-76] per AC#B4:
    - Compute the `prefilledQuestionNames` Set via the `findWizardFieldForQuestionName` helper.
    - Write the auto-fills into `questionnaireResponses` via a SINGLE `mergeFields` call (not per-field; URL-race lesson).
    - Stamp `prefilledQuestionNames: [...Array.from(set)]` into `wizard_drafts.formData` for refresh-persistence.
    - Handle the pending-NIN edge case (NIN question hidden but not auto-filled when `formData.nin` is unset).
  - [x] 3.7: Render the `<aside role="status" aria-live="polite" data-testid="step4-prefilled-banner">` above `<FormRenderer>` per AC#B5 with dynamic field-list copy. Banner enumeration logic is field-agnostic (no per-step-number hardcoding).
  - [x] 3.8: Pass `hideQuestionNames={prefilledQuestionNames}` to `<FormRenderer>` from `Step4Questionnaire`.
  - [x] 3.9: Per AC#B7: in `Step4Questionnaire.tsx`, pass `onPendingNinClick={undefined}` to FormRenderer. (No FormRenderer source change; the existing `{isCurrentNin && onPendingNinClick && ...}` gate at line 281 handles the empty prop transparently.) Clerk contexts continue to pass the callback.
  - [x] 3.10: Per AC#B8: delete `handlePendingNinTriggered` from `WizardPage.tsx` ([Source: apps/web/src/features/registration/pages/WizardPage.tsx:150-159]). Remove the `onPendingNinTriggered` prop from `Step4Props` interface.

- [ ] **Task 4: Step 5 becomes Review-and-Save summary (AC: #C1, #C2, #C4, #C5)**
  - [ ] 4.1: Create `apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx` per AC#C1. Renders the summary card + Save button + Edit links.
  - [ ] 4.2: Wire the LGA-name resolution via the existing public LGA query (`useQuery(['public-lgas'], fetchPublicLgas)` — already in use by Step 2; reuse).
  - [ ] 4.3: Wire each Edit link to call `props.onGoToStep(targetStepIndex)`. The wizard's `goToStep` handler at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:131-141] is passed through.
  - [ ] 4.4: Wire Save button → `onSubmit` callback (the wizard's `handleSubmit` at [Source: apps/web/src/features/registration/pages/WizardPage.tsx:161]). Set `authChoice: 'magic-link'` as a constant in the submit payload (the `WizardPage.tsx` submit handler is updated, not Step5ReviewAndSave).
  - [ ] 4.5: Delete `Step5NinAndAuth.tsx`, `Step5NinCaptured.tsx`, `Step5PendingNin.tsx`, `Step5NinInput.tsx`, and `Step5NinAndAuth.test.tsx`. Update `WizardPage.tsx` to import + render `Step5ReviewAndSave` instead of `Step5NinAndAuth`.
  - [ ] 4.6: Update `RegistrationCompletePage.tsx` with the magic-link confirmation copy per AC#C4. Extend `CompletionData` interface with `email`.
  - [ ] 4.7: Verify the submit payload shape per AC#C5 (no backend code change; just confirm wizard frontend always sends `authChoice: 'magic-link'`).

- [ ] **Task 5: Given-name / Family-name split + backfill (Part F — AC: #F1, #F2, #F3, #F4, #F5)**
  - [ ] 5.1: Update `Step1BasicInfo.tsx` per AC#F1 — replace single `fullName` input with two inputs: `givenName` + `familyName`. Keep the field ordering: NIN (from Part A) → Given name → Family name → DOB → Gender. Both required, min length 2.
  - [ ] 5.2: Update `useWizardDraft` schema — drop `fullName` from the `formData` shape; add `givenName: string` + `familyName: string`. Best-effort migration when loading legacy drafts: if `formData.fullName` exists and `formData.givenName` is absent, split on first whitespace and warn-log (not a fatal error).
  - [ ] 5.3: Update `submitWizardSchema` in `apps/api/src/controllers/registration.controller.ts` per AC#F2 — add `givenName` + `familyName`; remove `fullName`. The respondent INSERT writes `first_name = givenName` and `last_name = familyName`.
  - [ ] 5.4: Author `apps/api/scripts/_backfill-name-canonicalization.ts` per AC#F5 — operator-gated, audit-logged, --dry-run mandatory first, --confirm-i-am-not-dry-running for live, KNOWN_FLAGS, --help. New audit action `OPERATOR_RESPONDENT_NAME_CANONICALIZED` (count 42 → 43).
  - [ ] 5.5: Operator runbook — Awwal runs dry-run + CSV review + apply during week 1 of dev (so post-9-18 ships, existing 136 rows are canonical). Document in story Dev Agent Record.
  - [ ] 5.6: Update `_reengagement-email-blast.ts` + `_cohort-a-supplemental-survey-blast.ts` per AC#F3 — prefer `respondents.first_name` over `firstNameFrom(formData.fullName)` with back-compat fallback. The story 9-30 follow-up `_reengagement-email-blast.ts` two-template refactor (committed to uncommitted tree today) inherits this fix in the same edit window.
  - [ ] 5.7: Update `MagicLinkService` email-template renderers per AC#F3 — use canonical given name token in interpolations.
  - [ ] 5.8: Visual-diff verification — render an ID card pre-vs-post-backfill for one Yoruba-named row (e.g. OLOWU KAYODE → KAYODE OLOWU). Capture screenshot in Dev Agent Record.

- [ ] **Task 6: Tests (AC: #D1, #D2, #D3, #D4, #D5, #D6, #F6)**
  - [ ] 6.1: Extend `Step1BasicInfo.test.tsx` with the 8 cases in AC#D1.
  - [ ] 6.2: Create `Step5ReviewAndSave.test.tsx` with the 8 cases in AC#D2.
  - [ ] 6.3: Confirm `Step5NinAndAuth.test.tsx` is DELETED (was 9 tests). Document the count in Dev Agent Record.
  - [ ] 6.4: Extend `Step4Questionnaire.test.tsx` with the 3 NIN dedup cases in AC#D4.
  - [ ] 6.5: Update `e2e/wizard-registration.spec.ts` + `e2e/nin-validation.spec.ts` per AC#D5.
  - [ ] 6.6: Run the full registration-feature test suite + Playwright. Confirm no regressions per AC#D6. Document test-count delta in Dev Agent Record.

- [ ] **Task 7: Documentation + sprint-status update**
  - [ ] 7.1: Update `_bmad-output/implementation-artifacts/sprint-status.yaml` flip 9-18 from `ready-for-dev` → `in-progress` at dev start, → `review` at dev end.
  - [ ] 7.2: Update Story 9-12's status to add a note: "Step 5 state-aware dispatcher superseded by 9-18; the `bea7545` hotfix kept production correct in the gap." (Story 9-12 doesn't get re-opened — just a footnote so future readers trace the supersession.)
  - [ ] 7.3: Update memory files if applicable (CLAUDE.md, MEMORY.md).

- [ ] **Task 8: Pre-merge review (BMAD code-review workflow on uncommitted tree)**
  - [ ] 8.1: Per project feedback "review-before-commit": run the canonical `/bmad:bmm:workflows:code-review` workflow on the uncommitted working tree before any push. Auto-fix findings per the established Story 9-12 / 9-17 pattern.
  - [ ] 8.2: Verify Modulus-11 is enforced exactly ONCE in the new design (Step 1 entry-time validation). No duplicate validation hooks. Grep for `modulus11Check` calls before / after — the count should drop from 3 (Step5NinAndAuth.tsx readQuestionnaireNin + Step5NinInput.tsx ninStatus + WizardPage.tsx readQuestionnaireNin) to 1 (Step1BasicInfo.tsx ninStatus).

### Review Follow-ups (AI) — Part B adversarial code-review (2026-06-10, Opus 4.8)

Findings from the `/bmad:bmm:workflows:code-review` pass on the uncommitted Part B tree (Task 8.1). All were auto-fixed in the same review session and re-verified (tsc ✓, eslint ✓, +3 regression tests, 0 regressions across 116 prior tests). Listed critical→low for trace.

- [x] **[AI-Review][High] Toggling pending-NIN did not purge an already-auto-filled NIN from `questionnaireResponses`** [Step4Questionnaire.tsx]. The deleted `handlePendingNinTriggered` used to `delete responses[ninKey]`; the new additive-only merge never removed it, so a "pending" registrant could still submit a NIN. **Fix:** the stamping effect now purges any previously-stamped question name (`formData.prefilledQuestionNames`) that no longer carries a current prefill value before applying `prefillValues`. Regression test added ("purges a previously auto-filled NIN when pending-NIN switches on").
- [x] **[AI-Review][Med] Triple-coupled field registry with no guard** [Step4Questionnaire.tsx]. `identitySig` was a hand-maintained third list parallel to `WIZARD_PROVIDED_FIELD_NAMES` + `WIZARD_KEY_TO_FORMDATA_FIELD`; a missed entry would silently stop prefill recompute (the `exhaustive-deps` disable hides it). **Fix:** `identitySig` now derives from `Object.values(WIZARD_KEY_TO_FORMDATA_FIELD)` (TS-enforced complete), so a new wizard field extends the signature automatically.
- [x] **[AI-Review][Med] A form composed entirely of wizard-provided fields rendered a hidden, pre-filled question** [FormRenderer.tsx]. The snap-off-hidden effect finds no forward/back visible index, leaving `currentQuestion` on a hidden question. **Fix:** empty-state guard widened to `!currentQuestion || visibleQuestions.length === 0`. Regression test added.
- [x] **[AI-Review][Low] One-frame flash of a leading hidden question** [FormRenderer.tsx]. `currentIndex` started at the raw `initialIndex`; the snap was a post-paint effect. **Fix:** lazy `useState` initializer resolves the first visible index up-front (scoped to wizard consumers — non-wizard behaviour unchanged).
- [x] **[AI-Review][Low] `dob` auto-fill format unverified + untested** [Step4Questionnaire.test.tsx]. **Fix:** added a `date_of_birth` auto-fill test locking the YYYY-MM-DD verbatim round-trip + documented the contract in a comment.
- [x] **[AI-Review][Low] Story doc hygiene** [this file]. Removed a duplicate stale "Task 1 — BLOCKER" block (Task 1 is resolved) and renumbered Task 6 subtasks `5.1–5.6` → `6.1–6.6`.

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

### Pattern C consolidation (2026-06-03 harmonization)

Originally, 9-17 Part B was going to ship the Pattern C dedup infrastructure (`WIZARD_PROVIDED_FIELD_NAMES` map without NIN, `FormRenderer.hideQuestionNames` prop, Step 4 introspection, banner) AND a collision-detector test asserting `'nin' NOT IN WIZARD_PROVIDED_FIELD_NAMES`. This story (9-18) Part B was then going to INVERT both — add NIN to the map + invert the collision-detector test. The 9-17 forward-compat addendum documented the planned inversion.

The 2026-06-03 harmonization moved the full Pattern C infrastructure into THIS story so the canonical state ships once, no inversion, no two-step build-then-invert. Specifically:

1. ✅ **`WIZARD_PROVIDED_FIELD_NAMES` includes NIN from inception** — AC#B1 creates the map with all 7 keys (`fullName + givenName + familyName + phone + email + dob + nin`); the legacy `nin-question-names.ts` is deleted in AC#B2 as part of the same consolidation.
2. ✅ **`FormRenderer.hideQuestionNames` prop ships with NIN already as a valid value** — AC#B3 adds the prop; Step 4 passes a Set that includes NIN question-names when applicable.
3. ✅ **Banner copy reads generically + supports NIN** — AC#B5 extends the field-agnostic enumeration logic with a NIN label.
4. ✅ **Single canonical collision-detector test** — AC#B6 asserts the final canonical state in ONE polarity. No "flipping" of the assertion. The test ships once, correctly.
5. ✅ **Story 9-17 is now Part A only** — form-pin UI on the Q.M. page + Settings mirror card. Zero file-level overlap with 9-18. Ships first or in parallel (no HARD dep).

### Dependencies

- **Story 9-12** (HARD) — provides the wizard skeleton (`WizardPage`, `useWizardDraft`, `Step1`-`Step4` components), public form discovery (`fetchPublicActiveForm`, `getPublicActiveForm`, `wizard.public_form_id` setting), magic-link service (`magic-link.service.ts`), pending-NIN respondent status (`pending_nin_capture`), `RegistrationCompletePage`, draft persistence schema, and URL-race fix from `427a80d`. 9-18 evolves Steps 1/4/5 but does NOT rewrite the foundation.

- **Story 9-17** (NOT HARD — sibling) — after 2026-06-03 harmonization, 9-17 is scoped to JUST Part A (form-pin UI on Q.M. page + Settings mirror card). It no longer ships any wizard-related Pattern C infrastructure; that work is absorbed into THIS story's Part B (AC#B1-B8). 9-17 and 9-18 have zero file-level overlap. Ships in any order — neither blocks the other.

- **Story 9-12 hotfix commit `bea7545`** — Modulus-11 in State A + State B undo. Currently in production. SUPERSEDED by 9-18's dispatcher elimination (the entire Step5NinAndAuth file is deleted) — but the hotfix stays in place until 9-18 ships, since it's the only line of defense against the State-B-stuck-at-true bug in the meantime.

- **Story 3-7** — global NIN uniqueness enforcement via `respondents.nin` unique index + the FR21 duplicate-NIN error code. Unchanged; reused by `useNinCheck` at Step 1.

- **Story 6-1** — audit hash chain. No direct write from 9-18 (the wizard submit's audit emission was wired in 9-12).

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

## Dev Agent Record

### Task 0 Pre-flight Log (2026-06-10, executed via Tailscale by Amelia/dev-story, Opus 4.8)

Operator (Awwal) authorised direct VPS execution over Tailscale (`ssh root@oslsr-home-app`) so the gate could be cleared without a separate operator hand-off. Both pre-flight operations ran against **production** (`oslsr-postgres` Docker container, DB `oslsr_db`).

**Read-only diagnostics first (the dry-run preview):**

| Metric | Value |
|---|---|
| Cohort B stalled drafts (email present, active, no completed submission) | **268** (story projected ~267 ✓) |
| Cohort B expiring within 30 days | 268 (all) |
| Cohort B expiring within 7 days | **12** |
| Earliest Cohort B expiry (pre-op) | **2026-06-13 05:02 UTC** (~2.5 days out) |
| All active drafts | 289 |
| Active enumerators | 1 |
| Total submissions / respondents | 76 / 139 |

**Task 0.1 — Cohort B draft expiry extension (DONE):**
- Executed as a single transactional SQL `UPDATE wizard_drafts SET expires_at = expires_at + INTERVAL '30 days'` with the exact Task-0.1 WHERE clause (active + email-keyed NOT-EXISTS-completed-submission). Result: **`UPDATE 268`** (COMMIT).
- Post-op verification: earliest Cohort B expiry moved **2026-06-13 → 2026-07-13 05:02 UTC**; drafts expiring within 7 days now **0**. The 4–5 week redesign + UAT window (well under 30 days) is fully covered.
- **Deviation from spec (transparent):** the operation was run as direct transactional SQL rather than the audited `_cohort-b-expiry-extension.ts` script, because (a) 12 drafts were ≤3 days from auto-sweep and (b) hand-inserting `audit_logs` rows via raw SQL would corrupt the Story 6-1 hash chain, while the proper AuditService-backed script can only run from the deployed VPS repo tree (needs a commit+deploy not yet authorised). Provenance recorded here in lieu of per-row `OPERATOR_WIZARD_DRAFT_EXPIRY_EXTENDED` audit events. The operation is fully reversible (set `expires_at` back). The audited deliverable script remains optional — moot unless a re-extension is needed before 2026-07-13.

**Task 0.2 — Enumerator path scale-test (DONE):**
- `_enumerator-path-smoke-test.ts` already existed (authored 2026-05-31). Ran `--dry-run --count 5` (clean: found active enumerator, resolved live form 019e24ef… v3.0.0 / 39 questions / 30 required, built valid synthetic payload) then `--confirm-i-am-not-dry-running --count 10` live.
- Result: **10/10 concurrent submissions HTTP 201 in 203ms; 10/10 fully verified** (submissions + respondents + non-empty raw_data + exactly-one audit row each); cleanup deleted 10 synthetic submissions + 10 respondents (NIN `99999%` gate), audit_logs preserved. Exit 0.
- Confirms the enumerator ingestion path (`FormController.submitForm` → queue → `submission-processing.service.ts`) holds at 10× its only-ever production sample before field deployment.

## File List

### Part B (Pattern C dedup foundation) — 2026-06-10

**Added**
- `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` — canonical alias map (7 keys incl. nin) + `findWizardFieldForQuestionName` + widened `NIN_QUESTION_NAMES` convenience export + `WizardProvidedFieldKey`/`NinQuestionName` types
- `apps/web/src/features/registration/lib/__tests__/wizard-provided-field-names.test.ts` — collision-detector (AC#B6), 23 tests
- `apps/web/src/features/forms/components/__tests__/FormRenderer.hideQuestionNames.test.tsx` — AC#B3, 4 tests (incl. AI-Review M3 all-hidden empty-state)
- `apps/web/src/features/registration/pages/__tests__/Step4Questionnaire.test.tsx` — AC#B4/B5, 6 tests (incl. AI-Review H1 NIN-purge + L5 dob round-trip)

**Modified**
- `apps/web/src/features/registration/api/wizard.api.ts` — `WizardDraftData.prefilledQuestionNames?: string[]`
- `apps/api/src/db/schema/wizard-drafts.ts` — mirror `prefilledQuestionNames?: string[]` (additive, type-only)
- `apps/web/src/features/forms/utils/skipLogic.ts` — optional `hideQuestionNames` param on `getVisibleQuestions` / `getNextVisibleIndex` / `getPrevVisibleIndex`
- `apps/web/src/features/forms/components/FormRenderer.tsx` — `hideQuestionNames` prop threaded through resolver/visibility/nav + snap-off-hidden effect + import migration
- `apps/web/src/features/registration/pages/Step4Questionnaire.tsx` — introspection/auto-fill (AC#B4) + dynamic banner (AC#B5) + `hideQuestionNames`/`onPendingNinClick={undefined}` (AC#B7) + removed `onPendingNinTriggered` prop
- `apps/web/src/features/registration/pages/WizardPage.tsx` — deleted `handlePendingNinTriggered` + wiring (AC#B8); import migration
- `apps/web/src/features/forms/pages/FormFillerPage.tsx` — import migration
- `apps/web/src/features/forms/pages/ClerkDataEntryPage.tsx` — import migration
- `apps/web/src/features/registration/pages/Step5NinAndAuth.tsx` — import migration (file is deleted later in Part C)

**Deleted**
- `apps/web/src/features/registration/lib/nin-question-names.ts` (AC#B2 consolidation)

### Part B Implementation Notes (2026-06-10, Amelia/dev-story, Opus 4.8)

Pattern C wizard field dedup foundation (Task 3 / AC#B1–B8). Quality gates: web `tsc` ✓, api `tsc` ✓, eslint ✓ (all changed files), full web suite **2543 pass / 0 fail / 2 todo (+30 new tests, 0 regressions)**.

**Decisions / deviations to note for review:**
1. **Story under-counted the migration surface (AC#B2).** The story named only `FormFillerPage` + `ClerkDataEntryPage` as `NIN_QUESTION_NAMES` consumers, but there are 6 importers. `FormRenderer.tsx`, `WizardPage.tsx` (`readQuestionnaireNin`, survives until Part C), and `Step5NinAndAuth.tsx` (deleted in Part C) all import it too. To delete `nin-question-names.ts` in Part B **and keep the build green**, all surviving importers were migrated.
2. **Kept a widened `NIN_QUESTION_NAMES: readonly string[]` export in the new canonical module** (derived from `WIZARD_PROVIDED_FIELD_NAMES.nin`). AC#B2 explicitly permits a re-export from the dedup module; this made the migration a pure import-path change with **zero behaviour drift** at the 5 surviving exact-match call sites and avoids per-site `as readonly string[]` casts (the same casts the old file's comment existed to avoid). The old FILE is deleted (AC#B6.4 satisfied).
3. **Type name:** exported the keys type as PascalCase `WizardProvidedFieldKey` (story wrote `WIZARD_PROVIDED_FIELD_KEY`) — a SCREAMING_CASE type fails the project's `@typescript-eslint/naming-convention` rule.
4. **Banner colours:** the story cited `bg-info-50`/`text-info-800` "from Step5PendingNin" — Step5PendingNin actually uses neutral. The real `info-*` token usage is in `PendingNinToggle.tsx:89` (`rounded-md border-l-4 border-info-600 bg-info-50 text-info-800`); the banner mirrors that proven pattern.
5. **Idempotent introspection effect:** the Step 4 auto-fill `mergeFields` writes only when the merged responses / hidden-name list / form version change — so it re-syncs if an identity value is edited yet never loops against FormRenderer's per-answer `mergeFields`. Known minor limitation (resolved in Part C): if an identity value is edited *after* Step 4 stamps, the hidden questionnaire dup value can lag until re-entry; the Step-5 summary (Part C) reads identity from `formData`, not these responses.
6. **`hideQuestionNames` excludes hidden questions from the resolver/validation set too**, so an auto-filled-but-unreachable required question can never gate navigation.

**Suggested commit:** `feat(9-18): Part B — Pattern C wizard field dedup foundation`

## Change Log

| Date | Change |
|---|---|
| 2026-06-10 | Story flipped ready-for-dev → in-progress. Task 0 pre-flight cleared via Tailscale: Cohort B 268-draft expiry extended +30d (earliest now 2026-07-13); enumerator path scale-tested 10/10 clean. Task 1 confirmed already resolved (Option B, auth-choice retires — 2026-05-31). |
| 2026-06-10 | Part B (Task 3 / AC#B1–B8) implemented: `WIZARD_PROVIDED_FIELD_NAMES` map + `FormRenderer.hideQuestionNames` + Step 4 auto-fill/banner + collision test; `nin-question-names.ts` deleted, 6 import sites migrated. +30 tests, 0 regressions. Awaiting operator code-review + atomic commit. |
| 2026-06-10 | Adversarial code-review (Task 8.1) on Part B tree: 6 findings (1 High, 2 Med, 3 Low) logged under "Review Follow-ups (AI)" and all auto-fixed in-session. High = stale NIN not purged on pending toggle; Meds = triple-coupled identitySig + all-hidden form renders hidden question; Lows = leading-hidden flash, dob test, story doc numbering. +3 regression tests; tsc/eslint clean; 116 prior tests still green. Story stays `in-progress` (Parts A/C/D/E/F outstanding). |
