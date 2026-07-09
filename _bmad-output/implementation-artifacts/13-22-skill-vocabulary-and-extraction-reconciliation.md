# Story 13-22: Root out the skill-vocabulary + skills-extraction drift (canonical sector map + JSON-array read)

Status: ready-for-dev

<!-- Drafted 2026-07-09 (Amelia, scoped against PROD). EMERGENT from the 13-20 code-review: expanding skill_list to the canonical 150 surfaced that the skills subsystem carries THREE unreconciled vocabularies AND a storage/extraction format mismatch that silently breaks the skills analytics on 100% of real data. This is the LGA-UUID/slug situation (13-16) for skills — resolve it decisively at the source, not with another band-aid. -->

## Story
As **the Ministry / anyone reading the skills inventory, gap analysis, or a respondent's own skills breakdown**,
I want **one canonical skill vocabulary and one correct way to read stored skills**,
so that **skills analytics reflect what people actually registered — instead of dumping ~90/150 skills into "Other" and mis-tokenising every multi-skill answer into garbage.**

## Context & Evidence (verified against PROD `oslsr_db`, 2026-07-09)
Two independent defects, same root (vocabulary/format drift the codebase never reconciled):

1. **Storage↔extraction format mismatch (HIGH — live, all real data).** The wizard stores `skills_possessed` as a **JSONB array** — confirmed **79/79 prod submissions** are `jsonb_typeof = array`, e.g. `["painting", "nursing", "electrical", "solar"]` (comma-space separated). But every SQL consumer reads it with `unnest(string_to_array(raw_data->>'skills_possessed', ' '))` — splitting on **space**. On a real row that yields tokens like `["painting",` / `"nursing",` / `"solar"]` — malformed brackets/quotes/commas. Result: the skills inventory frequency, gap analysis, and per-sector rollups are **counting garbage tokens on 100% of real submissions**. Affected reads:
   - `apps/api/src/services/survey-analytics.service.ts:967` (`getSkillsInventory` allSkills → byCategory → gapAnalysis)
   - `apps/api/src/services/personal-stats.service.ts:493` (a respondent's own skills)
   - `apps/api/src/services/public-insights.service.ts:146` (public skills) **and `:159` (`training_interest`, same select_multiple serialization)**
   - `apps/api/src/workers/marketplace-extraction.worker.ts:95` is INCONSISTENT — it has both a `skillsStr.split(' ')` path and an `Array.isArray` branch (its tests feed both `'carpentry plumbing'` and `['carpentry','plumbing']`), so the codebase itself disagrees on the format.
2. **Skill→sector vocabulary drift (MEDIUM — grouping broken since inception).** `packages/types/src/skills-taxonomy.ts` `ISCO08_SECTOR_MAP` is a **third, largely fictional** skill vocabulary (151 keys: `bricklaying`, `crop_farming`, `security_guard`, `solar_pv`, `pos_agent`, `aso_oke_weaving`…). Measured against the canonical 150 from 13-20:
   - only **60/150** canonical slugs resolve to a sector → **90/150 fall to `'Other'`** today (this was already true for most of the original 61 — the map has `bricklaying` not `masonry`, `farming`→`crop_farming`, `security`→`security_guard`, `solar`→`solar_pv`…);
   - **91/151** map keys are phantom (no form ever emitted them).
   - Consumers: `survey-analytics.service.ts:988` (`byCategory`) and `apps/web/.../ComboboxMultiSelect.tsx:24` (wizard grouping) — both `|| 'Other'`.
   - **No guard protects it**: the 151-entry parity test lives in `packages/types`, which has **no `test` script**, so it never runs under `pnpm test`.
3. **Custom free-text skills exist.** Confirmed prod values `custom_realtor`, `custom_lecturer` (the ComboboxMultiSelect "add custom" affordance, `custom_` prefix). These legitimately are NOT in any taxonomy and must be counted as a defined bucket, never silently dropped.

This is the **13-16 pattern** (canonical `Lga`/`lgas.code` + write-site canonicalisation + backfill + running guard) applied to skills. 13-20 already delivered the canonical vocabulary (`SKILL_TAXONOMY`/`SKILL_SLUGS`) + the upload guard; this story reconciles the *readers* and the *sector map* onto it and fixes the extraction.

## Acceptance Criteria
1. **AC1 — Single source of truth for skill→sector.** Derive a `skillSectorForSlug(slug)` / `SKILL_SECTOR_BY_SLUG` from `SKILL_TAXONOMY` (13-20). Replace the hand-maintained `ISCO08_SECTOR_MAP` so every canonical slug resolves to its Appendix-C sector (verify: the 90 currently-'Other' canonical slugs now resolve). Retire the now-dead `ISCO08_SECTORS` export and the non-running 151-entry `packages/types` test (or repoint it). Keep a single, intentional `'Other'` bucket for non-canonical/custom values.
2. **AC2 — Correct JSON-array extraction, unified.** Replace space-splitting with a single shared skills extractor that reads the JSONB array (`jsonb_array_elements_text(raw_data->'skills_possessed')`), with a defensive fallback for any legacy scalar/space form found in the audit (AC4). Apply to ALL consumers in Context §1 (survey-analytics allSkills/byCategory/gapAnalysis/byLga, personal-stats, public-insights possessed **and** `training_interest`, and reconcile the marketplace worker onto the same rule). Real-DB tests prove a multi-skill row (`["a","b","c"]`) yields 3 correct tokens and sane frequencies.
3. **AC3 — Custom skills bucketed, not dropped.** `custom_*` (and any non-canonical) values resolve to a defined `'Other'`/`'Custom trade'` category, are counted, and are excluded from canonical-only rollups where that matters. Documented + tested.
4. **AC4 — Prod value audit + CONDITIONAL slug backfill (mirror 13-16; PM-amended).** Enumerate every distinct stored `skills_possessed`/`training_interest` value vs the canonical 150 + `custom_` prefix (record the tally in the Dev Agent Record). **The format fix (AC2) is read-only — NO `skills_possessed` migration.** A backfill applies ONLY to any *real* non-canonical, non-`custom_` *slug* value the audit surfaces (alias to canonical, mirror `FOSSIL_LGA_ALIASES`) — expected to be a **no-op** (prod samples are all canonical or `custom_`). Do not build backfill machinery unless the audit finds drift; if it does, idempotent + audited (`logActionTx`) + CSV backup + dry-run→apply via Tailscale.
5. **AC5 — A drift guard that actually runs.** Author the parity/extraction guards in a suite that runs under `pnpm test` (i.e. `apps/api`, not `packages/types`): every canonical slug has a sector; the sector map has zero non-canonical keys; the shared extractor on a JSONB-array fixture returns the right tokens; combobox grouping resolves the 150. So this cannot silently drift again.
6. **AC6 — Consumer sweep sign-off.** Enumerate every skills consumer (SQL + TS + web) and confirm each uses the shared extractor + derived sector map; none left on space-split or the phantom map. Full api + web suites green; tsc/eslint clean.

## Tasks / Subtasks
- [ ] **Task 1 (AC4, AC6)** — Prod/`app_db` audit: distinct `skills_possessed` + `training_interest` values, canonical vs `custom_` vs unknown. Produces the alias list (if any) + the consumer inventory. (Scope-confirm BEFORE coding.)
- [ ] **Task 2 (AC2, AC3)** — Shared skills extractor (JSONB-array read + custom/fallback handling); migrate survey-analytics, personal-stats, public-insights (possessed + training_interest), reconcile marketplace worker. Real-DB tests.
- [ ] **Task 3 (AC1)** — Derive `SKILL_SECTOR_BY_SLUG` from `SKILL_TAXONOMY`; replace `ISCO08_SECTOR_MAP`; repoint analytics byCategory + ComboboxMultiSelect; retire dead `ISCO08_SECTORS` + non-running test.
- [ ] **Task 4 (AC4)** — Alias map + idempotent audited backfill (only if audit finds real non-canonical values); CSV backup; dry-run→apply.
- [ ] **Task 5 (AC5, AC6)** — Running guard tests in apps/api; full-suite + tsc/eslint gate; sweep sign-off.

## Dev Notes
- **Mirror 13-16 exactly:** canonical source (`SKILL_TAXONOMY`) → derive the map → sweep consumers → alias/backfill legacy values → running guard. Proven; it's why `lga_list` can't drift.
- **`packages/types` has NO test script** → its tests don't run under `pnpm test`. The guard MUST live in `apps/api` (that's why 13-20's parity test does).
- **Not gated on the form re-upload.** 13-20 already put the 150 in the form; this story is code + a prod data audit/backfill, deployable on its own. The sector/extraction fixes ship independently of the 13-19/13-20 re-upload.
- **Priority (proposed, for John):** the extraction bug makes the skills inventory — a core analytical deliverable — wrong on all real data; recommend **HIGH / pre-launch-eligible** for AC2 at minimum. AC1/AC3/AC5 ride with it cheaply.
- **Watch:** `training_interest` shares the serialization; suppression thresholds (`SUPPRESSION_MIN_N`, per-LGA/general N) may currently MASK the garbage (buckets suppressed at low N) — the bug surfaces exactly when data grows post-launch, so fixing now prevents a launch-window regression-in-perception.

### References
- [Source: packages/types/src/skills-taxonomy.ts — `SKILL_TAXONOMY`/`SKILL_SLUGS` (13-20) + the legacy `ISCO08_SECTOR_MAP` to replace]
- [Source: survey-analytics.service.ts:963-998; personal-stats.service.ts:493; public-insights.service.ts:146-162; marketplace-extraction.worker.ts:69-95 — the extraction sites]
- [Source: apps/web/src/features/forms/components/ComboboxMultiSelect.tsx:18-28 — groupChoices]
- [Pattern: Story 13-16 `FOSSIL_LGA_ALIASES` + `canonicalizeLgaId` + audited backfill; memory lgaid-uuid-slug-split]
- [Evidence: PROD `oslsr_db` 2026-07-09 — 79/79 skills_possessed are JSONB arrays; 90/150 canonical slugs → 'Other'; 91/151 map keys phantom; custom_realtor/custom_lecturer present]

## PM Validation (John, 2026-07-09)

**Validated — APPROVED with scope refinements + one AC amendment. Priority: HIGH, sequenced BEHIND 13-21; NOT launch-blocking.**

1. **Priority & sequencing.** This is a real correctness defect on a core deliverable, so HIGH — but it is **not blast-gating**: the skills inventory / gap analysis are *internal* dashboards, not shown to registrants during the campaign, and the wizard combobox still functions (search + select + custom) even with 'Other' headers. So the launch order stands: **13-19 (form, launch-gating) → 13-21 (blast referral integrity) → 13-22**. 13-21 outranks this because a dead referral loop wastes live spend; a wrong internal dashboard does not. **AC2 is the exception** — it's code-only, deploy-independent, and can land pre-launch on its own if 13-21 lands with runway; otherwise immediate post-launch fast-follow.
2. **Scope WIN — the format fix carries NO data migration.** The stored JSONB arrays are the *correct* representation; only the reader is wrong. So AC2 is read-side only — no `skills_possessed` rewrite, unlike 13-16's LGA backfill. **Amend AC4:** the backfill is *conditional and expected to be a no-op* — it applies ONLY to non-canonical, non-`custom_` *slug* values IF the Task-1 audit finds any (prod samples are all canonical or `custom_`, so likely zero). Do not build backfill machinery speculatively; the audit gates it. This drops the story's risk profile substantially.
3. **Custom skills (AC3) — locked semantics.** `custom_*` values are REAL skills a registrant declared → **include them in `allSkills` frequency** (flagged as non-taxonomy) and **group them under one `'Other / Custom trades'` bucket** in `byCategory`. Never silently drop; never attempt to canonicalise them. That's the intended, honest behaviour.
4. **Marketplace worker — IN scope, "align not rewrite."** It already has an `Array.isArray` branch, so it's largely correct; the ask is to route it through the ONE shared extractor so it can't drift from the SQL readers — a low-risk consolidation, not a behaviour change. Pin its existing behaviour with the tests it already has.
5. **`training_interest` — IN scope** (same select_multiple serialization; same bug at public-insights:159). Good catch; keep it.
6. **Guard location — endorsed, and go further:** put the guard in `apps/api` (packages/types has no test script). **Delete** the never-running 151-entry `packages/types` test rather than leaving it — a test that implies coverage it doesn't provide is worse than none (it's what let this drift ship). 
7. **No AC-count change** (still 6 ACs / 5 Tasks); only AC4's wording softens to conditional-on-audit per §2.

