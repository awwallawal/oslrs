# Story 9.24: Local DB drift prevention + test-fixture isolation discipline

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Surfaced during the 2026-05-19 session-close-out when Awwal ran
`pnpm dashboard` locally after the Story 9-19 commit. Three converging
failure modes were diagnosed:

  1. Local DB schema lagged behind code (last db:push:full was before
     Story 10-1 schema down-payment + Story 9-12 magic-link work) →
     `consumed_at` column did not exist
  2. Forty-eight stale test fixtures (32 api_consumers named
     "Invalid X Test" + 16 respondents with status='totally_made_up_status')
     from audit-principal-dualism.test.ts + sibling tests leaked across
     test runs → blocked the new check-constraint migration in
     migrate-audit-principal-dualism-init.ts + migrate-multi-source-
     registry-init.ts
  3. Dashboard script bug (`consumed_at` column-name typo vs actual
     `used_at`) was silently masked by graceful-degradation try/catch
     → wrong magic-link consumption stats reported for ~24 hours before
     local re-run surfaced it

Today's debugging session burned ~45 min on what should have been
prevented at the test-discipline layer. This story closes the gap so
the entire class of developer-experience failure cannot recur.

NOT a prep-task per Awwal's 2026-05-19 directive — real-data-driven
decisions deserve numbered Story tracking so a future developer
inherits a navigable roadmap.
-->

## Story

As the **developer or operator picking up the OSLRS codebase after a break (or on a fresh clone)**,
I want **local DB schema kept in sync with code automatically on `git pull` / `git checkout`, a one-command health check (`pnpm doctor`) that detects drift + stale test fixtures + env mismatches, test fixtures that cannot accumulate because they're naming-convention-enforced + transactional-test-wrapped, and dashboard CLI bugs that fail loudly instead of hiding behind graceful degradation**,
So that **the 2026-05-19 debugging session cannot recur — newcomers don't burn 45+ minutes on "why doesn't this work locally" because the tooling tells them what's wrong AND suggests the fix**.

## Acceptance Criteria

### Part A — Husky post-merge + post-checkout hooks (catches schema drift)

1. **AC#A1 — `.husky/post-merge`**: after `git pull` or `git merge`, the hook detects changed files matching `apps/api/src/db/schema/**/*.ts` or `apps/api/drizzle.config.ts` or `apps/api/scripts/migrate-*.ts`. If any match, the hook prompts the developer "Schema files changed. Run `pnpm --filter @oslsr/api db:push:full` now? [Y/n]" and runs it on Y (default).

2. **AC#A2 — `.husky/post-checkout`**: same logic on branch switches. When checking out a branch with different schema files than the previous HEAD, prompt.

3. **AC#A3 — Hooks are skippable**: `HUSKY=0` env var or `--no-verify` git flag bypasses (matches existing project convention from `feedback_review_before_commit.md`).

4. **AC#A4 — Performance**: hooks add <500ms on the no-change path (just a `git diff --name-only` + grep).

### Part B — `pnpm doctor` health-check script

5. **AC#B1 — New script**: `apps/api/scripts/doctor.ts` registered as `"doctor": "tsx scripts/doctor.ts"` in `apps/api/package.json` (alongside existing `dashboard`, `pin-public-form`).

6. **AC#B2 — Six checks**: each rendered as a colored bullet with PASS/FAIL/WARN status:
   - Schema drift (runs `drizzle-kit check` programmatically; FAIL = pending migrations)
   - Test fixture residue (counts rows matching known fixture patterns: `name LIKE 'Invalid%'`, `name LIKE '__test_%'`, `status='__test_%'` etc.; WARN if >0)
   - Last migration timestamp (queries `system_settings` for last seed-runner timestamp; WARN if >7 days)
   - Postgres connectivity + data-dir size (sanity ping + size threshold)
   - Redis connectivity (BullMQ requires it)
   - Environment sanity (DATABASE_URL points at a dev DB not prod; NODE_ENV=development; etc.)

7. **AC#B3 — `--fix` flag**: with `pnpm --filter @oslsr/api doctor --fix`, the script auto-resolves the safe-to-auto-fix cases:
   - Schema drift → runs `db:push:full`
   - Test fixture residue → deletes all rows matching fixture patterns
   - Other checks remain WARN-only (operator must fix env vars themselves)

8. **AC#B4 — Exit codes**: 0 if all PASS or WARN, 1 if any FAIL. Suitable for chaining into pre-commit hooks (`pnpm doctor && pnpm test`).

### Part C — Test-fixture isolation discipline

9. **AC#C1 — Fixture naming convention documented**: new `docs/test-fixture-naming.md` runbook declares that every DB row inserted by a test MUST have an identifier prefixed with `__test_` (or `[E2E-*]` for e2e specs, matching existing messaging.spec.ts convention). Examples + counter-examples + rationale.

