import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  maskEmail,
  firstNameFrom,
  escapeHtml,
  buildEmail,
  buildReferralUrl,
  KNOWN_FLAGS,
} from '../_thankyou-referral-blast.js';

/**
 * Story 13-11 — unit tests for the Cohort C thank-you + referral blast.
 * Pure functions only; the DB-touching `selectCohort` + `main` are exercised via the
 * operator-driven --dry-run on real data (and the scratch-DB dry-run in dev-story verification).
 */
describe('_thankyou-referral-blast — parseArgs', () => {
  it('accepts --dry-run alone', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
    expect(args.confirmLive).toBe(false);
  });

  it('accepts --confirm-i-am-not-dry-running alone', () => {
    const args = parseArgs(['--confirm-i-am-not-dry-running']);
    expect(args.confirmLive).toBe(true);
    expect(args.dryRun).toBe(false);
  });

  it('defaults --rate-per-minute to 10 and --max-recipients to 100', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.ratePerMinute).toBe(10);
    expect(args.maxRecipients).toBe(100);
  });

  it('parses --rate-per-minute / --lga / --since', () => {
    const args = parseArgs(['--dry-run', '--rate-per-minute', '20', '--lga', 'abc-lga-id', '--since', '2026-05-14']);
    expect(args.ratePerMinute).toBe(20);
    expect(args.lgaId).toBe('abc-lga-id');
    expect(args.since?.toISOString()).toBe('2026-05-14T00:00:00.000Z');
  });

  it('rejects unknown flags (typo defense)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--rate', '5'])).toThrow(/Unknown flag --rate/);
  });

  it('rejects non-positive / invalid numeric + date args', () => {
    expect(() => parseArgs(['--dry-run', '--rate-per-minute', '0'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-recipients', 'xyz'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--since', 'not-a-date'])).toThrow();
  });
});

describe('_thankyou-referral-blast — maskEmail / firstNameFrom / escapeHtml', () => {
  it('masks longer local part, keeps short ones, handles malformed', () => {
    expect(maskEmail('alice@example.com')).toBe('alic*@example.com');
    expect(maskEmail('ab@example.com')).toBe('ab@example.com');
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('firstNameFrom takes first token, defaults to "there"', () => {
    expect(firstNameFrom('Alice Marie')).toBe('Alice');
    expect(firstNameFrom('  Alice  ')).toBe('Alice');
    expect(firstNameFrom('')).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
  });

  it('escapeHtml escapes brackets/ampersands/quotes', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe('&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;');
  });
});

describe('_thankyou-referral-blast — buildReferralUrl (Story 13-9 attribution)', () => {
  it('is the PUBLIC /register link, campaign-tagged (not a magic-link)', () => {
    const url = buildReferralUrl();
    expect(url).toContain('/register');
    expect(url).not.toContain('/auth/magic');
    expect(url).not.toContain('token=');
    expect(url).toContain('utm_campaign=thankyou-referral-2026-07');
    expect(url).toContain('utm_source=referral');
  });
});

describe('_thankyou-referral-blast — buildEmail', () => {
  const URL = buildReferralUrl();

  it('uses the thank-you subject', () => {
    expect(buildEmail('Alice', URL).subject).toMatch(/thank you for registering/i);
  });

  it('personalizes the first-name in text and html', () => {
    const e = buildEmail('Alice', URL);
    expect(e.text).toContain('Hi Alice,');
    expect(e.html).toContain('Hi <strong>Alice</strong>');
  });

  it('html-escapes a hostile first-name', () => {
    const e = buildEmail('<script>alert(1)</script>', URL);
    expect(e.html).not.toContain('<script>alert(1)');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('embeds the tagged referral link in text and html', () => {
    const e = buildEmail('Alice', URL);
    expect(e.text).toContain(URL);
    expect(e.html).toContain(URL);
    expect(e.html).toContain('utm_campaign=thankyou-referral-2026-07');
  });

  it('opt-out directs to the MONITORED support address — not a reply to the no-reply sender (code-review M1)', () => {
    const e = buildEmail('Alice', URL);
    expect(e.text.toLowerCase()).toMatch(/prefer not\s+to receive/);
    expect(e.text).toContain('support@oyoskills.com'); // opt-out routes to the MONITORED address
    expect(e.html).toContain('support@oyoskills.com');
    // M1: must NOT tell the recipient to reply — sends come from an unmonitored noreply@ address.
    expect(e.text.toLowerCase()).not.toMatch(/reply to this email and/);
    expect(e.html.toLowerCase()).not.toMatch(/reply to this email and/);
  });

  it('asks to SHARE A LINK — never solicits a third party\'s personal data (NDPA bright line)', () => {
    const all = (() => {
      const e = buildEmail('Alice', URL);
      return `${e.subject} ${e.text} ${e.html}`.toLowerCase();
    })();
    expect(all).toMatch(/share .*(link|registration)/);
    // must NOT ask the registrant to hand us a friend's contact details
    expect(all).not.toMatch(/friend'?s (phone|number|email|name|contact)/);
    expect(all).not.toMatch(/enter (their|your friend'?s)/);
  });
});

describe('_thankyou-referral-blast — KNOWN_FLAGS', () => {
  it('has exactly the 8 documented flags (drift detector)', () => {
    const expected = ['dry-run', 'confirm-i-am-not-dry-running', 'confirm-resend-pro-active', 'rate-per-minute', 'since', 'lga', 'max-recipients', 'help'];
    for (const flag of expected) expect(KNOWN_FLAGS.has(flag)).toBe(true);
    expect(KNOWN_FLAGS.size).toBe(8);
  });
});
