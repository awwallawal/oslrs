# Story Brief — Notification Usage Observability & Send-Path Unification

> **Status:** DRAFT brief for SM. Mint the real story via `*create-story --yolo`
> (canonical workflow — do not hand-author the story file). This brief is the
> scoping input; SM owns AC/task numbering + the final template structure.
> Author: Amelia (dev) on 2026-06-21, from the Resend daily-quota investigation.

## ⚠️ VERIFIED ROOT CAUSE (2026-06-21, live VPS via Tailscale) — supersedes the hypotheses below

Live forensics changed the diagnosis. The quota burn is **not** registrations, **not**
a broken backup, **not** a leaked admin in the prod DB:

- **Prod sent 0 emails to `example.com`** (pm2 log grep, 8000 lines). Prod's only sends
  today were 2 *successful* backup notices to the 2 real super_admins.
- **100/100 recent Resend sends are to `backoffice-activate-<ts>@example.com`** test-fixture
  accounts that **do not exist in the prod DB** — 80 "backup failed" + 20 digest, all `delivery_delayed`.
- Backups are **healthy** (`pg_dump.complete` + success email); disk 11%; host `pg_dump` 16.14
  vs server 15 is forward-compatible (not a mismatch).

**Conclusion:** the **production `RESEND_API_KEY` (`re_SKxcW…`) is reused by a non-production
environment** (copied `.env`); *its* failing-backup + digest workers blast the shared 100/day
quota and bounce on `example.com` → reputation/suspension risk. This makes **credential
isolation AC #1** (see AC0 below). The original send-unification/observability scope still
stands — it's how we get the dashboard + abuse tripwire the operator asked for.

- **AC0 — Credential isolation (NEW, primary).** Non-prod environments must use the mock email
  provider or their own key — never prod's. Fail-closed: if `NODE_ENV !== 'production'` and the
  configured key matches the prod-key fingerprint, refuse to send (mirror the F-005 boot guard).
  Immediate operator action (pre-story): rotate the Resend key so prod gets a dedicated one.

## Problem / Context

On 2026-06-21 the operator hit 100% of the Resend **free-tier 100/day** quota and
could not tell from any in-app surface *why*. Investigation found:

1. **The budget guard is blind to most traffic.** `EmailBudgetService`
   (`email:daily:count`, `email-budget.service.ts`) only increments inside
   `email.worker.ts:208` (`recordSend()`). Every high-volume PUBLIC send bypasses
   the queue and calls `EmailService.sendGenericEmail` → Resend directly, so it is
   **neither counted nor throttled**:
   - Magic-links (login / wizard-resume / pending-NIN) — `magic-link.service.ts:377`
   - **Pending-NIN reminder worker** — `reminder.worker.ts:121` (milestones `[2,7,14]`d)
   - Public status + duplicate-registration — `submission-processing.service.ts:881`,
     `registration-status.service.ts:246`, `email.service.ts:329`
   - System-health alert digests — `alert.service.ts:369`
   - Re-engagement / cohort blasts — `_reengagement-email-blast.ts:433`
2. **No per-category breakdown.** `operations.service.ts:201 getResendStatus()`
   pulls the Resend log and tallies delivered/bounced/complained, but not "which
   category" — so a surge of logins, a reminder-worker batch, and a backup-failure
   loop are indistinguishable to the operator.
3. **Once on the paid tier the 100/day ceiling disappears** — removing the only
   accidental backstop. The operator needs an explicit usage signal + abuse
   detection (bot / malicious actor hammering the send path).
4. **SMS has the same gap waiting to happen.** SMS OTP is `NoopSmsProvider` today
   (`sms-provider.adapter.ts`) but Termii is the confirmed provider. Per the
   *install-analytics-before-launch* lesson, observability must ship BEFORE volume.

### Separate IMMEDIATE ops actions (NOT this story — do today)
- Deactivate the leaked `backoffice-activate-…@example.com` active super_admin
  (receives every broadcast → hard-bounces an IANA-reserved domain → Resend
  suppression/suspension risk). `cleanup-test-users.ts:17` misses the
  `backoffice-activate-%` prefix — extend it.
- Investigate the **failing daily backup** (`backup.worker.ts:331` fired
  CRITICAL after 3 retries) — verify `S3_*` Spaces `backups/daily/` for a gap.

## Goal

