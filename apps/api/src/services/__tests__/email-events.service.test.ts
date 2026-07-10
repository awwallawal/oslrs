import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailEvents, emailSuppressions } from '../../db/schema/index.js';
import { parseResendEvent, recordEmailEvent, getSuppressedEmails } from '../email-events.service.js';

const NOW = new Date('2026-06-27T12:00:00.000Z');

// PARALLEL-SAFE ISOLATION: this file owns the `@ee.test` recipient keyspace. Cleanup and
// reads are scoped to it (LIKE '%@ee.test') so it never clobbers — nor is clobbered by — the
// other email_events DB tests running concurrently (CI is uncapped; see vitest.base.ts).
const DOMAIN = '@ee.test';
const SCOPE = `%${DOMAIN}`;

function event(type: string, over: Record<string, unknown> = {}) {
  return {
    type,
    created_at: '2026-06-27T11:59:00.000Z',
    data: {
      email_id: 'msg-1',
      to: [`Recipient${DOMAIN}`],
      tags: [{ name: 'campaign_id', value: 'reengagement-2026-07' }],
      ...over,
    },
  };
}

describe('parseResendEvent (Story 13-9 AC3/AC4) — PURE', () => {
  it.each([
    ['email.delivered', 'delivered'],
    ['email.clicked', 'clicked'],
    ['email.bounced', 'bounced'],
    ['email.complained', 'complained'],
    ['email.sent', 'sent'],
  ])('maps %s → %s, lowercases recipient, lifts campaign_id from tags', (type, expected) => {
    const r = parseResendEvent(event(type), NOW);
    expect(r).toMatchObject({ eventType: expected, messageId: 'msg-1', recipient: `recipient${DOMAIN}`, campaignId: 'reengagement-2026-07' });
  });

  it('IGNORES email.opened (AC4 — privacy) → null', () => {
    expect(parseResendEvent(event('email.opened'), NOW)).toBeNull();
  });

  it('ignores unknown event types → null', () => {
    expect(parseResendEvent(event('email.delivery_delayed'), NOW)).toBeNull();
  });

  it('campaignId null when no campaign_id tag', () => {
    const r = parseResendEvent(event('email.delivered', { tags: [{ name: 'other', value: 'x' }] }), NOW);
    expect(r?.campaignId).toBeNull();
  });

  // Story 13-21 (AC3) — the REAL Resend webhook shape: tags is an OBJECT MAP,
  // not an array. The 13-9 array-only read recorded every tagged send untagged.
  it('lifts campaign_id from the OBJECT-MAP tags shape (real Resend webhook — AC3)', () => {
    const r = parseResendEvent(
      event('email.delivered', { tags: { campaign_id: 'thankyou-referral-auto' } }),
      NOW,
    );
    expect(r?.campaignId).toBe('thankyou-referral-auto');
  });

  it('object-map tags without a campaign_id key → campaignId null (AC3)', () => {
    const r = parseResendEvent(event('email.delivered', { tags: { category: 'confirm_email' } }), NOW);
    expect(r?.campaignId).toBeNull();
  });

  it('returns null on missing message id or recipient', () => {
    expect(parseResendEvent(event('email.delivered', { email_id: '', id: '' }), NOW)).toBeNull();
    expect(parseResendEvent(event('email.delivered', { to: [] }), NOW)).toBeNull();
  });

  it('is total — non-object / garbage payloads do not throw', () => {
    expect(parseResendEvent(null, NOW)).toBeNull();
    expect(parseResendEvent('nope', NOW)).toBeNull();
    expect(parseResendEvent({ type: 123 }, NOW)).toBeNull();
  });
});

describe('recordEmailEvent + getSuppressedEmails (Story 13-9 AC3/AC2) — DB', () => {
  async function cleanup() {
    await db.delete(emailEvents).where(like(emailEvents.recipient, SCOPE));
    await db.delete(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
  }
  beforeEach(cleanup);
  afterAll(cleanup);

  it('stores a delivered event; does NOT suppress', async () => {
    await recordEmailEvent(parseResendEvent(event('email.delivered'), NOW)!);
    const ev = await db.select().from(emailEvents).where(like(emailEvents.recipient, SCOPE));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ eventType: 'delivered', recipient: `recipient${DOMAIN}`, campaignId: 'reengagement-2026-07' });
    expect(await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE))).toHaveLength(0);
  });

  it('a BOUNCE stores the event AND suppresses the address (AC2)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: [`Bad${DOMAIN}`] }), NOW)!);
    const sup = await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
    expect(sup).toHaveLength(1);
    expect(sup[0]).toMatchObject({ email: `bad${DOMAIN}`, reason: 'bounced' });
  });

  it('a complaint suppresses; a repeat bounce for the same email does not duplicate (onConflictDoNothing)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.complained', { to: [`c${DOMAIN}`] }), NOW)!);
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: [`c${DOMAIN}`], email_id: 'msg-2' }), NOW)!);
    expect(await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE))).toHaveLength(1); // unique email, no dup
  });

  it('getSuppressedEmails returns only the suppressed subset (case-insensitive)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: [`gone${DOMAIN}`] }), NOW)!);
    const got = await getSuppressedEmails([`Gone${DOMAIN.toUpperCase()}`, `fine${DOMAIN}`]);
    expect(got.has(`gone${DOMAIN}`)).toBe(true);
    expect(got.has(`fine${DOMAIN}`)).toBe(false);
  });
});
