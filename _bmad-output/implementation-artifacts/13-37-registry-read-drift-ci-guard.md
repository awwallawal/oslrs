# Story 13-37: CI guard against registry-read drift (canonical `registryUnifiedSource` enforcement)

Status: ready-for-dev

<!-- Authored 2026-07-19 by Bob (SM) via *create-story (draft), emergent from the 13-33 post-ship backlog-harmonization sweep. NOT launch-gating, POST-LAUNCH hygiene/tooling. 13-33 shipped the ONE canonical respondent-anchored registry read (registryUnifiedSource / registry_unified), and a backlog grep then found FIVE stories (12-4/12-5/12-6/12-7/13-2) still specced against the pre-13-33 submission-anchored / re-mirrored reads — each a latent re-fork of the drift 13-33 killed. Doc nudges (the read's header contract, the harmonization notes) rely on people reading them. This story makes the wrong way HARD TO WRITE: a CI guard that fails on a NEW hand-rolled respondent⟕submission registry read outside the sanctioned modules. Antidote to [[pattern-ship-a-fix-that-never-fires]] at the tooling layer. See feedback: canonical-primitive-backlog-sweep. -->

## Story

As **a maintainer of the registry analytics stack**,
I want **a CI guard that fails when new code hand-rolls a respondent⟕submission registry read outside the canonical `registryUnifiedSource` module**,
so that **consumers can't silently re-create the submission-vs-respondent drift Story 13-33 canonicalized — the guard catches a re-fork mechanically instead of a human sweep catching it story-by-story (or a dev shipping it wrong).**

## Context & Evidence (2026-07-19)

- **13-33 shipped the canonical read.** `apps/api/src/services/registry-unified.sql.ts` holds the ONE respondent-anchored SQL (`REGISTRY_UNIFIED_SQL_TEXT`); `registry-unified.ts` exposes it as `registryUnifiedSource('ru')`. Every registry-fact consumer (public-insights, `getRegistryCountCore`, and — post-launch — 12-4's `getRegistryTotals`) composes THAT shape. A parity smoke proves `view ≡ inline ≡ count-core ≡ export`.
- **The drift is easy to re-introduce.** The retired shapes are: (a) submission-anchored `FROM submissions s LEFT JOIN respondents r` (the exclusion/double-count bug — submission-less respondents dropped, multi-submission respondents double-counted), and (b) a hand-rolled `LEFT JOIN LATERAL (… submissions … ORDER BY submitted_at DESC … LIMIT 1)` copy of the latest-non-empty join. The 13-33 backlog sweep found **five** stories still specced against these.
- **Doc-only enforcement is insufficient.** The read's header now documents a "columns & why" + "adding a column" contract, and each drifted story got a harmonization note — but those are read-if-you-look. A CI guard is the "make the wrong way hard to write" rung: it would have flagged 12-6 and 12-4 mechanically.
- **Legitimately-scoped holders of the pattern exist** and MUST be allow-listed: the canonical module itself (`registry-unified.sql.ts`), `export-query.service.ts` (`getUnifiedExportData` — respondent-anchored, proven-equal, not force-refactored per 13-33 AC5), and `respondent.service.ts` (`listRespondents` — 12-7's intentionally-scoped filtered/paginated table). The guard is only useful if false positives are near-zero.

## Acceptance Criteria

1. **AC1 — A drift-detection check.** A script (`apps/api/scripts/lint-registry-read-drift.ts`, run via a `pnpm` script) scans `apps/api/src/**` for the retired registry-read shapes: (a) `FROM submissions` … `LEFT JOIN respondents` in the same SQL template (submission-anchored registry read), and (b) a hand-rolled latest-submission `LEFT JOIN LATERAL` over `submissions` with `ORDER BY submitted_at DESC … LIMIT 1`. It exits non-zero with a clear message on any match not covered by the allowlist (AC2). Patterns are narrow enough that the CURRENT tree (post-13-33) produces **zero** unallow-listed hits (AC6).
2. **AC2 — Allowlist + escape hatch (near-zero false positives).** Two suppression mechanisms, both documented: (i) a **file allowlist** for the sanctioned holders (`registry-unified.sql.ts`, `export-query.service.ts`, `respondent.service.ts`) with a one-line reason each; (ii) an **inline escape hatch** — a `// registry-read-drift-ok: <reason>` annotation on/above the flagged line for a future justified exception. An escape-hatch use with no reason string is itself a failure.
3. **AC3 — Wired into CI as a blocking step.** The check runs in the existing `lint-and-build` job in `.github/workflows/ci-cd.yml` (the deploy-gating job) as its own step, so a re-fork reddens CI before deploy. It also runs locally (`pnpm --filter @oslsr/api lint:registry-read` and folded into the package `lint`/pre-push chain).
4. **AC4 — Actionable failure message.** On a hit the message names the file:line, shows the offending snippet, states WHY it's blocked (submission-vs-respondent drift, 13-33), and points the author to `registryUnifiedSource('ru')` + `docs/registry-unified-ingestion-contract.md` — plus the escape-hatch syntax for a genuine exception.
5. **AC5 — Tests prove it catches and permits.** A test (in `apps/api/src/**/__tests__/`) runs the checker against fixtures: a planted submission-anchored read → FAILS; a planted hand-rolled LATERAL → FAILS; a `registryUnifiedSource`-composed read → PASSES; an allow-listed file → PASSES; an inline `registry-read-drift-ok` with a reason → PASSES, without a reason → FAILS.
6. **AC6 — Green + zero false positives on the current tree.** The check passes on the current `apps/api/src` (all real registry reads are either canonical or allow-listed); full API suite + `tsc --noEmit` + eslint clean; CI `lint-and-build` green with the new step.

## Tasks / Subtasks

- [ ] **Task 1 — The drift checker** (AC: #1, #2, #4)
  - [ ] Add `apps/api/scripts/lint-registry-read-drift.ts`. Enumerate `apps/api/src/**/*.ts` (exclude `**/__tests__/**` fixtures except the guard's own). Read each file; match the two retired shapes with multiline-aware regex over the file text (SQL lives in multi-line tagged templates — match across newlines).
  - [ ] Implement the allowlist (a small in-script `const ALLOWLIST` with `{ file, reason }`) + the inline `// registry-read-drift-ok: <reason>` escape hatch (scan the matched line + the line above). No-reason escape hatch → failure.
  - [ ] Emit `file:line` + snippet + the "use `registryUnifiedSource`" remediation + the ingestion-contract pointer; `process.exitCode = 1` on any unsuppressed hit.
- [ ] **Task 2 — Wire it in** (AC: #3)
  - [ ] Add `"lint:registry-read": "tsx scripts/lint-registry-read-drift.ts"` to `apps/api/package.json`; fold into the package `lint` chain (and the pre-push gate if that runs per-package lint).
  - [ ] Add a step to the `lint-and-build` job in `.github/workflows/ci-cd.yml` (before build) that runs it. (Scripts are outside tsconfig — RUN it, don't rely on tsc.)
- [ ] **Task 3 — Tests** (AC: #5)
  - [ ] Guard test in `apps/api/src/__tests__/` (or beside the script): run the checker's core function over inline fixtures — submission-anchored FAILS, hand-rolled LATERAL FAILS, `registryUnifiedSource` PASSES, allow-listed PASSES, escape-hatch-with-reason PASSES, escape-hatch-without-reason FAILS. Assert the exit signal + message content.
- [ ] **Task 4 — Validate** (AC: #6)
  - [ ] Run the check on the current tree → zero unallow-listed hits (fix any surprise by allow-listing with a reason OR re-pointing). Full API suite + `tsc --noEmit` + eslint clean. Push; confirm CI `lint-and-build` runs the step green.

## Dev Notes

### Dependencies
- **13-33 (in `review`)** — the canonical `registryUnifiedSource` this guard enforces toward. This story sequences AFTER 13-33 deploys (the guard is meaningless without the canonical read as the sanctioned target). NON-GATING for 13-33's own deploy.
- No schema, no runtime code, no new prod deps — a build-time/CI lint only (`tsx` is already a dev dep).

### Approach — why a script, not an eslint rule
- The retired reads are **multi-line SQL inside tagged-template literals**. An eslint AST rule sees a `TemplateLiteral` node and would have to re-assemble + regex the quasis anyway; a direct multiline-regex file scan is simpler, more legible, and easier to test in isolation. It mirrors the project's existing standalone `migrate-*-init.ts` / script conventions (scripts are outside tsconfig — run them).
- **Narrow patterns to keep false positives ~zero.** `FROM submissions` alone is common and legitimate (submission-level queries) — only flag it when paired with `LEFT JOIN respondents` in the same template (the submission-anchored *registry* shape). The registry list uses the reverse (`FROM respondents … LEFT JOIN submissions`) and is allow-listed regardless.
- **Allowlist is a feature, not a leak.** 13-33 AC5 explicitly ruled `getUnifiedExportData` proven-equal-not-refactored and 12-7 an intentionally-scoped table — those are correct exceptions, documented with reasons, and each carries (or will carry, per its story) a parity test. The escape hatch requires a reason so a future exception is a deliberate, reviewable act.

### Project Structure Notes
- **NEW file:** `apps/api/scripts/lint-registry-read-drift.ts` (the checker; export its core `findDriftHits(files)` fn so the test imports it without spawning a process).
- **Modified:** `apps/api/package.json` (new `lint:registry-read` script + `lint` chain); `.github/workflows/ci-cd.yml` (`lint-and-build` step).
- **NEW test:** `apps/api/src/__tests__/registry-read-drift-guard.test.ts` (or beside the script).
- No web changes, no DB, no routes.

### References
- [Source: apps/api/src/services/registry-unified.sql.ts — `REGISTRY_UNIFIED_SQL_TEXT` (the canonical shape) + the "adding a column" governance header (13-33)]
- [Source: apps/api/src/services/registry-unified.ts — `registryUnifiedSource('ru')` (the sanctioned FROM source consumers must use)]
- [Source: apps/api/src/services/export-query.service.ts:283-346 — `getUnifiedExportData` (ALLOWLIST: respondent-anchored, proven-equal per 13-33 AC5)]
- [Source: apps/api/src/services/respondent.service.ts:550-745 — `listRespondents` (ALLOWLIST: 12-7 intentionally-scoped paginated table; has its own parity test per 12-7)]
- [Source: docs/registry-unified-ingestion-contract.md — the write-side contract the remediation message points to]
- [Source: .github/workflows/ci-cd.yml — `lint-and-build` job (the deploy-gating job the step joins)]
- [Source: _bmad-output/implementation-artifacts/13-33-canonical-unified-registry-read-and-honest-density-map.md — "Post-ship backlog harmonization sweep" (the five drifted stories that motivated this guard)]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

### Review Follow-ups (AI)

## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-07-19 | Story drafted by Bob (SM) via *create-story, emergent from the 13-33 post-ship backlog-harmonization sweep. A CI guard that fails on a NEW hand-rolled respondent⟕submission registry read outside the sanctioned modules (`registry-unified.sql.ts`, `export-query.service.ts`, `respondent.service.ts`), with an inline `registry-read-drift-ok: <reason>` escape hatch + tests + a `lint-and-build` step. Makes the submission-vs-respondent drift 13-33 killed hard to re-introduce. POST-LAUNCH, NON-GATING; sequences after 13-33 deploys. Status → ready-for-dev. | Doc nudges rely on being read; the sweep found 5 pre-13-33 stories about to re-fork the read — enforce mechanically. See feedback: canonical-primitive-backlog-sweep. |
