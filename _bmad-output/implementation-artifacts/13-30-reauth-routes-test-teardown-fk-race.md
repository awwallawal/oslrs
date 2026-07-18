# Story 13-30: Fix the `security.reauth-routes.test.ts` teardown FK-race flake

Status: done

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
- [x] **Task 1 (AC1, AC2)** — close the teardown FK window in `security.reauth-routes.test.ts` (await pending audit writes, or re-delete audit_logs pre-users-delete); justify determinism.
- [x] **Task 2 (AC3)** — sweep sibling integration teardowns for the same delete-users-after-async-audit pattern; fix or clear.
- [x] **Task 3 (AC4)** — burn-in the reauth-routes suite; full api suite + tsc/eslint.

### Review Follow-ups (AI) — 13-30 code-review, 2026-07-18 (all fixed same-pass)
- [x] [AI-Review][Low] Correct the `security.reauth-routes.test.ts` teardown comment: `magic_link_tokens` DOES have a `user_id → users.id ON DELETE cascade` FK (not "no users FK"); reorder is safe via cascade + email-keyed null rows. [security.reauth-routes.test.ts:~227]
- [x] [AI-Review][Low] AC3 sweep scope gap: the `DISABLE TRIGGER`-keyed grep couldn't surface `user.id-card`/`user.selfie` teardowns (delete users w/o that pattern). Verified both clean (endpoints don't audit); enumerated in the sweep table + scope note. [Dev Agent Record → AC3 sweep]
- [x] [AI-Review][Low] Note in `audit-safe-teardown.ts` that each retry re-acquires an `ACCESS EXCLUSIVE` lock via `DISABLE TRIGGER` (serializes teardowns under parallel load); acceptable on the rare race path. [audit-safe-teardown.ts:~97]

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

### Implementation Plan & Approach

**Chosen fix = AC1 option (b) generalised into a shared, deterministic drain helper** — new
`apps/api/src/__tests__/helpers/audit-safe-teardown.ts` exporting `purgeUsersWithAuditDrain(userIds)`.
Pure option (a) ("await the fire-and-forget writes") is not available without instrumenting product
code: `AuditService.logAction` dispatches `db.transaction(...).catch(...)` and exposes **no handle** to
await (audit.service.ts:253/339). So the helper closes the window instead:

- disable trigger → `DELETE audit_logs WHERE actor_id IN (ids)` → `DELETE users WHERE id IN (ids)` → re-enable,
  all inside one `db.transaction`, wrapped in a **bounded retry loop** that re-attempts only on the
  `audit_logs_actor_id_users_id_fk` / SQLSTATE `23503` race.
- **Why this is deterministic, not probabilistic (AC2):** during `afterAll` no HTTP requests run, so the
  set of in-flight fire-and-forget audit writes is **finite and monotonically draining**. The loop returns
  ONLY on a clean delete — it cannot exit while the FK race is still live, so the window is closed *by
  construction*, not merely narrowed. Once the last straggler commits, the next attempt's audit-delete
  removes it and the users-delete succeeds. Any non-draining FK, or any other error, escapes after the
  bounded attempts by design (surfaces a real problem instead of masking it).
- **Guardrail honoured (AC1/PM item 3):** the product FK and the `audit_logs` immutable trigger are
  untouched — only the *test teardown ordering* changed.

**Root-cause precision (verify-before-asserting):** `audit_logs.actor_id → users.id` is the **sole** FK from
`audit_logs` to `users` (`target_id` is a plain uuid, no reference — audit.ts:9/24). So the race exists
**only** where a fire-and-forget write carries the deleted user as `actorId`. That write is
`auth.login_success` / `auth.logout` / re-auth (auth.service.ts:918/991, fire-and-forget `logAction`).
`auth.login_failed` etc. are `logger` events, **not** audit rows.

### AC3 sweep — every `DISABLE TRIGGER trg_audit_logs_immutable` + `delete(users)` teardown, classified

