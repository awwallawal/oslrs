# OSLRS Adjudication-Agent Handoff (LIVING DOC)

**Last updated:** 2026-08-23 · ⚠️ **TWO WORKTREES — parallel streams, read §1a** · ✅ **GATE ITEM 2 IS GREEN** (enumerator path proven on prod, 6 submissions, teardown clean — SCP §12 + `enumerator-prod-smoke-and-golive-gate.md` §F) · **Health:** https://oyoskills.com/api/v1/health · **Start at §2** — run the §2a0 debt gate before anything else.

📻 **JINGLE WEEK 1 — read §9 BEFORE anything else if the date is on or after ~2026-08-25.** It holds the pre-jingle traffic baseline (the "before" half of a comparison that cannot be reconstructed later), the finding that the traffic-watch cron was never installed AND its documented command is broken, the signal to actually watch (NG requests, not total — the top country is the US), and the retro theme. Do not run the retro before week 1 settles.

✅ **D6 DONE 2026-08-18 — the prod SHA is no longer recorded here.** It had been wrong FOUR times (2026-07-26, 07-30, 08-09, and again today: the header read `19b51f5` while prod was on `9490449`). A number that is wrong more often than right is worse than no number, because it is read as fact. **There is exactly one way to know, and it takes three seconds:**
```bash
ssh -o ConnectTimeout=25 root@100.93.100.28 'cd /root/oslrs && git rev-parse --short HEAD'
curl -s -o /dev/null -w '%{http_code}\n' https://oyoskills.com/api/v1/health   # want 200
```

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

## 1a. ⚠️ PARALLEL STREAMS — two worktrees, one machine (2026-08-19)

**The jingle gate has four stories left and they split into two independent streams.** The split is by
*subsystem*, not by convenience:

| stream | stories | tree | why grouped |
|---|---|---|---|
| **A — analytics honesty** | ~~12-5~~ ✅ **CLOSED on prod `836d1c7`** → **12-6** | `C:\Users\DELL\Desktop\oslrs` (main) | Both touch SurveyAnalytics surfaces; 12-6 adds a tab to the page 12-5 relabels. **Sequential, not parallel.** |
| **B — send readiness** | ~~13-51~~ ✅ **DEPLOYED `d496abf` 2026-08-20** (still `review` — R1/R2 are operator actions) → **13-46** | `C:\Users\DELL\wt-13-46` (`story/13-46-burst-readiness`) | Notifications/limiter. Zero file overlap with A. 13-51 first — smaller, and its defect is live. |

Both worktrees were created from `dc105cc`, so neither starts with a rebase debt. `wt-13-38` was
**removed** at 13-38's close (clean, merged, nothing unpushed) — a leftover worktree is what the
`robocopy /MIR` command was aimed at when it deleted 1,574 tracked files. Before deleting, 4,750
reparse points were enumerated and **zero pointed outside the worktree**; removal used `rmdir /S /Q`,
which deletes junctions rather than following them. An empty husk survives a locked handle — harmless.

> 🔁 **THE WORKTREE LIFECYCLE, ruled 2026-08-20: one tree per in-flight story, discarded at merge.**
> A tree's job ends when its branch is merged and CI is green — **NOT when the story reaches `done`.**
> 13-51 was still `review` (R1/R2 are operator actions run against prod over ssh, not from the tree)
> and its worktree was correctly removed anyway. Keeping it would have bought nothing and left the
> exact artefact `robocopy /MIR` was aimed at when it deleted 1,574 tracked files here.
>
> **Removal sequence, proven twice (13-38, 13-51):** confirm clean + `rev-list main..branch` = 0 +
> `rev-list origin/main..branch` = 0 → enumerate reparse points and confirm **ZERO point outside the
> worktree** → `git worktree remove` → `rmdir /S /Q` (deletes junctions; does NOT follow them) →
> verify the main repo AND any sibling worktree are intact. Expect to reclaim little disk: pnpm
> hardlinks to a global store, so most content is shared.

### ⛔ The rule that decides whether this helps or hurts

**Worktrees do not create contention. Running two SUITES at once does** — and §2aa is unambiguous that
this machine punishes it (~1 GB headroom, a nonlinear 1.7 s → 20 s cliff, every observed
`route-resolution` failure).

- **A `pre-push` hook runs the FULL suite in its own tree.** Two pushes at once = two full suites =
  a failure in whichever loses, looking exactly like a real defect. **One suite at a time across BOTH
  trees.** `tasklist | grep -c node` first.
- **Sanctioned lever if it bites: `VITEST_MAX_THREADS=1`** (worked 2026-08-19). **Never raise a timeout.**
- 🆕 **turbo reports `using shared worktree cache` — the trees SHARE a cache.** Mostly a gift (a
  worktree `pnpm install` took 39 s). But combined with the `lint`-task input gap in §2y(c), **a guard
  result computed in one tree can replay in the other.** After any status flip, run the residual guard
  **DIRECT**, never through turbo.
- **A new worktree needs `.env` copied by hand** — it is untracked, so `git worktree add` cannot bring
  it, and `apps/web/vite.config.ts` sets `envDir: '../../'` so there is exactly one, at root. Then
  `pnpm install`. **Prove it runs (`tsc`), don't assume it does because files are present.**
- §2aa.1's `git status` rule applies **per tree**, and the hooks read the WORKING TREE, not the index.

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

### 2a0.1 ⛔ GREP THE STORY FOR A SECTION ADDRESSED TO *YOU* — before anything else
*Added 2026-08-23, after adjudicating 13-65 without reading the section written for the adjudicator.*

**The rule: before adjudicating, `grep -niE "for adjudication|adjudicat(or|ion) agent|probe" <story>.md`.**
If a story has a section addressed to adjudication, it is the FIRST thing to read, ahead of the debt
gate and ahead of the code.

**How it bit.** 13-65 carried `## 🏁 FOR ADJUDICATION — final gate state + the fourth-pass probes,
IN LIEU of a fourth review`. Awwal had ruled that a fourth review pass was not worth the compute, and
**the probes it would have run were written out for the adjudication agent to execute instead.** The
first pass ran the §2a0 debt gate, tsc/eslint/guards, the touched suites and one RED-verify, wrote the
missing ledger — and never opened that section. **Six of the seven delegated probes went unexecuted**
(only AC8 was caught independently). It surfaced because Awwal asked directly.

- ⭐ **The §2a0 gate is about what the story ADMITS it did not finish. This is about what the story
  ASKED YOU TO DO.** They are different questions and the first does not surface the second: unchecked
  boxes, residual language and ledger presence were all checked, and all of them passed.
- **A delegated probe is invisible to every automated gate.** It is not an AC, not a residual row and
  not a test — the CI guard cannot see it, and neither can `tsc`. It exists only as prose addressed to
  a reader who has to choose to read it. That makes it the same class as
  [[pattern-ship-a-fix-that-never-fires]]: work that exists and never executes.
- **When a review pass is deliberately skipped, its checks do not vanish — they are REASSIGNED.**
  Treat "in lieu of a review" as a work order, not context.
- ⚠️ **And report the probes' results in the story**, not only in chat. A probe executed and
  recorded nowhere is indistinguishable from one never run.

### 2a2. READ A NEW GATE'S OUTPUT ONCE, EVEN WHEN IT IS GREEN

**The rule:** the first time any new gate runs — a CI step, a workflow, a script, a
verification query — **read what it actually printed**, even if it passed. After that,
green is enough. The first run is the only moment you learn what "working" is supposed to
look like, so it is the only moment you can notice it isn't.

**Why this is a rule and not a nicety (2026-08-01).** The `prod-verify` workflow was
described — by me — as "verified statically: YAML parses, secrets match the deploy job's,
read-only flag present". All three true. It then failed twice on things static checking
cannot see:

1. **A shell quoting bug.** `PSQL="docker exec -e PGOPTIONS=-c\ default_..."` — expanding
   an unquoted variable word-splits on the embedded space, so docker read
   `default_transaction_read_only=on` as the CONTAINER NAME. `bash -n` passes: the syntax
   was valid. A shell FUNCTION preserves argument boundaries; a string variable cannot.
2. **A query that matched nothing — and this one went GREEN.** `form_schema->'questions'`
   is NULL (questions nest inside `sections`), and `jsonb_array_elements(NULL)` returns
   ZERO ROWS *without erroring*. psql exited 0, `set -e` had nothing to catch, and the job
   passed while its most important check measured nothing. **Caught only by reading the
   output of a PASSING run.** The same broken query had already propagated into
   `pre-blast-dry-run.md` §0 as a MANDATORY check — it would have run on blast day and
   printed an empty table that reads like "nothing wrong".

**SHARPENING (2026-08-01, learned the same day by getting it wrong): reading a GREEN run is not
enough — you must read a run that EXERCISES THE BRANCH YOU CARE ABOUT.**

`prod-verify` went green twice. Both dispatches omitted the optional `control_email`, so section 6 was
SKIPPED in both. The first time it actually ran: `ERROR: syntax error at or near ":"` — psql does not
interpolate `:'email'` in a `-c` string, it hands the literal token to the server. Two greens said
nothing whatsoever about that code, because **"the job passed" cannot distinguish TAKEN from SKIPPED.**

- **A conditional branch is unverified until its condition is met.** Optional inputs, `if` blocks,
  error paths, empty-result paths — each is its own first run.
- **Enumerate the paths and exercise each once.** The default path passing is the *weakest* evidence
  available: it is the one that would pass anyway.
- This is the same defect as a green burn-in certifying only the happy path (13-36 retro R-2) and as a
  fix sitting on a code path nothing calls. Coverage of the artifact is not coverage of its behaviour.

**The family, now at four.** Every one of these is indistinguishable from passing:

| Form | Mechanism |
|---|---|
| Pitfall #45 | a named CI step ordered below a broader one **never executes** |
| Pitfall #47 | a **cached** task replays an older result |
| §2a2 (here) | a query **matches nothing** and returns success |
| `pattern-ship-a-fix-that-never-fires` | the fix is on a path that never runs |

**Two mechanical follow-ons, not just vigilance:**
- **Make emptiness fail.** A check that can return zero rows and stay green is not a check.
  `prod-verify` now hard-fails on an empty draft-contract result with an explicit *"do not
  read this as no problem"* message. Prefer a guard over a habit wherever you can write one.
- **Sanity-check the SHAPE of the first output**, not just its exit code: row counts that
  are plausible, a number that matches an independent method. The corrected contract query
  returning `6 sections / N=10` was trustworthy precisely because `form:diff` computes the
  same 6 from the workbook — two methods, one answer.

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

### 2j. A `void`-returning helper LOSES THE LAST ITEM OF EVERY BATCH (new 2026-08-03)
- **Signature:** a batch job reports N successes and the side-effect table has N−1 rows, always missing the LAST one. It reads as a miscount, which is why it survives.
- **Mechanism:** `AuditService.logAction` is declared `: void` — it opens its own transaction and never returns the promise, *and* it ends in `.catch(err => logger.warn(...))`. A caller **cannot** await it and never learns it failed. In a long-lived server the process outlives the write, so it is harmless. In a **script** it is not: items 1..N−1 flush only as a side effect of the *next* iteration's `await` yielding the event loop, and item N is still in flight when `process.exit()` tears down the pool. **Structural, not probabilistic — a batch of N always loses exactly row N.**
- **Fix:** use the awaitable sibling (`logActionTx(tx, …)`) inside the operation's OWN transaction. That also buys atomicity — a failed audit write rolls the operation back instead of leaving a mutation with no trail.
- **Generalise:** grep for `void`-returning fire-and-forget helpers called from `scripts/`. The API's fire-and-forget contract is a SERVER assumption; scripts violate it by exiting.
- **RED-verify it:** neuter to `void AuditService.logActionTx(...)` — the regression test must resolve `promoted: true` instead of rejecting. If it still passes, the test is asserting the call happened, not that the trail survives.

### 2k. CLASSIFY before you escalate — and before you dismiss (new 2026-08-03)
- A verifier that returns ONE boolean over MULTIPLE invariants cannot be acted on. `verifyHashChain` enforces (a) **self-hash** — ordering-independent, the real tamper signal — and (b) **link order** under `ORDER BY created_at, id`, which is ordering-DEPENDENT and *not guaranteed*: `createdAt` is stamped in JS before the txn opens, and `SELECT … FOR UPDATE` does not serialise two writers under READ COMMITTED (the second re-reads the same locked row; the other's INSERT was never in its scan), so both store the same `previous_hash` and the chain forks.
- **Prod, 2026-08-03: `INVALID`, but 0 self-hash failures / 117 forks / 0 gaps.** No tampering — the linear order never existed. A naive `lag()` SQL proxy reports the same 117 and would have been read as corruption.
- **Rule:** when a check fails, first ask *which invariant* failed, then whether the failing one is even well-defined. Escalating a concurrency artifact as tampering and dismissing real tampering as "that known ordering thing" are the same mistake. Tool: `pnpm --filter @oslsr/api audit:verify-chain`.

### 2l. A DIAGNOSTIC IS A CLAIM — gate it on evidence (new 2026-08-03)
- `expectInboxReady` printed "this is a **LOST SESSION** … a parallel worker logging in as the SAME seeded account" in a run whose own log read `Running 57 tests using 1 worker`, three lines below its own `Auth-refresh traffic seen: (none)`. The real cause was a post-login redirect clobbering the navigation. **A confident wrong answer is worse than none: it is read as the conclusion and the investigation starts at the wrong end.**
- Same shape one layer down: the test discarded `gotoMessages`' rejection (`navigation.catch(() => {})`), so *any* upstream failure surfaced as "Loading messages not found" — a claim about the skeleton.
- **Rule:** a helper may only NAME a cause when its own captured evidence identifies it; otherwise print the observations and say UNRESOLVED. Apply the same test to your own report to Awwal.

### 2m. "Logged in" ≠ settled — wait for the SECOND redirect (new 2026-08-03)
- `staffLogin` matched `/dashboard` and returned while `DashboardRedirect` still had a pending `<Navigate to={getDashboardRoute(role)} replace />` in an effect. The caller navigated, then that effect **replaced** the location — the target page unmounted before its query fired, so there was no traffic of ANY kind to diagnose from.
- Every `roleRouteMap` value is `/dashboard/<slug>`, so waiting for a segment after `/dashboard` is a universal settled-signal. **Generalise: any auth flow with a role-landing redirect has this trap.**

### 2n. ⭐ A BATCH JOB AGAINST A LIVE SYSTEM RACES THE PEOPLE IN IT (new 2026-08-04)
- **The dry-run passed every one of the five defects found on 2026-08-04.** None was findable by preview, because each needed *other humans using the product at the same time*. Treat "dry-run clean" as necessary and nowhere near sufficient for a run that writes to citizen records.
- **The incident:** 13-49 adopted 174 people; **7 ended up with two records and two numbers.** `findOrCreateRespondent` dedupes on the **INCOMING** submission's NIN (`submission-processing.service.ts:454` — with no NIN, "the dedup checks are skipped"). A self-registration through the no-NIN path therefore matches NOTHING, however complete the record we already hold. Rate: **24% of the D3 (pending-NIN) cohort within 90 minutes**, vs 1.4% of D1.
- **COPY IS A CAUSE, NOT A COMMENT.** D1 and D3 got identical text saying "Your record is active" (false for D3) and "add what is missing" — an invitation to do the one thing that duplicates them. Before sending anything to a cohort, ask: *is every sentence true for THIS cohort, and does any of it invite an action the system cannot absorb?*
- **The table moves under you.** `wizard_drafts` went 292 → 286 mid-session (completing a registration deletes the draft); `reconcileDraftIds` demands a bijection, so it aborted runs three times. **Reconcile per run**, and re-measure baselines — never "restore to N".
- **Sequence by cohort, gate each on ONE record**, even when an earlier cohort passed: D2's enrichment, D3's pending-NIN and D1's adoption are different write paths and each failed differently.

### 2o. FIX THE CLASS, NOT THE COHORT IN FRONT OF YOU (new 2026-08-04)
- I shipped an idempotence guard for D2's enrichment, deployed it, and moved on. It was the *cohort* fix. `adoptDraft` (D1/D3) still had none — and **D3 was the exposed one**, because its rows have no NIN for dedupe to catch. A re-run would have minted a second record with a second number.
- The tell was inverted attention: the cohort with 139 rows was safe; the cohort with 24 was not. **When you fix a guard, immediately grep for its siblings** and ask which caller is *least* protected, not which is largest.
- Same shape as R8 (recommender vs enforcer) and R11 (D2 audit row vs every other batch writer). This project's most expensive defects are consistently "fixed one instance of a class".

### 2p. A VERIFICATION THAT READS THE INPUT INSTEAD OF THE SYSTEM PROVES NOTHING (new 2026-08-04)
- R8 closed on "164 adopting rows recommended, **0 rejected**". The real pre-flight then rejected **6**. The simulation read the SHEET's consent column; the enforcer reads the **live draft** (AC7 is explicit that it must). A simulation that consults the same artefact the operator edited is testing the artefact, not the system.
- Sibling of §2a2. When a check reports zero, ask *what did it actually query* — the dry-run's `blocked: 0` was likewise an UNEVALUATED zero, because the clash guard lives in the write path.

### 2q. MATCHING PEOPLE: names are not fields, and a GET must never mutate (new 2026-08-04)
- **Exact `first_name`+`last_name` equality is not identity.** It caught **zero** of four real collisions: `Muheebat Yusuf`→`Yusuf Muheebat Yetunde`, `Mukaheel Ajibola`→`AJIBOLA MUKAHEEL BABATUNDE`, `Monsurat Akadiri`→`Akadiri Monsurat Omolade`, `Omowumi Michael`→`Omowumi Ayomide Michael`. **Surname-first is a normal Nigerian convention** and middle names come and go. Match on **token overlap ≥2 + same phone**. Two, not one — a parent and child share a phone and a surname, and merging two people is far worse than a duplicate.
- **Derive the threshold from the data, not from taste.** Run the candidate rule read-only over the WHOLE table first: all 14 duplicate-phone pairs scored ≥2, and distinct-people-sharing-a-phone scored **zero**. That measurement is the justification; the unit test (mocked `db.execute` cannot evaluate token SQL) only pins the query shape.
- **A "click the button that matches your card" email is a trap.** Gmail, Microsoft Defender Safe Links and corporate gateways **PREFETCH every URL** to scan it. A one-click confirm gets clicked by a robot, and with two candidate buttons the scanner picks whichever it fetches first — writing a national identity number chosen by an antivirus product. **GET must never mutate:** the link opens a page, the write happens on an explicit POST. Also never list the candidate values — shown two near-identical numbers a person picks the familiar-looking one, and the whole problem is that one is wrong.
- **A WRONG identifier is worse than a missing one.** A typo'd NIN is a well-formed 11-digit number that may be **another citizen's real NIN**. Clear it, preserve the prior value in metadata, and ask the holder (`nin:reconfirm`). `duplicate_nins = 0` stayed true throughout this incident — an integrity check can be perfectly green while the data is wrong.
- **Before merging two statuses, find out who WRITES them.** `pending_nin_capture` and `nin_unavailable` look identical to a citizen; `nin_unavailable` is written by the reminder ladder when it gives up. Merging would have restarted reminders for 25 people we deliberately stopped emailing.

### 2r. A THRESHOLD IS ONLY VALID FOR THE DATA IT WAS MEASURED ON (new 2026-08-05)
- The R13 identity guard (same phone + ≥2 shared name tokens) was validated read-only across the WHOLE registry: 14 duplicate-phone pairs, **zero** distinct people sharing a phone. That is a real measurement and it justified shipping.
- **It does not transfer.** That registry is almost all SELF registration — one person, one handset. **Field enumeration inverts the distribution:** an enumerator registers a household on one phone, so `Fatima Bello` and `Fatima Aisha Bello` share a phone and two tokens, and the guard merges a mother and daughter into one record. Zero false merges *for self-registration* is not zero false merges.
- **The failure is silent and inverted.** It produces no error and no duplicate — just a household with fewer records than people. You cannot notice it by watching for failures; you have to assert the COUNT.
- **Rule:** when a heuristic crosses into a new ingestion source, cohort or channel, re-ask *what population was this measured on, and is the new one shaped the same?* Then make the smoke test exercise the NEW shape, not the old one. Handed to 13-4 as AC1b.
- **Corollary — a human beats a string comparison.** An enumerator is physically with the person. A dedupe heuristic exists to catch someone re-registering THEMSELVES; it should not overrule an operator standing in the room. Prefer exempting `submitterId`-bearing submissions over tightening the threshold for everyone.

### 2s. ⭐ THE 9-26 BLIND SPOT: not every respondent has a submissions row (new 2026-08-05)
- **It bit THREE times in one day**, in three different files, always the same way: someone reads `submissions.raw_data->>'email'` as *the* source of a person's address. It is not. The Story 9-28 absorbed cohort has **no submissions row at all** — that IS the 9-26 exception, and `prod-verify.yml` §5b gates the count.
- **Measured on prod: 45 respondents are reachable ONLY via `magic_link_tokens`.** Any caller reading submissions alone silently skips them — no error, just people quietly never contacted.
- **Worse than skipping: a destructive step you cannot follow through.** `nin:reconfirm` clears a NIN and then asks for a new one. Against someone unreachable, the clear succeeds and the ask never happens, leaving them strictly WORSE off than before. **Clear-then-ask is only honest if the asking can happen — resolve the contact FIRST, then decide whether to touch the record.**
- **The fix is a canonical primitive, not a doc line.** `resolveRespondentContactEmail(respondentId)` in `src/services/respondent-contact.service.ts` checks submission → magic-link token → user account in that order. New code calls it instead of reaching into a table. `listRespondentsWithoutEmail()` is its inverse and backs `pnpm --filter @oslsr/api sms:outreach-list`.
- **`null` is a real answer.** Some records are phone-only (at least one confirmed). Treat it as "reach them another way", never as a failure to swallow.
- ⚠️ **13-4 inherits this.** Enumerator-created respondents will have submissions, but clerk/import paths and anything touching the absorbed cohort will not. Assume the shape exists.

### 2t. ⭐ AN EMPTY RESULT IS NOT A NEGATIVE RESULT (new 2026-08-05)
- **Four times in one session** a zero/blank was read as an answer when the question had been asked wrongly:
  1. `q->>'key'` on a form question — the property is **`name`**. NULL for every form read as "no form has an email question". Nearly triggered a needless form re-pin (the operation that froze 232 drafts in July).
  2. `visibleIf`/`condition`/`showIf` on a section — the property is **`showWhen`**. Read as "guardian_phone is unconditionally required".
  3. `campaign_sends` had no row for a confirmation — because that table records **marketing only**. Read as "the email never sent".
  4. `no_nin_identity_match` attaches = **0** — read as "nothing needed attaching". It meant **the guard never executes on that path** (R21).
- **The rule: before filtering on a field name, print one whole object and look at it.** `SELECT jsonb_pretty(q) … LIMIT 1` settled cases 1 and 2 in seconds after minutes of wrong conclusions. Reading a property that does not exist returns NULL, and **NULL is indistinguishable from absence**.
- **For a zero from a guard or a counter, ask "did this code run?" before "was there nothing to do?"** A counter that was never incremented and a counter that legitimately counted nothing look identical. Prove execution: a log line, an audit row, a deliberate negative test.
- Sibling of §2a2 (a cached gate is not a passed gate) and §2p (a verification that reads the input proves nothing). Same family: **absence of evidence read as evidence of absence.**

### 2u. A tie-break rule must break the tie on the thing that ACTUALLY differs
*Added 2026-08-05, from the duplicate-merge survivor rule.*

`merge-duplicate-respondents.ts` picked its survivor by **1) more submissions · 2) has a NIN · 3) older**.
That ordering reads as data-protective and protects nothing. The merge **re-points submissions onto
the survivor** and **fills the survivor's NULL columns from the loser** — so every answer and the NIN
arrive either way, whichever record wins. Rules 1 and 2 were sorting on properties the merge itself
equalises seconds later.

**The one thing a merge genuinely destroys is a reference code.** That is the citizen-visible
identifier — in a confirmation email, on a screenshot, written on paper — and only one survives. So
the criterion that matters is **age**: the older code is the one already in the wild. Reordered to
**older → NIN → submissions**, with the tail two kept only as same-timestamp tiebreaks.

It surfaced on `MGKS01`/`Q09HFP`: the old rule chose a code minted four hours earlier over one the
person had held since 19 May, because the new record happened to carry the submission.

- **The general move: for each candidate rule, ask "if I get this wrong, what is unrecoverable?"**
  Sort by irreversibility, not by which field looks most substantial. A rule that ranks on something
  the operation normalises anyway is decoration with the authority of logic.
- **And when a rule changes, re-derive what the OLD one already did.** I told Awwal the new order
  would have produced identical outcomes on the eleven completed merges. It would not have: **5 of
  11 had chosen the NEWER record.** The data outcome was equivalent, but the surviving code was the
  later one in those five. The claim was plausible, cheap to check, and I asserted it before
  checking — §2p's shape exactly. The correction is now in the function's own docstring so the
  history reads accurately rather than flatteringly.

### 2v. A DEPENDENCY'S WARNING CAN BE A SOURCE-TEXT GREP — read its implementation before trusting it
*Added 2026-08-07, from the IPv6 bypass in the per-email registration limiter.*