10. **AC#C2 — Audit existing tests for missing afterAll cleanups**: grep all `*.test.ts` + `*.test.tsx` for `INSERT INTO` / `db.insert(...)` patterns. For each, verify either:
    - An afterAll/afterEach DELETE matches the inserted rows, OR
    - The test uses the transactional wrapper (BEGIN/ROLLBACK)
    Audit results land in `docs/test-fixture-audit-2026-05-19.md`. Tests without proper cleanup either get retrofitted (Task 5) OR have a `// FIXTURE-LEAK-TRACKED` comment explaining why.

11. **AC#C3 — Transactional-test helper**: extend `packages/testing/src/db-helpers.ts` (or create if absent) with `withRollbackTx(fn)` helper that wraps a test in BEGIN; ROLLBACK so commits auto-undo. Use the pattern from existing integration-test usage of `pg.Pool` + `BEGIN` blocks if any.

12. **AC#C4 — Retrofit the four offending tests** (identified by Task 2's audit):
    - `audit-principal-dualism.test.ts` (current culprit — leaked 32 rows)
    - Any others surfaced by the audit
    Each gets either an afterAll cleanup OR the transactional wrapper.

13. **AC#C5 — ESLint rule (stretch goal)**: custom rule that warns when `pg.query(\`INSERT INTO ...\`)` appears in a test file without a sibling `afterAll(.../DELETE.../...)`. Out-of-scope if too complex; flag as a follow-up.

### Part D — Dashboard --strict mode + section unit tests

14. **AC#D1 — `pnpm dashboard --strict`**: new flag that disables graceful-degradation. Any section's data-fetch failure re-throws and aborts the whole script with a clear error. Run weekly in CI (new workflow `.github/workflows/dashboard-strict.yml` on schedule) to catch script rot before it bites operationally.

15. **AC#D2 — Section unit tests**: `apps/api/scripts/__tests__/dashboard.test.ts` covering each section's data-fetcher function:
    - `getSystemHealth()` returns expected shape when pm2 is available; null when not
    - `getTraffic(pool)` returns the expected fields (totalRespondents, draftsByDay, funnel, magicLinksIssued, magicLinksConsumed — uses the CORRECT `used_at` column per the 2026-05-19 fix)
    - `getResendStatus()` returns expected shape (mocked Resend API)
    - `getQueueHealth()` returns expected shape (mocked ioredis-mock)
    The traffic test would have caught the `consumed_at` typo at unit-test time.

### Part E — Memory consolidation + handover docs

16. **AC#E1 — New memory entries**:
    - `feedback_db_push_full_after_pull.md` — discipline for pulling main + running db:push:full
    - `feedback_test_fixture_naming_convention.md` — the prefix rule + why
    - `feedback_dashboard_strict_mode_in_ci.md` — script-rot detection pattern

17. **AC#E2 — Onboarding doc update**: `docs/onboarding/local-setup.md` (new or extending existing) prominently calls out `pnpm doctor` as the FIRST thing a new dev runs after clone + `pnpm install`.

## Tasks / Subtasks

