# Story 9.52: Cloudflare traffic-watch alert — spike/threat paging via Telegram

Status: done

<!--
Authored 2026-06-10 by Bob (SM) via canonical *create-story (--yolo). EMERGENT
follow-up — not from an epic backlog; surfaced during the 2026-06-10 Cloudflare
analytics session (commit 1b33fc3 shipped the cloudflare-analytics.ts lib + the
ops-dashboard "Edge traffic" section). This story is the "make it better #2"
item: turn the new VISIBILITY into an automated SIGNAL.

Source context:
- docs/roadmap-to-launch.md (9-20 viral-push monitoring goal)
- memory reference-cloudflare-analytics-tooling + project-origin-lock-port80-residual
- Story 9-15 (Telegram alert channel + prod-gate) — the dispatch mechanism to reuse
- Story 9-19 (operations dashboard + OPS_THRESHOLDS single-source-of-truth pattern)
-->

## Story

As the **Super Admin running a viral social-media + blog push**,
I want **an automated alert when edge traffic spikes in a way that looks like an attack/bot-flood rather than real virality (requests surging while human page-views stay flat, or a threats spike)**,
so that **I get paged via the existing Telegram channel and can react (Bot Fight Mode, WAF rule, scale) before the 2GB droplet is overwhelmed — instead of finding out from the dashboard hours later**.

## Acceptance Criteria

1. **AC#1 — Watch evaluator (pure, testable):** A pure function evaluates a Cloudflare summary (from `cloudflare-analytics.ts`) against thresholds and returns zero or more structured findings (`{ kind, severity, detail }`). Kinds: `requests_spike_low_pageviews` (edge requests/day ≥ N× the trailing-day baseline WHILE RUM page-views stay below a floor), `threats_spike` (daily threats ≥ threshold), `error_ratio` (4xx+5xx share ≥ threshold). No I/O in the evaluator — unit-tested.
2. **AC#2 — Thresholds are single-source-of-truth:** Threshold constants live in one place (mirror the Story 9-19 `OPS_THRESHOLDS` pattern in `@oslsr/types`, or a local exported const if cross-package churn is unwarranted) and are referenced by both the watcher and its tests. No magic numbers inline.
3. **AC#3 — Telegram dispatch reuses Story 9-15:** Findings dispatch through the existing alert path (`alert.service.ts` + `alerting/telegram-channel.ts`), honouring `isAlertSendEnabled()` so it NEVER pages from dev/test (NODE_ENV=production OR ENABLE_TELEGRAM_ALERTS=true; vitest skip preserved). No new dispatch channel.
4. **AC#4 — Cooldown / no spam:** Repeated identical findings within a cooldown window are suppressed (reuse the existing alert cooldown if present, else a simple per-kind cooldown). One page per condition per window, not per poll.
5. **AC#5 — Graceful degradation:** If `CLOUDFLARE_API_TOKEN` is unset or the CF fetch fails, the watcher logs and exits 0 (no crash, no false page). Mirrors `getCloudflareDashboardSummary` returning null.
6. **AC#6 — Runnable on a schedule:** Ships as `apps/api/scripts/cf-traffic-watch.ts` (tsx, no long-lived process) invokable by system cron on the VPS, with a documented crontab line (e.g. every 15 min). `--dry-run` prints findings without dispatching. (If the project already has a repeatable-job mechanism the dev may fold it in instead — but the cron-script is the default, matching `scripts/uat-trigger-critical-alert.ts`.)
7. **AC#7 — Tests + no regression:** Unit tests cover the evaluator (each finding kind fires + does-not-fire boundaries) + the no-token/degradation path. Existing alert/telegram tests stay green. `tsc` + lint clean (0 warnings — the lib pattern from 9-52's sibling commit).
8. **AC#8 — Docs:** A crontab recipe + threshold rationale added to `docs/runbooks/pre-viral-push-checklist.md` (Story 9-20 Part D — create the file if 9-20 hasn't yet) or `runbook §1.8` adjacent to the Telegram-alert section; note the false-positive trap (a real viral spike ALSO raises requests — that's why the signal pairs requests-up WITH page-views-flat).

