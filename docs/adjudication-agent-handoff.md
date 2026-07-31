# OSLRS Adjudication-Agent Handoff (LIVING DOC)

**Last updated:** 2026-07-31 · **Prod deployed SHA:** `adbe330` · **Health:** https://oyoskills.com/api/v1/health
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
carry 201 unchecked `[ ]` boxes**, and 14 stories' own `Status:` line disagrees with `sprint-status.yaml`. ⚠️ **RE-MEASURED 2026-07-31 — the real figures are WORSE: 198 `done` stories carrying 299 unchecked boxes across 61 of them.** The 58/201 above was extrapolated from a three-story spot-check; the full scan is the number to plan against.
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
- **Cleanup (child-first, ONE txn, `-v ON_ERROR_STOP=1`):** `fraud_detections` (**by `submission_id`** — it has no `respondent_id`) → `marketplace_profiles` → `magic_link_tokens` (**by EMAIL** — a wizard-issued token has `respondent_id = NULL`, so the RID form deletes 0 rows and still looks clean; it silently leaked residue on three consecutive dry-runs before this was caught on 2026-07-30) → `wizard_drafts` (by email) → `submissions` → `respondents` for the RID, plus the test `campaign_sends` row (by email). **Read the `DELETE n` counts — a `DELETE 0` is a failed teardown, not a clean one.** Full annotated recipe: `docs/runbooks/pre-blast-dry-run.md` §5. **Do NOT delete the `users` account** (check `created_at` — real accounts predate today). **`audit_logs` is APPEND-ONLY** (a DB trigger `audit_logs_immutable()` rejects DELETE and rolls back the whole txn — leave the audit rows). Verify counts restore (baseline captured BEFORE the test).

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
- ⚠️ **Registry baseline CORRECTED 2026-07-30: `144 / 81 / 0` → `145 respondents / 82 submissions / 1 campaign_sends`.** (Recorded by this session's prod check; re-confirm on the next §0 cold start.)
  🚨 **"Restore to baseline" is now a DATA-DELETION HAZARD — read this before running the §2h cleanup recipe.** The three extra rows are **not** test residue: they are a real registration, its submission, and its `thankyou-referral-auto` ledger row (the same event that proved ledger liveness — respondent created `15:16:49.41`, `campaign_sends` row `15:16:49.951`, i.e. the auto-send fires **synchronously in-request**). Deleting down to `144/81/0` would destroy live registry data and a real contact record. **Rule: after a test registration, delete the rows YOU created by id/reference-code — never "restore the count".** The baseline is a *tripwire* ("did something unexpected write?"), not a restore target.
- Pinned public form = `019f8ed3` (GPS-free, "Main Occupation (e.g. …)" label). Master enumerator form = `019f8eff` (relabeled, GPS kept).
  ⚙️ **That form has 25 questions across 6 SECTIONS → the wizard is N = 3 + 6 + 1 = 10 STEPS.** This number is load-bearing: any server-side bound on a
  step is a claim about THIS form (see Pitfall #46 and Story 13-47 — a stale `.max(5)` froze every draft past step 5 for seven days). Re-derive it after
  every re-pin: `SELECT COUNT(DISTINCT q->>'sectionId') FROM questionnaire_forms f, LATERAL jsonb_array_elements(f.form_schema->'questions') q WHERE f.id = '<pin>';`
- 🗓️ **All 292 live wizard drafts EXTENDED +1 month on 2026-07-30** (earliest expiry `2026-07-31` → **`2026-08-31`**, latest → `2026-09-29`), on Awwal's
  instruction, to buy time to resolve the blast properly. Nothing expires within 7 days. These drafts ARE the Cohort-B resume audience.

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
- **13-47** — 🔴 **PUSH THIS FIRST. `review`, implemented, and it is a LIVE PRODUCTION DEFECT FIX.** `saveDraftSchema.currentStep: .max(5)` was never
  re-derived when the wizard step count became FORM-DRIVEN (`3 head + one per form SECTION + 1 review`). 13-34’s 2026-07-23 re-pin published a
  **six-section** public form → N=10 → **every draft autosave from step 6 up 400’d for seven days**. Measured: 232/293 drafts frozen at step 4-5
  (`MAX(current_step)=5` in a ten-step wizard), `campaign_source` on **0 of 84** submissions. Draft-resume silently discarded answers past the cap.
  Near-miss only because 291/293 drafts predate the re-pin. **Its Dev Notes hold THE 3-STAGE COMMIT PLAN for this whole session** — stage 1 (13-47)
  alone and first, stage 2 = 13-37, stage 3 = all docs. **One open residual: AC8 DISCHARGE-ON-DEPLOY** — re-run 13-46 AC9’s dry run after deploy,
  asserting BOTH the stored `campaign_source` AND `getCampaignBreakdown()`. Found by running that dry run, NOT by any test: every automated signal
  was green throughout (the e2e resume harness only exercises steps 0-2). New **Pitfall #46** generalises it.
- **13-48** — e2e/test-environment FIDELITY (`ready-for-dev`, post-launch). The answer to *why no test caught 13-47*: the e2e env serves **no pinned public form**, so CI drives a **4-step** wizard while prod runs **10** — the cap was unreachable by construction, and GP-6 (draft persistence) is `test.fixme`. A **fixture** story, not a test story. ⚠️ It CANNOT catch a prod re-pin (that is data, not code); AC5 routes `registration.draft_rejected` into 13-42 as the only prod-facing signal.
- **13-37** — ⚠️ **NOT ready-for-dev; it is `review` with dev + adversarial review DONE and sitting on the tree.** Registry-read drift CI guard. 12 review findings (3 High / 4 Med / 5 Low), all fixed in-pass. **It closes ON PUSH, by Awwal's explicit ruling** — its only blocking residual (R1 in the story's new `## Residuals` table) is AC6's CI leg, and H1's fix *changed the CI wiring*, so the push must confirm TWO things: the `Registry-read drift guard (Story 13-37)` step is green **and** its index is below `Lint`'s (`ci-cd.yml:149` vs `:152`). Post-fix gate to reproduce: guard 344 files/0 hits · 46 guard tests · API 3326 pass/0 fail · tsc + eslint clean. **Push this before starting 13-41** — see the dependency below.
- **13-41** — CI guard making the unsafe-SQL-cast / false-guard class (the 22P02 shape) unwritable; wide scope; RED-failing canary required. Sibling of 13-37. **RE-SCOPED 2026-07-30 by John (PM), triggered by the 13-37 review — read the story before sizing it, it is no longer a one-sitting job:**
  - It **no longer mirrors 13-37's plumbing, it EXTRACTS it** into a shared `apps/api/src/lib/ci-guard/` toolkit (new **AC11**) consumed by thin `scripts/lint-*.ts` runners, with an **AST source model** (`ts.createSourceFile`; `typescript@^5.4.5` is already an `apps/api` devDep — no new dependency) replacing `maskComments` + the `templateWindow` character-count heuristic. Rationale that decided it: "mirror 13-37" had *already* copied three of 13-37's own review defects into the story before a line of code existed (H1's CI ordering, the pre-M4 `rootDir` layout, and AC8's fixture blind spot).
  - New **AC12** (variant enumeration + measurement against the real tree + real-artifact regression locks + RED-verify on the filesystem), new **Task 0**, and AC10's "zero hits" premise replaced by a **measured baseline of ≥55 live sites** + a per-hit FIXED/ALLOW-LISTED/DEFERRED disposition.
  - 🔗 **NEW HARD DEPENDENCY: 13-37 must be `done` — not merely `review`.** Task 0 refactors 13-37's shipped files (`src/lib/registry-read-drift.ts`, `scripts/lint-registry-read-drift.ts`, its 46 tests, its `ci-cd.yml` step). Starting before 13-37's CI verification has landed means refactoring code whose guard has never been proven on CI, and any red would be ambiguous between the two stories.
  - **Still POST-LAUNCH and NOT launch-gating — this is now SETTLED, do not re-litigate it.** The open question was AC10.3 (would the `(raw_data->>'dob')::date` sites on the public `/insights` page be live 500s?). Read-only prod query run 2026-07-30: `registry_unified` has **82 rows with a `dob`, 0 unparseable, 0 empty strings** ⇒ the exposure is **prophylactic today, not a live defect**. Same for `form.controller.ts:276,325` — every writer of `submissions.submitter_id` writes `null` or a UUID, and `NULL::uuid` is safe. Both still get FIXED by 13-41; neither blocks the blast.
- **13-42** — ops-digest data-integrity watch: sentinel population + self-edit liveness; each signal fires only on the real defect DELTA (new sentinel value / audit-vs-submission divergence), not on volume. Sanity-ceiling deferred to post-Cohort-A-blast.
- **13-43** — react-router 6→7 migration to retire the accepted-risk debt (removes the override + the 3 osv-scanner.toml entries; KEEP `safe-redirect`). Effort moderate. Pull trigger: another 6.x advisory.
- **13-44** — super-admin campaign observability UI: wire the built-but-unwired `getCampaignFunnel` (13-9) + a `campaign_sends` contact-log + a ledger-liveness banner. Reuse the 9-11 Audit Log Viewer pattern; PII per that precedent.
- Also in flight: 13-2 (association import, BLOCKED), 13-38 (marketplace badge), the Epic-11 email-channel stack (11-5/6/7, 13-39/40), Epic-12 dashboard refresh. See `sprint-status.yaml` for the full board.

## 6. Key systems map (where to look when adjudicating)
- **Send/dedupe:** `email.service.ts` `dispatch()` = the ONE chokepoint (suppression headers + `NotificationMeter` + `recordCampaignSend` for MARKETING categories). `campaign-contact.service.ts` = `filterMarketingCohort` (suppression + 5-day contact gap + intra-run dedup) + the fail-soft ledger write. 3 blast scripts + the welcome backfill all inherit `filterMarketingCohort`. `list-unsubscribe.ts` `MARKETING_CATEGORIES` = {reengagement-blast, supplemental-survey, thankyou-referral}. Suppression = `email_suppressions` (bounce/complaint/unsubscribe) ≠ contact-dedupe.
- **Wizard prefill/skip:** `WizardPage.tsx` (step list, URL-as-source-of-truth, `unreachableQuestionNames` FORM-derived via `lib/wizard-prefill.ts::computePrefill`, `effectiveFormData` feeding skip/gate/submit, landing-step correction effect). `Step4Questionnaire.tsx` (prefill stamp + banner). `FormRenderer.tsx` (geopoint suppression, "No questions available" dead-end at :350). `section-relevance.ts::isSectionStepSkippable`. The invariant: derive hide-sets from the FORM, never from a field a later step stamps (13-34 geopoint + 13-35 H1 both learned this).
- **Runbooks:** `docs/runbooks/pre-blast-dry-run.md` (THE send gate), `re-engagement-campaign-launch.md` (hub, §2 authoritative), `backfill-operator-residuals.md` (one-shot tracker). Triangulation brief: `docs/handoff-2026-07-23-send-ownership-triangulation.md`.

## 7. Session narrative (2026-07-23 → 07-30) — the arc, newest last
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

10. **13-37 dev + adversarial review + close-out prep, and the parity sweep it dragged in** (2026-07-30)
    — the session that turned §8's D1/D9 from proposals into worked examples. Arc:
    **(a) 13-37 built and reviewed.** The registry-read drift guard shipped, then a 12-finding
    adversarial review (3 High / 4 Med / 5 Low) found the guard was **narrower than its own threat
    model** in three ways 30 green fixture tests could not see: **H1** — the named CI step could NEVER
    EXECUTE, because Task 2 had folded the guard into the api `lint` chain and `- name: Lint` ran first,
    so a real drift aborts the job before the named step ([[pattern-ship-a-fix-that-never-fires]] *at the
    CI layer, in the story built to prevent it*); **H2/H3** — both rules matched only the `LEFT JOIN`
    spelling, and **both missed spellings are already this repo's idiom**
    (`survey-analytics.service.ts:1674` INNER-joins respondents, `:1675` uses `CROSS JOIN LATERAL`), so
    the cheapest evasion — change one keyword — walked straight through. All 12 fixed in-pass;
    RED-verified with three live canaries in the *previously-missed* spellings.
    **(b) The close was HELD on purpose.** Awwal ruled 13-37 closes **ON PUSH**: H1's fix changed the CI
    wiring, so the one unverifiable-locally thing is exactly the thing the review touched. That ruling
    is what produced D1's ledger and D9's verdict block — and D9's most useful property turned out to be
    what it does when a story is **not** closed (`Deploy SHA: ⏳ PENDING`, with the hold condition
    written into the block itself).
    **(c) 13-41 re-scoped by John (PM) off the back of it** — it now EXTRACTS a shared
    `src/lib/ci-guard/` toolkit with an AST source model instead of mirroring 13-37's plumbing, because
    "mirror 13-37" had **already copied three of 13-37's own review defects** into the story before a
    line of code existed. That measurement is the whole argument for extracting at instance two.
    **(d) Parity sweep + corrections:** 13-34's "every `::uuid` cast is accounted for" DISPROVEN
    (`form.controller.ts:276,325`, prophylactic → stays `done`, fix owned by 13-41 AC10.4); 13-41
    settled as NOT launch-gating by a read-only prod query (82 `dob` rows, **0 unparseable**);
    `epics.md`/`roadmap-to-launch.md` reconciled to `sprint-status.yaml`; the registry baseline
    corrected to **145/82/1** with the "restore to baseline is a data-deletion hazard" rule now in §3.
    **(e) New story 13-46 — public-burst readiness** (radio jingle → the public wizard), drafted
    `ready-for-dev` and **LAUNCH-ADJACENT**, not post-launch: the code doesn't block the jingle, the
    controls are wrong in **both directions at once** — an auth-shaped 5/IP/15min limit on an
    accountless public endpoint (under carrier NAT, the 6th listener behind a carrier IP takes a 429
    with no record of the person lost), while the asset actually at risk — **sending reputation** — has
    no ceiling at all, because every registration fires the thank-you **synchronously in-request** and
    `NotificationMeter` is documented FAIL-OPEN and counts *after* the send. Ordering ruled by Awwal:
    **cap the send → throttle the address → alert on burst → only THEN loosen the signup.**
    📻 **Attribution addendum — and a correction worth remembering as a method lesson.** It was asserted
    mid-session that the *"How did you hear about us?"* question did not exist; **Awwal pushed back and
    was right.** It is live on the Review step (`Step5ReviewAndSave.tsx:229`), `ATTRIBUTION_ENABLED =
    true` (`attribution.ts:12`), **Radio is the first option**, and 13-1's chain runs end to end into
    `raw_data.campaign_source` and back out via `getCampaignBreakdown`. The real gaps are narrower and
    more interesting: the path has **executed ZERO times on prod** (`campaign_source` on **0 of 82**
    submissions) ⇒ the pre-jingle gate is a **liveness dry run, not a form change**; `"Prefer not to
    say"` is the **pre-selected first option**, so *declined* and *ignored* collapse to one value and
    the channel denominator is unrecoverable; and **first-position bias sits on Radio itself**. Making
    the question **mandatory** is an OPEN DECISION for Awwal (it reverses 13-1's recorded
    "prominence ≠ mandatory" guardrail, sits at the most expensive point in the funnel, and forced
    choice with Radio first would manufacture the signal the jingle is meant to measure).
    **Process lessons worth keeping: (1) A story's close gate must stay narrower than the session's
    decision list.** Awwal asked that every session decision be captured; capturing them *inside* 13-37
    would have made it un-closeable, so its new `## Session Decision Log` splits **Part A (binds the
    close, stated in full)** from **Part B (an index of cross-cutting decisions, pointers only)**. Same
    instinct that made §2a0's states three and not a prose list.
    **(2) A drafting brief is evidence, not scripture — verify it like code.** Six of 13-46's premises
    changed under verification: `respondents` has **no email column at all** (so an "email unique index"
    AC would have been unimplementable); the auto-send is **never queued**; `NotificationMeter` cannot
    cap where it sits and its fail-open contract is *correct* for magic links (so the cap must be
    category-aware); `wizardDraftRateLimit` fails **earlier** than the registration limiter and its own
    comment states the "~5 wizards per shared NAT" assumption the jingle breaks; and — the big one — a
    **radio-jingle runbook already exists** (`13-3-cutover-and-failover.md`), so the story EXTENDS three
    artifacts rather than the one the brief named. **And the strongest instance ran the other way: an
    agent asserted the acquisition question did not exist, Awwal said it did, and Awwal was right** —
    one `grep` would have settled it before the claim was made. *Verify before asserting* cuts toward
    the agent at least as often as toward the operator; when the human who built the thing contradicts
    you about whether it exists, check the file first and argue second.

---

11. **The dry run that was supposed to be a formality found a live production defect (2026-07-30, same session).**
    13-46 AC9 asked for a five-minute liveness check of Story 13-1 attribution before spending on radio.
    Two live registrations produced **no `campaign_source`** — the second after a deliberate one-minute
    wait, which killed the obvious debounce theory. A third pass (select the channel, abandon WITHOUT
    submitting) was the discriminator: the draft came back `has_extras = f` **and `current_step = 4`** —
    the autosave had not dropped a field, it had **stopped**. Root cause:
    `saveDraftSchema.currentStep: z.number().max(5)`, correct for Story 9-12's fixed five-step wizard and
    never re-derived once the count became form-driven (`3 head + one per SECTION + 1 review`). The 13-34
    re-pin of 2026-07-23 published a **six-section** form → **N = 10** → every autosave from step 6 up
    400'd **for seven days**. Measured: **232 of 293 drafts frozen, `MAX(current_step) = 5`** in a
    ten-step wizard, `campaign_source` on **0 of 84** submissions.

    **Four independent silencers, each individually defensible, together total:** a deliberately generic
    400 that logged nothing (the *second* incident of that exact signature after 13-23); a client footer
    promising *"we'll keep retrying"* when `scheduleSave` only re-fires on the next edit; e2e resume
    tests — including the harness built specifically to gate autosave-and-resume — that only exercise
    steps 0-2; and submissions succeeding anyway, because 13-23 had already moved `questionnaireFormId`
    into the payload. **Every automated signal was green for the entire outage.**

    Fixed in-session (Story **13-47**): cap raised with a "do not re-tighten" note; attribution moved
    into the submit payload with payload→draft precedence and a **bounded** schema; server-side
    `registration.draft_rejected` logging; an honest, prominent client alert; **Pitfall #46**; and all
    292 live drafts extended a month on Awwal's instruction. Two RED-verifies, each flipping exactly one
    test — including a **wiring** test, because the unit tests prove the precedence *logic* and only the
    wiring test proves the controller *passes* it.

    **Three lessons worth more than the fix.** (1) *A bound is a claim about the world; when the world
    becomes dynamic the bound is already wrong — it just has not been contradicted yet.* (2) A near-miss
    is the cheapest possible teacher: real harm was ~0 only because 291/293 drafts predate the re-pin —
    the same defect met by the blast or the jingle would have been unrecoverable, because you cannot
    re-ask someone how they heard about you. (3) **Nothing found this but exercising the real feature
    against real production and reading the database.** Not tsc, not eslint, not 3,334 passing tests,
    not the e2e harness written for this exact behaviour. Budget for dry runs accordingly.

---

## 7b. Session 2026-07-31 — 13-47 + 13-37 shipped

10. **13-47 (live prod defect) then 13-37**, in that order and separately, because a seven-day defect
    freezing 232/293 drafts should not wait behind a CI-guard story. Three deploys: `e99ae89` (cap +
    payload attribution), `a7a6cc9` (the invariant), `adbe330` (the guard). **13-47's dev and code review
    were ONE pass**, so adjudication was its first independent layer — and found two Med defects. The
    second is the one worth remembering: **AJ-1 fixed the CALLER, not the INVARIANT.** Sanitising the
    client stopped today's wizard sending a bad value, but the story's rule was absolute and the server
    still 400'd for any other caller — including the 9-61 authenticated-edit path, which the schema's own
    docblock names as sharing it. **When a story states an absolute ("must never"), fix it where it is
    GUARANTEED, not where it currently happens to be triggered.** That correction came from a second
    review session reading my commit, which is the system working.
11. **R1s discharged on evidence, not badges.** 13-37: the guard step *printed* `344 files scanned, no
    drift` at 17:50:13.426 while `Lint` began at 17:50:13.450 — executed, and above `Lint`. 13-47: the
    REAL `getCampaignBreakdown()` was RUN on the box (`count: 1` across 83 submissions), not transcribed
    into psql. Both are the same discipline: a check you did not watch execute is not a check.
12. **Two playbook additions from the push itself:** Pitfall **#37** gained the segfault signature
    (`0xC0000005` after `pdf-tabular.parser.test.ts`) with `VITEST_MAX_THREADS=1` as the escalation at
    ~2.5× runtime; Pitfall **#47** minted — *a CACHED gate is not a PASSED gate* (a 363 ms FULL TURBO
    pre-push on a commit that added three `apps/api` files).

