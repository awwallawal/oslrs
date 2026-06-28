import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Story 13-9 (AC2) — do-not-send list. Fed automatically by `bounced`/`complained` Resend webhook
 * events (AC3); the blast scripts query this and SKIP suppressed addresses BEFORE sending, so a
 * hard-bounce or spam-complaint address is never blasted again. Protects sender reputation /
 * deliverability during the launch campaign. `email` is stored lower-cased + unique.
 */
export const suppressionReasons = ['bounced', 'complained'] as const;
export type SuppressionReason = (typeof suppressionReasons)[number];

export const emailSuppressions = pgTable('email_suppressions', {
  id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
  email: text('email').notNull().unique(),
  reason: text('reason', { enum: suppressionReasons }).notNull(),
  /** The Resend message that triggered the suppression (forensics). */
  sourceMessageId: text('source_message_id'),
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
});
