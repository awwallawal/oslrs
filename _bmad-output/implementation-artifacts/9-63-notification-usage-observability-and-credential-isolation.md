# Story 9-63: Notification Usage Observability & Send-Credential Isolation

Status: in-progress (Task 1 / AC0 DONE + verified 2026-06-21; Tasks 2–9 = the observability build, pending)

## Story

As the **operator/transferee of OSLRS**,
I want **every email and SMS send to flow through one counted, classified chokepoint — with non-production environments structurally unable to spend the production Resend quota — surfaced on the ops dashboard and pushed to Telegram with abuse detection**,
so that **I can see exactly what notification traffic I'm sending, never have a non-prod environment exhaust or get my prod sender banned, and be paged when a bot/malicious actor hammers the send path once the free-tier daily ceiling is gone**.

## Context & Root Cause (2026-06-21)

On 2026-06-21 the Resend free-tier 100/day quota was exhausted. Live VPS forensics (via Tailscale) established:

- **Prod sent 0 emails to `example.com`** (pm2 log grep). Prod's only sends were 2 *successful* backup notices to the 2 real super_admins (`admin@oyoskills.com`, `awwallawal@gmail.com`).
- **100/100 recent Resend sends went to `backoffice-activate-<ts>@example.com`** test-fixture accounts that **do not exist in the prod DB** (80 "backup failed" + 20 notification digests), all stuck `delivery_delayed`.
- Backups are **healthy**; disk 11%; host `pg_dump` 16.14 vs server 15 is forward-compatible.

**Conclusion:** the production `RESEND_API_KEY` (`re_SKxcW…`) is **reused by a non-production environment** (copied `.env`); its failing-backup + digest workers blast the shared quota and bounce on `example.com` → Resend reputation/suspension risk. Secondary structural gap: most high-volume sends bypass `EmailBudgetService` entirely, so the budget guard, throttle, and dashboard are blind to them.

> Immediate operator action (out of story scope, do first): **rotate the Resend key** so prod has a dedicated one; clear `example.com` entries from Resend Suppressions.

Brief: `_bmad-output/planning-artifacts/story-brief-email-sms-usage-observability.md`.
Diagnostics shipped (uncommitted): `apps/api/scripts/_diagnose-email-usage.ts`, `apps/api/scripts/_deactivate-undeliverable-admins.ts`.

### Confirmed source & immediate remediation (2026-06-21)

The "non-production environment" was the **operator's own local dev machine**. While waiting to
upgrade to the Resend Pro ($20/mo) plan, the **same free-tier `RESEND_API_KEY` was used in both
local and production**. Local `.env` had **`EMAIL_PROVIDER=resend` with `NODE_ENV=development`**,
which *overrides* the factory's safe default: `resolveProviderType` only auto-selects the mock
provider in non-prod when the provider is **not** explicitly `resend` (`providers/index.ts:89`).
So local's failing-backup + digest workers sent real email through the shared key to the seeded
`backoffice-activate-*@example.com` test admins, draining prod's 100/day and bouncing on a
reserved domain.

**Remediation applied (data/config, not code):** local `.env` flipped `EMAIL_PROVIDER=resend` →
`EMAIL_PROVIDER=mock` (2026-06-21). Env is read once at process start, so it takes effect on the
next local API/worker start (no local instance was running at the time of the change → bleed
stopped). No key rotation or plan upgrade was required to stop it.

**Operator mental model (the target end-state this story enforces in code):**

| Environment | `EMAIL_PROVIDER` | Sends real email? |
|---|---|---|
| Local / dev (`NODE_ENV=development`) | `mock` | No — console preview only |
| Production (`NODE_ENV=production`) | `resend` | Yes — the only quota spender |

Notes for the dev: multiple Resend keys on one account share the same quota (a second key does
NOT isolate local); use the mock provider for dev, or a throwaway Resend account for genuine
local delivery tests. Clear the `example.com` entries from Resend → Suppressions post-incident.

**This is exactly the case AC0 must catch:** an explicit `EMAIL_PROVIDER=resend` in a non-prod
env carrying the prod-key fingerprint must **fail closed** to mock — turning the manual one-line
discipline into an enforced guard so a future `.env` copy can't silently re-open the bleed.

