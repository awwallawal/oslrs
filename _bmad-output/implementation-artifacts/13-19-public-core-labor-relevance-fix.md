# Story 13-19: Fix Public Core labor-block relevance (occupation is not being captured)

Status: review

<!-- Authored 2026-07-06 by Bob (SM) via *create-story. EMERGENT + LAUNCH-GATING from the 2026-07-06 AC6 dry-run: a real public registration through the pinned Public Core captured skills but NOT main_occupation/employment_type/years_experience. Root cause = those 3 questions carry a `relevant` condition referencing employment_status/temp_absent — fields that were CUT from the Public Core (the deferred labor-force block). The condition never evaluates true → the questions never render → occupation is silently dropped. Confirmed in prod: the dry-run submission raw_data had skills_possessed but none of occupation/employment_type/years_experience. -->

## Story
As **the registry (and every public registrant)**,
I want **the Public Core to actually ASK and capture `main_occupation`, `employment_type`, and `years_experience`**,
so that **the skilled-labour register records each person's occupation/trade — not just a skills multi-select** (occupation is the core registry payload).

## Context & Evidence
- **Prod (2026-07-06):** a live Public Core registration's submission `raw_data` contained `skills_possessed` but **NOT** `main_occupation`, `employment_type`, or `years_experience`.
- **Root cause (the form):** in `docs/launch-campaign/oslsr-public-core-v1.xlsx` (survey sheet), all three carry:
  `relevant = ${employment_status} = 'yes' or ${temp_absent} = 'yes'` — a leftover from the FULL instrument, where `employment_status`/`temp_absent` are the labor-force screening questions. Those two fields were **removed from the Public Core** (the deferred labor-force block). A relevance referencing absent fields evaluates false/undefined → the questions **never render**. Only `skills_possessed` (`relevant = -`) shows.
- This is the *actual* reason "only the skills question was asked" on the dry-run — NOT the identity dedup.

## Acceptance Criteria
1. **AC1 — Occupation/experience always ask.** In the Public Core survey, **remove the `relevant` condition** from `main_occupation`, `employment_type`, and `years_experience` (they have no valid predicate in the Public Core, so they should always render). Keep `required = yes`. (Do NOT re-introduce `employment_status`/`temp_absent` — they belong to the enumerator Full form.)
2. **AC2 — No other Public Core question references a cut field.** Audit EVERY `relevant`/`calculation`/`constraint` in the Public Core for references to fields that no longer exist in it (e.g. `employment_status`, `temp_absent`, and any other deferred labor/household/business field). Fix or remove each. (The dedup + cut created this class; sweep it once.)
3. **AC3 — Upload valid + captures occupation E2E.** The edited form passes `XlsformParserService.validate` (0 errors); after re-upload + re-pin, a public dry-run submission's `raw_data` now contains `main_occupation`, `employment_type`, `years_experience`, AND `skills_possessed`.
4. **AC4 — Existing rows noted, not silently lost.** The public registrations captured under the buggy form (the 2026-07-06 dry-run [being removed] + any real ones, e.g. `Modupe`/`dupsy5@gmail.com` if confirmed real) lack occupation and CANNOT be recovered without re-contact. Document this in the story/ops log; do NOT fabricate values. (Count is tiny — pre-blast.)

## Tasks / Subtasks
- [x] **Task 1 (AC1, AC2)** — edit `docs/launch-campaign/oslsr-public-core-v1.xlsx`: strip the `relevant` from the 3 labor questions; grep every survey `relevant`/`calculation`/`constraint` cell for references to fields not present in the Public Core; fix. Sync `test-fixtures/oslsr-public-core-v1.xlsx`.
- [x] **Task 2 (AC3)** — verify via `XlsformParserService.validate` (0 errors; the 3 acceptable warnings stay). Operator: re-upload + re-pin. Dry-run → confirm the 3 labor fields now persist in `raw_data`. _(Dev half DONE: validate → 0 errors / 3 acceptable warnings, and the converted native form now renders all 3 labour questions ungated. **OPERATOR RESIDUAL:** re-upload + re-pin `wizard.public_form_id` via the audited UI (13-17) + re-run the AC6 dry-run before the blast.)_
- [x] **Task 3 (AC4)** — record the un-recoverable-occupation note for the pre-fix rows. _(See AC4 note in Completion Notes.)_

