import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailEvents, emailSuppressions } from '../../db/schema/index.js';
import { parseResendEvent, recordEmailEvent, getSuppressedEmails } from '../email-events.service.js';

const NOW = new Date('2026-06-27T12:00:00.000Z');

function event(type: string, over: Record<string, unknown> = {}) {
  return {
    type,
    created_at: '2026-06-27T11:59:00.000Z',
    data: {
      email_id: 'msg-1',
      to: ['Recipient@Example.com'],
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
    expect(r).toMatchObject({ eventType: expected, messageId: 'msg-1', recipient: 'recipient@example.com', campaignId: 'reengagement-2026-07' });
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
  beforeEach(async () => {
    await db.execute(sql`DELETE FROM ${emailEvents}`);
    await db.execute(sql`DELETE FROM ${emailSuppressions}`);
  });
  afterAll(async () => {
    await db.execute(sql`DELETE FROM ${emailEvents}`);
    await db.execute(sql`DELETE FROM ${emailSuppressions}`);
  });

  it('stores a delivered event; does NOT suppress', async () => {
    await recordEmailEvent(parseResendEvent(event('email.delivered'), NOW)!);
    const ev = await db.select().from(emailEvents);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ eventType: 'delivered', recipient: 'recipient@example.com', campaignId: 'reengagement-2026-07' });
    expect(await db.select().from(emailSuppressions)).toHaveLength(0);
  });

  it('a BOUNCE stores the event AND suppresses the address (AC2)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: ['Bad@Example.com'] }), NOW)!);
    const sup = await db.select().from(emailSuppressions);
    expect(sup).toHaveLength(1);
    expect(sup[0]).toMatchObject({ email: 'bad@example.com', reason: 'bounced' });
  });

  it('a complaint suppresses; a repeat bounce for the same email does not duplicate (onConflictDoNothing)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.complained', { to: ['c@x.com'] }), NOW)!);
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: ['c@x.com'], email_id: 'msg-2' }), NOW)!);
    expect(await db.select().from(emailSuppressions)).toHaveLength(1); // unique email, no dup
  });

  it('getSuppressedEmails returns only the suppressed subset (case-insensitive)', async () => {
    await recordEmailEvent(parseResendEvent(event('email.bounced', { to: ['gone@x.com'] }), NOW)!);
    const got = await getSuppressedEmails(['Gone@X.com', 'fine@x.com']);
    expect(got.has('gone@x.com')).toBe(true);
    expect(got.has('fine@x.com')).toBe(false);
  });
});
