# Story 9.15: Production-Gate Telegram Critical Alerts to Prevent Dev-Environment Paging

Status: ready-for-dev

<!-- Authored 2026-05-11 by Bob (SM) via canonical *create-story --yolo workflow.
     Trigger: 2026-05-11T12:44:54Z incident — local `pnpm dev` paged operator with
     prod Telegram tokens. See incident memory + Dev Notes postmortem below. -->

## Story

As the **Operator** (Awwal),
I want **Telegram critical alerts to be silenced in non-production environments unless I explicitly opt in**,
So that **a local `pnpm dev` run (or any dev/test/preview process) cannot self-page me with synthetic metrics from a dev Redis instance**.

## Acceptance Criteria

1. **AC#1 — Production-gated channel.** `apps/api/src/services/alerting/telegram-channel.ts` exposes a single gate function (suggested name: `isAlertSendEnabled()`) that returns `true` if and only if:
   - `process.env.NODE_ENV === 'production'`, OR
   - `process.env.ENABLE_TELEGRAM_ALERTS === 'true'`,
   AND `process.env.NODE_ENV !== 'test'` AND `process.env.VITEST !== 'true'` (test-mode skip preserved). `sendCriticalTelegramAlert` checks this gate before the missing-token check; if the gate returns false, log at `debug` level (`event: 'telegram.skipped_non_production'`) and return cleanly. The current `isTestMode()` helper at lines 44-45 is replaced by the new gate.

2. **AC#2 — Critical-evaluation paper trail.** `apps/api/src/services/alert.service.ts:evaluateMetric` emits `logger.warn({ event: 'alert.critical_evaluated', metricKey, value })` whenever a metric transitions to (or repeats at) the `critical` level — fired BEFORE `queueAlert` is called and INDEPENDENT of channel availability. Goal: even if every alert channel is gated off or down, future criticals leave a searchable line in pm2 logs.

3. **AC#3 — Test coverage.** `apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` extended with 4 new tests:
   - `NODE_ENV='development'` (no opt-in) → no `fetch` call.
   - `NODE_ENV` undefined (no opt-in) → no `fetch` call.
   - `NODE_ENV='staging'` + `ENABLE_TELEGRAM_ALERTS='true'` → `fetch` called as production would.
   - `NODE_ENV='production'` + `ENABLE_TELEGRAM_ALERTS='false'` → `fetch` called (production is default-allow; explicit `false` does NOT veto prod).
   The existing 11 tests stay green — the existing `beforeEach` sets `NODE_ENV='production'` (line 14 comment: "Bypass the test-mode skip so we exercise the API-call branch"), which is the prod-default-allow path under the new gate, so behaviour is preserved.

4. **AC#4 — `alert.service.test.ts` regression coverage.** Add 1 unit test verifying that `evaluateAlerts(...)` emits the new `alert.critical_evaluated` warn-log on a critical transition, independent of the digest/Telegram side effects (mock pino transport or spy on logger). Existing 10 alert-service tests must stay green.

5. **AC#5 — `.env.example` documentation.** Insert `ENABLE_TELEGRAM_ALERTS=` line after `.env.example:222` (`TELEGRAM_OPERATOR_CHAT_ID=`) with a comment block explaining: (a) production needs no value (default-allow via `NODE_ENV=production`); (b) staging/preview/non-prod environments must set `ENABLE_TELEGRAM_ALERTS=true` to opt in; (c) brief reference to the 2026-05-11 incident as motivation. Match the docblock style of the existing TELEGRAM_BOT_TOKEN block (lines 210-220).

6. **AC#6 — Quality bar.** Both apps pass `pnpm tsc --noEmit`, both apps pass `pnpm lint` clean (0 errors, 0 warnings), full API test suite (`pnpm test` for `@oslsr/api`) passes with no regressions vs the pre-story baseline. Story 9-9 AC#6 regression: existing telegram channel functional behaviour in production is preserved.

7. **AC#7 — Dev Notes incident postmortem.** This story file's Dev Notes section captures a one-paragraph postmortem of the 2026-05-11 incident with explicit link to the memory entry [`incident_2026_05_11_telegram_self_page.md`](../../docs/incident_2026_05_11_telegram_self_page.md) — so a future agent reading just this story understands the trigger and the architectural lesson.

## Tasks / Subtasks