### Review Follow-ups (AI)

Adversarial code-review 2026-07-08 (different LLM). 0 High, 2 Medium, 3 Low. No correctness defect — the fix genuinely captures occupation: independently confirmed the 3 labour cells are empty-relevant + `required=yes`, 0 orphan refs, the two xlsx copies are byte-identical (same sha256), and the `grp_labor` `${age} >= 15` gate resolves at runtime because the 9-54 evaluator computes `age = int((today() - ${dob}) div 365.25)`. Findings hardened the invariant guard itself:

- [x] **[AI-Review][Med] M1 — guard the operator-upload copy, not just the fixture.** The test only read `test-fixtures/…`; the operator uploads `docs/launch-campaign/…`. They were byte-identical but nothing pinned it — the exact silent-drift this story exists to prevent. Added a byte-identity assertion between the two copies. [public-core-form-relevance.test.ts — new `M1` test]
- [x] **[AI-Review][Med] M2 — widen the AC2 orphan sweep.** It only checked `relevant`/`relevance`/`calculation`/`constraint`; XLSForm `${field}` refs can also live in `choice_filter`/`default`/`readonly`/expression-form `required`. Added those columns so a future orphan can't hide where the guard wasn't looking. [public-core-form-relevance.test.ts:AC2]
- [x] **[AI-Review][Low] L1 — pin the `grp_labor` section gate.** No test asserted the `${age} >= 15` group gate survives; stripping it would ask under-15s for occupation (inverse silent-drop). Added an assertion that the section containing `main_occupation` retains its `showWhen`. [public-core-form-relevance.test.ts:AC3-native]
- [x] **[AI-Review][Low] L2 — assert warning IDENTITY, not just count.** `warnings.length <= 3` let a new unexpected warning silently swap in. Now every warning must be one of the known deferrals (`business_address`/`apprentice_count`/`skill_list`); still tolerates 13-20 removing the skill_list one. [public-core-form-relevance.test.ts:AC3-validate]
- [ ] **[AI-Review][Low] L3 — AC3 E2E remains an operator residual.** Task 2 is `[x]` for the dev half only; the real proof (a public dry-run whose `raw_data` carries all 3 labour fields) is still operator-gated. Honestly disclosed already — tracked here so it isn't lost: **re-upload + re-pin `wizard.public_form_id` via the audited UI (13-17) + re-run the AC6 dry-run BEFORE the blast.** [operator/ops]

## Dev Notes
- **This is a form-only fix** (no code) — but it's LAUNCH-GATING: capturing skills without occupation makes the register incomplete for the whole public channel. Do it before the blast, re-pin, and re-run the AC6 dry-run.
- **Why the relevance was there:** copy-paste from the Full form where the labor-force screen gates the deep block. The Public Core cut the screen but kept the gated questions → dead relevance. The general lesson (capture in AC2): **when you cut a field, sweep every relevance/calc that referenced it.**
- **Coordinate with 13-20 (skill_list 150):** both edit the Public Core survey/choices and both need a re-upload. If 13-20 lands close in time, batch them into ONE re-upload to avoid publishing the form three times. 13-19 is the launch-gating half; 13-20 is the quality half.

### References
- [Source: docs/launch-campaign/oslsr-public-core-v1.xlsx — survey grp_labor: main_occupation/employment_type/years_experience, `relevant = ${employment_status}='yes' or ${temp_absent}='yes'`]
- [Source: prod 2026-07-06 dry-run submission — raw_data missing the 3 labor fields]
- [Source: apps/api/src/services/xlsform-parser.service.ts — `.validate()` upload gate; 13-14 for the form/pin mechanics]

