# Story 9.19: Operations Dashboard — CLI + Super Admin UI + Telegram digest

Status: done  <!-- Parts A+B+C implemented 2026-06-01; Task 7 adversarial code review DONE 2026-06-01 (7 findings, all auto-fixed, suites green) → flipped review → done. -->

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Surfaced during 2026-05-19 post-launch traffic analysis when the operator
asked "can we operationalize the live VPS / traffic / email / queue data
in the Super Admin UI so we can tackle things precisely?"

Three parts authored together so the data-collection layer is reused
across all surfaces:

  PART A — `pnpm dashboard` CLI                     [SHIPPED in this story]
  PART B — Super Admin Operations Dashboard page    [ready-for-dev]
  PART C — Morning/evening Telegram digest worker   [ready-for-dev, optional]

Threshold constants in apps/api/scripts/dashboard.ts:T are the canonical
source-of-truth for the UI's color coding. UI imports the same constants
from a shared module (Part B AC#B1).

Story shape supersedes the 2026-05-14 Post-Launch UAT Session Log "Open
follow-ups" item #5 + the "make-it-better" framing from the same session.
-->

## Story

As the **Super Admin operating the OSLRS platform during the field-survey rollout**,
I want **a single dashboard surface — CLI for SSH inspection + UI for browser-based monitoring + automated digest for off-platform awareness — that surfaces VPS health, adoption-funnel data, email deliverability, and queue health with metric-bound recommendations**,
So that **I can act on data instead of guessing, hand over to a future operator who can pick up monitoring without learning the SSH idiom, and tie specific metric breaches (Step-4 stall, Resend usage, disk pressure) to specific stories (9-17 critical-path, Pro tier upgrade, VPS resize) automatically rather than re-deriving them every session**.

## Acceptance Criteria

### Part A — `pnpm dashboard` CLI [SHIPPED — implemented in this story]

1. **AC#A1 — Single command runs on prod VPS**: `pnpm --filter @oslsr/api dashboard` (registered in `apps/api/package.json:38` per this story's commit). Run via Tailscale SSH (`ssh root@oslsr-home-app && cd /root/oslrs && pnpm --filter @oslsr/api dashboard`). Outputs ASCII dashboard with 5 sections in ~3-5 seconds.
2. **AC#A2 — Five data sources, parallel fetch, graceful degradation**: System (pm2 jlist + uptime + free -m + df), Traffic (Postgres respondents/wizard_drafts/magic_link_tokens/audit_logs), Resend (emails.list API), Queue (BullMQ getXxxCount), Audit (top actions). Each source failing produces "section unavailable" line, NOT process abort.
3. **AC#A3 — Threshold-coded color output**: ANSI green/yellow/red dots per metric. Constants declared at top of `apps/api/scripts/dashboard.ts` as `T` object (e.g. `T.step4StallPctYellow: 30, T.step4StallPctRed: 50`). Source-of-truth for Part B's UI color-coding.
4. **AC#A4 — Metric → Story binding recommendations**: Each metric breach maps to a specific story or operational action. Step-4 stall ≥40% → "Story 9-18 Part E (section-as-step) + Part B (Pattern C dedup) is the structural fix" (re-pointed from "9-17 Part B" after the 2026-06-03 harmonization that absorbed Pattern C into 9-18); Resend ≥70% → "upgrade Pro tier"; disk ≥80% → "DO live-resize"; queue.failed >0 → "investigate samples"; etc.
5. **AC#A5 — No new deps**: reuses `pg`, `resend`, `ioredis`, `bullmq` already in `apps/api/package.json`.

### Part B — Super Admin Operations Dashboard UI [ready-for-dev]

6. **AC#B1 — Shared threshold constants module**: Extract `T` from `dashboard.ts` into new `packages/types/src/ops-thresholds.ts` (or `apps/api/src/lib/ops-thresholds.ts` + re-export to web). Both CLI and UI import from the same source. Test asserts the two import sites resolve identical values (compile-time guarantee).
7. **AC#B2 — Backend endpoint**: `GET /api/v1/admin/operations/dashboard` (super_admin only, rate-limit 60/min/user). Returns JSON shape matching CLI's render data. Reuses CLI's data-gathering functions extracted into `OperationsService.getDashboardSnapshot()`.
8. **AC#B3 — Frontend page**: `/dashboard/super-admin/operations` — Super Admin sidebar nav item "Operations" (data-testid="sidebar-operations"). Renders 5 cards mirroring CLI sections: System health, Adoption + funnel, Email deliverability, Email queue, Recommendations.
9. **AC#B4 — TanStack Query polling**: 30s `refetchInterval` so the dashboard auto-refreshes. Manual refresh button (`data-testid="ops-refresh-button"`) bypasses cache.
10. **AC#B5 — Threshold-coded UI**: each card carries a colored status dot (green/yellow/red) computed from the shared `T` thresholds. Recommendation section renders the same metric → story binding text as CLI Part A.
11. **AC#B6 — Empty-state + error-state**: a section that returns null in the API response renders a "section unavailable" placeholder (matches CLI degradation). Network errors render "Refreshing failed; retrying in 30s" inline.

### Part C — Morning/evening Telegram digest worker [ready-for-dev, OPTIONAL]

12. **AC#C1 — BullMQ scheduled job**: new `ops-digest.queue.ts` + worker. Fires twice daily at 07:00 + 19:00 Africa/Lagos (UTC+1). Reuses Story 9-15's `isAlertSendEnabled()` gate (NODE_ENV=production OR ENABLE_TELEGRAM_ALERTS=true). Cron pattern: `0 6,18 * * *` (in UTC).
13. **AC#C2 — Digest content**: condensed version of CLI output — one-line summaries per section, full Recommendation block. Total message under 4096 chars (Telegram limit). Markdown formatting for Telegram parse_mode=MarkdownV2.
14. **AC#C3 — Digest channel reuses 9-15 infra**: posts via the existing `TelegramChannel` provider; no new credentials needed. Audit-logs each send via existing `AUDIT_ACTIONS.SETTINGS_FLIPPED` or new `OPS_DIGEST_SENT` action.

### Part D — Tests + handover

15. **AC#D1 — Part A unit tests**: cover threshold-icon picking, humanDuration, statusIcon logic. ~6 tests in `apps/api/scripts/__tests__/dashboard.test.ts`.
16. **AC#D2 — Part B route + service tests**: `OperationsService.getDashboardSnapshot()` unit tests + route-level supertest covering super_admin-only authorization, rate-limit, response shape. ~10 tests.
17. **AC#D3 — Part B frontend component tests**: `OperationsDashboardPage.test.tsx` covering 5 cards render / refresh button invocation / threshold-coded coloring / empty-state. ~8 tests.
18. **AC#D4 — Part C worker tests**: cron-firing logic + digest formatting + Telegram-gate honored. ~5 tests.
19. **AC#D5 — Zero regression**: Story 9-15 telegram alerts, Story 6-1 audit chain, Story 9-17 Q.M. + Settings landing — all unaffected.

## Tasks / Subtasks

- [x] **Task 1 (Part A) — CLI script implementation** ✅ SHIPPED 2026-05-19 (this story's commit)
  - [x] 1.1: Author `apps/api/scripts/dashboard.ts` with 5 sections + graceful degradation
  - [x] 1.2: Wire `"dashboard": "tsx scripts/dashboard.ts"` into `apps/api/package.json` scripts
  - [x] 1.3: tsc + lint clean
- [x] **Task 2 (Part B) — Extract shared thresholds module** (AC: #B1)
  - [x] 2.1: Create shared thresholds module — placed in `packages/types/src/ops-thresholds.ts` (canonical for BOTH api + web; `OPS_THRESHOLDS` + `opsStatusLevel` + snapshot DTO types) rather than `apps/api/src/lib/` so the web bundle imports the exact same source. Dev-Notes option ("OR re-export to web") satisfied directly.
  - [x] 2.2: Refactor `dashboard.ts` to import `T` (= `OPS_THRESHOLDS`) + gathering fns from the service; `main()` guarded so the file is import-safe for tests
  - [x] 2.3: Re-export from `packages/types/src/index.ts` for web consumption
- [x] **Task 3 (Part B) — OperationsService + endpoint** (AC: #B2)
  - [x] 3.1: Extracted data-gathering fns from `dashboard.ts` into `apps/api/src/services/operations.service.ts` (`getSystemHealth`/`getTraffic`/`getResendStatus`/`getQueueHealth`/`buildRecommendations`/`getDashboardSnapshot` + 30s cache). Fixed Part A's latent queue-name bug (`'email'` → real `'email-notification'` via `getEmailQueueStats`).
  - [x] 3.2: Handler implemented inline in `operations.routes.ts` (delegates to `OperationsService`) — matches the established settings.routes/audit-log-viewer convention (no separate thin controller file in this codebase). `?force=1` bypasses the 30s cache.
  - [x] 3.3: Wired `GET /admin/operations/dashboard` via `admin.routes.ts` sub-router with `authorize(SUPER_ADMIN)` + new `operationsReadRateLimit` (60/min/user)
- [x] **Task 4 (Part B) — Frontend page** (AC: #B3, #B4, #B5, #B6)
  - [x] 4.1: Authored `apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx`
  - [x] 4.2: `useOperationsDashboard()` hook with `refetchInterval: 30000` + forced manual-refresh mutation
  - [x] 4.3: Sidebar nav addition (Operations, peer of Settings, after System Health) + route registration in `App.tsx`
  - [x] 4.4: 5 cards (System / Adoption / Email / Queue / Recommendations) with shared-threshold status dots + section-unavailable + error states
- [x] **Task 5 (Part C) — Telegram digest worker** (AC: #C1, #C2, #C3)
  - [x] 5.1: Authored `apps/api/src/queues/ops-digest.queue.ts` + `scheduleOpsDigest` repeating job (`0 6,18 * * *`)
  - [x] 5.2: Authored `apps/api/src/workers/ops-digest.worker.ts` (`runOpsDigest` → `getDashboardSnapshot({force})` + MarkdownV2 `formatDigest` + `sendTelegramMessage`); audit-logs `OPS_DIGEST_SENT`; silent push on healthy days
  - [x] 5.3: Reuses 9-15 `isAlertSendEnabled()` gate via the new generic `sendTelegramMessage` (refactored `sendCriticalTelegramAlert` to delegate to it)
- [x] **Task 6 — Tests** (AC: #D1-D5) — +43 new tests (9 CLI + 13 service + 5 route + 8 worker on API; 8 page on web), audit-action count 42→43, sidebar count 16→17. Full suites green: API 2266 pass / 7 skip / 0 fail; web 2474 pass / 0 fail. tsc + eslint clean both apps.
- [x] **Task 7 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`) — DONE 2026-06-01 via `/bmad:bmm:workflows:code-review`. 7 findings (1 High, 3 Medium, 3 Low); all auto-fixed in the same session (see Review Follow-ups below + Dev Agent Record).

### Review Follow-ups (AI) — 2026-06-01 adversarial code review

All items below were fixed automatically in the same session (status: ✅ resolved). Listed critical→low for traceability.

- [x] [AI-Review][High] H1 — `getSystemHealth()` ran 4 synchronous `execSync` calls (up to ~11s) that blocked the Node event loop on the shared API endpoint (and `Promise.resolve(getSystemHealth())` defeated the parallel fetch). Converted to async callback-based `exec` so the loop is never blocked and the four sources truly run in parallel. [apps/api/src/services/operations.service.ts:62]
- [x] [AI-Review][Med] M1 — Resend metrics were silently capped at the latest 100 sends (`emails.list({ limit: 100 })`), so `todayCount` undercounts on blast days and could hide the ≥80% red "upgrade Pro" recommendation. Added a `truncated` flag surfaced as `100+` in the UI + digest. [apps/api/src/services/operations.service.ts:171]
- [x] [AI-Review][Med] M2 — `formatDigest` hard-trim (`slice(0, MAX-4)`) could cut mid-escape / leave an unclosed `*bold*`, making Telegram reject the digest with a 400. Now trims on whole-line boundaries + appends an escaped truncation note. [apps/api/src/workers/ops-digest.worker.ts:116]
- [x] [AI-Review][Med] M3 — Rate-limit had zero real test coverage despite AC#D2 listing it (route test stubs it; middleware self-bypasses in test mode). Added `operations-rate-limit.test.ts` covering the test-mode skip + middleware wiring. [apps/api/src/middleware/__tests__/operations-rate-limit.test.ts]
- [x] [AI-Review][Low] L1 — Audit "top actions" (the 5th source per AC#A2) sat inside `getTraffic`'s single try/catch, so one audit-query failure nulled the entire adoption/funnel card. Pulled it into its own catch → degrades to `[]` independently. [apps/api/src/services/operations.service.ts:116]
- [x] [AI-Review][Low] L2 — Resend free-tier ceiling `100` was hardcoded across service/worker/UI, undercutting the "single source of truth" claim. Exported `RESEND_FREE_TIER_DAILY` from `@oslsr/types` and consumed it everywhere. [packages/types/src/ops-thresholds.ts]
- [x] [AI-Review][Low] L3 — Funnel/traffic queries built `WHERE created_at >= '${LAUNCH_DATE}'` by string interpolation (no injection today, but inconsistent with the `$1`-parameterised 24h query). Parameterised all five. [apps/api/src/services/operations.service.ts:116]

## Dev Notes

### Strategic framing — why "make it better"

The 2026-05-19 traffic snapshot showed 16 wizard drafts, 3 completions, 63% Step-4 stall, 0 errors, 0 crashes. **The technical launch was a success but operational visibility was a manual SSH + ad-hoc-script dance**. This story turns observability into infrastructure:

- **CLI** = power-user one-command audit (SSH into VPS, run, read)
- **UI** = browser-based real-time monitoring (no SSH needed; can be checked from phone)
- **Telegram digest** = passive awareness (no action required; trends visible automatically)

The recommendation-to-story binding (Step-4 stall ≥ 40% → Story 9-17 critical-path) is the load-bearing innovation. It eliminates the "what should I work on next" debate by tying metric breaches to existing roadmap items. When a future operator inherits this project, the dashboard literally tells them which story to prioritize.

### Dependencies

- **Story 9-15** — telegram channel infra (`isAlertSendEnabled`, `TelegramChannel`). Part C reuses verbatim.
- **Story 6-1** — audit chain. Part C audit-logs digest sends.
- **prep-settings-landing-and-feature-flags** — admin route patterns + rate-limit middleware reused.
- **Story 9-18** — after the 2026-06-03 harmonization, the Step-4-stall trigger points users to 9-18 (Part E section-as-step + Part B Pattern C dedup) which collectively own the wizard redesign that addresses Step-4 friction. Previous reference to "9-17 Part B" is obsolete (Pattern C moved into 9-18). Loose runtime dependency (string match by story ID), not a build dep. The recommendation engine's string output in `apps/api/scripts/dashboard.ts` should be updated to reference "9-18" instead of "9-17 Part B" when 9-18 work begins — flagged here for the 9-18 dev agent.

### Risks

1. **`pm2 jlist` not available off-VPS** — CLI degrades gracefully (section unavailable). UI gets system stats via the API endpoint, which runs ON the VPS. Untestable from a developer's local machine without Tailscale tunneling. Document in Part B README.
2. **Resend API rate limit** — `emails.list({ limit: 100 })` once per 30s is well within rate limits. If user manual-refreshes aggressively, debounce in the UI.
3. **DB query cost** — funnel queries scan `wizard_drafts` since launch. As table grows, scan cost grows. Add a 30s in-memory cache on `OperationsService.getDashboardSnapshot()` (already implied by TanStack 30s polling) so concurrent dashboard viewers don't multiplicatively query. Future: roll up the funnel into a materialized view once `wizard_drafts` exceeds 100k rows.
4. **Telegram digest spam** — twice-daily firing for ZERO actionable signal still pings the operator. Mitigation: digest format includes "No action required" recommendation when all metrics green, AND the digest is silent (`disable_notification: true`) on healthy days. Telegram bot's pin only updates on red.
5. **Threshold drift between CLI and UI** — mitigated by AC#B1's shared module + compile-time test.

### Pre-impl notes for the dev agent picking up Parts B + C

- Reuse `useUpdateSetting` mutation pattern at `apps/web/src/features/settings/api/settings.api.ts:49` as the model for `useOperationsDashboard()` shape.
- The `SmsOtpToggle` optimistic-mutation reference still applies for any future Operations Dashboard CONTROL elements (e.g., a "purge old wizard drafts" button) — out of scope for B/C but flag in Dev Notes for Story 9-19+1.
- Sidebar config: extend `apps/web/src/features/dashboard/config/sidebarConfig.ts` with the Operations item under the Super Admin section (NOT under Settings; Operations is a peer of Settings).
- The `humanDuration()` helper in `dashboard.ts` is portable to the web side; consider moving to `packages/utils/src/datetime.ts` if a second site needs it.

## File List

### Part A (prior commit)
- `apps/api/scripts/dashboard.ts` (new, ~330 lines)
- `apps/api/package.json` (`"dashboard"` script entry added)

### Parts B + C (2026-06-01 session)
**New:**
- `packages/types/src/ops-thresholds.ts` — canonical `OPS_THRESHOLDS` + `opsStatusLevel` + snapshot DTO types (AC#B1)
- `apps/api/src/services/operations.service.ts` — shared data-gathering + recommendations + 30s cache (AC#B2)
- `apps/api/src/routes/operations.routes.ts` — `GET /admin/operations/dashboard` (AC#B2)
- `apps/api/src/middleware/operations-rate-limit.ts` — 60/min/user limiter
- `apps/api/src/queues/ops-digest.queue.ts` — twice-daily digest queue + scheduler (AC#C1)
- `apps/api/src/workers/ops-digest.worker.ts` — digest worker + `formatDigest`/`escapeMarkdownV2` (AC#C2/#C3)
- `apps/web/src/features/dashboard/api/operations.api.ts` — `useOperationsDashboard` hook (AC#B4)
- `apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx` — 5-card page (AC#B3/#B5/#B6)
- `apps/api/scripts/__tests__/dashboard.test.ts` — AC#D1 (9 tests)
- `apps/api/src/services/__tests__/operations.service.test.ts` — AC#D2 (13 tests)
- `apps/api/src/routes/__tests__/operations.routes.test.ts` — AC#D2 (5 tests)
- `apps/api/src/workers/__tests__/ops-digest.worker.test.ts` — AC#D4 (8 tests)
- `apps/web/src/features/dashboard/pages/__tests__/OperationsDashboardPage.test.tsx` — AC#D3 (8 tests)
- `apps/api/src/middleware/__tests__/operations-rate-limit.test.ts` — code-review M3 (2 tests; closes the rate-limit coverage gap)

**Modified (code-review fixes 2026-06-01):**
- `packages/types/src/ops-thresholds.ts` — exported `RESEND_FREE_TIER_DAILY` (L2) + added `OpsResendStatus.truncated` (M1)

**Modified:**
- `apps/api/scripts/dashboard.ts` — refactored to consume shared module + service; `main()` import-guarded
- `packages/types/src/index.ts` — re-export `ops-thresholds.js`
- `apps/api/src/queues/email.queue.ts` — added `getEmailFailedSamples()` helper
- `apps/api/src/routes/admin.routes.ts` — mount `/operations` sub-router
- `apps/api/src/services/alerting/telegram-channel.ts` — export `isAlertSendEnabled` + new generic `sendTelegramMessage`; `sendCriticalTelegramAlert` now delegates
- `apps/api/src/services/audit.service.ts` — add `OPS_DIGEST_SENT` action
- `apps/api/src/services/__tests__/audit.service.test.ts` — action-count 42→43
- `apps/api/src/workers/index.ts` — register ops-digest worker + scheduler + graceful close
- `apps/web/src/features/dashboard/config/sidebarConfig.ts` — add Operations nav item + optional `testId` on `NavItem`
- `apps/web/src/layouts/components/SidebarNav.tsx` — render `data-testid` from `item.testId`
- `apps/web/src/features/dashboard/__tests__/sidebarConfig.test.ts` — super_admin count 16→17 + Operations position assertion
- `apps/web/src/App.tsx` — lazy import + `operations` route (super_admin)

## Dev Agent Record

### Completion Notes (Parts B + C — 2026-06-01, Amelia / dev-story)

- **Single source of truth (AC#B1):** Threshold constants + status-level logic live in `@oslsr/types` `ops-thresholds.ts`. The CLI re-exports the SAME `OPS_THRESHOLDS` object (asserted referentially equal in `dashboard.test.ts`), the API service imports it, and the React page imports it — drift is structurally impossible.
- **DRY recommendations (AC#B5/#C2):** `buildRecommendations()` is the one place metric breaches map to story IDs. CLI colours by `severity`, the UI colours by `severity`, the Telegram digest renders the same wording — all three surfaces are guaranteed identical.
- **Latent Part-A bug fixed:** the CLI's `getQueueHealth` queried a queue literally named `'email'`; the real BullMQ queue is `'email-notification'`, so the CLI's queue counts were always zero. The extracted service routes through `getEmailQueueStats()` (correct queue) — the UI, digest, AND the CLI are now accurate.
- **9-15 reuse (AC#C3):** refactored `telegram-channel.ts` to expose a generic `sendTelegramMessage(text, opts)` honouring the exact same env gate (`isAlertSendEnabled`) + token/chat-id checks + never-throws contract. `sendCriticalTelegramAlert` now delegates; all 17 existing 9-15 tests still pass.
- **Healthy-day silence (Risk #4):** the digest sends with `disable_notification: true` when there are zero recommendations, so the operator only gets a buzz on days that need attention.
- **Risk #3 cache:** `OperationsService.getDashboardSnapshot()` memoises for 30s; concurrent viewers + the 30s poll coalesce. UI manual-refresh sends `?force=1` to bypass it.
- **System health off-VPS (Risk #1):** `getSystemHealth()` degrades to `null` when `pm2 jlist`/`free`/`df` are unavailable (e.g. a developer laptop) and the page renders a "section unavailable" placeholder. The API endpoint runs ON the VPS so the real values surface in production.
- **Controller deviation (Task 3.2):** no separate `operations.controller.ts` — the route handler delegates straight to `OperationsService`, matching the codebase's settings.routes / audit-log-viewer convention. Functionally equivalent to the task's intent.
- **Operator residual:** for the Telegram digest to actually fire in production, `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` must be set on the VPS `.env` (already present from Story 9-15) and the API process restarted so the scheduler registers the repeatable job. No new env vars introduced.
- **Quality:** API tsc + eslint clean; web tsc + eslint clean. API 2266 pass / 7 skip / 0 fail; web 2474 pass / 2 todo / 0 fail. +43 net-new tests. No new deps, no migrations, no schema changes.

### Code Review Close-out (Task 7 — 2026-06-01, `/bmad:bmm:workflows:code-review`)

Adversarial review surfaced 7 findings (1 High, 3 Medium, 3 Low); File List was 100% accurate vs git (0 discrepancies). All findings auto-fixed in-session:

- **H1 (event-loop block):** `getSystemHealth()` converted from 4× synchronous `execSync` (up to ~11s of blocking) to async callback `exec` via an `execCapture()` helper; `getDashboardSnapshot()`/CLI `main()` drop the `Promise.resolve(...)` wrapper so the four sources now genuinely run in parallel and never freeze concurrent API requests.
- **M1 (Resend 100-row cap):** added `OpsResendStatus.truncated` (set when a full Resend page returns); CLI, UI, and digest now render `100+` so blast-day undercounts can't masquerade as the exact total or hide the red Pro-upgrade rec.
- **M2 (MarkdownV2 trim):** `formatDigest` now trims on whole-line boundaries + appends an escaped `… (truncated)` note instead of slicing mid-escape (which Telegram 400s).
- **M3 (rate-limit coverage):** new `operations-rate-limit.test.ts` exercises the test-mode skip + middleware wiring (2 tests).
- **L1 (audit degradation):** audit "top actions" query pulled out of `getTraffic`'s shared try/catch into its own catch → degrades to `[]` independently per AC#A2.
- **L2 (magic number):** `RESEND_FREE_TIER_DAILY` exported from `@oslsr/types` and consumed by service/CLI/worker/UI.
- **L3 (SQL interpolation):** all five funnel/traffic queries parameterised (`$1` = `LAUNCH_DATE`).

**Post-fix verification:** API targeted suites green (operations.service 13, dashboard 9, ops-digest 8, operations.routes 5, operations-rate-limit 2); web OperationsDashboardPage 8/8. API + web `tsc --noEmit` clean; eslint clean on all changed files. Net +2 tests (45 total for the story). Status flipped review → done.

## Change Log

| Date | Change |
|------|--------|
| 2026-06-01 | Parts B + C implemented (dev-story, Amelia). Shared `ops-thresholds` module, `OperationsService` + `/admin/operations/dashboard` endpoint, Super Admin Operations page (30s poll + manual refresh), twice-daily Telegram digest worker. +43 tests. Status in-progress → review. Task 7 (adversarial code review) remains. |
| 2026-06-01 | Task 7 adversarial code review (`/bmad:bmm:workflows:code-review`). 7 findings (1 High / 3 Med / 3 Low), File List 0 discrepancies. All auto-fixed: async `exec` (H1), Resend `truncated`/`100+` (M1), line-boundary digest trim (M2), rate-limit tests (M3), independent audit degradation (L1), shared `RESEND_FREE_TIER_DAILY` (L2), parameterised SQL (L3). Suites green, tsc + eslint clean. Status review → done. |