**Definition-of-done additions:** (a) a real-DB test seeded with the *actual* prod shape `["a","b","c"]` proving 3 correct tokens + sane frequency; (b) an explicit "no regression to marketplace extraction + registry export" assertion; (c) Task 1's audit output (distinct values: canonical / `custom_` / unknown) recorded in the Dev Agent Record so the backfill decision is auditable.

**Dev-ready.** Start with Task 1 (prod value + consumer audit) to confirm the backfill is a no-op before any code. Schedule AC2 as an independently-shippable slice.

## Dev Agent Record
### File List

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-09 | Story drafted (scoped against PROD). Root-out the skills vocabulary + JSON-array extraction drift surfaced by 13-20: derive the sector map from SKILL_TAXONOMY, fix the space-split-vs-JSON-array read across all consumers, bucket custom skills, audit/backfill legacy values, add a RUNNING guard. Mirrors 13-16. | Amelia (Dev, from 13-20 review) |
| 2026-07-09 | PM validation (John): APPROVED. HIGH but sequenced behind 13-21; NOT launch-blocking (AC2 independently shippable). Key ruling: format fix is READ-ONLY (no data migration) → AC4 backfill softened to conditional-on-audit (expected no-op). Custom-skill bucket semantics locked; marketplace worker = align-not-rewrite; delete the never-running 151 test. DoD additions: real-DB test on prod shape + no-regression assertion + audit tally recorded. | John (PM) |
