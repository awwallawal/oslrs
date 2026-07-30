# OSLRS Adjudication-Agent Handoff (LIVING DOC)

**Last updated:** 2026-07-30 · **Prod deployed SHA:** `be207c1` · **Health:** https://oyoskills.com/api/v1/health
· **Start at §2** (the playbook) — and run the §2a0 debt gate before anything else.

> **You are the OSLRS adjudication agent.** The human (Awwal) develops + code-reviews each story in a SEPARATE CLI, then brings the uncommitted work to THIS session for *final adjudication*. This doc is your cold-start brain: read it + `MEMORY.md` + `git log --oneline -30`, and you are oriented. **This is a LIVING doc — update the header + the relevant sections at the end of every session.** It complements, not duplicates, `MEMORY.md` (atomic facts) and the dated `docs/session-*.md` snapshots (per-session narrative).

---

## 0. Cold-start ritual (run these first)
```bash
git log --oneline -30                       # what shipped recently
git status --short                          # is there uncommitted dev to adjudicate?
git fetch origin -q && git status -sb | head -1   # local vs origin (ahead/behind N)
# prod truth (both — SHA alone doesn't prove the app is up):
ssh -o ConnectTimeout=25 root@100.93.100.28 'cd /root/oslrs && git rev-parse --short HEAD'
curl -s -o /dev/null -w '%{http_code}\n' https://oyoskills.com/api/v1/health   # want 200
```
⚠️ **git ≥ 2.52:** `git rev-parse --short A B` now dies with `fatal: Needed a single revision` — `--short` takes exactly ONE rev. Use `git status -sb` (above) or two separate calls.

