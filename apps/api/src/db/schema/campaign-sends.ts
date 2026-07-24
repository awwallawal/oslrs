import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Story 13-24 (AC3a) — the CROSS-SYSTEM CONTACT LEDGER: "was this address contacted by a
 * marketing campaign, and when?"
 *
 * WHY THIS EXISTS (the gap it closes). `email_suppressions` (13-9/13-13) answers a DIFFERENT
 * question — "must we never mail this address again?" (bounce / complaint / unsubscribe). It does
 * NOT answer "did we already contact this person this week?", so nothing stopped the welcome
 * backfill and the 13-11 blast — or two runs of the same blast — from hitting one inbox twice in
 * the launch window. The 2026-07-23 send-ownership triangulation verified three live double-send
 * paths (`docs/handoff-2026-07-23-send-ownership-triangulation.md` §1).
 *
 * WHY EMAIL-KEYED, not `respondents.metadata`. The auto-send guard
 * (`metadata.thankyou_referral_sent_at`) cannot dedupe **Cohort B** — those recipients are
 * `wizard_drafts` rows with NO respondent record at all. The only identifier every cohort shares
 * (drafts, respondents, and a future SMS/other-channel audience) is the destination address, so the
 * ledger is keyed by canonical email (`toCanonicalEmail`: trim + lowercase — the same key
 * `email_suppressions` uses, so the two reads always agree on identity).
 *
 * WHY A DEDICATED TABLE, not the Redis NotificationMeter's per-recipient frequency (13-24 open
 * decision #1, resolved 2026-07-23): the meter is a fail-open, Redis-dependent instrumentation
 * counter with no per-campaign semantics and no durability guarantee — a launch-safety guard must
 * not evaporate with a Redis restart. This is transactional, queryable, and per-campaign.
 *
 * APPEND-ONLY BY DESIGN — one row per delivered marketing send. There is deliberately NO unique
 * constraint on `(email, campaign_id)`: a legitimate second contact in a later campaign round is
 * real history, and the dedupe question is always "within the last N days" (see
 * `MARKETING_CONTACT_GAP_DAYS`), never "ever".
 *
 * WRITTEN AT THE CHOKEPOINT, not per script. `EmailService.dispatch()` records a row after every
 * successful send in a MARKETING category (`MARKETING_CATEGORIES`, 13-13) — the same single decision
 * point that already attaches List-Unsubscribe headers and meters the send. A new blast script
 * therefore gets recorded (and, via `filterMarketingCohort`, deduped) for free; it cannot forget to
 * opt in, which is exactly how the original gap was born (3 scripts each re-deriving a cohort).
 *
 * MUST NOT import from @oslsr/types — drizzle-kit runs compiled JS and that package has no dist/
 * (per MEMORY.md key pattern).
 */

/** Delivery channel. `sms` is unused today (9-27 Part B deferred) but reserved so the future SMS
 *  blast inherits the same ledger + filter rather than re-deriving a second dedupe mechanism. */
export const campaignSendChannels = ['email', 'sms'] as const;
export type CampaignSendChannel = (typeof campaignSendChannels)[number];

export const campaignSends = pgTable(
  'campaign_sends',
  {
    id: uuid('id').primaryKey().$defaultFn(() => uuidv7()),

    /** Canonical (trim + lowercase) destination address — the dedupe key across ALL cohorts. */
    email: text('email').notNull(),

    /**
     * The campaign this send belonged to (e.g. `reengagement-2026-07`, `thankyou-referral-auto`).
     * Nullable: a marketing send may reach the chokepoint without an explicit campaign id, and a
     * contact still counts as a contact — the gap filter is campaign-agnostic on purpose.
     */
    campaignId: text('campaign_id'),

    /** The 9-63 notification category the send was classified as (always a MARKETING one). */
    category: text('category'),

    channel: text('channel', { enum: campaignSendChannels }).notNull().default('email'),

    /** Provider message id, when the provider returned one (forensics / joins to `email_events`). */
    messageId: text('message_id'),

    sentAt: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    /** The hot read: "rows for these addresses newer than X" (`getRecentlyContactedEmails`). */
    idxEmailSentAt: index('idx_campaign_sends_email_sent_at').on(table.email, table.sentAt),
    /** Per-campaign reporting / operator dry-run counts. */
    idxCampaignSentAt: index('idx_campaign_sends_campaign_sent_at').on(table.campaignId, table.sentAt),
  }),
);

export type CampaignSend = typeof campaignSends.$inferSelect;
export type NewCampaignSend = typeof campaignSends.$inferInsert;
