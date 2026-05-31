import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  maskEmail,
  firstNameFrom,
  escapeHtml,
  buildEmail,
  KNOWN_FLAGS,
} from '../_reengagement-email-blast.js';

/**
 * Story 9-27 Part A AC#E1 — unit tests for the operator-gated email blast.
 *
 * Tests the pure functions only. The DB-touching `selectCohort` + `main`
 * pipeline is exercised via the operator-driven --dry-run on real data.
 */
describe('_reengagement-email-blast — parseArgs', () => {
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

  it('parses --rate-per-minute integer', () => {
    const args = parseArgs(['--dry-run', '--rate-per-minute', '20']);
    expect(args.ratePerMinute).toBe(20);
  });

  it('defaults --rate-per-minute to 10', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.ratePerMinute).toBe(10);
  });

  it('defaults --max-recipients to 200', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.maxRecipients).toBe(200);
  });

  it('parses --lga value', () => {
    const args = parseArgs(['--dry-run', '--lga', 'abc-lga-id']);
    expect(args.lgaId).toBe('abc-lga-id');
  });

  it('parses --since as Date at UTC midnight', () => {
    const args = parseArgs(['--dry-run', '--since', '2026-05-14']);
    expect(args.since).toBeInstanceOf(Date);
    expect(args.since?.toISOString()).toBe('2026-05-14T00:00:00.000Z');
  });

  it('rejects unknown flags (typo defense — H2 finding)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--confirm-i-am-dry-running-not'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['--rate', '5'])).toThrow(/Unknown flag --rate/);
  });

  it('rejects non-positive --rate-per-minute', () => {
    expect(() => parseArgs(['--dry-run', '--rate-per-minute', '0'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--rate-per-minute', '-1'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--rate-per-minute', 'abc'])).toThrow();
  });

  it('rejects non-positive --max-recipients', () => {
    expect(() => parseArgs(['--dry-run', '--max-recipients', '0'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-recipients', '-50'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-recipients', 'xyz'])).toThrow();
  });

  it('rejects invalid --since', () => {
    expect(() => parseArgs(['--dry-run', '--since', 'not-a-date'])).toThrow();
  });

  it('parses both confirm flags together', () => {
    const args = parseArgs([
      '--confirm-i-am-not-dry-running',
      '--confirm-resend-pro-active',
      '--rate-per-minute',
      '15',
    ]);
    expect(args.confirmLive).toBe(true);
    expect(args.confirmResendPro).toBe(true);
    expect(args.ratePerMinute).toBe(15);
    expect(args.dryRun).toBe(false);
  });
});

describe('_reengagement-email-blast — maskEmail', () => {
  it('masks longer local part', () => {
    expect(maskEmail('alice@example.com')).toBe('alic*@example.com');
  });

  it('keeps short local parts unmasked (<= 4 chars)', () => {
    expect(maskEmail('ab@example.com')).toBe('ab@example.com');
    expect(maskEmail('abcd@example.com')).toBe('abcd@example.com');
  });

  it('handles malformed email (no @)', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('handles empty string', () => {
    expect(maskEmail('')).toBe('***');
  });
});

describe('_reengagement-email-blast — firstNameFrom', () => {
  it('extracts first token from multi-word name', () => {
    expect(firstNameFrom('Alice Bob Carol')).toBe('Alice');
  });

  it('handles single-token name', () => {
    expect(firstNameFrom('Alice')).toBe('Alice');
  });

  it('returns "there" on empty / whitespace / undefined', () => {
    expect(firstNameFrom('')).toBe('there');
    expect(firstNameFrom('   ')).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
  });

  it('trims surrounding whitespace before splitting', () => {
    expect(firstNameFrom('  Alice  ')).toBe('Alice');
  });
});

describe('_reengagement-email-blast — escapeHtml', () => {
  it('escapes brackets, ampersands, quotes', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe(
      '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;',
    );
  });

  it('passes plain text untouched', () => {
    expect(escapeHtml('Alice Bob')).toBe('Alice Bob');
  });

  it('preserves whitespace', () => {
    expect(escapeHtml('hello  world')).toBe('hello  world');
  });
});