- [ ] **Task 1 (Part A) — Husky hooks** (AC: #A1, #A2, #A3, #A4)
  - [ ] 1.1: Author `.husky/post-merge` with the schema-files-changed detector + prompt
  - [ ] 1.2: Author `.husky/post-checkout` with same logic
  - [ ] 1.3: Manual test: pull a branch with schema changes; confirm prompt fires
- [ ] **Task 2 (Part B) — `pnpm doctor` script** (AC: #B1-B4)
  - [ ] 2.1: Author `apps/api/scripts/doctor.ts` with the 6 checks
  - [ ] 2.2: Register in `apps/api/package.json`
  - [ ] 2.3: Implement `--fix` flag
  - [ ] 2.4: Test against current local state (should report all PASS post-2026-05-19-fix)
- [ ] **Task 3 (Part C) — Test fixture audit** (AC: #C1, #C2)
  - [ ] 3.1: Author `docs/test-fixture-naming.md` runbook
  - [ ] 3.2: grep + audit all DB-touching tests; produce `docs/test-fixture-audit-2026-05-19.md` report
- [ ] **Task 4 (Part C) — Transactional helper** (AC: #C3)
  - [ ] 4.1: Author `withRollbackTx()` in `packages/testing/src/db-helpers.ts`
- [ ] **Task 5 (Part C) — Retrofit offending tests** (AC: #C4)
  - [ ] 5.1: `audit-principal-dualism.test.ts` afterAll cleanup
  - [ ] 5.2: Other tests surfaced by Task 3
- [ ] **Task 6 (Part D) — Dashboard --strict + tests** (AC: #D1, #D2)
  - [ ] 6.1: Add `--strict` flag to `apps/api/scripts/dashboard.ts`
  - [ ] 6.2: Author `apps/api/scripts/__tests__/dashboard.test.ts` with 4 section tests
  - [ ] 6.3: Add `.github/workflows/dashboard-strict.yml` weekly schedule
- [ ] **Task 7 (Part E) — Memory + onboarding** (AC: #E1, #E2)
  - [ ] 7.1: Three new feedback_*.md memory entries
  - [ ] 7.2: Onboarding doc
- [ ] **Task 8 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`)

## Dev Notes

### Strategic framing

The 2026-05-19 debugging session burned ~45 min on three converging failures. None of them were CODE bugs in the running app — they were TOOLING + DISCIPLINE gaps:

1. Schema drift went undetected for ~8 days (since the last db:push:full)
2. Test fixtures accumulated for 16+ test runs across May 10-11
3. Dashboard script's typo (`consumed_at`) was masked by graceful degradation

Each layer's defense exists in the project today AS A PATTERN (CI runs db:push:full on every prod deploy; some test suites do use afterAll cleanup; some scripts do throw on failure) — but the patterns aren't UNIFORM. This story makes them uniform and enforceable.

Per memory note `feedback_review_patterns_deploy_scripts.md`: patterns compound across stories. The same logic applies here — codifying these prevention patterns now prevents the next dev (or returning operator after a break) from re-discovering them painfully.

### Dependencies

- **Story 9-19** — dashboard CLI. Part D extends it.
- **Story 9-22 (operator-db-audit-discipline)** — adjacent in spirit; both improve auditability. But 9-22 is about PROD operator actions; 9-24 is about LOCAL dev discipline. No code overlap.
- **`feedback_review_before_commit.md` memory** — Part B AC#B4's "pre-commit chain" honors the existing review discipline. Both can coexist.
- **Story 9-21 (route-registration integration test)** — same testing-discipline category; could be bundled later if Story tracking gets dense.

### Risks

1. **Husky hook prompt is disruptive** — if a developer pulls 10 times a day with schema changes, they answer the prompt 10 times. Mitigation: AC#A1's default-Y + the `HUSKY=0` skip make it low-friction.

2. **`--fix` deletes data the developer wanted to keep** — fixture-pattern matches might catch real dev data with similar names. Mitigation: AC#B3's auto-fix list is conservative (only known patterns); `--fix` requires explicit flag (won't run by default).

3. **Transactional test wrapper breaks tests with sequence dependencies** — some tests INSERT in test 1 + SELECT in test 2. The wrapper breaks them by rolling back between tests. Mitigation: the wrapper is OPT-IN per test file; existing tests with cross-test data dependencies keep using afterAll cleanup.

4. **Dashboard `--strict` in CI causes false positives during transient network issues** (Resend API timeout, Tailscale glitch). Mitigation: weekly schedule (not on every push), and a single re-run within the same workflow before failing.

### Effort estimate

- Part A (husky hooks): half-day
- Part B (`pnpm doctor`): 1 day
- Part C (test fixture discipline): 1 day
- Part D (dashboard --strict + tests): half-day
- Part E (memory + docs): half-day
- **Total: ~3-3.5 dev-days**

### Pre-impl notes for the dev agent

- The doctor script's check architecture mirrors `dashboard.ts`'s section pattern (parallel fetch, graceful degradation per check, threshold-coded output). Reuse the ANSI color helpers from dashboard.ts.
- For Part C AC#C3's transactional wrapper, look at how `apps/api/src/services/__tests__/audit.service.test.ts` already uses `BEGIN` + `ROLLBACK` patterns; lift the pattern out into a reusable helper.
- For Part D AC#D2 unit tests, mock `pg.Pool` via `vi.hoisted` + `vi.mock` per the project convention. Mocked rows must include the CORRECT column names (`used_at`, not `consumed_at`) to act as a regression test for today's bug.

## File List

(Populated by dev agent. Expected:)
- `.husky/post-merge` (new)
- `.husky/post-checkout` (new)
- `apps/api/scripts/doctor.ts` (new, ~200 lines)
- `apps/api/scripts/__tests__/dashboard.test.ts` (new, ~150 lines)
- `apps/api/scripts/dashboard.ts` (modified — `--strict` flag added)
- `apps/api/package.json` (modified — `doctor` script registered)
- `packages/testing/src/db-helpers.ts` (new or extended — `withRollbackTx` helper)
- `apps/api/src/db/schema/__tests__/audit-principal-dualism.test.ts` (modified — afterAll cleanup retrofitted)
- `.github/workflows/dashboard-strict.yml` (new)
- `docs/test-fixture-naming.md` (new)
- `docs/test-fixture-audit-2026-05-19.md` (new)
- `docs/onboarding/local-setup.md` (new or extended)
- `MEMORY.md` (3 new entries)