---

## 8. Deferred improvements (NONE launch-gating — deliberately parked 2026-07-30)

Parked by Awwal while launch bandwidth is tight. **Each row carries a TRIGGER, because a deferred list
without triggers becomes exactly the invisible debt §2a0 exists to catch** — that is the whole lesson of
this session applied to this list. Nothing here blocks the blast; §4 holds the things that do.

| # | Item | Why it matters | Trigger to do it |
|---|---|---|---|
| D1 | ✅ **WORKED EXAMPLE EXISTS (2026-07-30) — format is no longer a proposal, copy it.** **Residual ledger**: a `## Residuals` table (ID / severity / state / re-runnable evidence / owner), using the §2a0 three states. ~~Retrofit 13-36 as the worked example.~~ **Done instead on 13-37** — `_bmad-output/implementation-artifacts/13-37-registry-read-drift-ci-guard.md` → `## Residuals`. **13-37 is the better example than the proposed 13-36 retrofit**, for three reasons: it has exactly **ONE blocking residual** (R1, AC6's CI leg) rather than a tangle; that residual has **re-runnable evidence on both sides of the push** (locally `pnpm --filter @oslsr/api lint:registry-read` → 344 files/0 hits; after push, a two-part `gh run view` check for the step being green **and** ordered above `Lint`); and the ledger was written **before** the close rather than reconstructed after it, which is what §2a0's two touch points actually ask for. It also carries two ACCEPTED rows (R2 = the rule-(a) scope gap, measured 50→0; R3 = L2's comment-mask KNOWN LIMIT) — deliberately kept, because those are exactly what §2a0's grep surfaces, and R3 is left as the example of a *thin* ACCEPTED (a bound, not a count) so the format shows its own failure mode. | Makes the debt gate a *schema* instead of a discipline. Prose is not type-checked. | ~~First story adjudicated after launch.~~ **DONE.** Remaining: fold the table into the story template so the next story starts with it, and use it on the next adjudication. |
| D2 | **STILL PARKED — no script written.** **`scripts/residual-inventory.ts`** — regenerates the debt table on demand (unchecked boxes + residual language + file-vs-board status divergence). | A hand-written list is stale in a week. Same script later feeds D3, so the parse is written once. | ~~Do with D1; it *is* the report.~~ **D1 shipped WITHOUT it** — 13-37's ledger is hand-written, which is precisely the staleness D2 exists to fix, so the trigger is now sharper, not softer: **write it when a SECOND story needs a ledger**, i.e. at 13-41's close-out. Two hand-written ledgers is the point at which the parse pays for itself, and by then D1's format has been exercised twice so the script has a stable target. |
| D3 | **Story 13-45 — CI guard**: fail when a story reads `Status: done` while its ledger holds an OPEN/DISCHARGE-ON-PUSH row. | Without a guard, D1 is a convention — and conventions produced the 201. Needs a RED-failing canary, so it is real dev work. Sibling of 13-41/13-37. **⚠️ It is the THIRD consumer of the shared CI-guard toolkit 13-41 extracts** (`apps/api/src/lib/ci-guard/` — file walk, path rules, allowlist, escape hatch, hit record, message skeleton, runner factory, AST source model), so it should be built ON that toolkit, never as a fourth copy of 13-37's plumbing. It is also a named blocking step in `lint-and-build`, so it inherits **Pitfall #45**: the step must sit ABOVE `Lint`, and 13-41's AC6 ordering-assertion test must be extended to cover it. | ~~After D1+D2 exist and one story has used the ledger for real.~~ **D1 now exists and 13-37 has used it for real** — so the remaining gates are D2 (the parse) and, critically, **13-41 landing the toolkit**. Do not start 13-45 before 13-41 is `done`. |
| D4 | **Triage the blind spot**: ⚠️ **RE-MEASURED 2026-07-31: 198 `done` stories / 299 unchecked boxes / 61 stories affected** (the 58/201 estimate came from a three-story spot-check). Most are litter — accepted-by-design notes, parked options, dead commit-hygiene reminders — which IS the problem: **real items are indistinguishable from noise.** WORKED EXAMPLE: `13-9` L1 correctly diagnosed AND prescribed the fix for the 13-47 production defect a month early, sat unchecked in a `done` story, and was only rediscovered from prod data. Original text: Start with the launch-adjacent set (13-24, 13-19, 13-34, 13-21, 13-23, 13-27, 11-2, 13-16) and mark the OSV cluster (13-31/13-32/sec-1/sec-4, ~27 hits) as **managed-elsewhere** — `osv-scanner.toml` + the blocking gate already is their ledger. | The two launch-gating items in §4 came out of a 3-story spot-check. The rest is unmeasured. | Post-blast, or immediately if anything in §4's list turns out to have siblings. |
| D5 | **Make §0 a script** (`scripts/adjudicate-coldstart.sh`): the five checks + prod registry baseline + pinned form, one screen. | A prose command block rots invisibly — §0's `git rev-parse --short A B` silently broke on git 2.52 and cost a session four commands to diagnose. A script fails loudly. | Next time a §0 command misbehaves, or with D2. |
| D6 | **Drop the prod SHA from this doc's header.** | It is self-staling metadata: wrong within hours on 2026-07-26 (a docs-only deploy moved prod's HEAD) and again on 2026-07-30. Let D5's script report ground truth instead. | Do with D5. |
| D7 | **§5 needs a designated next pick**, one line, pointing at `[[next-story-sequence-post-11-2]]`. | Four stories with no ordering means every cold start re-litigates the choice. | Next cold start that has to choose. |
| D8 | **Cap §7 at the last two sessions**, archiving older arcs to a dated `docs/session-*.md`. | This doc is growing unbounded; `MEMORY.md` already blew its size budget for exactly this reason. | When §7 passes ~10 entries. |
| D9 | ✅ **WORKED EXAMPLE EXISTS (2026-07-30) — copy the block, don't reword it.** **§2j verdict format** — a fixed closing block (verdict / RED-verify evidence / File-List reconciliation / deploy SHA). First use: `13-37-…-ci-guard.md` → `## Closing verdict`. Note what it does when the story is NOT closed: the verdict line reads *"NOT CLOSED — `review`, closing on push"* with the reason, and **deploy SHA is left explicitly `⏳ PENDING`** with the rule written into the block itself — *until that line carries a real SHA, `Status:` must not read `done`*. A block that can only be filled in at close-out gets filled in from memory; one that is filled in at `review` and carries its own hold condition cannot silently go stale. | 13-36's close-out was hand-synced across five places (story body, Change Log, sprint-status, MEMORY, this doc) and the disproven claim survived in three of them. | ~~Do with D1 — same problem, same fix.~~ **DONE, with D1, on 13-37.** Remaining: add it to the story template, and use it at 13-37's actual push (fill the SHA + discharge R1) so the format is proven through a real close, not only a real hold. |
| D10 | **Memory file `pattern-unexplained-rate-is-unmeasured`**, alongside `[[pattern-ship-a-fix-that-never-fires]]` and `[[pattern-flaky-test-hiding-a-prod-bug]]`. | The playbook only helps whoever opens it; memory files surface automatically in any future session. | Next memory write. |
| D11 | ⚙️ **OPS, pre-blast: Tailscale is relaying via DERP(sfo)**, `direct connection not established`, 386-826 ms — two SSH attempts died in banner exchange on 2026-07-30 before one succeeded. | `pre-blast-dry-run.md` §2's ledger-liveness `SELECT` is **mandatory** and runs over this path, as do the Task-5 backfill verification and the §2h cleanup recipe. A flake mid-blast means you cannot verify at the moment it matters most. | **Before blast day** — get a direct WireGuard path up, or a documented fallback. |

**DECIDED — do not reopen:** the **pre-push hook stays as-is**. It has earned its keep, and tuning turbo
`inputs` to skip the unit suite on e2e-only commits is a convenience win against an under-invalidation risk
— and Pitfall #39/9-58 exist in that hook precisely because it once ran *too little*. Not a pre-launch move.

---
### How to update this doc
At session end: bump the header (date + prod SHA), append to §7 the arc of what you did, and move any newly-adjudicated story out of §5. Keep §2 (the playbook) evergreen — **add a recipe whenever a new gotcha costs you time; that is the primary way this doc earns its keep.** Check §8: if you did a deferred item, delete its row; if a trigger has fired, say so. And re-run the §2a0 gate before flipping any status to `done`.