## Dev Agent Record

### Implementation Notes
- **Root cause reproduced + fixed at source.** The Public Core `oslsr-public-core-v1.xlsx` is a hand-authored cut-down of the master (it is NOT produced by `scripts/generate-xlsform.cjs` — that generator emits the enumerator `oslsr_master_v3.xlsx`, which correctly *keeps* the labour-force screen). So the fix is a direct edit of the two Public Core binaries.
- **AC1** — cleared the `relevant` cell on `main_occupation`, `employment_type`, `years_experience` (they had `${employment_status}='yes' or ${temp_absent}='yes'` — a predicate over fields the Public Core cut). They now render whenever the `grp_labor` group shows (its group-level `${age} >= 15` gate is intentionally preserved) and stay `required = yes`. `employment_status`/`temp_absent` were **not** reintroduced (they belong to the enumerator Full form).
- **AC2** — swept every survey `relevant`/`calculation`/`constraint` cell for `${field}` references to names absent from the Public Core. After the fix there are **zero** orphan references (the 3 labour cells were the only ones; all other predicates — `${consent_basic}`, `${age}`, `${device_id}`, `${is_supervised_apprentice}`, `${consent_marketplace}`, `${dob}` — resolve to fields that exist). This invariant is now pinned by an automated test so a future field-cut can't silently re-orphan a predicate — `XlsformParserService.validate()` does **not** check this, which is why the bug shipped clean.
- **AC3** — the edited form passes `XlsformParserService.validate()` with **0 errors** and exactly **3 acceptable warnings** (`business_address` + `apprentice_count` = deferred business block; `skill_list` 61<150 = Story 13-20). The converted native form (`convertToNativeForm`) renders all 3 labour questions as ungated questions.
- **Both copies kept in lock-step** — `docs/launch-campaign/oslsr-public-core-v1.xlsx` (operator upload source) and `test-fixtures/oslsr-public-core-v1.xlsx` (test fixture) are content-identical after the edit (verified).
- **Form-only, zero runtime source touched.** Nothing in the app loads the Public Core xlsx at runtime (operator uploads it), so the regression surface is the form-handling tests only — all green.

### Completion Notes
- ✅ **AC1** — 3 labour questions always ask (field-level relevance removed, `required=yes` kept); cut screen fields not reintroduced.
- ✅ **AC2** — no Public Core `relevant`/`calculation`/`constraint` references a cut field (0 orphans), guarded by a new automated invariant test.
- ✅ **AC3 (dev half)** — validate = 0 errors / 3 acceptable warnings; native form renders occupation/employment/experience ungated. **Operator residual:** re-upload the corrected xlsx + re-pin `wizard.public_form_id` via the audited UI (13-17) + re-run the AC6 dry-run to confirm `raw_data` now carries `main_occupation`/`employment_type`/`years_experience` alongside `skills_possessed` — do this **before** the blast.
- ✅ **AC4 — un-recoverable pre-fix rows (documented, not fabricated):** Public registrations captured under the buggy form lack occupation and **cannot be recovered without re-contact.** Known pre-fix rows: (1) the 2026-07-06 AC6 dry-run submission — already **deleted** (clean); (2) `Modupe Adesina` / `dupsy5@gmail.com` (2026-07-06 11:34) — the **confirmed first real organic registration**, whose submission lacks `main_occupation`/`employment_type`/`years_experience` due to this bug. She is reachable by email → occupation is recoverable only by re-contact (a data-quality follow-up, not a code fix). Volume is trivial (pre-blast). **No values fabricated.**
- 🔎 **Reviewer note (scope):** the `grp_labor` group gate `${age} >= 15` is deliberately kept — occupation should ask for adults, and under-15 registrants flow through the guardian block instead (`grp_labor` hidden → its `required` questions are not enforced, per XLSForm relevance semantics).
- **Coordinate with 13-20:** if the skill-taxonomy 150 expansion lands close in time, batch both edits into ONE re-upload to avoid publishing the Public Core three times.

