import { pgTable, uuid, text, timestamp, integer } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Story 13-9 (AC2) — do-not-send list. Fed automatically by `bounced`/`complained` Resend webhook
 * events (AC3); the blast scripts query this and SKIP suppressed addresses BEFORE sending, so a
 * hard-bounce or spam-complaint address is never blasted again. Protects sender reputation /
 * deliverability during the launch campaign. `email` is stored lower-cased + unique.
 *
 * Story 13-13 (AC1) — adds the third, USER-DRIVEN inlet: `unsubscribed`. A successful one-click
 * unsubscribe (List-Unsubscribe header → /api/v1/unsubscribe) writes a row here, so the same
 * `getSuppressedEmails` read that already gates the 3 blasts + the 13-12 auto-send honours it by
 * construction — no enforcement change. `reason` is a plain text column (drizzle text-enum is
 * TypeScript-only, no DB CHECK), so widening this tuple needs no DDL migration.
 */
export const suppressionReasons = ['bounced', 'complained', 'unsubscribed'] as const;
export type SuppressionReason = (typeof suppressionReasons)[number];

/**
 * Story 13-51 (AC3.4) — the hard/soft distinction that did not exist until now.
 *
 * Until this column, `email-events.service.ts` suppressed on ANY bounce and nothing in production
 * code ever removed a suppression (the only `delete(emailSuppressions)` calls in the whole tree
 * were inside tests). So one full mailbox cost a citizen every future message, permanently and
 * silently. Measured on prod 2026-08-11: of five well-formed bounced addresses, **two were
 * `Transient/MailboxFull` — a 40% false-positive rate** on that cohort.
 *
 * `hard`   — the provider says the address is dead (`Permanent`). Suppress and keep suppressed.
 * `soft`   — retryable (`Transient`: full mailbox, greylist, expiry). Held, then retried once.
 * `null`   — NEVER MEASURED. Every row written before 13-51 is this, and it stays this: the raw
 *            payload was discarded at the inlet, so severity is UNRECOVERABLE for those 13 rows.
 *            The `delivered`-then-`bounced` ordering is a proxy, not the provider's word, and a
 *            backfilled `hard` would be a guess wearing a measurement's clothes.
 *
 * ⚠️ NULL IS READ AS SOFT, DELIBERATELY. An unrecognised or absent severity must never
 * permanently exclude a citizen. This is the one place in 13-51 where the conservative default is
 * FEWER suppressions, not more — a wrong `hard` silences a real person, a wrong `soft` costs one
 * more send.
 */
export const suppressionSeverities = ['hard', 'soft'] as const;
export type SuppressionSeverity = (typeof suppressionSeverities)[number];

export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  reason: text('reason', { enum: suppressionReasons }).notNull(),
  /** The Resend message that triggered the suppression (forensics). */
  sourceMessageId: text('source_message_id'),
  /**
   * Story 13-51 (AC3.4). NULL means "never measured" — see `suppressionSeverities` above. Only
   * `hard` suppresses permanently; `soft` and NULL are eligible for one timed retry.
   */
  severity: text('severity', { enum: suppressionSeverities }),
  /**
   * Story 13-51 (AC3.5) — how many times this address has ACTUALLY bounced, incremented by the
   * webhook, never by a reader.
   *
   * ⚠️ It counts OBSERVED BOUNCES, not granted retries, and that is the whole design. A counter
   * incremented when a retry is RELEASED makes the read mutate and still cannot stop the loop
   * Juliet Odiba demonstrated on prod: bounce → suppressed → lifted → sent → bounced again, 7
   * days apart, twice, 14 h to resolve each time. Counting bounces caps that loop structurally —
   * the second bounce is the last one, and the answer after it is a different CHANNEL, not a
   * longer wait.
   */
  bounceCount: integer('bounce_count').notNull().default(1),
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
});
