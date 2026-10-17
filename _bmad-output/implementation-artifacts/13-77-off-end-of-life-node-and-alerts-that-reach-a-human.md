# Story 13.77: Off end-of-life Node, and CI alerts that reach a human

Status: review

<!--
Created 2026-10-16 via canonical SM *create-story (yolo), on Awwal's instruction: "put the telegram
issue into the story so that we resolve it within the story". Scope evidence was gathered BEFORE
authoring, at Awwal's request ("scope the story before writing it ... do a deep sweep so that we are
not surprised"): a read-only repo sweep plus read-only VPS measurements on 2026-10-15.
Sources: docs/adjudication-session-2026-10-13-to-14.md Part F.3 · docs/adjudication-agent-handoff.md
("What can still trip us", NEXT 0b) · Story 11-2 (the pdfjs/Node parking) · docs/security/findings-register.md.
-->

## Story

As the **operator of OSLRS (Awwal)**,
I want **CI and the production VPS moved off Node 20 (end-of-life since 2026-04-30) onto a supported LTS, with every scheduled or deploy-path failure paging me on Telegram**,
so that **the runtime receives security patches again, the pdfjs advisory held open only by Node 20 can be closed, and a red run is something I am told about instead of something I discover days later**.

## Acceptance Criteria

1. **AC1 — Target major is RULED before any runtime change.** Recommendation: **Node 24** (Active LTS; EOL 2028-04-30). Node 22 reaches EOL **2027-04-30**, six months away, so moving to 22 buys one more migration within the year. The dev laptop already runs v24.13.0. Awwal rules 24 or 22; the ruling is recorded with a two-part attribution (§2al) in the Dev Agent Record. Every `<TARGET>` below means the ruled major.

