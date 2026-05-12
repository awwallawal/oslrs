# Incident Postmortem — 2026-05-11 Telegram Self-Page

**Date:** 2026-05-11T12:44:54.556Z
**Severity:** Low (production was unaffected; operator-time-only impact)
**Detection:** Telegram critical alert delivered to operator's phone
**Root cause class:** Ungated alert dispatch + dev-environment env-var mirroring
**Resolution:** Story 9-15 — production-gate Telegram alerts + paper-trail warn log

## Summary

Operator received a Telegram critical alert at 12:44:54Z reporting `Metric: queue_waiting:email-notification, Value: 2761`. Production was healthy at the time; the alert originated from a local `pnpm dev` run on the operator's laptop, which inherited prod Telegram tokens from a parity-testing `.env` and dispatched the alert via the un-environment-gated `sendCriticalTelegramAlert` path.

## Timeline (UTC)

| Time | Event |
|---|---|
| ~12:30 | Operator briefly ran `pnpm dev` locally to test something unrelated. |
| 12:44:54 | Telegram alert fired with synthetic metric value 2761. |
| 12:45 | Operator received alert; treated it as real production incident. |
| ~13:30 | Investigation begins via Tailscale SSH to `oslsr-home-app`. |
| 14:30 | PM2 + BullMQ + Redis state confirmed healthy on prod. |
| 14:48 | Live atomic Lua snapshot: `wait/active/paused/prioritized/waiting-children` all 0. |
| 14:55 | `bull:email-notification:id` (BullMQ monotonic add() counter) inspected: **value = 1923**. |
| 14:55 | Conclusion: 2761 is physically impossible — counter never resets, queue has never enqueued more than 1923 jobs in lifetime. Alert origin must be elsewhere. |
| ~15:00 | Operator confirms local `pnpm dev` was running with prod tokens copied to local `.env`. |
| 15:30 | Story 9-15 authored by SM (Bob) for the architectural fix. |
| ~17:00 | Story 9-15 implemented + reviewed + committed. |

## Evidence (definitive)

- **`bull:email-notification:id = 1923`** — BullMQ's monotonic `add()` counter for the queue. This counter only ever grows; it does not reset on `drain`, `obliterate`, or process restart. A `waiting` count of 2761 is therefore physically impossible against a queue whose lifetime add count is 1923. The metric value did not originate from this Redis instance.
- **Live atomic snapshot (Lua EVAL, single Redis tick):** `wait=0 active=0 paused=0 prioritized=0 waiting-children=0`.
- **PM2 oslsr-api process state at investigation:** online, uptime 19.7h, restarts=57 lifetime (deploy-correlated, not crash-driven), mem 60MB, cpu 0%.
- **Pm2 stdout for May 11:** zero `email.job.*` log entries (the worker would have emitted ≥5,500 lines at concurrency=5 if 2761 jobs had drained); zero `telegram.alert_sent` events on prod.
- **stderr for May 11:** 0 bytes.
- **Alert format match:** the received Telegram message text matched `formatAlertMessage()` in `apps/api/src/services/alerting/telegram-channel.ts:101-119` exactly, confirming origin in `sendCriticalTelegramAlert` (i.e., the alert came through the OSLRS code path, not a third-party Telegram impostor).

## Root cause

`apps/api/src/services/alert.service.ts:278-283` (pre-Story 9-15) called `sendCriticalTelegramAlert` *inline* on every critical-level transition, with `.catch()` swallowing failures. The dispatch was NOT gated by environment — only by token presence and `isTestMode()` (which only skipped on `NODE_ENV='test'` or `VITEST='true'`).

The asymmetric gating is the bug:
- **Email digest path** (`flushDigest` at `:298-299`): gated by `isNonProductionMode()` which skips on `NODE_ENV='development'` OR unset, in addition to test/vitest. Correct.
- **Telegram dispatch path** (`queueAlert` at `:278-283`): NO environment gate. Bug.

A `pnpm dev` run with `NODE_ENV` unset (or `'development'`) and prod `TELEGRAM_BOT_TOKEN` + `TELEGRAM_OPERATOR_CHAT_ID` mirrored into the local `.env` for parity testing would silently page the operator on any local metric crossing critical threshold (queue >200, cpu/mem >90%, p95 >500ms).