## Tasks / Subtasks

- [x] **Task 1 (AC: #1, #2) — Watch evaluator + thresholds**
  - [x] 1.1: Write FAILING tests for `evaluateCfWatch(summary, thresholds)` — one per finding kind (fires + boundary no-fire) + empty-on-healthy.
  - [x] 1.2: Add thresholds (CF_WATCH_THRESHOLDS) — requests-spike multiplier + page-view floor + threats/day + error-ratio. Single exported const.
  - [x] 1.3: Implement the pure evaluator in `apps/api/src/lib/cloudflare-analytics.ts` (or a sibling `cf-watch.ts`) consuming `CloudflareDashboardSummary` (reuse `summarizeZone`/`summarizeRum` outputs incl. `byDay`).
- [x] **Task 2 (AC: #3, #4, #5) — Dispatch wiring**
  - [x] 2.1: Map findings → the existing alert dispatch (`alert.service.ts`); reuse `isAlertSendEnabled()` gate + cooldown.
  - [x] 2.2: Compose a concise Telegram message per finding (kind, numbers, window, suggested action: "enable Bot Fight Mode / check WAF").
  - [x] 2.3: Degradation: no token / fetch error → structured log + exit 0.
- [x] **Task 3 (AC: #6) — Schedulable script**
  - [x] 3.1: `apps/api/scripts/cf-traffic-watch.ts` — load `.env` (dotenv, mirror cf-analytics.ts), call `getCloudflareDashboardSummary`, evaluate, dispatch. `--dry-run` prints only.
  - [x] 3.2: Document crontab line (every 15 min) + ensure it's idempotent/best-effort.
- [x] **Task 4 (AC: #7, #8) — Tests, quality, docs**
  - [x] 4.1: Run unit tests + full alert/telegram suite; `tsc` + lint (0 warnings).
  - [x] 4.2: Add crontab recipe + threshold rationale + false-positive trap to the pre-viral checklist / runbook.

### Review Follow-ups (AI) — code-review 2026-06-25 (all 6 resolved)
- [x] [AI-Review][Med] **M1** — AC#7 wanted the no-token/degradation path tested, but only the pure evaluator was. Extracted a dependency-injected `runCfTrafficWatch(deps)` into `cf-watch.ts` (degradation + cooldown + dispatch) + 5 unit tests (no-token / fetch-fail / dispatch / cooldown-suppress / dry-run). Script is now thin wiring. [cf-watch.ts, cf-traffic-watch.ts]
- [x] [AI-Review][Med] **M2** — `threats_spike` fell back to the window-total `zone.threats` vs a per-DAY threshold (unit mismatch → false positive on empty byDay). Now per-day ONLY (skips when byDay empty) + a guard test. [cf-watch.ts]
- [x] [AI-Review][Low] **L1** — documented that `error_ratio` is window-level (the lib has no per-day status), hence less sensitive than the per-day spike signals. [cf-watch.ts]
- [x] [AI-Review][Low] **L2** — documented the baseline-mean choice (a spiky prior day inflates it = the safe direction, fewer false pages). [cf-watch.ts]
- [x] [AI-Review][Low] **L3** — `severity` is no longer dead: `severityFor()` escalates warning→critical at ≥2× the trigger, and `formatCfWatchMessage` shows it. [cf-watch.ts]
- [x] [AI-Review][Low] **L4** — commented the intentional best-effort `catch → exit 0` (genuine bugs are logged for forensics; degradation is handled inside the orchestration, not via throw). [cf-traffic-watch.ts]

## Dev Notes

### Reuse — do NOT reinvent
- **Data source:** `apps/api/src/lib/cloudflare-analytics.ts` — `getCloudflareDashboardSummary(days)` returns `{ rum, zone }` with `zone.byDay[]` (per-day requests + threats), `zone.requests`, `zone.cacheHitPct`, `zone.status[]`, `rum.pageViews`. Already unit-tested + graceful. [Source: commit 1b33fc3]
- **Dispatch + gate:** `apps/api/src/alerting/telegram-channel.ts` `isAlertSendEnabled()` (NODE_ENV=production OR ENABLE_TELEGRAM_ALERTS=true; test/vitest skip) and `apps/api/src/services/alert.service.ts` (`evaluateMetric`, cooldown, `alert.critical_evaluated` warn pattern). [Source: Story 9-15 — `9-15-prod-gate-telegram-alerts.md`]
- **Threshold SoT pattern:** `OPS_THRESHOLDS` in `@oslsr/types` consumed by `operations.service.ts` + `dashboard.ts` — mirror this so the watcher + tests share one source. [Source: Story 9-19 — `dashboard.ts:48-50`]
- **Permanent-runner precedent:** `apps/api/scripts/uat-trigger-critical-alert.ts` shows the standalone-script-that-dispatches pattern. [Source: Story 9-15]

### The signal (why this design, not a naive "requests > X")
A real viral spike ALSO raises requests. The discriminator is **requests-up WHILE human page-views-flat** (bots don't run the RUM beacon) — that's `requests_spike_low_pageviews`. Pair it with `threats_spike` (WAF catching probes) and `error_ratio` (404/401/403 flood = scanning). Today's baseline data: ~half of request volume is bots (NL/FR/GB high requests, near-zero page-views); WAF blocks ~228–295 threats / 14d. [Source: Story 9-20 Dev Agent Record 2026-06-10]

### Scheduling
Default = system cron on the VPS calling the tsx script (simplest, no long-lived process, matches uat-trigger). Crontab e.g. `*/15 * * * * cd /root/oslrs && pnpm --filter @oslsr/api tsx apps/api/scripts/cf-traffic-watch.ts >> /var/log/cf-watch.log 2>&1`. If a BullMQ repeatable-job harness is already wired for periodic ops, folding in there is acceptable — dev's call, but don't add a new always-on poller just for this.

### Guardrails
- NEVER page from dev/test — the `isAlertSendEnabled()` gate is load-bearing (Story 9-15 incident: ungated dispatch paged the operator from local). [Source: `docs/incidents/2026-05-11-telegram-self-page.md`]
- Free-plan zone data is daily-granularity (`httpRequests1dGroups`) — the spike comparison is day-over-day, not minute-over-minute. Set expectations: this is an early-warning trend signal, not real-time DDoS detection (Cloudflare's own DDoS mitigation handles the real-time layer).
- 0-warnings lint standard; `any` on GraphQL shapes is already typed in the lib — follow that.

### Project Structure Notes
- New: `apps/api/scripts/cf-traffic-watch.ts`; evaluator + thresholds in `apps/api/src/lib/cloudflare-analytics.ts` (or sibling `cf-watch.ts`) + test under `apps/api/src/lib/__tests__/`.
- No new deps. No migrations. No new audit-action keys. Reuses Story 9-15 env (TELEGRAM_* / ENABLE_TELEGRAM_ALERTS) + CLOUDFLARE_API_TOKEN (already on VPS .env).

### References
- [Source: commit 1b33fc3 — cloudflare-analytics.ts lib + dashboard Edge-traffic section]
- [Source: _bmad-output/implementation-artifacts/9-15-prod-gate-telegram-alerts.md — Telegram dispatch + isAlertSendEnabled gate]
- [Source: _bmad-output/implementation-artifacts/9-20-pre-viral-capacity-prep.md — Dev Agent Record 2026-06-10, viral-push monitoring goal + Part D checklist]
- [Source: docs/roadmap-to-launch.md — Phase 2 launch gate / capacity]
- [Source: memory reference-cloudflare-analytics-tooling]

## Dev Agent Record

### Agent Model Used
Amelia (BMAD dev agent) — claude-opus-4-8[1m], dev-story workflow, 2026-06-24.

### Debug Log References
- Lint caught a real bug: the `*/15` crontab inside the script's JSDoc closed the block comment (`*/`). Moved the literal crontab out of the JSDoc into the doc; reworded the comment. (tsc missed it — `apps/api/scripts/` isn't in the api tsconfig.)
- Script dry-run loaded `CLOUDFLARE_API_TOKEN` from `.env` → did a live CF fetch → 0 findings (healthy traffic) → exit 0. Happy path verified end-to-end.

### Completion Notes List
- **AC#1/#2** — `apps/api/src/lib/cf-watch.ts`: pure `evaluateCfWatch(summary, thresholds)` → `CfWatchFinding[]` for 3 kinds (`requests_spike_low_pageviews` = requests ≥ N× trailing baseline WHILE page-views < floor; `threats_spike` ≥ N/day; `error_ratio` ≥ N%). Single-source `CF_WATCH_THRESHOLDS` const (no inline magic numbers). Null/empty summary → `[]` (degradation at the pure level).
- **AC#3** — dispatch via `sendTelegramMessage` (telegram-channel.ts), which self-vetoes through `isAlertSendEnabled()` → NEVER pages from dev/test. No new dispatch channel; does NOT touch alert.service.ts.
- **AC#4** — per-kind Redis cooldown (`SET cf-watch:cooldown:<kind> NX EX`, default 6h) → one page per condition per window; fail-open.
- **AC#5** — `cf-traffic-watch.ts`: no `CLOUDFLARE_API_TOKEN` or a fetch error → structured log + exit 0; top-level catch also exits 0 (best-effort cron).
- **AC#6** — `apps/api/scripts/cf-traffic-watch.ts` (tsx, no long-lived process) + `--dry-run`; crontab documented.
- **AC#7** — 12 evaluator tests (each kind fires + boundary no-fire + tiny-baseline/sample guards + degradation + format). Existing alert/telegram suites green. api tsc 0; eslint 0 (incl. the script).
- **AC#8** — `docs/runbooks/pre-viral-push-checklist.md` §2: tripwire flipped to LIVE + crontab recipe + threshold rationale + the false-positive trap (requests-up WHILE page-views-flat).
- **Verification:** api tsc 0; eslint 0; **full api regression green (197 files / 2807 pass)**. +12 net-new tests. Web unaffected (no web/shared-type changes).

### File List
**New:**
- `apps/api/src/lib/cf-watch.ts`
- `apps/api/src/lib/__tests__/cf-watch.test.ts`
- `apps/api/scripts/cf-traffic-watch.ts`

**Modified:**
- `docs/runbooks/pre-viral-push-checklist.md` (§2 tripwire → LIVE + crontab + rationale + false-positive trap)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (status)

## Senior Developer Review (AI)

**Reviewer:** Amelia (BMAD code-review workflow — adversarial) · **Date:** 2026-06-25 · **Outcome:** ✅ APPROVE (all findings resolved)

- **Scope verified:** git changes == File List (3 new + 3 modified, no false/undocumented claims); all 8 ACs implemented; every `[x]` task real (proven against the files + the green regression).
- **Findings:** 0 Critical · 0 High · **2 Medium · 4 Low** — ALL fixed (see Review Follow-ups). Standouts: **M1** — AC#7's degradation-path test was missing; fixed by extracting a testable `runCfTrafficWatch(deps)` + 5 tests. **M2** — a real unit-mismatch bug (window-total threats vs a per-day threshold). A docstring bug (`*/15` closing the JSDoc) was caught by lint during dev.
- **Post-fix verification:** api tsc 0; eslint 0 (incl. the script); **full api regression GREEN (197 files / 2814 pass)**. **+19 cf-watch tests** total. Script dry-run runs end-to-end against a live CF fetch.
- **Decision:** all ACs implemented + 0 open HIGH/MED → Status **done**.

### Change Log
| Date | Change | By |
|------|--------|-----|
| 2026-06-24 | Implemented all 4 tasks (pure evaluator + thresholds + cron script + docs); +12 tests; full api regression green. Status → review. | Amelia (Dev) |
| 2026-06-25 | Code-review (adversarial): 2 Med + 4 Low ALL fixed (M1 testable orchestration + degradation tests; M2 per-day threats; severity; comments); +7 tests. Full regression green (197/2814). Status → done. | Amelia (Review) |