Then read `MEMORY.md` (auto-loaded) + this doc. If `git status` shows uncommitted `apps/**` changes + a `_bmad-output/**/<story>.md` with `Status: done`, that IS the story to adjudicate. **A clean tree = no story in flight** → say so and ask what to pick up (don't invent work).

---

## 1. The workflow convention (non-negotiable)
- **Human develops + code-reviews elsewhere → you adjudicate here.** The dev work arrives **uncommitted in the working tree** (tracked-modified + untracked-new). The story file's `## File List` is the authoritative set to commit.
- **Adjudication = verify it YOURSELF, never trust the self-report.** Run tsc/eslint/the suites yourself; read the load-bearing code; RED-verify the key fixes. The dev + a code-review LLM already ran; you are the third, independent layer.
- **Then:** selective-commit the File List → push (pre-push runs the full suite) → confirm CI → deploy → VPS SHA → update `MEMORY.md`.
- **Review BEFORE commit**, on the uncommitted tree. Never `git add -A`; never auto-commit at end of dev-story.
- Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (was Opus 4.8 through `d687cf4`; the history intentionally shows both). Branch = `main` (push directly; that's the convention here).

---

## 2. THE ADJUDICATION PLAYBOOK (reusable every time)

> **THIS SECTION IS THE STARTING POINT FOR EVERY ADJUDICATION.** Read §2 before touching the story. It is
> the accumulated lessons of prior adjudications, and it is **living**: the moment a session learns
> something that would have saved it time, write it back here. A lesson that stays in a story file is a
> lesson the next session re-learns. When you add one, keep it short and put the *rule* first.

### 2a0. The debt gate — the FIRST thing read and the LAST thing closed

**Two touch points, both mandatory:**
1. **At §0 cold-start (before reading the code):** enumerate what the story admits is unfinished, so you
   *inherit* the debt instead of discovering it after the deploy. Mechanically:
   ```bash
   grep -nE '^- \[ \]' _bmad-output/implementation-artifacts/<story>.md    # unchecked tasks/findings
   grep -inE 'NOT fixed|deliberately|residual|push-time|out of scope|accepted[- ]risk' <story>.md
   ```
2. **At close-out (before flipping `Status: done`):** every item found above must be resolved to one of
   three states. **`done` is not permitted while any item is unresolved.**

**What "resolved" means — this is the definition, not a vibe:**
| State | Requires |
|---|---|
| **CLOSED** | evidence that can be **re-run**: a CI run ID, a named test, a SQL query. Not "verified" — *how*. |
| **DISCHARGE-ON-PUSH** | provable only after deploy (13-36 Task 3b). Blocks `done`, not the commit. Discharge it in the same session: push, then check the *evidence*, not just the green. |
| **ACCEPTED** | (a) a **measurement**, never a hypothesis; (b) a named owner; (c) a **reopen trigger**. |

**Why ACCEPTED needs all three:** 13-36 shipped a residual reading "~0.8%, the browser was probably
offline, deliberately not fixed". It was neither ~0.8% nor environmental — it was a real defect (shared
seeded account × single-session API), found three days and one deploy later by a 10-minute probe. It had no
measurement, no owner and no trigger, and would have failed this gate on day one. **An unexplained
low-percentage failure rate is a measurement you have not made yet, not a property of the environment.**

⚠️ **Known blind spot (measured 2026-07-30, precision NOT yet established):** **58 stories marked `done`
carry 201 unchecked `[ ]` boxes**, and 14 stories' own `Status:` line disagrees with `sprint-status.yaml`.
Most are probably un-ticked AC/template checklists (9-12 has 33, 9-9 has 30) — but two spot-checks were
real and launch-gating (see §4). Treat a `done` story's unchecked boxes as unverified until read. Triage is
deferred: §8.

### 2a1. Invisible PAYMENT — the inverse of invisible debt

§2a0 catches debt hiding behind `done`. The mirror case is just as real: **a later story can silently
discharge an earlier story's residual, and nobody goes back to tick the box.** 13-19's operator residual
(re-upload + re-pin + dry-run) was satisfied by 13-34 a week later, because 13-34 re-uploaded the very same
workbook — yet 13-19 sat at `review`, tagged LAUNCH-GATING, until someone *remembered*. That is a false
blocker, and near a launch a false blocker costs as much as a missed one.

- **When a story performs an operator action** (form re-upload/re-pin, a backfill, a migration run,
  a credential rotation), **grep the backlog for other stories waiting on the same action** and close them
  in the same commit. Sibling of `[[feedback_canonical_primitive_backlog_sweep]]`; the operator equivalent
  of the canonical-primitive sweep.
- **When you find such a transitive discharge, check the opposite first.** The interesting question is not
  "did the later story satisfy the earlier one?" but **"did the later story CLOBBER it?"** — 13-34 edited
  the same workbook and could have dropped 13-19's edit (the stale-carry flavour of
  `[[pattern-ship-a-fix-that-never-fires]]`). Prove survival with a re-runnable check — here a `md5sum`
  drift comparison plus the guard test — not with the changelog.
