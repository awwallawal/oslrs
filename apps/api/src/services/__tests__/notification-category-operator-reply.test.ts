/**
 * Story 13-51 (➕ ADDED 2026-08-11) — the send-category vocabulary had no word for an operator
 * reply, and `other` is silent, so the gap looked like a deliberate bucket.
 *
 * Found by USING it: the two individual registration-number replies sent by hand from
 * `admin@oyoskills.com` on 2026-08-11 (Jamiu, Juliet) were counted as `other`. Nobody learned the
 * vocabulary had fallen behind the code — it was noticed only because a human read one line of
 * script output.
 */
import { describe, it, expect } from 'vitest';
import { classifyEmailSubject, isUnclassifiedSubject } from '../notification-category.js';

// The EXACT subject the reply script sends (`_ops-send-registration-number-reply.ts`).
const REPLY_SUBJECT = 'You are registered — Oyo State Livelihood and Skills Registry (OSL-2026-51CNVZ)';

describe('operator-reply category (13-51 ➕ §1)', () => {
  it('RED-VERIFY: the operator reply subject classifies as operator-reply, not other', () => {
    // Before this story it fell through all 17 matchers to 'other'.
    expect(classifyEmailSubject(REPLY_SUBJECT)).toBe('operator-reply');
  });

  it('does not steal subjects that belong to the existing specific buckets', () => {
    // Ordering regression guard: the new rule sits with the other specifics and must not shadow
    // any of them.
    expect(classifyEmailSubject('Sign in to your account')).toBe('magiclink-login');
    expect(classifyEmailSubject('Continue your registration')).toBe('magiclink-wizard-resume');
    expect(classifyEmailSubject('Add your NIN')).toBe('pending-nin-reminder');
    expect(classifyEmailSubject('Your account is active')).toBe('staff-activation-complete');
    expect(classifyEmailSubject('Daily backup failed')).toBe('backup-FAILURE');
  });
});

describe('the "other" fallback is observable (13-51 ➕ §2)', () => {
  it('flags a subject no rule matched', () => {
    expect(isUnclassifiedSubject('Some brand new send type nobody has bucketed')).toBe(true);
  });

  it('does NOT flag a subject that matched a real rule', () => {
    expect(isUnclassifiedSubject(REPLY_SUBJECT)).toBe(false);
  });

  it('never throws, whatever it is handed', () => {
    // ⚠️ A classifier that can fail a send would let a taxonomy gap block a citizen's email,
    // which is far worse than a miscounted one.
    expect(() => classifyEmailSubject('')).not.toThrow();
    expect(() => classifyEmailSubject(undefined as unknown as string)).not.toThrow();
  });
});
