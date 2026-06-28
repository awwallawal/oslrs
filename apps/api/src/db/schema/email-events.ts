import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Story 13-9 (AC3/AC4) — inbound email engagement events from the Resend webhook.
 *
 * Funnel events we store: `sent` / `delivered` / `clicked` / `bounced` / `complained`.
 * We NEVER store `opened` (AC4 — Apple-MPP-unreliable + a tracking-pixel DPIA concern, parity with
 * the parked 13-1 pixels). `campaign_id` rides through from the send's Resend tag so the 13-10
 * dashboard can build a per-campaign funnel.
 */
export const emailEventTypes = ['sent', 'delivered', 'clicked', 'bounced', 'complained'] as const;
export type EmailEventType = (typeof emailEventTypes)[number];

export const emailEvents = pgTable(
  'email_events',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),
    /**
     * Story 13-9 (code-review M1) — the Svix delivery id (`svix-id` header). UNIQUE: webhooks are
     * at-least-once, so a Resend RETRY reuses the same svix-id; insert-on-conflict-do-nothing makes
     * the webhook idempotent (no duplicate rows inflating the funnel). Distinct real events (e.g.
     * two clicks) have distinct svix-ids, so they are NOT collapsed.
     */
    webhookId: text('webhook_id').unique(),
    /** Resend message id (the email this event belongs to). */
    messageId: text('message_id').notNull(),
    /** Recipient address (lower-cased on insert). */
    recipient: text('recipient').notNull(),
    /** Campaign tag from the send (Resend tag `campaign_id`); null when the send was untagged. */
    campaignId: text('campaign_id'),
    eventType: text('event_type', { enum: emailEventTypes }).notNull(),
    /** When Resend reports the event occurred. */
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('email_events_campaign_idx').on(t.campaignId),
    recipientIdx: index('email_events_recipient_idx').on(t.recipient),
    messageIdx: index('email_events_message_idx').on(t.messageId),
  }),
);