## Architectural lesson

Push-notification channels in monorepos where dev `.env` mirrors prod for parity testing must default to production-only delivery. Test-mode skip alone is insufficient — `NODE_ENV='development'` and `NODE_ENV` unset are NOT covered by typical `isTestMode()` predicates and are precisely the modes a developer's local server runs in.

The principle: **failure-safe gating for noisy side effects must default to production-only, with explicit opt-in for staging/preview.** Default-deny in production would be the wrong direction (a misconfigured prod going silent is worse than a misconfigured dev pinging the operator); default-allow in production with explicit opt-in for non-prod is correct.

## Fix (Story 9-15)

1. `apps/api/src/services/alerting/telegram-channel.ts:isAlertSendEnabled()` replaces `isTestMode()` and is checked FIRST in `sendCriticalTelegramAlert`. Allows dispatch only when `NODE_ENV='production'` OR `ENABLE_TELEGRAM_ALERTS='true'`. Always blocks when `NODE_ENV='test'` OR `VITEST='true'`.
2. `apps/api/src/services/alert.service.ts:evaluateMetric` emits `pino.warn{event:'alert.critical_evaluated'}` on critical TRANSITION (transition-only, before queueAlert). Independent of dispatch layer — guarantees a paper trail in pm2 logs even when every channel is gated off or down.
3. `.env.example` documents `ENABLE_TELEGRAM_ALERTS` opt-in with rationale + this incident link.

## Detection-improvement note

Post-fix, future critical evaluations leave a `pino.warn{event:'alert.critical_evaluated', metricKey, value}` line in pm2 stdout regardless of channel state. If a similar "where did this alert come from?" investigation arises again, the search query is `pm2 logs oslsr-api --raw | grep alert.critical_evaluated` — gives a definitive list of every critical the production process saw.

## Cross-references

- Story 9-15: `_bmad-output/implementation-artifacts/9-15-prod-gate-telegram-alerts.md`
- Auto-memory entry (operator-local): `~/.claude/projects/.../memory/incident_2026_05_11_telegram_self_page.md`
- Telegram channel implementation: `apps/api/src/services/alerting/telegram-channel.ts`
- Alert service: `apps/api/src/services/alert.service.ts`
- `.env.example` ENABLE_TELEGRAM_ALERTS block
- Predecessor story (channel introduced): Story 9-9 AC#6
- UAT runner (introduced post-fix): `scripts/uat-trigger-critical-alert.ts`

## Closure (2026-05-12)

Incident formally closed. Story 9-15 fix shipped to production via PR #1 squash commit `93e1e3e` on 2026-05-12T00:33:25Z; main CI/CD Pipeline + E2E Tests + deploy job all green.

Operator UAT executed on prod hardware via the new permanent runner `scripts/uat-trigger-critical-alert.ts`:

| Test | NODE_ENV | Expected | Observed | Verdict |
|---|---|---|---|---|
| Negative | development | warn fires, NO Telegram, NO email | warn fired, `alert.digest_suppressed_non_production`, no Telegram, no phone | ✅ PASS |
| Positive | production | warn fires, Telegram delivered, email digest sent | warn fired, `telegram.alert_sent` (CPU=95), Resend × 2 to super_admins, operator confirmed phone + emails within ~5 sec | ✅ PASS |

Both runs produced reproducible evidence captured in the story Dev Agent Record "UAT Closure" subsection (with Resend message IDs + pino log lines). The runner is committed at `scripts/uat-trigger-critical-alert.ts` for any future alerting regression check, incident drill, or operator handover.

**Architectural lesson now codified:** the runner serves as a permanent smoke test guarding against regression of the `isAlertSendEnabled()` gate semantics. If a future code change (e.g., refactor to centralised env-config service, or addition of a third alert channel like SMS) breaks the gate, running the negative test (`NODE_ENV=development tsx scripts/uat-trigger-critical-alert.ts`) on prod hardware will catch it — and the positive test will catch any regression of the prod-default-allow path.

Status: closed. Story 9-15 sprint-status flipped `review → done`.
