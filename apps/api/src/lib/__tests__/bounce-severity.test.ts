/**
 * Story 13-51 (AC3.4 / AC3.5) — the classification that turns "a bounce" into a decision.
 *
 * The field names asserted here are CITED, not invented: SCP §11.1 captured them from
 * `GET https://api.resend.com/emails/{message_id}` against five live message ids on 2026-08-11.
 */
import { describe, it, expect } from 'vitest';
import {
  readBounceClassification,
  classifyBounceSeverity,
  isUnclassifiedBounce,
  classifyEmailState,
  SOFT_BOUNCE_RETRY_AFTER_HOURS,
  SOFT_BOUNCE_MAX_ATTEMPTS,
} from '../bounce-severity.js';

describe('readBounceClassification', () => {
  it('reads the documented nesting: data.bounce.{type,subType}', () => {
    expect(
      readBounceClassification({ type: 'email.bounced', data: { bounce: { type: 'Transient', subType: 'MailboxFull' } } }),
    ).toEqual({ type: 'Transient', subType: 'MailboxFull' });
  });

  it('returns an EMPTY classification rather than throwing when the object is absent', () => {
    // ⚠️ This is the case a wrong field name produces, and it must be survivable — an exception
    // here would 500 the webhook and put Resend into a retry loop.
    expect(readBounceClassification({ type: 'email.bounced', data: {} })).toEqual({ type: null, subType: null });
    expect(readBounceClassification(null)).toEqual({ type: null, subType: null });
  });
});

describe('classifyBounceSeverity (13-51 AC3.4)', () => {
  it('the five REAL prod bounces classify as SCP §11.1 measured them', () => {
    const measured: Array<[string, string, 'hard' | 'soft']> = [
      ['Transient', 'MailboxFull', 'soft'], // julietiyabodeodiba@gmail.com — 452-4.2.2 out of storage
      ['Transient', 'MailboxFull', 'soft'], // ibitolayetunde@gmail.com     — 452-4.2.2 out of storage
      ['Permanent', 'General', 'hard'], //     fatomidejumoke@mail.com      — 550 mailbox unavailable
      ['Permanent', 'General', 'hard'], //     jambestojeke@gmail.com       — 550-5.1.1 no such account
      ['Permanent', 'General', 'hard'], //     ola4ct@outlook.com           — 550 5.5.0 unavailable
    ];
    for (const [type, subType, expected] of measured) {
      expect(classifyBounceSeverity({ type, subType })).toBe(expected);
    }
    // 2 of 5 were false positives under the old "every bounce is permanent" rule — a 40% error
    // rate on the well-formed cohort. That is what this function exists to end.
    expect(measured.filter(([, , s]) => s === 'soft')).toHaveLength(2);
  });

  it('FAIL-SAFE: unknown, empty, or misspelled severity is SOFT — never hard', () => {
    // ⚠️ The one place in 13-51 where the conservative default is FEWER suppressions. A wrong
    // `hard` silences a real person forever; a wrong `soft` costs one more send.
    for (const type of [null, '', 'Perminent', 'unknown', 'HARD', 'bounce']) {
      expect(classifyBounceSeverity({ type, subType: null })).toBe('soft');
    }
  });

  it('is case-insensitive about the provider\'s own casing', () => {
    expect(classifyBounceSeverity({ type: 'permanent', subType: null })).toBe('hard');
    expect(classifyBounceSeverity({ type: '  PERMANENT ', subType: null })).toBe('hard');
  });
});

describe('isUnclassifiedBounce — the observability hook', () => {
  it('is true exactly when neither known value was recognised', () => {
    expect(isUnclassifiedBounce({ type: null, subType: null })).toBe(true);
    expect(isUnclassifiedBounce({ type: 'Nonsense', subType: null })).toBe(true);
    expect(isUnclassifiedBounce({ type: 'Transient', subType: null })).toBe(false);
    expect(isUnclassifiedBounce({ type: 'Permanent', subType: null })).toBe(false);
  });
});

describe('the retry window is a MEASURED ASSUMPTION (13-51 AC3.5)', () => {
  it('keeps a stated margin over the only two observations we have', () => {
    // Juliet Odiba, measured twice on prod: 14 h from send to Transient bounce, both times.
    // Two observations of one Gmail mailbox is a shape, not a distribution — the margin is doing
    // the work, not the sample. If this assertion ever has to be relaxed, that is the reopen
    // trigger firing, not a test to update.
    const MEASURED_RESOLUTION_HOURS = 14;
    expect(SOFT_BOUNCE_RETRY_AFTER_HOURS).toBeGreaterThanOrEqual(MEASURED_RESOLUTION_HOURS * 5);
  });

  it('allows exactly ONE retry before the answer becomes a different channel', () => {
    // A lift is not a fix: Juliet's mailbox was still full seven days on, so a second attempt
    // bought one more bounce and one more mark against the sending domain.
    expect(SOFT_BOUNCE_MAX_ATTEMPTS).toBe(2);
  });
});

describe('classifyEmailState (13-51 code-review M1) — three states, and the third is not the second', () => {
  const bounced = { reason: 'bounced', severity: null as string | null, bounceCount: 1 };

  it('RED-VERIFY (M1): an UNSUBSCRIBE is opted_out — it must never read as "given up, use phone"', () => {
    // ⛔ THE DEFECT THIS REPLACES: `emailGivenUp = reason !== 'bounced' || …` was true for every
    // unsubscribe, the table rendered that as "given up — use phone", and the page header counted
    // those people into "N given up on by email but have a phone number". The one group who had
    // explicitly asked us to stop was the group the screen told an operator to ring.
    // Delete the `reason !== 'bounced'` branch (or move it below the severity test) and this reds.
    expect(classifyEmailState({ reason: 'unsubscribed', severity: null, bounceCount: 1 })).toBe('opted_out');
    expect(classifyEmailState({ reason: 'complained', severity: null, bounceCount: 1 })).toBe('opted_out');
  });

  it('an unsubscribe stays opted_out even when it ALSO satisfies the given-up arithmetic', () => {
    // The discriminating case: hard severity and an exhausted count would both answer 'given_up'
    // on a bounce. Ordering is what keeps a stated wish out of that bucket.
    expect(classifyEmailState({ reason: 'unsubscribed', severity: 'hard', bounceCount: 99 })).toBe('opted_out');
  });

  it('a HARD bounce is given_up — the mailbox failed us, so try another channel', () => {
    expect(classifyEmailState({ ...bounced, severity: 'hard' })).toBe('given_up');
  });

  it('a soft bounce that has used its retry is given_up', () => {
    expect(classifyEmailState({ ...bounced, bounceCount: SOFT_BOUNCE_MAX_ATTEMPTS })).toBe('given_up');
  });

  it('a first soft bounce is HOLDING — NULL severity reads as soft, the fail-safe direction', () => {
    // Every pre-13-51 row is severity NULL ("never measured"), and NULL must not strand anyone.
    expect(classifyEmailState({ ...bounced, severity: null })).toBe('holding');
    expect(classifyEmailState({ ...bounced, severity: 'soft' })).toBe('holding');
  });
});
