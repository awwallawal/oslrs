# Story 9.54: Forms-Engine Fidelity (calculate/age eval + group-relevance + publish-time validator + wizard-dedup value-mapping + submit-time completeness)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->
<!-- Authored 2026-06-12 by Bob (SM) via canonical *create-story --yolo. LAUNCH-GATING (roadmap Phase 1 🚦). -->

## Story

As the **registry data steward (and the respondents whose data must be correct)**,
I want the **public/enumerator/clerk questionnaire engine to honour the XLSForm spec it was authored against — computed fields (`age`), group-level skip logic (`relevant`), required-answer completeness, and a publish-time validator — plus a safe wizard↔questionnaire choice-value mapping**,
so that **conditional sections actually gate (the basic-consent identity gate + the age branch work), no incomplete or invalid submission can reach the database, the section-as-step wizard stops re-asking already-answered choice fields, and a content editor can never silently publish a form whose logic was dropped at migration**.

## Context & Why This Gates Launch

Emerged from the 9-18 Part-A/F code-review dig (2026-06-10) and **re-verified by a live reproduction dig 2026-06-12** against the pinned production form `oslsr_master_v3` (`form_schema` version `2026012601`, row `019ccc89-bcba-7b7a-8157-763897caa988`). Two migration-fidelity defects + two newly-confirmed enforcement gaps mean the engine does **not** faithfully run the form it was given:

- **DEFECT 1 — `calculate` fields are stripped at migration AND never evaluated at runtime.** `xlsform-to-native-converter.ts` lists `calculate` in `METADATA_TYPES` (line 29) and drops it; there is no runtime calculation evaluator anywhere. So `age = int((today() - ${dob}) div 365.25)` never computes. Prod evidence: the `age` key appears in 0/76 submissions and is absent from the pinned schema.
- **DEFECT 2 — group-level `relevant` is dropped at migration.** `extractSections` deliberately converts only question-level `relevant` → `showWhen`; the `begin_group` `relevant` column is discarded (JSDoc at `xlsform-to-native-converter.ts:149-162`). So `grp_identity` (`relevant=${consent_basic}='yes'`) and `grp_labor` (`relevant=${age}>=15`) gates never reach the pinned form (prod schema has no `sectionShowWhen`). **CONSEQUENCE: identity questions render regardless of basic-consent — a LIVE consent-handling gap — and no age gating exists.** This is the launch-gating limb.
- **GAP 3 (NEW, folded from the 2026-06-12 repro) — no server-side required-answer validation.** The submit path stores `raw_data` as-is. `submission-processing.service.ts` `extractRespondentData` (lines 209-216, 364-375) only maps identity fields via `RESPONDENT_FIELD_MAP` and only asserts the *schema* contains a NIN question — it never checks that `required` questionnaire answers are present. `submitWizardSchema` (`registration.controller.ts:81`) validates identity only. **The client `FormRenderer.goNext` gate is the ONLY completeness enforcement.**
- **GAP 4 (NEW, folded from the 2026-06-12 repro) — wizard orchestration lets you bypass the questionnaire.** `WizardPage.tsx` URL→state sync clamps `?step=N` to `steps.length - 1` (lines 108 + 158) — to the **last** step, NOT the furthest the user actually reached. So `/register?step=<last>` jumps straight to Review, past every questionnaire step; Step-5 submit then validates only `givenName/email/phone/lgaId/consent` (`WizardPage.tsx:246-255`), never `questionnaireResponses` completeness. (A magic-link resume token pointing at a late saved step is the realistic vector.)

**IMPORTANT — what is NOT broken (do not re-scope):** the per-question required gate in the renderer **works** — proven by component reproduction on 2026-06-12: an empty required field keeps the user on the question and shows "This field is required" in BOTH legacy and section modes. `required` is parsed correctly (`xlsform-to-native-converter.ts:203`), carried through `flattenForRender` (`native-form.service.ts:450`), and enforced in `FormRenderer.goNext` (`FormRenderer.tsx:260-302`). Select inputs do not auto-default (`SelectOneInput.tsx`). The skip-through is an **orchestration + server** problem, NOT a renderer problem. The gap that lets a regression hide is that this seam is **untested** (every `FormRenderer` test fixture uses `required: false`).

Decision: Awwal "Option A — fix once and for all" (2026-06-10). FOLDED scope: the choice-field wizard-dedup value-mapping (9-18 Part-E review finding H1, 2026-06-11).

## Acceptance Criteria

