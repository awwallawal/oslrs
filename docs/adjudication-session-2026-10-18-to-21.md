# Adjudication session 2026-10-18 → 10-21

**Closed:** Story 13-77 (Node 24, alerts that reach a human). **Shipped and proven:** Story 13-78, the VPS watchdog.
**Done ahead of time:** CI runners pinned to `ubuntu-24.04`, before GitHub moved `ubuntu-latest` to 26 on 10-19.
**Open:** 13-78 Task 6 (UptimeRobot, Awwal), then 13-78 → `done`.

Commits: `86047f1` 13-77 close · `4c23318` 13-77 drill receipts · `0168062` 13-78 code · `54d9cd6` install read-back ·
`8173742` AC6 drill · `899295e` runner pin · `fb46795` C1/C3 rulings.

---

## A. Lost-session recovery (10-18 morning)

The laptop went off after the 10-17 session had compacted. The resume point was the compaction summary's "Pending
Tasks" block in the newest large `~/.claude/projects/C--Users-DELL-Desktop-oslrs/*.jsonl`. Nothing had run after the
summary. Handoff §3 had not been written for 10-16 → 10-17, so it was rebuilt from the stories.
Lesson (handoff §3): update §3 at each milestone, not only at session end.

## B. 13-77 closure

- An independent adjudication proposed DONE with five acceptances. Six of the story's own claims were false (Node 20
  still named in `README.md`, `MIGRATION_GUIDE.md`, `apps/web/e2e/README.md`, `PROJECT_STARTUP_REPORT.md`; AC4e
  wording; `uptime.yml` label). All were corrected **before** signing.
- **Awwal signed acceptances 1–5** ("sign 1–5, fix the five false claims first"). Acceptance 5 was the post-review
  ci-cd drill `39113803769`, green; Awwal confirmed the Telegram receipt.
- Three low alerting defects were routed into 13-78 as Task 4.1, not dropped (§2ad).

## C. R4 field reading (10-18 15:20 WAT, read-only; counts only, output was PII and stayed in the terminal)

- **54 declined-consent enumerator surveys** (41 at 10-14). All 13 new ones belong to one enumerator (zjbadmus):
  65 % of their new surveys.
- **85 % of declined surveys are fraud-flagged** (46/54) vs 10 % of consented (16/162), driven by `speed_score`,
  because a declined survey is short (median 84 s vs 238 s). ⇒ The consent story must also stop speed-scoring a
  declined survey.
- 216 enumerator surveys since T0, GPS 98.6 %, still two people. None since 10-16 17:57 WAT. 0 of 232 flags reviewed.

## D. 13-78 — the VPS watchdog (developed and reviewed by Awwal in another CLI; adjudicated here)

- **Code adjudication:** script read end to end, no defect. **C4 closed on prod**: one run under cron's environment
  with a fake send gave `ok` (the Redis password parse works). C5 spot-checked on three cancelled runs. Full API suite
  4,816 tests, 0 failed, matching the prediction exactly.
- **C7 answered yes:** a `::warning::` printed inside `appleboy/ssh-action` becomes a real annotation.
- **Installed by Awwal** 2026-10-18 16:38 UTC with `!`. Read back: `ok` every minute, no `WARN: flock`.
- **Ordinary deploy after install:** no page; heartbeat 55 s.
- **AC6 drill** (Awwal's go-ahead, quiet hour measured):
  - `pm2 stop` → ONE DOWN at 16:51:02. `pm2 start` 16:51:34 → ONE RECOVERED at 16:53:02 ("Down about 2m 0s"; actual
    ~1m46s).
  - Both received by Awwal. Exactly 2 pages; 0 nginx 502s in the window.
- **Rulings signed by Awwal 2026-10-18** ("sign C1, C3a–e"):
  - **C1**, the WORSE page: AC2 amended.
  - **C3a–e**: REDISCLI_AUTH; the `REDIS_URL` read; the self-capped log; RECOVERED retried; no-flock runs with a WARN.
  - Each is noted at its AC.
- ⏳ **Task 6, UptimeRobot**, is the only item left. Steps were given to Awwal:
  - an HTTP(s) monitor on `/api/v1/health` every 5 min;
  - email plus Telegram if the plan has it, otherwise the mobile app;
  - a test notification.
  - ⚠️ Third-party sources say the free plan is **personal / non-commercial only since Dec 2024**. Check the terms; a
    government service may need the cheapest paid plan.
  - When Awwal reports the owner email, the channels and the test date: fill playbook 7a.2 and its status line, tick
    Task 6, and set Status → `done` with attribution.

## E. Ubuntu 26 (raised by Awwal 10-18)

- All 20 `runs-on` in 6 workflows → `ubuntu-24.04  # pinned to the VPS OS (playbook §1.5b)`. A no-op that day;
  actionlint identical before and after (10/10).
- CI/CD `39148808342`: 10 jobs `Image: ubuntu-24.04`, no migration notice.
- **After the switch date:** every scheduled run on 10-19, 10-20 and 10-21 is green (uptime, OSV, prod-verify).
- Moving to 26 later is a planned step (playbook §1.5b): try it on one job in a PR, ideally alongside the VPS OS upgrade.

## F. Questions answered

- **Is `oyotradeministry.com.ng` free?** No. Awwal released it to the DBPRS project on 2026-10-14; never re-add it to
  OSLRS. Measured 10-19: still WhoGoHost nameservers and no A record, so it is unused but assigned.

## G. Mistakes made and caught

- **`gh run list --commit <short sha>` returns an empty list with exit 0.** Hit twice; once it was read as "the
  watchdog stopped" until the clock was checked. Always pass the full SHA (memory pitfall).
- A `bash -v` inside a remote ssh loop hung; stopped and re-run without it.
- actionlint first returned 0 lines because Git Bash rewrote the path. A clean result must prove it measured: re-run
  with `MSYS_NO_PATHCONV=1`.
- The commit hook's story guard replayed a cached 10-17 result (§2ap). Run `cd apps/api && pnpm lint:story-residuals`
  yourself.

## H. State at session end (2026-10-21)

- origin/main = local = `fb46795`. CI/CD for `fb46795` deployed green. Public health 200.
- ⚠️ **Prod SHA and watchdog log NOT re-read at close:** Tailscale was stopped on the laptop (`ssh: Could not resolve
  hostname oslsr-home-app`). First cold-start action: start Tailscale, then run handoff §0 and
  `tail -3 /var/log/oslsr-health-watchdog.log; grep -c paged /var/log/oslsr-health-watchdog.log`. Predict 2 pages
  total (the drill) unless a real outage happened since.
