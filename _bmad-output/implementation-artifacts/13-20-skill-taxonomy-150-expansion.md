# Story 13-20: Expand `skill_list` to the canonical 150-skill taxonomy (from Appendix C)

Status: done

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
- [x] **Task 1 (AC1)** — parse Appendix C's table → `Skill` enum/const (150 slug+label) in `packages/types`; add `skill_list.canonicalValues`; parity test (150 == appendix rows).
- [x] **Task 2 (AC2, AC3)** — regenerate `skill_list` choices in generator + all XLSX (public-core + master + gitignored email-master + test-fixtures); preserve existing slugs where a skill already existed (additive); document any changed slug.
- [x] **Task 3 (AC4, AC5)** — `.validate()` (warning cleared) + parser canonical-pin tests; full suites; re-upload/re-pin is the operator step (batch with 13-19).

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

### Context Reference
- Dev-story executed 2026-07-09 (Amelia). Branch `story/13-20-skill-taxonomy-150` off `main` (which already carries 13-19's Public Core labour-relevance fix at `0f182fb` — preserved untouched, see below).

### Implementation Plan / Approach
- **AC1 — canonical source of truth.** Added `SKILL_TAXONOMY` (150 rows: `{name, label, sector, isco}`), `SKILL_SLUGS` (the 150 slugs), and `SkillSlug` to `packages/types/src/skills-taxonomy.ts` — a faithful extraction of `appendix-c-skills-taxonomy.md`. Wired `skill_list.canonicalValues = SKILL_SLUGS` in `questionnaire.ts` (mirrors 13-16's `lga_list`). The parser's canonical-value warning (`xlsform-parser.service.ts`) was generalised from LGA-specific wording to serve both `lga_list` and `skill_list` (kept the `not a canonical` substring the 13-16 test pins).
- **AC2/AC3 — forms carry the 150, additive slugs.** All four XLSX (`docs/launch-campaign/oslsr-public-core-v1.xlsx`, `test-fixtures/oslsr-public-core-v1.xlsx`, gitignored `test-fixtures/oslsr_master_v3_email.xlsx`, `test-fixtures/oslsr_master_v3.xlsx`) had **only their `choices` sheet's `skill_list` rows** rewritten 61→150; survey/settings sheets and all other choice lists (lga_list=33, emp_type=6, …) are byte-for-byte preserved. The Public Core survey sheet is confirmed identical to `HEAD` (13-19's fix intact). The two Public Core copies were written once then `copyFileSync`'d → byte-identical (13-19's M1 invariant). Generator `scripts/generate-xlsform.cjs` skill array updated to 150 for future regenerations (NOT executed against the fixtures — it was restored from HEAD + re-patched after an accidental run to avoid regenerating the master survey sheet).
- **AC4 — validate() clean.** After expansion the `skill_list` min-options (61<150) warning is gone and no canonical warnings fire; the Public Core now validates with 0 errors and exactly 2 acceptable deferral warnings (`business_address`, `apprentice_count`).
- **AC5 — tests + suites.** New `apps/api/.../skill-taxonomy-canonical.test.ts` (10 tests): parity 150==Appendix-C row-for-row (label/sector/isco), unique snake_case slugs, 20 sectors, all 61 legacy slugs preserved, exactly 89 added, `security` label refinement, parser no-warn on the 150 / warns on a bogus value, Public Core carries exactly SKILL_SLUGS + warning-gone. Also canonicalised the parser test's valid-form fixture skill slugs (like 13-16 did for LGAs) so it emits no spurious warnings.

