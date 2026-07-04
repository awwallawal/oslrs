# Hotfix Record — Pre-Push Gate DB-Parity + Stranded-Push Resolution

**Date:** 2026-07-04 · **Commit:** `13275f1` (fix) atop `d55dadc` (the stranded enum commit) · **Type:** test-infrastructure hotfix (no product-runtime change) · **Status:** DONE — implemented, verified via full suite, pushed, CI green, deployed.

> Lightweight record for the BMAD retrospective. This is NOT a create-story → dev-story artifact: the work was already implemented + committed + deployed when recorded. Cross-refs: Pitfall #42 (`docs/infrastructure-cicd-playbook.md`), running doc addendum (`docs/session-2026-07-01-campaign-measurement-spine.md`), `local-test-db-parity` memory.

## Incident
A prior session's laptop died mid-`git push`, leaving `main` 1 commit ahead of `origin` (`d55dadc`, the 13-2 `imported_association` source-enum addition — item 7 of that session's agenda; item 8 "confirm the push landed + CI green" never happened). On resuming, the push was blocked by the pre-push gate: **30 API tests failed** with `relation "email_events" does not exist`-class errors, plus 2 `me.service` completeness failures.

## Root cause
Two coupled issues, neither in the committed code:
1. **The pre-push gate validated the DEV DB, not a test DB.** `.husky/pre-push` ran `turbo run test`, which inherited root `.env` (`DATABASE_URL=app_db`, `NODE_ENV=development`). The db-guard (`apps/api/test/db-guard.ts`, Pitfall #39) only fires under `NODE_ENV=test`, so it NO-OP'd and the full suite ran against the 499k-row dev DB. That DB had drifted ~an epic behind (missing Epic-13 `email_events`/`email_suppressions`, the new enum, constraints) because an earlier agent kept `app_test` current per convention but nobody migrated `app_db`. It had also accumulated **21 leaked constraint-rejection fixtures** (`Invalid Status Test` / `Invalid Org Test` / `totally_made_up_status`) that then blocked the CHECK-constraint migrations.
2. **2 tests depended on ambient DB state.** `me.service.test.ts` (9-61) submits empty questionnaire responses, so it passed only where NO public form is pinned (CI / `app_test` → `PUBLIC_FORM_NOT_CONFIGURED` swallowed) and failed where one is (`app_db` / prod → completeness enforced → `INCOMPLETE_SUBMISSION`).

## Fix (`13275f1`)
- **Synced `app_db`** (`db:push:full:force`) after deleting the 21 junk fixture rows; **dropped stale `oslsr_bench`** (spent 9-11 benchmark DB) via its own `cleanup:audit-bench`.
- **Re-pointed `.husky/pre-push`** to `export NODE_ENV=test` + `DATABASE_URL=…/app_test` before `turbo run test` — the local gate now validates the SAME clean slate CI's `test_db` uses (both provisioned by `db:push:full:force`), and the guard is engaged so the suite can never silently run against `app_db` again.
- **`me.service.test.ts` now owns its form fixture** — `vi.spyOn(NativeFormService.getPublicActiveForm)` in `beforeEach` (MUST be `beforeEach`: `vitest.base.ts` `restoreMocks:true` wipes a `beforeAll` spy — same root as the 13-13 mockReset pitfall). Deterministic on any DB regardless of the ambient `wizard.public_form_id`.

## Prevention (settled state)
- **Local DB layout:** `app_db` = canonical dev DB (run the app here, NOT the suite); `app_test` = clean CI-mirror (suite runs here); `oslsr_bench` = dropped.
- **Rule:** after any schema change, sync `app_test`: `DATABASE_URL=…/app_test pnpm --filter @oslsr/api db:push:full:force`.
- **Pitfall #42** records the whole chain, incl. the laptop-sleep fake-failure signature (9h+ duration, `Hook timed out`, ZERO assertion failures → re-push, don't debug).

## Verification
Full API suite green on `app_test` (2960 passed); full pre-push gate green (web replayed from turbo cache, API re-ran fresh, 3m1s); CI/CD Pipeline `success` incl. deploy. `origin/main @ 13275f1`, live.

## Retrospective takeaways
1. Automation must obey the same discipline it enforces — the guard existed, but the gate that should have used it didn't.
2. A test that reads ambient DB state is a latent local↔CI divergence; own the fixture.
3. Off-site "backup" pushes to `main` trigger the full gate — a stranded commit + a drifted dev DB is a foreseeable combination; the fix hardened both.
