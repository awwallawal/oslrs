# Story 13-41: CI guard against unsafe SQL casts on TEXT columns (the 22P02 / 22007 / 22P05 "false guard" class)

Status: ready-for-dev

<!-- Authored 2026-07-22, EMERGENT from the 13-34 adversarial code review. A "flaky" integration test was chased to ground and turned out to be a live production defect: staff registry list/search/detail and the fraud-detection detail read could return HTTP 500 with `22P02 invalid input syntax for type uuid`, because a `::uuid` cast was applied to `submissions.questionnaire_form_id` — a TEXT column that product code deliberately fills with non-UUID sentinels ('supplemental-survey', 'self-edit', legacy 'no-form-pinned-at-submit'). SCOPE DECISION (Awwal, 2026-07-22): guard the WHOLE class, not just `::uuid`. The root defect is that **a conjunct does not guard the conjunct beside it** — SQL imposes no evaluation order across AND/WHERE — so the identical trap exists for `::int`, `::numeric`, `::date`, `::timestamptz`, `::jsonb`, `::boolean` and for any "filter then operate" pair (division guards included). Writing the wide checker is the same volume of work as the narrow one; the narrow one would leave the next variant to be rediscovered in production. 13-34 fixed the 5 live sites; this story makes the shape unwritable. Sibling of 13-37 (registry-read drift guard) — same script/allowlist/escape-hatch/CI mechanics. POST-LAUNCH tooling; NOT launch-gating. -->

## Story

As **a maintainer of the API's raw-SQL layer**,
I want **CI to fail when SQL casts a TEXT column to a stricter type, or relies on a neighbouring conjunct to make an operation safe**,
so that **a sentinel or malformed value in a TEXT column can never again turn a staff-facing read into an intermittent 500 — the whole class is caught mechanically at write time instead of surfacing months later as a "flaky test" nobody trusts.**

## Context & Evidence (verified 2026-07-22)

- **The defect was real and shipped, five times.** Casts of `submissions.questionnaire_form_id` (TEXT) to `uuid`: `respondent.service.ts` ×3 (registry list/search, respondent detail, submission-response detail) "guarded" by `col ~ <uuid regex> AND col::uuid = qf.id`; `fraud-detections.controller.ts:231` with **no guard at all**; plus `supervisor.controller.ts:144` casting `submitter_id::uuid` (prophylactic — no non-UUID writer today). All fixed in 13-34 by joining in TEXT space (`qf.id::text = s.questionnaire_form_id`).
- **The guard idiom is the actual bug.** `WHERE`/`AND` conjuncts have no defined evaluation order in SQL; Postgres may evaluate `col::uuid` on rows the regex was meant to exclude and abort the statement. **Plan-dependent** ⇒ it can pass for months and start failing when row counts or stats shift the plan ⇒ it presents as an intermittent test failure, not a bug.
- **The class is wider than `uuid` — same trap, different SQLSTATE:**
  | Written | Fails as | Realistic trigger here |
  |---|---|---|
  | `text_col::uuid` | `22P02` | sentinels (`supplemental-survey`, `self-edit`) — **already happened** |
  | `text_col::int` / `::numeric` | `22P02` | any free-text numeric answer in `raw_data` (`'12 years'`, `''`) |
  | `text_col::date` / `::timestamptz` | `22007`/`22008` | XLSForm date answers, partial dates, `'N/A'` |
  | `text_col::jsonb` | `22P02` | any hand-built JSON string column |
  | `num / other_col` | `22012` | a `WHERE other_col <> 0` conjunct does NOT protect the division |
  Every one is the same sentence: *a filter beside an operation does not order that operation*. `raw_data->>'…'` is TEXT by definition and is the project's most common source of cast targets, so the non-`uuid` variants are not hypothetical.
- **Doc-only enforcement already failed here.** The comment `// Guard UUID casts from legacy/non-UUID questionnaire_form_id values in submissions` sat directly above the broken guard and was copied to a second site. A comment that *describes* the hazard did not prevent it; four writings survived review.
- **Precedent to mirror:** 13-37 (`lint-registry-read-drift.ts`) — standalone `tsx` script exporting a pure finder fn, file allowlist with reasons, inline escape hatch, blocking step in `lint-and-build`, and a test asserting it catches *and* permits.

## Acceptance Criteria

