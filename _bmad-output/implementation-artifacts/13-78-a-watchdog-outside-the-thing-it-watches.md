# Story 13.78: A watchdog outside the thing it watches

Status: ready-for-dev

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

- [ ] **Task 1 — The script** (AC: #1, #2, #3)
  - [ ] 1.1 `scripts/health-watchdog.sh` (`set -u`, explicit exit handling; not `set -e`, so one failing check cannot abort the others). Every probe sits behind an overridable variable (`WATCHDOG_HEALTH_CMD`, `WATCHDOG_PM2_CMD`, `WATCHDOG_PG_CMD`, `WATCHDOG_REDIS_CMD`, `WATCHDOG_SEND_CMD`), plus `WATCHDOG_STATE_DIR` and `WATCHDOG_ENV_FILE`, so tests can stub them. Defaults are the real commands.
  - [ ] 1.2 State machine as in AC2. Message text names the failed checks and never includes a secret.
- [ ] **Task 2 — Tests** (AC: #2, #3)
  - [ ] 2.1 `apps/api/src/__tests__/health-watchdog.script.test.ts` (vitest) spawns `bash ../../scripts/health-watchdog.sh` with stubbed commands and a temp state dir.
  - [ ] 2.2 Cases:
    - one failure → no page;
    - two → one DOWN;
    - three → still one;
    - recovery → one RECOVERED with a duration;
    - a failed DOWN send → retried next run;
    - stdout and the message never contain the token;
    - a held lock → the run is skipped.
  - [ ] 2.3 Mutation check: change "2 consecutive" to 1 → a named test goes red.
  - [ ] 2.4 Runs on CI (ubuntu) and on the Windows laptop (Git Bash). If `flock` is missing on Git Bash, gate only that one case on the platform and say so.
- [ ] **Task 3 — Install files** (AC: #4)
  - [ ] 3.1 `infra/cron/oslsr-health-watchdog` (cron.d format: `* * * * * root /root/oslrs/scripts/health-watchdog.sh >> /var/log/oslsr-health-watchdog.log 2>&1`), plus the log-size decision.
  - [ ] 3.2 Make the script executable in git (`git update-index --chmod=+x`). ⚠️ Windows checkouts lose the mode, so verify with `git ls-files -s`.
- [ ] **Task 4 — Deploy heartbeat warning** (AC: #5) — inside the deploy SSH script, after the 13-77 runtime check. Warning only.
  - [ ] 4.1 🆕 **Inherited from 13-77's adjudication (2026-10-18), three low alerting defects, each to be FIXED or RULED (Awwal), never silently dropped (§2ad):**
    - (a) The deploy script's `pnpm -v` failure under `set -e` exits BEFORE the `PREV_HEAD` reset, so the tree stays on the new commit.
    - (b) `page-deploy-failure` can page for a deploy that was cancelled while still QUEUED.
    - (c) A timed-out edge-freshness job may conclude `cancelled` and not page (`prod-verify.yml` ~448).
    Source: the 13-77 story, "Adjudication and closure".
- [ ] **Task 5 — Install + drill on prod** (AC: #4, #6) — ⛔ Awwal's go-ahead and a quiet hour. Awwal runs the install, and `pm2 stop`/`start`, with `!` if the classifier refuses. The agent verifies each step read-only.
- [ ] **Task 6 — UptimeRobot** (AC: #7) — Awwal sets it up; the agent records it.
- [ ] **Task 7 — Docs** (AC: #8).

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

### Debug Log References

### Completion Notes List

### File List

### Review Follow-ups (AI)
