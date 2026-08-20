/**
 * Story 13-51 (AC1.2 / AC1.4) — the three-bucket rule.
 *
 * ⚠️ EVERY ASSERTION HERE IS ON THE RETURNED BUCKET, never on "the function ran". A rule that
 * exists only inside a component cannot be RED-verified, which is precisely why this lives in
 * `lib/` beside `canonical-email.ts` and not in JSX.
 */
import { describe, it, expect } from 'vitest';
import {
  classifySuppressedAddress,
  suggestCorrectionFor,
} from '../classify-suppressed-address.js';

describe('classifySuppressedAddress (13-51 AC1.4)', () => {
  // ───────────────────────────────────────────────────────────────────────────────────────
  // ORDERING IS THE POINT. `provider_artefact` is tested FIRST because a wrapped address is
  // ALSO a "malformed-looking" string: reorder the branches inside the function and this first
  // assertion reds, silently reclassifying AC1.2's third bucket back into the first — which is
  // how an operator ends up being asked to retype a string the provider invented.
  // ───────────────────────────────────────────────────────────────────────────────────────
  it('RED-VERIFY: a display-name wrapper is a PROVIDER ARTEFACT, not our typo', () => {
    expect(classifySuppressedAddress('wahab akeem olaide <aqeemakolade@gmail.com>')).toBe('provider_artefact');
  });

  it('RED-VERIFY: a bare address at a known-typo domain is OUR capture defect', () => {
    expect(classifySuppressedAddress('yusuffasiat@gmail.co')).toBe('capture_typo');
  });

  it('the artefact branch wins even when the WRAPPED address sits at a typo domain', () => {
    expect(classifySuppressedAddress('Some One <yusuffasiat@gmail.co>')).toBe('provider_artefact');
  });

  it('RED-VERIFY (ordering): a NON-BARE address whose domain IS in the dictionary stays an artefact', () => {
    // ⚠️ THIS is the assertion that makes the branch order load-bearing, and it was missing until
    // the neuter proved the earlier one was passing over a hole.
    //
    // For an angle-bracketed value the typo branch extracts `gmail.co>` — trailing bracket and all
    // — which is in no dictionary, so BOTH orderings happen to answer `provider_artefact` and the
    // wrapped-address test cannot tell them apart. An UPPERCASE address is the discriminating
    // case: it is not bare, but the typo branch lower-cases the domain before the lookup, so
    // `gmail.co` DOES hit the dictionary. Put `capture_typo` first and this reds — an operator is
    // invited to retype a string nobody typed. That is AC1.2's third bucket collapsing back into
    // the first, which is precisely what the ordering rule forbids.
    expect(classifySuppressedAddress('Yusuffasiat@Gmail.CO')).toBe('provider_artefact');
  });

  it.each([
    ['uppercase is not bare', 'Aqeemakolade@Gmail.Com'],
    ['internal whitespace is not bare', 'wahab akeem@gmail.com'],
    ['angle brackets are not bare', '<aqeemakolade@gmail.com>'],
  ])('%s → provider_artefact', (_label, value) => {
    expect(classifySuppressedAddress(value)).toBe('provider_artefact');
  });

  it('a well-formed address at a real domain defaults to THEIRS, not ours', () => {
    // ⚠️ The default matters more than it looks. Guessing "ours" invites an operator to retype an
    // address that was never wrong, and the cost of that mistake is a citizen's contact record.
    expect(classifySuppressedAddress('jambestojeke@gmail.com')).toBe('plausibly_dead');
    expect(classifySuppressedAddress('ola4ct@outlook.com')).toBe('plausibly_dead');
  });

  it('the FOUNDING CASE of this story is now catchable — gmail.come was in neither dictionary', () => {
    // `asirusakirat@gmail.come` is why 13-51 exists: it bounced on 2026-08-06, was auto-suppressed,
    // and its owner became permanently unreachable mid-pending-NIN-ladder. Both typo dictionaries
    // were measured at prep time and NEITHER held `gmail.come` — so the public wizard, the surface
    // AC3.1 says to copy, would not have caught her. Task 6 adds it to both.
    expect(classifySuppressedAddress('asirusakirat@gmail.come')).toBe('capture_typo');
    expect(suggestCorrectionFor('asirusakirat@gmail.come')).toBe('asirusakirat@gmail.com');
  });

  it('mail.com is NOT treated as a typo by the server dictionary (SCP §11.3)', () => {
    // ⚠️ LIVE DISAGREEMENT, DELIBERATELY LEFT AS THE SCP RULED IT. AC1.2 calls
    // `fatomidejumoke@mail.com` "our data problem"; SCP §10.10 lists it among genuine bounces and
    // §11.3 rules AGAINST adding a live provider to the dictionary (real MX, real postmaster,
    // 550 mailbox unavailable). This bucket follows the dictionary, and the dictionary follows
    // §11.3. Changing it is a ruling, not a refactor — see §11.6's reopen trigger.
    expect(classifySuppressedAddress('fatomidejumoke@mail.com')).toBe('plausibly_dead');
  });

  it('an empty or malformed value is an artefact, never a typo to retype', () => {
    expect(classifySuppressedAddress('')).toBe('provider_artefact');
    expect(classifySuppressedAddress(null)).toBe('provider_artefact');
    expect(classifySuppressedAddress('   ')).toBe('provider_artefact');
  });
});

describe('suggestCorrectionFor (13-51 AC3.2 — suggestion, never application)', () => {
  it('offers the dictionary correction for a capture typo', () => {
    expect(suggestCorrectionFor('yusuffasiat@gmail.co')).toBe('yusuffasiat@gmail.com');
  });

  it('offers NOTHING for the other two buckets — there is nothing safe to suggest', () => {
    expect(suggestCorrectionFor('wahab akeem olaide <aqeemakolade@gmail.com>')).toBeNull();
    expect(suggestCorrectionFor('jambestojeke@gmail.com')).toBeNull();
  });
});
