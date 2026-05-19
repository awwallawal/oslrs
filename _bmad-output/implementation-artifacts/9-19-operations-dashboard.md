# Story 9.19: Operations Dashboard — CLI + Super Admin UI + Telegram digest

Status: in-progress  <!-- Part A shipped; Parts B + C ready-for-dev -->

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
4. **AC#A4 — Metric → Story binding recommendations**: Each metric breach maps to a specific story or operational action. Step-4 stall ≥40% → "Story 9-17 Part B is critical-path"; Resend ≥70% → "upgrade Pro tier"; disk ≥80% → "DO live-resize"; queue.failed >0 → "investigate samples"; etc.
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
- [ ] **Task 2 (Part B) — Extract shared thresholds module** (AC: #B1)
  - [ ] 2.1: Create `apps/api/src/lib/ops-thresholds.ts` exporting `T` constant
  - [ ] 2.2: Refactor `dashboard.ts` to import `T` from this module
  - [ ] 2.3: Re-export from `packages/types/src/index.ts` for web consumption
- [ ] **Task 3 (Part B) — OperationsService + endpoint** (AC: #B2)
  - [ ] 3.1: Extract data-gathering functions from `dashboard.ts` into `OperationsService` class
  - [ ] 3.2: Author `apps/api/src/controllers/operations.controller.ts` with `getDashboard()` handler
  - [ ] 3.3: Wire route `GET /admin/operations/dashboard` in `apps/api/src/routes/admin.routes.ts` with super_admin guard + 60/min rate limiter
- [ ] **Task 4 (Part B) — Frontend page** (AC: #B3, #B4, #B5, #B6)
  - [ ] 4.1: Author `apps/web/src/features/dashboard/pages/OperationsDashboardPage.tsx`
  - [ ] 4.2: `useOperationsDashboard()` TanStack Query hook with `refetchInterval: 30000`
  - [ ] 4.3: Sidebar nav addition + route registration in `App.tsx`
  - [ ] 4.4: 5 card components (System / Adoption / Email / Queue / Recommendations)
- [ ] **Task 5 (Part C) — Telegram digest worker** (AC: #C1, #C2, #C3)
  - [ ] 5.1: Author `apps/api/src/queues/ops-digest.queue.ts` + repeating job
  - [ ] 5.2: Author `apps/api/src/workers/ops-digest.worker.ts` that calls `OperationsService.getDashboardSnapshot()` + `TelegramChannel.send()`
  - [ ] 5.3: Wire `isAlertSendEnabled()` gate (reuses 9-15 logic)
- [ ] **Task 6 — Tests** (AC: #D1-D5)
- [ ] **Task 7 — Pre-merge BMAD code review on uncommitted tree** (per `feedback_review_before_commit.md`)

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
- **Story 9-17** — when its Step-4-stall trigger fires, the dashboard recommendation points users to 9-17 Part B. Loose runtime dependency (string match by story ID), not a build dep.

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

(Populated by dev agent. Part A files for this commit:)
- `apps/api/scripts/dashboard.ts` (new, ~330 lines)
- `apps/api/package.json` (`"dashboard"` script entry added)