### Completion Notes
- ✅ **All 5 ACs met.** 150-skill canonical taxonomy shipped as the source of truth + `canonicalValues` guard + form choices + parity/legacy/canonical-pin tests.
- ✅ **AC3 (load-bearing) honoured:** all **61** legacy form slugs preserved verbatim → prior `skills_possessed` values stay joinable; **89** new slugs added. Test `preserves all 61 legacy form slugs` pins this.
- ⚠️ **One documented label refinement (NOT a slug change):** legacy slug `security` (was labelled *"Security Services"*) maps to Appendix-C #116 *"Private Security Guard"*. The **slug is unchanged** (no stored value orphaned); only the display label follows the canonical source. Every other legacy label is identical to before.
- 🔎 **Discovered drift (flagged for review / follow-up, OUT OF SCOPE):** `ISCO08_SECTOR_MAP` in `skills-taxonomy.ts` is a SEPARATE, older 151-entry sector-grouping map (consumed by the skills combobox `groupChoices` + analytics `getSkillsInventory.byCategory`, both with a safe `|| 'Other'` fallback) whose slugs (`bricklaying`, `plastering`, `solar_pv`, `security_guard`, …) predate and mostly do NOT match the real form slugs — so most skills already fall to 'Other' TODAY, and the new 150 will too. Reconciling it onto `SKILL_TAXONOMY` was deliberately NOT done here: it is unmentioned in the story/ACs and its own test (`cross-tab-skills.service.test.ts:241`) hard-codes `bricklaying`/`plastering`, so it is a genuine separate concern. Recommend a fast-follow to derive `ISCO08_SECTOR_MAP` from `SKILL_TAXONOMY` so grouping/analytics bucket the real slugs. Noted in a code comment atop the canonical block.
- 🧪 **Gates (run independently this session):** full **API suite 3018 passed / 7 skipped / 0 failed** (vs `app_test`); packages/types + apps/api + apps/web `tsc --noEmit` clean; apps/api eslint clean on changed files. Affected form/parser/taxonomy files (80 tests across 5 files incl. 13-19's byte-identity + orphan-sweep guards) green. Web suite: see File List note.
- 📦 **Operator residuals (per AC4, batch with 13-19):** re-upload the corrected Public Core xlsx + re-pin `wizard.public_form_id` via the audited UI (13-17), then re-run the AC6 dry-run BEFORE the blast. One publish covers both 13-19 and 13-20.

### File List
**Modified (tracked):**
- `packages/types/src/skills-taxonomy.ts` — added canonical `SKILL_TAXONOMY` (150), `SKILL_SLUGS`, `SkillSlug`, `SkillDefinition` + drift note; existing `ISCO08_SECTOR_MAP` untouched.
- `packages/types/src/questionnaire.ts` — `skill_list.canonicalValues = SKILL_SLUGS` (+ import).
- `apps/api/src/services/xlsform-parser.service.ts` — generalised the canonical-value warning message (serves lga_list + skill_list).
- `apps/api/src/services/__tests__/xlsform-parser.service.test.ts` — valid-form fixture skill slugs now canonical (SKILL_SLUGS) to avoid spurious warnings.
- `scripts/generate-xlsform.cjs` — `skill_list` array 61→150 (canonical, sector-grouped).
- `docs/launch-campaign/oslsr-public-core-v1.xlsx` — `choices.skill_list` 61→150 (survey sheet untouched). **LAUNCH-CRITICAL upload artifact.**
- `test-fixtures/oslsr-public-core-v1.xlsx` — byte-identical copy of the above (test guard).
- `test-fixtures/oslsr_master_v3.xlsx` — `choices.skill_list` 61→150 (survey sheet preserved from HEAD).

**Added (tracked):**
- `apps/api/src/services/__tests__/skill-taxonomy-canonical.test.ts` — 10 tests (AC1 parity, AC3 legacy-preservation, canonical-pin guard, AC2/AC4 form assertions).

**Modified (GITIGNORED — invisible in diffs):**
- `test-fixtures/oslsr_master_v3_email.xlsx` — Full/email-master enumerator form; `choices.skill_list` 61→150 (survey sheet preserved). Enumerator channel, NOT launch-blocking.

**Story tracking:**
- `_bmad-output/implementation-artifacts/13-20-skill-taxonomy-150-expansion.md` (this file), `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Senior Developer Review (AI) — 2026-07-09

**Outcome: APPROVED.** Adversarial review of the uncommitted tree on `story/13-20-skill-taxonomy-150`. All 5 ACs verified implemented; all 3 tasks genuinely done (not just checked). Git File List reconciles exactly with the story File List (plus the noted gitignored email-master). No CRITICAL / HIGH findings.

**Verified claims (attacked, held):**
- **AC1 parity** — `SKILL_TAXONOMY` is 150 rows and matches `appendix-c-skills-taxonomy.md` row-for-row on label/sector/isco (the parity test parses the appendix live, so it can't silently drift). `canonicalValues` wired; parser guard fires on a bogus value and stays silent on the 150.
- **AC3 additive slugs** — programmatically confirmed all 61 pre-change form slugs survive verbatim; exactly 89 added. Adversarial label-diff of the 61 legacy slugs old→new found **only** `security` changed ("Security Services" → canonical "Private Security Guard"); slug unchanged, so no stored `skills_possessed` value is orphaned. Documented.
- **Form integrity** — the Public Core survey sheet + every non-skill choice list is byte-for-byte identical to `HEAD` (13-19's labour-relevance fix intact); only `choices.skill_list` changed 61→150; the two Public Core copies are byte-identical (13-19 M1 guard green).
- **Gates re-run independently** — API 3018 pass / 7 skip; web 2744 pass / 2 todo; tsc clean (types/api/web); api eslint clean.

**Findings:**
- 🟢 **LOW (FIXED in-session):** `SKILL_TAXONOMY` had a widening `: readonly SkillDefinition[]` annotation defeating its `as const`, so `SkillSlug` collapsed to `string` (no enum-like safety — the story asked for an "enum"). Changed to `as const satisfies readonly SkillDefinition[]`; `SkillSlug` is now the literal 150-member union and `SKILL_SLUGS: readonly SkillSlug[]`. tsc + affected tests re-run green.
- 🟡 **MEDIUM (OUT OF SCOPE → tracked follow-up, does NOT block this story's ACs):** `ISCO08_SECTOR_MAP` (the older 151-entry sector map consumed by the skills combobox `groupChoices` + analytics `getSkillsInventory.byCategory`, both with a safe `|| 'Other'` fallback) was NOT reconciled to the canonical 150, so newly-added skills group under "Other" in those two surfaces. This is a pre-existing drift (most of the original 61 slugs already fell to 'Other'), the story ACs never scoped it, and its test hard-codes non-canonical slugs (`bricklaying`/`plastering`) — genuinely separate work. See Review Follow-ups.

### Review Follow-ups (AI)
- [x] [AI-Review][Med] Fast-follow: derive the sector map from `SKILL_TAXONOMY` so combobox + analytics `byCategory` group real slugs instead of 'Other'. **→ Promoted to Story 13-22** (scoped against PROD 2026-07-09, which ALSO uncovered a HIGH live bug: `skills_possessed` is a JSONB array but every consumer reads it space-split → skills analytics garbage on 100% of real data). See `13-22-skill-vocabulary-and-extraction-reconciliation.md`.

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
| 2026-07-09 | Dev-story complete (all 5 ACs). SKILL_TAXONOMY(150)+SKILL_SLUGS+SkillSlug in packages/types; skill_list.canonicalValues wired; parser warning generalised (lga+skill); skill_list 61→150 in all 4 XLSX (choices-only, survey sheets preserved, Public Core copies byte-identical, 13-19 fix intact) + generator. AC3: all 61 legacy slugs preserved, 89 added; `security` label refined "Security Services"→"Private Security Guard" (slug unchanged). +10 tests. Gates: API 3018 pass/7 skip, tsc clean (types/api/web), eslint clean. Flagged out-of-scope drift: ISCO08_SECTOR_MAP (older 151-entry grouping map) should be reconciled onto SKILL_TAXONOMY in a fast-follow. Status → review. | Amelia (Dev) |
| 2026-07-09 | Adversarial code-review APPROVED (0 Crit/High). LOW fixed in-session: `SKILL_TAXONOMY` now `as const satisfies` so `SkillSlug` is the literal 150-member union (was collapsing to `string`). One MEDIUM logged as an out-of-scope fast-follow (reconcile ISCO08_SECTOR_MAP → SKILL_TAXONOMY). Re-ran tsc (types/api/web) + affected tests green. Status → done. NOT committed (operator commits selectively). | Reviewer (AI) |