- [ ] **Task 1 — Write failing tests for the new gate (AC: #3)** _(red half of red-green-refactor)_
  - [ ] 1.1 Add test: `NODE_ENV='development'` (no opt-in) → `expect(fetchMock).not.toHaveBeenCalled()`. Use `delete process.env.ENABLE_TELEGRAM_ALERTS` to ensure no opt-in pollution from prior test.
  - [ ] 1.2 Add test: `NODE_ENV` undefined → no fetch call. (`delete process.env.NODE_ENV`)
  - [ ] 1.3 Add test: `NODE_ENV='staging'` + `ENABLE_TELEGRAM_ALERTS='true'` → fetch called once with correct payload.
  - [ ] 1.4 Add test: `NODE_ENV='production'` + `ENABLE_TELEGRAM_ALERTS='false'` → fetch called (prod is default-allow; explicit `false` does NOT veto).
  - [ ] 1.5 Run `pnpm vitest run apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — confirm all 4 NEW tests fail and existing 11 still pass (RED for new, GREEN for old).

- [ ] **Task 2 — Implement the new gate (AC: #1)** _(green half — tests 1.1-1.4 must pass)_
  - [ ] 2.1 Replace the `isTestMode()` helper at `telegram-channel.ts:44-45` with `isAlertSendEnabled()` per AC#1 semantics.
  - [ ] 2.2 In `sendCriticalTelegramAlert` (`telegram-channel.ts:47-99`), move the gate check to the FIRST early-return position (before the token/chat-id check). On gate false, log at `debug` level with `event: 'telegram.skipped_non_production'` and return.
  - [ ] 2.3 Update the header docblock (`telegram-channel.ts:1-29`) — paragraph "Failure semantics" stays unchanged; add a new paragraph "Environment gating" explaining the production-default-allow + explicit opt-in semantics + 2026-05-11 incident link.
  - [ ] 2.4 Run `pnpm vitest run apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — confirm all 15 tests pass (GREEN).

- [ ] **Task 3 — Add critical-evaluation paper-trail log (AC: #2, AC: #4)** _(red-green for the alert-service test)_
  - [ ] 3.1 Write the failing alert-service test FIRST: in `apps/api/src/services/__tests__/alert.service.test.ts`, add a test that calls `evaluateAlerts(...)` with a metric value above critical threshold, then asserts the new warn-log was emitted. Use the existing pino spy/transport pattern in the file — read existing tests to identify the convention before writing. Confirm RED.
  - [ ] 3.2 In `alert.service.ts:evaluateMetric` (around lines 188-199 where `newLevel = isCritical ? 'critical' : 'warning'` is set), add a single warn-log line BEFORE the `queueAlertWithCooldown` call: `if (newLevel === 'critical') logger.warn({ event: 'alert.critical_evaluated', metricKey: key, value });`. Place it INSIDE the `if (state.level === 'ok' || levelChanged || isEscalation)` branch AND in the `else if (state.level === newLevel)` repeat-cooldown branch — both paths fire on critical, both should leave a paper trail. (Or, simpler: place it once inside the `else { ... }` block immediately after `newLevel` is computed but before either branch runs — wins on simplicity.)
  - [ ] 3.3 Confirm GREEN: 1 new alert-service test passes, all existing 10 alert-service tests still pass.

- [ ] **Task 4 — `.env.example` documentation (AC: #5)**
  - [ ] 4.1 Read `.env.example:210-222` (TELEGRAM_BOT_TOKEN block) for tone/style reference.
  - [ ] 4.2 Insert after line 222 (`TELEGRAM_OPERATOR_CHAT_ID=`):
    ```
    # ENABLE_TELEGRAM_ALERTS — opt-in for non-production environments
    # ----------------------------------------------------------------------------
    # Production (NODE_ENV=production) sends Telegram critical alerts by default;
    # this var is unused there. Set to "true" ONLY in staging/preview/QA where you
    # WANT critical alerts to reach the operator's phone.
    #
    # Local dev (NODE_ENV=development OR unset) MUST leave this empty/unset, even
    # if you've copied prod TELEGRAM_BOT_TOKEN into .env for parity testing.
    # Otherwise any local metric sample crossing 'critical' threshold (queue >200,
    # cpu/memory >90%, p95 >500ms) will silently page the operator.
    #
    # Incident reference: 2026-05-11 self-page (incident_2026_05_11_telegram_self_page.md).
    ENABLE_TELEGRAM_ALERTS=
    ```

- [ ] **Task 5 — Full regression sweep (AC: #6)**
  - [ ] 5.1 `pnpm vitest run apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — 15/15 pass.
  - [ ] 5.2 `pnpm vitest run apps/api/src/services/__tests__/alert.service.test.ts` — 11/11 pass (10 existing + 1 new).
  - [ ] 5.3 `pnpm --filter @oslsr/api test` — full API suite, zero regressions vs baseline (~1,991 pass per memory).
  - [ ] 5.4 `pnpm --filter @oslsr/api lint` — 0 errors, 0 warnings.
  - [ ] 5.5 `pnpm --filter @oslsr/api tsc --noEmit` (or rely on husky pre-commit hook from `prep-tsc-pre-commit-hook` story) — 0 errors.
  - [ ] 5.6 Web-side regression NOT required — this story touches only `apps/api/src/services/alerting/` + `apps/api/src/services/alert.service.ts` + root `.env.example`. No web/api contract changes.

- [ ] **Task 6 — Dev Notes postmortem entry (AC: #7)**
  - [ ] 6.1 In the Dev Agent Record's "Completion Notes List" section below, write one paragraph: trigger date+time UTC, metric value, root cause (ungated Telegram dispatch + dev `.env` token mirroring), evidence (`bull:email-notification:id=1923` proof), architectural lesson (push channels in monorepos with prod-mirror dev `.env` need explicit prod gate), link to memory file path.

- [ ] **Task 7 — Pre-commit code review (per [feedback_review_before_commit](../../docs/feedback_review_before_commit.md))**
  - [ ] 7.1 Run `/bmad:bmm:workflows:code-review` on uncommitted working tree. Different LLM/session preferred per project pattern.
  - [ ] 7.2 Auto-fix findings inline; if any are deferred, document under "Review Follow-ups" subsection in Dev Agent Record.
  - [ ] 7.3 Operator (Awwal) commits the diff after review-clean. Per established pattern: never `--no-verify`; husky tsc + lint hooks must pass.

## Dev Notes

### Architecture & constraint summary

The alert pipeline has two parallel delivery channels for criticals:
1. **Telegram push** — `apps/api/src/services/alerting/telegram-channel.ts:sendCriticalTelegramAlert`, called inline by `alert.service.ts:queueAlert` at line 278-283 with `.catch()` swallow. **This call is NOT gated by environment**; only by token presence and `isTestMode()`.
2. **Email digest** — `alert.service.ts:flushDigest` (line 298+), gated by `isNonProductionMode()` at line 299 (which skips on `NODE_ENV === 'development'` OR unset, in addition to test/vitest).

The asymmetry is the bug: email is correctly gated, Telegram is not. A `pnpm dev` run with the prod tokens copied into local `.env` will silently page the operator on any critical metric.

The fix is purely subtractive of the bug — adding a tighter gate at the channel boundary. No new architecture, no new dependencies, no DB/migration impact. Surface area is 3 files: `telegram-channel.ts` + `alert.service.ts` + `.env.example`. Plus 2 test files extended.

### Why a tighter "default-allow" gate (not "default-deny everywhere")

Default-deny would require setting `ENABLE_TELEGRAM_ALERTS=true` on prod VPS. That's a deploy-time risk (PM2 restart with old env → alerts silently disabled in prod, exactly inverting the failure mode of this incident). Default-allow on `NODE_ENV=production` matches Express conventions, requires zero deploy-time config change, and is failure-safe in the right direction: a misconfigured prod is still loud; a misconfigured dev is silent. The `ENABLE_TELEGRAM_ALERTS=true` opt-in is reserved for staging/preview environments where prod-like alert behaviour is wanted.

### 2026-05-11 incident postmortem

**Trigger:** 2026-05-11T12:44:54.556Z. Operator received Telegram critical alert: `Metric: queue_waiting:email-notification, Value: 2761`. Investigation via Tailscale SSH (Bob's predecessor session) proved production was healthy: `bull:email-notification:id` (BullMQ's monotonic add() counter) was **1923** at the time of investigation, making 2761 a physically impossible waiting count for a queue that had never enqueued more than 1923 jobs. Live atomic snapshot showed all states empty. Zero `email.job.*` or `telegram.alert_sent` log entries on prod for May 11. The alert text format matched `formatAlertMessage()` in `telegram-channel.ts` exactly, confirming origin via `sendCriticalTelegramAlert`. Awwal confirmed he had briefly run `pnpm dev` locally — local Node process inherited his `apps/api/.env`-equivalent containing prod Telegram tokens, sampled a synthetic queue state, and dispatched the alert. **Lesson:** push channels in monorepos where dev `.env` mirrors prod for parity testing must default to production-only delivery; test-mode skip alone is insufficient. **Memory:** see `~/.claude/projects/.../memory/incident_2026_05_11_telegram_self_page.md`.

### Project Structure Notes

- 3 source files touched (no new files):
  - `apps/api/src/services/alerting/telegram-channel.ts` — replace `isTestMode()` → `isAlertSendEnabled()`, move gate to first position in `sendCriticalTelegramAlert`.
  - `apps/api/src/services/alert.service.ts` — single new `logger.warn` line in `evaluateMetric`.
  - `.env.example` — single new env var line + comment block.
- 2 test files extended (no new test files):
  - `apps/api/src/services/alerting/__tests__/telegram-channel.test.ts` — +4 tests.
  - `apps/api/src/services/__tests__/alert.service.test.ts` — +1 test.
- No DB migrations, no new audit-action keys (count stays at 40 per Story 9-12 baseline), no new dependencies.
- No frontend impact.
- No deployment env-var requirement (production default-allow path needs no `.env` change on VPS).

### References

- [Source: apps/api/src/services/alerting/telegram-channel.ts:44-45] — current `isTestMode()` gate (to be replaced).
- [Source: apps/api/src/services/alerting/telegram-channel.ts:47-99] — `sendCriticalTelegramAlert` function body (insertion point for new gate at first early-return).
- [Source: apps/api/src/services/alert.service.ts:29-33] — existing `isNonProductionMode()` helper (used only by `flushDigest`; this story restores symmetry to Telegram channel).
- [Source: apps/api/src/services/alert.service.ts:184-203] — `evaluateMetric` else-branch where critical level is computed (insertion point for new warn-log).
- [Source: apps/api/src/services/alert.service.ts:269-291] — `queueAlert` Telegram dispatch (line 278-283 is the ungated call this story addresses).
- [Source: apps/api/src/services/alert.service.ts:298-299] — `flushDigest` `isNonProductionMode()` gate (the existing symmetry pattern).
- [Source: apps/api/src/services/alerting/__tests__/telegram-channel.test.ts:8-21] — `beforeEach` test scaffolding (line 14: `process.env.NODE_ENV = 'production'` which is intentionally the prod-default-allow path under the new gate; existing tests need no modification).
- [Source: .env.example:210-222] — `TELEGRAM_BOT_TOKEN` block (insertion point for `ENABLE_TELEGRAM_ALERTS=` after line 222; tone/style reference for new comment block).
- [Source: docs/emergency-recovery-runbook.md:§1.8] — Alert routing matrix (no changes required; new behaviour is invisible to runbook because prod behaviour is preserved).
- [Source: incident_2026_05_11_telegram_self_page.md] — auto-memory entry containing full incident timeline + evidence.
- [Source: feedback_review_before_commit.md] — code review on uncommitted working tree, never auto-commit.
- [Source: feedback_canonical_create_story_workflow.md] — this story authored via SM canonical workflow per pattern.

### Testing standards summary

- **Test runner:** `pnpm vitest run <path>` for single file; `pnpm --filter @oslsr/api test` for full API suite. NEVER run `pnpm vitest run` from monorepo root for web tests (wrong config).
- **Mock pattern:** existing `telegram-channel.test.ts` uses `vi.fn()` + `global.fetch = fetchMock` with `originalEnv` snapshot in `beforeEach`/`afterEach`. New tests follow this pattern verbatim.
- **Pino spy pattern (for AC#4 alert-service test):** read existing tests in `alert.service.test.ts` to discover the established mock pattern (likely `vi.spyOn(logger, 'warn')` or pino-test transport). Match the file's existing convention.
- **Env-var hygiene:** every new test must explicitly `delete process.env.ENABLE_TELEGRAM_ALERTS` (and other envs it sets) at start; `afterEach` already restores `originalEnv` — but explicit per-test deletes guard against test ordering bugs.
- **Quality gate before commit:** husky pre-commit runs `tsc --noEmit` on staged TS files (per `prep-tsc-pre-commit-hook` story). Lint must be clean.

## Dev Agent Record

### Agent Model Used

_(populated by dev agent at implementation time)_

### Debug Log References

_(populated during implementation)_

### Completion Notes List

_(populated as tasks complete)_

### File List

_(populated as files are created/modified)_

### Review Follow-ups

_(populated if code review surfaces deferred items)_
