# Merge Handoff — `track/journey-9-39-40-21`

**Finalized:** 2026-06-20 · **Branch:** `track/journey-9-39-40-21` · **Base:** `main` @ `702ad85`
**State:** working tree clean · **not pushed** · worktree CLOSED (all stories reviewed + committed)

> ## ✅ READY TO MERGE — after ONE operator gate
> The **Public-User Journey Harmonization** stack (9-21 / 9-39 / 9-40 / 9-61) is complete and reviewed. **Before merging to main + pushing live, an operator MUST complete the 9-61 manual app-run gate (Must-read #1).** It is the only thing standing between this branch and a clean live push — everything else is green.

Stories 9-21 / 9-39 / 9-40 / 9-61 are all paired-reviewed (Senior-Dev, review-before-commit) and `done`; a repo-wide test-infra fix rides along. 9-61 closes 9-40's deferred M1/M2 (magic-link re-entry → in-session `/registration/manage`).

---

## Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `3dbed58` | feat(9-21) | Route-registration integration test — mounts the real `App.tsx` route tree, asserts every nav target resolves (not 404) + a `navigate`/`Link`/`redirectTo` drift audit. |
| `8673e3a` | feat(9-39) | Public entry IA — logged-out "Sign in" door (SmartCta desktop+mobile) + magic-link-primary sign-in + wizard wrong-door recovery link. |
| `bb0ad95` | test(9-21) | **Repo-wide test-infra:** default the vitest worker-pool cap OFF-CI (`vitest.base.ts`). See Must-read #3. |
| `c1913bf` | docs(9-21) | Traceability: `/register` flake root-cause + the `bb0ad95` fix. |
| `f3070df` | feat(9-40) | Public dashboard registration-status home — 4-state machine off the 9-38 read-model; inline audited consent edit; retires the parallel survey path. |
| `97248ad` | docs | Handoff brief (initial). |
| `e561c74` | docs(9-61) | Authored 9-61 (SM Bob + PM John) + reconciled `sprint-status`/`epics.md`. |
| `e5b9e4f` | docs(handoff) | HOLD gate while 9-61 was in flight (now lifted). |
| `f29a4ab` | feat(9-61) | Authenticated registration edit + session resume — `/registration/manage` + `GET/PUT /me/registration[/wizard]` + session NIN-complete; shared validator extraction; **closes 9-40 M1/M2**. |
| `284f27e` | docs(handoff) | Finalized this brief — HOLD lifted, operator gate set as the pre-merge check. |
| `773c1d5` | fix(9-61) | NIN-dedupe TOCTOU backstop → clean 409 in both authed write paths (parity with the public submit). Post-review hardening. |

> **Authoritative list = `git log 702ad85..HEAD`** (11 commits). This table is a convenience and necessarily cannot list the single commit that last updates this file itself.

Each `feat` commit is atomic (code + tests + story doc + its `sprint-status.yaml` line). 9-21/9-39/9-40/9-61 are all `done` in `sprint-status.yaml` + `epics.md`.

---

## ⚠️ Must-read before merge/push

1. **🚦 OPERATOR MANUAL APP-RUN GATE (9-61) — REQUIRED, blocks the live push.** The 9-61 DB write paths (`updateRegistrationFromWizard`, `completeNinAuthenticated`, respondent→wizard mapper) are verified by CI-only real-DB tests + tsc/lint/mocked routes — **never exercised against a running app** (sandbox had no `DATABASE_URL`). Before merge an operator MUST: (a) run the API integration suite on a real DB (9-61 `me.service.test` block); (b) manually exercise `/registration/manage` end-to-end — edit an active registration, complete a pending NIN, confirm the **audit rows + a fresh `submissions` row**, and confirm **Story 9-39's wrong-door recovery still redirects off `/register`**. _Source: 9-61 story Dev Agent Record + Review Follow-ups._

2. **CI is the first place ALL real-DB integration tests run.** `me.service.test` (9-40 consent + 9-61 edit/NIN) + the 9-38 tests need `DATABASE_URL` and cannot run locally. **Do not push live on red CI.**

3. **`bb0ad95` changes test behavior repo-wide (local only).** `vitest.base.ts` now defaults `maxWorkers = VITEST_MAX_THREADS ?? (process.env.CI ? undefined : 2)` — a plain local `pnpm vitest run` self-caps (deterministic); **CI unaffected** (gated on `process.env.CI`); `VITEST_MAX_THREADS=4` overrides. Call out in the PR body. Rationale: Pitfall #37.

4. **Merge order vs the security-r2 track.** Both tracks edit `sprint-status.yaml` + `epics.md`. **Merge journey FIRST**, then rebase security-r2 — conflicts then confine to status lines (security-r2 doesn't touch the `me` surface or `vitest.base.ts`). Bonus: security-r2 inherits the off-CI cap on rebase.

5. **Known CI residual (low risk):** the 9-21 `/register` route-resolution case is timing-sensitive under thread oversubscription; capped everywhere local/pre-push (green); CI runs it uncapped on a clean 1:1 runner (expected-fine). Lever if it ever bites: cap CI or raise the test `waitFor`.

---

## Validation performed (local)

- **Full web suite:** 242 files / **2680 passed + 2 todo / 0 failures** (off-CI cap; with all four stories + all review fixes in tree).
- **Targeted:** 9-61 web 19/19 + API `me.routes` 10/10 · 9-40 web 24/24 · 9-39 170/170 · 9-21 file 55/55.
- **lint:** 0 (api + web). **tsc:** 0 (api + web). **Pre-commit hook** (lint + tsc api+web) passed on every commit.
- **Post-review TOCTOU hardening (`773c1d5`):** API `tsc`/`lint` 0 + `me.routes` 10/10. Backend-only, so the full web suite was NOT re-run (web unchanged since the 242/2680 run above); the rare race itself is not unit-reproducible (see the 9-61 story M2 note) and is exercised by the CI real-DB suite.
- **NOT run locally:** all real-DB integration tests (Must-read #1/#2) — CI + the operator gate cover these.

---

## Suggested merge procedure

0. **Complete the operator manual app-run gate (Must-read #1).** Do not proceed until green.
1. Rebase/merge `track/journey-9-39-40-21` onto latest `main` (keep each story's `done` line on `sprint-status.yaml`/`epics.md` conflicts).
2. Push to `main`. The push-to-main pre-push gate runs `turbo run build` + the full capped suite — let it complete (don't cancel; `feedback_space_pushes_to_main`).
3. Confirm GitHub CI green (full suite incl. real-DB tests + `lint-and-build` + prod deploy).
4. Post-deploy smoke: logged-out header shows **Sign in + Register**; `/login` magic-link-primary; `public_user` dashboard shows real registration state; **`/registration/manage` edits an active registration + completes a pending NIN end-to-end**; marketplace toggle persists.

## Closed / deferred

- **✅ 9-40 M1/M2 — CLOSED by 9-61** (in-session `/registration/manage` replaces the magic-link re-entry; full session-authed wizard edit replaces consent-only).
- **9-40 L1/L2 (polish, open):** completed-summary shows raw `status`/`lgaId` slug; draft card "Step X" not "Step X of N". Non-blocking; noted in the 9-40 story.
- **✅ 9-61 NIN-dedupe TOCTOU — FIXED** (post-review hardening): both authenticated write paths now map a `respondents_nin_unique_when_present` race to a clean 409, at parity with the public submit (the public path already did; 9-61 didn't). Partial unique index still prevents corruption; this corrects the rare-race error shape.
- **Downstream:** Story **9-32** (NDPA self-service rights) consumes 9-61's `/me/registration` mechanism — sequence after this merges.

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
