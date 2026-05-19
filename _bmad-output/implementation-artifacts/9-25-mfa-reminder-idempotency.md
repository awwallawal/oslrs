# Story 9.25: MFA enrollment reminder — idempotency long-term fix

Status: ready-for-dev

<!--
Authored 2026-05-19 by Bob (SM) via canonical *create-story --yolo template.

Surfaced 2026-05-19 when operator received THREE MFA enrollment reminder
emails in 90 minutes (06:36, 07:05, 07:24 UTC) from three unrelated CI
deploys (cb9dfca + 82881fc + 3c1bff2). Root cause confirmed via Resend
API logs + grep of CI workflow + code inspection.

`apps/api/scripts/notify-mfa-grace.ts` was wired into the deploy step
in .github/workflows/ci-cd.yml:761 by Story 9-13's F3 code-review
finding ("script existed but was never invoked"). The fix added the
invocation but did NOT add idempotency — every CI deploy re-fired the
reminder to every super_admin with mfa_enabled=false AND grace_until
> NOW. With the operator's awwallawal@gmail.com account disabled by
Op-1 (2026-05-13, see Story 9-12 Post-Launch UAT Log), every deploy
during the 7-day grace window emailed the operator.

2026-05-19 hotfix (commit 672f4d9) commented out the CI invocation
entirely — stops the spam immediately. But that throws out the
legitimate use case: a NEW super_admin enrollment that genuinely needs
a deploy-time reminder. This story restores the deploy-time invocation
WITH proper idempotency so the spam pattern cannot recur.

NOT a prep-task per Awwal's 2026-05-19 directive — real-data-driven
decisions deserve numbered Story tracking.
-->

## Story

As the **super_admin enrolled in MFA grace period (or as the operator who would otherwise be spammed by every CI deploy)**,
I want **MFA enrollment reminder emails to fire AT MOST once per super_admin per 7-day window AND escalate to daily reminders only in the final 72 hours before grace expiry**,
So that **the legitimate "deploy-time email notification" requirement from Story 9-13 AC#5b is met (a fresh super_admin learns about MFA after the migration deploys) without flooding the inbox of operators whose grace period has already been acknowledged**.

## Acceptance Criteria

1. **AC#1 — Schema column added**: new column `users.last_mfa_reminder_sent_at TIMESTAMP WITH TIME ZONE NULL`. Drizzle schema update at `apps/api/src/db/schema/users.ts`. NULL means "never reminded".

2. **AC#2 — Idempotency rule in `notify-mfa-grace.ts`**: the script's user-selection query gains additional WHERE clauses:
   - Always include: `mfa_enabled = false AND mfa_grace_until > NOW()`
   - Skip if reminded recently: `(last_mfa_reminder_sent_at IS NULL OR last_mfa_reminder_sent_at < NOW() - INTERVAL '7 days')` — UNLESS in the final 72-hour countdown
   - Final-72h escalation: `mfa_grace_until - NOW() < INTERVAL '72 hours'` overrides the 7-day rule and allows daily reminders

3. **AC#3 — Stamp `last_mfa_reminder_sent_at` post-send**: after each successful email send, UPDATE `users` SET `last_mfa_reminder_sent_at = NOW()` for that user. Wrap email send + stamp in a transaction so a failed email doesn't false-record a successful reminder.

4. **AC#4 — CI deploy step restored**: the commented-out line in `.github/workflows/ci-cd.yml:761` (commented by hotfix `672f4d9`) is restored. With idempotency now in place, every-deploy invocation is safe.

5. **AC#5 — Backfill on schema-push**: the migration that adds the column also stamps `last_mfa_reminder_sent_at = NOW()` for all super_admins currently in grace AND with `mfa_enabled = false` — captures the implicit "everyone in grace has been reminded today" state from the 2026-05-19 hotfix moment. Prevents the script from immediately re-spamming on the first post-fix deploy.

6. **AC#6 — Audit-log entry per send**: each successful reminder fires `MFA_REMINDER_SENT` audit action (new entry in `AUDIT_ACTIONS`) via the existing `AuditService` hash chain. Details JSONB captures `{recipient_user_id, days_to_grace_expiry, send_count_lifetime}`.

7. **AC#7 — Tests**:
   - Unit test: `notify-mfa-grace.test.ts` — covers the idempotency truth table (never reminded → send; reminded 8 days ago → send; reminded 5 days ago → skip; reminded yesterday + <72h to expiry → send anyway; reminded 5 min ago + <72h → skip — daily cap means once per 24h).
   - Integration test: full pipeline from script invocation → email send → DB stamp → audit log entry.
   - ~6-8 new tests.

8. **AC#8 — Zero regression**: Story 9-13's other ACs (enrollment flow, MFA grace banner, post-expiry redirect, backup codes) unaffected. The change is scoped to `notify-mfa-grace.ts` + users table.

9. **AC#9 — Idempotency verified post-deploy**: after this story ships, the operator does NOT receive a reminder email from this story's deploy (per AC#5 backfill). A second deploy within 24h ALSO does not send. A deploy 8 days later (or <72h to grace) DOES send. Verified via Resend logs check.

## Tasks / Subtasks