express-rate-limit logged `ERR_ERL_KEY_GEN_IPV6` once per boot — nine lines in the prod error log —
against our custom `keyGenerator`. The warning was RIGHT: the IP fallback keyed the raw address, and
an IPv6 subscriber holds a whole prefix, so rotating their own low bits mints a fresh bucket every
request and the limit never binds.

**But the check is `keyGenerator.toString()` grepped for `req.ip` without `ipKeyGenerator`.** So
destructuring the argument — `({ body, ip }) =>` instead of `req.ip` — silences it while the bypass
stays wide open. **"The warning stopped" would have been a green light over an open hole**
([[pattern-test-that-passes-over-a-hole]], this time handed to us by a dependency).

- **Read a validator's implementation before letting it stand in for a test.** Ours lives in
  `dist/index.mjs`; it took one `grep` to learn it was a lint on *spelling*, not on behaviour.
- **The real proof was behavioural**: extract the key logic into an exported pure function, then
  assert two IPv6 addresses in one `/56` collapse to ONE key. RED-verify killed 4 of 12 tests when
  the helper call was removed, and the failure message WAS the bug.
- ⭐ **A guard test needs BOTH directions.** I also asserted that genuinely different prefixes stay
  APART — because a "fix" that lumped every caller into one bucket would have satisfied the collapse
  assertion just as happily. **One-directional guard tests pin one failure mode and licence the
  opposite one.**
- **Then trace it to where it EXECUTES**: on prod I grepped the deployed source for the CALL SITE,
  not the import — import-plus-comments would have satisfied a naive `grep ipKeyGenerator`.
- **Verifying "the warning is gone" needs a baseline.** The nine historical lines stay in the file
  forever. Snapshot the count BEFORE deploy; the proof is a fresh boot adding **zero** to it, since
  it previously logged once per boot.

### 2w. ⭐ A RECORD ABOUT THE WORK IS NOT THE WORK — check the artifact, every time
*Added 2026-08-08. FOUR instances in a single day, which is what makes it a pattern and not a slip.*

| the record said | the artifact said |
|---|---|
| 13-54's title: *"make an un-guarded respondent **write** impossible"* | the guard checks **creation** (D4 — caught by the author, and the reason D4 exists) |
| sprint-status: `13-53: review` **with a `✅ CLOSED` comment appended to the same line** | my scripted flip did `.replace("backlog", …)` on a line that read `review` — a no-op, while the script `print`ed success unconditionally |
| the story: *full suite **3646 passed***, re-verified under R-M1 | **3662** — R-M1's own correction had been applied from a pre-review run, before +16 tests |
| the adjudication: *"written up as known limit **#6**"* | it WAS written up — but inserted 5th, and markdown renumbers, so the reference resolved to a **different limit** |

None of these were lies and none were laziness. Each is a claim that was TRUE WHEN WRITTEN and quietly
stopped being true, or a claim written from an assumption about the artifact's state.

- **The cheapest possible defence: read the thing back.** Every one of the four cost seconds to catch
  and would have cost a future reader far more. `grep` the line you just edited; `git show HEAD:<file>`
  rather than trusting your own edit landed.
- ⚠️ **A scripted edit MUST assert its match.** `assert old in s` before `s.replace(...)`, and never
  `print("done")` outside the branch that did it. I applied that discipline to the story-file edits in
  the very same script and skipped it for the one-line yaml — which is the one that broke.
- **A recorded measurement should carry the commit it was measured at.** "3646" was correct at some
  SHA and wrong at HEAD; with the SHA attached, staleness is visible instead of inferred.
- **Sibling of [[pattern-ship-a-fix-that-never-fires]]**, moved up a level: there the FIX does not
  execute; here the RECORD of the fix drifts from it. Both are found the same way — by looking at what
  is actually there rather than what should be.

### 2x. ⭐ A WRONG FILTER FAILS PERMISSIVELY — and INFERRING IMPACT FROM STRUCTURE is how I got it wrong
*Added 2026-08-09. Two lessons from one afternoon; the second one is mine.*

**(a) A filter that is not applied returns MORE, not an error.** The registry's enumerator picker
called `/staff?roleFilter=enumerator&pageSize=500`. The controller reads
`{ page, limit, status, roleId, lgaId, search }` — **neither param exists**, both were discarded in
silence, and the call returned the unfiltered user table. Combined with a service that had no role
predicate at all, a Super Admin page listed **114 citizens by name**.

- **No 400, no 404, no log.** Every symptom looked like a UI bug while the endpoint behaved exactly
  as written. Sibling of [[pattern-ship-a-fix-that-never-fires]]: the filter was written, sent, and
  never applied.
- **Fix the DEFAULT, not the query string.** Excluding citizens in the service means a caller that
  forgets cannot pull them; fixing only the caller leaves the next caller exposed.
- **Pin the general property, not the instance:** *an unknown role name returns NOTHING rather than
  everything.* Failing CLOSED on an unrecognised filter is the lesson; `role=enumerator` working is
  just today's symptom.
- ⚠️ **Assert by identity, never by count.** "Returns 3 rows" passes over the hole the moment a
  fixture changes, and turns a leak into what looks like a pagination quirk.

**(b) ⛔ I INFERRED IMPACT FROM STRUCTURE, AND I WAS WRONG — twice-stated before I checked.**
Two `orphan_submissions` (a submission with no respondent) led me to assert that **two citizens had
registered and been silently dropped**, and to say so repeatedly, including in a story I wrote and
pushed. **Both were already on the register** — one had retried four hours later, the other was
registered *twelve minutes before* her orphan row was even written.

- **"A submission with no respondent" is a real anomaly. "Therefore this person is not registered" is
  a DIFFERENT CLAIM** and needed its own query — by name and phone — which it never got.
- The structural finding cost one query to make. The impact claim cost none, and it was the one that
  drove urgency, a story's framing, and a proposed prod recovery.
- **Before asserting harm to a named person, query for that person.** Row-shape anomalies describe
  rows. People are found by name and phone.
- The story (13-57) keeps the wrong version visible at the top with the correction, rather than being
  quietly rewritten — a reader deserves to know the severity moved.

### 2y. ⭐ COMMITTED IS NOT SHIPPED — and a destructive command needs its blast radius read first
*Added 2026-08-10. Both cost this session hours; the second nearly cost the working tree.*

**(a) Five states, and `done` requires the last two: committed → pushed → CI-green → deployed →
verified.** 13-61 read `done` / "SHIPPED" in the story file, `sprint-status.yaml` and §3 of this doc
for 24 hours while its commit sat unpushed — prod was unchanged and a Super Admin page was still
enumerating 120 citizens by name. Every instance of the word "shipped" that has drifted on this
project meant *committed*.

- **The check is one command and it is not optional at close-out:** `git status -sb | head -1` must
  read `## main...origin/main` with **no `[ahead N]`**. Then the VPS SHA. Then the behaviour.
- **Never conclude a push succeeded from an exit code you piped.** `git push … | tail` returns
  *tail's* status; a red pre-push gate reports exit 0. → [[feedback-never-pipe-a-push-to-tail]]
- **Verify the deploy by BEHAVIOUR on production rows, not by the SHA.** 13-61's close-out is the
  worked example: the deployed `staff.service.ts` grepped **on the VPS**, then the predicate run
  against the live table (124 users → 4 returned), then the fail-closed property (unknown role → 0
  rows) confirmed against real data rather than a fixture. A SHA proves a checkout, nothing more.

**(c) ⛔ AN EXIT CODE BELONGS TO THE LAST COMMAND IN THE CHAIN — and it lied in BOTH directions today.**
*Added 2026-08-18, during 12-4's close-out. Two instances in one hour; the ref and the job list caught both.*

`feedback-never-pipe-a-push-to-tail` says don't read *tail's* status. The general rule is bigger: **any
wrapper — a pipe, a `;`-chain, a trailing `echo`, a watcher process — reports ITS OWN status, not the
status of the thing you care about.**

| what I ran | reported | actually |
|---|---|---|
| `git push … > log 2>&1; echo "EXIT=$?" >> log` | background task: **exit 0** | push **FAILED** — `curl 28`, RPC timed out at 300 s, `[ahead 2]` unchanged. The `echo` succeeded, so the chain did. |
| `gh run watch <id> --exit-status` | **exit 1** | run was **green, 10/10 jobs, deploy success**. The watcher hit a TLS handshake timeout *fetching* the run. |

- ⭐ **A false GREEN and a false RED are the same bug.** The second one is the more insidious of the
  two here: had I trusted it I would have "fixed" a CI failure that never happened, on a deploy that
  had already succeeded.
- ✅ **The checks that are actually authoritative, and they are cheap:** for a push,
  `git status -sb | head -1` (**no `[ahead N]`**) and `git ls-remote origin main`. For CI,
  `gh run view <id> --json jobs` — **every job**, per §2d, never the watcher's verdict.
- **Put the thing you care about LAST**, or capture its status directly. `exec <cmd>` is the cheap fix
  when a wrapper is unavoidable.
- **This machine's link to GitHub is currently unreliable** (one 300 s RPC timeout, one TLS handshake
  timeout, ~20 min apart). When a push dies mid-transfer the pre-push suite has *already run* — the
  retry replays it as `FULL TURBO` in ~300 ms, which is **Pitfall #47**. That cache is only acceptable
  because the first attempt ran it uncached **on the identical tree**; say so out loud, or the next
  reader inherits a 298 ms "full suite" as evidence.

🐞 **AND A REAL ONE FOUND THIS WAY (2026-08-18) — the story-residual guard CANNOT FIRE on the commits
it exists to police.** `turbo.json`'s `lint` task declares **no `inputs`**, so turbo hashes the package
directory — `apps/api/` — plus `.env`. **`_bmad-output/` is outside it.** So a commit that changes only
story files never invalidates `@oslsr/api:lint`, and `lint-story-residuals.ts` **replays a stale
verdict**. Observed, not inferred: the 12-4 close-out commit flipped a story to `Status: done` and the
pre-commit gate reported `6 cached, 6 total / FULL TURBO 208 ms`, printing "317 stories scanned" from
an earlier run.

- ⭐ **The exposure is precisely inverted:** a story-status flip is the *only* thing this guard checks,
  and a story-only commit is the one case where it is guaranteed not to run. It fires only when the
  commit *also* touches `apps/api/**`.
- ✅ **CI is still authoritative** — remote caching is disabled (`• Remote caching disabled`), so a
  fresh runner has a cold cache and the guard genuinely runs there. This is a **false green locally**,
  not an escape to prod.
- ✅ **Verified by hand for 12-4:** `cd apps/api && pnpm exec tsx scripts/lint-story-residuals.ts`
  → 317 stories, no done-with-open-residuals, exit 0. **Run it DIRECT after any status flip** until
  the input set is fixed.
- **The fix belongs to 13-45/13-41** (§8 D3): give `lint` an explicit `inputs` including
  `../../_bmad-output/**/*.md`, or move the story guard to its own task with its own inputs. Sibling of
  **Pitfall #45** — there a step never executes; here it executes on the wrong snapshot.

**(b) ⛔ Before running anything destructive, ask what it can REACH — not what you aimed it at.**
`robocopy <empty> <dir> /MIR` was aimed at a leftover worktree and deleted **1,574 tracked files from
the main repo plus every `node_modules`**, because `/MIR` follows NTFS junctions by default and pnpm
links workspace `node_modules` with junctions. It ran *while the pre-push suite was executing*, and
surfaced as **31 test files unable to load `@aws-sdk/client-s3`** — indistinguishable from a
dependency problem.

- **Never `/MIR` without `/XJ` near this repo.** `Remove-Item -LiteralPath <p> -Recurse -Force` is the
  tool. → [[pitfall-robocopy-mir-follows-pnpm-junctions]]
- **A syntactically perfect command is not a safe one.** Nothing static could catch this; the danger
  was entirely in what the filesystem linked to.
- **Recovery is cheap IFF everything is committed** — `git restore .` + `pnpm install`. So the real
  rule is upstream: **commit before you clean up.**
- **Then enumerate what git CANNOT restore and check each**: `.env` (this repo has exactly one, at
  root — `apps/web/vite.config.ts` sets `envDir: '../../'`), and the Docker DBs (named volume
  `docker_postgres_data_dev`, outside the repo — it survived). Do not assume; look.
- Sibling of §2a2's family: the *symptom* pointed at dependencies while the *cause* was elsewhere
  entirely. When a failure appears in code you did not touch, suspect the environment you did.

### 2z. ⭐ THE PREDICATE MUST BE THE THING YOU MEAN — proxies fail in BOTH directions
*Added 2026-08-11. Two instances in one afternoon, one of them live on the public site.*

**The shape:** code filters on **A** while meaning **B**, because A is usually true when B is. Then A
and B diverge and nothing errors — the query still returns rows, the guard still writes a row, the
chart still renders a number. **Unlike §2x's permissive filter, this one is not too loose or too
tight; it is measuring a different thing entirely.**

**(a) A RATE'S DENOMINATOR IS WHO ANSWERED THE QUESTION — never a source, never "has any data".**
`public-insights.service.ts:80` defines `answersWhere = ru.raw_data IS NOT NULL` — *"has some
answers"* — and two published rates divide by it. Measured on prod 2026-08-11: **282 rows have
`raw_data`, but only 218 were asked `employment_status` and 199 `has_business`.** So **64 people who
were never asked are counted as "not unemployed"**, and the published estimate reads **18.4%** where
the answered set gives **23.9%**.

- **"Not asked" silently becomes "answered no"** the moment an unasked row enters a denominator.
- 13-2 tried to fix this with a **source** filter (*exclude `unverified_import` from rate charts*). A
  source is a proxy for "was asked", and it **fails both ways**: a member who *later* completes the
  questionnaire stays excluded forever; a field respondent who *skipped* stays included.
- ✅ **The rule (SCP §10.14 R-E):** `FILTER (WHERE raw_data->>'<field>' IS NOT NULL)` per metric, and
  publish `n`. Then source stops mattering — because it was never the right variable.
- ⚠️ **Safe-by-accident is not safe.** `youth_emp_rate` survives only because association rows carry
  `age_years` rather than `dob`. Make it uniform or the next channel breaks it.
- **RED-verify:** insert a respondent with `raw_data` but no `employment_status`; assert the rate does
  **not** move. It moves today.

**(b) ONE FUNCTION MUST OWN THE KEY — a write path and a read path that canonicalise differently
cannot match.** `email-events.service.ts` stores the provider's raw recipient at `:48`→`:100`, while
`getSuppressedEmails` looks up `toCanonicalEmail(...)` — which is only `trim().toLowerCase()` and does
**not** unwrap `Name <addr>`. So `'wahab akeem olaide <aqeemakolade@gmail.com>'` and
`'aqeemakolade@gmail.com'` can never be equal: **a suppression that cannot suppress.** The unsubscribe
inlet already canonicalises; only the webhook inlet does not.

- **Route every write AND every read through the same canonicaliser** — the
  [[feedback_canonical_primitive_backlog_sweep]] shape, same lesson as 13-55's five promote paths.
- **The input is not always yours to fix.** The same `message_id` carried a bare address on
  `sent`/`delivered` and a wrapped one on `bounced` (2 of 25 bounces; 0 of 1949 sent/delivered), so
  normalisation must happen at OUR inlet.
- 🚨 **AND CHECK WHETHER TWO DEFECTS ARE MASKING EACH OTHER BEFORE FIXING EITHER.** That person is
  reachable today *only* because the broken key cancels a wrongly-permanent suppression (no hard/soft
  severity is recorded). **Fixing the unwrap alone would activate the exclusion** — a fix that fires,
  correctly, and makes things worse. Ship both or neither (SCP §10.11).

**(c) ⛔ THE PRETTIER PREDICATE IS THE DANGEROUS ONE — PROBE IT BEFORE YOU TRUST IT.**
*Added 2026-08-14, from nearly shipping one.*

`route-resolution`'s `/login` test waits on `body.textContent.length > 50` — crude, and it had flaked
three times. The obvious fix is semantic: wait for the Suspense fallback `<PageSkeleton>`
(`aria-label="Loading page"`) to **disappear**. That *is* the condition the test means, it reads
beautifully, and **it is wrong here**: under vitest the lazy import resolves within a microtask, so the
fallback is gone before `waitFor`'s first poll.

- **A predicate that is satisfied instantly waits for NOTHING.** It would have passed while the page
  was still blank — converting a noisy-but-real check into a silent no-op, which is
  [[pattern-test-that-passes-over-a-hole]] introduced *by the fix for a flake*.
- ⭐ **THE PROBE THAT CAUGHT IT, AND THE ONE TO COPY: INVERT THE ASSERTION.** Change
  `.not.toBeInTheDocument()` to `.toBeInTheDocument()` and run it. If the thing you plan to wait for
  is never observed, your wait is decorative. It never matched once in 15 seconds.
- **Record the rejected approach IN THE FILE, with its evidence.** A rejected-but-elegant idea comes
  back — the next reader will "improve" the crude check into exactly the broken one unless the probe
  and its result are sitting there.
- **Sometimes the crude check is correct.** `KNOWN_ROUTES` carries no per-route content, and inventing
  some for 57 entries buys brittleness, not truth. Fix the budget, make the failure message explain
  itself, and say plainly that it is a mitigation.
- ⚠️ **AND SAY SO WHEN IT IS ONLY A MITIGATION.** That timeout has now been raised three times
  (1s → 5s → 15s). ~1.7s quiet versus a 15s exhaustion under load is a **10× spread — pathological,
  not slow.** A fourth raise would be the third consecutive symptom-treatment. Open as 13-60 R6.

**(d) ⛔ NAME THE TABLE AND COLUMN BEFORE YOU RUN THE QUERY — I have now sized twice in the wrong one.**
*Added 2026-08-15, after the second.*

A measurement can be **executed perfectly and answer a different question**, and it looks identical to
a correct one: real SQL, real rows, a confident number. Both of mine did.

| the claim was about | I measured | outcome |
|---|---|---|
| `public-insights.service` rates — which read **`registry-unified`** (respondent-anchored, one row per person) | **`submissions`** (`52/282`) | numbers wrong as a SPEC; **John caught it** (§10.14 R-E). *"The service does not read submissions"* — the exact join 13-33 exists to forbid |
| the `lga_id` on the **submission** (`submissions.raw_data->>'lga_id'`) | **`respondents.lga_id`** (325/325) | conclusion right, proof wrong — and it *could not have seen* that Rosemary's is a UUID while Adekemi's is a slug (§10.4) |

- ⭐ **The habit: write down the table and column the CLAIM concerns, then check your query names those
  exact two.** Both failures were one substitution each, made while thinking about the finding rather
  than the source.
- **A near-synonym is the trap.** `submissions` vs `registry-unified`, `respondents.lga_id` vs
  `raw_data->>'lga_id'` — both pairs sound like the same fact and are populated by different paths.
  **When a repo has a canonical read (13-33), a query that bypasses it is wrong by construction**,
  whatever it returns.
- ⚠️ **Getting the right ANSWER from the wrong SOURCE is the dangerous outcome**, not the harmless one:
  it survives review, and it retires the question so nobody looks again. §10.4's conclusion was correct
  both times, which is precisely why the bad proof stood for four days.
- **Sibling of (a)–(c):** there the predicate was not the thing meant; here the *source* was not.

**How to find these:** ask *"what is this predicate actually selecting, and is that what the sentence
above it claims?"* — and then *"is it selecting it FROM the thing the sentence is about?"* The first two
were found by reading one line of SQL and one function signature, not by a failing test, because nothing
fails. The third was found by **running the probe rather than admiring the idea.** The fourth was found
by **reading two rows on prod for an unrelated reason** — which is the uncomfortable part: nothing in
the process caught it.

### 2aa. ⭐ A COUNT CONSISTENT WITH BOTH OUTCOMES PROVES NEITHER — assert that the code RAN (new 2026-08-13)

**The rule:** when a check can return the same number whether the fix worked *or* the branch never
executed, the number is not evidence. **Assert execution separately** — a log line, a spy, a counter —
or you cannot tell a working guard from a dead one.

**How it bit (enumerator prod smoke, §C household case).** The test requires two people on ONE
handset with a shared surname and NO NIN, proving the identity guard creates two records instead of
merging them. The first attempt captured the pair on **different phones**. So:

- no same-phone match existed,
- the guard never ran,
- `§A query 4` would have returned **1**,
- and **1 reads as "the fix is broken"** when the truth was **"the code never executed."**

Both causes produce the same count and look identical in the UI. The only thing that separated them
was the mandatory step: `grep identity_match_exempted_staff_capture`, which returned **0**. After the
pair was formed correctly it returned the line, with `wouldHaveMergedInto` naming the first person —
**positive evidence the branch executed**, not merely that the outcome looked right.

**Generalise it.** This is the sibling of [[pattern-test-that-passes-over-a-hole]] pointed at
operator procedure rather than at a test file:

- *"Would this still pass if the fix were reverted?"* catches a test that never exercises the guard.
- *"Would this still pass if the guard never RAN?"* catches a **setup** that never reaches it.
- The second is harder, because the setup is usually the operator's, and a wrong setup looks like a
  wrong result.

⚠️ **Write the execution assertion into the procedure as MANDATORY, not "optionally check the logs".**
13-4's runbook did exactly that and it is the only reason this was caught rather than filed as a
regression.

### 2aa. ⛔ NEVER RUN TWO VITEST PROCESSES AT ONCE ON THIS MACHINE
*Added 2026-08-14, after chasing a "flake" that turned out to be my own verification method.*

**The rule: one vitest process at a time, locally.** A second concurrent run is what produced every
observed `route-resolution '/login'` failure — twice as a timeout, once as an assertion — across
2026-08-11 → 08-13. It cost a push and parts of three sessions, and it was self-inflicted.

**The evidence that settles it is CI's silence.** Across the last 20 `CI/CD Pipeline` runs on `main`
the only failure is `31737577114` (`test-api`, a real defect). **`test-web` has never failed.** A test
that fails only on one Windows laptop and never on a dedicated runner is not a flaky test.

#### 2aa.2 ⭐ THE VARIABLE IS FREE RAM, NOT PROCESS COUNT — and the hog was a BROWSER
*Added 2026-08-22. Awwal had found this in an earlier session; it was never written down, so it cost
a second round of pushes. **An undiagnosed cause gets re-diagnosed; an undocumented one gets
re-discovered.***

| | free RAM |
|---|---|
| at rest (2026-08-14 baseline) | 3.7 GB |
| during ONE single-file vitest run (2026-08-14) | **0.95 GB** |
| **during the FULL suite, Firefox CLOSED (2026-08-22)** | **4.53 GB** |

**Running the entire suite with the browser closed leaves MORE headroom than the old baseline had
while idle.** Top consumers during that run: `vmmemWSL` 483 MB, Memory Compression 440 MB, four
`claude` processes ≈370–430 MB. **No node process was in the top six.** The 2026-08-14 note already
said *"node is not the hog"* — correct, and nobody asked what was.

- ⭐ **So "one vitest at a time" was treating a symptom.** The real predicate is **free RAM**, and a
  browser with many tabs costs more than a second vitest ever did. **Check the number, not the
  process list:** `(Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB` — want **>3 GB**
  before starting a full suite.
- ⚠️ **`turbo run test` runs `api:test` and `web:test` CONCURRENTLY**, so the pre-push gate is
  *inherently* two vitest processes. That is structural, not a mistake — which is why headroom, not
  process count, is the thing to control. If the flake persists with RAM free, the real lever is
  `--concurrency=1` on the pre-push turbo call, **not** a fourth timeout raise.
- **The tell that separates the two failure modes:** a contended web run **COLLECTS FEWER FILES**
  (271 vs 273 — worker forks die with *"Timeout waiting for worker to respond"*). **Compare the FILE
  COUNT, not just the pass count.** A run that collects 273 and fails one test is a different
  animal from one that collects 271.
- **Still true and unchanged:** when a test fails only locally, `gh run list` the CI history BEFORE
  touching the test. `test-web` has never failed in CI.

**Measured on this machine (2026-08-14):**

| | |
|---|---|
| physical cores / logical | **4 / 8** |
| RAM total / free at rest | 15.8 GB / **3.7 GB** |
| **free RAM during ONE single-file vitest run** | **0.95 GB** |
| peak node RSS, all processes combined | **0.92 GB** — node is *not* the hog |

**Memory pressure, not CPU.** ~1 GB of headroom while testing; a second vitest process pushes it into
paging. That is why the spread is **1.7s → 20s** — a nonlinear cliff. CPU starvation degrades
*linearly*; it does not produce a 10× jump.

- **Before a full-suite run or a push, check nothing else is running:** `tasklist | grep -c node`.
  Dev servers are fine; a second vitest is not.
- **Do not raise a timeout to fix this.** `route-resolution`'s has been raised three times
  (1s → 5s → 15s). Each raise made the *next* diagnosis harder by pushing the failure further from
  its cause.
- **`VITEST_MAX_THREADS=1` IS the sanctioned lever if it recurs** — Pitfall #37b permits it precisely
  for contention/timeout flakes, which this is. It is only the *segfault* it never fixed.
- ⚠️ **Generalise the method, not the number:** when a test fails only locally, **check CI history
  before touching the test.** One `gh run list` answers "is this ours or the machine's" for free, and
  it is the question that should come first.