- **Take the closure that IS proven and give the sliver a mechanical trigger.** Don't tick what wasn't
  observed, and don't leave the whole item open over a detail. Fold the gap into a run that is already
  scheduled (13-19's last 2 fields → the pre-blast positive control) so the trigger fires by itself.

### 2a. Verify-myself checklist
- `pnpm --filter @oslsr/api exec tsc --noEmit` (API) / `cd apps/web && pnpm exec tsc --noEmit` (web). **Scripts are OUTSIDE tsconfig — RUN them / test them, don't trust tsc for `apps/api/scripts/*`.**
- `eslint` the touched files explicitly.
- Run the touched test files: API `NODE_ENV=test DATABASE_URL="postgres://user:password@localhost:5432/app_test" pnpm vitest run <files>`; web `cd apps/web && pnpm vitest run <files>` (NEVER `pnpm vitest run` from root for web — wrong config).
- **File List == git reality**: `git status --short` must match the story's File List. Flag drift.
- **Anchors/IDs a fix introduces must be checked against the thing that defines them** — a test selector against the component that renders it, a new `Pitfall #N` against the whole playbook. On the playbook specifically: `#26`-`#38` are `### Pitfall #N` headings but `#39`+ live ONLY as footer `*Updated:*` paragraphs, so `grep -n "Pitfall #"` the ENTIRE file before minting a number. 13-36 collided twice (`#39a`, then `#43`) because each pass scanned only one convention.

### 2b. RED-verify (the core discipline — [[pattern-ship-a-fix-that-never-fires]])
Every load-bearing fix must have a test that FAILS without it. Prove it:
1. Neuter the fix (one-line revert of the guard/filter/derivation).
2. Run the guarding test → it MUST fail. Run a sibling unit test → note if it stays green (blind-spot proof).
3. **Restore.** ⚠️ **If the file is UNTRACKED or uncommitted, `git checkout --` CANNOT restore it** (no committed base / would wipe the dev work). Restore MANUALLY with an Edit, then `grep -rn "RED-VERIFY" apps/` to confirm no residue + re-run the test green.
- Examples this session: 13-24 (bypass `filterMarketingCohort` recent-contact → 4/5 integration tests fail), 13-35 H1 (neuter `computePrefill` form-derivation → wizard test 3/3 fail, unit stays 12/12), 13-35 F2 (revert Review gate to raw draft → submit-gate `data-incomplete="true"`).

### 2c. Selective-commit + the MM-drift trap
- Stage the File List **explicitly** (list each path), then `git diff --cached --name-only | wc -l` and `git status --short | grep -vE '^[MA] '` (must be empty = no drift).
- **`MM` in git status = the staged version is STALE** (working tree changed after you staged — common when the other CLI edits concurrently). Re-`git add` the file before committing, or you commit stale content. (Hit this on 13-24: the deeper-pass section + runbook §4 got left out; amended before push.)
- After committing, `git diff HEAD --stat <file>` to confirm nothing was left out.

### 2d. Push → CI → deploy → verify
- Push runs the **pre-push full-suite hook (~18 min)** — run in background. Then watch CI: `gh run list --branch main --workflow "ci-cd.yml" --limit 1` → `gh run watch <id> --exit-status`.
- **Confirm ALL jobs, not just the pipeline verdict.** `gh run view <id> --json jobs`. A pipeline can be `failure` with `lint-and-build`+`smoke-e2e` green but `test-api` failed (see flakes below). `deploy` skips if any gate fails.
- After `deploy => success`, verify prod: VPS SHA == the commit, `curl .../health` == 200, and for schema/behaviour changes query the DB via Tailscale.

### 2e. When the deploy is BLOCKED
- **OSV prod-gate** ("Security audit — production scope") reds on **newly-disclosed advisories against unchanged prod deps** — happened **5×** this session (11-2 ×3, sharp, react-router ×3, brace-expansion). Remediate:
  - **Clean fix if the patch is same-major:** bump the dep / override to `>=fixed <nextMajor` (bounded — the override-policy FORBIDS crossing a major; the 9-54 footgun). `pnpm install`, then reproduce the gate locally: `pnpm ls -r --prod --depth Infinity --json > osv-prod-ls.json` (bash, UTF-8 no BOM), run the docker osv scan (PowerShell, auto-loads osv-scanner.toml) → `osv-full.json`, then `pnpm --filter @oslsr/api exec tsx scripts/osv-prod-gate.ts $PWD/osv-prod-ls.json $PWD/osv-full.json` → want `gate-rc=0`.
  - **If the fix crosses a major (no in-policy fix):** accept-risk in `osv-scanner.toml` `[[IgnoredVulns]]` — but ONLY with a real assessment + an **application-layer mitigation** where the advisory is exploitable (never a blind ignore). Precedent: react-router 6.30.4 open-redirect → `apps/web/src/lib/safe-redirect.ts` `toSafeInternalPath` at all post-auth `navigate()` sites, THEN accept-risk "mitigated". osv-scanner.toml IS auto-loaded by the blocking gate scan (a stale header comment says otherwise).
  - **Check the Node engine FIRST** on any dep bump (VPS+CI are Node 20): the 11-2 pdfjs 6.x needed Node 22 and hard-failed install. sharp 0.35 (`>=20.9`) was fine.

### 2f. Local test-DB parity (why the pre-push hook can red on unrelated tests)
- `app_test` = the CI-mirror. Running `pnpm --filter @oslsr/api db:push:force` (Drizzle-only) **DROPS raw-SQL constraints** that live in `migrate-*-init.ts` runners (e.g. `respondents_nin_unique_when_present`, `*_status_check`) → a batch of "parity" test failures.
- CI uses **`db:push:full:force`** (Drizzle + all migrate-init runners) on a FRESH empty DB. `db:push:full:force` FAILS over a pre-populated local DB (existing rows violate the constraints).
- **Fix = rebuild `app_test` clean** (CI-faithful, non-`--no-verify`): `docker exec oslsr_postgres psql -U user -d app_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO \"user\"; GRANT ALL ON SCHEMA public TO public;"` then `NODE_ENV=test DATABASE_URL=...app_test pnpm --filter @oslsr/api db:push:full:force`. Tests self-seed (CI has no seed step). **Never `--no-verify` the pre-push hook** unless the human explicitly asks.
- Local postgres container = `oslsr_postgres` (port 5432, user `user`, db `app_test`). **PROD** postgres = `oslsr-postgres` (note the DASH) via Tailscale, user `oslsr_user`, db `oslsr_db`.

### 2g. Known CI flakes (re-run, don't chase)
- **bcrypt** `Module did not self-register: .../bcrypt.glibc.node` — native-addon re-registration flake across vitest workers; the test FILE runs 0 tests. `gh run rerun <id> --failed`; doesn't reproduce. Distinct from a logic flake ([[pattern-flaky-test-hiding-a-prod-bug]] — THAT kind you chase to a deterministic repro; e.g. the 22P02 was a real prod bug behind a "flake").
- A run can show `cancelled` (concurrency/infra) with neighbors green — re-run it.

### 2h. Prod-verification + test-registration cleanup recipe (Tailscale)
- Connect: `ssh -o ConnectTimeout=25 root@100.93.100.28` → `docker exec oslsr-postgres psql -U oslsr_user -d oslsr_db -t -A -c "..."`.
- **Dry-run of a public registration** (proves auto-sends + ledger): give a free test NIN (`^\d{11}$`, e.g. `90000000011` — verify free first), human registers, then verify: respondent markers (`metadata->>'confirmation_email_sent_at'` + `thankyou_referral_sent_at`), the submission's form + `raw_data->>'main_occupation'`, and `campaign_sends` rows for the email (ledger-liveness).
- **Cleanup (child-first, ONE txn):** delete `fraud_detections`→`marketplace_profiles`→`magic_link_tokens`→`submissions`→`respondents` for the RID, plus the test `campaign_sends` row. **Do NOT delete the `users` account** (check `created_at` — real accounts predate today). **`audit_logs` is APPEND-ONLY** (a DB trigger `audit_logs_immutable()` rejects DELETE and rolls back the whole txn — leave the audit rows). Verify counts restore (baseline captured BEFORE the test).

### 2i. Delegating to sub-agents (forks / Explore)
- Useful for broad multi-file traces (e.g. the send-ownership triangulation used 2 parallel Explore agents). BUT **a sub-agent's self-report can claim edits it never persisted** — always `git status`/diff to confirm side-effects landed; if not, do them yourself. ([[feedback_verify_delegated_agent_disk_state]]) An Explore agent's headline can also contradict its own body (13-34 draft-resume: header said "blast-blocking", body proved the opposite) — read the evidence, not the summary.

---

## 3. Current state (2026-07-27)
- **Prod = `830dcf7`**. Everything code-side for the launch send-system + the wizard is deployed + verified.
- **E2E Tests is now a trustworthy signal** (13-36): green on push AND on a `repeat_each: 3` burn-in. A red there is now a real regression — triage it, never reflexively re-run. Burn-in on demand: `gh workflow run e2e.yml --ref main -f repeat_each=3` (max 7; `workers: 1`, so it tests repetition, NOT concurrency).
- ⚠️ **The Playwright suite CANNOT go parallel — now enforced by `workers: 1` in `playwright.config.ts`** (probed 2026-07-27, verified against source 2026-07-30). Every spec logs in as the same seeded account per role and the API is **single-session by design** — each login reaps the user's previous refresh token (`token.service.ts`), so parallel workers invalidate each other and any full page load then 401s → `AUTH_LOGOUT` → public home page. Dose-response: workers 1/2/4/6 → **0% / 17% / 42% / 58%** failures. The symptom (test lands on `/`) looks exactly like a product bug and is not one; a real user pressing F5 keeps their session. **Do not raise the worker count to speed up a local run** — that needs per-worker seeded accounts first. Two remedies that made it WORSE, don't retry: raising the assertion timeout (the cause isn't slowness) and re-logging-in after a bounced reload (doubles login volume → trips the locally-active login rate limiter → strands on `/staff/login`).
- 🧠 **Durable lesson from 13-36 worth more than the story**: an unexplained low-percentage failure rate is **a measurement you have not made yet**, not a property of the environment. The story shipped a "~0.8%, browser was probably offline, deliberately unfixed" residual; it was neither 0.8% nor environmental. Vary one variable (worker count) and instrument the request chain.
- **`db:seed:dev` now CONVERGES drifted `@dev.local` accounts** — run it first when local e2e reds but CI is green. It is now destructive-by-design, so it refuses any DB whose name isn't `test`/`dev`-ish or `app_db` (`ALLOW_DEV_SEED_DB=1` overrides).
- **`campaign_sends` table LIVE on prod** (7 cols + 2 indexes) — the 13-24 cross-system contact-dedupe ledger. Ledger-liveness PROVEN (0→1 on a dry-run, then cleaned).
- Registry baseline: **144 respondents / 81 submissions / 0 campaign_sends** (restore target after any test reg).
- Pinned public form = `019f8ed3` (GPS-free, "Main Occupation (e.g. …)" label). Master enumerator form = `019f8eff` (relabeled, GPS kept).

## 4. The launch picture — operator-gated, nothing code blocks it
1. **Pay Resend Pro ($20)** — the one hard gate (232 emails > free 100/day). Also a HARD long-lead **Termii sender-ID** approval for SMS (independent of email).
2. **13-24 Task 5** — welcome backfill to ~116 emailable: `_backfill-registration-autosends.ts --dry-run` (read the `excluded:` line) → `--apply --confirm-i-am-not-dry-running --rate-per-minute 10`.
3. → **5-day gap** → deduped blasts, **fired in ONE session** (the ledger's 5-day window means the marker + cohort disjointness carry "blast MINUS welcomed", ledger is the backstop — see `docs/runbooks/pre-blast-dry-run.md` §4).
4. Before firing: `docs/runbooks/pre-blast-dry-run.md` — incl. **§2 ledger-liveness `SELECT`** (fail-soft `recordCampaignSend` could silently no-op).
- 🚨 **TWO LAUNCH-GATING ITEMS ARE UNCHECKED UNDER STORIES MARKED `done`** (found 2026-07-30 by the §2a0 gate — both were invisible on the board):
  1. **13-24 Task 5** — `- [ ]` in the story: *operator: confirm Resend Pro live, then `_backfill-registration-autosends.ts --dry-run` → `--apply`*. This IS step 2 of the launch sequence below. Story + board both read `done`; the task is not.
  2. ~~**13-19 L3**~~ — ✅ **RESOLVED 2026-07-30, no longer launch-gating.** It had been **discharged transitively by 13-34** a week earlier (same workbook re-uploaded + re-pinned; AC6 dry-run through the pinned form) — Awwal recalled it, adjudication verified it. The real risk was the inverse: 13-34 could have *clobbered* the fix. It did not — operator copy and fixture are byte-identical (`c66bb236…`) and the M1 guard test `public-core-form-relevance.test.ts` passes **6/6** against the Jul-23 copy. Story flipped `review` → `done`, so the board divergence is gone. Residual sliver (2 of 3 labour fields never directly observed; the row was deleted) is **ACCEPTED** with a mechanical trigger: `pre-blast-dry-run.md` §6 now requires all three asserted on the positive-control registration before teardown.
- **13-24 Task 4 (Dry-run #2) = DONE.** Only Task 5 remains on 13-24 — and see the alert above: it is unchecked while the story reads `done`.
- The stale `re-engagement-campaign-launch.md` was superseded by 13-24's §2; follow 13-24.

## 5. Backlog you'll likely adjudicate next (all POST-LAUNCH, non-gating, ready-for-dev)
- **13-41** — CI guard making the unsafe-SQL-cast / false-guard class (the 22P02 shape) unwritable; wide scope; RED-failing canary required. Sibling of 13-37.
- **13-42** — ops-digest data-integrity watch: sentinel population + self-edit liveness; each signal fires only on the real defect DELTA (new sentinel value / audit-vs-submission divergence), not on volume. Sanity-ceiling deferred to post-Cohort-A-blast.
- **13-43** — react-router 6→7 migration to retire the accepted-risk debt (removes the override + the 3 osv-scanner.toml entries; KEEP `safe-redirect`). Effort moderate. Pull trigger: another 6.x advisory.
- **13-44** — super-admin campaign observability UI: wire the built-but-unwired `getCampaignFunnel` (13-9) + a `campaign_sends` contact-log + a ledger-liveness banner. Reuse the 9-11 Audit Log Viewer pattern; PII per that precedent.
- Also in flight: 13-2 (association import, BLOCKED), 13-38 (marketplace badge), the Epic-11 email-channel stack (11-5/6/7, 13-39/40), Epic-12 dashboard refresh. See `sprint-status.yaml` for the full board.

## 6. Key systems map (where to look when adjudicating)
- **Send/dedupe:** `email.service.ts` `dispatch()` = the ONE chokepoint (suppression headers + `NotificationMeter` + `recordCampaignSend` for MARKETING categories). `campaign-contact.service.ts` = `filterMarketingCohort` (suppression + 5-day contact gap + intra-run dedup) + the fail-soft ledger write. 3 blast scripts + the welcome backfill all inherit `filterMarketingCohort`. `list-unsubscribe.ts` `MARKETING_CATEGORIES` = {reengagement-blast, supplemental-survey, thankyou-referral}. Suppression = `email_suppressions` (bounce/complaint/unsubscribe) ≠ contact-dedupe.
- **Wizard prefill/skip:** `WizardPage.tsx` (step list, URL-as-source-of-truth, `unreachableQuestionNames` FORM-derived via `lib/wizard-prefill.ts::computePrefill`, `effectiveFormData` feeding skip/gate/submit, landing-step correction effect). `Step4Questionnaire.tsx` (prefill stamp + banner). `FormRenderer.tsx` (geopoint suppression, "No questions available" dead-end at :350). `section-relevance.ts::isSectionStepSkippable`. The invariant: derive hide-sets from the FORM, never from a field a later step stamps (13-34 geopoint + 13-35 H1 both learned this).
- **Runbooks:** `docs/runbooks/pre-blast-dry-run.md` (THE send gate), `re-engagement-campaign-launch.md` (hub, §2 authoritative), `backfill-operator-residuals.md` (one-shot tracker). Triangulation brief: `docs/handoff-2026-07-23-send-ownership-triangulation.md`.

## 7. Session narrative (2026-07-23 → 07-26) — the arc, newest last
1. **13-34 close-out** (pre-blast form fixes): 22P02 500-fix (text-space join) `7b79ef2`; geopoint-suppression guard; **fresh-advisory saga begins** (sharp `c8646e5`); forms edited (GPS removed + occupation relabel, byte-identical drift-guarded copies) `a45a2df`; missing M1/L3 test coverage `6c78b8a`; operator re-uploaded + re-pinned → verified live; master canonical consolidated (deleted a redundant `_email.xlsx`); AC6 dry-run passed E2E; **status → done** `662184c`.
2. **Emergent stories from 13-34:** 13-41 (unsafe-cast CI guard) `e683269`; 13-42 (ops-digest watch) `4c73dbf`.
3. **Send-ownership triangulation** (2 parallel Explore agents + verified against files): found a REAL double-send gap — suppression ≠ contact-dedupe; `_thankyou-referral-blast` WROTE `thankyou_referral_sent_at` but never READ it. Packaged as a handoff `5acdfb2`.
4. **13-24 re-scope → dev → adjudication:** Bob(SM)+John(PM) re-scoped it in-CLI from "ops-only" to a CODE story (`f2a7c89`) + created the missing `pre-blast-dry-run.md` (`f7de970`); human developed the `campaign_sends` inherited dedupe elsewhere; I adjudicated (RED-verified, rebuilt local `app_test` for parity, caught + amended MM-drift), deployed `8145091`; the deploy was OSV-blocked on react-router → fixed with `safe-redirect` open-redirect guard + accept-risk `649af26`; **campaign_sends confirmed live on prod**; Dry-run #2 (Task 4) done — ledger-liveness proven.
5. **Post-launch stories banked:** 13-43 (react-router v7) `e84a614`, 13-44 (campaign observability) `0d6f285`.
6. **13-35 adjudication** (wizard UX polish): thorough dev + a TWO-pass adversarial review (H1-3/M1-4/L1-4, then F1/F2/F3). Headline: H1 = the AC2 dead-end still fired (draft-bootstrapped hide-set); F2 = the H1 fix could hard-block Submit + empty raw_data (Step4 never mounts). I re-oriented around the concurrent re-review, RED-verified H1 + F2, deployed `eee2877`; OSV-blocked on **brace-expansion** (5th) → bump `a69a281`; a bcrypt CI flake → re-run → deployed; **AC5 e2e closed via smoke-e2e**. 13-24 Task-4-done recorded `5d80841`.

8. **13-36 adjudication** (2026-07-27, first session on Opus 5) — e2e messaging determinism + a converging
   dev seed. Dev + a 16-finding review had already run; my layer added two RED-verifies (the seed DB-gate
   and the convergence canary, both reproducing the dev's claims exactly) and three findings. Headline
   **AJ-1: the review's own pitfall-renumber fix collided again** — AI-7 moved `#39a`→`#43`, but `#43` was
   taken on 2026-07-20 and cited in another doc; renumbered `#44`. The trap: `#26`-`#38` are
   `### Pitfall #N` headings while `#39`-`#43` live ONLY as footer `*Updated:*` paragraphs, so neither
   convention alone shows the highest number — **grep `Pitfall #` across the whole file before minting one.**
   Deployed `830dcf7`, all 10 CI jobs green, **no OSV block** (ending a 5-deploy streak). Task 3b/AI-2
   discharged by dispatching the burn-in and checking the test COUNT (57→155), not just the green — the
   passthrough could have been silently dropped and still passed.

9. **13-36 final pass** (2026-07-30) — after the story was already deployed, a probe overturned the
   mechanism behind its CRITICAL finding AND its last "accepted residual" (the "~0.8% browser-offline"
   condition was really the shared-account/single-session collision). Root fix: `workers: 1` everywhere.
   My pass verified that conclusion against source (`AuthContext:58` + `ProtectedRoute:55` prove there was
   never a route-guard race) and found the canonical playbook now contradicted its own shipped code in two
   places. **Two process lessons worth keeping: (1) I flipped `Status: done` while the tree was still
   moving — the §1 ritual should end by asking "is the tree quiet?", the same question §0 opens with.
   (2) Prose is not type-checked: three of this story's findings (AI-4, AJ-2, AJ-4) were all "the comment
   says something the code disproves", and the playbook is the worst place for it because it is cited by
   number from other docs.**

---

## 8. Deferred improvements (NONE launch-gating — deliberately parked 2026-07-30)

Parked by Awwal while launch bandwidth is tight. **Each row carries a TRIGGER, because a deferred list
without triggers becomes exactly the invisible debt §2a0 exists to catch** — that is the whole lesson of
this session applied to this list. Nothing here blocks the blast; §4 holds the things that do.

| # | Item | Why it matters | Trigger to do it |
|---|---|---|---|
| D1 | **Residual ledger**: a `## Residuals` table in the story template (ID / severity / state / re-runnable evidence / owner), using the §2a0 three states. Retrofit 13-36 as the worked example. | Makes the debt gate a *schema* instead of a discipline. Prose is not type-checked. | First story adjudicated after launch. ~15 min, no code. |
| D2 | **`scripts/residual-inventory.ts`** — regenerates the debt table on demand (unchecked boxes + residual language + file-vs-board status divergence). | A hand-written list is stale in a week. Same script later feeds D3, so the parse is written once. | Do with D1; it *is* the report. |
| D3 | **Story 13-45 — CI guard**: fail when a story reads `Status: done` while its ledger holds an OPEN/DISCHARGE-ON-PUSH row. | Without a guard, D1 is a convention — and conventions produced the 201. Needs a RED-failing canary, so it is real dev work. Sibling of 13-41/13-37. | After D1+D2 exist and one story has used the ledger for real. |
| D4 | **Triage the blind spot**: 58 `done` stories / 201 unchecked boxes / 14 status divergences. Start with the launch-adjacent set (13-24, 13-19, 13-34, 13-21, 13-23, 13-27, 11-2, 13-16) and mark the OSV cluster (13-31/13-32/sec-1/sec-4, ~27 hits) as **managed-elsewhere** — `osv-scanner.toml` + the blocking gate already is their ledger. | The two launch-gating items in §4 came out of a 3-story spot-check. The rest is unmeasured. | Post-blast, or immediately if anything in §4's list turns out to have siblings. |
| D5 | **Make §0 a script** (`scripts/adjudicate-coldstart.sh`): the five checks + prod registry baseline + pinned form, one screen. | A prose command block rots invisibly — §0's `git rev-parse --short A B` silently broke on git 2.52 and cost a session four commands to diagnose. A script fails loudly. | Next time a §0 command misbehaves, or with D2. |
| D6 | **Drop the prod SHA from this doc's header.** | It is self-staling metadata: wrong within hours on 2026-07-26 (a docs-only deploy moved prod's HEAD) and again on 2026-07-30. Let D5's script report ground truth instead. | Do with D5. |
| D7 | **§5 needs a designated next pick**, one line, pointing at `[[next-story-sequence-post-11-2]]`. | Four stories with no ordering means every cold start re-litigates the choice. | Next cold start that has to choose. |
| D8 | **Cap §7 at the last two sessions**, archiving older arcs to a dated `docs/session-*.md`. | This doc is growing unbounded; `MEMORY.md` already blew its size budget for exactly this reason. | When §7 passes ~10 entries. |
| D9 | **§2j verdict format** — a fixed closing block (verdict / RED-verify evidence / File-List reconciliation / deploy SHA). | 13-36's close-out was hand-synced across five places (story body, Change Log, sprint-status, MEMORY, this doc) and the disproven claim survived in three of them. | Do with D1 — same problem, same fix. |
| D10 | **Memory file `pattern-unexplained-rate-is-unmeasured`**, alongside `[[pattern-ship-a-fix-that-never-fires]]` and `[[pattern-flaky-test-hiding-a-prod-bug]]`. | The playbook only helps whoever opens it; memory files surface automatically in any future session. | Next memory write. |
| D11 | ⚙️ **OPS, pre-blast: Tailscale is relaying via DERP(sfo)**, `direct connection not established`, 386-826 ms — two SSH attempts died in banner exchange on 2026-07-30 before one succeeded. | `pre-blast-dry-run.md` §2's ledger-liveness `SELECT` is **mandatory** and runs over this path, as do the Task-5 backfill verification and the §2h cleanup recipe. A flake mid-blast means you cannot verify at the moment it matters most. | **Before blast day** — get a direct WireGuard path up, or a documented fallback. |

**DECIDED — do not reopen:** the **pre-push hook stays as-is**. It has earned its keep, and tuning turbo
`inputs` to skip the unit suite on e2e-only commits is a convenience win against an under-invalidation risk
— and Pitfall #39/9-58 exist in that hook precisely because it once ran *too little*. Not a pre-launch move.

---
### How to update this doc
At session end: bump the header (date + prod SHA), append to §7 the arc of what you did, and move any newly-adjudicated story out of §5. Keep §2 (the playbook) evergreen — **add a recipe whenever a new gotcha costs you time; that is the primary way this doc earns its keep.** Check §8: if you did a deferred item, delete its row; if a trigger has fired, say so. And re-run the §2a0 gate before flipping any status to `done`.