- [ ] **Task 1 — Schema column + migration** (AC: #1, #5)
  - [ ] 1.1: Add `lastMfaReminderSentAt` to `apps/api/src/db/schema/users.ts`
  - [ ] 1.2: Author `apps/api/scripts/migrate-mfa-reminder-idempotency-init.ts` — adds column AND backfills NOW() for current grace-period super_admins
  - [ ] 1.3: Wire the migration into `.github/workflows/ci-cd.yml` deploy step
- [ ] **Task 2 — Idempotency logic in `notify-mfa-grace.ts`** (AC: #2, #3)
  - [ ] 2.1: Update the user-selection query with the conditional WHERE clauses
  - [ ] 2.2: Add the transactional send + stamp pattern
- [ ] **Task 3 — Audit-log integration** (AC: #6)
  - [ ] 3.1: Add `MFA_REMINDER_SENT` to `AUDIT_ACTIONS` enum (count moves)
  - [ ] 3.2: Call `AuditService.logEvent()` after successful send
- [ ] **Task 4 — Restore CI invocation** (AC: #4)
  - [ ] 4.1: Uncomment the `notify-mfa-grace.ts` line in ci-cd.yml that hotfix 672f4d9 disabled
- [ ] **Task 5 — Tests** (AC: #7)
- [ ] **Task 6 — Pre-merge BMAD code review on uncommitted tree**

## Dev Notes

### Bridge: hotfix → long-term fix

| Date | Action | Status |
|---|---|---|
| 2026-04-27 eve | Story 9-13 authored | ready-for-dev |
| 2026-05-XX | Story 9-13 deploy + F3 review fix wired `notify-mfa-grace.ts` into CI | review |
| 2026-05-13 | Op-1 disabled MFA on `awwallawal@gmail.com` to unblock login | (security control off) |
| 2026-05-19 | Operator received 3 reminder emails in 90 min from 3 unrelated deploys | bug surfaced |
| 2026-05-19 | Hotfix `672f4d9` commented out CI invocation entirely | spam stopped |
| 2026-05-19 | **Story 9-25 authored** (this story) — restores invocation with idempotency | ready-for-dev |
| Post-9-25 ship | CI deploy step restored + spam pattern cannot recur | ✅ closed |

### Why not just leave the hotfix in place?

The hotfix throws out a legitimate use case: when a NEW super_admin is created (e.g., a second break-glass account for Operate-phase handover), they need to know about MFA grace expiry. Without the deploy-time notification, the operator has to manually run the script via SSH — which adds operational friction AND assumes the operator remembers.

Idempotency lets both audiences coexist:
- Fresh super_admin: gets the reminder on first eligible deploy (their `last_mfa_reminder_sent_at IS NULL`)
- Operator with stuck grace: doesn't get re-spammed (their `last_mfa_reminder_sent_at` is recent from a prior deploy)
- Anyone approaching deadline: gets daily nudges in the final 72h (escalation overrides)

### Edge case — Awwal's account specifically

The operator's account currently has `mfa_grace_until` set to 2026-05-20 (~9h from this story's authoring). After Story 9-25 ships:
- AC#5 backfill stamps `last_mfa_reminder_sent_at = NOW()` — prevents immediate spam on the first post-9-25 deploy
- The <72h escalation will fire ~9h later (at 17:00 UTC on 2026-05-20, when expiry is within 72h) — sending ONE reminder per day until either the operator enrolls OR the grace expires
- Once `mfa_enabled = true` (operator re-enrolls), the user is no longer selected; reminders stop entirely

### Dependencies

- **Story 9-13** — provides the MFA grace mechanism + the `notify-mfa-grace.ts` script. Hotfix `672f4d9` is the bridge.
- **Story 6-1** — audit chain. New `MFA_REMINDER_SENT` action plugs into the existing hash-chain emitter.
- **Story 9-22** (operator-db-audit-discipline) — could be extended later to capture operator manual SSH invocations of the script as `OPERATOR_*` audit rows. Out of scope here; flag as follow-up.

### Risks

1. **Backfill stamps the wrong users** — if AC#5's backfill query incorrectly includes super_admins who haven't actually been reminded, those users won't get their initial reminder. Mitigation: the WHERE clause is conservative (only marks users currently in grace + MFA disabled at the moment of migration). Operators flagged for re-enroll today are exactly the right set.
2. **Final-72h escalation could still feel spammy** if grace is renewed (e.g., admin extends the deadline). Mitigation: renewing grace should also reset `last_mfa_reminder_sent_at = NULL` so the count restarts. Document this in the script header.
3. **Transactional integrity** between email send + DB stamp — Resend's send is OUTSIDE the DB transaction. Best-effort pattern: stamp BEFORE send (worst case: false-positive stamp on a failed send = ONE missed reminder, not spam). Document the trade-off in code comments.

### Effort estimate

~half-day. Schema column + migration ~1h. Query update + transaction ~1h. Tests ~1.5h. Audit integration + CI restore + review ~30 min.

## File List

(Populated by dev agent. Expected:)
- `apps/api/src/db/schema/users.ts` (modified — column added)
- `apps/api/scripts/migrate-mfa-reminder-idempotency-init.ts` (new)
- `apps/api/scripts/notify-mfa-grace.ts` (modified — idempotency logic)
- `apps/api/src/services/audit.service.ts` (modified — new action enum)
- `.github/workflows/ci-cd.yml` (modified — CI invocation restored)
- `apps/api/scripts/__tests__/notify-mfa-grace.test.ts` (new)
- `MEMORY.md` (audit-action count badge updated)