| Test file / block | Fires fire-and-forget audit with `actorId` = deleted user? | Verdict | Action |
|---|---|---|---|
| `security.reauth-routes.test.ts` (afterAll) | Yes — login/grace/logout/re-auth/privileged (the CI failure) | **RACY** | Fixed → helper |
| `auth.login.test.ts` block 1 (successful staff+public login) | Yes — `auth.login_success` | **RACY** | Fixed → helper |
| `auth.login.test.ts` block 2 (suspended user) | No — login rejected, only a `logger` event, no audit row | not racy | left as-is |
| `auth.password-reset.test.ts` block 1 ("allow login with new password", :184) | Yes — successful `auth.login_success` | **RACY** | Fixed → helper (kept `testRedisClient.quit()`) |
| `auth.password-reset.test.ts` block 2 (expired token) | No — logins rejected (401), no audit row | not racy | left as-is |
| `user.profile.test.ts` (afterAll) | Yes — login (beforeAll) + profile-update audit | **RACY** | Fixed → helper |
| `audit.verify-chain.test.ts` (afterAll) | Yes — staff login in beforeAll | **RACY** | Fixed → helper |
| `auth.provision-public-user.test.ts` (afterAll) | No — provision audit is `actorId: null` (auth.service.ts:816); `target_id` is not an FK | not racy | left as-is |
| `mfa.service.test.ts` (afterAll) | No — `mfa.service.ts` makes **zero** `AuditService` calls (service-level test, no HTTP) | not racy | left as-is |
| `questionnaire.service.test.ts` (afterAll) | No — only awaited `logActionTx` (committed before the test's `await` returns) | not racy | left as-is |
| `user.id-card.test.ts` (afterAll) | No — auths via a pre-signed JWT (no login audit); `downloadIDCard`/`verifyStaff` fire zero `AuditService` calls (UserController's sole `logAction` is profile-update) | not racy | left as-is |
| `user.selfie.test.ts` (afterAll) | No — pre-signed JWT auth; `uploadSelfie` fires no audit write | not racy | left as-is |

> **Sweep-scope note (13-30 code-review):** the primary grep keyed on the `DISABLE TRIGGER trg_audit_logs_immutable` + `delete(users)` pattern, which cannot surface teardowns that delete users *without* that pattern. A follow-up grep for **all** `delete(users)` HTTP-integration teardowns caught `user.id-card` / `user.selfie` (above) — both verified clean (their endpoints don't audit), so no action. Net remains **5 racy fixed**; the not-racy set is now **6, fully enumerated**.

Net: **5 racy teardowns fixed** via the shared helper; **6 confirmed not-racy** with evidence (kept
untouched to avoid churn/masking). Non-audit child cleanups unrelated to the FK (`magic_link_tokens` by
email; `user_backup_codes`; form/version rows) were left in their files — only the audit↔users window needed the drain.

### Verification (AC2/AC4)

- **Reauth suite green:** `security.reauth-routes.test.ts` → 9/9 pass, teardown clean.
- **Burn-in (parallel, the condition the race needs):** the 5 racy files run together, **~33 iterations, 0 `audit_logs_actor_id_users_id_fk` / 23503 hits** and 49/49 tests every green iteration. (One non-FK hook blip appeared once — `fkHits=0`, all 49 tests passed, a single file's hook threw — coincident with a transient network drop; not the audit FK race and not reproducible across the subsequent ~30 iterations.)
- **ESLint:** clean on the helper + all 5 edited files. tsc: API `tsconfig` excludes `**/__tests__/**` + `**/*.test.ts`, so these are vitest-checked (esbuild) not `tsc`-checked — same as every other test file; the helper lives under `src/__tests__/helpers/` so it ships nowhere.
- **Full API suite (authoritative AC4 gate, real parallelism profile):** `229 passed | 2 skipped (231 files)`, `3107 passed | 7 skipped (3114 tests)`, exit 0, **0** `audit_logs_actor_id_users_id_fk`/23503 occurrences in the entire run. The one burn-in blip did NOT recur — the full suite exercises all 5 files under real parallel load and was clean.
- **tsc:** API `tsc --noEmit` exit 0 (product code untouched).

### File List
- **NEW** `apps/api/src/__tests__/helpers/audit-safe-teardown.ts` — shared `purgeUsersWithAuditDrain` deterministic-drain teardown helper.
- **MOD** `apps/api/src/__tests__/security.reauth-routes.test.ts` — afterAll → helper; dropped now-unused `auditLogs`/`inArray`/`sql` imports.
- **MOD** `apps/api/src/__tests__/auth.login.test.ts` — block-1 afterAll → helper; dropped unused `inArray`.
- **MOD** `apps/api/src/__tests__/auth.password-reset.test.ts` — block-1 afterAll → helper (kept `testRedisClient.quit()`).
- **MOD** `apps/api/src/__tests__/user.profile.test.ts` — afterAll → helper; dropped unused `inArray`/`sql`.
- **MOD** `apps/api/src/__tests__/audit.verify-chain.test.ts` — afterAll → helper; dropped unused `auditLogs`/`sql`.
- **MOD** `_bmad-output/implementation-artifacts/sprint-status.yaml` — 13-30 → in-progress → review.

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
| 2026-07-18 | **Code-review (adversarial, AI) — APPROVED, status → done.** All 4 ACs verified independently: AC1/AC2 retry-drain logic sound under READ COMMITTED (loop exits only on clean delete → window closed by construction); AC3 sweep re-audited (traced UserController's sole `logAction` = profile-update, so id-card/selfie confirmed non-auditing); AC4 re-run locally against `app_test` — eslint 0, reauth 9/9 clean teardown, **burn-in 4× the 5-file parallel set = 49/49 every iter, 0 `audit_logs_actor_id_users_id_fk`/23503**. 3 LOW findings, all fixed same-pass: (1) reauth comment "no users FK" corrected — it's a `ON DELETE cascade` FK; (2) AC3 table extended with id-card/selfie + scope note (grep blind spot, both clean); (3) helper retry ACCESS-EXCLUSIVE-lock note. No CRITICAL/HIGH/MEDIUM. | Amelia (Review) |
| 2026-07-17 | Implemented. New shared `purgeUsersWithAuditDrain` helper (`apps/api/src/__tests__/helpers/audit-safe-teardown.ts`) closes the audit↔users delete-order FK window deterministically via a bounded retry that drains the finite in-flight fire-and-forget audit writes (AC1/AC2). AC3 sweep: 5 racy teardowns converted (reauth, auth.login b1, auth.password-reset b1, user.profile, audit.verify-chain); 4 confirmed not-racy (provision null-actor, mfa no-audit, questionnaire awaited-Tx, failed-login blocks) — evidenced in Dev Agent Record, left untouched. Verified: reauth 9/9; parallel burn-in ~33 iters / 0 FK hits; eslint clean; full API suite green. | Amelia (Dev) |
