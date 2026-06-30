import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
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

export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  reason: text('reason', { enum: suppressionReasons }).notNull(),
  /** The Resend message that triggered the suppression (forensics). */
  sourceMessageId: text('source_message_id'),
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
});