1. **AC1 — Detect casts of TEXT columns to a stricter type.** A script (`apps/api/scripts/lint-unsafe-sql-cast.ts`, exposed as a `pnpm` script) scans `apps/api/src/**` for `<column-expression>::<type>` where the target resolves to a TEXT column and `<type>` is any of `uuid`, `int`/`integer`/`bigint`/`smallint`, `numeric`/`decimal`/`real`/`double precision`, `date`, `timestamp`/`timestamptz`, `time`, `boolean`, `json`/`jsonb`. Exits non-zero on any hit not covered by AC3. **Casts TO `text` are never flagged** (they cannot throw — and are the remedy).
2. **AC2 — Bound parameters are NOT flagged.** `${id}::uuid`, `$1::uuid`, `${new Date()}::timestamptz` are the safe, ubiquitous, correct usage. Flagging them would drown the signal and train reflexive escape-hatching. Only casts whose target is a **column reference** (`alias.column`, `${table.column}`, a bare known column name) are candidates.
3. **AC3 — TEXT-column awareness + suppression (near-zero false positives).** The checker derives the TEXT-column name set from the Drizzle schema (`apps/api/src/db/schema/**`, `text('…')` declarations) — a `uuid`-typed column cast to `uuid` is a no-op, not a hazard. Ambiguous raw-SQL aliases fall back to matching the column NAME against that set. Plus (i) a file allowlist with a one-line reason each, and (ii) an inline `// sql-cast-ok: <reason>` escape hatch; **no reason ⇒ failure**.
4. **AC4 — Flag the FALSE-GUARD idiom independently of type resolution.** Report `col <regex/LIKE/IS NOT NULL/<> ''/comparison> … AND … col::<type>` (either order, same SQL template) with its own message: *AND does not order evaluation — the filter does not protect the cast*. This must fire even when the column's type cannot be resolved, because it is the exact shape that shipped. Same treatment for a division whose only protection is a sibling `<> 0` conjunct (`22012`).
5. **AC5 — `raw_data->>'…'` targets count as TEXT.** A JSONB `->>` extraction is TEXT by definition; casting it (`(s.raw_data->>'age')::int`) is the most likely future instance of this class in this codebase. Flag it, and point at the safe forms in the message.
6. **AC6 — Wired into CI as a blocking step.** Runs in the deploy-gating `lint-and-build` job (`.github/workflows/ci-cd.yml`) as its own step, and locally via `pnpm --filter @oslsr/api lint:sql-cast`, folded into the package `lint` chain. (Scripts sit outside tsconfig — RUN it; don't trust `tsc`.)
7. **AC7 — Actionable failure message with the remedy per type.** `file:line` + snippet + WHY (SQLSTATE, plan-dependent 500, the 13-34 incident) + the fix:
   - joins → **cast the typed side to text** (`uuid_col::text = text_col`);
   - value use → **order the evaluation explicitly** with `CASE WHEN <test> THEN <cast> END`, or use a total function (`NULLIF`, `to_date(…)` with validation, `pg_input_is_valid(…, 'uuid')` on PG16+);
   - division → `NULLIF(divisor, 0)`.
   Plus the escape-hatch syntax.
8. **AC8 — Tests prove it catches and permits.** Fixtures covering: `s.questionnaire_form_id::uuid` FAILS · `(raw_data->>'age')::int` FAILS · `col ~ regex AND col::uuid` FAILS (even with types unresolvable) · `a / b` with a sibling `b <> 0` FAILS · `${id}::uuid` PASSES · `qf.id::text = s.questionnaire_form_id` PASSES · `CASE WHEN … THEN col::int END` PASSES · `NULLIF(b,0)` PASSES · allow-listed file PASSES · escape hatch with reason PASSES, without reason FAILS.
9. **AC9 — A runtime canary, not just a linter.** One integration test proves the *behaviour* the linter protects: insert a submission carrying the REAL `'supplemental-survey'` sentinel, then exercise the registry reads (`listRespondents` search + `getRespondentDetail`) and the fraud-detection detail read — all must return normally. (The registry half exists from 13-34 in `respondent-search-db-smoke.integration.test.ts`; extend to the fraud-detection read.) A linter can be escape-hatched; the canary cannot.
10. **AC10 — Green + zero false positives on the current tree.** Zero unallow-listed hits post-13-34; full API suite + `tsc --noEmit` + eslint clean; CI `lint-and-build` green with the new step. Any legitimate hit found during the sweep is either fixed or allow-listed **with a reason** — a silent widening of the pattern to make the tree pass is a story failure.

## Tasks / Subtasks

- [ ] **Task 1 — The checker core** (AC: #1, #2, #3, #5)
  - [ ] `apps/api/scripts/lint-unsafe-sql-cast.ts`, exporting a pure `findUnsafeCastHits(files)` so the test imports it without spawning a process (13-37 convention).
  - [ ] Build the TEXT-column name set by parsing `apps/api/src/db/schema/**/*.ts` for `text('column_name')` declarations. Cache it.
  - [ ] Match `::<type>` casts across multi-line tagged templates; classify the target as PARAM vs COLUMN vs `->>`-extraction; flag COLUMN/`->>` targets for the stricter-type list.
- [ ] **Task 2 — The false-guard detector** (AC: #4)
  - [ ] Independent matcher for `<filter on col> … AND … <cast of same col>` in one template (either order) and for division guarded only by a sibling conjunct. Type-resolution-independent by design.
- [ ] **Task 3 — Suppression + messaging** (AC: #3, #7)
  - [ ] File allowlist (`{ file, reason }`) + inline `// sql-cast-ok: <reason>` (scan the matched line and the line above); no-reason ⇒ failure. Per-type remedy strings in the message.
- [ ] **Task 4 — Wire it in** (AC: #6)
  - [ ] `"lint:sql-cast": "tsx scripts/lint-unsafe-sql-cast.ts"` in `apps/api/package.json`, folded into the package `lint` chain; step in `lint-and-build` next to the 13-37 guard (one "custom lints" block keeps CI legible).
- [ ] **Task 5 — Tests** (AC: #8)
  - [ ] Guard test in `apps/api/src/__tests__/` over the inline fixtures listed in AC8.
- [ ] **Task 6 — Runtime canary** (AC: #9)
  - [ ] Extend the 13-34 sentinel regression to the fraud-detection detail read (needs a `fraud_detections` row whose submission carries the sentinel).
- [ ] **Task 7 — Sweep + validate** (AC: #10)
  - [ ] Run on the current tree; triage every hit (fix or allow-list **with a reason**). Full API suite + tsc + eslint. Push; confirm CI runs the step green.

## Dev Notes

### Why WIDE, decided up front
Scoping this to `::uuid` would guard the instance we happened to be burned by and leave `(raw_data->>'x')::int` — a more likely future instance, since `->>` is TEXT by definition and the codebase reads `raw_data` everywhere — to be rediscovered in production. **The checker's cost is in the plumbing** (schema parse, template scanning, allowlist, escape hatch, CI wiring, tests), which is identical either way; the type list is a constant and the false-guard matcher is one more regex. Narrow scope would buy nothing and defer the same work. (Awwal, 2026-07-22: *"It is of no use to have foresight and not apply it. The volume of work does not reduce either way."*)

### Dependencies
- **13-34** — fixed the five live sites. This guard is meaningless before that lands (it would red on the tree it protects). NOT gating for 13-34's deploy; sequence after.
- No schema, no runtime code, no new prod deps (`tsx` is already a dev dep). CI/tooling only.

### Approach — why a script, not an eslint rule
- Same reasoning as 13-37: the casts live in multi-line SQL inside tagged templates, so an AST rule would re-assemble and regex the quasis anyway. A direct file scan is simpler to read and trivially unit-testable.
- **Credibility beats coverage.** A guard that fires on `${id}::uuid` gets escape-hatched reflexively and then protects nothing. AC2/AC3 (param exclusion + schema-derived TEXT set) are what make the wide scope tolerable; if a variant proves noisy in practice, narrow THAT variant with a documented reason rather than widening the escape hatch.

### Why AC9 exists
A linter guards the *shape*; the canary guards the *behaviour*. 13-34's lesson ([[pattern-flaky-test-hiding-a-prod-bug]]) is that this class hides behind plan-dependence — if someone escape-hatches the linter with a plausible reason, the canary still fails loudly. Note the inverse project lesson ([[pattern-ship-a-fix-that-never-fires]]): a guard that never executes against real data proves nothing, so the canary uses the REAL sentinel string, not an invented one.

### Project Structure Notes
- **NEW:** `apps/api/scripts/lint-unsafe-sql-cast.ts` + its test.
- **TOUCHED:** `apps/api/package.json` (script), `.github/workflows/ci-cd.yml` (CI step), `respondent-search-db-smoke.integration.test.ts` (canary extension).
- Scripts are outside tsconfig (project pitfall) — RUN the script to validate, don't rely on `tsc`.

### References
- [Source: 13-34 Dev Agent Record → "EMERGENT PRODUCTION DEFECT" + "Blast radius" — the incident, the 5 sites, the deterministic reproduction, the sentinel population]
- [Source: apps/api/src/services/respondent.service.ts:45-64 — the post-fix header explaining why AND does not order evaluation]
- [Source: apps/api/src/controllers/fraud-detections.controller.ts:231 — the unguarded variant]
- [Source: registration.controller.ts:129,1138 ('supplemental-survey'); me.service.ts:519 ('self-edit') — the sentinel writers]
- [Source: 13-37 registry-read-drift guard — script/allowlist/escape-hatch/CI-step precedent to mirror]

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-22 | Story drafted, EMERGENT from the 13-34 adversarial code review (a chased-to-ground "flaky" test exposed a live 22P02 500 class on staff registry + fraud-detection reads). Scoped WIDE on Awwal's ruling: the defect is not "uuid casts" but "a conjunct does not guard the conjunct beside it", so the checker covers every stricter-type cast on a TEXT column (incl. `raw_data->>'…'`), the false-guard idiom regardless of type resolution, and sibling-conjunct division guards — same plumbing cost, no deferred variants. 10 ACs / 7 Tasks. POST-LAUNCH tooling, not launch-gating; sequences after 13-34's API deploy. | Awwal (review) |