describe('_reengagement-email-blast — buildEmail (two-template branching by current_step)', () => {
  const URL = 'https://oyoskills.com/auth/magic?token=abc&purpose=wizard_resume';

  // Story 9-30 follow-up: two-template branching. Step >= 4 ("high-progress")
  // gets the "90% done" copy; Step <= 3 ("low-progress") gets the softer
  // "your profile is saved" copy. Threshold is HIGH_PROGRESS_STEP_THRESHOLD = 4.

  it('uses 90%-done subject for high-progress steps (4-5)', () => {
    expect(buildEmail('Alice', URL, 4).subject).toBe('Alice, 90% done. 2 min to complete');
    expect(buildEmail('Alice', URL, 5).subject).toBe('Alice, 90% done. 2 min to complete');
  });

  it('uses saved-profile subject for low-progress steps (1-3)', () => {
    expect(buildEmail('Alice', URL, 1).subject).toBe('Alice, your Oyo Skills profile is saved');
    expect(buildEmail('Alice', URL, 2).subject).toBe('Alice, your Oyo Skills profile is saved');
    expect(buildEmail('Alice', URL, 3).subject).toBe('Alice, your Oyo Skills profile is saved');
  });

  it('uses "Finish my registration" CTA for high-progress', () => {
    const e = buildEmail('Alice', URL, 5);
    expect(e.html).toContain('Finish my registration');
    expect(e.html).not.toContain('Continue my registration');
  });

  it('uses "Continue my registration" CTA for low-progress', () => {
    const e = buildEmail('Alice', URL, 2);
    expect(e.html).toContain('Continue my registration');
    expect(e.html).not.toContain('Finish my registration');
  });

  it('high-progress copy claims "90% complete" / "answers are all saved"', () => {
    const e = buildEmail('Alice', URL, 4);
    expect(e.text).toContain('90% complete');
    expect(e.text).toContain('answers are all saved');
    expect(e.html).toContain('90% complete');
  });

  it('low-progress copy does NOT claim 90% (accuracy gate)', () => {
    const e = buildEmail('Alice', URL, 2);
    const all = `${e.subject} ${e.text} ${e.html}`;
    expect(all).not.toContain('90%');
    expect(all).not.toContain('answers are all saved');
    expect(e.text).toContain('progress so far is saved');
  });

  it('personalizes the first-name in both text and html (both branches)', () => {
    for (const step of [2, 5]) {
      const e = buildEmail('Alice', URL, step);
      expect(e.text).toContain('Hi Alice,');
      expect(e.html).toContain('Hi <strong>Alice</strong>');
    }
  });

  it('html-escapes hostile first-name in both branches (L12 finding)', () => {
    for (const step of [2, 5]) {
      const e = buildEmail('<script>alert(1)</script>', URL, step);
      expect(e.html).not.toContain('<script>alert(1)');
      expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }
  });

  it('embeds the resume URL in both text and html (both branches)', () => {
    for (const step of [2, 5]) {
      const e = buildEmail('Alice', URL, step);
      expect(e.text).toContain(URL);
      expect(e.html).toContain(URL);
    }
  });

  it('contains no apology / admission copy in either branch (audit-safe framing)', () => {
    for (const step of [1, 2, 3, 4, 5]) {
      const e = buildEmail('Alice', URL, step);
      const all = `${e.subject} ${e.text} ${e.html}`.toLowerCase();
      expect(all).not.toContain('sorry');
      expect(all).not.toContain('apolog');
      expect(all).not.toContain('data loss');
      expect(all).not.toContain('inconvenience');
      expect(all).not.toContain('bug');
      expect(all).not.toContain('issue');
    }
  });

  it('threshold boundary: step=3 is low-progress, step=4 is high-progress', () => {
    expect(buildEmail('Alice', URL, 3).subject).toContain('profile is saved');
    expect(buildEmail('Alice', URL, 4).subject).toContain('90% done');
  });
});

describe('_reengagement-email-blast — KNOWN_FLAGS', () => {
  it('contains every documented flag', () => {
    const expected = [
      'dry-run',
      'confirm-i-am-not-dry-running',
      'confirm-resend-pro-active',
      'rate-per-minute',
      'since',
      'lga',
      'max-recipients',
      'help',
    ];
    for (const flag of expected) {
      expect(KNOWN_FLAGS.has(flag)).toBe(true);
    }
  });

  it('has exactly 8 known flags (catches drift in future PRs)', () => {
    expect(KNOWN_FLAGS.size).toBe(8);
  });
});