### AC1 — Runtime `calculate` evaluator (DEFECT 1)
1. A safe expression evaluator computes XLSForm `calculate` fields over the **explicit safe subset** present in the master form: `today()`, `${field}` references, integer/decimal arithmetic (`+ - * div`), and `int()`. No `eval`/`Function`; unknown function or token → evaluator throws a typed error (caught → field left undefined + logged `forms.calculate.unsupported`).
2. `calculate` rows are **retained** through migration as a `calculate`-kind entry carrying the raw expression (no longer silently dropped by `METADATA_TYPES`), and are NOT rendered as user-facing questions.
3. Computed values (e.g. `age`) are evaluated **at render** (so `relevant`/`showWhen` referencing them resolve) and **recomputed server-side at submit** (so a client cannot forge `age`). The server value is authoritative for any server-side gate.
4. Given `dob = 1984-06-06` and `today() = 2026-06-12`, `age` resolves to `42` and is available to skip-logic and to the persisted submission.
5. Existing question-level `showWhen` behaviour is unchanged for non-calculated references (no regression in `packages/utils/src/skip-logic.ts`).

### AC2 — Group-level `relevant` → `sectionShowWhen` migration (DEFECT 2, launch-gating)
1. `extractSections` (`xlsform-to-native-converter.ts`) converts each `begin_group` `relevant` expression into the section's `sectionShowWhen` (same `Condition` shape the renderer already consumes), instead of discarding it.
2. Section-level gates evaluate against the cumulative answer map **including computed fields** (AC1): `grp_identity` hidden until `consent_basic = 'yes'`; `grp_labor` hidden until `age >= 15`.
3. The renderer + wizard already honour `sectionShowWhen` (`WizardPage.isStepSkippable`, `FormRenderer` cross-section `showWhen`); a section gated off is auto-skipped (AC#E5 path) and its questions are excluded from required-completeness checks (AC5) so a hidden section never blocks submit.
4. The JSDoc at `xlsform-to-native-converter.ts:149-162` (the deliberate "do not convert group relevance" note) is removed/replaced and its rationale superseded — with a regression test proving the two master-form group gates round-trip.
5. **Operator step documented:** the pinned production form must be re-migrated → re-uploaded → re-pinned for the fix to take effect (the live schema has no `sectionShowWhen`). Cross-reference the publish→re-pin runbook.

### AC3 — Publish-time schema validator (hooked into the 9-17 pin/validate surface)
1. A publish/pin-time validator rejects-or-warns when a form's logic would be silently lost or broken, covering at minimum: (a) a `relevant`/`showWhen` references a field that is not rendered and not a retained `calculate` (e.g. dangling `${age}` if AC1 regressed); (b) a group-level `relevant` was present in source but produced no `sectionShowWhen` (drop detection); (c) a `constraint`/`calculate` uses a token outside the supported safe subset.
2. The validator ALSO flags the **wizard-dedup vocabulary mismatch** (Part-E H1): a questionnaire question whose name is aliased in `WIZARD_PROVIDED_FIELD_NAMES` but whose choice list omits a value the wizard can produce — so the same guard that catches `age` catches a future unsafe dedup add.
3. Validator output is actionable (question/group name + reason) and surfaced at the 9-17 pin/validate step (Questionnaire Management). A blocking finding prevents pin; a warning is acknowledged. Optional: a migration diff report (source XLSForm logic vs migrated schema).
4. Validator is pure + unit-tested with fixtures for each finding class; no false-positive on the corrected master form.

### AC4 — Choice-field wizard-dedup value-mapping (folded from 9-18 Part-E H1)
1. A wizard-value → questionnaire-choice **mapping layer** is introduced so choice fields the wizard already collects (`gender`, `lga_id`, `consent_marketplace`, `consent_enriched`) can be deduped without injecting invalid choice values. Verified vocabulary mismatches that MUST be mapped: wizard `gender = prefer_not_to_say` ↔ form `gender_list = other`; wizard boolean consent ↔ form `yes_no` (`yes`/`no`); wizard `lgaId` (UUID/key) ↔ form `lga_list` keys (e.g. `saki_west`) — reconcile the LGA key space explicitly.
2. The mapping is applied at the same Pattern-C auto-fill/hide seam (`Step4Questionnaire.computePrefill` + `WIZARD_KEY_TO_FORMDATA_FIELD`), only AFTER a value maps to a valid choice in the target question's choice list; an unmappable value falls back to NOT deduping (question is shown) rather than writing an invalid answer.
3. `WIZARD_PROVIDED_FIELD_NAMES` / `WIZARD_KEY_TO_FORMDATA_FIELD` are extended to include the now-safe choice fields, and the collision-detector test (which currently pins the free-text/date-only safe set per `wizard-provided-field-names.ts:24-34`) is updated to assert the mapping is present + correct rather than failing on the addition.
4. Net effect: the section-as-step wizard no longer re-asks `gender` / `lga` / the two consents (directly supports the AC#E9 Step-4-stall <30% goal). Submitted choice values remain valid against the form's choice lists (no `submission-processing` extraction regression).

### AC5 — Server-side required-answer validation at submit (GAP 3, launch-gating safety net)
1. A shared, schema-driven rule validates that every **required AND currently-relevant** questionnaire answer is present, enforced **synchronously at submit** in BOTH paths — `submitWizard` (`registration.controller.ts`) and `submitForm` (`form.controller.ts`) — BEFORE the submission is queued for async ingestion (NOT inside `submission-processing.service.ts`, which runs post-HTTP-200).
2. Relevance is computed using the same engine as the client (`@oslsr/utils` skip-logic + AC1 computed fields), so a field hidden by `showWhen`/`sectionShowWhen` is NOT required, and the pending-NIN / wizard-prefilled exclusions are honoured (no false rejection of legitimately-hidden or wizard-owned fields).
3. A submission missing a required+relevant answer is rejected with a structured `AppError` (`VALIDATION_ERROR`/`INCOMPLETE_SUBMISSION`, 400/422) naming the offending field(s); a complete submission is unaffected. No change to the happy-path response contract.
4. The rule lives in shared code (`packages/utils` or `packages/types` validation) so client and server share one definition; covered by unit tests including the hidden-field and pending-NIN exclusion cases.

### AC6 — Wizard navigation integrity + the missing seam test (GAP 4)
1. `WizardPage` URL→state sync clamps `?step=N` to the **furthest step the user has legitimately reached** (track a `maxReachedStepIndex` in draft/state), not to `steps.length - 1`. A deep-link or resume token beyond the furthest-reached step lands on the furthest-reached step, never past the questionnaire. Back-navigation to completed steps is unchanged.
2. Step-5 Review gains a **completeness guard**: before enabling Submit it verifies all required+relevant questionnaire answers are present (reusing the AC5 shared rule); if any are missing it surfaces which section/step to return to and disables Submit (defence-in-depth; the server rule in AC5 is the authoritative backstop).
3. A new **integration test** proves the required-blocking seam end-to-end at the layer the unit tests miss: an empty required field cannot advance via the wizard's Continue, AND the Review step cannot submit an incomplete questionnaire, AND a `?step=<last>` deep-link cannot reach Review past unfilled required steps.
4. The renderer per-question gate is explicitly NOT modified (it works); this AC only closes the orchestration seam and adds the regression test.

## Tasks / Subtasks

- [ ] **Task 1 — Runtime calculate evaluator (AC1)**
  - [ ] Add a safe expression evaluator (`packages/utils/src/xlsform-calculate.ts` or extend skip-logic) supporting `today()`, `${field}`, `+ - * div`, `int()`; reject anything else with a typed error.
  - [ ] Retain `calculate` rows through migration as a `calculate`-kind schema entry holding the raw expression (remove `calculate` from `METADATA_TYPES` drop path while keeping it non-rendering).
  - [ ] Evaluate computed fields at render (feed into the answer map used for skip-logic) and recompute authoritatively at submit (server).
  - [ ] Unit tests incl. the `dob=1984-06-06 / today=2026-06-12 → age=42` case and unsupported-token rejection. (Stamp `today()` via injected clock — never `Date.now()` in test fixtures.)
- [ ] **Task 2 — Group-level relevant → sectionShowWhen (AC2)**
  - [ ] Convert `begin_group` `relevant` → `sectionShowWhen` in `extractSections`; remove the superseding JSDoc + the deliberate-drop logic.
  - [ ] Ensure section gates evaluate with computed fields (Task 1) in the cumulative answer map.
  - [ ] Round-trip regression test: master-form `grp_identity` (`consent_basic='yes'`) + `grp_labor` (`age>=15`) gates appear as `sectionShowWhen` and gate correctly.
  - [ ] Document + cross-link the re-migrate → re-upload → re-pin operator step (publish→re-pin runbook).
- [ ] **Task 3 — Publish-time schema validator (AC3)**
  - [ ] Pure validator: dangling-reference, dropped-group-relevance, unsupported-token, and wizard-dedup-vocabulary-mismatch checks.
  - [ ] Hook into the 9-17 pin/validate surface (Questionnaire Management); block on errors, acknowledge on warnings; optional migration-diff report.
  - [ ] Unit-test each finding class + a clean pass on the corrected master form.
- [ ] **Task 4 — Choice-field wizard-dedup value-mapping (AC4)**
  - [ ] Build wizard-value → questionnaire-choice mapping (gender, consents, LGA key reconciliation); unmappable → do not dedup (show question).
  - [ ] Apply at `Step4Questionnaire.computePrefill` / `WIZARD_KEY_TO_FORMDATA_FIELD`; extend `WIZARD_PROVIDED_FIELD_NAMES` for the safe-now choice fields.
  - [ ] Update the collision-detector test to assert mapping presence/correctness; verify submitted choice values stay valid for `submission-processing` extraction.
- [ ] **Task 5 — Server-side required-answer validation (AC5)**
  - [ ] Shared required+relevant completeness rule in `packages/utils`/`packages/types` (uses skip-logic + computed fields + pending-NIN/prefill exclusions).
  - [ ] Enforce synchronously in `submitWizard` AND `submitForm` before queueing; structured `AppError` on miss.
  - [ ] Unit tests incl. hidden-field-not-required + pending-NIN exclusion + complete-submission-passes.
- [ ] **Task 6 — Wizard navigation integrity + seam test (AC6)**
  - [ ] Track `maxReachedStepIndex`; clamp `?step=N` / resume to furthest-reached (not last).
  - [ ] Step-5 completeness guard reusing the AC5 rule (disable Submit + point to missing section).
  - [ ] New integration test: empty-required can't advance via Continue; Review can't submit incomplete; `?step=<last>` deep-link can't bypass.
- [ ] **Task 7 — Regression sweep + planning-artifact parity**
  - [ ] Full `pnpm test` (API + web) green; tsc + lint clean. Re-run the 2026-06-12 component repro to confirm the renderer gate still passes.
  - [ ] Flip `sprint-status.yaml` 9-54 → review at story close (same commit); confirm 9-55 unblock note.

## Dev Notes

### Architecture & engine map (cite these exact targets)
- **XLSForm → native conversion:** `apps/api/src/services/xlsform-to-native-converter.ts` — `METADATA_TYPES` (line 29, drops `calculate`), `extractSections` group-relevance drop (JSDoc lines 149-162), `required` parse (line 203, **correct — keep**), `convertConstraints` (lines 74-130). Migration script: `scripts/migrate-xlsform-to-native.ts`. Parser: `apps/api/src/services/xlsform-parser.service.ts` (`ParsedXlsform`).
- **Native schema serve/flatten:** `apps/api/src/services/native-form.service.ts` — `flattenForRender` carries `required` (line 450); `getPublishedFormSchema`. Public-active endpoint: `apps/api/src/controllers/form.controller.ts` (`getPublicActiveForm`, `getFormForRender`).
- **Skip-logic engine (shared):** `packages/utils/src/skip-logic.ts` (`evaluateCondition`) + web wrapper `apps/web/src/features/forms/utils/skipLogic.ts` (`getVisibleQuestions`, `getNextVisibleIndex`). `parseXlsformRelevance` lives in `@oslsr/utils`. The `Condition`/`showWhen` shape is in `packages/types/src/native-form.ts`.
- **Renderer (DO NOT re-scope the required gate):** `apps/web/src/features/forms/components/FormRenderer.tsx` — `goNext` validates current question (lines 260-302) via `validateQuestionValue` (`utils/formSchema.ts:64-82`). Inputs in `apps/web/src/features/forms/components/*Input.tsx` (no auto-default).
- **Wizard orchestration:** `apps/web/src/features/registration/pages/WizardPage.tsx` — `buildSteps` (56-76), URL↔state sync + the `Math.min(stepFromUrl, steps.length-1)` clamp to fix (108, 158), `isStepSkippable` (198-207, AC#E5), submit identity-only validation (246-255). Section step wrapper: `Step4Questionnaire.tsx` (`computePrefill` 116-151, `WIZARD_KEY_TO_FORMDATA_FIELD` 69-77). Step indicator (forward-jump already guarded): `WizardStepIndicator.tsx:68`.
- **Wizard dedup map (extend here):** `apps/web/src/features/registration/lib/wizard-provided-field-names.ts` — `WIZARD_PROVIDED_FIELD_NAMES` (36-44) and its **explicit 9-54 pointer** (24-34: the value-vocabulary constraint + collision-detector test).
- **Submit + ingestion (server gate goes here):** `submitWizard` `apps/api/src/controllers/registration.controller.ts:481` (`submitWizardSchema` 81); `submitForm` `apps/api/src/controllers/form.controller.ts`. Async ingestion (NOT the place for the gate): `apps/api/src/services/submission-processing.service.ts` — `RESPONDENT_FIELD_MAP` (33), `extractRespondentData` (209-216, 364-375). Submit queues via `queueSubmissionForIngestion` — gate must run BEFORE queueing (post-HTTP-200 is too late).

### Critical implementation rules (from project-context.md)
- **Shared Zod schema between client+server** (project-context §7) — the AC5 completeness rule must be one shared definition, not duplicated.
- **AppError only** (§3) — reject incomplete submissions with `new AppError('VALIDATION_ERROR'|'INCOMPLETE_SUBMISSION', msg, 400|422, {fields})`. Never raw `Error`.
- **Structured Pino logging** (§5) — `forms.calculate.unsupported`, `forms.validate.blocked`, `submission.incomplete` (`{domain}.{action}`).
- **No `Date.now()` in deterministic logic/tests** — inject a clock for `today()` so calculate eval + tests are reproducible.
- **Drizzle schema must not import `@oslsr/types`** (memory key pattern) — not expected here, but the calculate/relevance types belong in `packages/types/src/native-form.ts`.
- **Tests:** backend `__tests__/` folders, frontend co-located; vitest; `pnpm test` routes per package (never `pnpm vitest run` from root for web).

### Reproduction evidence (2026-06-12) — anchors the scope
- Pinned form `019ccc89-…` schema census: `consent_basic/surname/firstname/gender/dob/…` all `required:true`; only `monthly_income/skills_other/training_interest/apprentice_count/bio_short/portfolio_url`+notes are `required:false`. So the data is correct; enforcement is the issue.
- Component repro: empty required field BLOCKS Continue (legacy + section), error shown → renderer gate works.
- Prod query: `age` in 0/76 submissions; `employment_status` in 76/76 (the earlier "labour-data bug" hypothesis is DISPROVEN — do not chase it).

### Project Structure Notes
- New shared modules belong in `packages/utils/src/` (calculate eval, completeness rule) and `packages/types/src/native-form.ts` (schema kinds/Condition extensions) so both apps consume one source.
- Converter + validator are API-side (`apps/api/src/services/`); the 9-17 pin/validate UI hook is in Questionnaire Management (`apps/web/src/features/questionnaires/`).
- This is a **large** story (Awwal "Option A — fix once and for all"; ~3-4 dev-days incl. the dedup mapping). If the dev agent needs to stage it, the natural seam is Tasks 1-2 (engine fidelity, the launch-gating limb) → Task 5-6 (safety nets) → Tasks 3-4 (validator + dedup polish). Keep AC2 + AC5 in-scope for launch.

### Dependencies & sequencing
- **HARD deps:** 9-17 (pin/validate surface for AC3), 9-18 (questionnaire surface + Pattern C dedup seam). Both shipped/deployed.
- **ENABLES 9-55** (minor age-gate + guardian consent) — 9-55 needs AC1 (runtime `age`) + AC2 (group-relevance) to express its `relevant=${age}<15` guardian group. Do not start 9-55 until 9-54 AC1+AC2 land.
- After this ships: **re-migrate → re-upload → re-pin** the production form (`wizard.public_form_id`) or none of AC1-AC2 take effect in prod.

### References
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml#9-54-forms-engine-fidelity] — placeholder scope (DEFECT 1/2 + dedup value-mapping)
- [Source: docs/roadmap-to-launch.md#Phase-1] — launch-gating sequencing (9-54 → 9-55)
- [Source: apps/api/src/services/xlsform-to-native-converter.ts:29,149-162,203] — calculate drop, group-relevance drop, required parse
- [Source: apps/api/src/services/native-form.service.ts:450] — flattenForRender carries required
- [Source: apps/web/src/features/registration/pages/WizardPage.tsx:108,158,246-255] — URL clamp + submit identity-only validation
- [Source: apps/web/src/features/registration/lib/wizard-provided-field-names.ts:24-34,36-44] — value-vocabulary constraint + 9-54 pointer
- [Source: apps/api/src/services/submission-processing.service.ts:33,209-216,364-375] — RESPONDENT_FIELD_MAP, no required-answer validation
- [Source: apps/web/src/features/forms/components/FormRenderer.tsx:260-302] — working per-question required gate (do not re-scope)
- [Source: _bmad-output/project-context.md] — shared-Zod, AppError, Pino, test-org rules
- [Source: 9-18 Dev Notes "Forms-engine fidelity & minor age-gate"] — origin analysis

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