One instrumented send chokepoint per channel that sees 100% of traffic, an
in-app per-category usage breakdown, and Telegram-pushed daily-usage + anomaly
alerts — for email now and SMS by construction.

## Acceptance Criteria (draft — SM to finalize)

- **AC1 — Single counted chokepoint (email).** All email sends (magic-link,
  reminder, alert, backup, status, blasts) route through one path that increments
  a per-category daily/monthly counter in Redis (`email:daily:count:<cat>`),
  regardless of whether they go via the BullMQ queue. No send bypasses counting.
- **AC2 — Budget guard sees all traffic.** `EmailBudgetService.checkBudget()`
  reflects total real volume; the existing defer/pause throttle now actually
  protects the high-volume public sends (not just low-volume staff mail).
- **AC3 — Classification dashboard.** `getResendStatus()` (or a new
  `getNotificationUsage()`) returns a per-category breakdown sourced from the
  INTERNAL counter (accurate; the Resend list API is a 100-row lower bound).
  Rendered in the CLI ops dashboard + Super Admin ops UI.
- **AC4 — Telegram daily-usage digest.** Extend `ops-digest.worker.ts` /
  `telegram-channel.ts` to push a once-daily usage summary (total + top
  categories + bounce/complaint count).
- **AC5 — Abuse / anomaly detection.** Threshold alerts fire to Telegram on:
  (a) daily volume > configurable ceiling, (b) a single recipient hit ≥ N times
  in a window (loop/targeted abuse), (c) a spike in a public-triggered category
  vs trailing baseline, (d) any send to an undeliverable/test domain.
- **AC6 — Recipient hygiene.** Dedupe the two identical `getActiveSuperAdminEmails`
  copies (`alert.service.ts:402` + `backup.worker.ts:199`) into one shared util
  that filters undeliverable/reserved domains (`example.com`, etc.) before send.
- **AC7 — SMS mirror.** The same counter + category breakdown + abuse thresholds
  exist for the SMS path, wired at the `getSmsProvider()` send boundary, so they
  light up automatically when Termii is bound — verified with the Noop provider.
- **AC8 — Tests.** Unit coverage for: chokepoint counts every category; budget
  reflects bypassed paths; abuse thresholds trip correctly; undeliverable filter;
  SMS counter parity. No regressions in the existing email-budget/backpressure suites.

## Tasks (draft sketch)

- [ ] Task 1 — Introduce a `NotificationMeter` (shared) that records
  `(channel, category, recipient, event)` → Redis counters, called from one
  email chokepoint + one SMS chokepoint. [Source: email-budget.service.ts]
- [ ] Task 2 — Route `sendGenericEmail`-direct callers through the chokepoint
  (magic-link, reminder, alert, status, blasts) without changing their behaviour.
- [ ] Task 3 — Extend `EmailBudgetService` to consume the unified counter.
- [ ] Task 4 — `getNotificationUsage()` in `operations.service.ts` + dashboard +
  Super Admin UI section (per-category breakdown). [Source: operations.service.ts:201]
- [ ] Task 5 — Telegram daily digest + anomaly thresholds in `ops-digest.worker.ts`
  / `telegram-channel.ts`. [Source: alert.service.ts:282]
- [ ] Task 6 — Shared `getActiveSuperAdminEmails()` util + undeliverable-domain
  filter; replace both copies. [Source: alert.service.ts:402, backup.worker.ts:199]
- [ ] Task 7 — SMS chokepoint + counter parity at `getSmsProvider()`.
  [Source: sms-provider.adapter.ts:68]
- [ ] Task 8 — Tests for all of the above.

## Design notes / decisions for SM

- **Counter, not Resend API, is the source of truth for abuse detection.** The
  Resend list API caps at 100 rows/page (a lower bound); on the paid tier that is
  useless for spotting a 5,000-email bot run. The internal per-category counter
  at the send chokepoint is accurate and real-time. Keep `getResendStatus()` for
  delivery/bounce reconciliation only.
- **Extend, don't greenfield.** Ops dashboard, `operations.service.ts`,
  `ops-digest.worker.ts`, and `telegram-channel.ts` already exist (Story 9-19).
- **SMS now is forward-looking** — no real volume until Termii, but shipping the
  meter now means zero dark window when it goes live (Cohort A/B SMS blasts).

## Throwaway diagnostic shipped alongside

`apps/api/scripts/_diagnose-email-usage.ts` — classifies today's Resend sends by
category to confirm the live cause. Superseded by AC3 once this story lands.