## Acceptance Criteria

1. **AC0 — Credential isolation (fail-closed, BELT + SUSPENDERS — operator decision 2026-06-21).** When `NODE_ENV !== 'production'`, the email provider resolver **refuses to construct the real Resend provider BY DEFAULT** — even when `EMAIL_PROVIDER=resend` — falling back to the mock provider with a single warn, **UNLESS** an explicit `ALLOW_REAL_EMAIL_IN_DEV=1` opt-in is set (throwaway-key escape hatch for genuine local delivery tests). **AND additionally**, even with that opt-in, if the configured `RESEND_API_KEY` matches the **known production-key fingerprint** (a committed SHA-256 of the prod key — preferred — or its `re_SKxcW…` identifying prefix), it STILL fails closed to mock + warns (so a copied prod key can never send from dev regardless of the opt-in). Production behaviour is unchanged. [Source: apps/api/src/providers/index.ts:89 `resolveProviderType` — insert the guard immediately before `return configuredProvider`; apps/api/src/services/email.service.ts:43]
2. **AC1 — Single counted email chokepoint.** All email sends — including magic-link, pending-NIN reminder, health-alert digest, backup notice, public-status, duplicate-registration, and the blast scripts — pass through one path that increments a per-category Redis counter (`email:daily:count:<category>` + monthly), regardless of whether they were queued. No send bypasses counting. [Source: apps/api/src/services/magic-link.service.ts:377, apps/api/src/workers/reminder.worker.ts:121, apps/api/src/services/alert.service.ts:369, apps/api/src/workers/backup.worker.ts:308]
3. **AC2 — Budget guard sees all traffic.** `EmailBudgetService.checkBudget()`/`recordSend()` reflect total real volume; the existing 80%/95% defer + auto-pause throttle now also protects the high-volume public sends. [Source: apps/api/src/services/email-budget.service.ts, apps/api/src/workers/email.worker.ts:208]
4. **AC3 — Per-category usage dashboard.** A `getNotificationUsage()` (or extension of `getResendStatus()`) returns today's/this-month's sends bucketed by category from the INTERNAL counter (not the Resend list API, which is a 100-row lower bound). Rendered in the CLI ops dashboard + Super Admin ops UI section. [Source: apps/api/src/services/operations.service.ts:201, apps/api/scripts/dashboard.ts]
5. **AC4 — Telegram daily-usage digest.** The ops digest worker pushes a once-daily usage summary (total + top categories + bounced/complained count) via the existing Telegram channel. [Source: apps/api/src/workers/ops-digest.worker.ts, apps/api/src/services/alerting/telegram-channel.ts]
6. **AC5 — Abuse/anomaly alerts.** Threshold alerts fire to Telegram on: (a) daily volume above a configurable ceiling, (b) a single recipient hit ≥ N times in a window, (c) a public-triggered category spiking vs trailing baseline, (d) any send attempted to an undeliverable/reserved domain. Thresholds are config-driven and gated like existing alerts (non-prod suppressed). [Source: apps/api/src/services/alert.service.ts:282]
7. **AC6 — Recipient hygiene.** The two identical `getActiveSuperAdminEmails` implementations are replaced by one shared util that filters undeliverable/reserved domains before send; covered by a unit test asserting `example.com` is dropped. [Source: apps/api/src/services/alert.service.ts:402, apps/api/src/workers/backup.worker.ts:199]
8. **AC7 — SMS mirror.** The same meter + category counter + abuse thresholds exist for the SMS path, wired at the `getSmsProvider()` send boundary, verified with the Noop provider so it lights up automatically when Termii is bound. [Source: apps/api/src/services/sms-provider.adapter.ts:68]
9. **AC8 — Tests, zero regressions.** Unit coverage for: chokepoint counts every category; budget reflects previously-bypassed paths; AC0 fail-closed; abuse thresholds trip; undeliverable filter; SMS counter parity. Existing email-budget/backpressure suites stay green. [Source: apps/api/src/services/__tests__/email-budget.service.test.ts, apps/api/src/queues/__tests__/email-backpressure.test.ts]

