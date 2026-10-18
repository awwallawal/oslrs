# Story 13.78: A watchdog outside the thing it watches

Status: in-progress

<!--
Created 2026-10-17 via canonical SM *create-story (yolo), on Awwal's instruction ("draft the 13-78
watchdog story"). Origin: Story 13-77's 2026-10-17 `pm2 update` outage (09:07–09:22 UTC, site 502,
nothing alerted) and the measurement that GitHub delays EVERY scheduled workflow on this repo by
4–5 h, so 13-77's uptime.yml cannot be the monitor.
Sources: _bmad-output/implementation-artifacts/13-77-off-end-of-life-node-and-alerts-that-reach-a-human.md
(Completion Notes: Task 3 incident; Task 6 uptime finding) · docs/infrastructure-cicd-playbook.md §1.5a.
-->

## Story

As the **operator of OSLRS (Awwal)**,
I want **a watchdog on the VPS that pages Telegram within ~2 minutes when the API, the database or Redis stops answering, and an external monitor that pages me when the whole server or its network is unreachable**,
so that **an outage like 2026-10-17's (15 minutes, found only because an agent happened to look) reaches me while it is happening, without depending on GitHub's schedule or on the API that has just died**.

## Acceptance Criteria

1. **AC1 — What is checked, and how.** Every minute, from the VPS itself, each check has a timeout:
   - a. **API liveness:** `curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/v1/health` == `200`. This is liveness only (`apps/api/src/routes/index.ts:34`); it would have caught 10-17.
   - b. **PM2 has the app:** `pm2 jlist` contains `oslsr-api` with status `online`. This catches the exact 10-17 shape (PM2 alive, app gone), even in the seconds before nginx starts failing.
   - c. **Postgres answers:** `docker exec oslsr-postgres pg_isready -U oslsr_user -d oslsr_db`.
   - d. **Redis answers:** `docker exec oslsr-redis redis-cli -a <pw from REDIS_URL> --no-auth-warning ping` == `PONG`. Never print the password.
   - ⛔ The deep `/api/v1/system/health` endpoint is super-admin-authenticated (`system.routes.ts:36-37`), so do NOT use it, and do not add an unauthenticated deep-health route for this.

2. **AC2 — Pages on a STATE CHANGE, after confirmation.**
   - A component is DOWN after **2 consecutive failing runs** (~2 min). One blip never pages.
   - Exactly ONE Telegram message on DOWN, naming the failed check(s) and the first triage command (`pm2 ls`, `docker ps`).
   - Exactly ONE on RECOVERED, with the downtime duration.
   - Nothing while the state is unchanged.
   - If a DOWN send fails (curl non-zero), the next run retries the send. It is not marked sent.

3. **AC3 — Independent of what it watches.**
   - **bash + curl + docker CLI only.** No node, no tsx, no pnpm, no app code. The 10-17 failure was in the Node/PM2 layer, and a watchdog running through it shares its fate.
   - Telegram credentials are read from `/root/oslrs/.env` by parsing ONLY `TELEGRAM_BOT_TOKEN` and `TELEGRAM_OPERATOR_CHAT_ID` (`grep '^KEY=' | cut -d= -f2-`). Never `source` the file; never print a value.
   - `flock -n` on a lock file, so an overrunning run is skipped, not stacked.
   - State lives in `/var/lib/oslsr-watchdog/` (failure counter, the down-since timestamp, whether a page is pending).

4. **AC4 — Installed by a file in the repo, by the operator.**
   - The script is `scripts/health-watchdog.sh`, versioned, updated by every deploy's `git pull`.
   - The schedule is `infra/cron/oslsr-health-watchdog`: a cron.d file running the script every minute as root, with output appended to `/var/log/oslsr-health-watchdog.log`.
   - **Installing is a prod change, so AWWAL runs it with `!`:** copy the cron.d file into `/etc/cron.d/`. The 13-77 precedent is that the agent's permission classifier blocks prod installs. Document the one-liner.
   - Logrotate for the log (weekly, keep 4), or have the script cap its own log size. Pick one and say why.

5. **AC5 — The watchdog's own silence is visible.**
   - Each run writes a heartbeat timestamp to `/var/lib/oslsr-watchdog/last-run`.
   - The deploy job (ci-cd `deploy`, after the 13-77 runtime check) prints the heartbeat age and emits a `::warning::` if it is older than 10 minutes or missing. A WARNING, deliberately not a failure: a broken monitor must not block a hotfix deploy. Record the trade.
   - A watchdog that stopped running is otherwise indistinguishable from "all fine".

6. **AC6 — Proved by a live drill, in a quiet hour, with Awwal's go-ahead.**
   - Quiet-hour measurement as in playbook §1.5a.
   - `pm2 stop oslsr-api` → within ~2–3 min ONE "DOWN" page naming `api` and `pm2`.
   - `pm2 start oslsr-api` → ONE "RECOVERED" page with the duration.
   - Awwal confirms both messages arrived. Record the downtime, the page timestamps, and the nginx 502 count in the window.
   - `pm2 stop` and `pm2 start` are prod actions: Awwal runs them with `!` if the classifier refuses.

7. **AC7 — An external monitor for the cases the VPS cannot report on its own** (box down, network down, Cloudflare or DNS broken).
   - Awwal creates a free UptimeRobot account (owned by him; the agent cannot create accounts) and a 5-minute HTTP(S) monitor on `https://oyoskills.com/api/v1/health`, expecting 200.
   - Alerts go to Telegram if the free plan offers it; otherwise email plus the mobile app. **Verify the free plan's alert channels at setup; do not assume.**
   - Proof: UptimeRobot's own "test notification" received.
   - Record the monitor in `docs/infrastructure-cicd-playbook.md` (who owns the account, where alerts go). Never record credentials.

