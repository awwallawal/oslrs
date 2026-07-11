# Story 13-29: Wizard — evaluate calculated-field section relevance reactively (fix the two-pass survey loop) + acquisition-question prominence

Status: ready-for-dev

<!-- Authored 2026-07-11 by Bob (SM) via *create-story. EMERGENT from the Dry-run #2 registration (Awwal, live): every public registration hits a confusing two-pass loop — the summary appears with Submit greyed + "Some required survey questions still need an answer… Go back and fill survey", and only AFTER looping back do the occupation questions (main_occupation/employment_type/years_experience) appear, THEN Submit enables. Root-caused (agent-traced, confirmed): grp_labor is gated by group relevance `${age} >= 15`, `age` is a CALCULATED field from `dob`, and the FormRenderer evaluates calculated fields for section-navigation from a STALE mount-time useState snapshot (FormRenderer.tsx:136) taken before dob is answered → grp_labor is skipped on pass 1 → completeness is only checked at Review (review-completeness.ts:59) where age finally computes → grp_labor is now required+unanswered → bounce-back. NOT a form-content bug (13-19's age gate is correct); a FormRenderer calculated-field REACTIVITY/ordering bug. Also folds in the "How did you hear about us?" (13-1) prominence (currently a plain optional select below the summary — easy to miss). LAUNCH-RELEVANT: on the paid-conversion path. -->

## Story
As **a member of the public registering via the wizard**,
I want **the survey to show all its relevant questions in one natural forward pass (and the "how did you hear" question to be visible)**,
so that **I reach the summary once with everything answered and a live Submit — instead of a confusing "go back and fill survey" loop that makes me abandon.**

## Context & Evidence (agent-traced, confirmed 2026-07-11)
- **Symptom (live, Dry-run #2):** in the Public Core survey, ~3-4 questions render, the SUMMARY appears with Submit greyed + "Some required survey questions still need an answer before you can save. Go back and fill survey." The go-back link returns to Main Occupation/Job Title, revealing another ~3-4 questions (main_occupation/employment_type/years_experience) that DIDN'T show the first time; then Submit turns bright (enabled). Every registration.
- **Root cause (a calculated-field reactivity/ordering bug in the FormRenderer):**
  - `grp_labor` carries group relevance `showWhen: ${age} >= 15` (correctly converted from the xlsform group relevance — `xlsform-to-native-converter.ts:184-189`, preserved by 13-19). `age` is a CALCULATED field = `int((today() - dob) div 365.25)`.
  - `FormRenderer.tsx:136` computes the calculated fields (`seedEval = withCalculatedFields(initialResponses ?? {}, …)`) in a **`useState` INITIALIZER** — a one-time snapshot at section mount, BEFORE `dob` is answered. So `age` is `undefined` → `${age} >= 15` is false → `getNextVisibleIndex` (`FormRenderer.tsx:137-143`) SKIPS `grp_labor` in the forward flow. The user never sees the occupation questions on pass 1.
  - Completeness is evaluated ONLY at the Review step (`review-completeness.ts:58-59`), which computes calculated fields across ALL answers for the first time → now `dob` is present → `age` computes → `grp_labor` is "visible + required + UNANSWERED" → `incompleteQuestionnaire=true` → Submit disabled + the go-back message (`Step5ReviewAndSave.tsx:245`, link at :195).
  - The go-back re-mounts the section; `initialResponses` now includes `dob` → the stale seed recomputes `age` → `grp_labor` renders (pass 2).
- **This is NOT 13-19** (13-19 stripped dead FIELD-level relevance; the `${age} >= 15` GROUP gate is intentional and correct). It's a renderer reactivity gap: **section relevance that depends on a calculated field is evaluated from a stale mount-time snapshot, and completeness is deferred to Review.**
- **Acquisition question (13-1):** "How did you hear about us?" renders at `Step5ReviewAndSave.tsx:211-237` as a plain optional `select` BELOW the summary table (gated by `ATTRIBUTION_ENABLED`), labeled "(optional)" — easy to miss on a scroll-to-submit. 13-1's whole point is channel attribution; a missed question = lost CPA signal for the paid launch.

## Acceptance Criteria
1. **AC1 — Calculated-field section relevance is reactive.** Entering `dob` makes `grp_labor` (and any section gated on a calculated field) appear in the SAME forward pass — section navigation recomputes visibility from the CURRENT answers (with calculated fields recomputed), not a stale mount-time `useState` seed. No dependence on a re-mount.
2. **AC2 — No spurious "go back and fill survey" for a straight-through registration.** A fresh public registration that answers every relevant question in order reaches the summary ONCE with Submit ENABLED — no phantom "required unanswered" from a section that was never shown. (Regression test reproducing the dob→age→grp_labor path.)
3. **AC3 — General, not grp_labor-specific.** The fix is in the renderer's calculated-field/relevance evaluation ordering, so ANY section gated on a calculated field re-evaluates as its inputs change (future-proof). Do NOT special-case age/grp_labor or weaken 13-19's correct `${age} >= 15` gate.
4. **AC4 — Legitimate skip still works.** An under-15 registrant (age < 15) still correctly SKIPS `grp_labor` (occupation not asked; guardian path) and reaches the summary without those questions marked missing — the gate must still HIDE when it should, just reactively.
5. **AC5 — Acquisition-question prominence (13-1).** "How did you hear about us?" is made prominent + legible on the review/summary step (clear position, readable label/affordance, not buried below the table as a faint optional select). Reconcile with 13-1's intent: it may be elevated toward prominent/soft-required while staying non-blocking per the 13-1 review's "never block the submit" guardrail. Confirm the exact treatment with PM.
6. **AC6 — Tests + suites green.** Renderer unit/integration test for reactive calculated-gate visibility (one-pass) + the under-15 skip; web component test for the acquisition-question placement. Full web (+ any api) suites green; tsc/eslint clean. A manual/e2e wizard pass confirms one-pass completion.

## Tasks / Subtasks
- [ ] **Task 1 (AC1-AC4)** — fix the FormRenderer so section-relevance gates that depend on calculated fields re-evaluate reactively during navigation (recompute calc from current formData, not the mount-time seed at :136) and/or validate completeness within the section step rather than deferring the first cross-form calc to Review; preserve the under-15 skip.
- [ ] **Task 2 (AC5)** — elevate the acquisition question's prominence on Step 5 per the agreed treatment.
- [ ] **Task 3 (AC6)** — reactive-visibility + under-15-skip tests; acquisition-placement test; suites.

## Dev Notes
- **The seam is `FormRenderer.tsx:136` (stale `useState` seedEval) + the section-navigation `getNextVisibleIndex` (:137-143) using it, vs the reactive `evalData` useMemo (:201-204) that already recomputes on `[formData, calculations]`.** The likely fix: drive section visibility/navigation off the reactive `evalData` (or recompute calc at navigation time), so `age` is fresh when `grp_labor`'s gate is checked. Confirm completeness (`review-completeness.ts`) and the section flow agree on the same computed answer-set.
- **Keep 13-19's `${age} >= 15` gate** — it is correct (occupation asks for adults; under-15s route to the guardian block). This story fixes WHEN/HOW the gate is evaluated, not the gate.
- **General fix preferred** — this class (section gated on a calculated field) will recur; fix the ordering once.
- **LAUNCH-RELEVANT / HIGH** — registrations complete today (via the loop), so not a hard blocker, but it's a confusing two-pass loop on the exact paid-conversion path the blast drives; abandonment risk. Prioritise with 13-27/13-25 in the pre-blast public-facing pass. PM to rule pre-blast vs fast-follow.
- **Acquisition prominence** rides along because it's the same Step-5 surface; keep it non-blocking (13-1 review guardrail).

### References
- [Source: apps/web/src/features/forms/components/FormRenderer.tsx:136 (stale useState seedEval), :137-143 (getNextVisibleIndex on stale seed), :201-204 (reactive evalData useMemo)]
- [Source: apps/web/src/features/registration/lib/review-completeness.ts:58-59 (first cross-form calc, at Review only)]
- [Source: apps/web/src/features/forms/utils/skipLogic.ts:117-120 (section visibility vs formData)]
- [Source: apps/web/src/features/registration/pages/Step5ReviewAndSave.tsx:195 (go-back onGoToStep), :211-237 (acquisition question), :245 (submit disabled)]
- [Source: apps/api/src/services/xlsform-to-native-converter.ts:184-189 (group relevance → showWhen, correct — 9-54 AC2)]
- [Source: 13-19 (the intentional ${age}>=15 grp_labor gate) · 13-1 (acquisition question / attribution) · 9-54 (native-form calculate evaluator)]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-11)

