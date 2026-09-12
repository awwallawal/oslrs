import { describe, it, expect } from 'vitest';

import {
  GOVERNMENT_VERIFICATION_MEANS,
  GOVERNMENT_VERIFICATION_DOES_NOT_MEAN,
  FORBIDDEN_IDENTITY_CLAIMS,
} from '../trust-claims';

/**
 * Story 13-58, [AI-Review][High] 2026-09-09.
 *
 * R1 IS LOCKED and it had already been broken twice when this was written. The
 * `GovernmentVerifiedBadge` panel was corrected on 2026-08-18 to stop claiming
 * "NIN validated and identity confirmed"; `VerifyWorkerPage` and
 * `GuideVerifyWorkerPage` went on saying it — "NIN has been validated",
 * "Identity verified by government" — to the public, under a green tick, for
 * another three weeks.
 *
 * ⭐ The guard is on the CANONICAL LIST, not on three rendered pages, and that is
 * deliberate. Every surface now renders these arrays, so this is the one place a
 * false claim can enter — and a test pinned here cannot be bypassed by adding a
 * fourth page, which is exactly how the first three diverged.
 */
describe('trust claims — the R1 honesty lock', () => {
  it('makes no identity claim the system cannot back', () => {
    for (const claim of GOVERNMENT_VERIFICATION_MEANS) {
      for (const { pattern, why } of FORBIDDEN_IDENTITY_CLAIMS) {
        expect(
          pattern.test(claim),
          `"${claim}" matches a forbidden claim (${pattern}). ${why}`,
        ).toBe(false);
      }
    }
  });

  /**
   * The disclosure half is what makes the affirmative half honest. Losing the NIMC
   * line to a copy edit would leave a list that is technically true and reads as a
   * government identity check — the exact failure R1 exists to prevent.
   */
  it('always discloses that there is no NIMC check', () => {
    const disclosure = GOVERNMENT_VERIFICATION_DOES_NOT_MEAN.join(' ');

    expect(disclosure).toMatch(/NIMC/i);
    expect(disclosure).toMatch(/format-checked only/i);
  });

  it('never shortens to a bare "Verified" claim', () => {
    for (const claim of [...GOVERNMENT_VERIFICATION_MEANS, ...GOVERNMENT_VERIFICATION_DOES_NOT_MEAN]) {
      expect(claim.trim()).not.toMatch(/^(✓\s*)?verified\.?$/i);
    }
  });

  /**
   * RED-verify for the guard itself: the three strings that actually shipped must
   * be caught. Without this, `FORBIDDEN_IDENTITY_CLAIMS` could be an empty array,
   * or its regexes could be subtly wrong, and every test above would still pass —
   * a guard that approves everything.
   */
  it('catches the three claims that really shipped', () => {
    const shipped = [
      'NIN has been validated',
      'Identity verified by government',
      'their identity has been confirmed through NIN verification',
    ];

    for (const claim of shipped) {
      expect(
        FORBIDDEN_IDENTITY_CLAIMS.some(({ pattern }) => pattern.test(claim)),
        `"${claim}" shipped to production and must be caught by the guard`,
      ).toBe(true);
    }
  });

  /**
   * ...and does NOT catch the honest replacements, or the guard is useless in the
   * other direction: a pattern that reds on correct copy gets deleted by the next
   * person who hits it.
   */
  it('permits the honest replacements', () => {
    const honest = [
      'A State Assessor reviewed this registration and approved it',
      'An 11-digit NIN is on file',
      'We have not confirmed this identity with NIMC — the NIN is format-checked only',
      'The worker is registered in OSLSR and a State Assessor reviewed and approved their registration.',
    ];

    for (const claim of honest) {
      expect(
        FORBIDDEN_IDENTITY_CLAIMS.some(({ pattern }) => pattern.test(claim)),
        `"${claim}" is accurate and must not be flagged`,
      ).toBe(false);
    }
  });
});
