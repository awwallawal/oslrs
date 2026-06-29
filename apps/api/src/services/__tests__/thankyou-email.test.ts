import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  firstNameFrom,
  buildThankYouReferralUrl,
  buildThankYouEmail,
} from '../thankyou-email.js';

/**
 * Story 13-12 — the shared thank-you/referral builder used by BOTH the 13-11 blast
 * (campaign thankyou-referral-2026-07) and the evergreen auto-send (thankyou-referral-auto).
 */
describe('thankyou-email — escapeHtml / firstNameFrom', () => {
  it('escapeHtml escapes brackets/ampersands/quotes', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
  });
  it('firstNameFrom takes the first token, defaults to "there", accepts null', () => {
    expect(firstNameFrom('Alice Marie')).toBe('Alice');
    expect(firstNameFrom('  Bob  ')).toBe('Bob');
    expect(firstNameFrom('')).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
    expect(firstNameFrom(null)).toBe('there');
  });
});

describe('thankyou-email — buildThankYouReferralUrl (campaign-tagged, per-channel id)', () => {
  it('is the PUBLIC /register link tagged with the GIVEN campaign id (not a magic-link)', () => {
    const blast = buildThankYouReferralUrl('thankyou-referral-2026-07');
    expect(blast).toContain('/register');
    expect(blast).not.toContain('/auth/magic');
    expect(blast).not.toContain('token=');
    expect(blast).toContain('utm_campaign=thankyou-referral-2026-07');
    expect(blast).toContain('utm_source=referral');
  });
  it('the auto-send variant carries its OWN campaign id (funnel separation)', () => {
    expect(buildThankYouReferralUrl('thankyou-referral-auto')).toContain('utm_campaign=thankyou-referral-auto');
  });
});

describe('thankyou-email — buildThankYouEmail', () => {
  const URL = buildThankYouReferralUrl('thankyou-referral-auto');

  it('thank-you subject + personalizes first-name (text + html)', () => {
    const e = buildThankYouEmail('Alice', URL);
    expect(e.subject).toMatch(/thank you for registering/i);
    expect(e.text).toContain('Hi Alice,');
    expect(e.html).toContain('Hi <strong>Alice</strong>');
  });
  it('html-escapes a hostile first-name', () => {
    const e = buildThankYouEmail('<script>alert(1)</script>', URL);
    expect(e.html).not.toContain('<script>alert(1)');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
  it('embeds the tagged referral link (text + html)', () => {
    const e = buildThankYouEmail('Alice', URL);
    expect(e.text).toContain(URL);
    expect(e.html).toContain(URL);
  });
  it('opt-out routes to the MONITORED support address, not a reply (13-11 M1)', () => {
    const e = buildThankYouEmail('Alice', URL);
    expect(e.text).toContain('support@oyoskills.com');
    expect(e.html).toContain('support@oyoskills.com');
    expect(e.text.toLowerCase()).not.toMatch(/reply to this email and/);
  });
  it('asks to SHARE A LINK — never solicits a third party\'s personal data (NDPA bright line)', () => {
    const e = buildThankYouEmail('Alice', URL);
    const all = `${e.subject} ${e.text} ${e.html}`.toLowerCase();
    expect(all).toMatch(/share .*(link|registration)/);
    expect(all).not.toMatch(/friend'?s (phone|number|email|name|contact)/);
    expect(all).not.toMatch(/enter (their|your friend'?s)/);
  });
});
