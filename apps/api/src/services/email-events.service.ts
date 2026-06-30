import { inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { emailEvents, emailSuppressions, type EmailEventType } from '../db/schema/index.js';
import { toCanonicalEmail } from '../lib/canonical-email.js';

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
  const recipient = str(toRaw).trim().toLowerCase();
  if (!messageId || !recipient) return null;

  let campaignId: string | null = null;
  if (Array.isArray(data.tags)) {
    for (const t of data.tags) {
      const tag = asRecord(t);
      if (str(tag.name) === 'campaign_id' && str(tag.value)) {
        campaignId = str(tag.value);
        break;
      }
    }
  }

  const tsRaw = str(p.created_at) || str(data.created_at);
  const ts = tsRaw ? new Date(tsRaw) : now;
  const occurredAt = Number.isNaN(ts.getTime()) ? now : ts;

  return { eventType, messageId, recipient, campaignId, occurredAt };
}

/**
 * Persist the event; bounce/complaint also upsert the do-not-send suppression (AC2).
 * `webhookId` (the Svix delivery id) makes this idempotent — a retried delivery is dropped
 * (code-review M1). Tests may omit it (null → no dedup, but they use unique data).
 */
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
    })
    .onConflictDoNothing({ target: emailEvents.webhookId });

  if (ev.eventType === 'bounced' || ev.eventType === 'complained') {
    await db
      .insert(emailSuppressions)
      .values({ email: ev.recipient, reason: ev.eventType, sourceMessageId: ev.messageId })
      .onConflictDoNothing({ target: emailSuppressions.email });
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
  await db
    .insert(emailSuppressions)
    .values({ email: normalized, reason: 'unsubscribed' })
    .onConflictDoNothing({ target: emailSuppressions.email });
}

/** AC2 — the blast scripts call this to filter out suppressed addresses before sending. */
export async function getSuppressedEmails(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();
  const lowered = emails.map(toCanonicalEmail);
  // code-review M2 — query only the cohort's addresses (don't load the whole suppression table).
  const rows = await db
    .select({ email: emailSuppressions.email })
    .from(emailSuppressions)
    .where(inArray(emailSuppressions.email, lowered));
  return new Set(rows.map((r) => r.email));
}