### File List
- `docs/launch-campaign/oslsr-public-core-v1.xlsx` — (modified) cleared orphan `relevant` on `main_occupation`/`employment_type`/`years_experience` in the survey sheet.
- `test-fixtures/oslsr-public-core-v1.xlsx` — (modified) same edit, kept in sync with the upload-source copy.
- `apps/api/src/services/__tests__/public-core-form-relevance.test.ts` — (new) pins AC1/AC2/AC3 against the shipped Public Core binary: no orphan field references, labour questions always-ask + required, validate 0 errors, native-form render check. **Review-hardened (2026-07-08):** byte-identity of the two xlsx copies (M1), widened orphan sweep to choice_filter/default/readonly/required (M2), `grp_labor` section-gate assertion (L1), warning-identity assertion (L2). 6 tests, all green.

## PM Validation (John, 2026-07-06)

**Validated — approved, LAUNCH-GATING. This one blocks the blast.**

1. **Severity: launch-gating, confirmed.** A skilled-labour register that captures a skills multi-select but not the person's stated **occupation/trade** is materially incomplete — and it's the *entire public channel* (the biggest volume the blast drives). Fix + re-upload + re-pin + re-dry-run BEFORE any paid spend. This is now the top pre-blast item alongside the operator checklist.
2. **AC2 is the real value (keep it non-negotiable).** The single relevance was the symptom; the disease is "cut a field, orphan its relevance." Sweeping EVERY Public Core `relevant`/`calculation`/`constraint` for references to deferred fields (household/business/labor block) is what prevents a second silent-drop surfacing mid-campaign. Don't ship AC1 without AC2.
3. **AC4 honesty:** the pre-fix rows (the dry-run [being deleted] + `Modupe` if real) genuinely can't get occupation back without re-contact — record it, don't fabricate. Volume is trivial (pre-blast); acceptable.
4. **Scope discipline:** strip the dead relevance, do NOT re-add `employment_status`/`temp_absent` (they were deliberately deferred to enumerators). Occupation should simply always ask.

**No AC changes.** Dev-ready and urgent.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-06 | Story drafted via *create-story — strip the dead labor-block relevance so the Public Core captures occupation/employment/experience (was silently dropping them). EMERGENT LAUNCH-GATING from the AC6 dry-run. Form-only. | Bob (SM) |
| 2026-07-07 | dev-story: cleared orphan `relevant` on the 3 labour questions in both Public Core xlsx copies (AC1); swept all relevant/calc/constraint → 0 orphan field refs (AC2); validate = 0 errors / 3 acceptable warnings + native form renders occupation ungated (AC3 dev half); AC4 un-recoverable-row note recorded (dry-run deleted; Modupe recoverable by re-contact only). New invariant test `public-core-form-relevance.test.ts` (5 tests). Form-handling regression green (52), tsc + eslint clean. Operator residual: re-upload + re-pin + re-run AC6 dry-run before blast. Status → review. | Amelia (Dev) |
| 2026-07-08 | Adversarial code-review (different LLM). No High: independently verified the fix works (empty-relevant + required=yes on all 3; 0 orphans; two xlsx copies byte-identical; age-gate resolves via the 9-54 calculate evaluator). 2 Med + 3 Low, all logged as Review Follow-ups (AI). Fixed M1/M2/L1/L2 in the test file (byte-identity guard, widened sweep columns, section-gate assertion, warning-identity assertion — now 6 tests, all green; tsc + eslint clean). L3 (real E2E) left as tracked operator residual. Zero runtime source touched; xlsx binaries unchanged. Status stays `review` pending the operator re-upload/re-pin/dry-run. | Reviewer (AI) |
