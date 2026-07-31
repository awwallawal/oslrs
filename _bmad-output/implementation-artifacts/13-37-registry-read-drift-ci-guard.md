# Story 13-37: CI guard against registry-read drift (canonical `registryUnifiedSource` enforcement)

Status: done

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

- [x] **Task 1 — The drift checker** (AC: #1, #2, #4)
  - [x] Add the checker. **Split per the `osv-prod-gate` precedent:** detector core at `apps/api/src/lib/registry-read-drift.ts` (type-checked + unit-tested — `scripts/` is outside tsconfig and `rootDir: ./src` forbids importing scripts from src), thin CLI runner at `apps/api/scripts/lint-registry-read-drift.ts`. Enumerates `apps/api/src/**/*.ts`, excluding `**/__tests__/**`, `*.test.ts`, `*.d.ts`. Multiline-aware matching over each file, bounded by the enclosing tagged template (next backtick) so a match cannot bleed into an unrelated query.
  - [x] Allowlist (`ALLOWLIST`, `{ pattern, reason }`, path-normalized for Windows) + the inline `// registry-read-drift-ok: <reason>` escape hatch (matched line + line above; ≥8-char reason required). No/short-reason escape hatch → `escape-hatch-missing-reason` failure.
  - [x] Emits `file:line` + `[rule]` + snippet + WHY + the `registryUnifiedSource('ru')` remediation + the ingestion-contract pointer + the escape-hatch syntax; runner exits 1 on any unsuppressed hit.
  - [x] **Comment masking (emergent).** First run flagged the checker's OWN doc header. Comment bodies are now blanked before matching (offsets/newlines preserved), with string/template state tracked so a `//` inside a literal can't blank a line. Prose that *documents* a retired shape is not drift — this also clears the `lib/skills-extraction.ts:23` false positive.
- [x] **Task 2 — Wire it in** (AC: #3)
  - [x] Added `"lint:registry-read": "tsx scripts/lint-registry-read-drift.ts"` to `apps/api/package.json` and folded it into the package `lint` chain (`eslint src scripts && tsx scripts/...`) — so pre-commit (`pnpm lint`) and pre-push both cover it with no hook edit.
  - [x] Added a named `Registry-read drift guard (Story 13-37)` step to `lint-and-build` in `.github/workflows/ci-cd.yml`, immediately after `Lint` and before `Build`. Run explicitly as well as via the lint chain so a re-fork is a NAMED red step, not a line buried in eslint output.
- [x] **Task 3 — Tests** (AC: #5)
  - [x] `apps/api/src/lib/__tests__/registry-read-drift.test.ts` — 30 tests (**46 after the code
    review** — join-spelling coverage, the canonical-read regression lock, statement-scoped escape
    hatch, comment-position, and `suppressedRule`) over in-memory fixtures: submission-anchored FAILS, hand-rolled LATERAL FAILS, `registryUnifiedSource` PASSES, allow-listed PASSES, escape-hatch-with-reason PASSES, without-reason FAILS, too-short-reason FAILS. Plus the scoping guarantee (submission-grain analytics PASS), comment masking, Windows path normalization, and AC4 message-content assertions.
- [x] **Task 4 — Validate** (AC: #6)
  - [x] Guard on the current tree → **291 files scanned, zero unallow-listed hits**. Full API suite **3310 passed / 0 failed** (249 files), `tsc --noEmit` clean, `eslint src scripts` clean, `pnpm lint` chain green.
  - [x] **RED-verify (live canary, not just fixtures).** Planted `src/services/registry-canary.service.ts` (submission-anchored) + `src/services/other-canary.service.ts` (hand-rolled LATERAL) on the real filesystem → guard exited **1** naming both `file:line`. Added an escape hatch with a reason → exited **0**. Both canaries deleted; tree re-verified clean.
  - [x] **DISCHARGED 2026-07-31 — deploy `adbe330`.** CI `lint-and-build` ran the new step green on `main`. Cannot be checked locally — dev-story does not commit or push (code-review runs on the uncommitted tree first).
    ⚠️ **Widened by the code review (H1):** the step was MOVED above `Lint`, so this discharge must
    also confirm the ORDER — the guard step must appear (and pass) *before* `Lint` in the run log,
    otherwise the named step is unreachable again. Expect post-review numbers: **344 files, 0 hits**.

## Dev Notes

### ⚖️ AC1 AMENDED DURING DEV — rule (a) is SCOPED, not global (ruled by Awwal, 2026-07-30)

**AC1 as drafted was not implementable alongside AC2 and AC6.** Measured against the tree at
implementation time, AC1's literal pattern (a) — `FROM submissions` + `LEFT JOIN respondents` in one
template — produced **50 hits, 48 of them outside the story's allowlist**:

| Hits | File | What it actually is |
|-----:|------|---------------------|
| 44 | `src/services/survey-analytics.service.ts` | submission-grain survey stats |
| 2 | `src/services/verification-analytics.service.ts` | fraud/assessor funnel |
| 2 | `src/services/export-query.service.ts` | already allow-listed |
| 1 | `src/services/personal-stats.service.ts` | per-enumerator stats |
| 1 | `src/lib/skills-extraction.ts` | inside a doc comment |

So AC6 ("zero unallow-listed hits") and AC2 ("false positives near-zero") were both unsatisfiable as
written. The story's premise was that the join text identifies a *registry* read. It does not:
13-33 (`787493b`) deleted exactly `FROM submissions s LEFT JOIN respondents r ON r.id = s.respondent_id`
from `public-insights.service.ts`, and `survey-analytics.service.ts` uses that identical text 44 times
today — **correctly**, because it answers "how many *submissions* say X", not "how many *people* are
registered". What separated the bug from correct code in 13-33 was the module's JOB, not its SQL.

**Ruling — scope rule (a), keep rule (b) global:**
- **Rule (a)** fires only inside `REGISTRY_FACT_MODULES` (`public-insights.service.ts`, `registry-*.ts`)
  where composing the canonical read is mandatory. Both are clean today → zero hits.
- **Rule (b)** (hand-rolled latest-non-empty LATERAL) runs across all of `apps/api/src` with the three
  sanctioned holders allow-listed. It needed no amendment — measured 6 hits, **all** allow-listed,
  exactly as the story predicted. This is the stronger of the two rules: it catches the real
  copy-paste vector (duplicating the canonical join instead of importing it).

**KNOWN GAP (accepted, not hidden):** a drifted registry count added *inside* a non-registry analytics
module is not caught by rule (a). It is still caught by rule (b) if it hand-rolls the join. Widening
rule (a) safely needs a *grain* signal (counting people from a submission-anchored query), not a
join-text signal. Revisit if the gap ever bites; a candidate signal is `COUNT(DISTINCT …respondent_id)`
over a submissions-anchored FROM, but `report.service.ts:129` shows that shape legitimately too.

The rejected alternatives were: allow-listing the 4 files (keeps AC1 literal but blinds the guard in
precisely the files where a drifted registry count would plausibly be added), and shipping rule (b)
only. Full rationale is duplicated in the detector's module header so it survives without this file.

### Dependencies
- **13-33 (in `review`)** — the canonical `registryUnifiedSource` this guard enforces toward. This story sequences AFTER 13-33 deploys (the guard is meaningless without the canonical read as the sanctioned target). NON-GATING for 13-33's own deploy.
- No schema, no runtime code, no new prod deps — a build-time/CI lint only (`tsx` is already a dev dep).

### Approach — why a script, not an eslint rule
- The retired reads are **multi-line SQL inside tagged-template literals**. An eslint AST rule sees a `TemplateLiteral` node and would have to re-assemble + regex the quasis anyway; a direct multiline-regex file scan is simpler, more legible, and easier to test in isolation. It mirrors the project's existing standalone `migrate-*-init.ts` / script conventions (scripts are outside tsconfig — run them).
- **Narrow patterns to keep false positives ~zero.** `FROM submissions` alone is common and legitimate (submission-level queries) — only flag it when paired with `LEFT JOIN respondents` in the same template (the submission-anchored *registry* shape). The registry list uses the reverse (`FROM respondents … LEFT JOIN submissions`) and is allow-listed regardless.
- **Allowlist is a feature, not a leak.** 13-33 AC5 explicitly ruled `getUnifiedExportData` proven-equal-not-refactored and 12-7 an intentionally-scoped table — those are correct exceptions, documented with reasons, and each carries (or will carry, per its story) a parity test. The escape hatch requires a reason so a future exception is a deliberate, reviewable act.

### Project Structure Notes

> ⚠️ **Superseded as drafted** (corrected 2026-07-30 code review, finding M4). The story was
> drafted assuming a single-file checker under `scripts/`. Implementation split it per the
> `osv-prod-gate` precedent, because `apps/api/tsconfig.json` sets `rootDir: ./src` — a `src` file
> importing from `scripts/` breaks `tsc`, so the detector must live in `src/lib` to be type-checked
> and unit-tested. The **File List below is authoritative**; this section now records the as-built
> shape.

- **NEW file:** `apps/api/src/lib/registry-read-drift.ts` — the detector core (exports
  `findDriftHits(files)` / `formatHits(hits)`, so tests import it without spawning a process).
- **NEW file:** `apps/api/scripts/lint-registry-read-drift.ts` — thin CLI runner (file walk, I/O,
  exit code). Scans `src/**` **and** `scripts/**` (the second root added by the code review, L5).
- **NEW test:** `apps/api/src/lib/__tests__/registry-read-drift.test.ts` (beside the detector, not
  under `src/__tests__/`).
- **Modified:** `apps/api/package.json` (new `lint:registry-read` script + `lint` chain);
  `.github/workflows/ci-cd.yml` (`lint-and-build` step — **must stay above the `Lint` step**, see H1).
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

Claude Opus 5 (1M context) — `claude-opus-5[1m]`, via the `dev-story` workflow, 2026-07-30.

### Debug Log References

- **AC1-vs-tree contradiction** — measured with a throwaway scanner before writing any code (scratchpad
  `count-drift.mjs`): rule (a) literal = 50 hits (48 unallow-listed) across 5 files; rule (b) = 6 hits,
  all in the 3 allow-listed files. Evidence table + ruling in Dev Notes above.
- **Retired shape confirmed from source, not from the story's framing** — `git show 787493b -- apps/api/src/services/public-insights.service.ts`
  shows 13-33 deleting `FROM submissions s / LEFT JOIN respondents r ON r.id = s.respondent_id`.
- **First guard run flagged its own doc header** (`src/lib/registry-read-drift.ts:24`) — the patterns
  matched inside comments. Fixed with offset-preserving comment masking rather than escape-hatching the
  header; also clears the `skills-extraction.ts:23` false positive. Three tests pin the behaviour
  (doc comment PASSES, commented-out drift PASSES, trailing-comment line still CAUGHT).
- **RED-verify on real files** — planted two canary services, guard exited 1 naming both `file:line`;
  added an escape hatch with a reason, exited 0; deleted both, tree clean at 291 files. Proves the
  guard works through the file walker, not only over in-memory fixtures.
- Full API suite run against the guard-enforced test DB (`NODE_ENV=test`,
  `DATABASE_URL=…/app_test`) per `.husky/pre-push`.

### Completion Notes List

- **Detector split follows the `osv-prod-gate` precedent** (gate logic in `src/lib`, thin runner in
  `scripts/`). This is not cosmetic: `apps/api/tsconfig.json` sets `rootDir: ./src`, so a src file
  importing from `scripts/` would break `tsc`. Putting the logic in `src/lib` makes it type-checked by
  `pnpm build` and unit-tested by the `test-api` CI job, while the script stays run-only.
- **Two rules, deliberately different scopes** — rule (a) scoped to registry-fact modules, rule (b)
  global. See the AC1 amendment in Dev Notes for the measurements that forced this.
- **Match window is bounded by the enclosing tagged template** (next backtick, capped at 800/1500
  chars) so a hit cannot bleed into an unrelated query later in the file.
- **Escape hatch requires a ≥8-char reason.** An annotation with no reason, no colon, or a token reason
  ("ok") is itself a failure — an unexplained suppression is not a reviewable decision.
- **AC6 is satisfied except its CI leg**, which is DISCHARGE-ON-PUSH by construction: dev-story does not
  commit or push (code-review runs on the uncommitted tree first). Everything checkable locally is
  green — guard 0 hits / API 3310 pass / tsc / eslint / lint chain.
- ~~Not done, and out of scope: `apps/api/scripts/**` is not scanned.~~ **CLOSED by the 2026-07-30
  code review (L5).** The runner now scans `src/**` AND `scripts/**`. Re-measured under the widened
  rules: 54 script files, **0 hits** — so closing the blind spot cost nothing, and `scripts/` is
  where one-off backfills live, i.e. the highest-risk-per-line directory in the package. The two
  operator backfill scripts with `FROM submissions` reads do not trip either rule (they are not
  registry-fact modules, and they do not hand-roll the LATERAL). Guard total: 344 files, 0 hits.

### File List

**New**
- `apps/api/src/lib/registry-read-drift.ts` — the detector core (rules, allowlist, registry-module
  scope, comment masking, escape hatch, `findDriftHits`, `formatHits`).
- `apps/api/scripts/lint-registry-read-drift.ts` — CLI runner (file walk, I/O, exit code).
- `apps/api/src/lib/__tests__/registry-read-drift.test.ts` — 30 tests.

**Modified**
- `apps/api/package.json` — added `lint:registry-read`; folded the guard into the `lint` chain.
- `.github/workflows/ci-cd.yml` — new `Registry-read drift guard (Story 13-37)` step in `lint-and-build`.
- `_bmad-output/implementation-artifacts/13-37-registry-read-drift-ci-guard.md` — this file.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `ready-for-dev` → `in-progress` → `review`.

**Code review 2026-07-30 — no new files.** All 12 fixes landed in the SAME seven files above:
`src/lib/registry-read-drift.ts` (widened join matchers, statement-scoped + comment-position escape
hatch, `suppressedRule`, message + header doc corrections), `scripts/lint-registry-read-drift.ts`
(second scan root, exclusion set, ordering note), `src/lib/__tests__/registry-read-drift.test.ts`
(30 → 46 tests), `.github/workflows/ci-cd.yml` (guard step moved above `Lint`), and this story file.
`apps/api/package.json` unchanged by the review. Verified against `git status`: still exactly the
seven story files, no stray canaries.

### Review Follow-ups (AI)

Adversarial code review 2026-07-30 (Claude Opus 5, `code-review` workflow) — **12 findings: 3 High,
4 Medium, 5 Low. ALL FIXED IN-PASS**, each RED-verified before the fix where the claim was
behavioural. Git vs story File List: **0 discrepancies** (the story's File List was exact).

The three High findings share one shape: **the guard was narrower than its own threat model**, in
ways the fixture-based tests could not see. Two were evasions by a single keyword; one meant the CI
step could never execute.

- [x] **[AI-Review][High] H1 — the named CI step was unreachable; AC3's stated benefit could never
  fire.** `ci-cd.yml` ran `- name: Lint` (→ `pnpm lint` → turbo → the api `lint` chain, which Task 2
  had folded the guard INTO) *before* the named `Registry-read drift guard` step. On a real drift the
  `Lint` step exits non-zero and the job aborts — the named step never runs. Task 2's rationale
  ("a re-fork is a NAMED red step, not a line buried in eslint output") was structurally
  unobtainable. [[pattern-ship-a-fix-that-never-fires]] at the CI layer, in the story built to
  prevent exactly that. **FIX:** moved the guard step above `Lint`, with a `⚠️ ORDER MATTERS`
  comment in `ci-cd.yml` + a matching note in the runner header so a future tidy-up can't silently
  reintroduce it. Kept the lint-chain entry (that's what gives pre-commit cover with no hook edit).
- [x] **[AI-Review][High] H2 — rule (a) saw one of four join spellings, and the missed one is this
  codebase's own idiom.** `LEFT\s+JOIN\s+respondents` MISSED `JOIN respondents`,
  `INNER JOIN respondents`, `LEFT OUTER JOIN respondents` and the comma join — all measured against
  the real detector. `survey-analytics.service.ts:1674` writes the INNER form verbatim, so the
  spelling a drifted read would most plausibly use was the one rule (a) was blind to. **FIX:**
  `JOIN_RESPONDENTS` now matches any spelling incl. the comma join. Free: rule (a) only runs inside
  the registry-fact modules, and the widened pattern measures **0 hits** on the tree.
- [x] **[AI-Review][High] H3 — rule (b) missed `CROSS JOIN LATERAL`, already used in this repo.**
  `LEFT\s+JOIN\s+LATERAL` MISSED `CROSS JOIN LATERAL`, `JOIN LATERAL` and `LEFT OUTER JOIN LATERAL`.
  `survey-analytics.service.ts:1675` already uses `CROSS JOIN LATERAL`, so the cheapest possible
  evasion — copy the canonical read, change one keyword — walked straight through the rule Dev Notes
  called "the stronger of the two". **FIX:** matcher widened to `\bJOIN\s+LATERAL`; the three content
  signals (`FROM submissions` + `ORDER BY … submitted_at DESC` + `LIMIT 1`) carry the specificity.
  Measured **0 false positives**, incl. the real `CROSS JOIN LATERAL (VALUES …)` unpivot, which is
  excluded by the forward-only template-bounded window (regression test added).
- [x] **[AI-Review][Med] M1 — no test pinned the guard to the REAL canonical read.** AC5's fixtures
  are hand-written lookalikes (`HAND_ROLLED_LATERAL` lacks the `<> '{}'::jsonb` clause). Editing
  13-33's SQL — e.g. `submitted_at` → `created_at` in the ORDER BY — would silently disarm rule (b)
  with all 30 tests green. **FIX:** regression-lock test imports `REGISTRY_UNIFIED_SQL_TEXT`, plants
  a verbatim copy in a non-allowlisted path, asserts it is caught. Verified caught today.
- [x] **[AI-Review][Med] M2 — the escape hatch was narrower than devs would use it.** It inspected
  only the hit line and the one directly above; the natural place to annotate a multi-line query is
  above ``db.execute(sql` ``, several lines up — that suppression silently did not apply, giving a
  red build with no visible cause. **FIX:** `statementStartLine()` resolves the enclosing SQL
  template, and the hatch is honoured anywhere inside the statement or on the line above it. Failure
  message updated to state the real contract. RED-verified on a live canary.
- [x] **[AI-Review][Med] M3 — a reason-less escape hatch erased the real finding.** `findDriftHits`
  overwrote both `rule` and `why` with `escape-hatch-missing-reason`, so the output no longer said
  WHICH drift was detected — degrading AC4 exactly when an author is trying to understand what they
  are suppressing. **FIX:** new `DriftHit.suppressedRule` carries the underlying rule; `why` states
  both; `formatHits` renders `[escape-hatch-missing-reason → <rule>]`.
- [x] **[AI-Review][Med] M4 — "Project Structure Notes" still described the abandoned design**
  (single-file checker in `scripts/`, test at `src/__tests__/registry-read-drift-guard.test.ts`),
  contradicting the correct File List and Dev Notes. **FIX:** section rewritten as-built and marked
  superseded, with the `rootDir` reason the split was necessary.
- [x] **[AI-Review][Low] L1 — the escape-hatch token was matched by a bare `line.includes()`**, so it
  suppressed from inside a string literal or SQL text — not a reviewable decision by anyone.
  **FIX:** `annotationIsInComment()` requires the token in comment position (`//`, `/*`, JSDoc `*`,
  or SQL `--`). Regression test added.
- [x] **[AI-Review][Low] L2 — the masker's documented guarantee was overstated.** The header claimed
  masking "only ever under-masks … never the reverse"; a regex literal containing `//` (e.g.
  `/\/\//`) starts a phantom line comment and over-masks the rest of that line — a false NEGATIVE.
  **FIX:** documented as a deliberate KNOWN LIMIT with the reason it is not worth fixing (regex-vs-
  division disambiguation is more failure surface than the case is worth; SQL drift and a regex
  literal do not share a line) and the escalation path (an AST pass) if it ever bites.
- [x] **[AI-Review][Low] L3 — the remediation snippet hardcoded `from './registry-unified.js'`**,
  only correct from `src/services/`. **FIX:** annotated as relative-to-your-file + names the module's
  absolute path.
- [x] **[AI-Review][Low] L4 — exclusion set narrower than the repo's conventions:** `*.spec.ts` and
  `test`/`tests` directories were scanned. **FIX:** `SKIP_SUFFIXES` + widened `SKIP_DIRS`. This drops
  exactly one file (`src/test/factories/api-consumer.factory.ts` — test-support, verified to contain
  no SQL reads), so it is not a coverage regression.
- [x] **[AI-Review][Low] L5 — `apps/api/scripts/**` was unscanned** (accepted in the original
  Completion Notes) — but that is precisely where one-off backfills live. **FIX:** re-measured under
  the widened rules → 54 script files, 0 hits, so the blind spot closed for free. Runner now scans
  both roots; the stale "out of scope" completion note is corrected above. ⚠️ This deliberately
  EXCEEDS AC1's `apps/api/src/**` scope — a strengthening, recorded here rather than silently taken.

**RED-verify (live canaries on the real filesystem, not fixtures).** Planted three files, each in a
spelling the pre-review guard MISSED: `registry-canary.service.ts` (INNER `JOIN respondents` in a
registry-fact module), `other-canary.service.ts` (`CROSS JOIN LATERAL` copy of the canonical read),
and `scripts/canary-backfill.ts` (drifted read in the previously-unscanned root). Guard exited **1**
naming all three at `file:line`. Adding a reason-carrying escape hatch **4 lines above** the hit (M2)
suppressed exactly that one → 2 remaining. All three deleted; tree re-verified **344 files, 0 hits,
exit 0**, `git status` clean of canary residue.

**Post-fix gate (all run, not asserted):** guard 344 files / 0 hits · guard tests **46 pass** (was
30) · full API suite **3326 pass / 0 fail** / 249 files (was 3310) · `tsc --noEmit` clean · `eslint
src scripts` clean.

**Not fixed — one BLOCKING residual, unchanged from dev-story:** AC6's CI leg (`lint-and-build` green
with the new step) is DISCHARGE-ON-PUSH and cannot be checked locally. H1's fix *changed the CI
wiring*, so this residual now also covers step ordering. Status stays `review` until CI confirms — the
full ledger is the `## Residuals` table below.

## Adjudication (Claude, 2026-07-31) — third independent layer

Verified, not inherited. Every number the story claims reproduced exactly: API `tsc` + `eslint src scripts`
clean; guard on the current tree **344 files / 0 hits / exit 0**; guard suite **46 passed**; and H1's fix
confirmed statically — `ci-cd.yml:149` (guard) sits above `:152` (`Lint`).

**RED-verify — mine, deliberately in the two spellings the PRE-review guard was blind to** (H2/H3),
since those are precisely the evasions fixtures could not see:

1. `registry-adjudication-canary.ts` — `INNER JOIN respondents` inside a REGISTRY_FACT_MODULE → **caught**
   (rule a).
2. `zz-adjudication-canary.service.ts` — `CROSS JOIN LATERAL` copy of the canonical read, placed in a
   NON-registry module so only rule (b) could fire → **caught**. Guard exited **1** naming both at
   `file:line` with rule id, snippet, WHY, the `registryUnifiedSource('ru')` remediation (carrying L3's
   relative-path correction), the contract pointer and the escape-hatch syntax — AC4 satisfied in full.
3. **M2 (statement-scoped hatch):** a reason-carrying annotation **4 lines above** the statement — where a
   developer would naturally write it — suppressed exactly that hit, 2 → 1. The pre-M2 hatch ignored it.
4. **M3 (reason-less hatch preserves the finding):** printed
   `[escape-hatch-missing-reason -> submission-anchored-registry-read]`, so the underlying rule survives
   instead of being overwritten.

Canaries deleted **manually** (untracked, so `git checkout` could not restore them); guard re-run
**344 files / 0 hits / exit 0**; `git status` clean of residue.

**No new findings** — the only story this session where my pass found nothing to fix. Worth recording WHY
it held up, since that is the transferable part: every widening was measured to cost zero false positives
**before** being applied, and M1's regression lock imports the REAL `REGISTRY_UNIFIED_SQL_TEXT` rather
than a lookalike, so editing 13-33's SQL cannot silently disarm rule (b).

**On the ledger itself (first use of D1/D9):** used correctly. R1 is the single blocking row and carries
re-runnable evidence on **both sides** of the push; R2/R3 are ACCEPTED with real measurements (50 -> 0) and
mechanical triggers; R3 is honestly self-labelled as the thin one, carrying a bound rather than a count.
That candour is the point — a ledger that hides its weakest row is worse than no ledger.

## Residuals

<!-- FIRST USE of the residual-ledger format (handoff §8 item D1), 2026-07-30 by Bob (SM). States are
     §2a0's three and only three: CLOSED / DISCHARGE-ON-PUSH / ACCEPTED. `Status: done` is NOT
     PERMITTED while any row is DISCHARGE-ON-PUSH or otherwise unresolved. The point of the table is
     that the debt gate becomes a SCHEMA rather than a discipline — prose is not type-checked, and
     13-36 proved a residual can carry a hypothesis dressed as a measurement and survive review.
     Rows here are exactly what §2a0's grep surfaces: `grep -nE '^- \[ \]'` plus
     `grep -inE 'NOT fixed|deliberately|residual|push-time|out of scope|accepted[- ]risk'`. -->

| ID | Severity | State | Re-runnable evidence | Owner |
|---|---|---|---|---|
| ~~**R1**~~ ✅ **CLOSED 2026-07-31** — AC6's CI leg: `lint-and-build` green with the guard step, **and the step running BEFORE `Lint`** (widened by review finding H1, which changed the CI wiring) | **High** — H1 proved the named step was unreachable; without this check the AC3 benefit is unverified on the only surface that matters | **CLOSED** — discharged on the `adbe330` push by reading the log, not the badge. **Evidence, verbatim:** step `Registry-read drift guard (Story 13-37)` printed `✅ registry-read drift guard: 344 files scanned, no drift.` at **17:50:13.426**; `Lint`'s first line is **17:50:13.450** — the guard EXECUTED and finished 24 ms BEFORE `Lint` began. Ordered steps from the run log: `Upload OSV …` → **guard** → **Lint** → `Pre-build env guard` → `Build`. Run `30652676038`, all 10 jobs green, prod VPS SHA `adbe330`. ⚠️ Bonus: **344 files / 0 hits on LINUX matches Windows exactly**, so A5's case-sensitivity risk (first non-Windows run) is retired — no allow-listed file was spuriously flagged. | **Now:** `pnpm --filter @oslsr/api lint:registry-read` → expect `344 files, 0 hits`, exit 0. **On push:** `gh run list --branch main --workflow "ci-cd.yml" --limit 1` → `gh run view <id> --json jobs`, then read the `lint-and-build` log and confirm BOTH (a) `Registry-read drift guard (Story 13-37)` is green **and** (b) its step index is **less than** `Lint`'s. Source of truth for the order: `.github/workflows/ci-cd.yml:149` (guard) vs `:152` (`Lint`). ⚠️ Check the *evidence*, not just the green — a step that never ran also does not go red. | Awwal (the adjudication session that pushes 13-37) |
| **R2** — AC1's rule-(a) KNOWN GAP: a drifted registry count added *inside* a non-registry analytics module is not caught by rule (a), which is scoped to `REGISTRY_FACT_MODULES` | **Medium** — a real blind spot, but the copy-paste vector (duplicating the canonical join) is still covered by rule (b), which is global | **ACCEPTED** — measured, owned, trigger below | **Measurement (not a hypothesis):** rule (a) unscoped = **50 hits, 48 of them outside the allowlist** across 5 files (44 in `services/survey-analytics.service.ts` alone, which uses that join text *correctly* — submission grain, not registry grain); scoped = **0**. Re-run the scoped result with `pnpm --filter @oslsr/api lint:registry-read`; the scoping itself is pinned by the "submission-grain analytics PASS" tests in `src/lib/__tests__/registry-read-drift.test.ts`. **Reopen trigger:** (a) any drifted registry count is found inside a non-registry module, or (b) a new registry-fact module is added that `REGISTRY_FACT_MODULES` does not match. ⚠️ **(b) TIGHTENED in adjudication 2026-07-31 — it was written more alarmingly than reality.** The rule is a PATTERN, `/(^|\/)src\/services\/registry-[^/]+\.ts$/`, so ANY new `src/services/registry-*.ts` is scoped in automatically. The only module that escapes is a registry-fact module named something else (e.g. a hypothetical `public-insights-v2.service.ts`) — a much narrower and less likely hole than "any new registry module", and one a reviewer naming a new registry read would have to work at to hit. | Awwal (ruled the AC1 amendment 2026-07-30) |
| **R3** — L2's comment-masking KNOWN LIMIT: a regex literal containing `//` (e.g. `/\/\//`) opens a phantom line comment and over-masks the rest of that physical line — a false **negative** | **Low** | **ACCEPTED** — ⚠️ **and this row is deliberately the weakest of the three, kept as the worked example of what a thin ACCEPTED looks like.** §2a0 requires a *measurement*; this row has a bound, not a count. | **Bound (honest, and NOT a measurement):** the limit can only fire when a regex literal containing `//` sits on the same physical line as a drifted SQL read. That co-occurrence was never counted on the tree, so this row would not fully clear §2a0's ACCEPTED bar if it were load-bearing. **Escalation path already written down:** an AST pass. **Reopen trigger — mechanical and already scheduled:** 13-41 AC11(b) retires `maskComments` outright by replacing the source model with `ts.createSourceFile` template nodes, at which point this row is discharged by construction rather than argued away. | Awwal / whoever takes 13-41 Task 0 |

**Reading of the ledger:** exactly **one** row (R1) blocks `Status: done`, and it is discharged by a
push plus a two-part check that anyone can re-run. R2 and R3 are ACCEPTED and do not block. Nothing
here is a `[ ]` box hiding under a `done` status — which is the failure mode §2a0 was written for.

## Closing verdict

<!-- FIRST USE of the fixed closing-verdict block (handoff §8 item D9), 2026-07-30 by Bob (SM).
     D9 exists because 13-36's close-out was hand-synced across five places (story body, Change Log,
     sprint-status, MEMORY.md, the handoff doc) and a claim that had been DISPROVEN survived in three
     of them. A fixed block gives the five places one thing to copy. Fill it, don't reword it. -->

- **Verdict:** ✅ **CLOSED 2026-07-31 — deployed `adbe330`; all ACs satisfied.** (Superseded hold, kept for the record: *NOT CLOSED — `review`, closing on push.*) Every acceptance criterion is satisfied
  except AC6's CI leg (Residuals R1), which is DISCHARGE-ON-PUSH by construction. **This is a
  deliberate hold, not an oversight** (ruled by Awwal, 2026-07-30): the adversarial review's H1 fix
  *changed the CI wiring*, so the one thing that cannot be verified locally is precisely the thing the
  review touched. Flipping `done` now would assert an unverified claim about CI — the exact shape of
  [[pattern-ship-a-fix-that-never-fires]] this story exists to prevent.
- **RED-verify evidence (run, not asserted):** three live canaries planted on the real filesystem, each
  in a spelling the **pre-review** guard MISSED — `registry-canary.service.ts` (INNER `JOIN respondents`
  inside a registry-fact module), `other-canary.service.ts` (`CROSS JOIN LATERAL` copy of the canonical
  read), `scripts/canary-backfill.ts` (drifted read in the previously-unscanned root). Guard exited **1**
  naming all three at `file:line`. A reason-carrying escape hatch placed **4 lines above** the hit (M2)
  suppressed exactly that one → 2 remaining. All three deleted; tree re-verified **344 files / 0 hits /
  exit 0**, `git status` clean of canary residue. Regression-locked against the REAL artifact by M1's
  test, which imports `REGISTRY_UNIFIED_SQL_TEXT` rather than a lookalike.
- **Post-fix gate:** guard **344 files / 0 hits** · guard tests **46 pass** (was 30) · full API suite
  **3326 pass / 0 fail** across 249 files (was 3310) · `tsc --noEmit` clean · `eslint src scripts` clean.
- **File-List reconciliation:** `git` vs the `## File List` above — **0 discrepancies**. The review added
  **no new files**; all 12 fixes landed in the same seven paths. No canary residue.
- **Deploy SHA:** ✅ **`adbe330`** — pushed 2026-07-31; CI run `30652676038` green on all 10 jobs; prod VPS SHA verified `adbe330`, health 200. R1's two-part check passed **on the evidence** (guard executed AND ordered above `Lint` — timestamps in the R1 row). Adjudication found **no new defects**: the only story this session where the third layer added nothing. (Superseded: *PENDING — not yet committed or pushed.*) To be filled in by the adjudication
  session that pushes this story, together with R1's two-part CI check (guard step green **and** ordered
  above `Lint`). Until this line carries a real SHA, `Status:` must not read `done`.

## Session Decision Log (2026-07-30)

<!-- Written by Bob (SM) at Awwal's instruction that EVERY decision from the 2026-07-30 session be
     captured so nothing is missed at close-out. Deliberately split in two so honouring that intent
     does not turn a CI-guard story into a dumping ground: PART A is 13-37's own business and is
     stated in full; PART B is an INDEX of cross-cutting decisions with pointers to their real
     homes — one line each, no substance duplicated. A decision about radio jingles or rate limits
     does not belong in this story's body and would make it un-closeable. -->

### Part A — decisions that BIND 13-37's close-out

These five are 13-37's own business. **Only Part A gates this story's `done`.**

- **A1 — The adversarial code review's 12 findings (3 High / 4 Med / 5 Low) were ALL fixed in-pass,
  with two deliberate exceptions of a different kind, both recorded rather than silently taken.**
  - **L2 is DOCUMENTED, NOT FIXED.** The comment-masker's guarantee was overstated: a regex literal
    containing `//` (e.g. `/\/\//`) opens a phantom line comment and over-masks the rest of that
    physical line — a false **negative**. The ruling was to write it down as a KNOWN LIMIT with its
    reason (regex-vs-division disambiguation is more failure surface than the case is worth) and its
    escalation path (an AST pass), **not** to patch it. It is carried as Residual **R3 (ACCEPTED)** and
    is **discharged by construction** when 13-41 AC11(b) retires `maskComments` in favour of
    `ts.createSourceFile` template nodes. That deferral is the reason R3 has a mechanical reopen
    trigger rather than a promise.
  - **L5 DELIBERATELY EXCEEDS AC1.** AC1 scopes the scan to `apps/api/src/**`; the review added
    `apps/api/scripts/**` as a second root because that is where one-off backfills live — the
    highest-risk-per-line directory in the package. Re-measured under the widened rules: **54 script
    files, 0 hits**, so closing the blind spot cost nothing. Recorded as a **strengthening beyond the
    written AC**, not folded in silently. Guard total moved 291 → **344 files, 0 hits**.
  - The other ten (H1, H2, H3, M1, M2, M3, M4, L1, L3, L4) are fixed in code with RED-verification
    where the claim was behavioural — see `## Review Follow-ups (AI)` for each.
- **A2 — 13-37 closes ON PUSH, not before (Awwal's explicit ruling), and the `## Residuals` ledger is
  the schema that enforces it.** Per handoff §2a0's debt gate, the three and only three states are
  CLOSED / DISCHARGE-ON-PUSH / ACCEPTED, and `Status: done` is **forbidden** while any row is
  DISCHARGE-ON-PUSH. **R1 is the single blocking row** — AC6's CI leg, widened by H1 to also cover step
  ORDER. **R2 and R3 are ACCEPTED and do not block.** The hold is deliberate, not an oversight: H1's fix
  *changed the CI wiring*, so the one thing that cannot be verified locally is precisely the thing the
  review touched. Flipping `done` now would assert an unverified claim about CI —
  [[pattern-ship-a-fix-that-never-fires]] in the story built to prevent it.
- **A3 — The close sequence is fixed, and step 3 is the one that is easy to skip.**
  1. **Push** to `main` (this story's seven files).
  2. **CI green** — `gh run list --branch main --workflow "ci-cd.yml" --limit 1` → `gh run view <id>`.
  3. **Confirm IN THE RUN LOG that `Registry-read drift guard (Story 13-37)` actually EXECUTED and did
     so ABOVE `Lint`.** Source of truth for the order: `.github/workflows/ci-cd.yml:149` (guard) vs
     `:152` (`Lint`). ⚠️ **Check the evidence, not just the green — a step that never ran also does not
     go red.** This is the whole content of finding H1 and the whole point of R1.
  4. **Record the deploy SHA** in `## Closing verdict` → *Deploy SHA*, replacing `⏳ PENDING`.
  5. **Only then** flip `Status: review` → `done`, in the story file and `sprint-status.yaml`, in the
     same commit.
- **A4 — D1 and D9 were adopted with 13-37 as the worked example, and Pitfall #45 was minted from H1.**
  Handoff §8 **D1** (the `## Residuals` ledger) and **D9** (the fixed `## Closing verdict` block) were
  proposed to be retrofitted onto 13-36; the ruling was to use **13-37 instead**, because it has exactly
  ONE blocking residual rather than a tangle, that residual has re-runnable evidence on **both sides of
  the push**, and the ledger is written **before** the close rather than reconstructed after it — which
  is what §2a0's two touch points actually ask for. Both blocks now exist in this file and are the
  format to copy, not reword. Separately, H1's CI-ordering invariant was recorded as **Pitfall #45** in
  `docs/infrastructure-cicd-playbook.md` — *a named blocking step must not be preceded by a broader step
  whose command already runs the same check, or the named step is unreachable* — minted only after
  `grep -n "Pitfall #"` across the WHOLE repo returned no `#45`+ (the `#43` double-assignment of
  2026-07-20 is why that grep is now mandatory). Named future consumers: 13-41 AC6 and handoff §8 D3 /
  Story 13-45.
- **A5 — Known risks ON THE PUSH ITSELF, so a red is triaged rather than panicked over.**
  1. **`.husky/pre-push` runs the FULL suite on a push to `main`** (asymmetric by design: feature-branch
     pushes skip it). That needs a **current `app_test` schema** — a stale local test DB reds unrelated
     tests and looks like this story broke something. Remedy is the handoff §2f local-DB-parity rebuild,
     not a `--no-verify`.
  2. **The known bcrypt `"Module did not self-register"` CI flake** — a test FILE fails at LOAD with 0
     tests run. Native-addon re-registration across vitest workers, **not** a code bug →
     `gh run rerun <id> --failed`. ⚠️ This is the *one* sanctioned reflexive re-run; it does not extend
     to the `Registry-read drift guard` step or to E2E (13-36 made E2E a trustworthy signal — triage a
     red there).
  3. **The guard runs on LINUX for the first time.** Dev-story and the code review both ran on Windows.
     Path handling is explicitly normalized — `relative(PACKAGE_ROOT, absolute).replace(/\\/g, '/')`
     (`apps/api/scripts/lint-registry-read-drift.ts:71`) feeding `normalizePath` /
     `matchPathRule` (`src/lib/registry-read-drift.ts:154-161`), matched against forward-slash
     package-relative paths — **but that normalization has never been exercised on a platform where it
     is a no-op.** The residual risk is Linux's **case sensitivity**: an `ALLOWLIST` or
     `REGISTRY_FACT_MODULES` pattern whose case differs from the real filename matches on Windows and
     **misses** on Linux, silently un-allow-listing a sanctioned file. ✅ **The failure mode is LOUD** —
     it surfaces as a false-positive red on a known-good file, not as a silent pass — so a first-run red
     naming `export-query.service.ts`, `respondent.service.ts` or `registry-unified.sql.ts` should be
     read as *this*, not as real drift. Expected healthy output: **344 files, 0 hits, exit 0.**

### Part B — INDEX of cross-cutting session decisions (pointers only)

> **These are INDEXED here, not OWNED here.** 13-37 is the session's close-out vehicle, not its
> ledger. Each line names the decision and its real home; the substance lives there and is **not**
> duplicated in this file. **None of these gates 13-37's close — only Part A does.** If a line below
> ever needs arguing, argue it in its home document.

| # | Decision (one line) | Real home |
|---|---|---|
| B1 | 13-41 **absorbs** the shared CI-guard toolkit extraction + the AST source-model ruling (AC11/AC11b/AC11c + new AC12 + new Task 0) instead of copying 13-37's plumbing — because "mirror 13-37" had already copied three of 13-37's own review defects before a line of code existed. | `13-41-unsafe-sql-cast-ci-guard.md` (PM ruling in Dev Notes + Change Log) |
| B2 | 🔗 13-41 gains a **HARD dependency on 13-37 being `done`, not merely `review`** — Task 0 refactors 13-37's shipped files, so starting earlier makes any red ambiguous between the two stories. **This is the only cross-story consequence of Part A's hold.** | `13-41-…md` Dependencies; `docs/adjudication-agent-handoff.md` §5 |
| B3 | 13-41 confirmed **NOT launch-gating — settled, do not relitigate**: a read-only prod query returned **82 rows with a `dob`, 0 unparseable, 0 empty strings**, so the `(raw_data->>'dob')::date` exposure on the public `/insights` page is prophylactic today, not a live defect. | `docs/adjudication-agent-handoff.md` §5; `13-41-…md` AC10.3 |
| B4 | 13-34's claim that *"every `::uuid` cast on a TEXT column in `apps/api` is accounted for"* is **DISPROVEN** — `controllers/form.controller.ts:276` and `:325` cast `${submissions.submitterId}::uuid` unguarded. **Status unchanged at `done`** (prophylactic: every writer writes `null` or a UUID); the fix is owned by 13-41 AC10.4. | `13-34-…md` (correction block); `sprint-status.yaml` 13-34; `epics.md` |
| B5 | **Registry baseline corrected 144/81/0 → 145/82/1**, and — the load-bearing half — *"restore to baseline"* is therefore now a **DATA-DELETION HAZARD**: the extra rows are a real registration + its ledger row, not test residue, so the old teardown instruction would delete live data. | `docs/adjudication-agent-handoff.md` §3 |
| B6 | **Ledger-liveness evidence recorded** — `campaign_sends` demonstrably writes on the real path (`recordCampaignSend` is FAIL-SOFT, so liveness must be *observed*, never assumed). Keeps `pre-blast-dry-run.md` §2's `SELECT` mandatory. | `docs/runbooks/pre-blast-dry-run.md` §2; handoff §3 |
| B7 | 13-24 is `done` **with an open operator Task 5** (the ~116-address welcome backfill, Resend-Pro-gated) — an unchecked `[ ]` under a `done` status, and it is **launch step 2**. Exactly the invisible debt §2a0 exists to catch. | `docs/adjudication-agent-handoff.md` §4; `13-24-…md` Task 5 |
| B8 | **Planning-artifact parity fixes applied** — `epics.md` and `roadmap-to-launch.md` corrected where they contradicted `sprint-status.yaml` (13-24, 13-36, 13-37 statuses; 13-43/13-44 indexed for the first time). `sprint-status.yaml` is canonical. | `epics.md`; `docs/roadmap-to-launch.md` |
| B9 | **New story 13-46 — public-burst readiness** (radio jingle): cap the SEND not the SIGNUP. LAUNCH-ADJACENT, `ready-for-dev`. Not dependent on 13-37 or 13-41. `13-45` stays RESERVED for handoff §8 D3. | `13-46-public-burst-readiness-send-caps-and-registration-throttle.md`; `sprint-status.yaml`; `epics.md` |
| B12 | **Story 13-48 — test-environment fidelity.** *Why no test caught 13-47*: the e2e env serves **no pinned public form**, so CI drives a **4-step** wizard while prod runs **10** — the cap was unreachable by construction and every signal stayed green. A **fixture** story, not an assertion story. ⚠️ Cannot catch a prod re-pin (data, not code) — `registration.draft_rejected` → 13-42 is the only prod-facing signal. | `13-48-e2e-environment-fidelity-multi-section-wizard.md` |
| B11 | 🔴 **Story 13-47 — a LIVE seven-day prod defect, found by running 13-46 AC9's dry run.** `saveDraftSchema.currentStep: .max(5)` was never re-derived when wizard steps became form-driven; 13-34's re-pin made N=10, so every draft autosave past step 5 400'd — 232/293 drafts frozen, attribution on 0/84 submissions. Fixed + Pitfall #46 + all 292 drafts extended a month. **This is R-1's fifth and worst instance, and the only one that reached production.** | `13-47-wizard-draft-step-cap-and-attribution-durability.md` (incl. the 3-STAGE COMMIT PLAN) |
| B10 | ⚠️ **Corrected: 13-1's "How did you hear about us?" capture is NOT missing — it is live end to end.** The real gaps are its **zero prod executions** (pre-jingle liveness dry run), *declined* being indistinguishable from *ignored*, and Radio's first-position bias; whether to make the question **mandatory** is an OPEN DECISION for Awwal, not an AC. | `13-46-…md` Context §9, AC9/AC10, the OPEN DECISION block |

## Retro Input (Epic 13) — carry these into the epic retrospective

<!-- Format follows the 13-34 precedent (`## Retro Input (Epic 13)`), because the retro workflow reads
     every story file in full. These are the DURABLE lessons of the 2026-07-30 session — not a summary
     of what was fixed (that is `## Review Follow-ups (AI)`), but the transferable shape underneath. -->

**R-1 — THE PATTERN OF THE SESSION: a control or a claim inherited from one context and never
re-derived in the new one.** It appeared **four times in one day**, in four different layers:
- `registrationRateLimit` (5/IP/15min) was copied from the legacy `/auth/public/register` auth
  endpoint onto the public *survey* wizard, comment and all — *"Prevents mass account creation"*
  (`middleware/registration-rate-limit.ts:24`, receipt at `routes/registration.routes.ts:48`).
  **There are no accounts on that path**, and under Nigerian carrier-grade NAT the control is
  actively harmful. → Story 13-46.
- **13-41 inherited three of 13-37's defects textually, before a line of its code existed** — its
  Task 1/Task 5 cited a "13-37 convention" that `tsconfig.json`'s `rootDir: ./src` forbids, and its
  AC6 reproduced finding H1 verbatim. Copying a *sibling story's* plumbing copies the sibling's bugs.
- **13-34's completeness claim** — *"Every `::uuid` cast on a TEXT column in `apps/api` is accounted
  for"* — was false, in a story already `done` and deployed (`form.controller.ts:276,325`).
- **This story's own guard rules** matched only the `LEFT JOIN` spelling — one syntactic form of a
  shape, mistaken for the shape. Two of the missed spellings were already live in this codebase.

- 🔴 **AND THE ONE THAT WAS ACTUALLY BREAKING PRODUCTION** — `saveDraftSchema`'s
  `currentStep: z.number().int().min(1).max(5)` (`registration.controller.ts:61`). Correct for Story
  9-12's *fixed five-step* wizard; never re-derived when the step count became **form-driven**
  (`3 head + one per form SECTION + 1 review`). The 13-34 re-pin (2026-07-23) published a **six**-
  section public form → N = **10** → every draft autosave from step 6 upward 400'd behind the
  deliberately-generic `WIZARD_DRAFT_INVALID_INPUT`, surfacing only as a silent local `saveError`.
  Measured: **232 of 293 drafts frozen at step 4-5, MAX(current_step) = 5 in a ten-step wizard**, and
  `campaign_source` absent from **all 84** submissions because 13-1's `extras` is written on the
  review step. Found only because a liveness dry run was run against prod before trusting the
  feature. Fixed 2026-07-30 (bound raised + RED-verified regression test).

  **The rule: a copied CONTROL needs its threat model re-derived; a copied CLAIM needs its evidence
  re-run.** Neither is discharged by the original having been correct where it came from. Note the
  escalation across the five instances: the first four cost *review time*; the fifth was silently
  destroying user data in production for a week, and would have met the blast and the jingle head-on.
  **A bound is a claim about the world. When the world becomes dynamic, the bound is already wrong.**

**R-2 — Fixture-based tests for a guard encode only the evasions the author already imagined.**
13-37 shipped 30 green tests while four join spellings walked straight through. Fixtures cannot fail
in a direction their author did not conceive. **The antidote that actually worked, and should be
standard for every guard (13-41, 13-45):** enumerate the syntactic variants explicitly, **measure each
against the REAL tree** (widening is free only if measured to be free), and add a **regression lock
against the REAL canonical artifact** — not a hand-written lookalike, which drifts silently when the
original is edited.

**R-3 — A step that never runs also never goes red.** Pitfall #45's mechanical form is CI ordering,
but the general lesson is evidentiary: **"CI is green" is not evidence that a check executed.** Any
gate whose value depends on having run must be verified by its own output in the log, not by the
absence of a failure. This is [[pattern-ship-a-fix-that-never-fires]] wearing a CI badge, and it was
found *inside the story written to prevent that pattern* — which is the point: the pattern does not
respect intent.

**R-4 — "Verify before asserting" cuts toward the AGENT at least as often as toward the operator.**
An agent (me) told Awwal the "How did you hear about us?" question did not exist. Awwal said it did.
**Awwal was right** — it is live at `Step5ReviewAndSave.tsx:229`, flag on, wired end to end. The
failure was a truncated search treated as exhaustive (`--include=*.ts` silently excluding the `.tsx`
where the UI lives, then `head -10` cutting off the remaining hits) followed by reasoning from a
`raw_data` query that could not possibly show an answer nobody had given yet. **When the person who
built the system contradicts you about whether it exists, open the file before arguing.** Corollary:
a negative result from a search is only as strong as the proof that the search was complete.

**R-5 — A documented baseline becomes a liability the moment the system is live.**
`144 respondents / 81 submissions / 0 campaign_sends`, annotated *"restore target after any test
reg"*, was correct when written — and silently became a **data-deletion instruction** the moment the
first organic public registration arrived mid-session. **Teardown must delete the rows you created,
BY ID. Never restore a count.** Any recorded baseline needs a re-measure step, not a remembered
number; prod is no longer a quiet tree.

**R-6 — A story's close gate must stay NARROWER than the session's decision list.** This session
produced ~30 decisions; exactly **five** gate 13-37's `done`. Folding the rest in would have made the
story permanently un-closeable — so they are INDEXED (Part B) rather than owned. The generalisation
for the residual ledger (handoff §8 D1): *a residual belongs to the story that can DISCHARGE it*, and
anything else is a pointer.

## Change Log

| Date | Change | Rationale |
|------|--------|-----------|
| 2026-07-30 | **Added `## Session Decision Log (2026-07-30)` (Bob/SM) — no code touched, status UNCHANGED at `review`.** Two parts, deliberately asymmetric: **Part A** states in full the five decisions that BIND this story's close-out (A1 the 12 review findings incl. L2 documented-not-fixed → deferred into 13-41's AST work and L5's deliberate scope widening beyond AC1; A2 closes-on-push with R1 blocking and R2/R3 ACCEPTED; A3 the fixed close sequence whose step 3 is *confirm in the run log that the guard executed ABOVE `Lint`*; A4 D1+D9 adopted here as the worked example + Pitfall #45 minted; A5 the three known push risks — pre-push full suite needing a current `app_test`, the bcrypt self-register flake, and the guard running on **Linux for the first time**, whose failure mode is a loud false-positive red, not a silent pass). **Part B** is an INDEX ONLY — nine one-line pointers to cross-cutting session decisions that live in `13-41`, `13-34`, the handoff doc, the runbooks, `epics.md` and the new `13-46`, with the rule stated at the top that they are indexed, not owned, and **only Part A gates this close**. | Awwal asked that every decision from the session be captured so nothing is missed at close-out. Honouring that literally inside a CI-guard story would have made it un-closeable: decisions about jingles, rate limits and registry baselines are not 13-37's business, and a story whose ledger mixes owned debt with indexed debt cannot answer "is this done?". The split satisfies the intent (nothing lost, one place to look) while keeping the close gate narrow enough to actually discharge — the same reasoning that made §2a0's three states three, and not a prose list. |
| 2026-07-30 | **Close-out prep by Bob (SM) — no code touched, status UNCHANGED at `review`.** Added the first `## Residuals` ledger (handoff §8 **D1**) and the first fixed `## Closing verdict` block (§8 **D9**), using §2a0's three states. One BLOCKING row (R1 = AC6's CI leg, DISCHARGE-ON-PUSH, now also covering the H1 step reorder) plus two ACCEPTED rows (R2 = rule-(a) scope gap, measured 50→0; R3 = L2's comment-mask KNOWN LIMIT, kept explicitly as the example of a *thin* ACCEPTED because it carries a bound rather than a count). Deploy SHA left explicitly PENDING. | 13-37 is a better D1/D9 worked example than the proposed 13-36 retrofit: it has exactly ONE blocking residual, that residual has re-runnable evidence on both sides of the push, and the ledger is being written BEFORE the close rather than reconstructed after it — which is the whole point of §2a0's two touch points. The two ACCEPTED rows are what §2a0's own grep surfaces, so omitting them would have made the ledger fail its own gate on day one. |
| 2026-07-30 | **Adversarial code review — 12 findings (3 High / 4 Med / 5 Low), ALL fixed in-pass.** H1: the named CI step could NEVER execute (the guard is in the `lint` chain and `Lint` ran first → job aborts before the named step) — step moved above `Lint` + `⚠️ ORDER MATTERS` comments in both `ci-cd.yml` and the runner header. H2/H3: both rules matched only the `LEFT JOIN` spelling, so the cheapest evasion (change one keyword) escaped — and BOTH missed spellings are already this repo's idiom (`survey-analytics.service.ts:1674` inner-joins respondents; `:1675` uses `CROSS JOIN LATERAL`); widened to any join spelling incl. the comma join, measured 0 false positives. M1: regression-lock test now asserts against the REAL `REGISTRY_UNIFIED_SQL_TEXT`, so editing 13-33's SQL can't silently disarm rule (b). M2: escape hatch honoured anywhere inside the enclosing SQL statement. M3: a reason-less hatch now reports WHICH drift it suppressed. M4 + L5: stale story claims corrected; `scripts/**` now scanned (54 files, 0 hits). L1/L2/L3/L4 per the follow-up register. RED-verified with 3 live canaries in the previously-missed spellings (guard exited 1 naming all three; canaries deleted, tree clean). Gate: guard 344 files/0 hits, guard tests 46 pass, API suite 3326 pass/0 fail, tsc + eslint clean. Status stays `review` — AC6's CI leg is still DISCHARGE-ON-PUSH and now also covers the changed step order. | The guard was narrower than its own threat model in three ways the fixture-based tests could not see: two one-keyword evasions, and a CI step that could never run. All three were measured against the real tree/detector before being fixed, and the widenings were measured to cost zero false positives before being applied. |
| 2026-07-30 | **Implemented** via dev-story. Detector core `src/lib/registry-read-drift.ts` + runner `scripts/lint-registry-read-drift.ts` + 30 tests; `lint:registry-read` script folded into the `lint` chain; named blocking step added to CI `lint-and-build`. Guard green on the current tree (291 files, 0 hits); API suite 3310 pass; tsc + eslint clean. RED-verified with live canaries. Status → review. | Makes the 13-33 drift mechanically hard to re-introduce, rather than relying on docs being read. |
| 2026-07-30 | **AC1 amended mid-dev (ruled by Awwal):** rule (a) scoped to registry-fact modules; rule (b) stays global. | AC1's literal pattern flagged 50 reads, 48 legitimate (44 in `survey-analytics.service.ts` alone) — AC2 and AC6 were unsatisfiable as drafted. `FROM submissions LEFT JOIN respondents` is the correct grain for submission-level analytics; the module's job, not the SQL text, is what distinguishes drift. Accepted gap documented in Dev Notes + the detector header. |
| 2026-07-19 | Story drafted by Bob (SM) via *create-story, emergent from the 13-33 post-ship backlog-harmonization sweep. A CI guard that fails on a NEW hand-rolled respondent⟕submission registry read outside the sanctioned modules (`registry-unified.sql.ts`, `export-query.service.ts`, `respondent.service.ts`), with an inline `registry-read-drift-ok: <reason>` escape hatch + tests + a `lint-and-build` step. Makes the submission-vs-respondent drift 13-33 killed hard to re-introduce. POST-LAUNCH, NON-GATING; sequences after 13-33 deploys. Status → ready-for-dev. | Doc nudges rely on being read; the sweep found 5 pre-13-33 stories about to re-fork the read — enforce mechanically. See feedback: canonical-primitive-backlog-sweep. |