2. **AC2 — The alert channel is LIVE before the Node work starts (Task 1 lands first).**
   - a. Repo secrets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPERATOR_CHAT_ID` exist (`gh secret list` shows both). Values are the ones prod already uses (`/root/oslrs/.env` carries both names, measured 2026-10-16). They are piped, never printed: no value appears in a terminal, a log, a commit or this story.
   - b. ONE shared composite action, `.github/actions/telegram-page/action.yml`, sends the message. It takes `text` and the two secrets as inputs, adds the run URL, and uses `curl -fsS` with `--data-urlencode`. The existing inline step in `osv-scheduled.yml` is replaced by it, not duplicated.
   - c. It pages on failure in **all three** places where a red run otherwise reaches nobody: `osv-scheduled.yml` (existing), the **scheduled** run of `prod-verify.yml` (daily edge-freshness), and the `deploy` job of `ci-cd.yml` (a failed deploy on main). Each message names what failed and what it blocks. The OSV text no longer says "weekly": the scan has been daily since `f3fb9a8`.
   - d. ⛔ **A missing secret is a FAILURE, not a warning.** Today the step prints `::warning::` and exits 0. That is how the scan sat red from 2026-10-05 to 10-14 unseen. Once AC2a holds, an absent secret means the channel has been lost, and the step must go red (`::error::`, exit 1).
   - e. **Proved by a drill, observed by a human.** Each of the three workflows accepts a `workflow_dispatch` input `drill: true` that sends a message prefixed `[DRILL]` through the same action and then succeeds. One drill run per workflow, and **Awwal confirms receipt in the operator chat**. A green run proves nothing about the page, because the step fires only on red. Record the three run ids and Awwal's confirmation.

3. **AC3 — Repo pins move to `<TARGET>`, all of them, in one commit.**
   - `.nvmrc` (today `20.18.1`, already stale: vite 7.3.6 needs `^20.19.0`).
   - Root `package.json` `engines.node` (today `>=20.0.0`). Set it to the `<TARGET>` major, because `.npmrc` has `engine-strict=true` and this is the fence.
   - `@types/node` → `^<TARGET>` in `package.json`, `apps/api/package.json`, `apps/web/package.json` and `packages/testing/package.json`.
   - `docker/Dockerfile.api` and `docker/Dockerfile.web` → `node:<TARGET>-alpine`.
   - This commit **does not** touch the workflows (AC5) or pdfjs (AC7).

4. **AC4 — The VPS runs `<TARGET>`, proved by the PROCESS, not by health.** It happens in a window opened by a measured quiet hour (the 2026-10-15 reboot recipe: 0 submissions, 0 audit rows, 0 active BullMQ jobs, nginx shows no logged-in traffic):
   - a. Before the change, record `node -v`, `apt-cache policy nodejs`, `/etc/apt/sources.list.d/nodesource.list` and a copy of `/root/.pm2/dump.pm2`.
   - b. Switch the nodesource repo to `setup_<TARGET>.x` and `apt install nodejs`.
   - c. `pnpm` and `pm2` still resolve. They are npm globals under `/usr/lib/node_modules`, so prove it rather than assume it.
   - d. `pm2 update` runs. ⛔ **The PM2 daemon keeps the OLD Node until it does**, while the process shows `online` and health returns 200.
   - e. Proof is `pm2 jlist` `node_version` == `<TARGET>.x` **and** the running API's `process.version`. Then `pm2 save`.
   - f. **A reboot test:** `pm2-root.service` (`ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect`) brings the API back on `<TARGET>` unaided, with all 10 workers initialised and health 200 both locally and publicly.

5. **AC5 — CI runs `<TARGET>` everywhere, and the full suite is green on it.**
   - Every `node-version: 20` moves to `<TARGET>`. Measured 2026-10-16 there are **11**: `ci-cd.yml` ×8 (lines 59/269/390/518/610/673/764/924), `e2e.yml:98`, `benchmarks.yml:46` and `osv-scheduled.yml:53`. Re-grep at dev time; the count is the check.
   - The full suite runs (`PREPUSH_FULL=1`). Quote the SUITE totals (never a subset) for API, web and unit, locally and on CI.
   - ⛔ **Order matters: the VPS (AC4) moves BEFORE this lands.** A `<TARGET>`-only dependency merged while the VPS is still on 20 hard-fails the deploy's `pnpm install` (`engine-strict`). That is exactly the Story 11-2 incident.

6. **AC6 — One pnpm, everywhere.** Measured 2026-10-15: the VPS runs **pnpm 10.28.1** (npm global), while CI and `packageManager` pin **9.15.0**. So every deploy has installed with a different pnpm major than CI tested with.
   - CI, the VPS and the laptop resolve pnpm from ONE source, the `packageManager` field.
   - The dev chooses VPS→9.15.0 (smaller change; matches the lockfile writer) or everything→10.x (pnpm 10 skips dependency lifecycle scripts by default, so the `onlyBuiltDependencies` consequences must be checked), and records the evidence.
   - Proof: `pnpm ls -r --prod --depth Infinity --json` produced by CI and by the VPS describe the SAME closure (diff empty, or every line explained).

7. **AC7 — The advisory held open by Node 20 is closed.** This is the LAST commit, after AC4 and AC5 are proved.
   - `pdfjs-dist` `5.6.205` → `6.2.108` or later. Exact pin; `.npmrc` has `save-exact=true`.
   - Delete the GHSA-hq66-cqwq-w95j `[[IgnoredVulns]]` entry from `osv-scanner.toml`. ⛔ That file IS read by the blocking gate (corrected 2026-10-15), so the gate must pass WITHOUT the waiver.
   - Update `docs/security/findings-register.md` (the GHSA-hq66 entry → CLOSED, with the commit).
   - Keep `isEvalSupported:false` (`apps/api/src/services/import/parsers/pdf-tabular.parser.ts`).
   - ⛔ **Parser regression check with COUNTS:** pdfjs 5.1 and 5.4 once silently extracted **0 rows** (Story 11-2). The import parser tests must assert extracted row counts, not just "no throw". If 6.x changes extraction, STOP and split pdfjs into its own story. Nothing else in this story depends on it.

8. **AC8 — The runtime major can never drift silently again.** The deploy job prints `node -v` on the VPS and FAILS if its major ≠ the `.nvmrc` major (one line, before `pnpm install`). The playbook gains a "Node major upgrade" section: AC4's recipe plus the rollback (Dev Notes).

9. **AC9 — The docs stop saying Node 20.** Every hit in the Dev Notes list is updated or explicitly marked historical, and `_bmad-output/project-context.md:31` (the project bible) is among them. Proof: a re-grep shows no live instruction pointing at Node 20.

## Tasks / Subtasks

- [x] **Task 0 — Ruling** (AC: #1)
  - [x] 0.1 Get Awwal's ruling on `<TARGET>` (24 recommended). Record it with two-part attribution.
- [x] **Task 1 — Alert channel first** (AC: #2) — ship and drill BEFORE any Node change, so the risky steps below have a working pager.
  - [x] 1.1 With Awwal's go-ahead, set both secrets by piping, never printing:
    `ssh root@oslsr-home-app "grep '^TELEGRAM_BOT_TOKEN=' /root/oslrs/.env | cut -d= -f2- | tr -d '\"'" | gh secret set TELEGRAM_BOT_TOKEN`
    and the same for `TELEGRAM_OPERATOR_CHAT_ID`. Check `gh secret list` (names only).
  - [x] 1.2 Create `.github/actions/telegram-page/action.yml` (composite): inputs `text`, `bot-token`, `chat-id`, `drill`. A missing token or chat id → `::error::` + exit 1.
  - [x] 1.3 Use it in `osv-scheduled.yml` (replace the inline step; fix the "weekly" text), `prod-verify.yml` (scheduled failures) and the `ci-cd.yml` `deploy` job (`if: failure()`).
  - [x] 1.5 (drill `39021627180` received — Awwal: "got the drill oslrs is down message", 2026-10-17) (added 2026-10-17, Awwal: "add the uptime alert, then the reboot test") `.github/workflows/uptime.yml`: probe the public `/api/v1/health` every 5 min (3 tries, 30 s apart) and page on STATE CHANGE only (DOWN once, RECOVERED once), keyed on the previous run's `probe` job result. Drill it. Origin: the 2026-10-17 `pm2 update` outage ran 15 min and nothing alerted.
  - [x] 1.4 ✅ Awwal confirmed all three received, 2026-10-17: "drill oslrs edge check failed, drill oslrs deploy failed and drill oslsrs daily osv scan received yesterday". Add the `drill` input to each `workflow_dispatch`. Run the three drills; Awwal confirms three `[DRILL]` messages. Record the run ids.
- [x] **Task 2 — Repo pins** (AC: #3)
  - [x] 2.1 `.nvmrc`, `@types/node` ×4, Dockerfiles ×2. `pnpm install`, then tsc for all packages. ⚠️ `engines` DEFERRED to Task 4.1, see Completion Notes.
- [x] **Task 3 — VPS to `<TARGET>`** (AC: #4, #6) — ⛔ prod change: explicit go-ahead from Awwal at the time, inside a measured quiet hour.
  - [x] 3.1 Quiet-hour check, plus the AC4a backups.
  - [x] 3.2 nodesource → `<TARGET>`; `apt install nodejs`; prove `pnpm`/`pm2` resolve.
  - [x] 3.3 Align pnpm per AC6. ✅ **Already aligned: the premise was a mis-measurement** (see the measured-facts table). The effective VPS pnpm in the repo is 9.15.0 == CI == `packageManager`. AC6's proof is now the deploy-time check (Task 4.1), which reads `pnpm -v` inside the repo on every deploy. Moving to pnpm 10 was considered and REJECTED as out of scope: it would CHANGE prod installs (dependency lifecycle scripts stop running; `node_modules` re-laid out on a 1-vCPU box mid-deploy) for no benefit this story needs.
  - [x] 3.4 `pm2 update` → `node_version` and `process.version` proof → `pm2 save`. (⚠️ `pm2 update` dropped the API: a 15-min outage, restored from backup; see Completion Notes.)
  - [x] 3.5 Reboot test, as in AC4f. ✅ 2026-10-17 09:40:53 UTC, after a quiet-hour check at 10:40 WAT (0 submissions, 0 audit rows, 0 non-health API calls in 60 min; dump = [oslsr-api]; `pm2-root` enabled). Back at 09:41:16:
    - `pm2-logrotate:0` started first, then `oslsr-api:1`. **The boot path uses the SAFE id order**, which confirms the incident root cause is specific to `pm2 update`.
    - `node_version` 24.22.0; every API process runs `/usr/bin/node`; `workers.initialized` logged; error log 0 lines.
    - docker ×3, nginx and tailscaled all active; health 200 local and public; HEAD `8d51868`.
- [x] **Task 4 — CI to `<TARGET>`** (AC: #5, #6, #8)
  - [x] 4.1 Change all `node-version` pins; re-grep for the count. Move root `engines.node` to `>=24.0.0` (deferred here from Task 2). Add the deploy-job major assertion (AC8).
    - 11 `node-version` pins → 24 (ci-cd ×8, e2e, benchmarks, osv-scheduled); re-grep finds 0 left. `e2e.yml` is CRLF and was edited with its line endings preserved.
    - The 6 stale "Node 20-compatible pnpm" comments were rewritten. pnpm pins stay at 9.15.0 (see 3.3).
    - Deploy job, right after `git pull`: fails unless `node` major == `.nvmrc` major AND the in-repo `pnpm -v` == `packageManager`. Dry-run read-only on the VPS: node 24 / want 24, pnpm 9.15.0 / want 9.15.0.
    - The dry run is what exposed the pnpm mis-measurement: my first edit had moved CI and `packageManager` to 10.28.1, and it was reverted before commit.
    - actionlint findings identical before and after (all pre-existing shellcheck notes); `pnpm install --frozen-lockfile` clean, lockfile untouched.
  - [x] 4.2 `PREPUSH_FULL=1 git push`; quote the suite totals; watch CI to `deploy` success; prod HEAD == pushed SHA (D6).
    - ✅ 2026-10-17: the pre-push suite ran in FULL (root `package.json` forces it). API 4771 passed / 9 skipped; web 3301 passed / 2 todo; utils 126; types 138; testing 64; 0 failed.
    - CI run `39029160692`: every job green on Node 24.
    - Deploy log 11:39:16Z: `runtime: node 24 (want 24), pnpm 9.15.0 (want 9.15.0)` — the AC8 check passing on a real deploy.
    - prod HEAD `13f9cbf`, `oslsr-api` online, health 200.
  - [x] 4.3 AC6 closure diff, CI vs VPS. Superseded: both run pnpm 9.15.0 against the same frozen lockfile, so the closure is identical by construction, and the deploy check now enforces the pnpm equality on every deploy.
- [x] **Task 5 — pdfjs and the advisory** (AC: #7)
  - [x] 5.1 Bump; assert parser row counts; remove the waiver; update the register; OSV gate green without it.
    - `pdfjs-dist` 5.6.205 → **6.4.299**: released 2026-10-03, 14 days old, engines `>=22.13.0 || >=24`, ≥ the 6.2.108 fix.
    - Lockfile: pdfjs-dist, its optional `@napi-rs/canvas` 0.1.100 → 1.0.11 (Node-API prebuilds, engines `>= 10`), and `node-readable-to-web-readable-stream` dropped. Nothing else moved.
    - ⭐ **Row counts measured on the REAL register, beyond CI's `> 3000` threshold.** The gitignored fixture was absent, but `~/Downloads/Oyo_shortlisted_artisans.pdf` (the ITF-SUPA shortlist; PII, used locally only, counts and hashes printed, never rows) ran through `extractPdfItems` + `parsePdfTabular` before and after. **Byte-identical:** 25,822 items, 3,673 rows, 3,673 with email, 43 LGAs, 0 failures, and identical SHA-256 of items, canonical rows and raw cells. Time 7.7 s → 8.2 s.
    - ⚠️ **AC7 "keep `isEvalSupported:false`" could not be met as written.** pdfjs 6 removed the option (tsc TS2353), and the 6.4.299 legacy main + worker builds contain 0 `isEvalSupported`, 0 `new Function(`, 0 `eval(`: the eval path it disabled is gone upstream, so the defence is now structural. The call-site comment records this and says to restore the option if an eval path returns. The real-register comparison was re-run after the removal: still identical.
    - Waiver deleted from `osv-scanner.toml` (a tombstone comment is left; header updated). The prod-scope gate, run locally with the CI image digest and the new lockfile: "✅ No production dependency is vulnerable", hq66 absent from the output. 5 dev-only advisories are listed non-blocking (braces, markdown-it, source-map-js, sprintf-js, vitest), unrelated to this change.
    - `docs/security/findings-register.md` GHSA-hq66 → ✅ CLOSED, with the evidence. The font / CMap workaround is kept (removing it was not compared).
    - tsc 0 errors; `src/services/import` 64 passed / 1 skipped (the gitignored real-fixture test, replaced by the manual comparison above); eslint clean.
- [x] **Task 6 — Docs** (AC: #8, #9)
  - [x] 6.1 Playbook "Node major upgrade" section, plus every doc hit in Dev Notes.
    - `docs/infrastructure-cicd-playbook.md` §1.5a: the real 20 → 24 run as a recipe (quiet hour, backups, install, `pm2 update` WITH the `pm2 ls` check, process-level proof, reboot test, CI last, rollback), plus a note that `pnpm -v` is per-directory.
    - Node 20 → 24 in `_bmad-output/project-context.md` (the bible, :31 and :860), `docs/portable-playbook.md`, `vps-setup-checklist.md` (CRLF kept), `docs/NEW-LAPTOP-SETUP-GUIDE.md` (CRLF kept; `nvm install 24`), and `architecture.md` (7 sites).
    - Re-grep: the only "Node 20" left is playbook Pitfall #25, which is about the GitHub Actions RUNNER runtime (`using: node20`), not the app. It is correct as written.
- **Task 5 on prod (2026-10-17 12:00Z, run `39030516377`):** CI's blocking OSV gate "✅ No production dependency is vulnerable" without the waiver; deploy `runtime: node 24 (want 24), pnpm 9.15.0 (want 9.15.0)`; the VPS `apps/api` resolves pdfjs-dist 6.4.299, which loads under v24.22.0; `oslsr-api` online, error log 0, health 200, HEAD `7fa7323`.

## Dev Notes

### Why the alerting lives in this story
Awwal's instruction (2026-10-16): resolve the Telegram gap inside this story. That is also the right order technically. Tasks 3 and 4 are the riskiest production changes this quarter, and today a failed deploy or a failed scheduled check pages nobody: only `osv-scheduled.yml` has a page step, and it is inert without the secrets. Ship the pager first, then do the risky work under it.

### What made this "sensitive" when it was parked (the sweep's answer)
It is the **deploy path, not the code**. The VPS runs `pnpm install --frozen-lockfile` on every deploy [Source: .github/workflows/ci-cd.yml:1088], and `.npmrc` has `engine-strict=true` [Source: .npmrc:3]. So any dependency whose `engines` excludes the running Node **hard-fails production installs**. Story 11-2 hit exactly this: it pinned `pdfjs-dist@6.1.200` (needs Node ≥22.13), and the deploy failed. It was invisible locally because the laptop runs Node 24 and the real PDF fixture is gitignored [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md:389]. Fix `394a8d0` pinned `5.6.205` (`>=20.19`). That pin keeps GHSA-hq66 open as an accepted risk [Source: docs/security/findings-register.md:71-99; osv-scanner.toml GHSA-hq66 entry].

### Measured facts (do not re-derive; re-verify at dev time)
| Fact | Value | Measured |
|---|---|---|
| VPS Node | 20.20.2 from nodesource apt (`nodesource.list`); `/usr/bin/node` | 2026-10-15 |
| VPS pnpm / pm2 | global **10.28.1** / 6.0.14, npm globals in `/usr/lib/node_modules`. ⛔ **CORRECTED 2026-10-17:** inside `/root/oslrs`, `pnpm -v` = **9.15.0**. pnpm 10 switches itself to `packageManager` by default, so deploys always installed with 9.15.0, the same as CI. The 10-15 reading was taken from `$HOME`, where no `packageManager` applies | 2026-10-15 / 2026-10-17 |
| CI pnpm | 9.15.0 (every workflow + root `packageManager`) | 2026-10-16 |
| PM2 boot unit | `pm2-root.service`, `ExecStart=/usr/lib/node_modules/pm2/bin/pm2 resurrect`, system PATH | 2026-10-15 |
| API process | `bash -c "npx tsx src/index.ts"`, cwd `/root/oslrs/apps/api`; dump == live | 2026-10-15 |
| glibc | 2.39 (Ubuntu 24.04) | 2026-10-15 |
| Kernel | 6.8.0-147, rebooted 2026-10-15 16:39 UTC, all services back unaided | 2026-10-15 |
| Native deps | bcrypt 6.0.0 (Node-API prebuilds), sharp 0.35.5 (`@img/sharp-linux-x64`), msgpackr-extract 3.0.3. No `requiresBuild` in the lockfile; no rebuild expected | sweep 2026-10-15 |
| Tooling ranges | tsx 4.21 (`>=18`), vitest 4.1.8, vite 7.3.6, typescript 5.9.3, ioredis 5.8.2, playwright 1.58.2; turbo / drizzle-kit / bullmq declare none. All allow 22 and 24 | sweep |
| Code-level Node breaks | **none found**: no import assertions, `--loader`, `--experimental-*`, `punycode`, `url.parse`, `fs.rmdir` recursive, `util.is*`, `process.binding`, `new Buffer`, `createCipher` | sweep |
| Telegram env on prod | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID` present (names only) | 2026-10-16 |

### Behaviour that may still differ on the new major (watch for it, don't pre-fix)
- `require(esm)` is on by default from 22.12, which can change how a dependency resolves.
- Bundled undici / `fetch` changes.
- The stream default highWaterMark rose from 16 KiB to 64 KiB.
- New runtime deprecation warnings at API start. Read the first 200 lines of `pm2 logs` after AC4 and record any `DeprecationWarning`.
- The old CI flake bcrypt "Module did not self-register" is a worker-thread loading issue, not an ABI mismatch. If it appears, `gh run rerun <id> --failed` and note it; it is not evidence against the upgrade.

### Rollback (write it into the playbook, AC8)
- **VPS:** switch nodesource back to `setup_20.x`, `apt install nodejs=20.20.2-1nodesource1`, `pm2 update`, `pm2 save`, prove `node_version`.
- **Order of reversal:** revert Task 5 (pdfjs 6 needs ≥22.13) **before** reverting Task 4 / AC3 pins. A `<TARGET>` VPS runs Node-20-compatible code fine, so the VPS never needs to go back first.
- Before Task 5, `node_modules` needs no rebuild (Node-API only).

### Held back by Node 20 (released by this story, optional cleanup)
- `pdfjs-dist` (AC7). It may also make the font / CMap workaround in `pdf-tabular.parser.ts` unnecessary; verify before deleting.
- `apps/api/scripts/audit-rate-limit-keys.ts:20` avoided `import.meta.dirname`, and `apps/api/scripts/restore-orphaned-form-schemas.mjs:223` avoided `Object.groupBy`. Optional; not an AC.

### Docs still saying Node 20 (AC9)
`docs/infrastructure-cicd-playbook.md:100` (`setup_20.x`) · `_bmad-output/project-context.md:31` · `docs/portable-playbook.md:725,1293` · `_bmad-output/implementation-artifacts/vps-setup-checklist.md:268` · `docs/NEW-LAPTOP-SETUP-GUIDE.md:117-128` (`nvm install 20.18.1`) · `_bmad-output/planning-artifacts/architecture.md:371,4581` · `docs/security/findings-register.md:78` ("RE-REVIEW when Node 22 lands").
⚠️ Do NOT confuse with `docs/active-watches.md:44`, which is the GitHub Actions *runner* runtime (node24), not the app.

### Dependencies
- **Awwal:** the AC1 ruling, the go-ahead to set secrets (Task 1.1), the drill confirmations (AC2e), and the go-ahead for the prod window (Task 3).
- No story blocks this one. 13-72 / R-A8 and the consent-gate story are independent.

### Risks
1. CI flipped before the VPS → deploy install fails. Mitigated by the AC5 order.
2. PM2 silently stays on the old Node → mitigated by the AC4e process proof and the AC8 deploy assertion.
3. nodesource upgrade disturbs the npm globals (pnpm/pm2) → AC4c proves they resolve; the fallback is `npm i -g pnpm@<pinned> pm2@6.0.14`.
4. pdfjs 6 extraction regression → AC7 counts; split if it fires.
5. Alert noise from the deploy page. It fires only on `failure()` of the deploy job on main: measured rare, and every instance is actionable.

### Project Structure Notes
- NEW: `.github/actions/telegram-page/action.yml`. This is the repo's first local composite action, so check the path convention against GitHub's (`uses: ./.github/actions/telegram-page`, which needs `actions/checkout` first in that job).
- Touched: `.nvmrc`, `package.json` (root + `apps/api`, `apps/web`, `packages/testing`), `pnpm-lock.yaml`, `docker/Dockerfile.{api,web}`, `.github/workflows/{ci-cd,e2e,benchmarks,osv-scheduled,prod-verify}.yml`, `osv-scanner.toml`, `apps/api/src/services/import/parsers/pdf-tabular.parser.ts` (only if the workaround goes), the docs listed above.
- A root lockfile / root `package.json` change forces the FULL pre-push suite (§2ar). Plan for it; run with `NODE_ENV=test DATABASE_URL=…/app_test` and Docker up (`pnpm services:up`).

### References
- [Source: docs/adjudication-session-2026-10-13-to-14.md#F.3] — VPS measurements, the sweep, and this story's origin.
- [Source: docs/adjudication-agent-handoff.md — "What can still trip us", NEXT 0b] — the Telegram gap and the unset secrets.
- [Source: .github/workflows/osv-scheduled.yml:93-111] — the existing inline page step (warns and exits 0 on missing secrets).
- [Source: .github/workflows/prod-verify.yml:29-45] — the daily schedule and why a dispatch-only gate is never pulled.
- [Source: .github/workflows/ci-cd.yml:999-1010, 1078-1088] — the deploy job and the VPS `pnpm install`.
- [Source: .npmrc:1-4] — `engine-strict=true`, `save-exact=true`.
- [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md:389] — the pdfjs/Node incident.
- [Source: docs/security/findings-register.md:71-99] — GHSA-hq66 accepted-risk entry.
- [Source: osv-scanner.toml header] — the toml IS read by the blocking gate; emergency-unblock recipe.
- [Source: docs/infrastructure-cicd-playbook.md:100, 976-985] — Node install and the PM2 startup notes.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), 2026-10-16.

### Debug Log References

### Completion Notes List

- **AC1 RULED 2026-10-16: <TARGET> = Node 24.** Recommendation and evidence by adjudication (scoping sweep, session record F.3); RULING by Awwal ("24 as recommended"), 2026-10-16.
- **AC2a:** both repo secrets set 2026-10-16 15:59 UTC by piping each value from prod `/root/oslrs/.env` into `gh secret set` (format checked first without printing: one line each, no quotes, no CR). `gh secret list` shows both. No value was displayed.
- **AC2b–d:** `.github/actions/telegram-page/action.yml` (composite; missing secret = ::error + exit 1). Page JOBS, not steps, so a drill needs nothing to fail: osv-scheduled `page` (replaces the inline step; "weekly" text fixed), prod-verify `page` (schedule failures of edge-freshness only), ci-cd `page-deploy-failure` (the deploy job's OWN failure only, not a skipped deploy). actionlint 1.7.7: 0 findings on all three.
- ⛔ **Two traps found while wiring the ci-cd drill, both fixed:** (1) ci-cd's concurrency group is per-ref with `cancel-in-progress`, so a drill dispatched on main would have CANCELLED an in-flight deploy. Drills now get a `-drill` group. (2) `dashboard` runs `if: always()`, so it would have run on a drill with every test skipped; now excluded on dispatch. `lint-and-build` is skipped on dispatch and every other job needs it, so a ci-cd drill runs ONLY the page job.
- ⚠️ **Process slip, recorded:** the first write of these notes used backticks inside a bash `node -e` string and bash EXECUTED them (memory: pitfall-backticks-in-node-e-under-bash). Every substitution failed harmlessly: two were `gh secret set\` / `gh secret list\`, rejected as unknown commands, and `gh secret list` afterwards still shows both secrets at 15:59. The notes were committed with blanks in `c4fdb90` and repaired in the next commit.
- **A real failure during a drill run is paged as real** (osv / prod-verify): the [DRILL] prefix applies only when the watched job did not fail.
- prod-verify's SSH `verify` job does not run on a drill (it must not touch prod to test a pager).
- ⚠️ **AC3 SPLIT, a defect in this story's own order (found at dev time, 2026-10-16).** AC3 put root `engines.node` into the Task 2 commit, before the VPS and CI move. But `.npmrc` has `engine-strict=true`, and pnpm checks the ROOT project's `engines` as well as dependencies'. So that commit would have made `pnpm install` refuse on CI (Node 20) and on the VPS deploy (Node 20): the exact Story 11-2 failure this story exists to avoid. Task 2 therefore ships `.nvmrc` (`24`, major only, so it never goes stale and AC8 can compare majors), `@types/node ^24.19.0` ×4 and Dockerfiles `node:24-alpine`. `engines` moves in Task 4.1, with the CI flip, after the VPS is on 24.
- **Task 2 evidence:** the lockfile's resolved-package set changed in exactly two entries: `@types/node` 20.19.27 → 24.19.2 and its type-only dependency `undici-types` 6.21.0 → 7.24.6. The other 146 changed lines are peer-suffix churn, and no runtime package moved. tsc `--noEmit`: api 0, web 0, types 0, utils 0, config 0; `packages/testing` 3 errors, all **pre-existing** (identical on the baseline). They are vitest-4 type exports in `src/reporter.ts` (`Reporter`, `File`, `Task`), unrelated to Node and left for their own fix.
- **Task 3, 2026-10-17 (Saturday). Go-ahead by Awwal ("hi can we proceed", then "continue").**
  - Quiet window measured at 08:59 UTC / 09:59 WAT: 0 submissions in 60 min (last 10-16 16:57), 0 audit rows, 0 active BullMQ jobs, 5 nginx lines, none to /api. Re-checked at 10:02 WAT.
  - Backups in `/root/backups/node-upgrade-20261017/`: node version, apt policy, `nodesource.list`, `dump.pm2`, `pm2 jlist`, pnpm / pm2 versions, npm globals (corepack 0.34.6, npm 10.8.2, pm2 6.0.14, pnpm 10.28.1). Then `nodesource.list` → `node_24.x`; candidate `24.22.0-1nodesource1`.
  - ⚠️ The auto-mode permission classifier refused the `apt-get install` from the agent twice ("Production Deploy"), even with Awwal's chat go-ahead. **Awwal ran the install + `pm2 update` himself with `!`**, which is the right shape for a prod runtime change.
  - Result: `node -v` v24.22.0; pnpm 10.28.1 and pm2 6.0.14 still resolve (AC4c ✓).
  - 🚨 **INCIDENT, 09:07–09:22 UTC (~15 min): `pm2 update` brought the PM2 daemon back on Node 24 WITHOUT the API.** PM2's own log, 09:07:08:
    - the new daemon (Node.js 24.22.0) resurrected `oslsr-api` as **id 0**;
    - then the `pm2-logrotate` MODULE reported itself "not running, starting…", and PM2 logged `Stopping app:oslsr-api id:0` → `exited with code [0] via signal [SIGINT]`.
    - **An id collision between the module and the app during `pm2 update`.** Before the update the ids were logrotate 0 / api 1; the update's resurrect reversed them. The API never errored (error log empty).
    - The chained command then hung inside `pm2 update`, so `pm2 save` and the health line never ran. The process-level check (AC4e, not health) found it 14 min later: `pm2 ls` showed only `pm2-logrotate`, local health 000, public 502.
    - **Restored by adjudication at 09:22:** copied the 08:59 backup `dump.pm2` back and ran `pm2 resurrect` → `oslsr-api` online, health 200 local and public, all workers initialised. The post-update dump was kept as `dump.pm2.after-update`.
    - **Impact: none measured.** nginx 09:06–09:23 shows ONE 502, the agent's own health probe; 0 submission attempts (Saturday morning, field idle).
  - **AC4e proven after restore:** every API process runs `/usr/bin/node` (v24.22.0); `pm2 jlist` `node_version` 24.22.0; `workers.initialized` logged; error log 0 lines; `pm2 save` → dump holds `oslsr-api` (cwd `/root/oslrs/apps/api`, `npx tsx src/index.ts`).
  - ⛔ **Playbook correction for AC8:** never chain `pm2 update && pm2 save`. With a PM2 module installed, `pm2 update` can drop the app. The safe sequence:
    1. `pm2 save` before anything else;
    2. `pm2 update`;
    3. check that `pm2 ls` shows `oslsr-api online` — if not, `pm2 resurrect` from the saved dump;
    4. `pm2 save` only after that check.
    The reboot test (AC4f) is the boot path's own proof: the 2026-10-15 reboot came back with ids logrotate-first, but that was under Node 20 and has to be re-proved.
  - Side slip: `pkill -f "pm2 update"` matched its own shell command line and killed that SSH session (the hung client had already exited). Use `pgrep` then kill the pid, never `pkill -f` with a pattern the command itself contains.
- **AC2e drills, 2026-10-16 ~16:07 UTC, all three `page` jobs SUCCESS** (Telegram API accepted each; `curl -f`): osv-scheduled `38929352284` (scan also green), prod-verify `38929378407` (edge-freshness green, SSH verify skipped), ci-cd `38929412982` (every other job skipped). ⭐ **The concurrency fix was proved live:** the ci-cd drill was dispatched while push run `38929242472` (`c4fdb90`) was mid-pipeline, and that run went on to `deploy: success` (prod `c4fdb90`, health 200), with `page-deploy-failure` correctly SKIPPED on a green deploy. ⏳ **Open until Awwal confirms three `[DRILL]` messages in the operator chat**; "the API accepted it" is not "a human saw it".

### File List

- NEW `.github/actions/telegram-page/action.yml` · NEW `.github/workflows/uptime.yml`
- `.github/workflows/ci-cd.yml` (Node 24 ×8, drill + concurrency + dashboard guard, `page-deploy-failure`, deploy runtime check), `osv-scheduled.yml`, `prod-verify.yml`, `e2e.yml` (CRLF), `benchmarks.yml`
- `.nvmrc`, `package.json` (engines, `@types/node`), `apps/api/package.json` (`@types/node`, pdfjs-dist), `apps/web/package.json`, `packages/testing/package.json` (CRLF), `pnpm-lock.yaml`
- `docker/Dockerfile.api`, `docker/Dockerfile.web`
- `apps/api/src/services/import/parsers/pdf-tabular.parser.ts` (comments; `isEvalSupported` removed, with the reason)
- `osv-scanner.toml` (GHSA-hq66 waiver deleted; header corrected), `docs/security/findings-register.md`
- `docs/infrastructure-cicd-playbook.md` (§1.5a), `docs/portable-playbook.md`, `docs/NEW-LAPTOP-SETUP-GUIDE.md`, `_bmad-output/project-context.md`, `_bmad-output/planning-artifacts/architecture.md`, `_bmad-output/implementation-artifacts/vps-setup-checklist.md`
- Prod (not in git): nodesource `node_24.x`, nodejs 24.22.0, `/root/backups/node-upgrade-20261017/`, pm2 dump re-saved. Repo secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID`.

### Review Follow-ups (AI)
