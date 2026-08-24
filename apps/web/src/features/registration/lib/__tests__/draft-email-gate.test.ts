import { describe, it, expect } from 'vitest';
import { isDraftPersistableEmail, WIZARD_EMAIL_PATTERN } from '../draft-email-gate';

/**
 * Story 13-50 AC4 — the phantom-person gate.
 *
 * AC4.3 asks for the autosave sequence to be simulated and ONE draft row asserted, not three.
 * The sequence is exercised against the gate here and against the debounced hook in
 * `hooks/__tests__/useWizardDraft.phantom-drafts.test.ts`.
 */

describe('13-50 AC4 — a half-typed email must not become a person', () => {
  /**
   * THE FOUR REAL PHANTOMS, by name. Every one of them passes Step 2's own validation, which is
   * why "apply the same validation Step 2 applies" could not have been the whole fix.
   */
  const REAL_PHANTOMS = [
    'yusuffasiat@gmail.co',
    'dayoariremako88@gmail.co',
    'ogunbonadamola@gmail.co',
    'aladechristianahtosin@gmail.co',
  ];

  it.each(REAL_PHANTOMS)('refuses to persist a draft under %s', (email) => {
    expect(isDraftPersistableEmail(email, { emailCommitted: false })).toBe(false);
  });

  it('proves the point: all four PASS Step 2 validation, so the pattern alone is not the fix', () => {
    for (const email of REAL_PHANTOMS) {
      expect(WIZARD_EMAIL_PATTERN.test(email)).toBe(true);
    }
  });

  it('refuses an address that is not yet well-formed', () => {
    expect(isDraftPersistableEmail('a@gmail', { emailCommitted: false })).toBe(false);
    expect(isDraftPersistableEmail('a@', { emailCommitted: false })).toBe(false);
    expect(isDraftPersistableEmail('', { emailCommitted: false })).toBe(false);
    expect(isDraftPersistableEmail(undefined, { emailCommitted: false })).toBe(false);
  });

  it('persists a finished, non-typo address immediately', () => {
    expect(isDraftPersistableEmail('bisi@gmail.com', { emailCommitted: false })).toBe(true);
    expect(isDraftPersistableEmail('  Bisi@Gmail.com ', { emailCommitted: false })).toBe(true);
  });

  /**
   * `mail.com` is in the typo dictionary (mapped to gmail.com) and is ALSO a real provider.
   * Blocking it outright would trade a phantom-person bug for a lost-real-person bug: a genuine
   * mail.com registrant would never get a draft, so abandoning would lose them entirely.
   */
  it('honours a typo-dictionary domain once the registrant has committed it', () => {
    expect(isDraftPersistableEmail('real@mail.com', { emailCommitted: false })).toBe(false);
    expect(isDraftPersistableEmail('real@mail.com', { emailCommitted: true })).toBe(true);
  });

  it('a committed address is still required to be well-formed', () => {
    expect(isDraftPersistableEmail('still-typing@', { emailCommitted: true })).toBe(false);
  });

  /**
   * AC4.3 — the sequence, at the gate. `a@gmail.c` → `a@gmail.co` → `a@gmail.com`.
   * Only the last one may be written, so only ONE row can result.
   */
  it('AC4.3 — across the typing sequence, exactly one address is persistable', () => {
    const sequence = ['a@gmail.c', 'a@gmail.co', 'a@gmail.com'];
    const persistable = sequence.filter((e) =>
      isDraftPersistableEmail(e, { emailCommitted: false }),
    );
    expect(persistable).toEqual(['a@gmail.com']);
  });
});
