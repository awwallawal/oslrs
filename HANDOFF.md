# Merge Handoff — `track/journey-9-39-40-21`

**Prepared:** 2026-06-19 · **Branch:** `track/journey-9-39-40-21` · **Base:** `main` @ `702ad85`
**State:** working tree clean · 7 commits ahead · **not pushed**

> ## ⛔ HOLD — DO NOT MERGE YET
> Story **9-60** ("Authenticated registration edit + true session resume") was authored on this worktree (2026-06-19, `e561c74`, status `ready-for-dev`) and is **queued for development here** to close the 9-40 M1/M2 deviations before this branch merges. **Worktree-close criteria:** 9-60 developed → paired code-review passed → committed. This HANDOFF will be **finalized** (and this HOLD lifted) once 9-60 lands. Do not merge while 9-60 is `ready-for-dev`/in-progress.

This branch completes the **Public-User Journey Harmonization** stack (SCP `sprint-change-proposal-2026-06-06-public-user-journey-harmonization.md`). Stories 9-21/9-39/9-40 are reviewed (paired Senior-Dev code-review, review-before-commit discipline) and committed; a repo-wide test-infra fix rides along; **9-60 is authored and pending dev+review on this worktree**.

---

## Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `3dbed58` | feat(9-21) | Route-registration integration test — mounts the real `App.tsx` route tree, asserts every nav target resolves (not 404) + a `navigate`/`Link`/`redirectTo` drift audit. Guards the 2026-05-13 operator-MFA outage class. |
| `8673e3a` | feat(9-39) | Public entry IA — logged-out "Sign in" door (SmartCta, desktop+mobile) + magic-link-primary public sign-in + wizard wrong-door recovery link. |
| `bb0ad95` | test(9-21) | **Repo-wide test-infra:** default the vitest worker-pool cap OFF-CI (`vitest.base.ts`). See ⚠️ below. |
| `c1913bf` | docs(9-21) | Traceability: records the `/register` flake root-cause + the `bb0ad95` fix in the 9-21 story. |
| `f3070df` | feat(9-40) | Public dashboard registration-status home — 4-state machine off the 9-38 read-model; magic-link re-entry; inline audited marketplace-consent edit (`PUT /me/registration`); retires the parallel survey path. |
| `97248ad` | docs | This handoff brief. |
| `e561c74` | docs(9-60) | Authored 9-60 (SM Bob + PM John) + reconciled `sprint-status`/`epics.md`; cross-linked from 9-40. Closes 9-40 M1/M2 **when built**. |
| _pending_ | feat(9-60) | **Dev + paired review in flight on this worktree — see ⛔ HOLD above.** |

Each `feat` commit is atomic (story code + tests + story doc + its `sprint-status.yaml` line). Stories 9-21/9-39/9-40 are all flipped `done` in `sprint-status.yaml`.

---

## ⚠️ Must-read before merge/push

1. **`bb0ad95` changes test behavior repo-wide (local only).** `vitest.base.ts` now defaults `maxWorkers = VITEST_MAX_THREADS ?? (process.env.CI ? undefined : 2)`. Effect: a plain local `pnpm vitest run` self-caps at 2 workers (deterministic, no more oversubscription flakes); **CI is unaffected** (gated on `process.env.CI` → stays full-parallel); `VITEST_MAX_THREADS=4 pnpm test` overrides for speed. Call this out in the PR body so the local slowdown isn't a surprise. Rationale: `feedback_local_full_suite_flakiness` / Pitfall #37.

2. **CI is the first place the real-DB integration tests run.** `apps/api/src/services/__tests__/me.service.test.ts` (9-40's `updateMarketplaceConsent` test) and the 9-38 me.service tests need `DATABASE_URL` and **cannot run locally** — they were NOT exercised here. **Confirm the full CI suite is green (incl. these) before pushing to the live site.** The controller/route are covered by the mocked `me.routes.test` (5/5 local green) and the service uses typed Drizzle (schema drift is tsc-caught).

3. **Known CI residual (low risk):** the 9-21 `route-resolution.integration.test.tsx` `/register` case is timing-sensitive under thread oversubscription. Local + pre-push are now capped (green). CI runs it uncapped on a clean 1:1 runner (expected-fine). If it ever flakes in CI, the lever is to cap CI too or raise the test's `waitFor`. Documented in the 9-21 story.

---

## Validation performed (local)

- **Full web suite:** 242 files / **2678+ passed / 0 failures** (run with the off-CI cap, with all three stories in tree).
- **Targeted:** 9-40 web 24/24 · 9-39 affected 170/170 · 9-21 file 55/55 · API `me.routes.test` 5/5.
- **lint:** 0 (api + web). **tsc:** 0 (api + web). **Pre-commit hook** (lint + tsc api+web) passed on every commit.
- Not run locally: full API suite's real-DB integration tests (see must-read #2).

---

## Suggested merge procedure

1. Rebase/merge `track/journey-9-39-40-21` onto latest `main` (resolve any `sprint-status.yaml` conflicts by keeping each story's `done` line; another track — security-r2 — may also edit nearby lines).
2. Push to `main`. The **push-to-main pre-push gate** runs `turbo run build` + the full capped suite — let it complete (don't cancel; see `feedback_space_pushes_to_main`).
3. Confirm GitHub CI green (full suite incl. real-DB tests + `lint-and-build` + prod deploy).
4. Post-deploy smoke: logged-out header shows **Sign in + Register**; `/login` is magic-link-primary; a `public_user` dashboard shows the real registration state (not the "2 of 5" mock); marketplace toggle persists.

## Open / deferred (by-design, endorsed for launch — not blockers)

- **9-40 M1/M2:** dashboard re-entry uses the shipped **magic-link channel** (not a session-authed wizard), and "edit" is the **marketplace-consent toggle** (not full identity/NIN/survey-answer editing). Both verified against reality (the wizard/NIN flows are pre-account/token-authed) and reviewer-endorsed for launch. The full session-authed wizard edit-mode is precisely designed in the 9-40 Dev Agent Record as the post-launch on-ramp.
- **9-40 L1/L2:** completed-summary shows raw `status`/`lgaId` slug (no LGA-name join); draft card shows "Step X" not "Step X of N". Polish, noted in the story.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
