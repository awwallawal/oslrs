# Story 13-20: Expand `skill_list` to the canonical 150-skill taxonomy (from Appendix C)

Status: ready-for-dev

<!-- Authored 2026-07-06 by Bob (SM) via *create-story. The forms' skill_list has only 61 options while the validator (OSLSR_REQUIRED_CHOICE_LISTS.skill_list.minOptions=150, "ISCO-08 aligned skills across 20 sectors") + the baseline study expect 150. The canonical 150-skill taxonomy already EXISTS in appendix-c-skills-taxonomy.md as a clean table (#, Skill, Sector, ISCO-08). This is an EXTRACTION into the form choices + a canonical guard, mirroring the Lga-enum work in 13-16 — not an invention. -->

## Story
As **the Ministry / anyone analysing skills×LGA**,
I want **the registry's `skill_list` to carry the full canonical 150-skill occupational taxonomy** (ISCO-08 aligned, 20 sectors),
so that **respondents can select their actual trade from a complete list — the register's core analytical payload isn't truncated to 61.**

## Context & Evidence
- Both instruments (`oslsr-public-core-v1.xlsx` + the Full master) carry `skill_list` = **61 options**; the validator warns `minOptions: 150` (a pre-existing warning, non-blocking, on both forms).
- **The 150 exist and are authoritative:** `_bmad-output/baseline-report/appendices/appendix-c-skills-taxonomy.md` — a complete markdown table `| # | Skill | Sector | ISCO-08 |`, 150 rows across 20 sectors (Construction, Automotive, Fashion/Beauty, …), each with an ISCO-08 code.
- So this is a **sourced extraction + a drift guard**, directly parallel to 13-16's `Lga` enum + `canonicalValues` work.

## Acceptance Criteria
1. **AC1 — Canonical Skill source of truth.** Add a canonical 150-skill list derived from Appendix C — a `Skill` enum / const (stable slug `name` per skill + human `label`; slugs snake_case, deterministic) in `packages/types` alongside the `Lga` enum. Wire it into `OSLSR_REQUIRED_CHOICE_LISTS.skill_list.canonicalValues` (like `lga_list`) so the parser warns on any non-canonical `skill_list` value. Parity test: enum count == 150 == Appendix-C rows.
2. **AC2 — Forms carry the full 150.** Regenerate the `skill_list` choices (150 rows: `list_name=skill_list, name=<slug>, label=<Skill>`) in BOTH `docs/launch-campaign/oslsr-public-core-v1.xlsx` and the Full master (email-master, GITIGNORED — patch it, note it's invisible in diffs) + `test-fixtures` copies + the generator (`scripts/generate-xlsform.cjs`). Sector may be carried as a `label`/group hint if the form supports it; ISCO-08 is reference-only.
3. **AC3 — Aggregation-safe slugs.** The `skills_possessed` values that land in `raw_data` are the stable slugs (not free text), so skills analytics group cleanly. Any prior 61-skill slugs that MAP to a canonical skill keep the SAME slug (don't renumber existing skills — additive where possible) so existing `skills_possessed` data stays joinable; document any slug that had to change.
4. **AC4 — Upload valid, warning cleared.** After the edit, `XlsformParserService.validate` shows the `skill_list` 150-minimum warning GONE (61→150). Re-upload + re-pin (coordinate with 13-19). A dry-run can select a newly-added skill.
5. **AC5 — Tests + suites green.** Enum/parity + canonical-value pin tests; full api + web suites green; tsc/eslint clean.

## Tasks / Subtasks
- [ ] **Task 1 (AC1)** — parse Appendix C's table → `Skill` enum/const (150 slug+label) in `packages/types`; add `skill_list.canonicalValues`; parity test (150 == appendix rows).
- [ ] **Task 2 (AC2, AC3)** — regenerate `skill_list` choices in generator + all XLSX (public-core + master + gitignored email-master + test-fixtures); preserve existing slugs where a skill already existed (additive); document any changed slug.
- [ ] **Task 3 (AC4, AC5)** — `.validate()` (warning cleared) + parser canonical-pin tests; full suites; re-upload/re-pin is the operator step (batch with 13-19).

## Dev Notes
- **Mirror 13-16's Lga work exactly:** canonical enum in `packages/types` → `canonicalValues` on the choice list → parser warning → parity test. That pattern is proven and prevents the taxonomy drifting again.
- **NOT launch-blocking** — 61 skills work (the form uploads; the 150-min is a warning). This is a quality/completeness improvement. Priority per PM (below).
- **Additive slug discipline (AC3) matters:** if a public registrant already picked `tailoring` under the 61-list, keep that slug in the 150-list so their `skills_possessed` still resolves. Only ADD the ~89 missing skills; don't churn the 61.
- **Batch the re-upload with 13-19** (both edit the Public Core) so the form publishes once, not twice.

### References
- [Source: _bmad-output/baseline-report/appendices/appendix-c-skills-taxonomy.md — the 150-skill table (#, Skill, Sector, ISCO-08)]
- [Source: packages/types/src/questionnaire.ts:149 — `skill_list: { minOptions: 150, … }`; the `Lga` enum + `lga_list.canonicalValues` pattern from 13-16 to mirror]
- [Source: scripts/generate-xlsform.cjs; docs/launch-campaign/oslsr-public-core-v1.xlsx; test-fixtures/ — the choice-list write sites]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-06)

**Validated — approved. NOT launch-blocking; pre-launch-eligible if time allows, else fast-follow.**

1. **Priority:** 61 skills work today (warning-only). The 150 is a completeness/analytical-quality win, not a gate. **If it can ride the SAME re-upload as 13-19 (launch-gating), do it then** — one publish, both fixes, and the register launches with the full taxonomy. If 13-19 must ship first for schedule, 13-20 is a clean post-launch fast-follow (additive slugs mean it can land any time without disturbing prior data).
2. **AC3 (additive slugs) is the load-bearing constraint — elevate it.** The ONLY way this breaks something is renumbering existing skills and orphaning prior `skills_possessed` values. Preserve every existing slug; only ADD the ~89 missing. A test that asserts the 61 legacy slugs still exist in the 150 would be worth adding.
3. **Mirror 13-16 exactly (right call):** canonical `Skill` enum in `packages/types` + `canonicalValues` + parser warning + parity test. Proven pattern; it's why `lga_list` can't drift now. Same guarantee for skills.
4. **Sector metadata:** carry the Appendix-C sector as a grouping/label hint if cheap, but don't block on form-engine support — the slug+label is the must-have; sector/ISCO-08 are analytical reference (can live in the enum/taxonomy doc, not necessarily the form).

**No AC changes.** Dev-ready; schedule against 13-19's re-upload.

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-06 | Story drafted via *create-story — extract the canonical 150-skill taxonomy from Appendix C into a Skill enum + canonicalValues guard + the form choices (mirrors 13-16 Lga work); additive slugs preserve existing skills_possessed data. Quality, NOT launch-blocking. | Bob (SM) |