## Tasks / Subtasks

- [x] Task 1 (AC: #0) — **DONE 2026-06-21.** Added the belt+suspenders guard in `resolveProviderType` (`providers/index.ts`): non-prod + `resend` → mock unless `ALLOW_REAL_EMAIL_IN_DEV` opt-in; AND blocked-fingerprint keys (committed SHA-256 `113b1ce5…490760` of the leaked prod key + env-extensible `RESEND_BLOCKED_KEY_FINGERPRINTS`) refused even WITH the opt-in; single pino warn each path; prod unchanged. `resolveProviderType` exported for testability. **4 branch tests added** (default-refuse / suspenders / escape-hatch / prod-unchanged) → email-providers.test.ts 23/23; api tsc 0. Fingerprint derived on the VPS (hash only, key never left the box).
- [ ] Task 2 (AC: #1, #7) — Introduce a shared `NotificationMeter` recording `(channel, category, recipient, event)` → Redis counters, with one email chokepoint and one SMS chokepoint.
- [ ] Task 3 (AC: #1) — Route every `EmailService.sendGenericEmail`-direct caller (magic-link, reminder, alert, backup, status, blasts) through the chokepoint without behaviour change.
- [ ] Task 4 (AC: #2) — Extend `EmailBudgetService` to consume the unified counter; confirm defer/pause now triggers on public-send volume.
- [ ] Task 5 (AC: #3) — `getNotificationUsage()` in `operations.service.ts`; wire into CLI dashboard + Super Admin ops UI.
- [ ] Task 6 (AC: #4, #5) — Daily usage digest + anomaly thresholds in `ops-digest.worker.ts` / `telegram-channel.ts`; config-driven; non-prod suppressed.
- [ ] Task 7 (AC: #6) — Shared `getActiveSuperAdminEmails()` util + reserved-domain filter; replace both copies.
- [ ] Task 8 (AC: #7) — SMS chokepoint + counter parity at `getSmsProvider()`; verify with Noop.
- [ ] Task 9 (AC: #8) — Tests for all of the above; run full suite (scratch DB) — zero regressions.

## Dev Notes

- **Counter, not Resend API, is the source of truth for abuse detection.** Resend's list API caps at 100 rows/page (a lower bound) — useless for spotting a 5,000-email bot run on the paid tier. Keep `getResendStatus()` for delivery/bounce reconciliation only.
- **Extend, don't greenfield.** The ops dashboard, `operations.service.ts`, `ops-digest.worker.ts`, and `telegram-channel.ts` already exist (Story 9-19 / 9-15). Reuse the non-production-suppression + per-metric cooldown patterns in `alert.service.ts`.
- **SMS is forward-looking** — `NoopSmsProvider` today; Termii is the confirmed provider. Shipping the meter now means zero dark window when SMS blasts go live (install-analytics-before-launch lesson).
- **Categories** are derived from the subject lines in `magic-link.service.ts:getCopyForPurpose`, `email.service.ts`, `backup.worker.ts`, `alert.service.ts` — the `_diagnose-email-usage.ts` classifier is the reference mapping.
- Not a launch gate (ops/security hygiene). HARD dep: none. Touches the email provider resolver — pre-deploy, confirm prod `RESEND_API_KEY` is set (deployment-safety: env var before deploy).

### Agent reality-check + dev guidance (2026-06-21, verifier before dev-story)
- **Anchors verified against live code (not assumed):** `resolveProviderType` guard at `providers/index.ts:89` is EXACTLY as described — `if (NODE_ENV !== 'production' && configuredProvider !== 'resend') return 'mock'` — so the AC0 fix is a new branch right before `return configuredProvider`. AC6's **two** `getActiveSuperAdminEmails` confirmed (`alert.service.ts:402` private static + `backup.worker.ts:199` module-level fn — consolidate into one shared util). `email-budget.service.ts` exists. The `_diagnose-email-usage.ts` + `_deactivate-undeliverable-admins.ts` scripts exist (currently untracked).
- **AC0 mechanism = BELT + SUSPENDERS** (operator decision 2026-06-21): default-refuse `resend` in non-prod + `ALLOW_REAL_EMAIL_IN_DEV` opt-in escape hatch + prod-key-fingerprint hard-block. See AC0 + Task 1.
- **Sequencing:** Task 1 (AC0) is the actual incident fix — implement + test it FIRST so the structural protection lands early; AC1–AC8 (meter → chokepoint → budget → dashboard → digest → abuse → SMS) build on top.
- **Test DB discipline (Story 9-62):** run the suite against a SCRATCH DB (`…/app_test` in the docker `oslsr_postgres`), NEVER the UAT `app_db` — the vitest db-guard will refuse a non-test `DATABASE_URL` unless `ALLOW_NONTEST_DB=1`. `DATABASE_URL=…/app_test pnpm --filter @oslsr/api exec vitest run …`.
- **Housekeeping (do during dev):** flip sprint-status `9-63 → in-progress`; commit this story + the brief; decide whether the two `_`-prefixed diagnostic scripts are committed (audit/reference value) or gitignored (throwaway).
- **Operator (OUT OF SCOPE — do separately):** rotate the prod Resend key so prod has a dedicated one; clear the `example.com` entries from Resend → Suppressions.

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-06-21 | Story authored from the Resend quota-exhaustion live investigation; root cause = prod key reused in non-prod. | Bob (SM) |
| 2026-06-21 | Added confirmed source (local `EMAIL_PROVIDER=resend` + shared free-tier key) + immediate remediation (local `.env` → `mock`) + operator mental-model table; reinforced AC0 as the enforced version of the manual fix. | Bob (SM) |
| 2026-06-21 | Pre-dev verification pass: confirmed anchors against live code (`providers/index.ts:89`, two `getActiveSuperAdminEmails`); AC0 mechanism set to BELT+SUSPENDERS (default-refuse + `ALLOW_REAL_EMAIL_IN_DEV` + prod-key fingerprint) per operator; added Task-1-first sequencing + scratch-DB test discipline + housekeeping/operator notes. | verifier (pre-dev) |

## Dev Agent Record

### Agent Model Used
claude-opus-4-8[1m] (Amelia / dev-story)

### Completion Notes
- **Task 1 / AC0 COMPLETE + verified** (2026-06-21). Belt+suspenders credential isolation in `resolveProviderType`. New env knobs: `ALLOW_REAL_EMAIL_IN_DEV` (opt-in escape hatch, throwaway key only) + `RESEND_BLOCKED_KEY_FINGERPRINTS` (operator-extensible block list). Committed fingerprint = SHA-256 of the 2026-06-21-leaked prod key. api tsc 0; email-providers.test.ts 23/23 (4 new branches).
- **Tasks 2–9 PENDING** — the observability build (NotificationMeter chokepoint, budget integration, dashboard, Telegram digest, abuse alerts, shared super-admin util, SMS mirror, tests). Substantial; recommend shipping AC0 first (code-review → commit) then this build as a focused follow-up.

### File List (Task 1 / AC0)
- apps/api/src/providers/index.ts (AC0 guard + exported resolveProviderType + once-per-process warn)
- apps/api/src/providers/__tests__/email-providers.test.ts (4 AC0 branch tests)
- .env.example (ALLOW_REAL_EMAIL_IN_DEV + RESEND_BLOCKED_KEY_FINGERPRINTS docs)
- _bmad-output/implementation-artifacts/9-63-…md (this story)
- _bmad-output/implementation-artifacts/sprint-status.yaml (9-63 → in-progress)

### Review Follow-ups (AI) — Task 1 / AC0
- [x] [AI-Review][Med] M1 — "single warn": added a once-per-process `credentialIsolationWarned` flag so the warn doesn't repeat per provider construction (guard still returns mock every time).
- [x] [AI-Review][Med] M2 — File List completed (.env.example + sprint-status).
- [x] [AI-Review][Low] L1 — commented that the fingerprint reads the canonical `process.env.RESEND_API_KEY` (config.resendApiKey is derived from it).
- [ ] [AI-Review][Low] L2 — ACCEPTED: opt-in accepts only `'1'`/`'true'`; any other value fails closed (safe-by-default).
