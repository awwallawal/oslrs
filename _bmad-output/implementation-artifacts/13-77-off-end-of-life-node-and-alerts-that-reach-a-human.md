# Story 13.77: Off end-of-life Node, and CI alerts that reach a human

Status: in-progress

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
- [ ] **Task 1 — Alert channel first** (AC: #2) — ship and drill BEFORE any Node change, so the risky steps below have a working pager.
  - [x] 1.1 With Awwal's go-ahead, set both secrets by piping, never printing:
    `ssh root@oslsr-home-app "grep '^TELEGRAM_BOT_TOKEN=' /root/oslrs/.env | cut -d= -f2- | tr -d '\"'" | gh secret set TELEGRAM_BOT_TOKEN`
    and the same for `TELEGRAM_OPERATOR_CHAT_ID`. Check `gh secret list` (names only).
  - [x] 1.2 Create `.github/actions/telegram-page/action.yml` (composite): inputs `text`, `bot-token`, `chat-id`, `drill`. A missing token or chat id → `::error::` + exit 1.
  - [x] 1.3 Use it in `osv-scheduled.yml` (replace the inline step; fix the "weekly" text), `prod-verify.yml` (scheduled failures) and the `ci-cd.yml` `deploy` job (`if: failure()`).
  - [ ] 1.4 Add the `drill` input to each `workflow_dispatch`. Run the three drills; Awwal confirms three `[DRILL]` messages. Record the run ids.
- [ ] **Task 2 — Repo pins** (AC: #3)
  - [ ] 2.1 `.nvmrc`, `engines`, `@types/node` ×4, Dockerfiles ×2. `pnpm install`, then tsc for all packages.
- [ ] **Task 3 — VPS to `<TARGET>`** (AC: #4, #6) — ⛔ prod change: explicit go-ahead from Awwal at the time, inside a measured quiet hour.
  - [ ] 3.1 Quiet-hour check, plus the AC4a backups.
  - [ ] 3.2 nodesource → `<TARGET>`; `apt install nodejs`; prove `pnpm`/`pm2` resolve.
  - [ ] 3.3 Align pnpm per AC6.
  - [ ] 3.4 `pm2 update` → `node_version` and `process.version` proof → `pm2 save`.
  - [ ] 3.5 Reboot test, as in AC4f.
- [ ] **Task 4 — CI to `<TARGET>`** (AC: #5, #6, #8)
  - [ ] 4.1 Change all `node-version` pins; re-grep for the count. Add the deploy-job major assertion (AC8).
  - [ ] 4.2 `PREPUSH_FULL=1 git push`; quote the suite totals; watch CI to `deploy` success; prod HEAD == pushed SHA (D6).
  - [ ] 4.3 AC6 closure diff, CI vs VPS.
- [ ] **Task 5 — pdfjs and the advisory** (AC: #7)
  - [ ] 5.1 Bump; assert parser row counts; remove the waiver; update the register; OSV gate green without it.
- [ ] **Task 6 — Docs** (AC: #8, #9)
  - [ ] 6.1 Playbook "Node major upgrade" section, plus every doc hit in Dev Notes.

## Dev Notes

### Why the alerting lives in this story
Awwal's instruction (2026-10-16): resolve the Telegram gap inside this story. That is also the right order technically. Tasks 3 and 4 are the riskiest production changes this quarter, and today a failed deploy or a failed scheduled check pages nobody: only `osv-scheduled.yml` has a page step, and it is inert without the secrets. Ship the pager first, then do the risky work under it.

### What made this "sensitive" when it was parked (the sweep's answer)
It is the **deploy path, not the code**. The VPS runs `pnpm install --frozen-lockfile` on every deploy [Source: .github/workflows/ci-cd.yml:1088], and `.npmrc` has `engine-strict=true` [Source: .npmrc:3]. So any dependency whose `engines` excludes the running Node **hard-fails production installs**. Story 11-2 hit exactly this: it pinned `pdfjs-dist@6.1.200` (needs Node ≥22.13), and the deploy failed. It was invisible locally because the laptop runs Node 24 and the real PDF fixture is gitignored [Source: _bmad-output/implementation-artifacts/11-2-import-service-parsers.md:389]. Fix `394a8d0` pinned `5.6.205` (`>=20.19`). That pin keeps GHSA-hq66 open as an accepted risk [Source: docs/security/findings-register.md:71-99; osv-scanner.toml GHSA-hq66 entry].

### Measured facts (do not re-derive; re-verify at dev time)
| Fact | Value | Measured |
|---|---|---|
| VPS Node | 20.20.2 from nodesource apt (`nodesource.list`); `/usr/bin/node` | 2026-10-15 |
| VPS pnpm / pm2 | **10.28.1** / 6.0.14, npm globals in `/usr/lib/node_modules` | 2026-10-15 |
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
- **AC2e drills, 2026-10-16 ~16:07 UTC, all three `page` jobs SUCCESS** (Telegram API accepted each; `curl -f`): osv-scheduled `38929352284` (scan also green), prod-verify `38929378407` (edge-freshness green, SSH verify skipped), ci-cd `38929412982` (every other job skipped). ⭐ **The concurrency fix was proved live:** the ci-cd drill was dispatched while push run `38929242472` (`c4fdb90`) was mid-pipeline, and that run went on to `deploy: success` (prod `c4fdb90`, health 200), with `page-deploy-failure` correctly SKIPPED on a green deploy. ⏳ **Open until Awwal confirms three `[DRILL]` messages in the operator chat**; "the API accepted it" is not "a human saw it".

### File List

### Review Follow-ups (AI)