8. **AC8 — Docs.**
   - Playbook section "Monitoring and paging": the four layers (in-API alerting, this watchdog, UptimeRobot, the GitHub backstops) and what each can and cannot see.
   - `uptime.yml`'s header points at this story as the real monitor.
   - The 13-77 handoff trip-wire box is updated.

## Tasks / Subtasks

- [x] **Task 1 — The script** (AC: #1, #2, #3)
  - [x] 1.1 `scripts/health-watchdog.sh` (`set -u`, explicit exit handling; not `set -e`, so one failing check cannot abort the others). Every probe sits behind an overridable variable (`WATCHDOG_HEALTH_CMD`, `WATCHDOG_PM2_CMD`, `WATCHDOG_PG_CMD`, `WATCHDOG_REDIS_CMD`, `WATCHDOG_SEND_CMD`), plus `WATCHDOG_STATE_DIR` and `WATCHDOG_ENV_FILE`, so tests can stub them. Defaults are the real commands.
  - [x] 1.2 State machine as in AC2. Message text names the failed checks and never includes a secret.
- [ ] **Task 2 — Tests** (AC: #2, #3)
  - [x] 2.1 `apps/api/src/__tests__/health-watchdog.script.test.ts` (vitest) spawns `bash ../../scripts/health-watchdog.sh` with stubbed commands and a temp state dir.
  - [x] 2.2 Cases:
    - one failure → no page;
    - two → one DOWN;
    - three → still one;
    - recovery → one RECOVERED with a duration;
    - a failed DOWN send → retried next run;
    - stdout and the message never contain the token;
    - a held lock → the run is skipped.
  - [x] 2.3 Mutation check: change "2 consecutive" to 1 → a named test goes red.
  - [ ] 2.4 Runs on CI (ubuntu) and on the Windows laptop (Git Bash). If `flock` is missing on Git Bash, gate only that one case on the platform and say so.
- [x] **Task 3 — Install files** (AC: #4)
  - [x] 3.1 `infra/cron/oslsr-health-watchdog` (cron.d format: `* * * * * root /root/oslrs/scripts/health-watchdog.sh >> /var/log/oslsr-health-watchdog.log 2>&1`), plus the log-size decision.
  - [x] 3.2 Make the script executable in git (`git update-index --chmod=+x`). ⚠️ Windows checkouts lose the mode, so verify with `git ls-files -s`.
- [x] **Task 4 — Deploy heartbeat warning** (AC: #5) — inside the deploy SSH script, after the 13-77 runtime check. Warning only.
  - [x] 4.1 🆕 **Inherited from 13-77's adjudication (2026-10-18), three low alerting defects, each to be FIXED or RULED (Awwal), never silently dropped (§2ad):**
    - (a) The deploy script's `pnpm -v` failure under `set -e` exits BEFORE the `PREV_HEAD` reset, so the tree stays on the new commit.
    - (b) `page-deploy-failure` can page for a deploy that was cancelled while still QUEUED.
    - (c) A timed-out edge-freshness job may conclude `cancelled` and not page (`prod-verify.yml` ~448).
    Source: the 13-77 story, "Adjudication and closure".
- [ ] **Task 5 — Install + drill on prod** (AC: #4, #6) — ⛔ Awwal's go-ahead and a quiet hour. Awwal runs the install, and `pm2 stop`/`start`, with `!` if the classifier refuses. The agent verifies each step read-only.
- [ ] **Task 6 — UptimeRobot** (AC: #7) — Awwal sets it up; the agent records it.
- [x] **Task 7 — Docs** (AC: #8).

### Review Follow-ups (AI) — adversarial code review, 2026-10-18 (0 High · 3 Medium · 5 Low)
- [x] [AI-Review][Medium] M1 A flapping service floods the pager: DOWN needs 2 failing runs but RECOVERED only 1 passing run. Measured: (fail, fail, ok) ×4 = 8 pages in 12 min. RECOVERED must need 2 passing runs too. [scripts/health-watchdog.sh:243-264] ✅ FIXED: RECOVERED needs CONFIRM_RUNS (2) passing runs in a row (`oks`/`first_ok` state); a failing run resets the streak; downtime = first failure → first passing run of the confirming streak. Test "a FLAPPING service…" (4 flaps → 1 DOWN, 0 RECOVERED; then 1 RECOVERED "11m 0s"). Mutation `oks -ge 1` → RED (2 tests).
- [x] [AI-Review][Medium] M2 A worsening outage is silent: DOWN paged for redis, then api + pm2 die → no page (run logged `fail: api, pm2, redis (run 5, state down)`), and RECOVERED names only redis. Send one confirmed "WORSE" page per newly failing component; RECOVERED names everything that failed. (Awwal approved going beyond AC2's letter: "fix them all".) [scripts/health-watchdog.sh:216-242] ✅ FIXED: `paged_checks` + `worse_seen` state; a component not yet paged that fails 2 runs in a row sends ONE "⚠️ OSLRS WORSE", retried until delivered; `down_checks` is the union, named in RECOVERED. 3 tests. Mutations: no confirmation → RED (3), never sent → RED (2).
- [x] [AI-Review][Medium] M3 The real send path (`curl -K -`) and the real probe commands (`docker exec -e REDISCLI_AUTH`, `pg_isready` args, `pm2 jlist`, the health curl) have no test: every test stubs them. Deleting `-K -` or `-e REDISCLI_AUTH` keeps 23/23 green. Test them with fake `curl`/`docker`/`pm2` on PATH. [apps/api/src/__tests__/health-watchdog.script.test.ts] ✅ FIXED: 3 tests run with NO overrides and fake `curl`/`docker`/`pm2` first on PATH that accept ONLY the exact real invocation (exit 99 otherwise). Asserts: all 4 probes pass; redis pw via env; token only on curl stdin; chat_id/text as form fields; a curl failure is not marked sent. Mutations: drop `-K -` → RED (2); drop `-e REDISCLI_AUTH` → RED.
- [x] [AI-Review][Low] L1 The assertion that the log never contains the token cannot fail: the script never writes WATCHDOG_LOG_FILE (cron's `>>` does), so the file does not exist in that test. [health-watchdog.script.test.ts:238] ✅ FIXED: the dead assertion removed, with a comment: run() already asserts stdout+stderr (= the cron log) on every run.
- [x] [AI-Review][Low] L2 The heartbeat is written even when no page can be delivered (missing creds / bad token), so the deploy check reports a healthy watchdog that cannot reach Awwal. Record when sends started failing; the deploy warns past 10 min. [scripts/health-watchdog.sh:155-160, ci-cd.yml deploy] ✅ FIXED: `send_failed` writes `page_failing_since` on the first failed send (missing creds or curl error); a delivered page deletes it; the deploy warns past 600 s (warning only). Behaviour test + static test. Mutation: never record → RED.
- [x] [AI-Review][Low] L3 The log path lives in two places (the script default and the cron redirect), not tied by any test; if one changes, the 1 MiB cap silently stops. [scripts/health-watchdog.sh:36, infra/cron/oslsr-health-watchdog:16] ✅ FIXED: static test ties the cron `>>` path to the script default.
- [x] [AI-Review][Low] L4 4.1(b) gate: a renamed deploy JOB gives empty output → pages with no warning (a renamed STEP warns). Make it warn too. [.github/workflows/ci-cd.yml gate step] ✅ FIXED: a `"")` case warns + pages. Static test; mutation → RED; case patterns exercised in bash.
- [x] [AI-Review][Low] L5 `printf %b` URL-decoding of the Redis password also interprets backslash escapes (`\c` truncates it). Decode only `%XX`. [scripts/health-watchdog.sh:124] ✅ FIXED: `url_decode` decodes only `%XX` (`printf %b` on the escape alone). Test with `wcord%5Cn`. Mutation: old decoder → RED.

## Dev Notes

### Why this exists (measured, 2026-10-17)
- `pm2 update` dropped `oslsr-api` for **15 minutes** (09:07–09:22 UTC; the site returned 502). Nothing paged:
  - the 13-77 CI pages only see failed CI runs;
  - the API's own alerting dies with the API;
  - prod-verify's edge check is daily.
- 13-77 added `uptime.yml` (every 5 min via GitHub Actions). Then measured: **GitHub delays every schedule on this repo by 4–5 h.** The 06:17 OSV cron ran at 10:46 on 10-17 and at 11:26 on 10-16. The first scheduled uptime run fired ~3.5 h after the workflow was added (13:08 UTC). It stays as a backstop only.

### Layers after this story
| Layer | Sees | Cannot see |
|---|---|---|
| In-API alerting (Telegram, already live) | DB / queue / app-level problems while the API runs | its own death |
| **13-78 watchdog (VPS cron)** | API process gone or hung, PM2 lost the app, postgres / redis down | the whole box or its network down |
| **13-78 UptimeRobot (external)** | box, network, nginx, Cloudflare, DNS, TLS | which component inside the box failed |
| GitHub `uptime.yml` / prod-verify | the same as UptimeRobot, hours late | — (backstop) |

### Facts to reuse (do not re-derive)
- Telegram secrets on prod: `/root/oslrs/.env`, keys `TELEGRAM_BOT_TOKEN` (46 chars) and `TELEGRAM_OPERATOR_CHAT_ID` (10 chars); one line each, no quotes, no CR (measured 2026-10-16).
- Redis password: inside `REDIS_URL` (`redis://<user>:<pw>@…`). `redis-cli` without it answers `NOAUTH`. The `REDIS_PASSWORD` key is NOT the right one (`WRONGPASS`, measured 2026-10-15).
- Containers: `oslsr-postgres`, `oslsr-redis` (restart `unless-stopped`); DB `oslsr_db`, user `oslsr_user`.
- Existing VPS cron (root crontab): `*/15 … cf-traffic-watch.ts` via `pnpm exec tsx`. That one is app-coupled by design; this one must not be.
- PM2 boot order is `pm2-logrotate:0`, then `oslsr-api:1` (13-77 reboot test). The app name, not the id, is the key.
- ⚠️ `pkill -f "<pattern>"` over SSH kills its own shell (13-77). Use pgrep plus the pid in any test or drill tooling.

### Risks
1. **False pages** from a deploy's `pm2 restart` (a few seconds): the 2-consecutive-minutes rule absorbs it. Verify by deploying once after install and confirming no page.
2. **The watchdog hangs** on a docker exec: every probe gets a `timeout 10`, and the lock skips overlapping runs.
3. **Secret leakage into the log**: tests assert the token never appears in stdout or stderr.
4. **Cron mail**: cron.d output is redirected to the log, so nothing piles up in root's mailbox.

### Project Structure Notes
- NEW `scripts/health-watchdog.sh` (the root `scripts/` dir already holds ops scripts such as `check-env.sh` and `audit-403-tests.sh`).
- NEW `infra/cron/oslsr-health-watchdog` (`infra/` exists, with `infra/nginx/`).
- NEW `apps/api/src/__tests__/health-watchdog.script.test.ts`. Root `scripts/` has no runner for shell scripts; the API's vitest suite runs on CI and pre-push.
- Touched: `.github/workflows/ci-cd.yml` (the deploy heartbeat warning), `.github/workflows/uptime.yml` (the header), `docs/infrastructure-cicd-playbook.md`, `docs/adjudication-agent-handoff.md`.

### References
- [Source: _bmad-output/implementation-artifacts/13-77-off-end-of-life-node-and-alerts-that-reach-a-human.md — Completion Notes, Task 3 incident; Task 6 uptime finding]
- [Source: apps/api/src/routes/index.ts:34] — `/api/v1/health` is liveness only.
- [Source: apps/api/src/routes/system.routes.ts:36-37] — the deep health route is super-admin only.
- [Source: docs/infrastructure-cicd-playbook.md §1.5a] — quiet-hour recipe, and the pm2 update trap.
- [Source: .github/workflows/uptime.yml header] — the GitHub schedule-throttling measurement.
- [Source: .github/actions/telegram-page/action.yml] — the message conventions (a `[DRILL]` prefix for drills).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), BMAD dev-story, 2026-10-18. Picked over the first `ready-for-dev` row (11-3) because handoff §3 NEXT 1 and the memory both name 13-78.

### Debug Log References

Measured before writing (read-only, 2026-10-18 ~10:05 UTC, prod at `4c23318`):
- **VPS tools:** jq, flock, timeout, logrotate, curl, docker, python3, pm2 (`/usr/bin/pm2` → `/usr/lib/node_modules/pm2`), node `/usr/bin/node`. `/var/lib/oslsr-watchdog` does not exist yet.
- **`pm2 jlist` shape** (counted, never printed: it holds the app env): one compact array starting `[{"pid":1260,"name":"pm2-logrotate"…`, 2 `{"pid":` objects, 2 `"status":"online"` keys, so exactly one status per app. That is what the bash parser relies on.
- **Under cron's minimal env** (`env -i HOME=/root PATH=/usr/bin:/bin`): `pm2 jlist` works, `pg_isready` gives "accepting connections" with rc 0, health gives 200.
- ⛔ **The Redis probe was NOT measured.** The auto-mode classifier refused the SSH command that reads `REDIS_URL` from prod `.env`, and I did not work around it. The first proof is the first run after install: the log must say `ok`, not `fail: redis`. If redis alone fails, suspect the password parse first (user/pw split, URL-encoding).
- **Laptop:** Git Bash 5.2.37 has `timeout` but no `flock`. The first `bash` on the Windows PATH is WSL's (`System32\bash.exe`), and WSL has only the docker-desktop distro, with no bash in it.
- **GitHub jobs API on this repo's cancelled ci-cd runs (for 4.1(b)):**
  - Cancelled while queued: `runner=null`, 0 steps. Runs 31774773899, 31251118398, 31221646764, 30998608414.
  - Cancelled during checkout (32847322078): the Deploy step is `skipped`, but it STILL HAS a `started_at`. So `started_at` is not a usable signal.
  - Cancelled mid-deploy (31022437074): the Deploy step concluded `cancelled`.
  - The final gate filter was run against those runs plus a renamed-step case. Outputs: `9 skipped` → no page, `0 ` → no page, `9 cancelled` → PAGE, `9 ` (renamed) → PAGE.

### Completion Notes List

**Task 1: `scripts/health-watchdog.sh`** (`set -u`, never `set -e`).
- Probes AC1a–d, each behind `timeout` (10 s).
- State machine per AC2: DOWN after `CONFIRM_RUNS=2` consecutive failing runs, ONE DOWN page, ONE RECOVERED page with the duration (measured from the first failing run).
- An undelivered page is not marked sent and retries every run.
- State is one file per key in `/var/lib/oslsr-watchdog/`. The heartbeat is `last-run`.
- Decisions beyond the letter of the ACs, each for a stated reason:
  - **Redis auth goes through `REDISCLI_AUTH`, not `-a`.** `docker exec -e REDISCLI_AUTH` copies it from the environment, so the password is on no argv (`ps`). Stronger than AC1d's `-a … --no-auth-warning`, and it is still never printed. `%XX` in the URL password is decoded.
  - **The Telegram token goes to curl as a `-K -` config on stdin**, so it is also off argv. Any send error text is scrubbed of the token before it is logged.
  - **`pm2 jlist` is parsed in bash (no jq).** jq is on the VPS but not on the laptop, and the tests run in both places. The parser anchors on `{"pid":N,"name":"oslsr-api"` and needs `"status":"online"` in that object only.
  - **`pm2` is itself node.** The watchdog's own core (state, lock, paging) uses no node. If node or pm2 breaks, the `pm2` check fails and pages, which is correct.
  - **RECOVERED is retried as well**, not only DOWN. If DOWN never went out, RECOVERED says so.
  - Extra test-only overrides: `WATCHDOG_LOG_FILE`, `WATCHDOG_NOW` (fake clock), `WATCHDOG_PROBE_TIMEOUT`. `CONFIRM_RUNS` is deliberately NOT overridable.
  - Times are formatted with bash `printf %(…)T` in UTC, with no `date` fork. On Git Bash this cut one run from ~4 s to ~1.3 s.
- **Log size (AC4): the script caps its own log.** Over 1 MiB, it keeps the newest 512 KiB, truncated in place because cron holds the file open for append. Chosen over a logrotate file because it means ONE install step instead of two, and a forgotten logrotate install cannot fill the disk. Volume: one line a minute ≈ 150 KB a day, so 1 MiB is about a week.
- **Flock:** if `flock` is missing (Git Bash), the run goes ahead unlocked with a `WARN` line. The VPS has flock (measured).

**Task 2: `apps/api/src/__tests__/health-watchdog.script.test.ts`, 24 tests.** It spawns the real script with stub probes, a stub send and a fake clock.
- Cases:
  - 1 fail → no page; a blip that recovers → no page ever; 2 → one DOWN naming the checks and the triage commands; 3–4 → still one.
  - Recovery → one RECOVERED with "Down about 3m 0s".
  - Failed DOWN send → retried. Failed RECOVERED send → retried, and it notes that DOWN never went out.
  - The token is in no stdout/stderr/message/log, and is scrubbed from a failing send's stderr.
  - Missing creds → logged, then paged once the creds are back.
  - pm2: the 10-17 shape (logrotate online, api stopped), api missing, empty output, jlist never printed.
  - postgres/redis named. Redis password decoded and passed via env; no `REDIS_URL` → no auth exported.
  - A hung probe is cut off by the timeout. The log cap.
  - 5 static wiring checks (the cron line, the deploy heartbeat WARNS not fails, 4.1(a)/(b)/(c)).
  - The held-lock case (skipped where there is no flock).
- On Windows, Git Bash is found by walking up from `where git` to the folder that has `bin\bash.exe` (`WATCHDOG_TEST_BASH` overrides).
- **2.3 mutation check, done:** with `CONFIRM_RUNS=1`, "ONE failing run does not page" and "a blip that recovers… never pages" both went RED (the second on `expected '🚨 OSLRS DOWN…' to be ''`). Reverted. Assertion order was then fixed so the first test fails on the page itself.
- ⏳ **2.4 is left unchecked.** The lock case is gated on `flock` and has NOT run anywhere yet. It first runs on CI (ubuntu) after the push. Tick it from that run's log.
- Windows file run: 18 passed, 1 skipped (flock) before the 5 static checks were added; those then passed alone. Full-suite numbers: see below.

**Task 3:**
- `infra/cron/oslsr-health-watchdog`: `SHELL=/bin/bash`, a full `PATH`, `MAILTO=""`, and `* * * * * root /bin/bash /root/oslrs/scripts/health-watchdog.sh >> /var/log/oslsr-health-watchdog.log 2>&1`.
- The header has the operator install line (`install -m 0644 -o root -g root …`), the uninstall line, and the cron.d rules (no dot in the file name, root-owned, ends with a newline).
- `git ls-files -s`: script `100755`, cron file `100644`. Both are LF (counted with node).

**Task 4: deploy heartbeat (AC5).**
- After the 13-77 runtime check and before `pnpm install`, the deploy prints the heartbeat age.
- It emits `::warning::` when the heartbeat is missing, non-numeric, or older than 600 s. Never `exit 1`.
- ⚖️ **Trade, recorded:** a broken monitor must not block a hotfix deploy, so the warning is seen only by whoever reads the run.
- **Prediction:** every deploy until Awwal installs shows the "NO heartbeat" annotation. ⚠️ Unverified: whether a `::warning::` printed inside `appleboy/ssh-action` becomes a GitHub annotation. 13-77's `::error::` lines rely on the same path. Check the first deploy's annotations; if it is absent, the line is still in the log.

**Task 4.1: the three inherited 13-77 defects, all FIXED (none ruled away):**
- **(a)** The four runtime reads are now `$(…) || X=unavailable|unreadable`, so a failing `pnpm -v` becomes a mismatch, and the mismatch branch runs `git reset --keep "$PREV_HEAD"`.
- **(b)** `page-deploy-failure` has a new gate step (`actions: read`, `gh api …/jobs`). On `cancelled` it pages only if the "Deploy to DigitalOcean VPS" step ran:
  - 0 steps → queued, no page.
  - `skipped` → no page.
  - Steps present but none with that name (renamed) → page with a warning.
  - API error → page (fails open).
  - `failure` and the drill path are unchanged. A static test pins the gate's step name to the real step.
- **(c)** prod-verify `page` now fires on a scheduled `cancelled` too, because a job that hits `timeout-minutes` concludes `cancelled`. The page text names the result and explains both cases. A drill is tagged `[DRILL]` only if the edge check succeeded, so a real cancel during a drill pages as real.

**Task 7: docs.**
- Playbook **Part 7a "Monitoring and paging"**: the four-layer table, a status line saying NOT INSTALLED / NOT SET UP, watchdog checks, paging rules, files, the install one-liner, verify, uninstall, the heartbeat warning trade, the drill, and an UptimeRobot section with blanks to fill at setup (never credentials).
- `uptime.yml` header points at 13-78 / Part 7a.
- Handoff §3 trip-wire box: built, uncommitted, not installed; nothing pages until install + drill + UptimeRobot.

**⛔ HALTED at Tasks 5–6: they need Awwal.**
- Task 5 is a prod install plus a `pm2 stop`/`start` drill in a quiet hour, with his go-ahead.
- Task 6 is an UptimeRobot account that only he can create.
- The install copies from `/root/oslrs`, so the code must be deployed first, which needs a commit and a push.

**Gates:**
- eslint on the new test: clean.
- `tsc --noEmit -p apps/api`: clean.
- `pnpm lint:story-residuals`: ✅ 333 stories, no open residuals.
- Full API suite (`apps/api`, `NODE_ENV=test`, app_test, 2026-10-18): **335 files, 333 passed, 2 skipped; 4,804 tests, 4,794 passed, 10 skipped, 0 failed**; exit 0, 492 s. The watchdog file: 24 tests, 23 passed, 1 skipped (the flock case).

### File List

- `scripts/health-watchdog.sh` (new, mode 100755)
- `infra/cron/oslsr-health-watchdog` (new)
- `apps/api/src/__tests__/health-watchdog.script.test.ts` (new)
- `.github/workflows/ci-cd.yml` (deploy: 4.1(a) fallbacks + heartbeat warning; page-deploy-failure: 4.1(b) gate + `actions: read`)
- `.github/workflows/prod-verify.yml` (4.1(c) page on `cancelled`; text; drill tag)
- `.github/workflows/uptime.yml` (header points at 13-78)
- `docs/infrastructure-cicd-playbook.md` (Part 7a; code review: paging rules incl. WORSE + 2-pass recovery, page-failure warning, install-after-deploy)
- `docs/adjudication-agent-handoff.md` (§3 trip-wire box)
- `_bmad-output/implementation-artifacts/13-78-a-watchdog-outside-the-thing-it-watches.md` (this file)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (13-78 → in-progress)

### Change Log

- 2026-10-18: dev-story (Opus 5.5). Tasks 1–4 (incl. 4.1 a/b/c) and Task 7 built and tested. Tasks 5–6 and sub-task 2.4's lock case are pending (Awwal / first CI run). Story stays `in-progress`.
- 2026-10-18: adversarial code review (Opus 5.5, BMAD). 0 High / 3 Medium / 5 Low. Awwal chose "action items AND fix them all". All 8 fixed, each RED-verified by mutation; still UNCOMMITTED. Story stays `in-progress` (Tasks 5–6, 2.4).

### Senior Developer Review (AI)

**Reviewer:** Claude Opus 5.5 (BMAD code-review), for Awwal, 2026-10-18. ⚠️ Same model as the dev-story, so this is not an independent review; a different-model review or the adjudication should still look.

**Verified as claimed:** the File List matches git exactly (10 files, 0 discrepancies). Every `[x]` task has evidence, and the unchecked ones (2.4, 5, 6) are honestly open. I re-ran the 24-test file myself (23 passed, 1 skipped for flock). 4.1(a)/(b)/(c) logic, the deploy warning-only trade and the cron.d rules are correct. The real send path was proven by hand with a fake `curl` before it was tested.

**Findings → outcome** (detail in Tasks → Review Follow-ups):
- M1 flapping service = DOWN/RECOVERED pair every ~3 min (measured 8 pages / 12 min) → FIXED: recovery needs 2 passing runs.
- M2 an outage that gets worse was silent (measured) → FIXED: one confirmed "WORSE" page per newly failing component. ⚖️ Goes beyond AC2's "nothing while the state is unchanged"; approved by Awwal's "fix them all".
- M3 the real commands had no test → FIXED with fake `curl`/`docker`/`pm2` on PATH.
- L1 dead assertion · L2 heartbeat hid an unpageable watchdog · L3 log path in two places · L4 gate silent on a renamed job · L5 `%b` decoder ate backslashes → all FIXED.

**Two test-harness traps found while writing M3 (kept as comments in the test):** Git for Windows' `bash.exe` launcher puts its own `/usr/bin` ahead of the PATH it is given (the real `curl` won), and a `C:/…` PATH entry splits at its colon. On the first attempt, "a real curl failure is not marked sent" PASSED only because the real curl was failing. A test that passes for the wrong reason; caught because its sibling tests failed.

**Gates after the fixes (2026-10-18):**
- Watchdog file: **36 tests, 35 passed, 1 skipped (flock)**, on Windows / Git Bash, `NODE_ENV=test`, app_test.
- 8 mutations, each RED in exactly its named tests, every file md5-restored.
- `eslint` on the test file clean. `tsc --noEmit -p apps/api` clean. `bash -n` clean.
- Both workflow YAMLs parse (js-yaml). 0 CRLF in the script, the cron file and ci-cd.yml. Script still `100755` in the index.
- ⚠️ The full API suite was NOT re-run by the review. Only this file changed in the API tree, plus +12 tests: prediction 4,804 → **4,816 tests**. Run it before the commit.
- ⚠️ The DOWN path is unchanged, so the 2.3 `CONFIRM_RUNS=1` mutation was not repeated. `CONFIRM_RUNS` now also governs RECOVERED and WORSE.

**Outcome:** Changes requested → all applied. The ACs are not all met yet (AC6 drill, AC7 UptimeRobot), so the story stays `in-progress`. ⚠️ The AC6 drill's RECOVERED page now lands about 2 min after `pm2 start`, not 1 (playbook 7a.1 updated).

### ⚖️ PRE-ADJUDICATION RECORD — 2026-10-18 (code-review session, for the adjudication agent)

⛔ **NOT an adjudication.** Written by the code-review session at Awwal's request ("write the adjudication section in the file for the adjudication agent"). The adjudication agent adopts, amends or rejects every line. "This session" means the reviewer. Nothing below is a ruling unless it quotes Awwal; every proposal is `PROPOSED — awaiting ruling`.

⚠️ **WEIGH THIS ACCORDINGLY.** The dev-story, the code review AND the review's fixes were all Opus 5.5, and the fixes (M1–M3, L1–L5) have had no review at all except their own mutation checks. That is the configuration the handoff's first box warns about. **Recommended: a fresh-context review of the post-review diff, briefed from the evidence below and the code, NOT from this record** (handoff lesson: brief a reviewer from evidence, not the conclusion).

**This session's reading (not a verdict):** the code does what the ACs ask, plus three behaviours the ACs did not ask for (WORSE page, 2-pass recovery, page-failure warning). Nothing is deployed or installed. AC6 and AC7 are unmet by design: they need Awwal. **Not ready to close. Ready to COMMIT after the gates in §B.**

#### A. Tree state, as left by this session (2026-10-18, HEAD `4c23318`)

- `git status`: 7 files ` M`, `infra/cron/oslsr-health-watchdog` `A `, **`scripts/health-watchdog.sh` `AM`**, test file `??`. That matches the File List (10 entries).
- ⛔ **`AM` trap:** the INDEX holds the dev-story's pre-review script (staged earlier); the working tree holds the reviewed one (+123 changed lines). A commit without `git add scripts/health-watchdog.sh` ships the UNREVIEWED script with the REVIEWED tests, and CI goes red on M1/M2/L2/L5. Re-stage it, then confirm `git ls-files -s scripts/health-watchdog.sh` still reads `100755`.
- Commit by explicit pathspec (the 10 File List paths), never `git add -A`. The working tree also holds `.vitest-live-*.json`, `vitest-report.json` and marker files from test runs.

#### B. Gates the adjudication should run itself (nothing here was run on the final tree except the watchdog file)

| Gate | This session's result | Prediction / what to look for |
|---|---|---|
| Watchdog test file (Windows, Git Bash) | 36 tests: 35 passed, 1 skipped (flock) | Same. Slow: ~3 min on this laptop (bash forks on Windows). |
| **Full API suite** (`apps/api`, `NODE_ENV=test`, app_test) | ⛔ NOT RUN after the review | **4,816 tests = 4,806 passed + 10 skipped, 0 failed, 335 files.** The dev-story's 4,804 / 4,794 / 10, plus the 12 the review added. Any other delta is unrecorded work (handoff lesson). |
| `tsc --noEmit -p apps/api`, eslint on the test | clean | clean |
| `pnpm lint:story-residuals` | ✅ 333 stories | Run it from `apps/api` directly: turbo replays the cached result on docs-only commits. |
| CI (ubuntu), first push | — | **The flock case RUNS and passes: 36/36.** That is sub-task 2.4's only evidence; tick 2.4 from that log line, not before. |

#### C. Claims the adjudication should check rather than inherit

Ordered weakest first. **C1 is this session's weakest.**

1. **C1 — M2 (the WORSE page) goes beyond AC2's letter** ("Nothing while the state is unchanged"). This session asked Awwal and he answered "create action items (critical to low) and fix them all automatically". That approves the fix. It is arguably not a ruling on amending AC2's wording. **PROPOSED: Awwal ratifies the AC2 deviation explicitly, or the adjudication reads his reply as covering it and says so.** Attribution: proposed by the review · approved for build by Awwal 2026-10-18 · AC wording UNRULED.
2. **C2 — M1 changes the AC6 drill's expected timing.** RECOVERED lands up to ~2 min + API boot time after `pm2 start`, not 1. The reported "Down about…" is first failure → first passing run, so it is accurate to ±60 s, not to the second. AC6 does not state a bound, so this is a note, not a conflict.
3. **C3 — deviations the dev-story recorded, still UNRATIFIED** (nobody has ruled on any of them):
   - (a) Redis auth via `REDISCLI_AUTH` env, not AC1d's `-a … --no-auth-warning`. Stronger: not on argv.
   - (b) AC3 says parse ONLY the two Telegram keys, but the script also reads `REDIS_URL`. AC1d requires that read; the ACs contradict each other.
   - (c) The log caps itself at 1 MiB instead of using logrotate. AC4 allows either, "pick one and say why"; the reason is recorded.
   - (d) RECOVERED is retried as well as DOWN.
   - (e) A missing `flock` runs unlocked with a WARN, rather than refusing to run.
4. **C4 — the Redis probe has NEVER run against prod.** The dev-story's SSH read of `REDIS_URL` was refused by the classifier. The M3 tests prove the invocation shape and the URL parse, not that this password works against that container. **First real evidence: the first log lines after install must say `ok`, not `fail: redis`** (§D, step 3).
5. **C5 — dev-story measurements this session did NOT re-check:**
   - VPS tools and the `pm2 jlist` shape (2026-10-18 ~10:05 UTC).
   - The cancelled-run IDs behind 4.1(b): 31774773899, 31251118398, 31221646764, 30998608414, 32847322078, 31022437074.
   - The "4 of the last 7 cancelled deploys were queued" count in the ci-cd comment.

   Spot-check one queued run and 32847322078 with `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs --jq '.jobs[]|select(.name=="deploy")|{steps:(.steps|length), d:[.steps[]|select(.name=="Deploy to DigitalOcean VPS")|.conclusion]}'`.
6. **C6 — the `pm2 jlist` parser depends on key order** (`{"pid":N,"name":"oslsr-api"`). A pm2 upgrade that reorders keys fails it CLOSED (a DOWN page saying pm2, while the app is fine). Loud, not silent. Not fixed; the reasoning is in the script. Any future `pm2 update` (§1.5a) should be followed by one manual run of the watchdog.
7. **C7 — UNVERIFIED (dev-story's own flag):** does a `::warning::` printed inside `appleboy/ssh-action` become a GitHub annotation? The first deploy answers it (§D, step 1). If it does not, the warning is only in the log, and AC5's "visible" is weaker than claimed. 13-77's `::error::` lines share the path, so the answer covers them too.
8. **C8 — role conflict in the File List.** `docs/adjudication-agent-handoff.md` was edited by the DEV-STORY session (§3 trip-wire box), because AC8 asks for it. Per Awwal's 2026-09-13/09-29 instruction, the handoff belongs to the adjudication agent. **PROPOSED:** the adjudication treats that hunk as a proposal (adopt, amend or revert) and owns the final text. This session did not touch the handoff.

#### D. Runbook after commit: predictions and stop conditions

Each step: who runs it, then the prediction, then what stops the line.

1. **Push → CI → deploy** (adjudication). Predict:
   - CI green; 36/36 in the watchdog file, flock included.
   - The deploy log shows `runtime: node 24 … pnpm 9.15.0`.
   - Then **`::warning::VPS health watchdog has NO heartbeat`**, because nothing is installed yet.
   - No page-failure warning (no state dir yet).
   - **STOP** if the deploy fails at the heartbeat block: it must be warning-only. Record whether the warning became an annotation (C7).
2. **Install** (Awwal, with `!`; a prod change): playbook 7a.1's one-liner, only after step 1's deploy has put the files in `/root/oslrs`.
3. **First minutes after install** (adjudication, read-only): `tail -5 /var/log/oslsr-health-watchdog.log`. Predict `ok` lines one minute apart, NO `WARN: flock`, and `last-run` under 120 s old.
   - **STOP and uninstall** (`rm /etc/cron.d/oslsr-health-watchdog`) if a page fires while the site is healthy.
   - If `fail: redis` alone: the password parse (C4). Check the user/pw split and URL-encoding, without printing the value.
   - If `fail: pm2` alone: the key order (C6).
4. **One ordinary deploy after install** (Risk 1). Predict: no page (`pm2 restart` takes seconds; it would need 2 failing runs a minute apart), and the deploy prints `watchdog heartbeat: <120s old`, with no warning.
5. **AC6 drill** (Awwal's go-ahead, quiet hour per §1.5a; `pm2 stop`/`start` by Awwal with `!` if refused). Predict:
   - **ONE** `🚨 OSLRS DOWN … api, pm2` at 1–2 min after stop (2 runs, minute-aligned). Never 3+ min unless a run overran.
   - **No** WORSE page: postgres/redis stay up.
   - **ONE** `✅ OSLRS RECOVERED … (api, pm2; …)` 1–2 min after the API answers again, with "Down about" ≈ the stop→start gap ±60 s.
   - Record: both Telegram timestamps, Awwal's confirmation of receipt, and the nginx 502 count for the window.
   - **STOP:** a second DOWN, a RECOVERED before the API answers, or no DOWN after 4 min. Then `pm2 start oslsr-api` first, diagnose second.
6. **AC7 UptimeRobot** (Awwal only). Verify the free plan's alert channels at setup; do not assume Telegram. Then the test notification, and fill playbook 7a.2. Never record credentials.
7. **Close-out:** update the playbook 7a "NOT YET INSTALLED" status line, and the uptime/handoff trip-wire text.

#### E. 📋 PROPOSED HANDOFF UPDATES (for the adjudication agent to adopt, amend or reject; this session did not edit the handoff)

1. **§3 trip-wire box:** replace the dev-story's "BUILT, UNCOMMITTED, NOT installed" line with the state after this review: code-reviewed (0H/3M/5L, all fixed and mutation-verified, same model), and the `AM` staging trap from §A until the commit lands. After install and drill, the line becomes "watchdog live since <date>; UptimeRobot <state>".
2. **Lesson candidate: a test that passed for the wrong reason.** "A real curl failure is not marked sent" passed on its first run only because the fakes were NOT on PATH, so the REAL curl was failing. It was caught only because its two sibling tests failed. The rule: a negative test (X does not happen) needs a positive sibling proving the path was reached. This extends the existing "test that passes over a hole" pattern.
3. **Pitfall candidate (Windows test harness):**
   - Git for Windows' `bin\bash.exe` launcher PREPENDS its own `/mingw64/bin:/usr/bin` to the PATH it is given, so fakes passed through a spawned process's PATH lose to the real binaries.
   - A `C:/…` entry also splits at its colon inside bash.
   - Fix: set PATH inside `bash -c`, via `cygpath -u`.
4. **Paging-design note for any future monitor:** confirm RECOVERY the same way as DOWN, and page when an outage gets worse. Measured on this watchdog before the fix: a crash loop gave 8 pages in 12 min, and a Redis outage hid the API dying.

#### F. Attribution (two-part, on every line)

| Item | Evidenced by | Ruled by |
|---|---|---|
| M1, M3, L1–L5 fixes | this code-review session (tests + mutations, §Senior Developer Review) | build approved by Awwal 2026-10-18 ("fix them all automatically"); closure UNRULED |
| M2 fix | this session (measured before and after) | build approved by Awwal, same words; **AC2 wording UNRULED (C1)** |
| C3 (a)–(e) deviations | dev-story record | UNRULED |
| 2.4, AC6, AC7, Tasks 5–6 | — (not yet possible) | — |


### ⚖️ Adjudication — code part (2026-10-18, adjudication agent)

Scope: Tasks 1–4 (incl. 4.1), Task 7, and the review fixes. Tasks 5–6 and sub-task 2.4 cannot be adjudicated before the code is deployed. **Status stays `in-progress`.**

**Re-run or re-measured by adjudication, not inherited:**
- **Script logic read end to end** (DOWN / WORSE / RECOVERED state, send path, probes): no defect found.
- **C4 CLOSED: the Redis probe works on prod.** The uncommitted script was run once on prod via `ssh … bash -s < scripts/health-watchdog.sh`, under cron's environment (`env -i HOME=/root PATH=<cron.d PATH>`), with `WATCHDOG_STATE_DIR=/tmp/wd-adj` and `WATCHDOG_SEND_CMD="exit 0"`. Output: `2026-10-18T14:22:58Z ok`, rc 0. All four probes passed, including the Redis password parsed from `REDIS_URL`. Temp files removed. No page was possible: one run, and a fake send.
- **C5 spot-checked:** the gate's own jq against three real cancelled runs gives exactly the predicted decisions: 31774773899 → `0 ` (queued, no page), 32847322078 → `9 skipped` (no page), 31022437074 → `9 cancelled` (page).
- **Full API suite** (`apps/api`, `NODE_ENV=test`, app_test, 2026-10-18): **335 files (333 passed, 2 skipped); 4,816 tests = 4,806 passed + 10 skipped, 0 failed**, exit 0, 408 s. **The prediction was EXACT.** Watchdog file: 36 tests, 1 skipped (flock, Windows).
- **C8:** the dev-story's handoff §3 hunk was ADOPTED as written (it is accurate).
- **The `AM` trap was cleared at commit:** the reviewed script was re-staged and its mode checked (`100755`).

**Awaiting Awwal's rulings** (proposed by the review; adjudication agrees with each, but may not sign them, §2al):
- **C1:** the WORSE page (beyond AC2's letter).
- **C3a–e:** REDISCLI_AUTH instead of `-a`; the `REDIS_URL` read; the self-capped log; RECOVERED retried too; no flock → runs unlocked with a WARN.

**Next, in order:**
1. CI: tick 2.4 from the flock case's line.
2. First deploy: the NO-heartbeat warning; record whether it became an annotation (C7).
3. Awwal installs (Part 7a.1).
4. Read the log back.
5. One ordinary deploy, no page.
6. The AC6 drill.
7. UptimeRobot.
