import { inArray, sql, and } from 'drizzle-orm';
import pino from 'pino';
import { db } from '../db/index.js';
import { emailEvents, emailSuppressions, type EmailEventType } from '../db/schema/index.js';
import { toCanonicalEmail, isBareEmail } from '../lib/canonical-email.js';
import {
  readBounceClassification,
  classifyBounceSeverity,
  isUnclassifiedBounce,
  SOFT_BOUNCE_RETRY_AFTER_HOURS,
  SOFT_BOUNCE_MAX_ATTEMPTS,
  type ProviderBounceClassification,
} from '../lib/bounce-severity.js';

const logger = pino({ name: 'email-events' });

/**
 * Story 13-9 (AC3/AC2) — map verified Resend webhook payloads → `email_events`, and feed the
 * `email_suppressions` do-not-send list from bounces/complaints. `email.opened` is intentionally
 * NOT mapped (AC4 — privacy + unreliable). Pure parse is separated from the DB write for testing.
 */

const TYPE_MAP: Record<string, EmailEventType> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  // 'email.opened' deliberately absent — AC4.
};

export interface ParsedResendEvent {
  eventType: EmailEventType;
  messageId: string;
  recipient: string;
  campaignId: string | null;
  occurredAt: Date;
  /**
   * Story 13-51 (AC3.4) — the provider's bounce classification, which this parser used to drop.
   * Null for every non-bounce event. Present-but-empty for a bounce whose payload carried nothing
   * we recognise, which is a different thing and is logged as such.
   */
  bounce: ProviderBounceClassification | null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/**
 * PURE — map a verified Resend webhook payload to an `email_events` row, or null when ignored
 * (email.opened, unknown types, or missing message/recipient). `now` is injected for testability.
 */
export function parseResendEvent(payload: unknown, now: Date): ParsedResendEvent | null {
  const p = asRecord(payload);
  const eventType = TYPE_MAP[str(p.type)];
  if (!eventType) return null; // ignores email.opened + unknowns (AC4)

  const data = asRecord(p.data);
  const messageId = str(data.email_id) || str(data.id);
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
  // Story 13-51 (AC3.3) — ONE FUNCTION OWNS THE KEY. This used to hand-roll `.trim().toLowerCase()`
  // while the unsubscribe inlet and the reader both called `toCanonicalEmail`, so the writer and
  // the reader disagreed about what an address IS and a wrapped `Name <addr>` recipient produced a
  // suppression row that could never match its own lookup. Hand-rolling it again reopens that.
  const recipient = toCanonicalEmail(str(toRaw));
  if (!messageId || !recipient) return null;

  // Story 13-21 (AC3) — Resend WEBHOOK events echo tags as an OBJECT MAP
  // (`data.tags: { campaign_id: "..." }`), NOT the array-of-{name,value} shape
  // the *send* API accepts. The original array-only read never matched a real
  // inbound event, so EVERY tagged send recorded with a blank `campaign_id`
  // (13-9 attribution broken for auto-sends + blasts). Read the object-map shape
  // first (the live shape), keep the array shape as a defensive fallback for any
  // legacy/alternate payloads or hand-built test fixtures.
  let campaignId: string | null = null;
  if (Array.isArray(data.tags)) {
    for (const t of data.tags) {
      const tag = asRecord(t);
      if (str(tag.name) === 'campaign_id' && str(tag.value)) {
        campaignId = str(tag.value);
        break;
      }
    }
  } else if (data.tags && typeof data.tags === 'object') {
    const v = str((data.tags as Record<string, unknown>).campaign_id);
    if (v) campaignId = v;
  }

  const tsRaw = str(p.created_at) || str(data.created_at);
  const ts = tsRaw ? new Date(tsRaw) : now;
  const occurredAt = Number.isNaN(ts.getTime()) ? now : ts;

  // Story 13-51 (AC3.4) — keep the bounce sub-object instead of discarding the payload. A full
  // mailbox and a dead domain arrive here looking identical unless this is read.
  const bounce = eventType === 'bounced' ? readBounceClassification(payload) : null;

  return { eventType, messageId, recipient, campaignId, occurredAt, bounce };
}

/**
 * Persist the event; bounce/complaint also upsert the do-not-send suppression (AC2).
 * `webhookId` (the Svix delivery id) makes this idempotent — a retried delivery is dropped
 * (code-review M1). Tests may omit it (null → no dedup, but they use unique data).
 */
export class NonBareSuppressionKeyError extends Error {
  constructor(public readonly value: string) {
    super(
      `Refusing to store "${value}" as a suppression key: it is not a bare address, so it could ` +
        `never match a lookup. 13-51 AC3.6 — guard the CLASS, not the row.`,
    );
    this.name = 'NonBareSuppressionKeyError';
  }
}

/**
 * Story 13-51 (AC3.6, tightened by code-review M2) — EVERY WRITE TO `email_suppressions` PASSES
 * THROUGH HERE.
 *
 * ⛔ THE GUARD USED TO SIT AT ONE INLET, WHICH IS NOT GUARDING A CLASS. `recordEmailEvent`
 * checked, and `suppressUnsubscribe` — the other writer in this very file — did not. AC3.6's own
 * words are "guard the CLASS, not the row… so the next non-bare value fails loudly instead of
 * sitting inert for months", and a check bolted to one call site is precisely the shape
 * [[pattern-census-counts-sites-not-callers]] warns about: the second caller writes the row and
 * the guard never sees it.
 *
 * ⚠️ `toCanonicalEmail` IS NOT THIS PREDICATE, so "the caller already canonicalised" is not a
 * defence. An INTERNAL space survives trim + lower-case untouched — canonicalising is a no-op and
 * the value still cannot be an address. That is the class of key normalisation cannot repair, and
 * it is the one that must never reach the table.
 */
function assertBareSuppressionKey(value: string): void {
  if (isBareEmail(value)) return;
  logger.error(
    { event: 'email_events.non_bare_suppression_key', value },
    'refused a non-bare suppression key (13-51 AC3.6) — it could never match its own lookup',
  );
  throw new NonBareSuppressionKeyError(value);
}

export async function recordEmailEvent(ev: ParsedResendEvent, webhookId?: string): Promise<void> {
  await db
    .insert(emailEvents)
    .values({
      webhookId: webhookId ?? null,
      messageId: ev.messageId,
      recipient: ev.recipient,
      campaignId: ev.campaignId,
      eventType: ev.eventType,
      occurredAt: ev.occurredAt,
      bounceType: ev.bounce?.type ?? null,
      bounceSubType: ev.bounce?.subType ?? null,
    })
    .onConflictDoNothing({ target: emailEvents.webhookId });

  if (ev.eventType === 'bounced' || ev.eventType === 'complained') {
    // Story 13-51 (AC3.4) — a COMPLAINT is always permanent (someone pressed "spam"; there is
    // nothing transient about that). A BOUNCE is only permanent when the provider says so.
    const severity = ev.eventType === 'complained' ? 'hard' : classifyBounceSeverity(ev.bounce ?? { type: null, subType: null });

    if (ev.eventType === 'bounced' && ev.bounce && isUnclassifiedBounce(ev.bounce)) {
      // ⚠️ OBSERVABILITY, NOT DECORATION. The webhook body shape is the one part of AC3.4 that
      // could not be evidenced from a real capture (see `lib/bounce-severity.ts`). If the field
      // name is wrong, EVERY bounce lands here and is treated as soft — safe for citizens, but it
      // would silently stop protecting the sending domain. A rising count of this line is the
      // signal that the reader needs the real payload; silence is the signal that it works.
      logger.warn(
        { event: 'email_events.bounce_unclassified', messageId: ev.messageId, bounceType: ev.bounce.type, bounceSubType: ev.bounce.subType },
        'bounce carried no recognisable severity — defaulting to SOFT (13-51 AC3.4 fail-safe)',
      );
    }

    // 🔒 AC3.6 — GUARD THE CLASS. `toCanonicalEmail` above should make this unreachable; that is
    // exactly why it is here. The 8% non-bare rate is the PROVIDER'S property and can change
    // without notice, so the next shape we have not seen must fail loudly at the boundary rather
    // than become another row that sits inert for months looking like it works.
    assertBareSuppressionKey(ev.recipient);

    await db
      .insert(emailSuppressions)
      .values({
        email: ev.recipient,
        reason: ev.eventType,
        sourceMessageId: ev.messageId,
        severity,
        bounceCount: 1,
      })
      .onConflictDoUpdate({
        target: emailSuppressions.email,
        set: {
          // COUNT THE BOUNCE. This is what caps the retry loop (AC3.5) — see the column docblock.
          bounceCount: sql`${emailSuppressions.bounceCount} + 1`,
          // Restart the hold window from the LATEST failure, not the first one.
          suppressedAt: sql`now()`,
          sourceMessageId: sql`excluded.source_message_id`,
          // ⚠️ RATCHET, NEVER A DOWNGRADE. Once hard, always hard: a Permanent bounce followed by
          // a Transient one does not resurrect the mailbox.
          severity: sql`CASE WHEN ${emailSuppressions.severity} = 'hard' THEN 'hard' ELSE excluded.severity END`,
          // ⚠️ AN UNSUBSCRIBE OR A COMPLAINT IS A PERSON'S STATED WISH. A later bounce must never
          // overwrite it with the weaker 'bounced', or the row stops recording that they asked.
          reason: sql`CASE WHEN ${emailSuppressions.reason} IN ('complained', 'unsubscribed') THEN ${emailSuppressions.reason} ELSE excluded.reason END`,
        },
      });
  }
}

/**
 * Story 13-13 (AC1/AC5) — the USER-driven suppression inlet. A verified one-click unsubscribe upserts
 * the address with `reason='unsubscribed'` (idempotent: an already-suppressed address — for ANY reason
 * — is left untouched, so this never downgrades a bounce/complaint). Same `onConflictDoNothing` shape
 * the 13-9 webhook uses for bounces/complaints, so `getSuppressedEmails` honours it by construction.
 */
export async function suppressUnsubscribe(email: string): Promise<void> {
  const normalized = toCanonicalEmail(email);
  // 🔒 AC3.6 (code-review M2) — the SAME guard the bounce inlet uses. An unsubscribe stored under
  // a key no lookup can match is an unsubscribe that silently did not happen, which is the worst
  // of the three outcomes: the person believes they opted out and we keep mailing them. Failing
  // here surfaces as a 500 the caller already handles (`unsubscribe.controller.ts`) and a logged
  // event a human can act on.
  assertBareSuppressionKey(normalized);
  await db
    .insert(emailSuppressions)
    .values({ email: normalized, reason: 'unsubscribed' })
    .onConflictDoNothing({ target: emailSuppressions.email });
}

/**
 * AC2 — the blast scripts call this to filter out suppressed addresses before sending.
 *
 * Story 13-51 (AC3.5) — IT IS NO LONGER "EVERY ROW ON THE TABLE".
 *
 * Before this change a suppression was forever: nothing in production code ever deleted one, so a
 * single full mailbox removed a citizen from every future message, permanently and silently. Now
 * a row is released for exactly one more attempt when ALL of these hold:
 *
 *   - it came from a BOUNCE (a complaint or an unsubscribe is a person's stated wish and is
 *     never retried, at any age);
 *   - the provider did not call it Permanent (`severity <> 'hard'`, and NULL — "never measured",
 *     which is every pre-13-51 row — counts as soft, the fail-safe direction);
 *   - it has bounced fewer than SOFT_BOUNCE_MAX_ATTEMPTS times;
 *   - the last bounce is older than SOFT_BOUNCE_RETRY_AFTER_HOURS.
 *
 * ⚠️ THIS FUNCTION IS A PURE READ AND MUST STAY ONE. The attempt cap is enforced by counting
 * BOUNCES at the webhook, not by counting releases here — so calling this twice cannot consume a
 * retry, and a caller that reads without sending changes nothing. See the `bounceCount` docblock.
 *
 * ⚠️ It is also the ONLY gate between the register and a citizen's inbox. Widening it is how a
 * suppressed person gets mailed anyway; narrowing it is how a live person goes silent. Both
 * failure modes have happened here.
 */
export async function getSuppressedEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const lowered = emails.map(toCanonicalEmail);
  // code-review M2 — query only the cohort's addresses (don't load the whole suppression table).
  const rows = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(
      and(
        inArray(emailSuppressions.email, lowered),
        sql`NOT (
          ${emailSuppressions.reason} = 'bounced'
          AND coalesce(${emailSuppressions.severity}, 'soft') <> 'hard'
          AND ${emailSuppressions.bounceCount} < ${SOFT_BOUNCE_MAX_ATTEMPTS}
          AND ${emailSuppressions.suppressedAt} < now() - (${SOFT_BOUNCE_RETRY_AFTER_HOURS} * interval '1 hour')
        )`,
      ),
    );
  return new Set(rows.map((r) => r.email));
}

/*
 * Story 13-51 (code-review M4) — `listEmailGivenUpOn` WAS HERE AND HAS BEEN DELETED.
 *
 * It encoded "who has email given up on" a THIRD time, in SQL, and had zero callers and zero
 * tests anywhere in `apps/api` or `apps/web` — while the copy that WAS being used (in
 * `suppressed-contacts.service.ts`) carried the defect that told operators to phone people who
 * had unsubscribed. A dead second spelling of a rule is not redundancy, it is the drift the next
 * story inherits.
 *
 * The rule now lives in exactly one place: `classifyEmailState` in `lib/bounce-severity.ts`,
 * beside the constants it depends on, pure and tested. If a digest line (13-42 AC8) needs this
 * list, it reads `listSuppressedContacts` and filters on `emailState`, which is the same answer
 * the operator screen shows rather than a second one that can disagree with it.
 */
