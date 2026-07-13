# Story 13-30: Fix the `security.reauth-routes.test.ts` teardown FK-race flake

Status: ready-for-dev

<!-- Authored 2026-07-13 by Bob (SM) via *create-story. EMERGENT: the 13-27 deploy was blocked once by a CI `test-api` failure that was NOT a 13-27 defect — it was a latent flake in the 13-18 `security.reauth-routes.test.ts` `afterAll` cleanup. The test's assertions all passed; the teardown threw `audit_logs_actor_id_users_id_fk` (23503) deleting the test users. Passed clean on `gh run rerun --failed` → deployed. It will keep intermittently reddening CI and forcing a re-run on future deploys. Test-hygiene, NOT launch-gating. -->

## Story
As **a developer relying on green CI to deploy**,
I want **the `security.reauth-routes.test.ts` teardown to delete its fixtures without a foreign-key race**,
so that **a passing test suite doesn't intermittently fail in CI teardown and block the deploy, forcing a manual re-run every few pushes.**

## Context & Evidence (CI, 2026-07-13 run 29249011546)
- The 13-27 push's `test-api` job failed → the pipeline **skipped the deploy**. The failure was **NOT** a 13-27 defect (13-27 touches no routes/reauth/users) and passed clean on `gh run rerun --failed`.
- **Exact error** (in the `afterAll`, not an assertion): `update or delete on table "users" violates foreign key constraint "audit_logs_actor_id_users_id_fk" ... Key (id)=(019f5b67-6903-…) is still referenced from table "audit_logs"` (Postgres `23503`), at `apps/api/src/__tests__/security.reauth-routes.test.ts:228` (`tx.delete(users)`).
- **Root cause = a delete-order race in the teardown.** The `afterAll` (a) disables the `audit_logs` immutable trigger, (b) `DELETE audit_logs WHERE actor_id IN (userIds)`, (c) deletes magic-link tokens, (d) `DELETE users WHERE id IN (userIds)`. But the E2E body issues **fire-and-forget audit writes** (login-grace grant, reauth, logout, privileged-action logs) — one can land **between (b) and (d)**, re-inserting an `audit_logs` row for a test user, so (d) hits the FK. It's timing-dependent → only surfaces under CI parallelism (green locally + on prior deploys).
- **Not launch-gating** — it's test infrastructure. But it wastes a re-run (~6 min) on roughly every future deploy and trains operators to reflexively re-run red CI (dangerous habit that could mask a *real* failure).

## Acceptance Criteria
1. **AC1 — Teardown is race-free.** The `afterAll` deletes the test users without an FK violation even if async audit writes are still in flight. Acceptable approaches (dev's choice, state which): (a) **await/settle** the pending fire-and-forget audit writes before teardown (the cleanest — the test knows which actions it fired); or (b) **re-delete `audit_logs` immediately before the `users` delete** inside the same transaction (closes the window); or (c) delete audit_logs with a broader predicate / retry; or (d) a small settle-delay + re-delete. Do NOT weaken the product FK or the audit immutability trigger's prod behaviour.
2. **AC2 — Deterministic, not just "re-run passes".** The fix must remove the race, not merely lower its probability — demonstrate by reasoning (the audit-write window is closed) or a stress loop. If (b), the re-delete must run after all in-body async audit writes could have completed.
3. **AC3 — Same class swept.** Grep other integration `afterAll`/`afterEach` blocks that `delete(users)`/`delete(respondents)` after firing async audit writes (the same immutable-trigger-disable + delete-by-actor pattern) — fix any with the identical window, or confirm none. (This race is a pattern, not a one-off; the audit path is fire-and-forget across the app.)
4. **AC4 — Suites green + no new flake.** Full api suite green; the reauth-routes suite green across repeated runs (e.g. a `--repeat`/burn-in locally); tsc/eslint clean.

## Tasks / Subtasks
- [ ] **Task 1 (AC1, AC2)** — close the teardown FK window in `security.reauth-routes.test.ts` (await pending audit writes, or re-delete audit_logs pre-users-delete); justify determinism.
- [ ] **Task 2 (AC3)** — sweep sibling integration teardowns for the same delete-users-after-async-audit pattern; fix or clear.
- [ ] **Task 3 (AC4)** — burn-in the reauth-routes suite; full api suite + tsc/eslint.

## Dev Notes
- **The audit path is fire-and-forget by design** (comms/audit never sinks a request — the 9-26 lesson), so any test that fires audited actions then deletes the actor in `afterAll` has this latent window. That's why AC3 sweeps for siblings.
- **Cheapest robust fix is likely (b)** — inside the existing teardown transaction, run the `DELETE audit_logs WHERE actor_id IN (userIds)` a second time right before `DELETE users`, since by `afterAll` all in-body requests have resolved and no NEW audit writes should be starting. But (a) awaiting the known writes is the most honest. Dev picks.
- **Do not** reach for the blunt fix of leaving the immutable trigger disabled or dropping the FK — the FK + trigger are correct product behaviour; only the *test teardown ordering* is wrong.
- **Won't-fix note carried from 13-18 review:** the midnight-age-boundary clock-drift item is separate and already accepted; this story is only the FK-race teardown.

### References
- [Source: apps/api/src/__tests__/security.reauth-routes.test.ts:~219-231 (the afterAll cleanup transaction; :228 = the failing `delete(users)`)]
- [Source: CI run 29249011546 (2026-07-13) — `audit_logs_actor_id_users_id_fk` 23503 in test-api teardown; passed on rerun]
- [Source: 13-18 (the test that owns this suite); 9-26 (fire-and-forget audit/comms lesson)]

## Dev Agent Record
### File List

## PM Validation (John, 2026-07-13)

**Validated — approved. Test-hygiene fast-follow, NOT launch-gating.**

1. **Priority:** low urgency, real value. It doesn't touch product code or the blast, so it's not pre-blast. But a deploy that randomly needs a manual re-run is corrosive — it normalises "red CI? just re-run it," which is exactly how a *real* regression sails through one day. Fix it in the first post-launch hygiene pass (or sooner if it flakes again before launch and burns a deploy window).
2. **AC3 is the real value — treat this as a pattern, not a one-off.** The fire-and-forget audit write racing a fixture teardown is a repo-wide shape; sweep the sibling integration teardowns so we fix the class, not just this file. That's what stops it recurring under a different test name next month.
3. **Guardrail (AC1):** fix the test ORDERING, never the product FK or the audit-immutability trigger. A "fix" that disables the trigger or drops the constraint to make teardown pass would be trading a flaky test for a weakened invariant — reject that.
4. **Determinism over probability (AC2):** "passes on re-run" is not a fix. Require the window be closed (awaited writes, or a re-delete after all in-body async settles), demonstrated by a burn-in.

**No AC changes.** Dev-ready; schedule post-launch (bump if it burns another deploy).

## Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-07-13 | Story drafted via *create-story — the 13-18 `security.reauth-routes.test.ts` `afterAll` deletes test users after fire-and-forget audit writes can re-reference them, causing an intermittent `audit_logs_actor_id_users_id_fk` (23503) CI teardown failure that blocked the 13-27 deploy until a re-run. Fix the teardown ordering (await/re-delete), sweep sibling teardowns for the same class, burn-in. Test-hygiene, NOT launch-gating. EMERGENT from the 13-27 deploy flake. | Bob (SM) |