#### 2aa.1 ⛔ THE SAME RULE FOR CONCURRENT EDITS — `git status` BEFORE EVERY COMMIT *AND* PUSH
*Added 2026-08-14, immediately after doing it — then corrected within three minutes by doing it again.*

**Both hooks read the WORKING TREE, not what you staged.** `pre-push` runs the full suite over it;
**`pre-commit` runs `turbo lint` + `tsc` over the whole package** — so even a docs-only commit is
gated on someone else's half-finished source.

> ⛔ **CORRECTION, same hour.** This section first said *"before every PUSH"*. The very next commit —
> one markdown file — **failed at `pre-commit`**: `submission-processing.service.ts:634`,
> `no-constant-condition` + `no-constant-binary-expression`, from Awwal's in-flight 13-57 work. The
> rule was right and its scope was wrong, which is the §2w shape applied to a rule I had just written.
> **It is commit AND push, not push alone.**
>
> And the follow-on is its own lesson: by the time the file was opened to report the error, **the line
> numbers had moved and eslint exited 0** — he had already fixed it. **A dirty shared tree is a moving
> target; do not report line numbers from it, report the symptom and re-check.**

Observed the same afternoon: a docs-only push ran its gate over five uncommitted 13-57 files —
`normalise/phone.ts`, its index, and `phone.test.ts` — visible only as the API count moving
**3,711 → 3,715** between two runs of "my" suite. It passed, so it cost nothing. **It was luck.**

- ⛔ **A half-written import in someone else's tree reds MY push**, and I would then debug a failure
  that is neither mine nor real — burning the time on exactly the mistake §2aa is about: *measuring
  while something else disturbs the thing measured.*
- ✅ **The check, before every push:** `git status --short` — if **source files** (`apps/`,
  `packages/`) are modified and they are not mine, **hold and say so.** Docs-only dirt is harmless.
- ✅ **It cuts the other way too, and that half is the gift:** a green gate over his tree means his
  in-progress work has already had a full-suite run. **Tell him** — it is free information he paid
  nothing for, and it retires the gate he would otherwise hit later.
- **Two CLIs share one working tree here** (§1). Every "is anything else running?" rule therefore has
  an edits twin. `tasklist | grep -c node` answers the *process* question; only `git status` answers
  the *tree* question, and I had been asking only the first.

### 2ab. ⭐ A GUARD ONLY POLICES WHO OPTED IN — and mine missed the state the standard calls blocking
*Added 2026-08-20, from adjudicating 12-5. Two holes in ONE guard, each with a live repro sitting in front of it.*

`lint-story-residuals` (13-45) reported **"317 stories scanned, no done-with-open-residuals"** while
two stories violated §2a0 in plain sight.

| hole | mechanism | live repro |
|---|---|---|
| **1** | `isOpenState` required the literal word **OPEN**, so **`DISCHARGE-ON-PUSH` / `DISCHARGE-ON-DEPLOY` never matched** — even though §2a0 defines them verbatim as *"provable only after deploy. **Blocks `done`**, not the commit."* | 13-57 R4, 13-59 R1+R6 — all `DISCHARGE-ON-*` inside `Status: done` |
| **2** | The scan reads **table rows only**, so a story with **no ledger has no rows** and passes whatever it admits in prose | 12-5 — `Status: done`, no ledger, an explicit `⛔ PRE-DEPLOY RESIDUAL` in its body |

- ⭐ **The general shape: a format-based check polices exactly the people who adopted the format.**
  The diligent get audited; the ones who skipped the ledger are invisible. That is backwards, and it
  is [[pattern-test-that-passes-over-a-hole]] pointed at a CI guard.
- ⚠️ **MEASURE THE BLAST RADIUS BEFORE TIGHTENING A PRE-COMMIT GUARD.** "Require a ledger on every
  `done` story" sounds right and would have flagged **204 of 213** — blocking every commit in the
  repo. The narrow rule (explicit unresolved markers, only when no ledger exists) flagged **2**.
  Count first; a guard that reds everything gets disabled, and then it protects nothing.
- ✅ **Fixing it reds real work, and that is the point** — three rows had to be resolved in the same
  change or `pre-commit` would block. Two were §2w drift (13-59 R6's index WAS built — verified in
  `pg_indexes`); two were genuinely undischargeable and took the **13-53 stated-gap close** with a
  reopen trigger.
- **The guard caught ME within minutes:** my first fix to 13-57 edited the *Item* cell instead of the
  *State* cell, and it failed immediately. A guard you cannot trip is not a guard.

### 2ac. ⛔ WHEN I CLOSE A SHARED-DERIVATION FIX, I MUST GREP FOR ITS SIBLINGS — I did not, and it cost a week of divergence
*Added 2026-08-20. This one is mine.*

I adjudicated **12-4** closed on 2026-08-18 after verifying ruling R-E's denominator fix on the
public page. **I never asked where else the defect lived.** It lived in
`survey-analytics.service.ts`'s `getHousehold`, feeding the internal dashboard — so from 12-4's
deploy until 12-5, **the dashboard and the public page published different values for the same
statistic** (31.8% vs 45.5%). §2o already says it: *fix the class, not the cohort in front of you;
when you fix a guard, immediately grep for its siblings.* I verified the instance and closed.

- **The check is one command** and belongs in §2a's verify-myself list: when a fix corrects a
  derivation, `grep` the repo for the ORIGINAL wrong expression, not for the fix. Here:
  `grep -rn "raw_data IS NOT NULL" apps/api/src/services` would have shown `buildWhereFragments`.
- **A second surface is not a second bug — it is the same bug, unfixed.** Closing on one instance
  makes the record say "fixed" while the class is live.

### 2ad. ⭐ AN INHERITED HAND-OFF IS A GATE ITEM — the receiving story can drop it silently
*Added 2026-08-20 on Awwal's instruction, while 12-6 was already in active development.*

§2a1 covers **invisible payment** — a later story quietly discharging an earlier story's residual.
This is the inverse and it is more dangerous: **a later story quietly NOT doing what was handed to
it.** The hand-off was recorded, the receiving story was written, the dev built the ACs, the review
passed — and the inherited item was never in anyone's acceptance criteria, so nothing failed. The
story arrives at adjudication **looking complete**.

- ⛔ **THE ADJUDICATOR IS THE ONLY BACKSTOP.** Dev builds the ACs. Review checks the ACs. An
  inherited residual is, by construction, **not an AC** — so if I do not check it, nobody does.
- ✅ **THE CHECK, at §2a0 cold-start on ANY story:** `grep -i "INHERIT\|HANDED\|carries.*R[0-9]"`
  the story file and its `sprint-status` line. Every hit becomes a row I must resolve before `done`,
  exactly like the story's own residuals.
- **If it did not land, that is an OPEN residual, not a silent deferral.** Either the receiving story
  did it, or it re-opens with a named owner and a reopen trigger. What it must never do is evaporate
  because it was nobody's AC.

**LIVE INSTANCE — 12-6, IN DEVELOPMENT NOW. Do not rule `done` without checking these:**

| # | inherited | what "landed" looks like |
|---|---|---|
| **12-5 R2** | The dashboard reads `FROM submissions` (one row per SUBMISSION), so **~14 people are weighted twice** in every rate. Measured 2026-08-20: submissions-with-answers **286** vs registry_unified-with-answers **272**. | `survey-analytics.service`'s aggregates read `registryUnifiedSource('ru')` — the same canonical read 12-6's own Task 1 already mandates for its NEW rates. ⚠️ **BASELINE CORRECTED 2026-08-21 by the 12-6 dev — the original number was sampled from a tree that ALREADY CONTAINED THE FIX.** `git show HEAD:…/survey-analytics.service.ts \| grep -c 'FROM submissions s'` = **46** at hand-off; the "22" recorded here was the mid-development working tree, i.e. the POST-re-point count. As written, the check declared "R2 did not land" on the exact state where it HAD landed — a backstop with an inverted verdict. **The falsifiable check is: 46 → 6.** Still 46 ⇒ R2 did not land. ⚠️ **RE-CORRECTED 2026-08-21 by the 12-6 adversarial review — the "22" here went stale the same day it was written.** 22 was the count after phase 1 (five aggregates); Awwal then ruled "resolve everything" and phase 2 re-pointed four more plus `getActivationStatus`, taking it to **6**. The number was never updated, so this backstop again carried a target the tree does not match — the SAME class of error the first correction was written to fix, one iteration later. ⭐ **A falsifiable number is a LIVE artefact, not a fact recorded once: it has to be re-measured at the end of the work, not at the moment it is written.** The count is now pinned by a test (`survey-analytics.service.test.ts`, "the submission-grained survivors are an enumerated set"), so the next drift reds instead of misleading. ⭐ A falsifiable number does beat a judgement call, but only if it is measured against the COMMITTED baseline, never against the tree you are standing in. |
| **12-4 R4** | `registry_unified` is DROPPED by `db:push` each deploy, ~27 s before the init runner recreates it, so 13-33-L4's "no window where the view is absent" guarantee is false. | Harmless **only** while nothing at runtime reads the physical VIEW. **If 12-6 makes anything read `registry_unified` rather than the inline source, that window stops being harmless** and R4 must be re-opened as a real one. |

⚠️ **And if R2 DID land, it moves published dashboard figures a second time** — so it needs its
own DISCHARGE-ON-DEPLOY row, predicted from prod with the control reproducing the CURRENT live figure
first. Reproduce the **whole** predicate: `buildWhereFragments` carries **two** conditions
(`s.raw_data IS NOT NULL` **and** `s.respondent_id IS NOT NULL`), and missing the second is what made
adjudication predict 45.7% where the truth was 45.5% — prod holds 2 orphan submissions and one of
them answered the question.

### 2ae. ⭐⭐ RUN THE GUARD THE WRONG WAY ON PURPOSE — three guards this week could not fire

RED-verify (§2b) asks *"would this fail if I deleted the fix?"* That catches a **fix** that does
nothing. It does **not** catch a **guard** that never runs. Three separate ones were found inert
inside a week, each present in the codebase, each green forever:

| guard | why it could not fire | found by |
|---|---|---|
| `analytics-cache-keys` version module (12-6) | built to stop a stale payload — and the one key it was written for **hardcoded past it** (`'analytics:public:insights:v3'`) | reading the key at the call site |
| public k-anonymity floor | dropping `PUBLIC_MIN_N` 10 → **1** left all 15 tests green (SQL-side floor, mocked DB) | RED-verifying the threshold |
| `db-guard` test-DB anti-clobber | read `process.env.DATABASE_URL` **before** `src/db/index.ts` lazily `dotenv.config()`s it, so a bare `pnpm vitest run <file>` saw `undefined`, took its `if (!dbName) return;` branch, and let the suite connect to **`app_db` — the 499k-row dev DB** | a bare local run that happened to fail for an unrelated reason |

⛔ **The db-guard case is the one to internalise, because the class was ALREADY KNOWN.**
`.husky/pre-push` carries a comment describing this exact failure and fixing it — on 2026-07-03,
**for the gate**, by exporting `DATABASE_URL=app_test`. Nobody closed the doorway a developer walks
through fifty times a day: running one file by hand. **A hole patched at one entrance is not
patched.** When a fix is scoped to a caller, list every other caller before calling it done —
[[pattern-census-counts-sites-not-callers]] is the same shape one level up.

⚠️ **It was saved by luck, and the luck is worth naming.** The suite's `afterAll` did issue DELETEs
against the dev DB. Nothing was lost only because `beforeAll` had already failed on a stale column,
so the deletes were scoped to a fresh uuid matching no rows. Had the two schemas agreed, the
2,000-row performance test would have inserted 2,000 respondents into the dev database and the
teardown would have deleted from it. **A near-miss caused by a SECOND defect is not a pass.**

⭐ **THE CHEAP TEST, and it is now mandatory for anything called a guard: invoke it the WRONG way
and check it complains.** Not "does the suite pass" — *does the guard object?* For the db-guard that
is one command with no env exported; it must print `Refusing to run the test suite against non-test
database "app_db"` **and name the database**. A guard that stays silent when abused is a comment.

⚠️ **AND THE FIRST FIX WAS TOO BLUNT — the correction is half the lesson.** Fixing the guard by
calling `dotenv.config()` in `vitest.setup.ts` worked, and broke `photo-processing.service.test`
within the hour: `dotenv.config()` **mutates `process.env` for every API test in the process**, the
test sets `AWS_REGION`, the service resolves `S3_REGION || AWS_REGION || …`, and the root `.env`
defines `S3_REGION` — so the DEV value jumped in front of the test's own. **The guard needed to KNOW
one variable, not INJECT forty.** `dotenv.parse` reads the same file with zero side effects. Ask of
any test-harness change: *what else does this now see that it did not see before?* One test caught
this; the others may merely have been luckier.

### 2af. ⭐⭐ A SUSPICIOUS COUNT IS A PROMPT TO GO AND LOOK — I reasoned from an absence and was wrong

The first dry-run of the 8,234-row farming import returned rows with **no name**. I measured it,
found **5,301 of 8,234 (64%) nameless**, treated that as a property of the data, and escalated a
policy question to Awwal: *import nameless people, or hold them?* He opened the source document and
said the `Full Name` column was right there.

It was. `N_Cares_FInal_Cleaning.csv`, column 3, 6,516 rows — and the consolidation had already read
it correctly into `full_name` (5,301/5,301 populated). Two downstream mistakes lost it, neither of
which errors or warns: the extract emitted only `Surname`/`First name` (which that source does not
have), and `ASSOCIATION_CONFIG` had no key for a single-column name, so even present it would have
been ignored — headers match exactly, and an unmatched header is kept in `raw` and never becomes
canonical.

⛔ **THE EVIDENCE WAS IN MY OWN OUTPUT AND I READ PAST IT.** The "missing" fields were **2,933 for
name AND dob AND town AND NIN** — four unrelated fields agreeing to the exact row. I even wrote, in
the same message, that this "says two source cohorts with different schemas." That is precisely what
it says. The honest next step was `head -1` on the source file: one command, ten seconds.

⭐ **The rule: when a count is too round, too exact, or repeats across unrelated fields, the cause is
almost always STRUCTURAL — a join, a mapping, a schema difference — not a property of the world.
Go and open the source.** Reasoning forward from an absence produces a confident, well-argued, wrong
conclusion, and it wastes the principal's time on a policy question that did not exist. Sibling of
§2t (an empty result is not a negative result) — but sharper, because here the emptiness was
MANUFACTURED BY MY OWN PIPELINE.

⚠️ **The tell I should have trusted: I had treated the same defect the OPPOSITE way an hour earlier.**
My tiler splitter HELD 14 rows partly for missing names, and I was about to import 5,301 nameless
rows. When your own two decisions on one defect contradict each other, at least one rests on a wrong
premise — that inconsistency is a signal to re-examine, not to rationalise.

### 2i. Delegating to sub-agents (forks / Explore)
- Useful for broad multi-file traces (e.g. the send-ownership triangulation used 2 parallel Explore agents). BUT **a sub-agent's self-report can claim edits it never persisted** — always `git status`/diff to confirm side-effects landed; if not, do them yourself. ([[feedback_verify_delegated_agent_disk_state]]) An Explore agent's headline can also contradict its own body (13-34 draft-resume: header said "blast-blocking", body proved the opposite) — read the evidence, not the summary.

---

## 3. Current state (2026-08-31) — READ THIS ONE

**Register 375** (was a five-day flat **327** before the radio campaign), health 200. **No prod SHA
here — D6.** Run the two header commands in §0.

- ✅ **The blast gate is fully discharged: 12-4 → 12-5 → 12-6 all CLOSED on prod**, plus 13-38, 13-51
  and 13-59. Detail in §7r below.
- ⭐ **The public `/insights` page was REBUILT around one rule of Awwal's: publish only what cuts
  across all three taxonomy axes, and carry NO caveats.** This is not a data-quality decision, it is a
  *threat-model* decision, and it inverts the instinct. A caveat protects the writer in a room; on a
  public page in a campaign season it is a screenshot that reads as an admission. Removed:
  `byVerification`, `ageDistribution`, `employmentBreakdown`, `formalInformalRatio`,
  `unemploymentEstimate`, `youthEmploymentRate`, `businessOwnershipRate`, `rateDenominators`. Kept /
  added: headcount, LGA density map, GPI, skills, **Trades by LGA** (`skillsByLga`, floored at
  `PUBLIC_MIN_N` in the QUERY via `HAVING`). ⚠️ Note the tension worth holding: 12-4 and 12-5 existed
  to put the `n` beside every rate, and this removes most of those rates from the public surface. The
  rates are not gone — they moved to the internal dashboards, where a denominator can be explained.
- 🆕 **`Registrations Over Time` was built on 2026-08-29 and REMOVED on 2026-08-31, before it ever met
  real volume** — Awwal's call, and the reasoning is worth keeping because it beat mine. The series
  was *honest*: `created_at` is universal by construction, so it needed no denominator caveat, which
  is exactly why I added it. That was never the risk. The association intake lands **~8,000 people in
  one confirm**, so a cumulative line renders a **vertical cliff** and a reader sees a dump, not a
  registry growing. Honest rows, honest number, misleading picture. Growth lives on **Campaign Watch**
  (`byDay`), behind auth, beside the batch that explains it. Guarded on **both** sides now: the API
  test asserts no `growth`-ish key exists on the payload, the web test asserts no time series renders
  (RED-verified by re-injecting a heading).
- 📻 **Campaign Watch shipped** (`campaign-watch.service.ts` + super-admin page) to measure radio
  impact against the pre-campaign flat baseline of **327**. `CAMPAIGN_START = 2026-08-24`. It reports
  attribution as a **floor, not a rate** — 13 attributed / 8 unattributed at last read — and carries a
  `baselineDrifted` tell so a moved baseline is visible rather than silently absorbed. **The caveat
  LEADS that page** — the exact inverse of the `/insights` rule, and deliberately so: the audience is
  one authenticated operator, not a screenshot.
- ✅ **Rollback now restores the PUBLIC figures** (`fbc8c79`). `registry_unified` gained the one
  documented exception to "consumers do the filtering": `WHERE r.status <> 'rolled_back'`. **A soft
  delete is not a scope choice.** Before this, `rolled_back` was in `PIPELINE_EXCLUDED_STATUSES` — so a
  rollback correctly emptied the marketplace and fraud pipelines but left every retracted row in
  `totalRegistered`, `genderSplit`, `lgasCovered`, `skillsByLga` and the density map. Import 8,000,
  roll back, and the public page still reads 8,000 while those people are invisible to the
  marketplace: the worst of both. **Found before the association import rather than after it, which is
  the only reason it was cheap.**
- 🆕 **`imported_association` config LANDED + 13-2's AC3.3 and AC4.3 CORRECTED** (2026-08-31). AC3.3
  **contradicted the ruling printed at the top of its own story** — Awwal's 2026-07-19 "marketplace =
  INCLUDE with a badge" versus AC3.3's "excluded from marketplace-extraction". Written pre-ruling,
  never revised when the ruling landed. A dev reading top-to-bottom meets the ruling at line 7 and the
  instruction to violate it at line 75, **and the AC wins, because the AC is the checkable artefact.**
- ✅✅ **THE ASSOCIATION CHANNEL IS LIVE, AND THE REGISTRY IS 8,662 PEOPLE (from 327 on 2026-08-23).**
  Two imports confirmed on prod: the **ASNAT tiler pilot** (`01a071c8…`, 56/56) and the **farming
  intake** (`01a072ae…`, **8,222 inserted / 12 matched / 0 failed, 6.1s**). LGA coverage with a
  publishable trade went **2 → 33** — every local government in Oyo.
- ⭐ **They are DESCRIBABLE, not merely counted.** Every imported row now carries a `submissions` row
  with a canonical `skills_possessed` slug, so imported people appear in `genderSplit`, `gpi`,
  `allSkills` and `skillsByLga` — verified by reading them back through `registry_unified` itself.
  Before AC3.4 they would have been a headcount jump with an unmoved `withAnswers` on the same page.
- ⭐ **BOTH IMPORTS WERE PREDICTED BEFORE WRITING AND MATCHED EXACTLY** — headcount, `withAnswers`,
  gender split, GPI, and the k-anonymity cells. The single miss: 8,223 → 8,222, because the local
  dedup check compared phones only while the importer dedups on phone **OR NIN**. A miss that
  explains itself is the useful kind. Shape to copy → [[pattern-predict-then-compare]].
- ⛔ **THE DEFECT OF THE SESSION WAS CAUGHT BY AWWAL, NOT BY ME → §2af.** I reported that 64% of the
  farming batch had no names and asked how to proceed; he opened the source and the `Full Name`
  column was there all along. Read §2af before the next import.
- ⚠️ **GPI is now 0.42** (was 0.71 five days ago), because the agricultural intake is 70.7% male. It
  is honest and it is public, and it is the figure most exposed to a screenshot. Flagged to Awwal
  before each confirm, not after.
- ⚠️ **Still outside the registry:** 1,329 flagged rows + 153 with no usable phone + 14 held tilers.
  That is the next enrichment target, not a defect.

### Residual watch (things that will bite if unread)
| What | State |
|---|---|
| **R-A1** — the sheet's `Date of birth (or Age)` is one column for two facts; ages are dropped | **MEASURED, and it is not immaterial: 36 of 56 clean tiler rows (64%) fail to parse as a date.** The residual asked "count it before choosing a fix" — it has now been counted. |
| **R-A2** — `imported_unverified` gates marketplace + fraud | Deliberate sequencing, **not** a bug to flip. Opening the marketplace before 13-38's badge renders would breach ruling §3 (an unbadged card reads as verified). The **fraud half is independent** and should move sooner. |
| **R-A3** — `/insights` has no gate for imported rows | Working as ruled, logged as a standing hazard: **every association confirm is a public publish.** There is no staging step between dry-run and confirm. |
| **R-A4** — the import makes **9,122 distinct phones** reachable | The import itself is SILENT (verified: no queue/notifier/email import in `import.service.ts`, no DB trigger on a respondents insert, every SMS caller user-initiated). But **phone is not structurally safe the way email is** — email has no column and `metadata.imported_email` is write-only; `respondents.phone_number` is a real indexed E.164 column. Awwal's consent ruling covers being COUNTED; an unsolicited SMS is a different act. Also: 9,563 rows → 9,122 numbers, so a blast reaches **handsets, not people**. |
| **R-A6** — NCARES name ORDER unreliable | 5,301 rows split first-token-as-given-name while the source flags order unreliable. Recoverable, not lost: the verbatim string is in `metadata.import_extra.full_name` on all 8,222 rows. Do NOT "fix" by swapping the rule — that inverts the ones now correct. |
| ~~**R-A1**~~ **DISCHARGED** | Counted, as the residual demanded: 31/56 tiler rows lost an age; **0** farming rows (that source has no DOB column). Material for PAPER intake, immaterial for machine extracts → closed as a sheet-design item. |
| **R-A5** — one Appendix B box spans two slugs | 'Agriculture / Agro-processing' maps to `farming`, so an agro-processor is recorded as a farmer. Mapped on the dominant reading, not because the collision is resolved. Fix is a split box at the next sheet re-print. |
| **12-4 R4** — `registry_unified` view dropped on every deploy | Unchanged, impact still nil (nothing runtime reads the view). Reopen if anything does. |

## 3-old4. Current state (2026-08-18) — superseded by §3 above

**Register 327** (`withAnswers` 272), health 200. **No prod SHA here — that is D6's whole point, and I
wrote one into this line minutes after deleting it from the header.** Prod moves on every docs push;
it had already moved to `143956f` before this paragraph was finished. Run the two header commands.
*(12-4's own deploy SHA is `88a2b74` — that one is static and belongs in the story file, where it is.)*

- ✅ **12-4 CLOSED ON PROD 2026-08-18.** The blast gate's first of three is shipped. **The published
  rates changed materially: `businessOwnershipRate` 32 → 45.5, `unemploymentEstimate` 18.4 → 23.8**,
  and every rate now ships the `n` it was computed from (`{biz 191, unemployment 210, youth 189,
  gpi 270}`). `youthEmploymentRate` correctly held at 47.6. **A published government statistic was
  wrong and is now right** — 81 people who were never asked about business ownership had been sitting
  in its denominator.
- ⭐ **The shape to copy: R1 was discharged by PREDICTION, not by movement.** "Confirm both rates
  move" passes for any change, including a wrong one. Instead the service's own SQL was reproduced
  read-only against prod **through the inline 13-33 read** (§2z(d) — not `submissions`), the control
  reproduced the then-live 32.0 / 18.4 / n=272 / 47.6 **exactly** (proving the source faithful), and it
  predicted 45.5 / 23.8. The deployed page published exactly that. **Two independent methods, one
  answer** — which is §2a2's shape check, applied to a number instead of a log.
- 🆕 **R4 raised, ACCEPTED, no owner.** `migrate-registry-unified-view-init.ts`'s `CREATE OR REPLACE`
  succeeded in **47 ms with no `column set changed` warning** — impossible against the 10-column view
  measured an hour earlier. So **the view was already gone**, its DROP+CREATE fallback has *still*
  never executed, and **13-33-L4's "no window where the view is absent" guarantee is defeated** by an
  upstream `db:push` drop (~27 s window, `ci-cd.yml:1102` → `:1184`). Nothing runtime reads the
  physical view — `registryUnifiedSource()` composes inline, which is the belt that was designed for
  exactly this — so **impact today is nil**. It becomes real the moment anything runtime reads the
  view. ⚠️ Strongly evidenced, **not directly observed**: the decisive check is `to_regclass` returning
  NULL inside that gap, and nothing watches it.
- ⚠️ **Both R2's recorded mechanism and the `:v2` cache praise were WRONG in the prior record**, and
  both were corrected in place rather than deleted (§2w). The outcome was right either way — which is
  precisely why a wrong mechanism survives.
- ✅ **13-38 CLOSED ON PROD 2026-08-18 — deploy `f6b449d`. The marketplace cards are honest now.**
  **29 workers show "Over 10 yrs" with the ★ seasoned cue — 28 of them displayed NOTHING before**, and
  **26 more were being shown as less experienced than they are.** 87 trading names published and
  searchable; 0 old-canon values left; 74 correctly still NULL (no raw answer exists to derive from).
  **Every number was predicted from prod before the run and matched after it** — the shape to copy.
  Rulings: R7 publish (8 of 235, measured *before* the ruling), R4 bind-to-canon, R10 inversion kept.
- ⚠️ **13-38's own R1 evidence line named a route that does not exist** (`/marketplace/profiles`; the
  router has only `/profiles/:id` and `/search`). Its 404 is by design. Corrected in the ledger —
  otherwise the next reader reads a correct 404 as a broken deploy. §2w, again.
