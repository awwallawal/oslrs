# OSLRS Adjudication-Agent Handoff (LIVING DOC)

**Last updated:** 2026-07-26 · **Prod deployed SHA:** `5d80841` (code = `a69a281`) · **Health:** https://oyoskills.com/api/v1/health

> **You are the OSLRS adjudication agent.** The human (Awwal) develops + code-reviews each story in a SEPARATE CLI, then brings the uncommitted work to THIS session for *final adjudication*. This doc is your cold-start brain: read it + `MEMORY.md` + `git log --oneline -30`, and you are oriented. **This is a LIVING doc — update the header + the relevant sections at the end of every session.** It complements, not duplicates, `MEMORY.md` (atomic facts) and the dated `docs/session-*.md` snapshots (per-session narrative).

---

## 0. Cold-start ritual (run these first)
```bash
git log --oneline -30                       # what shipped recently
git status --short                          # is there uncommitted dev to adjudicate?
git fetch origin -q && git rev-parse --short origin/main HEAD   # local vs origin
# prod truth:
ssh -o ConnectTimeout=25 root@100.93.100.28 'cd /root/oslrs && git rev-parse --short HEAD'
```
Then read `MEMORY.md` (auto-loaded) + this doc. If `git status` shows uncommitted `apps/**` changes + a `_bmad-output/**/<story>.md` with `Status: done`, that IS the story to adjudicate.

---

## 1. The workflow convention (non-negotiable)
- **Human develops + code-reviews elsewhere → you adjudicate here.** The dev work arrives **uncommitted in the working tree** (tracked-modified + untracked-new). The story file's `## File List` is the authoritative set to commit.
- **Adjudication = verify it YOURSELF, never trust the self-report.** Run tsc/eslint/the suites yourself; read the load-bearing code; RED-verify the key fixes. The dev + a code-review LLM already ran; you are the third, independent layer.
- **Then:** selective-commit the File List → push (pre-push runs the full suite) → confirm CI → deploy → VPS SHA → update `MEMORY.md`.
- **Review BEFORE commit**, on the uncommitted tree. Never `git add -A`; never auto-commit at end of dev-story.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Branch = `main` (push directly; that's the convention here).

---

## 2. THE ADJUDICATION PLAYBOOK (reusable every time)

### 2a. Verify-myself checklist
- `pnpm --filter @oslsr/api exec tsc --noEmit` (API) / `cd apps/web && pnpm exec tsc --noEmit` (web). **Scripts are OUTSIDE tsconfig — RUN them / test them, don't trust tsc for `apps/api/scripts/*`.**
- `eslint` the touched files explicitly.
- Run the touched test files: API `NODE_ENV=test DATABASE_URL="postgres://user:password@localhost:5432/app_test" pnpm vitest run <files>`; web `cd apps/web && pnpm vitest run <files>` (NEVER `pnpm vitest run` from root for web — wrong config).
- **File List == git reality**: `git status --short` must match the story's File List. Flag drift.

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

## 3. Current state (2026-07-26)
- **Prod = `5d80841`** (code `a69a281`). Everything code-side for the launch send-system + the wizard is deployed + verified.
- **`campaign_sends` table LIVE on prod** (7 cols + 2 indexes) — the 13-24 cross-system contact-dedupe ledger. Ledger-liveness PROVEN (0→1 on a dry-run, then cleaned).
- Registry baseline: **144 respondents / 81 submissions / 0 campaign_sends** (restore target after any test reg).
- Pinned public form = `019f8ed3` (GPS-free, "Main Occupation (e.g. …)" label). Master enumerator form = `019f8eff` (relabeled, GPS kept).

## 4. The launch picture — operator-gated, nothing code blocks it
1. **Pay Resend Pro ($20)** — the one hard gate (232 emails > free 100/day). Also a HARD long-lead **Termii sender-ID** approval for SMS (independent of email).
2. **13-24 Task 5** — welcome backfill to ~116 emailable: `_backfill-registration-autosends.ts --dry-run` (read the `excluded:` line) → `--apply --confirm-i-am-not-dry-running --rate-per-minute 10`.
3. → **5-day gap** → deduped blasts, **fired in ONE session** (the ledger's 5-day window means the marker + cohort disjointness carry "blast MINUS welcomed", ledger is the backstop — see `docs/runbooks/pre-blast-dry-run.md` §4).
4. Before firing: `docs/runbooks/pre-blast-dry-run.md` — incl. **§2 ledger-liveness `SELECT`** (fail-soft `recordCampaignSend` could silently no-op).
- **13-24 Task 4 (Dry-run #2) = DONE.** Only Task 5 remains on 13-24.
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

---
### How to update this doc
At session end: bump the header (date + prod SHA), append to §7 the arc of what you did, and move any newly-adjudicated story out of §5. Keep §2 (the playbook) evergreen — add a recipe whenever a new gotcha costs you time.
