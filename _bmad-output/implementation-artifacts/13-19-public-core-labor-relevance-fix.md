# Story 13-19: Fix Public Core labor-block relevance (occupation is not being captured)

Status: ready-for-dev

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
- [ ] **Task 1 (AC1, AC2)** — edit `docs/launch-campaign/oslsr-public-core-v1.xlsx`: strip the `relevant` from the 3 labor questions; grep every survey `relevant`/`calculation`/`constraint` cell for references to fields not present in the Public Core; fix. Sync `test-fixtures/oslsr-public-core-v1.xlsx`.
- [ ] **Task 2 (AC3)** — verify via `XlsformParserService.validate` (0 errors; the 3 acceptable warnings stay). Operator: re-upload + re-pin. Dry-run → confirm the 3 labor fields now persist in `raw_data`.
- [ ] **Task 3 (AC4)** — record the un-recoverable-occupation note for the pre-fix rows.

## Dev Notes
- **This is a form-only fix** (no code) — but it's LAUNCH-GATING: capturing skills without occupation makes the register incomplete for the whole public channel. Do it before the blast, re-pin, and re-run the AC6 dry-run.
- **Why the relevance was there:** copy-paste from the Full form where the labor-force screen gates the deep block. The Public Core cut the screen but kept the gated questions → dead relevance. The general lesson (capture in AC2): **when you cut a field, sweep every relevance/calc that referenced it.**
- **Coordinate with 13-20 (skill_list 150):** both edit the Public Core survey/choices and both need a re-upload. If 13-20 lands close in time, batch them into ONE re-upload to avoid publishing the form three times. 13-19 is the launch-gating half; 13-20 is the quality half.

### References
- [Source: docs/launch-campaign/oslsr-public-core-v1.xlsx — survey grp_labor: main_occupation/employment_type/years_experience, `relevant = ${employment_status}='yes' or ${temp_absent}='yes'`]
- [Source: prod 2026-07-06 dry-run submission — raw_data missing the 3 labor fields]
- [Source: apps/api/src/services/xlsform-parser.service.ts — `.validate()` upload gate; 13-14 for the form/pin mechanics]

## Dev Agent Record
### File List

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
