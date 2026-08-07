# OSLRS Adjudication-Agent Handoff (LIVING DOC)

**Last updated:** 2026-08-07 (late) · **Prod deployed SHA:** `077e129` · **Health:** https://oyoskills.com/api/v1/health
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

### 2i. Delegating to sub-agents (forks / Explore)
- Useful for broad multi-file traces (e.g. the send-ownership triangulation used 2 parallel Explore agents). BUT **a sub-agent's self-report can claim edits it never persisted** — always `git status`/diff to confirm side-effects landed; if not, do them yourself. ([[feedback_verify_delegated_agent_disk_state]]) An Explore agent's headline can also contradict its own body (13-34 draft-resume: header said "blast-blocking", body proved the opposite) — read the evidence, not the summary.

---

## 3. Current state (2026-08-07) — READ THIS ONE

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
| | |
|---|---|
| **13-54** | ⭐ HIGHEST-EVIDENCE BACKLOG ITEM. The same bug — a respondent written outside the identity chokepoint — has now been hand-fixed THREE times (R13, R21, 13-53), each time protecting one more caller. Twice it cost a named citizen two records. CI guard + the re-runnable negative control. |
| **13-55** | Sequence AFTER 13-54: unify the three promote-to-active paths. One code path, explicit parameters, **not** one policy. |
| **13-50** | `/check-registration` mints dead-end links (244 sends/month); `wizard_resume` unaudited; phantom drafts. |
| **13-51** | Operator contact-correction UI; validate email at capture so we stop manufacturing bounces. |
| **13-52** | Deploy resilience shipped; its TESTS were not written. |
| **13-42** | AC7 hotfixed; **AC8** (bounce line misdirects) + **AC9** (nobody reads the API's stderr — the IPv6 bypass sat there 4 days) + AC1-6 remain. |
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
   it counts confirmations too. Scoped to `campaign_id='draft-invite-2026-08'`: **75 invited, 5
   converted (6.7%)**.

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
| D11 | ✅ **RESOLVED 2026-07-31; DIRECT PATH DIAGNOSED + HALF-FIXED 2026-08-01.** Both ends were finally MEASURED instead of argued about, and they fail for *different* reasons: **client** `tailscale netcheck` → `UDP: false`, no STUN endpoint, no DERP reply (a mobile link — and note netcheck probes Tailscale's OWN servers, so no VPS firewall rule can cause this); **VPS** → `UDP: true`, public endpoint `159.89.146.93:44949`, SFO 3.3ms, i.e. perfectly healthy. So the outage was client-side, BUT Awwal was right that the firewall independently blocked the DIRECT path: `ufw` allowed only OpenSSH/80/443 — **no UDP at all** — while `tailscaled` binds `--port=41641` (pinned in `/etc/default/tailscaled`). ✅ **Fixed the half we control:** `ufw allow 41641/udp` added (additive only; SSH verified alive immediately after). ⚠️ **STILL OPEN — only Awwal can do it:** if the DigitalOcean CLOUD firewall restricts inbound to ~22 IPs, it drops UDP 41641 *before* ufw ever sees it, so a matching inbound rule must be added in the DO control panel. Even then, direct needs a client network that permits UDP. ⚠️ **My original advice in this row — "get a direct WireGuard path up" — was never measured and was NOT achievable as stated;** same error shape as AJ-1, a plausible fix aimed at the wrong layer. | **Verification no longer depends on any of this:** the `Prod Verify (read-only)` workflow runs every mandatory pre-blast check over the GitHub→VPS SSH path. |

**DECIDED — do not reopen:** the **pre-push hook stays as-is**. It has earned its keep, and tuning turbo
`inputs` to skip the unit suite on e2e-only commits is a convenience win against an under-invalidation risk
— and Pitfall #39/9-58 exist in that hook precisely because it once ran *too little*. Not a pre-launch move.

---
### How to update this doc
At session end: bump the header (date + prod SHA), append to §7 the arc of what you did, and move any newly-adjudicated story out of §5. Keep §2 (the playbook) evergreen — **add a recipe whenever a new gotcha costs you time; that is the primary way this doc earns its keep.** Check §8: if you did a deferred item, delete its row; if a trigger has fired, say so. And re-run the §2a0 gate before flipping any status to `done`.