- 🔻 **Next on the blast gate: 12-5, then 12-6.** Both `ready-for-dev`, both consume 12-4, and 12-5 is
  the one that puts the `n` on the page beside each chart. **R4's note matters to whoever builds
  them**, and so does this: `rateDenominators` is required on the shared type but **read by no
  component yet** — 12-5 is what makes it load-bearing.
- **Field-day gate is unchanged** and is not blocked by any of this: 13-57/13-59/13-60 are closed;
  what remains is **enumerator accounts** (prod still holds exactly ONE, and it is Awwal's) and the R8
  briefing in hands.

## 3-old3. Current state (2026-08-07) — superseded by §3 above

**Prod `077e129`, health 200. Register 315.** 🆕 **The VPS finally has SWAP (2026-08-07) — it had NONE.** Integrity clean: 0 duplicate NINs, 0 orphaned
submissions, 0 missing reference codes, 0 duplicate-phone pairs, 0 dead-end `wizard_resume` tokens.

- **13-4 CLOSED 2026-08-07 — gate item #2 GREEN.** The enumerator pathway may take real field
  submissions. The prod smoke confirmed AC1b **by log line, not row count**, and **found five
  defects code review had missed** — see §7j.
- **13-53 CLOSED 2026-08-07 — but read HOW, because it is the unusual one.** The NIN-arrival seam
  is fixed and deployed. It ships on 3603 tests, THREE RED-verifies, and a promote log line observed
  from production code — **and on ZERO observations of it running in production.** R2 asked for a
  prod `pm2 logs | grep` and that evidence does not exist: the event needs one of the 20 pending-NIN
  people to re-register via the front page instead of their ladder link, and there have been no
  wizard registrations since deploy. **It was not manufactured** — the smoke's write half refuses
  non-test DBs by design, and breaking a guard to tick a box is worth less than the box. The watch
  moved to **13-44 AC-T4** as a digest PAIR (at-risk cohort size beside promote count), because a
  manual grep was never going to survive months. **REOPEN on any NIN-arrival duplicate pair on prod,
  or the cohort climbing while promotes stay at zero.**
- **13-49, 13-52 also closed.** **13-50, 13-51, 13-54, 13-55 raised** — 13-54 (un-guarded respondent
  write → CI guard, bundling T3's re-runnable negative control) and 13-55 (three promote-to-active
  paths, three rules) both came out of 13-53's review.
- 📄 **ENUMERATOR FIELD BRIEFING — `docs/runbooks/enumerator-field-briefing.md`** (printable). This
  is where 13-4 R8 is discharged: it tells enumerators not to read out a number before one exists,
  where to get it afterwards (Sync Status), and that a shared-handset registrant's OSLRS number is
  the ONLY way back to their record. **Give it to every enumerator before their first field day.**
- **⚠️ ONE NON-CODE ITEM BLOCKS A REAL FIELD DAY (13-4 R8):** an enumerator captured OFFLINE now
  has no reference code at the interview (AC4.4) AND a shared-handset registrant cannot retrieve by
  phone (H2). Closes by FIELD PROCEDURE — the slip is written later from the Sync Status list — and
  by SMS. **It must be in the enumerator briefing before anyone is sent out.**
- 🆕 **2026-08-09 — the enumerator invite dry run found FOUR defects, none in recently-changed code.**
  `user.create` had fired **twice ever, both super-admins, four months earlier**, and a super-admin
  activation is `backOfficeActivation: true`, which **skips the selfie step** — so the one path never
  travelled was the one every field officer takes. (1) Activation redirected staff to `/login`, the
  CITIZEN page, which hard-rejects them — a dead end for 100% of new staff; (2) the selfie preview
  was 3:4 while the capture was 16:9, so what you saw was never what was saved; (3) a failed selfie
  is swallowed → photoless ID card (**13-60**, open); (4) the staff list returned citizens
  (**13-61** — ✅ **DEPLOYED `189bbe2` 2026-08-10 and verified on prod: 124 users, 120 of them
  citizens, staff list now returns 4; an unknown role name returns 0**). 1 and 2 fixed in `22b00eb`.
  ⚠️ **13-61 read `done` / "SHIPPED" for 24 hours while its commit sat UNPUSHED on local `main`** —
  the fix was protecting nobody. See §7m.
  ⚠️ **The camera fix is NOT RED-verified** — proving it needs a real camera producing a real frame.
  Verify on a phone before trusting it.
- 🧾 **13-55 CLOSED 2026-08-09** — five hand-written promotes are now one primitive + one
  audit-writing wrapper + three callers. Its best moment: 13-54's negative control was **re-pointed**
  from the primitive to the wrapper, or it would have mocked a function production no longer calls
  and passed forever. R1 path 3 handed to **13-48** (its AC1 fixture is the missing harness).
- 💾 **SWAP ADDED 2026-08-07 — the box ran on 1967MB RAM with ZERO swap until this date.** 2GB
  `/swapfile`, `dd`-created (**not** `fallocate`, which can leave unwritten extents that `swapon`
  refuses as "holes"), fstab `sw,nofail` so a missing swapfile can never block boot, and persistence
  **proven** by `swapoff` then `swapon -a` rather than assumed. `vm.swappiness=10` in
  `/etc/sysctl.d/99-oslsr-swap.conf` — the default 60 pages out a live-but-idle API process and
  surfaces as latency; swap here is a safety net for burst/leak, **not** routine paging.
  ⚠️ **Swap does not make 2GB into 4GB.** Swap sitting in steady USE rather than held at 0 is the
  signal to RESIZE the droplet, not to add more swap. Detail: [[infra-vps-operational-state]].
- 🔐 **IPv6 bypass in the per-email registration limiter — FIXED `077e129`, verified on prod.** The
  limiter shipped four days earlier keyed its IP fallback on the raw address; an IPv6 client could
  rotate its own low bits for unlimited buckets. Found in the pm2 error log while adding swap, **not
  by a test and not by review.** Advisory, never fatal (`unstable_restarts: 0`), exposure narrow
  (fallback path only, and Nigerian mobile is overwhelmingly IPv4 CGNAT) — but a hole in the control
  we added for a citizen who could not finish registering. **The library's own warning was NOT
  treated as the test — see §2v, it is a `toString()` grep.** 12 tests, RED-verified 4/12, full API
  suite 3615. Prod proof: fresh boot added **zero** new warnings to the baseline of 9.
- **Awwal develops + code-reviews in a SEPARATE CLI and brings the uncommitted tree here.** A clean
  tree means nothing is in flight (§0/§1).

### Next up

✅ **RULED 2026-08-11 — the table below is SUPERSEDED by the two gates in the SCP.** The ordering is not
the adjudication agent's to set: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-09-portfolio-triage.md`
(John/PM) measured **64 open stories across 6 simultaneously-`in-progress` epics**. **Read the SCP
first — §10.14 carries every ruling of 2026-08-11.**

| gate | set |
|---|---|
| **FIELD DAY** | **13-57 · 13-59** (both `ready-for-dev`) + **enumerator accounts** (prod holds exactly ONE active enumerator, and it is Awwal's) + the **R8 briefing** in enumerators' hands. ~~13-60~~ ✅ **DONE — deployed `6876b9f`, verified on prod data 2026-08-14** (`liveness_score` gone, 3 scored == 3 carded). |
| **BLAST / JINGLE** | **12-4 · 12-5 · 12-6** (R-F — the published rates are wrong TODAY, §10.14 R-E) · **13-46** (its Open Decision is RULED — optional + AC10 + non-blocking nudge) · **13-51** (a 9.3% bounce rate is domain reputation spent on a capture defect) |

- **R-A:** Epic 12's honesty tier leads, 11-7 second, **Epics 9 and 10 explicitly PARKED**. The
  load-bearing half is the parking: six `in-progress` epics means zero, and F6 names that state as the
  *generator* of the duplication it was asked to cure.
- **R-F:** 12-4/12-5/12-6 are a **blast gate** — Epic 12 is no longer merely "next", it has a deadline.
- ⚠️ **13-46 gates the JINGLE, not the field day.** It is the largest story on the board (835 lines,
  ~11 ACs); moving it behind the field day is the single biggest schedule win available.
- **13-50** sits outside both gates but carries **92 named people and one written complaint** (§10.2).

**✅ Its §7.4 invalidation risk fired and was DISCHARGED (re-measured 2026-08-10, main `2d9bc1e`):**
13-61 was added *and* closed in the same commit, so it never entered the open set. `done` moved
254 → 255 while **the open count held at exactly 64** (74 not-done/not-superseded − 10 `epic-*`
roll-up rows) and **Epic 13 held at 21**. **The SCP's §2 numbers stand — triage may proceed on them.**

| | |
|---|---|
| **SCP §5.0 — 0** | ⭐ **THE ACTUAL TOP ITEM.** Hand over `admin@oyoskills.com` (MFA reset + rename) and walk the export end to end from it. **This IS the client deliverable**; the account already exists (SCP §8.4), so provisioning cost is zero. |
| **SCP §5.0 — 1** | Run the fraud-detection count query (SCP F7) and prepare one sentence for an **empty Audit Queue**. The queue `INNER JOIN`s on `enumerator_id`, so **the whole public channel is structurally invisible to it** — and that is where the jingle sends everyone. Narrative fix, free now, expensive live. |
| **13-57** | ⭐ Channel parity: a terminal state + `processing_error` on the `public`/`enumerator`/`clerk` failure path. **SCP F5 re-homes this as 9-26's missing half** — 9-26's invariant is directional (respondent ⇒ submission); this is the inverse. ⚠️ **Severity was CORRECTED — nobody was lost** (§2x(b)). |
| **13-46** | Burst readiness / send caps / registration throttle. **Awwal's instinct said this was next; the SCP demotes it to §5.0 item 3** — correct, since the jingle is what makes it urgent and the jingle is not fired yet. |
| **13-59 / 13-60** | Activation leaves something in the person's hands; a failed selfie is not swallowed. Field-day dignity items — enumerators hit these first. |
| **Field-readiness** | 🆕 **Prod holds exactly ONE active enumerator account (`Lawal Kolade`).** No field officers provisioned. Found while verifying 13-61 on 2026-08-10. |
| ~~13-55~~ | ✅ **DONE 2026-08-09.** Five promote implementations → one primitive + one audit-writing wrapper + three callers. *(This row read "NOW THE TOP ITEM" for a day after the story closed — §2w, caught 2026-08-10.)* |
| ~~13-54~~ | ✅ **DONE 2026-08-08.** CI guard live (step 12, above `Lint`, seen executing on a real run) + the negative control now running on every push. |
| ~~13-61~~ | ✅ **DONE + DEPLOYED `189bbe2` 2026-08-10.** Verified on prod data, not on a SHA. |
| **13-50 / 13-51 / 13-52 / 13-42** | Unchanged and still real, but **all four are Pass-1 triage candidates** — do not start one before the SCP ruling. 13-42's AC9 (nobody reads the API's stderr) is the one with a proven cost: the IPv6 bypass sat in that log for 4 days. |
| Operator | SMS list (§7g, minus Sakirat — reachable again). Confirm the Resend plan. R8 briefing. |

## 3-old2. Current state (2026-08-06) — superseded by §3 above

**Prod `0a923b9`, health 200. Register 310.** Integrity clean at last check: 0 duplicate NINs,
0 orphaned submissions, 0 missing reference codes, 0 duplicate identity pairs, 0 dead-end
`wizard_resume` tokens.

- **13-49 is `done`** (registry 145 → 310). R21 — the identity guard that never ran on the public
  wizard — is fixed and **verified live by an observed attach**, not by a deploy. Every residual
  carries a terminal state with an owner and a reopen trigger.
- **`EMAIL_TIER=pro` is now set on prod.** It had never been set, so `EmailBudgetService` enforced
  the FREE tier's 100/day against a Pro account and had already skipped email-digest flushes. The
  tier table is now single-source in `@oslsr/types`; `resolveEmailTier()` defaults to **`pro`**.
- **The ops digest was reframed** — quota reads the meter (not a 100-row page), the daily ladder is
  500/1500, and the Adoption line is split into Register / In-flight / retained.
- **Awwal develops + code-reviews in a SEPARATE CLI and brings the uncommitted tree here for
  adjudication.** A clean tree means nothing is in flight (§0/§1).

### What is genuinely open
| | |
|---|---|
| **13-50** | `/check-registration` mints dead-end links; `wizard_resume` unaudited; **AC4/AC5** phantom drafts. Not launch-gating but degrades WITH engagement. |
| **13-42** | AC7 hotfixed; **AC8** (bounce line misdirects at DKIM/SPF) + **AC9** (the API's stderr has no reader) + AC1-6 remain. |
| **13-4** | Enumerator pathway — Awwal's next. AC1b (shared-phone household) is load-bearing now that R21 proved the guard attaches. |
| **9-27** | `in-progress`, Parts B-F = SMS/WhatsApp, blocked on Termii by Awwal's own call. **Do not close it.** |
| Operator | 12-person SMS list (§7g) + 6 suppressed people. Ladder cohort is **08-05**, denominator **71 not 75** (4 phantoms). |

## 3-old. Current state (2026-08-01) — superseded by §3 above

- **Prod = `0beb8bc`**, health 200. Registry **145 = 82 (with a `submissions` row) + 63 (absorbed, Story
  9-28, no submission)**. `campaign_sends` 1. Pinned public form `019f8ed3` (6 sections, wizard N=10).
- 🗂️ **`wizard_drafts` = 292 rows and it is NOT junk** — 214 carry answers across **37 distinct keys**
  (names, NINs, occupations, skills, household, business). **Expiry EXTENDED 2026-08-01 to 2026-11-30**
  (`UPDATE 292`, 13-49 AC1 done) so nothing is lost while the programme is decided.
- ⚠️ **`registry_unified` is a VIEW (145 rows), NOT a table** — respondent-anchored over
  `respondents ⟕ submissions`. A unified READ, not a unified store. It does **not** see drafts, the 11-2
  import spine, or 13-2 association imports.
- 📊 **Security posture A-** — `docs/security-posture-reassessment-2026-08-01.md` (desk re-score, not a
  pen-test). 25/25 findings Fixed.
- 🧰 **Ops tools:** `gh workflow run prod-verify.yml [-f control_email=…]` (read-only, works when Tailscale
  doesn't) · `pnpm --filter @oslsr/api form:diff <out> <in>` (before ANY re-pin) · `draft:triage`
  (rebuilds the decision workbook).

### (superseded) Current state as of 2026-07-27
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

## 3a. ⭐ THE RECOMMENDATION — read this before deciding anything (2026-08-01)

**Pay Resend Pro ($20) → run 13-49 draft adoption → THEN blast → then 12-4.** The ORDER is the
recommendation; getting it backwards is the expensive mistake.

1. **Resend Pro** gates everything — the ~258 adoption messages AND the blast. Only remaining blocker.
2. **Adopt BEFORE blasting (Story 13-49).** If you blast first you send *"please register"* to **142 people
   whose names, NINs, occupations and skills you already hold** — incompetent to the warmest audience you
   have, and a cold ask converts far worse than *"here is your OSLRS number."* Adoption also shrinks and
   sharpens the cold audience (26 of the drafts turn out to be already registered).
3. **Then blast**, with cohorts REBUILT across all four contact sources (§3c). A/B/C predate everything
   discovered on 2026-08-01.
4. **Then 12-4**, re-measured — the counts change anyway. Sequence it EARLY in Epic 12: with five ingestion
   paths now feeding the registry it owns the `data_status` taxonomy that keeps them coherent, which is
   more foundational than its "dashboard counting" framing suggests.

**Explicitly do NOT now:** touch DMARC (`p=none` cannot hurt deliverability; changing it before launch can
only add filtering risk) · chase Termii (only **7** people registry-wide are email-less; manual SMS
templates exist in 13-11 AC6) · open UDP 41641 (settled — the origin-lock is what earned the A-) · start
the §8 deferred work.

⚠️ **The one cheap risk to close first (13-49 R2):** nobody has confirmed what a returning draft-holder
actually SEES. The authenticated-EDIT path maps head-step fields only; the anonymous RESUME path was never
checked. **Resume ONE real draft** — five minutes, and it decides whether the invitation copy says "finish
in 2 minutes" or "pick up where you left off".

## 3b. RELAUNCH READINESS — the one-screen answer (2026-08-01)

**Nothing technical blocks the relaunch. The only gate is commercial: Resend Pro ($20).**

| Layer | State | Evidence |
|---|---|---|
| Prod | `687c86e`, health 200 | verified this session |
| Security posture | **A- (defensible)** | `docs/security-posture-reassessment-2026-08-01.md`; 25/25 findings Fixed |
| Email deliverability | **sound** — DKIM aligned, SPF aligned via `send.oyoskills.com`, DMARC `p=none` present | live DNS checks 2026-08-01 |
| Send/dedupe | ledger LIVE, proven writing on the real path | `campaign_sends` 0→1 on a control registration |
| Attribution | **works end-to-end** | write carried `utm.ref` + a non-Radio channel; the REAL `getCampaignBreakdown()` returned it |
| Wizard drafts | **unfrozen** — the 7-day `.max(5)` defect is fixed in prod | 13-47; 292 drafts extended to 2026-08-31+ |
| Draft resume across the form change | **safe** | Public Core is a strict SUBSET of Master (0 absent, 0 type changes); all drafts sit at/before `grp_identity`, identical position in both forms |
| E2E signal | trustworthy | 8 consecutive greens + a `repeat_each: 3` burn-in |
| Prod verification | **Tailscale-independent** | `gh workflow run prod-verify.yml [-f control_email=…]`, read-only enforced by Postgres |

**The launch sequence itself is unchanged:** pay Resend Pro → 13-24 Task 5 welcome backfill (~116) →
5-day gap → fire ALL blasts in ONE session, with `docs/runbooks/pre-blast-dry-run.md` as the gate.

**Do these on blast day, in this order:** (1) `prod-verify` for the baseline + ledger liveness + draft
contract; (2) `form:diff` if ANY form has been re-pinned since; (3) the §6 final-gate checklist. Tear down
test rows **BY ID** — never "restore to N", the registry now takes organic traffic.

## 3c. 🗺️ THE DATA MAP — where respondent data ACTUALLY lives (2026-08-01)

⚠️ **Read this before any cohort/blast/backfill query. It exists because I got a cohort answer WRONG by
assuming a table.** I reported "the 63 absorbed respondents are 100% phone-only, zero have email" — because
I joined `respondents → users` only. **52 of them have emails in `magic_link_tokens`.** Awwal knew the list
had emails and pushed back; the historical extract `_bmad-output/scratch/contact-lists-2026-05-24/category-2-cohort-a-hemorrhaged.csv`
proves it (row 1: `OLOWU KAYODE FEMI | olowufemi2020@gmail.com | … | email+phone` — the same person I had
listed as phone-only). The codebase already documented this: `pending-nin.service.ts` says the email is
*"resolved via the most recent `magic_link_tokens` row keyed by respondent_id"*.

### Contact data is spread across FOUR tables — a respondent's email may be in ANY of them

| Source | Table.column | Notes |
|---|---|---|
| Account | `users.email` (via `respondents.user_id`) | only **81 of 145** respondents have one |
| **Magic link** | **`magic_link_tokens.email`** (keyed by `respondent_id`) | **283 rows / 138 distinct emails — THE most complete source** |
| Draft | `wizard_drafts.email` | 292 rows, all with email |
| Send ledger | `campaign_sends.email`, `email_suppressions.email` | outbound history, not a contact source |

**Corrected reachability: 138 of 145 respondents are reachable BY EMAIL from some source; only 7 are truly
email-less** (not 64, and not MEMORY's "26 true phone-only" — that figure is stale). **Any cohort query that
reads only `users.email` will understate email reach by ~57 people and over-order SMS.**

### Live table inventory (rows, 2026-08-01)

`audit_logs` 1692 · `email_events` 414 · **`wizard_drafts` 292** · **`magic_link_tokens` 283** ·
**`respondents` 145** · `daily_productivity_snapshots` 103 · `users` 83 · **`submissions` 82** ·
`marketplace_profiles` 73 · `lgas` 33 · `fraud_thresholds` 27 · `user_backup_codes` 16 ·
`fraud_detections` 10 · `roles` 7 · `email_suppressions` 4 · `system_settings` 2 ·
`questionnaire_files` 2 · `questionnaire_versions` 2 · `campaign_sends` 1 · `productivity_targets` 1 ·
`questionnaire_forms` 1.

### Registry composition

**145 = 82 (with a `submissions` row) + 63 (absorbed, NO submission row).** The 63 are the Story 9-28
"haemorrhaged" cohort pushed straight in. Of them, **12 have a matching `wizard_drafts` row** carrying
24-34 answers — enrichable, and those drafts also SUPPLY AN EMAIL. The other **51** are listed in
`docs/vps-snapshots/the-51-unmatched-2026-08-01.csv` (gitignored PII).

### Prior extractions — the provenance of every cohort number

These predate this session and are how the A/B/C cohorts were built. **Check them before re-deriving a cohort.**

| Artifact | Rows | What it is |
|---|---|---|
| `_bmad-output/scratch/oslrs-cohorts-2026-05-20/cohort-a-completed.csv` | — | Cohort A, completed |
| `…/cohort-a-completed-step4-dropped.csv` | — | A, completed but Step-4 data dropped |
| `…/cohort-b-in-progress.csv` | — | B, in progress |
| **`…/cohort-b-in-progress-with-q-data.csv`** | **119** | **B WITH questionnaire answers — the ancestor of today's 292-draft dataset** |
| `_bmad-output/scratch/contact-lists-2026-05-24/category-1-completed.csv` | — | contactable, completed |
| **`…/category-2-cohort-a-hemorrhaged.csv`** | **62** | **THE 63 — with `email+phone` contactability already computed** |
| `…/category-3-cohort-b-stalled.csv` | — | B, stalled |
| `docs/vps-snapshots/2026-05-31/{respondents,submissions}.csv` | — | full table snapshots |
| `docs/emails-sent-*.csv` | — | send history |

### Pending-NIN ladder — ALREADY BUILT AND ALREADY RUN (Story 9-12)

`pending-nin.service.ts` (`resolveReminderDestination`, 5-branch precedence: email → SMS → supervisor-LGA
task) driven by a daily cron in `reminder.queue.ts`. `respondents.metadata.reminder_state` records the real
cadence: **`sent_2d` → `sent_7d` → `sent_14d` → `transitioned_at`**, each with
`last_destination {type, reason, target}` and `last_dispatch_reason`.

**Measured:** 113 `pending_nin.created` → **78 `promoted` (69% conversion)** → 35
`transitioned_to_nin_unavailable`. **All 35 current pending-NIN rows have EXHAUSTED the 2d/7d/14d ladder,
every one dispatched to `primary_email`.** ⚠️ So a fourth generic NIN reminder is not the lever — these
people have been asked three times. A different framing (OSLRS-number + welcome, or SMS) is needed, or
accept them as permanently pending. Other useful `metadata` keys on these rows: `questionnaire_data_lost`,
`recovery_email_eligible`, `lost_at`, `defer_reason_nin`, `reminder_deferred_at`.

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

## 5. Backlog you'll likely adjudicate next

> 🗂️ **THIS SECTION IS SUPERSEDED AS AN ORDERING — read the SCP first.**
> **`_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-09-portfolio-triage.md`** (John/PM,
> 2026-08-09) is the current authority on what to pick up. It measured **64 open stories across 6
> simultaneously-`in-progress` epics**, and its **§5.0 pre-field checklist precedes every item below**.
> *(This pointer is SCP §7.3 step 4, deliberately deferred until after the `fix/staff-role-filter`
> merge to avoid a collision — the merge landed in `7e64074`, so it is discharged here.)*
>
> Its headline findings, because they change what these rows mean: **F5** — 13-57 is not a launch
> story, it is 9-26's missing half (9-26's invariant is *directional*: respondent ⇒ submission; the
> two orphans are the inverse). **F7** — the Assessor can list/open/read/export the registry, so the
> client deliverable HOLDS; what does not hold is the Audit Queue, which `INNER JOIN`s on
> `enumerator_id` and is therefore **structurally blind to the entire public channel**. **F4** — every
> deferred structural epic sheds symptom stories into Epic 13, which is why Epic 13 has 59.
>
> ✅ **§7.4 fired and was DISCHARGED (re-measured 2026-08-10 at `2d9bc1e`):** 13-61 was added *and*
> closed in one commit, so it never joined the open set — **64 open stories, Epic 13 at 21, unchanged.**
> The SCP's §2 numbers stand.
> ⏳ **Blocked on Awwal's ruling at SCP §6** — which structural track leads and which epics are parked.

**🔥 THE ONE THAT MATTERS — 13-49 (`ready-for-dev`, LAUNCH-SEQUENCED, do BEFORE the blast):** draft-adoption
programme. 292 abandoned drafts hold 37 answer keys / 214 with answers / 203 consented. Cohorts **D1 adopt
142 · D2 enrich 22 (of the 63) · D3 adopt-pending 20 (`nin_unavailable`) · D4 invite 74 · D5 exclude 8
(consent=no) · D6 ignore 26** → **registry 145 → ~307**. AC1 (expiry +3mo) ALREADY DONE. **AC10's
single-record live dry-run is a BLOCKING gate** — this is a write path against citizen records.
Two hazards it documents because both fail SILENTLY: identity lives in `questionnaireResponses`, not the
head-step fields (208 vs 8); and a draft must be resolved to a person by ALL FOUR contact sources (NIN alone
= 28, all four = 48 → 10 duplicate records prevented).

**13-44** (`ready-for-dev`) — EXTENDED 2026-08-01 with **AC-A1 adoption panel** (reads
`metadata.adopted_by='13-49'`, which is also the rollback key) and **AC-A2 audited consent toggle**
(per-respondent, never bulk, REQUIRED reason + `audit_logs` row; the code guard still refuses `consent=no`).
**12-4** — carries a RE-MEASURE warning: its `139 = 76+55+7+1` is stale vs today's `145 = 82+63`, and 13-49
adds an `adopted_from_draft` bucket. No schema change (13-49 writes real rows; the VIEW picks them up).
**13-46** — AC11 DISCHARGED. **13-41 / 13-42 / 13-43 / 13-45(reserved) / 13-48** — as before, post-launch.

### (previous framing) all POST-LAUNCH, non-gating, ready-for-dev
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

## 7c. SECURITY POSTURE — the A- is EARNED but never RECORDED (2026-08-01)

**Question asked:** are we still B+, or did we reach the A- we targeted?

**Measured, not recalled:**
- The only grade statement in the repo is `docs/security-posture-stride-mapping-2026-04-20.md`:
  *"**Grade: B+ (field-ready).** Code-level A-, infrastructure B-, operational C+. **One 30-minute
  Cloudflare setup closes the largest remaining infrastructure gap and raises the grade to A-.**"*
- That named gap is **F-024 — "Origin reachable around Cloudflare"** → `docs/security/findings-register.md`
  records it **✅ Fixed 2026-06-09** (4-layer: de-point `oyotradeministry.com.ng`, nginx, Cloudflare
  proxy, DO firewall origin-lock to ~22 Cloudflare ranges). Story **9-9 subtask #11**; runbook
  `docs/f-024-origin-lock-runbook.md`.
- **All 25 findings in the register are `✅ Fixed`. Zero open, zero accepted-with-risk.**

**So: the assessment's own stated condition for A- has been met — and NOBODY HAS RE-GRADED.** No
re-assessment exists after 2026-06-09. The repo's documented grade is still the April B+, because that
is the only assessment that was ever run.

⚠️ **This is [[§2a1 invisible PAYMENT]] at the level of the whole security posture**: the debt was paid
and the record never updated. It is the exact inverse of the debt problem — and it costs real money,
because "B+" is what a Ministry stakeholder or a future auditor reads today.

✅ **DONE 2026-08-01 — `docs/security-posture-reassessment-2026-08-01.md`, verdict A- (defensible).**
Scored against the SAME April rubric so the two are comparable: code-level **A-** (held — 25/25 findings
Fixed, but raising to A needs a re-test, not a self-review), infrastructure **B- → B+** (F-024 origin-lock
closed + blocking OSV CI gate + email auth verified), operational **C+ → B** (alerting, ops dashboard,
emergency runbook, and today's `prod-verify`). Of April's 10 residuals: the P0 and the P1 both CLOSED, one
P2 closed outright, two partially mitigated, nothing regressed, no new finding opened. The April document
and the findings register both now POINT FORWARD to it, so the stale B+ cannot be quoted by accident.
⚠️ **It is a DESK re-score, not a penetration test** — that distinction is stated in its §0 and must be
preserved when quoting it. An independent black-box re-test is what would justify A; recommended before a
public/press launch, NOT before the email blast.

## 7d. Session 2026-08-01 — the drafts turned out to hold the registry

13. **A resume-safety question became the biggest finding of the launch.** 13-46 AC11 asked "can 291 old
    drafts hydrate into the Public Core?" Answer: yes (Public Core is a strict SUBSET of Master — 0 absent,
    0 type changes) **and nothing is lost** (`...responses` spreads unfiltered into `raw_data`). But the
    investigation exposed that `wizard_drafts` holds **37 answer keys across 214 drafts** — names, NINs,
    occupations, skills, household and business data for people who never pressed submit. **Awwal overruled
    my "invite them to resume" recommendation** and was right: Story 9-28 had already pushed 63 respondents
    straight in, so adopt-and-inform is established practice, and doing nothing meant deleting the data at
    expiry. → Story **13-49**.
14. **I was wrong three times, each corrected by Awwal knowing the data.** (a) I reported the 63 as "100%
    phone-only" — 52 have emails in `magic_link_tokens`; I had joined `respondents→users` only, while
    `pending-nin.service.ts` documents the right source in its own docblock. (b) I matched drafts to people
    by NIN alone (28) instead of all four sources (48) — would have created **10 duplicate registry
    records**. (c) I said the non-adoptable set was 102; it is 82 (D3's 20 CAN be adopted as pending-NIN).
    **The rule this earns: before any cohort or contact query, ENUMERATE the tables that could hold the
    field** — `information_schema.columns WHERE column_name ILIKE '%email%'` takes two seconds. → §3c.
15. **Two premises worth correcting for morale and planning.** Email outreach WORKS: the 9-12 pending-NIN
    ladder measured **113 created → 78 promoted = 69%**, every dispatch to `primary_email`. And **Termii is
    off the critical path** — only **7** people registry-wide are email-less, not 26.
16. **Security posture re-assessed → A-** (`docs/security-posture-reassessment-2026-08-01.md`), the April
    B+ superseded and cross-linked both ways. The A- had been EARNED on 2026-06-09 (F-024) and never
    recorded — §2a1 invisible payment at the scale of the whole posture.
17. **`prod-verify` shipped and had THREE bugs, all found by running it** — a shell-quoting error `bash -n`
    passes, a query matching nothing that went GREEN, and an unexecuted conditional branch. Each one
    sharpened §2a2. **The rule that came out of it: read a run that EXERCISES the branch you care about;
    "the job passed" cannot distinguish TAKEN from SKIPPED.**

## 7e. Session 2026-08-03 — AC14 executed; three defects found by VERIFYING, not by testing

**What shipped:** 13-49 AC14 promotions ran live (**10 promoted, `nin_unavailable` 35 → 25**), the E2E red was
root-caused and fixed, the lost audit row was reconciled, and a chain classifier was added. Prod `d1196a5`.
Registry **145** (120 active / 25 pending-NIN), `from_adoption` still **0** — the D1–D6 adoption has NOT run yet.

**Every finding this session came from reading output, not from a failing test.**

1. **The story's own numbers were wrong, and so were mine.** AC14/R9 predicted *9 promotable + 1 manual review*
   and named `OSL-2026-RRCHDX` (`1589857782`, ten digits) as the carve-out. It promoted cleanly. That value is
   the draft's **head-step** field — an autosave snapshot caught mid-keystroke — while the questionnaire holds
   the full eleven digits. `resolveDraftIdentity` reads questionnaire-first for exactly this reason.
   **Systematic: 14 drafts carry both, in 12 the head string is a strict truncated prefix, and malformed-NIN
   counts are 2 questionnaire-first vs 15 head-first.** Anyone auditing the head field "finds" 13 broken NINs
   that were never broken. → §2k, and [[nin-validation-mod11-invalid]].
2. **The dry-run's `blocked: 0` was an UNEVALUATED zero** — the clash guard lives in the write path, so preview
   never ran it. Checked all 10 NINs against `respondents` independently before applying (0 held by others; 28
   drafts overall DO carry a NIN already in the register). §2a2 in its purest form.
3. **10 promotions, 9 audit rows** — the last of the batch, every time. → the new §2j.

**Then the fix for (3) produced its own lesson.** Verifying the backfill had not corrupted anything, a `lag()`
SQL proxy reported **117 broken links in 1,706 rows**. It was not corruption: 0 self-hash failures, 117
concurrency forks, 0 gaps — and the prod chain has read INVALID since **2026-04-04**, four months before this
story. Now residual **R12** + security residual **#11**. → the new §2k.

**On the backfill decision (Awwal deferred to me, then I reversed my own advice).** I first argued for leaving
the hole documented. Wrong. `audit_logs` is hash-chained and `logActionTx` stamps `createdAt = now()` linking to
the current tail, so **back-dating was never available** — the real choice was a forward-dated entry that says
what it is, or silence. A ledger corrects by adjunct entry, never by erasure. The decisive argument was
Awwal's: leaving it would have forced the standing check to carry *"expect a difference of exactly 1, forever"*
— a permanently skewed baseline that teaches readers to ignore it and silently absorbs the NEXT lost row.

**Process notes.** A backgrounded `git push` piped to `tail` reported **exit 0 while the push had failed** (the
pipe swallowed git's status) — never trust a piped exit code on a gate. Pre-push segfaulted twice
(`0xC0000005`, Pitfall #37) even WITH `VITEST_MAX_THREADS=1`, which is weaker than MEMORY.md claims; it passed
on retry (17m / 7m). Tailscale degraded to unusable mid-session — which is exactly why `prod-verify.yml` exists.

**Still open before the blast:** the D1–D6 adoption itself (R1 live leg), R12 needs a story, and the 13-45 stub.

---

## 7f. Session 2026-08-04 — the programme ran, and live users pushed back

**13-49 IS EXECUTED. Registry 145 → 309** (263 active / 21 pending-NIN); 174 people adopted or enriched
(D1 139 · D2 16 · D3 19); 292 drafts triaged; **0 duplicate NINs, 0 missing reference codes, 9-26 ceiling
still 63**. R1 closed on evidence. Prod `5c9541e`.

**The headline is not the number, it is the 7 duplicate citizen records it cost.** See §2n. Dedupe fires
on the INCOMING submission's NIN, so a no-NIN self-registration matches nothing we hold; 24% of the D3
cohort registered again within 90 minutes because the confirmation told them their pending record was
"active" and invited them to "add what is missing". All 7 resolved per Awwal's per-case ruling — keep
whichever record serves the person, delete the other child-first, and write to them ONLY because the
number changed — and all 7 mailed with copy that names no fault. **The class is mitigated, not closed:
nothing yet stops the next no-NIN self-registration from duplicating an existing record (R13).**

**Corrections I had to make to my own claims, in order:**
1. "D1 is protected by NIN dedupe" — **half true.** Dedupe reads the incoming NIN, not what we hold, so a
   person returning via the no-NIN path bypasses it. Two D1 records duplicated that way.
2. "The confirmation never sent" (D2 verification) — **wrong.** `campaign_sends` records MARKETING
   categories only; the confirmation is transactional. Two designed absences read as one defect because I
   checked the table before checking its specification.
3. "`acf4302` is live" — **it was not.** The OSV gate had blocked it; I asserted a deploy without checking.
4. "Past the API suite, into the web tests" — **misread.** Turbo interleaves package output; the API suite
   had not started.

**Also shipped:** `--only` cohort filter (the ramp could not be sequenced without it — `--max` counts in
sheet order across interleaved cohorts, and hand-doctoring a sheet is one wrong cell from mailing 200
people, because `INVITE_TO_RESUME`/`EXCLUDE_EMPTY` share the CONTACT cohort). Two idempotence guards
(§2o). D3 copy fix (R14). `pool: 'forks'` on Windows after proving `VITEST_MAX_THREADS` was never the
segfault fix — 6 failed pushes on a mitigation that could not work (Pitfall #37b). Two OSV waves:
brace-expansion (an *incomplete-fix* advisory bypassing the patch taken 9 days earlier) and
postcss/ip-address/socket.io-parser, where ip-address needed the HIGHEST of three fixed versions.

**Later the same day — the bleed continued and the first fix was too narrow.** Four MORE collisions formed
within hours; R13's exact name equality caught **none** of them (see §2q). Widened to token-overlap ≥2 +
same phone, verified read-only across all 14 duplicate pairs in the registry with zero false merges. Final
tally **7 pairs**, resolved per-case by Awwal. One (`CB7E9Y`/`3XQ32H`) was two NINs differing by a single
digit — `duplicate_nins = 0` was true the whole time, so no integrity check could have seen it; new
`nin:reconfirm` tool asks the holder instead of guessing. Proposed merging the two no-NIN statuses and
**measured first**: `nin_unavailable` is written by the ladder when it gives up, so merging would have
re-spammed 25 people. Kept separate.

**Still open:** the 70 D4 invitations (never run) · R12's endpoint semantics · new-draft expiry defaults to
2026-09-03, not the extended window · `nin:reconfirm` not yet executed for `3XQ32H` · corrections owed to
Monsurat (`V0NEGT`) and Mukaheel (`3XQ32H`).

**Operational note for the next ramp:** `earliest_draft_expiry` now reads 2026-09-03, not 2026-11-30 —
the 3-month extension applied to the existing 292 and is NOT the default for new drafts.

---

## 7g. ☎️ OPEN OPERATOR ACTIONS — SMS list + the ladder check (2026-08-05)

### A. Verify the 9-12 pending-NIN ladder fires — **2026-08-06, 10:00 WAT**

Cron is `0 9 * * *` (09:00 UTC / 10:00 WAT), milestones **2/7/14 days anchored on `created_at`**.
The D3 cohort was created **2026-08-04 ~06:22 UTC**, so **d2 falls on 2026-08-06** and the sweep at
09:00 UTC that morning is the first firing. Nothing was due on 05-08 — that is correct, not a fault.

**Why this needs checking rather than assuming:** the ladder last fired **2026-06-18**, seven weeks
earlier, simply because nobody was due. Idle is not the same as working, and **R10's whole premise
("adopt them, then just ask for the NIN") depends on it**. Verify with:

```sql
SELECT status, count(*) FILTER (WHERE metadata->'reminder_state' ? 'd2') AS sent_2d, count(*)
FROM respondents WHERE status IN ('pending_nin_capture','nin_unavailable') GROUP BY 1;
```
Expect `sent_2d` to jump from 0 to **~21** after 10:00 WAT on 06-08 — but read that number
carefully, because two things will distort it:

**(1) Count only the D3 cohort, not today's arrivals.** The milestone is anchored on
`created_at` (`reminderEpoch()` → `metadata.reminder_state.deferred_at` if set, else
`row.createdAt`). The ~21 due tomorrow are the rows created **2026-08-04**. Anyone who accepts a
D4 invitation today and registers WITHOUT a NIN becomes `pending_nin_capture` with a `created_at`
of **08-05**, so their d2 falls on **08-07** — correct behaviour, but it means a bigger number
tomorrow is not "more reminders", it is a different cohort leaking in. Scope the check:

```sql
SELECT count(*) FILTER (WHERE metadata->'reminder_state' ? 'sent_2d') AS sent_2d, count(*) AS cohort
FROM respondents
WHERE status IN ('pending_nin_capture','nin_unavailable') AND created_at::date = '2026-08-04';
```

**(2) `OSL-2026-J622R1` will NOT be reminded — it will be RETIRED, and that is not a bug.**
`nin:reconfirm` demoted it to `pending_nin_capture` on 08-05, but demotion does not reset
`created_at`, which is **2026-05-20**. `TRANSITION_DAYS = 30` and the transition is **terminal**,
so the first sweep that sees it will flip it straight to `nin_unavailable` and log
`PENDING_NIN_TRANSITIONED` **without ever sending a reminder**.

That is acceptable *only because* he was already asked directly by `nin:reconfirm` with his own
magic link. But it means **nothing will follow up if he ignores it** — the ladder considers him
retired. If a follow-up is wanted, set `metadata.reminder_state.deferred_at = now()` on that row
to re-anchor his clock; the worker reads that in preference to `created_at`. Same applies to any
future `nin:reconfirm` target whose record is older than 30 days.

If `sent_2d` stays 0 across the whole 08-04 cohort, the repeatable job is not registered — check
`scheduleDailyReminders()` ran at boot.

### B. SMS / phone outreach — 12 people with NO email anywhere

Regenerate any time with `pnpm --filter @oslsr/api sms:outreach-list`. **These 12 have been
invisible to every email campaign this project has ever run** — the blasts, the thank-yous, the
adoption confirmations — silently skipped, no error, no count (Pitfall #48 / §2s). All are
`active` and hold a NIN, so this is a contactability gap, not a data gap.

**Message A — the 4 the programme adopted but could not tell** (they do not know their number):

| # | phone | copy-paste message |
|---|---|---|
| 1 | `+2349125966415` | Hello Fatima. Oyo State Skilled Labour Register: we already had your details on file and have completed your entry. Your registration number is OSL-2026-4RRPPA. Nothing further is needed. |
| 2 | `+2347077663392` | Hello Johnson. Oyo State Skilled Labour Register: we already had your details on file and have completed your entry. Your registration number is OSL-2026-F3DRE5. Nothing further is needed. |
| 3 | `+2347032289867` | Hello Abdulgani. Oyo State Skilled Labour Register: we already had your details on file and have completed your entry. Your registration number is OSL-2026-JN6GGX. Nothing further is needed. |
| 4 | `+2348062131790` | Hello Hikmat. Oyo State Skilled Labour Register: we already had your details on file and have completed your entry. Your registration number is OSL-2026-Q7AS9A. Nothing further is needed. |

**Message B — the 7 who registered themselves but have no email on file** (they may never have
been told their number, since every confirmation goes by email):

| # | phone | copy-paste message |
|---|---|---|
| 5 | `+2348035709104` | Hello Funke. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-ME0X08. Please keep it safe. |
| 6 | `+2349033145626` | Hello Babatunde. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-NBRGPD. Please keep it safe. |
| 7 | `+2347068100376` | Hello Bose. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-Y3Y265. Please keep it safe. |
| 8 | `+2348105592264` | Hello Elizabeth. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-0D55D1. Please keep it safe. |
| 9 | `+2348032770375` | Hello Babatunde. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-1YQC28. Please keep it safe. |
| 10 | `+2348134912471` | Hello Bunkunmi. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-V72Y77. Please keep it safe. |
| 11 | `+2348062711254` | Hello Lukeman. Oyo State Skilled Labour Register: your registration is active. Your registration number is OSL-2026-99Y46Z. Please keep it safe. |

**Message C — Timothy Elujide, `+2347033406538` — needs a CALL, not a text:**

> Hello Timothy. Oyo State Skilled Labour Register: your registration number is OSL-2026-NNJFJS.
> We need to confirm one detail on your record — we will call you shortly. Thank you.

⚠️ **Do NOT ask him to text his NIN back.** He is one of two people who have carried **two
different NINs since May 2026** (`10E5VB`/`J622R1` was the other, already asked by email). His two
values differ and only he can say which is right — but a NIN sent over SMS is a national identity
number in plain text on an insecure channel and in your message history. **Confirm it verbally,
then set it via the super-admin path.** His NIN is deliberately left INTACT until then: clearing
it without a route to replace it would leave him worse off than doing nothing.

---

## 7n. Session 2026-08-11 — one complaint became 92 people, and a published statistic was wrong

**No code shipped by adjudication today. The output was measurement and six rulings** — which is the
right output when the board is 64 stories and the question is what to build. Everything is in
**SCP §10** (§10.1–§10.14); this is the arc, not the detail.

### A citizen's complaint was the tip, not the problem

`raheemjamiu166@gmail.com` wrote in saying he could not register. **He had been registered since
19 May** — `OSL-2026-F91B8A`, active, NIN on file. What he could not do was *find that out*: three
magic links in three days, two never opened.

Then the measurement that mattered: **192 of 242 links issued in 30 days were never used (79%), across
155 people, of whom 92 are ALREADY REGISTERED, and 54 asked more than once.** Asking twice is what
someone does when the first answer never came. **13-50 stopped being a tidy-up and became 92 named
people.** And Juliet Odiba (§11.2, PM) is the same case *without* the complaint — registered, never
told her number, and no reason to ever write in.

- **The reply was decoupled from the fix.** Drafted the same hour (SCP §10.8), not queued behind
  13-50. *Coupling a courtesy to a release is [[pattern-ship-a-fix-that-never-fires]] pointed at a
  person.*
- **63 people could not be matched to a registry record. That is "unmatched", NOT "unregistered"** —
  and §11.2 then proved the method blind by finding two registered people it had missed. Same lesson
  as §2x(b), earned twice in one day.

### A published government statistic is wrong, and nothing was red

Chasing *"should association imports be included in insights rates?"* into the SQL found the live
defect in §2z(a): the unemployment estimate reads **18.4%** where the answered set gives **23.9%**.
**It has nothing to do with association imports** — it is broken today, and 13-2 would only worsen it.

> **Awwal's framing was right and is worth keeping: the disparity (23%/29% relative) does not justify
> a hotfix into a muddled tree — but the BLAST is when the figures acquire an audience.** Hence R-F.

### Six rulings, and the one I put wrongly

All open decisions were enumerated **by grep, not memory**, and put in one pass. **R-A** Epic 12 leads,
five epics parked · **R-B** 13-46 stays optional (AC10 + non-blocking nudge) · **R-C** split the
residual guard into its own turbo task (closes 13-45 R2) · **R-E** rate denominators are answer-based
· **R-F** 12-4/12-5/12-6 gate the blast.

⛔ **I put 13-2 forward as an open decision. It was ruled on 2026-07-20 and its status line reads
`ready-for-dev`.** I had read the 2026-07-19 changelog entry — the *escalation* — and not the story's
head. Worse, the option I drafted said *"exclude from marketplace"* when Awwal had ruled the
**opposite** (include, with a `[Association] — confirmed member` badge; 13-38/13-58 depend on it), so
accepting it would have reversed a live ruling. **Caught only because I opened the story before
writing the acceptance.** A changelog entry is a record of a decision; the story head is the decision.
Same family as §2w, and the reason the §2a checklist says read the artefact.

### The launch picture that came out of it

| gate | set |
|---|---|
| **FIELD DAY** | 13-57 · 13-59 · 13-60 · enumerator accounts · R8 briefing |
| **BLAST** | 12-4 · 12-5 · 12-6 (R-F) · 13-46 · 13-51 |

**13-46 gates the JINGLE, not the field day** — the largest story on the board (835 lines) moved off
the critical path, which was the single biggest schedule win of the session. **Two independent reasons
now gate the blast on honesty work**, reached from opposite directions: wrong published rates (R-E)
and a **9.3% bounce rate** on `draft-invite` versus ~2% elsewhere, which is domain reputation being
spent on the capture defect in §10.10.

### Also measured, so it is not re-derived

Registry **clean** — 0 duplicate NIN/phone/name/reference-code, including **normalised** phone (the
check that actually finds duplicates). **Pending-NIN cohort 20 → 36**: 13-53's reopen condition has
fired. Re-engagement conversion **≥15 of 75 (~20%)**, stated as a floor because it uses the method
§11.2 disproved. **`clicked = 0` across all 987 sends** — there is no engagement funnel at all (13-44).

## 7s. Session 2026-09-01 → 09-03 — the 8,000-row blocker closed, and a guard that was guarding nothing

### The import gap, and why "copy the fields across" would have failed twice
The importer wrote a `respondents` row and no `submissions` row. Not a crash, not a warning — it
produced people who are **counted but not describable**: `totalRegistered` and the LGA map are
respondent-anchored and included them, while `genderSplit`, `gpi`, `allSkills` and `skillsByLga` read
`raw_data` and could not see them. ~8,000 rows would have moved the public headline **377 → ~9,880**
while `withAnswers` stayed **322**, on the same page.

The data was never lost — it sat on `metadata.import_extra`, where no aggregate reads. But the
obvious fix (copy it into `raw_data`) would have produced a **second** silent loss:
- **`gender`**: sheets carry `M`/`F`; every public query matches `'male'`/`'female'`. Copied through,
  all 9,563 would be counted by neither side of the parity index.
- **`skills_possessed`**: `selectMultipleUnnest` splits a bare string **on spaces**, so `"Crop
  Farming"` unnests to `Crop` and `Farming` — two tokens that are not slugs and cluster under nothing.

⭐ **Transferable:** "the value is present" and "the value is read" are different claims. The registry's
most expensive defects all live in the gap between them.

### The pilot earned its keep by being verified with the REAL parser
The 56-row tiler CLEAN workbook was checked by running the **actual** xlsx parser and the **actual**
mapping over it, not a re-implementation. That surfaced `profession:[unmapped]` on all 56 — and
extending the check to the real farming file gave **0 of 9,563**. A splitter that agrees with itself
proves nothing. ⚠️ My own harness failed the same way twice more and was caught only by controls: the
slug regex matched `slug:` when the taxonomy's key is `name:` (returning `clean: 0/70` — it failed
CLOSED, which is the only reason it was obvious), and a fuzzy-match pass proposed `fine_art` for
"Painting". Nearest-neighbour string distance is how "three clusters of one" gets minted.

### The guard that was guarding nothing → §2ae
`db-guard` let a bare `pnpm vitest run <file>` connect to the **499k-row dev database**, and its
`afterAll` issued DELETEs there. The full write-up, including the too-blunt first fix that broke
`photo-processing.service.test`, is **§2ae** — read that, not this paragraph.

The schema drift that exposed it is also resolved: `app_db` was behind by **29 columns including two
entire tables**, and carried one column the schema had dropped. Both DBs are now **384 columns, zero
difference**. ⚠️ The drop was not harmless — `users.liveness_score` held **179 non-null values**,
exported to `Downloads/farming-consolidation/app_db-liveness_score-backup.json` first. The backup was
**needed, not precautionary**: the column is gone and those values exist only there.

### Two latent bugs in an existing suite, found by writing the feature
1. The integration teardown deleted respondents while `submissions.respondent_id` is a plain FK with
   **no cascade** — it would now raise a violation and leave the whole fixture behind.
2. The fixture email used `actorId.slice(0, 8)`, but **uuidv7's first 8 hex chars are the top 32 bits
   of a 48-bit millisecond timestamp — they only change every ~65 seconds.** Two runs inside that
   window collided on `users_email_unique`, and the suite failed at `beforeAll` with all 12 tests
   **SKIPPED** — which reads like broken infrastructure, not a fixture bug.

⭐ **Transferable:** a suite that fails at `beforeAll` reports *skipped*, not *failed*. Skipped is the
most ignorable word in a test report. Check the FILE COUNT and the skip count, not just the pass count.

### The vitest-memory fix that FAILED — recorded so it is not retried
A RAM-adaptive worker cap (1 worker below 3 GB free) was implemented, measured on the full suite, and
**reverted**: it doubled the runtime (1,290s vs 604s) and still failed, dragging a second test over
its budget. The profile says why — `environment` (jsdom instantiated 274×) is **570s of 1,290s**, and
worker count does not touch it. The only lever that would is a lighter DOM (happy-dom), which changes
what the suite proves and belongs in its own story. **A gate must not be made cheaper by making it
weaker.** What shipped instead: `route-resolution`'s budget 15s → 30s, its third raise, with the
measurements in the test comment so the next reader does not re-run the failed experiment.

⚠️ **§11's file-count tell is now 0-for-4 and should be RETIRED, not corrected.** Both pushes collected
all 274 files; the contended one collected the full set and failed a test anyway. It actively misled
me — I cited "274 collected, so full collection" while reporting a contention-damaged run. **Free RAM
is the variable; file count tells you nothing.**

⚠️ **The exit-code trap fired SIX times this session** ([[feedback-never-pipe-a-push-to-tail]]), incl.
twice reported to Awwal as success before the remote was checked. The file-capture recipe
(`{ git push … > log 2>&1; echo $? > exit; }`) catches it; **the notification never does.** Verify a
push by `git ls-remote origin main` against `git rev-parse HEAD`. Always.

## 7t. Session 2026-09-04/05 — the channel opened, and the principal caught the defect

### 8,662 people, and they are describable
Two imports confirmed on prod: the tiler pilot (56/56) and the farming intake (**8,222 inserted / 12
matched / 0 failed in 6.1s**). Registry **440 → 8,662**; LGA coverage with a publishable trade
**2 → 33**. Every row carries a `submissions` row with a canonical slug, so these people are in the
skills map rather than being an inert headcount — the difference AC3.4 existed to make.

Both imports were **predicted before writing and matched exactly**. The one miss (8,223 → 8,222) was
a local dedup check comparing phones while the importer dedups on phone **OR NIN**. Predicting first
is what makes a match evidence; "the number moved" would have passed for a wrong number too.

### The defect I missed, and Awwal did not → §2af
The first farming dry-run returned nameless rows. I measured 64% missing, treated it as a property of
the data, and escalated a policy question: import nameless people, or hold them? Awwal opened the
source document and the `Full Name` column was there — 6,516 rows, already read correctly into
`full_name` by the consolidation. My extract emitted the wrong columns and the config had no key for
a single-column name.

**The evidence was in my own output.** The missing fields were 2,933 for name AND dob AND town AND
NIN — four unrelated fields agreeing to the exact row — and I wrote in the same breath that this
meant "two source cohorts with different schemas", then reasoned from the absence anyway. A count
that structural is a prompt to open the file, not to theorise. Full write-up in §2af, including the
tell I ignored: I had held 14 tiler rows for missing names an hour earlier, so my two decisions on
one defect contradicted each other.

### A safety guard that was guarding nothing → §2ae
`db-guard` let a bare `pnpm vitest run <file>` connect to the **499k-row dev database**, and its
`afterAll` issued DELETEs there. Nothing was lost only because a stale schema had already failed
`beforeAll` — luck, not design. The class was documented in `.husky/pre-push` and fixed there on
2026-07-03 **for the gate**; nobody closed the doorway a developer uses fifty times a day. My first
fix was too blunt (`dotenv.config()` injected forty dev variables into every test and broke
`photo-processing`), which is half the lesson.

### The suite's two pathological hotspots
`a3-eslint-policy` built a new ESLint **per test** (three full plugin-graph loads for three one-line
lints); `respondent-promotion-census` walked the source tree **five times**, ~1,980 file reads for an
immutable snapshot. Fixed: 9,733ms → 748ms on the census (13x), and tests 2–3 of the ESLint file went
from ~6.8s each to ~46ms combined. **Only after the waste was gone** was a budget raise honest
(30s → 90s on the irreducible single config load).

⚠️ **Earlier in the session I reported this sweep as "exhausted, two files, both fixed." That was
premature** — the ESLint fix cut three loads to one but left the remaining one still able to blow a
30s budget, and it cost another push before I saw it. The ordering was right; the claim of completion
was not.

### Also this session
`app_db`/`app_test` schema drift resolved (**29 columns and two entire tables** behind; both now 384,
zero difference; `users.liveness_score` held 179 values and was backed up before the push dropped it).
Five bounded security overrides for newly-disclosed advisories on unchanged deps. The Super Admin
mobile drawer could not scroll — `SheetContent` is a fixed flex column and the nav had neither
`flex-1` nor `overflow-y-auto`; swept all five drawers and found a second, weaker instance.

## 7r. Session 2026-08-24 → 08-31 — the page got smaller on purpose, and a measurement stopped an import

### The threat model changed what "honest" means
The instinct all session was to **caveat** the public figures: mark the imported rows, band the thin
cells, footnote the denominators. Awwal overruled it, and the reasoning holds: *"where a journalist
can just pick figures and put the government in a bad light we have to be really careful... anybody
who screenshots the /insights page with all the caveats can push a negative narrative and it will turn
to a storm needing multiple PR to stem the tide especially in a campaign season."*

The resolution was not to publish less honestly — it was to **publish only the figures that need no
caveat**, i.e. those that cut across all three axes of the data-status taxonomy. A figure requiring a
footnote to be read correctly is a figure that will be read incorrectly once it leaves the page. The
caveats did not disappear; they moved to the final reports, where the reader can ask a question.

⭐ **Transferable:** "add a caveat" and "publish an uncaveated subset" are both honest. Which one is
*safe* depends on whether the reader can ask a follow-up question. On a public page, they cannot.

### Two production failures that every green gate missed
1. **A stale browser bundle** — `/insights` showed "Page Error" after a shape change. CI green, health
   200, full suite green. A hard refresh fixed it. Shipped an nginx `Cache-Control: no-cache` on the
   SPA shell so the shell revalidates.
2. **A stale Redis payload** — the deploy corrected a number and the cache kept serving the old one.
   The module built in 12-6 to prevent exactly this existed, and the public-insights key **had been
   hardcoded past it** (`'analytics:public:insights:v3'`).

⭐ **Transferable:** neither was visible to CI, health checks, or the test suite. **Only reading the
live endpoint found either.** Verify the deploy's *output*, not its SHA. And a guard nobody is forced
to use is a convention — both now have tests with teeth.

### The measurement that stopped an import
Awwal's instruction was unambiguous: *"the more than 8000 rows are going in regardless."* The work
was to make that safe, not to argue with it. Two prerequisites were built (rollback honesty, the
`imported_association` config), and then the **56-row tiler pilot was verified by running the real
xlsx parser and the real mapping** rather than a re-implementation — and it surfaced what a
self-consistent check never would:

- `profession:[unmapped]` on **all 56** rows. Cause: `normaliseTrade` maps against `TRADE_VOCABULARY`
  — **45 keys, 13 canonical targets**, a Story-11-2-era artefact — while the canonical vocabulary is
  the **192-slug `SKILL_TAXONOMY`**. Extended to the real farming file: **0 of 9,563 rows map.**
- The import service writes **`respondents` only — no `submissions` row.** 13-2's AC3.4 requires both,
  and lists the Trade→taxonomy reconciliation as still-open. It is genuinely unbuilt.

**Consequence, stated plainly:** importing today lands ~8,000 people who are counted in
`totalRegistered` and the LGA map but **contribute nothing to skills or gender**, because those live
in `raw_data`. The public headline goes **375 → ~9,880 in one step** while `withAnswers` stays ~375.
The consolidation work already resolved canonical `skill_slug` values for every row — that is the
asset the current import path would throw away.

⭐ **Transferable, and it is [[pattern-a-fix-that-never-fires]] wearing a new hat:** I twice nearly
validated the pilot with logic I had written myself. The splitter agreed with itself both times. The
finding only appeared when the **actual deployed parser** ran over the **actual file**. A verification
that shares an author with the thing it verifies is a restatement.

⚠️ **Also caught, in my own harness:** the first split returned `clean: 0 / 70` because the slug regex
matched `slug:` when the taxonomy's key is `name:`. It failed **closed** — every row held. Had it
failed *open*, 70 unvalidated rows would have been declared clean. Worth noticing which way a broken
check fails; a guard added since throws if the parsed taxonomy has fewer than 150 entries.

### The three options put to Awwal (undecided at session end)
1. **Import now, accept answerless rows.** Headline moves; skills and gender do not. Reversible for 14
   days, and rollback now genuinely restores the public figures. Re-import later means a rollback
   first, or duplicate-key pain.
2. **Build AC3.4 first** (write the `submissions` row with `raw_data.skills_possessed` from the
   already-resolved canonical slugs; re-point `normaliseTrade` at `SKILL_TAXONOMY`), then import once,
   completely. Costs a story; the 8,000 rows then land with their full analytic value.
3. **Import now for the auditor's headcount, then backfill submissions.** Gets the number in front of
   the auditor immediately, but a backfill over 8,000 live rows is the [[pattern-batch-job-races-live-users]]
   shape, which has already cost this project once.

**Recommendation on file: option 2.** The rows are going in regardless — that is settled and correct.
The question is whether they go in *once, whole*, or twice. The gap is one story, and it is the
difference between 8,000 people in the registry and 8,000 people in the skills map.

### Deliverables produced this session (outside the repo — PII)
`Downloads/farming-consolidation/`: `tilers-asnat-CLEAN.xlsx` (**56 rows**, uploadable as-is, exactly
the twelve frozen sheet headers so the pilot tests the *canonical* mapping rather than a
transcription-variant fallback) and `tilers-asnat-HELD.xlsx` (**14 rows**, each carrying **every**
rule it failed rather than just the first, plus the original WhatsApp `raw_message`). **`S/N` is the
stable join key across both books**, so Awwal's manual corrections reconcile without matching on names.

## 7m. Session 2026-08-10 — the fix that was "shipped" and wasn't, and a command that ate the repo

**One deploy, two self-inflicted incidents, and the doc caught failing its own §2w check.**

### 13-61 was `done` for 24 hours while protecting nobody

The staff-list hotfix was committed, merged and marked `done` / "SHIPPED" in the story file,
`sprint-status.yaml` **and** §3 of this doc — and the commit sat **unpushed on local `main`**. Prod was
`0ab4574`; a Super Admin page was still enumerating citizens by name the whole time. The header of this
doc said *"`main` ahead by docs-only commits"* while `0ed20c9` was three source files and a test.

**The vocabulary is the fix: committed → pushed → CI-green → deployed → verified. `done` requires the
last two.** Both times the word "shipped" drifted, it meant *committed*. Now deployed at `189bbe2` and
verified against production rows — 124 users, 120 of them citizens, the staff list returns **4**, an
unknown role name returns **0**. Not a SHA; the behaviour.

### ⛔ `robocopy /MIR` deleted 1,574 tracked files out of the main working tree

`git worktree remove` deregistered both worktrees but could not delete their directories
(`Directory not empty`, `Filename too long`). Reaching for `robocopy <empty> <target> /MIR` to force it
was the mistake: **`/MIR` follows NTFS junctions by default, and pnpm links workspace `node_modules`
with junctions.** It walked out of the worktree into `C:\Users\DELL\Desktop\oslrs` and mirror-deleted
1,574 tracked files plus every `node_modules` — *while the pre-push suite was running against them.*

The tell was misleading in the most expensive way: the suite reported **31 test files failing to load
`@aws-sdk/client-s3`**, which reads exactly like a dependency problem. It was the deletion in progress.

- **Recovery was cheap only because everything was committed:** `git restore .` returned all 1,574,
  then `pnpm install`. **Check the un-restorable set explicitly**: root `.env` survived (this repo has
  ONE, `vite.config.ts` sets `envDir: '../../'`), and the DBs live in the named volume
  `docker_postgres_data_dev` **outside** the repo — dev DB still 499,305 respondents, `app_test` intact.
- **Rule: never `/MIR` without `/XJ` anywhere near this repo.** Use `Remove-Item -LiteralPath -Recurse
  -Force`. → [[pitfall-robocopy-mir-follows-pnpm-junctions]]
- **Kill it the instant a build starts failing on missing packages** — damage is proportional to runtime.

### A push that "succeeded" with exit 0 had actually failed

`git push origin main | tail -40` returns **tail's** exit status. The harness reported *exit code 0*
and it was relayed to Awwal as a success; the push had died on `husky - pre-push script failed`.
**Verify a push by its effect — `git status -sb` must show no `[ahead N]` — never by its exit code.**
→ [[feedback-never-pipe-a-push-to-tail]]. Same family as §2a2: a green that measured the wrong thing.

### The one flake that was genuinely a flake — and was still chased

Two web files failed the gate: `a3-eslint-policy` (timeout 30s) and `route-resolution.integration`
(timeout 10s). Both are **timeouts, never assertion failures**, and `route-resolution` touches
`/login`, which `9cd6a18` had deliberately changed — so it was not waved off.
**Run in isolation: 59 tests, 18.4s — a3 took 3.9s of its 30s, route-resolution 5.6s of its 10s.**
Neither is near its limit when not fighting for CPU. Cause was Pitfall #37 contention on a
**cold `node_modules` I had just recreated** (`import 302s`, `environment 534s` of a 659s run). Warm
re-run: **api 3683 / web 2854 / utils 126 / testing 64, all green.** *Intermittent ≠ environmental —
but "I proved it in isolation" is what makes it environmental, not the word "flake".*

### 🐞 FOUND IN PASSING — 13-45's residual guard cannot fire locally on the commits it polices

`lint-story-residuals.ts` runs inside `@oslsr/api:lint`. The root `turbo.json` declares **no `inputs`
for `lint`**, so turbo hashes the *package* directory — and `_bmad-output/` lives at the **repo root,
outside `apps/api`**. Editing a story therefore does not invalidate the cache.

**Measured, not inferred:** two consecutive pre-commit runs, with a story file edited in between,
replayed the **identical hash `5ee15721e9295a66`** — `FULL TURBO`, 203ms then 119ms. The guard's
verdict was computed against a version of the story that no longer existed.

- **A guard whose cache key excludes the artefact it inspects is decorative on exactly the commits it
  exists to police** — story-only commits. It still runs truly on a cold CI runner, which is why this
  has never been visible.
- Same family as **Pitfall #45** (a step ordered below a broader one never executes) and **#47** (a
  cached task replays an older result). The new instance: **the cache key omits the input.**
- **Run it directly whenever you touch a story ledger:**
  `pnpm --filter @oslsr/api exec tsx scripts/lint-story-residuals.ts` — 316 stories, exit 0.
- Fix is small but has a cost worth deciding rather than assuming: give `lint` an `inputs` list
  including `$TURBO_ROOT$/_bmad-output/**`, which correctly invalidates the guard **and** re-runs
  eslint over `apps/api` on every story edit. **Awwal's call — raised, not taken.**
- ⚠️ Note the compounding: the guard also cannot see R1's `RE-HOMED` state (it matches the literal
  token `OPEN`), so this residual is currently outside the mechanism twice over.

### Housekeeping that was actually load-bearing

- **ONE worktree now.** `wt-staff` (merged, clean) and `wt-ratelimit` are gone. `wt-ratelimit` looked
  live — three *staged* files — but was at an ancestor of `main` carrying the **pre-fix** limiter with
  the IPv6 bypass still in it. Strictly superseded; diff parked in scratch. Awwal's standing rule:
  **main is the tree; branch only on need.**
- **This doc failed its own §2w check.** "Next up" still read *"13-55 — NOW THE TOP ITEM"* eighteen
  lines below §3 saying 13-55 was CLOSED. Fixed, and the row now records that it drifted.
- **Two §8 triggers have fired and nobody noticed** — which is itself the invisible-debt failure §2a0
  exists to catch, happening *inside* §8. **D6** (drop the self-staling prod SHA): wrong on 07-26,
  07-30 and again today — and it was gated behind D5 for no reason, since deleting a line needs no
  script. **D8** (cap §7 at two sessions): §7 now holds **12 entries and 135KB**, well past its ~10
  trigger. Both marked in §8.

## 7l. Session 2026-08-08 — 13-54 shipped, and a lesson about records

**13-54 closed the day it was scaffolded.** The CI guard is live and the negative control now runs on
every push rather than existing as a sentence describing something a person did once. R1 was
discharged by **reading the step list** — `12 success Respondent-write drift guard` sitting above
`13 success Lint` — not by the job badge, because §2a2's point is that a green job cannot distinguish
TAKEN from SKIPPED.

**The adjudication found two things the review had not.**

1. **Known limit #6 — the allowlist is PER-FILE, so this guard would not have caught R21 or 13-53.**
   Both created respondents inside files that are now allow-listed. What it prevents is a FIFTH file
   becoming an ingestion path — genuinely the historical pattern — but that boundary was unstated,
   and it is the same species of overclaim D4 exists to prevent. **This is why 13-55 moved to the top
   of the queue:** a guard cannot close it; fewer sanctioned creators can.
2. **A pre-existing test race, found by RUNNING the suite instead of reading its recorded result.**
   `user.profile.test.ts:264` read the globally-latest `user.profile_updated` audit row with no actor
   filter, raced by two other files that PATCH the same endpoint. Chased to a deterministic 1-in-2
   repro rather than waved off as a flake. The test existed to show that an unscoped read is wrong and
   was itself vulnerable to that bug from a third party.

**⚠️ The durable lesson is §2w, and it cost four separate corrections in one day** — a stale suite
figure, a board flip that silently no-op'd (mine), a title that promised more than the guard checked,
and a `#6` cross-reference that resolved to a different item. **A record about the work is not the
work.** Read the artifact back.

**On the two-CLI workflow.** Three times today the dev CLI reported state that did not match `HEAD` —
"there is no #6" (it was committed), the 3646 figure (stale), and "never run on a Linux runner" (R1
was already discharged). Not carelessness: it reports from its own working memory while adjudication
keeps pushing commits it cannot see. **Cheap fix, worth adopting: the handoff should carry a SHA
("developed and code-reviewed at `<sha>`, tree clean"), and a returning dev should `git fetch` before
commenting on a file's contents.** That single convention kills the whole class.

## 7k. Session 2026-08-07 (late) — 13-53 closed on a stated gap; a defect found by reading a log

Three things, and the order matters — the third was found only because of the second.

**1. 13-53 closed `done`, with R2 handed over rather than performed.** R2 wanted a prod
`pm2 logs | grep` of `promoted_existing_identity_on_nin_arrival`. That evidence does not exist: the
promote needs one of the 20 pending-NIN people to re-register through the front page instead of
their ladder link, and there had been **zero wizard registrations since deploy** — the only finder
events in the log predated it by twelve hours. **It was not manufactured**: the smoke's write half
refuses non-test DBs by design, and breaking a guard to satisfy its own checkbox is worth less than
the checkbox. So the watch moved to **13-44 AC-T4** as a digest PAIR (at-risk cohort size beside
promote count), because a manual grep was never going to survive months of waiting. The story, the
commit, and §3 all say in plain words that this shipped with **no observation of it running in
production**. New pattern: [[pattern-verification-that-cannot-run-yet]].

**2. Swap added to the VPS** — see §3. It had none, on a 2GB box, with a radio jingle pending.

**3. ⭐ And adding swap is how the IPv6 bypass was found.** Checking whether services survived the
swap work meant reading `pm2 logs`, and the error log held nine copies of `ERR_ERL_KEY_GEN_IPV6`
pointing at `registration-rate-limit.ts` — **my own code, shipped four days earlier in `16b02ee`.**
The per-email limiter's IP fallback keyed the raw address, so an IPv6 client could rotate its own
low bits for unlimited buckets.

**Nothing was watching that log.** It was not in the digest, no test covered it, the adversarial
review had not caught it, and every boot re-logged it into a file nobody opened. It surfaced as a
side effect of an unrelated ops task — which is the uncomfortable part, and the reason it is written
down here: *the finding was luck, and luck is not a control.*

- The fix and its discipline are §2v: **the library's warning is a `toString()` grep and silencing
  it proves nothing**; the proof is a behavioural test in both directions, RED-verified 4/12.
- Prod verification used a **pre-deploy baseline** (9 warnings, 36 log lines) so the claim could be
  "a fresh boot added ZERO", not the weaker "the log looks fine".
- Traced to the **call site** in the deployed source, not the import — §2b's whole point.

✅ **RAISED, not left as a note: 13-42 AC9 + Task 5.** The digest watches metrics, not the API's own
stderr — so an error the process printed on **every single boot** went unread for four days, and it
was a bypass of a public-endpoint control. AC9 is specced to 13-42's own discipline rather than as a
generic log grep: capture at the SOURCE (`console.error`/`console.warn` + `process.on('warning')`,
because the offender was a **dependency's** `console.error` that pino never sees), forward to the
original so the watch cannot become the outage, install before other imports, collapse to a **stable
signature** (nine copies = one signal), and yellow only on a signature outside a **reasoned**
allowlist. ⚠️ Its own worst failure mode is called out in the AC: **an unstable signature mints a
"new" error every boot, the digest yellows daily, and the operator stops reading it** — the exact
alarm-fatigue death 13-42's Dev Notes exist to prevent. RED-verify uses the real historical trigger.

## 7j. Session 2026-08-07 — the smoke earned its keep, six times over

**13-4 closed, gate item #2 GREEN.** But the value was not the confirmation — it was that a smoke of
six synthetic submissions **found five defects that code review, tsc, and 2800 unit tests had all
passed**, three of them citizen-affecting.

| # | defect | why review could not see it |
|---|---|---|
| 1 | **The enumerator/clerk forms never computed calculated fields**, so BOTH the `age>=15` Labour Force AND the `age<15` guardian sections silently vanished from every submission | The code was correct in `FormRenderer`. The enumerator uses a *different* component. |
| 2 | A permanent 4xx was an **unclearable poison pill**; `retryFailed()` reset the counter, so the operator's own Retry re-armed it | Needs a real 422 from a real server to observe |
| 3 | **The reference code shown to the enumerator can never be the stored one** — the server overwrites unconditionally | The screen carried an amber "provisional" caveat, so it *looked* handled |
| 4 | **Discard destroyed the only copy of an interview** — the draft is deleted at submit | Only visible once you delete a real queue row and look |
| 5 | R21 covers **only the no-NIN case**, so a real citizen had two records | Found by sweeping the WHOLE register, not just the test rows |

### THE PATTERN OF THE DAY, in six guises
**A change landing on one implementation while the traffic takes another.**
R21's guard on the path the wizard bypasses · `FormRenderer` vs `FormFillerPage` for calculated
fields · the skipLogic callers · confetti on a completion page the wizard never renders · a Tailwind
class that was never generated · my own `payload.rawData` assumption when the producer emits
`payload.responses`.

**Every one looked correct in the source.** What caught them was the *built output*, the *live log*,
or the *running system*. **Before wiring anything to "the X screen", check which X the user
actually reaches.**

### Two tests that were green while defending a bug
- the ops digest's `todayCount: 85 -> red` (§7i)
- `restoreToDraft`'s fixture, which I wrote from **my assumption about the payload shape** rather
  than from the producer — so it asserted the bug and passed

**A fixture invented rather than copied from the producer is a test of your beliefs, not the code.**

### Guards that caught what review did not
The audit-action count tripwire · the **navigate-target drift guard** (`/enumerator` does not exist;
it would have 404'd an enumerator the instant they discarded an interview) · the **pre-push vite
build** (twice) · the **story-residual guard**, which refused to let me flip 13-4 to `done` over two
residuals I had not read — one of which (R8) my own AC4.4 fix had made *worse*.

### Also shipped
`EMAIL_TIER=pro` (the enforcer was refusing sends at a free-tier 100/day) · the digest reframe ·
deploy resilience, client + nginx · the pdfjs OSV acceptance with evidence · audited
contact-correction tooling · completion animations, with the codebase's first
`prefers-reduced-motion` handling.

## 7i. Session 2026-08-05 — R21 proven, and three monitors caught lying

**The register moved 301 → 308 today on 7 real self-registrations (5 of them D4 conversions), and
13-49 closed.** But the durable lesson of the day is narrower and repeats four times:

> **Every number that looked like a measurement today was, at least once, a measurement of
> something else.** A stock that was a flow. A quota that was a page size. A cohort date that was a
> day off. A conversion denominator that included confirmations.

### What shipped
| | |
|---|---|
| **R21** | The identity guard never ran on the public wizard. Fixed, and **VERIFIED LIVE** — not on deploy. |
| **R22** | The attach path audited a creation that never happened. Found BY the R21 verification. |
| **Survivor rule** | Merges now keep the **older** record: submissions are re-pointed and NULLs filled either way, so the only thing a merge destroys is a reference code — and the older one is the one already in citizens' hands. |
| **CodeQL v3→v4** | Both GitHub annotations cleared. |
| **13-49** | `done`. Every residual terminal, with an owner and a reopen trigger. |
| **38 tokens expired** | Dead-end `wizard_resume` links, on Awwal's instruction. **Stopgap — the producer is still running (13-50).** |
| **Digest email alarm** | Alarmed at **0.2% of capacity** against a page size. Now reads the meter's monthly total. |

### How R21 was actually closed (the shape to copy)
A two-pass **synthetic** registration, not a real citizen's record. Seed, then re-register the same
phone **surname-first**, no NIN either time, **different email**, different browsers.

- **Different email was the load-bearing choice.** With a shared one, an attach could have come from
  the draft/email path and proved nothing about the guard. Different email ⇒ phone + name tokens
  were the only link ⇒ the attach can only be R21.
- **Three observables, and only one of them counts.** Same reference code on screen; one respondent
  row carrying two submissions; and `registration.attached_to_existing_identity` **in the log**.
  Only the third proves the code *executed* — R21 exists precisely because a guard that never runs
  produces an outcome that looks identical to one that runs and finds nothing.
- Teardown child-first; register verified back to its exact prior count; `audit_logs` left alone
  (hash-chained). **`users` was missing from the documented recipe** — the wizard mints one per
  email. 13-4 AC1c corrected.

### The four measurement failures, because the shape recurs
1. **A stock that was a flow.** 37 dead-end tokens → sized a mitigation against 37 → the same query
   returned **39 an hour later**. 86 were minted that day. The producer (`/check-registration`) was
   only found because *the number moved between two measurements*. → 13-50.
2. **A quota that was a page size.** `RESEND_FREE_TIER_DAILY` was BOTH the API page limit and the
   alarm denominator, so `todayCount` could never exceed 100 **by construction** — the digest read
   `100+/100` whether we sent 101 or 10,000. **And the true number was already printed two lines
   below it.** We are on Pro (50k/mo), so it alarmed at 0.2% of capacity and recommended buying the
   plan we own.
3. **A cohort date a day off.** The D4 invitations went out **08-05 08:04**, not 08-04 — yesterday's
   165 rows were the adoption programme. The ladder check is the **08-05** cohort.
4. **A denominator that included the wrong sends.** `campaign_sends` on 08-04 returned 165 because
   it counts confirmations too. Scoped to `campaign_id='draft-invite-2026-08'`: ~~75 invited, 5
   converted (6.7%)~~ — **corrected 2026-08-23 by 13-50 AC5.4 to 71 invited, 5 converted (7.0%).**

   > ⚠️ **The 75 was corrected a second time, and for a different reason than the 165 was.** Four
   > of those 75 were **phantom drafts** — `…@gmail.co` addresses autosaved mid-typing, which
   > `wizard_drafts` turned into people because the table is KEYED on email. They cannot receive
   > mail, and all four belonged to people already in the register. So the honest denominator is
   > **71 real invitees**, and D4 conversion is **5/71 = 7.0%**.
   >
   > ⛔ **QUOTE 71, NOT 75, WHEN COMPARING FUTURE ROUNDS.** From 13-50 the blast scripts exclude
   > phantoms at the shared cohort filter, so later rounds get a naturally smaller denominator. If
   > this baseline stays at 75, that exclusion will read as a conversion lift that never happened
   > — a metric improving because the measurement changed.

### A test can be green for months while encoding the bug
The digest's test asserted `todayCount: 85 → red` — the exact defective behaviour, passing
continuously. Sibling of [[pattern-test-that-passes-over-a-hole]], but worse: that pattern is a test
that never exercises the guard; **this is a test that pins the guard in its broken position.** When
fixing a defect, read the test that covered it — if it passes unchanged, one of the two is wrong.

### Also worth knowing
- **`wizard_resume` mints are not audited at all** (86 in one day; `magic_link.issued` records only
  `login` and `pending_nin_complete`). An entire token purpose invisible to the audit trail, found
  by accident. Two purposes have now been found unaudited by accident; **nobody has swept the rest**
  → 13-50 AC2.3.
- **A bounce silently costs a contact channel.** Every bounce writes `email_suppressions`; three
  suppressed people are in the register with working phones, three more are D4 invitees whose
  invitation never arrived. No digest line mentions it → 13-42 AC8.
- **Suppression keys on the raw address.** One row is `wahab akeem olaide <aqeemakolade@gmail.com>` —
  the clean address was never suppressed, so it both over- and under-blocks. Not systemic: 0
  name-wrapped addresses in drafts/submissions/campaign_sends.
- **Root `tsc` is not `apps/web`'s `tsc`.** Root passed; the web package's own config failed. Same
  trap as running web vitest from the root — only the package's own config speaks for it.

## 7h. 🔁 NEXT UP — 13-50: `/check-registration` mints a dead-end link (2026-08-05)

**Not launch-gating, but it degrades with every day of engagement**, which is the opposite of most
backlog items.

`registration-status.service.ts:293` issues a **`wizard_resume`** magic link to anyone who looks up
their status by email. For an ADOPTED person that link is a trap: resume → refill the wizard →
submit → **409 `NIN_DUPLICATE`**. And R4's ruling pointed the adoption confirmation at
`/check-registration`, so 174 adopted people were sent to the one surface that hands out the bad
link. The code comment already concedes the gap — *"lands on the authenticated status home (9-40)
when shipped; today it degrades gracefully"* — but for an adopted person it does not degrade
gracefully, it degrades into an error.

**Fix:** don't issue `wizard_resume` when the respondent's registration is already complete; issue
the status/login link instead. That is 9-40's surface, so 13-50 is either a thin slice of it or a
guard in front of it.

**Two findings worth keeping independently of the fix:**
- **`wizard_resume` mints are NOT audited.** 86 were created on 2026-08-05 and `magic_link.issued`
  shows only `login` and `pending_nin_complete`. A whole token purpose is invisible to the audit
  trail — found only because the stock kept moving while being counted.
- **Stock vs flow.** 38 tokens were expired on Awwal's instruction (2026-08-05) and that was the
  right immediate call, but it is a stopgap: the producer is still running. **The tell was the
  number moving between two measurements taken an hour apart.** A remediation aimed at a stock
  should always be asked "what produces these?" before it is called done — sibling of
  [[pattern-ship-a-fix-that-never-fires]], where the fix runs but the condition regenerates.

## 7o. Session 2026-08-12/13 — gate item 2 green, and four things found by doing it

**Detail lives in SCP §12; this is the arc.** Prod `19b51f5` throughout.

**The run.** A fresh enumerator (`+testenumeratornew`) was invited and activated — necessary because
**the activation wizard is one-time**, so the path that failed twice and succeeded once could not be
re-tested on an existing account. It succeeded, and the log shows `backOfficeActivation: false`: **the
FIELD branch, which nothing had ever exercised** (13-59 AC3.3's stated asymmetry, now closed). Six
respondents were then captured through the live UI, verified, and torn down to an exact baseline.

**Gate item 2 is GREEN** with the two pieces of evidence that cannot be faked: `§A query 4` = **2**,
and `identity_match_exempted_staff_capture` **fired** naming `wouldHaveMergedInto`. The R8
consequence was demonstrated end to end — shared phone → neutral response and **no email**; reference
code → **email arrived** — run 30 minutes apart.

**Four findings, none of which anyone was looking for:**

1. ⚠️ **The sharpness margin is closing.** liveness_score 0.859 → 0.591 → **0.311**, against a hard
   floor of 0.20 (`sharpness < 20` throws `VALIDATION_ERROR`, which activation **re-throws**). One
   dimmer room and a field officer cannot activate. Threshold was *"determined empirically"* with no
   record of on what. → 13-60.
2. ⚠️ **`live_selfie_verified_at` has exactly one writer** — the `/users/selfie` upload path.
   Activation never sets it. **The column means "arrived via upload", not "verified"**, so any
   verified-selfie cohort query under-counts every field officer. → 13-60.
3. ⛔ **Four of seven roles have never had an account on prod** — clerk, official, supervisor,
   assessor all **0**. Found because `team_assignments` needs a supervisor and the service validates
   the role, so the row **could not be created by the canonical path**. §8.5's assessor finding was
   not special. The smoke ran anyway: the submission path does not read that table.
4. ✅ **Two "gaps" that were not gaps.** `campaign_source` NULL on enumerator rows is **correct** —
   there is no acquisition question on the staff form, the enumerator IS the channel; **the RUNBOOK
   was wrong** to ask for it unbounded, and is fixed. GPS **already works** for enumerators
   (first-class columns, populated, 16–30 m accuracy); the 81 legacy rows carrying only
   `gps_location` JSON are a pre-Public-Core migration artefact → 12-7 backfill, **not a launch item**
   since Public Core collects no GPS at all.

**The lesson worth keeping is §2aa** — the first §C attempt put the pair on different phones, so the
guard never ran, and the count it would have produced is the same count a broken fix produces. **A
number consistent with both outcomes proves neither.**

## 7p. Session 2026-08-18 — the close-out that was left open, and a number that was wrong in public

**Nothing was in flight.** The tree was clean; what was "in flight" was **my own previous
adjudication's unfinished close-out** — 12-4 correctly at `review`, with two DISCHARGE-ON-DEPLOY
residuals whose stated owner was *"adjudication, same session"*, and the session had ended before the
push. **Two commits sat on local `main` protecting nobody.** That is §2y(a) verbatim, and it is worth
noticing that the failure mode repeated *despite* the doc having a section about it: the ledger was
written correctly and then not executed.

**The work was one chain — push → CI → deploy → verify — and the verification is the part worth
copying.** R1's discharge condition as written was *"confirm both rates MOVE"*, which is satisfied by
any change including a wrong one. It was replaced with a prediction computed independently from prod
data before the deploy, through the inline canonical read rather than `submissions` (§2z(d), the
substitution that has now burned this project twice). The control reproduced the live figures exactly;
the prediction said 45.5 and 23.8; the deployed page published 45.5 and 23.8. **A prediction that can
be wrong is evidence; an observation that something changed is not.**

**Three findings, none of them the story's subject:**

1. ⭐ **R4 — a guarantee that was quietly false.** 13-33-L4 added a `CREATE OR REPLACE`-first path so a
   redeploy never leaves the view absent. It succeeded in **47 ms with no fallback warning**, against a
   view whose column set had definitely changed — so the view was already dropped upstream by
   `db:push`, the fallback branch has **still never run**, and there is a ~27 s no-view window on
   *every* deploy, wider than the one L4 removed. **Found only because the log's SHAPE was wrong**
   (§2a2), not because anything failed. Both possible causes produce an identical, correct-looking
   11-column view — §2aa, a result consistent with both outcomes.
2. ⛔ **Exit codes lied in both directions within one hour** — a failed push reported 0 (trailing
   `echo`), a green CI run reported 1 (watcher's TLS timeout). Written up as §2y(c). The false RED is
   the more dangerous: trusting it means debugging a failure that never happened on a deploy that
   already succeeded.
3. ⚠️ **Two claims in the prior record were wrong and the outcomes hid it** — the predicted
   DROP+CREATE path, and the `:v2` cache bump's claimed crash prevention (`rateDenominators` is
   required on the type but **no component reads it**, so a stale `:v1` payload would have rendered
   fine). Both corrected in place, not deleted (§2w).

**Left for whoever picks up 12-5:** it is the story that makes `rateDenominators` load-bearing, and
R4's window becomes relevant the moment anything runtime reads the physical view.

## 7q. Session 2026-08-18 — 13-38 re-review: a trigger that reached no database, and a warning finally killed at the root

> ⚖️ **RENUMBERED 7p → 7q at adjudication.** Main's §7p (the 12-4 close-out) was written the same day
> on a different branch, so two different sections carried the same number. Caught at the rebase, not
> after it. **Rulings since taken (Awwal, 2026-08-18): R7 PUBLISH · R4 bind-to-canon · R10 inversion
> confirmed · R1 accepted · R3 closed by prod measurement.** The "R7 is an open ruling" language below
> is preserved as it was written; the ledger in the story file is the current state.

**Worktree `C:\Users\DELL\wt-13-38`, branch `story/13-38-marketplace-card`. NOTHING IS COMMITTED.**
Status stays `review` (§2a0 — R1/R2/R3/R4 open, plus a new R7 that needs Awwal). Re-review of the
dev's fix pass found **9 findings (2 High / 4 Medium / 3 Low), all fixed + RED-verified**. Detail is
in the story file's `## Senior Developer Review (AI) — RE-REVIEW` + `## Residuals ledger`.

### 🚩 THE FLAG — the working tree carries ONE file that is NOT 13-38. Commit it separately.

`apps/web/src/features/onboarding/components/__tests__/LiveSelfieCapture.test.tsx`

It is an **onboarding** test file with no relation to the marketplace card. It is dirty because Awwal
asked, mid-session, for the long-standing lint warnings to be cleared "once and for all". Do **not**
fold it into the 13-38 commit — it belongs in its own `chore(lint):` commit. It is declared in
13-38's `## File List` flagged `⚠️ NOT 13-38 — commit separately` rather than left undeclared,
which is R12's lesson applied to the reviewer's own edit.

**Everything else in that tree IS 13-38**, except this doc itself. `git status --porcelain` is the
authority — deliberately no count is recorded here, because the whole reason two of this re-review's
findings exist is that a written-down list had drifted from what git actually said (and D6 is the
same lesson about self-staling numbers).

### The warning resolution — root-caused, not silenced

`pnpm lint` had emitted the same two warnings for months, and every report (mine included, four
times) described them as *"2 pre-existing warnings in an untouched file"* — accurate, and exactly how
a thing survives forever:

```
LiveSelfieCapture.test.tsx
  140:7  warning  Unused eslint-disable directive (no problems reported from '@typescript-eslint/no-explicit-any')
  186:7  warning  Unused eslint-disable directive
```

**Root cause:** `apps/web/eslint.config.js:148` sets `@typescript-eslint/no-explicit-any` to `'off'`
for test files (`// Allow any in tests`). Both `// eslint-disable-next-line` comments were therefore
suppressing a rule that **could never fire there** — dead annotations, not needed suppressions.

**Fix:** both directives deleted. This is permanent rather than a workaround: the config deliberately
permits `any` in tests, so they cannot come back unless that policy changes — at which point eslint
would ask for them again, correctly. File still passes **9/9**; web `tsc` clean.

**Result: `lint` is now 0 errors AND 0 warnings across `@oslsr/types`, `@oslsr/api`, `@oslsr/web`.**
Worth protecting — a clean lint is a signal; a lint with two permanent warnings trains everyone to
skim past the output, which is how a *third* warning would arrive unnoticed.

### ⚠️ Do not confuse the three drift guards with warnings

Awwal asked whether "the 3 drift guards" needed resolving too. **They do not — they are passing
checks, not warnings.** `apps/api`'s lint script runs them and they print green every time:

```
✅ registry-read drift guard: 384 files scanned, no drift.
✅ respondent-write drift guard: 384 files scanned, no un-sanctioned respondent CREATION.
✅ story-residual guard: 317 stories scanned, no done-with-open-residuals.
```

Green is the desired state; they exist to fail loudly if drift appears. Keep them noisy.

### The two findings worth carrying into the playbook

1. **A trigger that reached no database.** The 2026-08-18 round correctly added `business_name` to the
   marketplace FTS tsvector — and **`db:custom` is in no workflow and no deploy step**. So CI's DB
   never had the trigger at all and prod's had been frozen since a human last ran it in Story 7-1
   (March). Proven by dropping the trigger locally to reproduce a CI-fresh DB: the story's own AC8
   search test **failed**. Fixed with `apps/api/scripts/migrate-custom-sql-init.ts` (auto-discovered
   by `db-push-full.ts` for CI; explicit step added to the prod deploy chain in `ci-cd.yml`). The
   accompanying "full suite green" had been a locally-cached gate standing in for the real one —
   **Pitfall #47, found in the deploy pipeline rather than the logic.**
2. **The record stopped a day before the code did.** The tree carried 7+ `[AI-Review] 2026-08-18`
   annotations with **no 2026-08-18 entry anywhere in the story**, stale counts (14/14 → really 21;
   6/6 → really 9), two undeclared files, and a code comment citing an "R7" the ledger did not
   contain. Both High findings were reached **by diffing git against the File List, not by reading
   the story** — the undeclared trigger file was the thread that led to the CI break.

**⚠️ Before any operator runs the 13-38 backfill `--apply`:** the FTS trigger must already carry
`business_name` (else repaired rows are permanently unsearchable — the backfill is idempotent and
will never revisit them), and **R7 is a ruling only Awwal can give** — the preview counts cards whose
`business_name` contains the person's own name ("Adekemi Fashion House"), and the consent copy names
only profession, LGA and experience level. That decision is only actionable while it is still a
preview.

> ✅ **R7 RULED 2026-08-18: PUBLISH** — measured first (8 of 235), then decided. See the story ledger.

## 9. 📻 JINGLE WATCH — open the moment week 1 settles (written 2026-08-23, read ~2026-08-31)

**Why this section exists:** the first radio spot airs **Monday 24 August** (Fresh FM, Ibadan 1 & 2,
one 60-second spot x3). Everything below was true on 23 August and is the *before* half of a
comparison that only exists if someone writes it down now.

### 9a. ⛔ THE TRAFFIC WATCH IS NOT RUNNING, AND ITS DOCUMENTED CRON LINE IS BROKEN

Story 9-52 built `cf-traffic-watch.ts` to run every 15 minutes and page via Telegram on bot-flood
patterns. **It has never run. Verified on prod 2026-08-23:**

- `crontab -l` → **empty**
- systemd timers → only OS units (sysstat, droplet-agent, fwupd, e2scrub). Nothing OSLRS.
- `/etc/cron.d` → certbot, e2scrub_all, sysstat only
- pm2 → no cron-like process (just `oslsr-api` + `pm2-logrotate`)

⚠️ **AND THE COMMAND IN ITS OWN JSDOC DOES NOT WORK.** The prescribed line is
`cd /root/oslrs && pnpm --filter @oslsr/api exec tsx apps/api/scripts/cf-traffic-watch.ts` —
`--filter` sets cwd to `apps/api`, so the path resolves to `apps/api/apps/api/scripts/...` and it dies
with `ERR_MODULE_NOT_FOUND`. **Anyone who had installed that cron would have had it fail silently
every 15 minutes** — [[pattern-ship-a-fix-that-never-fires]] with the failure pre-installed.

✅ **The working invocation** (verified, token present, `findingCount: 0`):
```bash
cd /root/oslrs/apps/api && pnpm exec tsx scripts/cf-traffic-watch.ts --dry-run
```

### 9b. 📊 PRE-JINGLE TRAFFIC BASELINE — captured 2026-08-23, the "before" half

Requests/day from Cloudflare (`cf-analytics.ts`):

| date | requests | threats |
|---|---|---|
| 2026-08-16 | 2,329 | 162 |
| 2026-08-17 | 3,805 | 169 |
| 2026-08-18 | 2,053 | — |
| 2026-08-19 | 1,423 | 123 |
| 2026-08-20 | 1,613 | 3 |
| 2026-08-21 | 5,276 | 22 |
| 2026-08-22 | 4,325 | **961** |
| 2026-08-23 (partial) | 955 | 11 |

**Status:** 200 → 14,892 · 301 → 4,106 · 403 → 1,570 · 404 → 557 · 401 → 168
**Countries:** US **8,267** · NG **3,585** · FR 3,322 · SG 1,239 · DE 886 · NL 628 · BE 575 · BR 572

### ⭐ 9c. THE SIGNAL TO WATCH IS **NG REQUESTS**, NOT TOTAL REQUESTS

**This is the most useful thing in this section.** For a Nigerian state registry, **the top country is
the United States**, and NG is third behind FR. Total traffic is dominated by scanners and bots, and
it is *volatile* — threats swung from 3 to 961 in two days, and daily totals from 1,423 to 5,276 with
no campaign running at all.

➡ **A jingle spike measured against TOTAL requests is unreadable.** The band is already 1.4k–5.3k/day
from noise. Watch **NG-origin requests** (baseline ~3,585 over the window, i.e. roughly 450/day) and
**registration starts**, not the headline number. Otherwise the campaign's own signal drowns in
somebody else's port scan — [[pattern-monitor-measuring-something-else]].

### 9d. What to compare when week 1 settles

1. **NG requests, day by day, against the table above.** Fresh FM is Ibadan 1 & 2 — the densest zone.
2. **13-46 AC7's after-count** — `registration.rate_limit_exceeded` + `wizard_draft.rate_limit_exceeded`
   turn-aways. The BEFORE baseline is already collected in 13-46 Task 7. **This closes R8**, the one
   residual genuinely blocking 13-46's `done`.
3. **Whether any cap ever bound.** `MARKETING_DAILY_CAP` 2000 / monthly 20000 are armed and verified
   mounted. If nothing came near them, say so — a cap that never binds is still evidence.
4. **Station attribution by timestamp.** The 7-station buy is strictly sequential with clean gaps, so
   a registration's timestamp attributes it to a station without any code. **13-46 R3's trigger is
   CONCURRENT STATIONS, not a date** — it only fires if the 11-station wave overlaps them.
5. **The email side stayed still.** No marketing blast fired (13-66 stop). So any registration lift in
   week 1 is attributable to radio alone — an unusually clean read, worth not spoiling.

### ⭐ 9e. RETRO THEME — "what can this guard NOT see?"

Three defects in one week were the same shape: **a guard that is correct about what it checks and
blind to the rest.** None errored; every one returned a true number.

| guard | correct about | blind to |
|---|---|---|
| `lint-story-residuals` | stories that adopted the ledger FORMAT | stories with no table, and `DISCHARGE-ON-*` states |
| Cat1 blast exclusion | the magic-link route into the register | the other three contact routes — caught 73, **missed 112** |
| `filterMarketingCohort` | "are we spamming them this week" (5-day gap) | "have they already been asked and not acted" — 52 re-invitees |

➡ **The retro question is not "does this guard work?" but "what is outside its field of view?"**
Ask it of the rate limiters after week 1 too: they are correct about what they count — what don't they
count? Do NOT run this retro before the jingle settles; it needs week 1's numbers to be worth
anything.

### 9f. Housekeeping carried in
- **13-65** — dev reports it functionally complete, documentation being finished. Branched off
  `a69156e`; **needs a rebase onto current main before adjudication.**
- **13-66 R1** — the 18 hold-list people need a disposition (different copy, not silence). Awwal's.
- **13-51 R13** — CLOSED, script retired. R3 and R12 remain.

## 10. 🌾 FARMING-GROUP IMPORT — DECISIONS ALREADY TAKEN (2026-08-23 → 25)

**Read this before reopening anything below.** Each row was argued once and settled. If you find
yourself re-deriving one, the answer is here — change it only with new evidence, and say what the
evidence is.

**Scope:** three association sheets (N-Cares 6,516 rows · L-PRES 3,535 · fish 39) consolidated to
**9,563 people**. Working files live at `C:\Users\DELL\Downloads\farming-consolidation\` —
**deliberately OUTSIDE the repo**, so ~9.5k NIN-bearing PII rows cannot enter git history or ride a
deploy. Do not move them in.

### 10a. Settled — do not relitigate

| # | Decision | Why, and the measurement behind it |
|---|---|---|
| **D1** | **Dedup on name AND phone. Never phone alone.** | Of N-Cares' 367 shared phones, **259 carry genuinely different names** (`Popoola Muminu` + `Waheed Agbo` on one handset) — co-operative/household phones, not duplicates. L-PRES inverts it: 112 of 181 shared phones ARE identical names. Phone-only dedup would have merged ~259 pairs of real people. Name keys are ORDER-INSENSITIVE token sets — measured, because N-Cares' surname position is 68 first-token / 36 last / 13 mid, i.e. genuinely unrecoverable. |
| **D2** | **No gender inference. It was never needed.** | Coverage is already **100%** with a two-value vocabulary (N-Cares 4,748 M / 1,768 F; L-PRES 2,424 / 1,111; fish carries M/F). The `gender_suggested` / `_confidence` / `_accepted` scaffolding has no rows to act on. Repurposed as a VALIDATOR (flag name-vs-stated mismatches), not a filler. |
| **D3** | **Trades map to the canonical taxonomy — never a new vocabulary.** | `SKILL_SLUGS` pins `skill_list` and the XLSForm parser flags any non-canonical value, so a bespoke agriculture vocabulary would be rejected at ingest anyway. 9,465 / 9,563 mapped (**98.98%**), zero non-canonical. The 42-slug merge (150→192) came out of this work. |
| **D4** | **Value-chain STAGE decides the occupation, not the commodity.** | "Sheep/Goat › Marketing › Wholesale" is a livestock TRADER (`trading`, ISCO 5221), not a farmer. Mapping on commodity alone would file **789 traders and 318 processors as farmers** — 32% of L-PRES. |
| **D5** | **L-PRES conflict/crisis columns and GPS are NOT carried through.** | Dropped at load, not imported-then-hidden. They include *"effect of conflict/crisis on gender and vulnerable groups"* and `Location Coordinates` — far outside a skills register's scope. |
| **D6** | **`source = imported_association`.** | ALREADY EXISTS — Story 13-2 added it foundationally *"so provenance is honest from the first import"*. Gives the four-route visibility Awwal asked for (Public / Enumerator / Clerk / **Association**) with **no schema change**. |
| **D7** | ⛔ **REJECTED: excluding association rows from the public figures.** | Proposed by the adjudication agent 2026-08-25 and **overruled by Awwal, correctly**: these are real people vouched for by their association, not a data dump. Excluding them would understate the registry AND suppress them from the marketplace — the opposite of what the register is for. **Provenance belongs in a TAG, not a FILTER.** Recorded because it is the kind of "tidy" idea that comes back. |
| **D8** | **Drip-import by ASSOCIATION, not by arbitrary slices.** | `import_batches` already gives **14-day batch-level rollback** (flips that batch's respondents to `rolled_back`). One 9,563-row import is one all-or-nothing decision; batching by real group (N-Cares / L-PRES / fish) makes each rollback map to people you can actually telephone. |
| **D9** | **PREDICT the post-import figures BEFORE uploading** — and the control must reproduce TODAY'S live numbers first. | [[pattern-predict-then-compare]]. Live control as of 2026-08-25: `totalRegistered 337 · withAnswers 282 · lgasCovered 32 · male 159 (56.4%) / female 121 (42.9%) · allSkills livestock 63, teaching 60, tailoring 38`. ⚠️ **Watch the gender split**: the intake is ~72% male against the register's 56.4%, so that public number WILL move. Honest, but better predicted than discovered mid-campaign. |
| **D10** | ✅ **Consent is ACCEPTED — ruled by Awwal 2026-08-25.** Emitted as `Yes`, not `UNKNOWN`. | ~~Earlier position: emit `UNKNOWN` because no sheet carried a consent column.~~ **Overruled, and rightly.** This is not scraped data: it was **sourced directly from the associations, who know it is for the Registry**. Recording it as `UNKNOWN` would understate a consent that was actually given, and would then be used downstream as a reason to withhold these people from the marketplace — the same suppression D7 rejects, arriving by a different door. The association head is the consenting party of record, exactly as the association data sheet's own declaration provides for. |

### 10b. ⛔ BLOCKER — must be solved before ANY import runs

**The app's importer would undo D1.** `ingest-plan.ts` line 16: *"Dedup is on **phone OR NIN only**."*
First phone match in the batch → `matched` → **not inserted**. It will not error; the dropped
people simply appear as `matched`.

### ⭐ MEASURED 2026-08-25 — the real planner, the real file, nothing written

`ingest-plan.ts` declares itself *"PURE, no DB"*, so `planIngest()` was run locally against
`consolidated.csv` with the registry's 337 phones / 303 NINs supplied as the existing-key maps. This
is not a model of the importer's logic — it IS the importer's logic.

```
input rows            9,563
WOULD INSERT          9,086
NOT INSERTED            477
  phone_match_in_batch   441   <- the shared-handset people
  nin_match_in_batch      21
  phone_match             14   <- genuine collisions with the existing register
  nin_match                1
```

⚠️ ~~**roughly 700 real farmers**~~ — **STRUCK. The measured figure is 441.** The 700 came from
extrapolating the 763 `unique-name-on-shared-phone` CLUSTERS without accounting for the planner
dropping only the 2nd-and-later row per phone. Recorded rather than quietly corrected: it was
asserted three times in conversation before anyone ran the planner, and it is exactly the class of
number [[pattern-falsifiable-number-is-a-live-artefact]] warns about.

**Awwal's ruling 2026-08-25: 441 is manageable** — proceed, but examine them for what can be
salvaged rather than writing them off. Splitting the shared-phone rows into a SECOND BATCH loses
nobody and is cheap at this size.

### ✅ Also measured, on a real candidate row

```json
"consentMarketplace": true,          <- D10's ruling lands where the marketplace reads it
"lgaId": "irepo",                    <- LGA resolves cleanly
"firstName": "Haruna", "lastName": "Isola",
"metadata": { "import_extra": { "profession": "Crop Farming", "gender": "M" } }
```

**Two of my own harness bugs, recorded because both first read as importer defects:** `lgaId` came
back `null` only because I passed the canonical field as `lga` (it is `lgaId`), and the name split
printed empty only because I read `c.firstName` instead of `c.respondent.firstName`. Neither was
the importer's fault. → verify the harness before reporting the system.

⇒ **10b.3 softens.** The split is not broken — it produces sensible-looking names
(`Haruna Isola` → first `Haruna`, last `Isola`). It is *unverifiable*: D1 measured N-Cares' surname
as the first token in 68 of 117 decidable cases, so a rule that always takes token 0 as the given
name is wrong on roughly half, with no way to tell which half a row is in. **A data-quality caveat
to record, not a blocker.**

Options: split so shared-phone people enter in separate batches · extend the importer's key to
phone+name · or knowingly accept the loss. **Do not accept it silently** — a dropped farmer is
invisible afterwards.

### 10b.2 ⛔ THE SLUG NEVER REACHES `skills_possessed` (found 2026-08-25)

`ingest-plan.ts` `EXTRA_FIELDS` carries **`profession` as free text**, and every extra lands in
`respondents.metadata.import_extra` — a JSONB bag. **Nothing in the import path writes
`skills_possessed`**, which is where `SKILL_SLUGS`, the skills analytics, the combobox and
marketplace-extraction all read.

⇒ The canonical-slug mapping (98.98%, zero non-canonical) **does not arrive** through this
importer. It would sit as a string in `metadata.import_extra.profession`, invisible to every skills
surface.

⭐ This reframes the granularity question. Awwal's instinct — that lumping everyone into `farming`
loses real distinction — is right, but the immediate defect is that **neither the coarse nor the
fine value reaches a skills field at all**. Settle that before choosing a resolution. For the
record the detail was never lost: `trade_detail` holds `Crop — Cassava` 2,387 · `Crop — Maize`
1,923 · `Crop — Tomato` 365 · `Crop — Rice` 37 beside the `farming` slug. The canonical taxonomy
deliberately does NOT split by crop (ISCO 6111 = "Field Crop and Vegetable Growers"; the v1.0 doc
folded maize/cassava/yam/rice into one entry). Keeping crop detail in a companion field matches the
standard; adding crop-level slugs matches the instinct. **Both defensible — Awwal's ruling, made
knowing the slug does not currently arrive.**

### 10b.3 ⛔ THE IMPORTER'S NAME SPLIT INVERTS N-CARES (found 2026-08-25)

```ts
const parts = full.split(/\s+/);
return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
```

First token → **first name**. D1 measured N-Cares' surname as the FIRST token **68 of 117 decidable
cases**, so this rule inverts roughly 58% of 6,516 names. `Haruna Isola` stores as first name
*Haruna* / surname *Isola* when the evidence says the reverse is likelier. Silent, and
cosmetic-looking right up until someone searches the register by surname.

**The dry-run (`POST /admin/imports/dry-run`) sizes 10b, 10b.2 and 10b.3 together without writing
anything** — run it against the file we would actually import, i.e. after the D10 consent change.

### 10c. Open — Awwal's to rule, NOT the agent's

| # | Question | What makes it a ruling |
|---|---|---|
| **O1** | **Which `status` do imported rows carry?** | `PIPELINE_EXCLUDED_STATUSES = ['imported_unverified','rolled_back']` is honoured by BOTH `marketplace-extraction.worker.ts` and `fraud-detection.worker.ts`. So `status`, **not** `source`, is what suppresses the marketplace — D6's honest tag does not by itself get anyone listed. ⭐ The schema already carries the counter-precedent: *"`pending_nin_capture` / `nin_unavailable` are NOT excluded — legitimate field respondents who merely lack a NIN and still earn marketplace profiles once consented."* An association member vouched for by their head is that same shape. |
| **O2** | **How is consent resolved?** | The schema says marketplace profiles are earned *"once consented"*, and D10 leaves consent `UNKNOWN`. So consent — not verification — may be the real gate. The association sheet's own design answers it: rows enter Tier-2 and a **member-side confirmation** is the consent event. Needs an explicit ruling, not an inference. |
| **O3** | **Fraud-detection volume.** | Whatever status admits these rows to the marketplace also admits ~9,500 rows to fraud detection at once. Worth knowing before, not during. |
| **O4** | **1,494 `needs-eyes` rows.** | 786 shared-phone · 274 suspected column-shift · 153 no usable phone (cannot be imported at all — phone is required) · 110 skill-unmapped · 99 unmatched LGA (88 of them `Fashola`, which is NOT an LGA) · ~150 malformed NINs · 43 NIN-across-phones · 9 soft merges. |
| **O5** | **6,516 N-Cares rows have no Surname/First-name split**, and D1 shows it is unrecoverable. Import on `full_name` only, or have the association re-key? | |

### 10d. What is actually ready

`consolidated.csv` (9,563 rows, 3.1 MB — **under the 10 MB import limit**), first 12 columns in
association-sheet order == the Epic 11 mapping, provenance columns appended after ·
`merged-pairs.csv` (374 absorbed, with basis) · `needs-eyes.csv` (1,494 with reasons) ·
`consolidate.mjs`, re-runnable and re-reading the taxonomy at run time.

## 11. 🧪 `a3-eslint-policy` — A FLAKE I COULD NOT REPRODUCE, AND WHAT THAT COST TO ESTABLISH

*2026-08-25. Written because "known flaky" with no numbers behind it is how a real bug hides.*

### 11a. The attempt

Eight full web-suite runs on `story/13-50` in one afternoon. **2 failures, then 5 consecutive clean.**

| run | free RAM at launch | result | what else was running |
|---|---|---|---|
| A | 1.77 GB (Firefox open) | **2 failed** — `a3-eslint-policy` + `route-resolution` | agent doing prod queries / git / file reads |
| B | 3.35 GB (Firefox closed) | **1 failed** — `a3-eslint-policy` | agent doing prod queries / diff reads |
| 1–5 | 3.34 / 3.03 / 3.35 / 3.21 / 3.07 GB | **275/275 passed, every time** | the loop, essentially alone |

⚠️ **Free RAM at launch does NOT predict it.** 3.35 GB produced both a failure (run B) and a pass
(run 3). Any rule of the form "> 3 GB is safe" is refuted by this table.

⚠️ **Nor does the file count.** Run B collected all **275** files and still lost a test. § the
existing guidance — *"compare the FILE COUNT, not the pass count"* — would have called run B clean.

⭐ **The only variable that separates the two groups is CONCURRENT ACTIVITY BY THE AGENT.** Both
failures happened while I was running prod SSH queries, git operations and file reads alongside the
suite. The five clean runs had the machine largely to themselves. That is a correlation across 8
points, not a proof — but it is the only surviving candidate, and it implies an operational rule
rather than a code change:

> **⛔ Do not do other work while a gating suite runs.** Start it, wait, read the result. The suite
> is not "background" work on this machine.

### 11b. The obvious fix is NOT a fix — checked, not assumed

`a3-eslint-policy.test.ts` constructs `new ESLint({ overrideConfigFile: 'eslint.config.js' })` inside
a helper called once per test — three instantiations. The tempting fix is to hoist it into a shared
`beforeAll` instance. **Measured timings say that would save nothing:**

```
✓ rejects CSS class selectors in unit/integration test files   3051ms   ← pays the config load
✓ rejects CSS string locators in e2e files                        24ms
✓ allows role-based query patterns                                21ms
```

ESLint caches config resolution at module scope, so instances 2 and 3 are already ~free. Hoisting
would move the 3 s from the first test into a hook, not remove it — and a hook has a timeout too.
**Recorded so the next person does not spend an afternoon implementing it.**

### 11c. Ruling

**Do NOT ship a speculative fix.** A fix for an unreproduced flake is untestable by construction:
green afterwards proves nothing, because green was already the common case (6 of 8). It would
convert an honest known-unknown into a false "resolved".

**CI is the authority.** It runs each package as its own job on a dedicated runner with no mutual
contention — exactly the condition under which this passes 5/5 locally. It has never failed there.

**Reopen with:** a captured failure message. The 5-run loop is `scratchpad/repro.sh`; re-run it
*while deliberately loading the machine* if you want to chase it further. Until an error string
exists, there is nothing to fix.

## 8. Deferred improvements (NONE launch-gating — deliberately parked 2026-07-30)

### 8z. 🧪 KNOWN INTERMITTENT — `a3-eslint-policy` (web), logged 2026-08-25

**Status: KNOWN, NOT FIXED, deliberately.** Failed 2 of 8 full web-suite runs in one afternoon, then
passed 5 consecutively. Never seen to fail in CI. **Full evidence and the ruling: §11.**

- ⛔ **Do not "fix" it speculatively.** The obvious change (hoist `new ESLint()` into `beforeAll`)
  was measured and does NOT help — ESLint already caches config resolution at module scope
  (3051ms / 24ms / 21ms across the three tests). §11b.
- ⚠️ It **refutes two heuristics we were relying on**: free RAM >3 GB (3.35 GB gave both a pass and
  a failure) and the file-count tell (the failing run collected all 275). Anyone quoting either as
  proof of a clean run is quoting something this table disproves.
- **Reopen with a captured error string.** `apps/api/scripts/_repro-web-flake.sh` hunts for one and
  stops on the first reproduction so the text survives.


Parked by Awwal while launch bandwidth is tight. **Each row carries a TRIGGER, because a deferred list
without triggers becomes exactly the invisible debt §2a0 exists to catch** — that is the whole lesson of
this session applied to this list. Nothing here blocks the blast; §4 holds the things that do.

| # | Item | Why it matters | Trigger to do it |
|---|---|---|---|
| D1 | ✅ **WORKED EXAMPLE EXISTS (2026-07-30) — format is no longer a proposal, copy it.** **Residual ledger**: a `## Residuals` table (ID / severity / state / re-runnable evidence / owner), using the §2a0 three states. ~~Retrofit 13-36 as the worked example.~~ **Done instead on 13-37** — `_bmad-output/implementation-artifacts/13-37-registry-read-drift-ci-guard.md` → `## Residuals`. **13-37 is the better example than the proposed 13-36 retrofit**, for three reasons: it has exactly **ONE blocking residual** (R1, AC6's CI leg) rather than a tangle; that residual has **re-runnable evidence on both sides of the push** (locally `pnpm --filter @oslsr/api lint:registry-read` → 344 files/0 hits; after push, a two-part `gh run view` check for the step being green **and** ordered above `Lint`); and the ledger was written **before** the close rather than reconstructed after it, which is what §2a0's two touch points actually ask for. It also carries two ACCEPTED rows (R2 = the rule-(a) scope gap, measured 50→0; R3 = L2's comment-mask KNOWN LIMIT) — deliberately kept, because those are exactly what §2a0's grep surfaces, and R3 is left as the example of a *thin* ACCEPTED (a bound, not a count) so the format shows its own failure mode. | Makes the debt gate a *schema* instead of a discipline. Prose is not type-checked. | ~~First story adjudicated after launch.~~ **DONE.** Remaining: fold the table into the story template so the next story starts with it, and use it on the next adjudication. |
| D2 | **STILL PARKED — no script written.** **`scripts/residual-inventory.ts`** — regenerates the debt table on demand (unchecked boxes + residual language + file-vs-board status divergence). | A hand-written list is stale in a week. Same script later feeds D3, so the parse is written once. | ~~Do with D1; it *is* the report.~~ **D1 shipped WITHOUT it** — 13-37's ledger is hand-written, which is precisely the staleness D2 exists to fix, so the trigger is now sharper, not softer: **write it when a SECOND story needs a ledger**, i.e. at 13-41's close-out. Two hand-written ledgers is the point at which the parse pays for itself, and by then D1's format has been exercised twice so the script has a stable target. |
| D3 | 🐞 **NEW 2026-08-18 — THE SHIPPED HALF IS ALREADY BROKEN LOCALLY, fix this with the story.** `turbo.json`'s `lint` task has **no `inputs`**, so it hashes `apps/api/` only; `_bmad-output/` is outside, so a **story-only commit replays a stale guard verdict** (observed on the 12-4 close-out: `FULL TURBO`, 208 ms, "317 stories scanned" from an older run). The guard therefore cannot fire on exactly the commits it polices. CI is unaffected (remote caching disabled → cold cache). Fix = explicit `inputs` including `../../_bmad-output/**/*.md`, or a separate task. See §2y(c). **Story 13-45 — CI guard**: fail when a story reads `Status: done` while its ledger holds an OPEN/DISCHARGE-ON-PUSH row. | Without a guard, D1 is a convention — and conventions produced the 201. Needs a RED-failing canary, so it is real dev work. Sibling of 13-41/13-37. **⚠️ It is the THIRD consumer of the shared CI-guard toolkit 13-41 extracts** (`apps/api/src/lib/ci-guard/` — file walk, path rules, allowlist, escape hatch, hit record, message skeleton, runner factory, AST source model), so it should be built ON that toolkit, never as a fourth copy of 13-37's plumbing. It is also a named blocking step in `lint-and-build`, so it inherits **Pitfall #45**: the step must sit ABOVE `Lint`, and 13-41's AC6 ordering-assertion test must be extended to cover it. | ~~After D1+D2 exist and one story has used the ledger for real.~~ **D1 now exists and 13-37 has used it for real** — so the remaining gates are D2 (the parse) and, critically, **13-41 landing the toolkit**. Do not start 13-45 before 13-41 is `done`. |
| D4 | **Triage the blind spot**: ⚠️ **RE-MEASURED 2026-07-31: 198 `done` stories / 299 unchecked boxes / 61 stories affected** (the 58/201 estimate came from a three-story spot-check). Most are litter — accepted-by-design notes, parked options, dead commit-hygiene reminders — which IS the problem: **real items are indistinguishable from noise.** WORKED EXAMPLE: `13-9` L1 correctly diagnosed AND prescribed the fix for the 13-47 production defect a month early, sat unchecked in a `done` story, and was only rediscovered from prod data. Original text: Start with the launch-adjacent set (13-24, 13-19, 13-34, 13-21, 13-23, 13-27, 11-2, 13-16) and mark the OSV cluster (13-31/13-32/sec-1/sec-4, ~27 hits) as **managed-elsewhere** — `osv-scanner.toml` + the blocking gate already is their ledger. | The two launch-gating items in §4 came out of a 3-story spot-check. The rest is unmeasured. | Post-blast, or immediately if anything in §4's list turns out to have siblings. |
| D5 | **Make §0 a script** (`scripts/adjudicate-coldstart.sh`): the five checks + prod registry baseline + pinned form, one screen. | A prose command block rots invisibly — §0's `git rev-parse --short A B` silently broke on git 2.52 and cost a session four commands to diagnose. A script fails loudly. | Next time a §0 command misbehaves, or with D2. |
| D6 | ✅ **DONE 2026-08-18 — the SHA is gone from the header**, replaced by the two commands that produce ground truth. It had been wrong a **FOURTH** time when this session opened (header `19b51f5`, prod `9490449`), which is the whole argument: self-staling metadata is read as fact. ~~🔔 **TRIGGER FIRED — 3rd time, 2026-08-10. DO THIS NEXT SESSION.** **Drop the prod SHA from this doc's header.**~~ | It is self-staling metadata: wrong within hours on 2026-07-26 (a docs-only deploy moved prod's HEAD), again on 2026-07-30, and again on 2026-08-09 — where it also asserted *"`main` ahead by docs-only commits"* while an undeployed **code** fix sat on main for 24 hours (§7m). ~~Let D5's script report ground truth instead.~~ | ~~Do with D5.~~ **UNGATED 2026-08-10 — this was wrongly blocked on D5: deleting a line needs no script.** Replace the SHA with the one-line `ssh … git rev-parse --short HEAD` (already added to the header as an interim). |
| D7 | **§5 needs a designated next pick**, one line, pointing at `[[next-story-sequence-post-11-2]]`. | Four stories with no ordering means every cold start re-litigates the choice. | Next cold start that has to choose. |
| D8 | 🔔 **TRIGGER FIRED — measured 2026-08-10: §7 holds 13 entries / the doc is ~140KB / 1,400+ lines.** **Cap §7 at the last two sessions**, archiving older arcs to a dated `docs/session-*.md`. | This doc is growing unbounded; `MEMORY.md` already blew its size budget for exactly this reason. **A cold-start doc nobody can read in one sitting stops being a cold-start doc** — and the trigger passing unnoticed is itself the invisible-debt failure §2a0 exists to catch, happening inside §8. | ~~When §7 passes ~10 entries.~~ **NOW.** Keep §7m + §7l; archive §7 → §7k to `docs/session-2026-07-to-08.md` and leave one pointer line. |
| D9 | ✅ **WORKED EXAMPLE EXISTS (2026-07-30) — copy the block, don't reword it.** **§2j verdict format** — a fixed closing block (verdict / RED-verify evidence / File-List reconciliation / deploy SHA). First use: `13-37-…-ci-guard.md` → `## Closing verdict`. Note what it does when the story is NOT closed: the verdict line reads *"NOT CLOSED — `review`, closing on push"* with the reason, and **deploy SHA is left explicitly `⏳ PENDING`** with the rule written into the block itself — *until that line carries a real SHA, `Status:` must not read `done`*. A block that can only be filled in at close-out gets filled in from memory; one that is filled in at `review` and carries its own hold condition cannot silently go stale. | 13-36's close-out was hand-synced across five places (story body, Change Log, sprint-status, MEMORY, this doc) and the disproven claim survived in three of them. | ~~Do with D1 — same problem, same fix.~~ **DONE, with D1, on 13-37.** Remaining: add it to the story template, and use it at 13-37's actual push (fill the SHA + discharge R1) so the format is proven through a real close, not only a real hold. |
| D10 | **Memory file `pattern-unexplained-rate-is-unmeasured`**, alongside `[[pattern-ship-a-fix-that-never-fires]]` and `[[pattern-flaky-test-hiding-a-prod-bug]]`. | The playbook only helps whoever opens it; memory files surface automatically in any future session. | Next memory write. |
| D11 | ✅ **RESOLVED 2026-07-31; DIRECT PATH DIAGNOSED + HALF-FIXED 2026-08-01.** Both ends were finally MEASURED instead of argued about, and they fail for *different* reasons: **client** `tailscale netcheck` → `UDP: false`, no STUN endpoint, no DERP reply (a mobile link — and note netcheck probes Tailscale's OWN servers, so no VPS firewall rule can cause this); **VPS** → `UDP: true`, public endpoint `159.89.146.93:44949`, SFO 3.3ms, i.e. perfectly healthy. So the outage was client-side, BUT Awwal was right that the firewall independently blocked the DIRECT path: `ufw` allowed only OpenSSH/80/443 — **no UDP at all** — while `tailscaled` binds `--port=41641` (pinned in `/etc/default/tailscaled`). ✅ **Fixed the half we control:** `ufw allow 41641/udp` added (additive only; SSH verified alive immediately after). ⚠️ **STILL OPEN — only Awwal can do it:** if the DigitalOcean CLOUD firewall restricts inbound to ~22 IPs, it drops UDP 41641 *before* ufw ever sees it, so a matching inbound rule must be added in the DO control panel. Even then, direct needs a client network that permits UDP. ⚠️ **My original advice in this row — "get a direct WireGuard path up" — was never measured and was NOT achievable as stated;** same error shape as AJ-1, a plausible fix aimed at the wrong layer. | **Verification no longer depends on any of this:** the `Prod Verify (read-only)` workflow runs every mandatory pre-blast check over the GitHub→VPS SSH path. |

**DECIDED — do not reopen:** the **pre-push hook stays as-is**. It has earned its keep, and tuning turbo
`inputs` to skip the unit suite on e2e-only commits is a convenience win against an under-invalidation risk
— and Pitfall #39/9-58 exist in that hook precisely because it once ran *too little*. Not a pre-launch move.

---
### How to update this doc
At session end: bump the header (date + prod SHA), append to §7 the arc of what you did, and move any newly-adjudicated story out of §5. Keep §2 (the playbook) evergreen — **add a recipe whenever a new gotcha costs you time; that is the primary way this doc earns its keep.** Check §8: if you did a deferred item, delete its row; if a trigger has fired, say so. And re-run the §2a0 gate before flipping any status to `done`.
