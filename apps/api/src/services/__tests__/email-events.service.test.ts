import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { like, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { emailEvents, emailSuppressions } from '../../db/schema/index.js';
import {
  parseResendEvent,
  recordEmailEvent,
  getSuppressedEmails,
  suppressUnsubscribe,
  NonBareSuppressionKeyError,
} from '../email-events.service.js';
import { SOFT_BOUNCE_RETRY_AFTER_HOURS, SOFT_BOUNCE_MAX_ATTEMPTS } from '../../lib/bounce-severity.js';
import { sql } from 'drizzle-orm';

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

/**
 * Story 13-51 — THE TWO RED-VERIFIES THE STORY NAMES VERBATIM, plus the rules around them.
 *
 * ⛔ These two halves must ship together. Read the SEQUENCING blockquote on the story: making the
 * suppression key MATCH (AC3.3) without recording bounce SEVERITY (AC3.4) converts an inert row
 * into a working, permanent exclusion of a registered citizen on one soft bounce. Each test below
 * is labelled with which half it dies without.
 */
describe('Story 13-51 — bounce severity + the suppression key that can actually match', () => {
  const D = DOMAIN;
  async function cleanup() {
    await db.delete(emailEvents).where(like(emailEvents.recipient, SCOPE));
    await db.delete(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
  }
  beforeEach(cleanup);
  afterAll(cleanup);

  /** A bounce payload carrying the provider's classification, as captured in SCP §11.1. */
  function bounce(to: string, type: string | null, subType = 'General', over: Record<string, unknown> = {}) {
    return {
      type: 'email.bounced',
      created_at: '2026-06-27T11:59:00.000Z',
      data: {
        email_id: `msg-${to}-${type ?? 'none'}`,
        to: [to],
        ...(type ? { bounce: { type, subType } } : {}),
        ...over,
      },
    };
  }

  /** Age a suppression row so the retry window can be exercised without waiting three days. */
  async function ageSuppression(email: string, hours: number) {
    await db.execute(
      sql`UPDATE email_suppressions SET suppressed_at = now() - (${hours} * interval '1 hour') WHERE email = ${email}`,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // RED-VERIFY #1 (AC3.3) — the blockquote's own wording.
  // Neuter toCanonicalEmail's unwrap and this test reds: the row is stored under the wrapped
  // string and the bare lookup can never find it. That is the live prod state for
  // aqeemakolade@gmail.com, whose suppression has sat inert for months.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY (AC3.3): a wrapped "A B <x@y.com>" recipient is suppressed under the BARE key', async () => {
    const bare = `x${D}`;
    await recordEmailEvent(parseResendEvent(bounce(`A B <${bare}>`, 'Permanent'), NOW)!);

    const stored = await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE));
    expect(stored).toHaveLength(1);
    expect(stored[0]!.email).toBe(bare); // not 'a b <x@ee.test>'

    const got = await getSuppressedEmails([bare]);
    expect(got.has(bare)).toBe(true);
  });

  it('AC3.3: the event row records the bare recipient too, so events and suppressions agree', async () => {
    const bare = `ev${D}`;
    await recordEmailEvent(parseResendEvent(bounce(`Someone <${bare}>`, 'Permanent'), NOW)!);
    const evs = await db.select().from(emailEvents).where(like(emailEvents.recipient, SCOPE));
    expect(evs[0]!.recipient).toBe(bare);
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // RED-VERIFY #2 (AC3.4) — the blockquote's own wording.
  // Delete the severity work and this reds: every bounce becomes a permanent suppression again.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY (AC3.4): a SOFT bounce does not produce a permanent suppression', async () => {
    const soft = `soft${D}`;
    await recordEmailEvent(parseResendEvent(bounce(soft, 'Transient', 'MailboxFull'), NOW)!);

    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.severity).toBe('soft');

    // Permanence is not a property of the row's existence — it is whether the address can ever
    // leave the do-not-send set. Age it past the window and it must.
    await ageSuppression(soft, SOFT_BOUNCE_RETRY_AFTER_HOURS + 1);
    expect((await getSuppressedEmails([soft])).has(soft)).toBe(false);
  });

  it('AC3.4: a PERMANENT bounce is hard and stays suppressed however long you wait', async () => {
    const hard = `hard${D}`;
    await recordEmailEvent(parseResendEvent(bounce(hard, 'Permanent'), NOW)!);
    expect(
      (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!.severity,
    ).toBe('hard');

    await ageSuppression(hard, SOFT_BOUNCE_RETRY_AFTER_HOURS * 10);
    expect((await getSuppressedEmails([hard])).has(hard)).toBe(true);
  });

  it('AC3.4 FAIL-SAFE: an unrecognised/absent severity is treated as SOFT, never hard', async () => {
    const unknown = `unknown${D}`;
    // No bounce object at all — exactly what a wrong field name would produce.
    await recordEmailEvent(parseResendEvent(bounce(unknown, null), NOW)!);
    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.severity).toBe('soft');

    await ageSuppression(unknown, SOFT_BOUNCE_RETRY_AFTER_HOURS + 1);
    expect((await getSuppressedEmails([unknown])).has(unknown)).toBe(false);
  });

  it('AC3.4: severity RATCHETS — a Transient after a Permanent does not resurrect the mailbox', async () => {
    const r = `ratchet${D}`;
    await recordEmailEvent(parseResendEvent(bounce(r, 'Permanent'), NOW)!);
    await recordEmailEvent(parseResendEvent(bounce(r, 'Transient', 'MailboxFull'), NOW)!);
    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.severity).toBe('hard');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // AC3.5 — the retry window. Remove the window check and the second assertion reds.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  it('AC3.5: a soft suppression INSIDE the window is still excluded; PAST it, it is retried', async () => {
    const j = `juliet${D}`;
    await recordEmailEvent(parseResendEvent(bounce(j, 'Transient', 'MailboxFull'), NOW)!);

    // Juliet's measured gap was 14 h. Inside the 72 h hold, she must stay excluded.
    await ageSuppression(j, 14);
    expect((await getSuppressedEmails([j])).has(j)).toBe(true);

    await ageSuppression(j, SOFT_BOUNCE_RETRY_AFTER_HOURS + 1);
    expect((await getSuppressedEmails([j])).has(j)).toBe(false);
  });

  it('AC3.5: the retry happens EXACTLY ONCE — a second bounce hits the cap and never retries again', async () => {
    const j = `juliet2${D}`;
    await recordEmailEvent(parseResendEvent(bounce(j, 'Transient', 'MailboxFull'), NOW)!);
    await ageSuppression(j, SOFT_BOUNCE_RETRY_AFTER_HOURS + 1);
    expect((await getSuppressedEmails([j])).has(j)).toBe(false); // retry #1 released

    // The retry is sent and bounces again — exactly what happened to Juliet, 7 days apart.
    await recordEmailEvent(parseResendEvent(bounce(j, 'Transient', 'MailboxFull', { email_id: 'msg-retry' }), NOW)!);
    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.bounceCount).toBe(SOFT_BOUNCE_MAX_ATTEMPTS);

    // Now no amount of waiting releases her again. The answer is a different CHANNEL.
    await ageSuppression(j, SOFT_BOUNCE_RETRY_AFTER_HOURS * 10);
    expect((await getSuppressedEmails([j])).has(j)).toBe(true);
  });

  it('AC3.5: reading twice does not consume a retry — the cap counts BOUNCES, not reads', async () => {
    const e = `pureread${D}`;
    await recordEmailEvent(parseResendEvent(bounce(e, 'Transient'), NOW)!);
    await ageSuppression(e, SOFT_BOUNCE_RETRY_AFTER_HOURS + 1);
    await getSuppressedEmails([e]);
    await getSuppressedEmails([e]);
    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.bounceCount).toBe(1);
    expect((await getSuppressedEmails([e])).has(e)).toBe(false);
  });

  it('AC3.5: a COMPLAINT is never retried, at any age — it is a stated wish, not a delivery failure', async () => {
    const c = `complained${D}`;
    await recordEmailEvent(
      parseResendEvent(
        { type: 'email.complained', created_at: '2026-06-27T11:59:00.000Z', data: { email_id: 'mc', to: [c] } },
        NOW,
      )!,
    );
    await ageSuppression(c, SOFT_BOUNCE_RETRY_AFTER_HOURS * 10);
    expect((await getSuppressedEmails([c])).has(c)).toBe(true);
  });

  it('a later bounce never downgrades a complaint to "bounced"', async () => {
    const c = `wish${D}`;
    await recordEmailEvent(
      parseResendEvent(
        { type: 'email.complained', created_at: '2026-06-27T11:59:00.000Z', data: { email_id: 'mw', to: [c] } },
        NOW,
      )!,
    );
    await recordEmailEvent(parseResendEvent(bounce(c, 'Transient'), NOW)!);
    const row = (await db.select().from(emailSuppressions).where(like(emailSuppressions.email, SCOPE)))[0]!;
    expect(row.reason).toBe('complained');
  });

  it('AC3.5: an UNSUBSCRIBE is never released by the retry window, at any age', async () => {
    // ⚠️ A person's stated wish is not a delivery failure. The window only ever releases rows whose
    // reason is 'bounced'; if this ever reds, the register has started re-mailing people who asked
    // it to stop, which is a consent breach and not merely a bug.
    const u = `unsub${D}`;
    await suppressUnsubscribe(u);
    await ageSuppression(u, SOFT_BOUNCE_RETRY_AFTER_HOURS * 10);
    expect((await getSuppressedEmails([u])).has(u)).toBe(true);
  });

  it('RED-VERIFY (M2): the AC3.6 guard covers the UNSUBSCRIBE inlet too, not just the bounce one', async () => {
    // ⛔ The guard used to sit at ONE call site. `recordEmailEvent` checked `isBareEmail` and
    // `suppressUnsubscribe` — the other writer in the same file — did not, so the "guard the
    // CLASS, not the row" AC was enforced on exactly one of two writers
    // ([[pattern-census-counts-sites-not-callers]]).
    //
    // ⚠️ "The caller already canonicalised" is NOT a defence, and this input is why: an INTERNAL
    // space survives trim + lower-case untouched, so `toCanonicalEmail` is a no-op on it and the
    // value still cannot be an address. That is the class normalisation cannot repair.
    // Remove `assertBareSuppressionKey` from `suppressUnsubscribe` and this reds.
    const nonBare = `not bare${D}`;
    await expect(suppressUnsubscribe(nonBare)).rejects.toThrow(NonBareSuppressionKeyError);
    const stored = await db.select().from(emailSuppressions).where(eq(emailSuppressions.email, nonBare));
    expect(stored).toHaveLength(0);
  });

  it('the provider bounce classification is stored on the event, unmapped (SCP §11.1 forensics)', async () => {
    const f = `forensic${D}`;
    await recordEmailEvent(parseResendEvent(bounce(f, 'Transient', 'MailboxFull'), NOW)!);
    const ev = (await db.select().from(emailEvents).where(like(emailEvents.recipient, SCOPE)))[0]!;
    expect(ev.bounceType).toBe('Transient');
    expect(ev.bounceSubType).toBe('MailboxFull');
  });

  // ─────────────────────────────────────────────────────────────────────────────────────────
  // AC3.6 — guard the CLASS, not the row. Delete the guard and this reds.
  // ─────────────────────────────────────────────────────────────────────────────────────────
  it('AC3.6: storing a NON-BARE suppression key is refused outright', async () => {
    const ev = parseResendEvent(bounce(`guard${D}`, 'Permanent'), NOW)!;
    // Bypass the inlet's canonicalisation the way a future caller might.
    await expect(recordEmailEvent({ ...ev, recipient: `Wrapped <guard${D}>` })).rejects.toBeInstanceOf(
      NonBareSuppressionKeyError,
    );
  });
});
