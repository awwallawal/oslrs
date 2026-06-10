# Story 9.52: Cloudflare traffic-watch alert — spike/threat paging via Telegram

Status: ready-for-dev

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

- [ ] **Task 1 (AC: #1, #2) — Watch evaluator + thresholds**
  - [ ] 1.1: Write FAILING tests for `evaluateCfWatch(summary, thresholds)` — one per finding kind (fires + boundary no-fire) + empty-on-healthy.
  - [ ] 1.2: Add thresholds (CF_WATCH_THRESHOLDS) — requests-spike multiplier + page-view floor + threats/day + error-ratio. Single exported const.
  - [ ] 1.3: Implement the pure evaluator in `apps/api/src/lib/cloudflare-analytics.ts` (or a sibling `cf-watch.ts`) consuming `CloudflareDashboardSummary` (reuse `summarizeZone`/`summarizeRum` outputs incl. `byDay`).
- [ ] **Task 2 (AC: #3, #4, #5) — Dispatch wiring**
  - [ ] 2.1: Map findings → the existing alert dispatch (`alert.service.ts`); reuse `isAlertSendEnabled()` gate + cooldown.
  - [ ] 2.2: Compose a concise Telegram message per finding (kind, numbers, window, suggested action: "enable Bot Fight Mode / check WAF").
  - [ ] 2.3: Degradation: no token / fetch error → structured log + exit 0.
- [ ] **Task 3 (AC: #6) — Schedulable script**
  - [ ] 3.1: `apps/api/scripts/cf-traffic-watch.ts` — load `.env` (dotenv, mirror cf-analytics.ts), call `getCloudflareDashboardSummary`, evaluate, dispatch. `--dry-run` prints only.
  - [ ] 3.2: Document crontab line (every 15 min) + ensure it's idempotent/best-effort.
- [ ] **Task 4 (AC: #7, #8) — Tests, quality, docs**
  - [ ] 4.1: Run unit tests + full alert/telegram suite; `tsc` + lint (0 warnings).
  - [ ] 4.2: Add crontab recipe + threshold rationale + false-positive trap to the pre-viral checklist / runbook.

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

### Debug Log References

### Completion Notes List

### File List