**Validated — approved. LAUNCH-RELEVANT/HIGH. The reactivity fix is the priority; acquisition prominence rides along.**

1. **Severity:** registrations complete today, so it's not a hard blocker — but a "go back and fill survey" loop on EVERY registration is a conversion killer on the paid-traffic path the whole blast exists to feed. That makes it effectively pre-blast: we're about to pay to send people into a confusing two-pass form. Put it in the pre-blast public-facing pass with 13-27/13-25.
2. **AC3 (general fix) + AC4 (under-15 skip still works) are the guardrails.** Don't special-case age; don't weaken 13-19's correct gate; and prove the legitimate skip still hides grp_labor for under-15s. A fix that makes grp_labor always show would be a different bug.
3. **AC1 is the crux** — section visibility must track the *current* answers (dob→age) reactively, not a mount-time snapshot. The trace points right at it (stale useState seed vs the reactive evalMemo already present). Should be a contained renderer fix.
4. **AC5 acquisition prominence — keep it non-blocking.** 13-1's review deliberately made "how did you hear" best-effort so a mandatory front-loaded question wouldn't self-own conversion days before spend. So: make it PROMINENT and legible, optionally soft-required, but do NOT hard-block submit on it. Prominence ≠ mandatory.
5. **Scope:** the two are bundled because they share the Step-4/5 surface and both are launch-UX; that's efficient, but the reactivity fix must not wait on the prominence polish — ship them together, prioritise AC1-4.

**No AC changes.** Dev-ready.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-11 | Story drafted via *create-story — the wizard's calculated-field-dependent section relevance (grp_labor gated on ${age}>=15, age from dob) is evaluated from a stale mount-time snapshot, so occupation questions are skipped on pass 1 and only surface after a "go back and fill survey" loop at Review. Fix = reactive section-relevance evaluation (general, preserves the under-15 skip + 13-19's gate) + elevate the 13-1 acquisition question's prominence (non-blocking). EMERGENT from the Dry-run #2 live registration. LAUNCH-RELEVANT. | Bob (SM) |
