import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  maskEmail,
  firstNameFrom,
  escapeHtml,
  buildEmail,
  KNOWN_FLAGS,
} from '../_cohort-a-supplemental-survey-blast.js';

/**
 * Story 9-28 Path B — unit tests for the Cohort A supplemental-survey blast.
 *
 * Tests pure functions only. The DB-touching `selectCohort` + `main`
 * pipeline is exercised via the operator-driven --dry-run on real data.
 */
describe('_cohort-a-supplemental-survey-blast — parseArgs', () => {
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

  it('defaults --rate-per-minute to 10', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.ratePerMinute).toBe(10);
  });

  it('defaults --max-recipients to 100 (Cohort A is ~63)', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.maxRecipients).toBe(100);
  });

  it('parses --rate-per-minute integer', () => {
    const args = parseArgs(['--dry-run', '--rate-per-minute', '20']);
    expect(args.ratePerMinute).toBe(20);
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

  it('rejects unknown flags (typo defense)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--confirm-im-not-dry-runng'])).toThrow(/Unknown flag/);
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

  it('parses confirm flags together', () => {
    const args = parseArgs([
      '--confirm-i-am-not-dry-running',
      '--confirm-resend-pro-active',
    ]);
    expect(args.confirmLive).toBe(true);
    expect(args.confirmResendPro).toBe(true);
  });
});

describe('_cohort-a-supplemental-survey-blast — maskEmail', () => {
  it('masks longer local part', () => {
    expect(maskEmail('alice@example.com')).toBe('alic*@example.com');
  });

  it('keeps short local parts unmasked (<= 4 chars)', () => {
    expect(maskEmail('ab@example.com')).toBe('ab@example.com');
  });

  it('handles malformed email (no @)', () => {
    expect(maskEmail('no-at-sign')).toBe('***');
  });

  it('handles empty', () => {
    expect(maskEmail('')).toBe('***');
  });
});

describe('_cohort-a-supplemental-survey-blast — firstNameFrom', () => {
  it('returns the first token from a single-word first_name', () => {
    expect(firstNameFrom('Alice')).toBe('Alice');
  });

  it('handles compound first_name defensively (splits on whitespace)', () => {
    expect(firstNameFrom('Alice Marie')).toBe('Alice');
  });

  it('returns "there" on empty / whitespace / undefined / null', () => {
    expect(firstNameFrom('')).toBe('there');
    expect(firstNameFrom('   ')).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
  });

  it('trims surrounding whitespace', () => {
    expect(firstNameFrom('  Alice  ')).toBe('Alice');
  });
});

describe('_cohort-a-supplemental-survey-blast — escapeHtml', () => {
  it('escapes brackets, ampersands, quotes', () => {
    expect(escapeHtml('<script>"&\'</script>')).toBe(
      '&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;',
    );
  });

  it('passes plain text untouched', () => {
    expect(escapeHtml('Alice Bob')).toBe('Alice Bob');
  });
});

describe('_cohort-a-supplemental-survey-blast — buildEmail', () => {
  const URL = 'https://oyoskills.com/auth/magic?token=abc&purpose=supplemental_survey';

  it('uses the Option 2 subject (Story 9-28 AC#B3)', () => {
    const e = buildEmail('Alice', URL);
    expect(e.subject).toBe(
      'One more step for your Oyo State Skills Registry profile (3 minutes)',
    );
  });

  it('personalizes the first-name in both text and html', () => {
    const e = buildEmail('Alice', URL);
    expect(e.text).toContain('Hi Alice,');
    expect(e.html).toContain('Hi <strong>Alice</strong>');
  });

  it('html-escapes hostile first-name', () => {
    const e = buildEmail('<script>alert(1)</script>', URL);
    expect(e.html).not.toContain('<script>alert(1)');
    expect(e.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('embeds the survey URL in both text and html', () => {
    const e = buildEmail('Alice', URL);
    expect(e.text).toContain(URL);
    expect(e.html).toContain(URL);
  });

  it('contains no apology / admission copy (Option 2 framing)', () => {
    const e = buildEmail('Alice', URL);
    const all = `${e.subject} ${e.text} ${e.html}`.toLowerCase();
    expect(all).not.toContain('sorry');
    expect(all).not.toContain('apolog');
    expect(all).not.toContain('data loss');
    expect(all).not.toContain('inconvenience');
    expect(all).not.toContain('bug');
    expect(all).not.toContain('issue');
    expect(all).not.toContain('lost');
  });

  it('mentions value-prop (sector / skill / training / matching)', () => {
    const e = buildEmail('Alice', URL);
    const all = `${e.subject} ${e.text} ${e.html}`.toLowerCase();
    expect(all).toMatch(/training|opportunit|sector|skill/);
  });
});

describe('_cohort-a-supplemental-survey-blast — KNOWN_FLAGS', () => {
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

  it('has exactly 8 known flags (drift detector)', () => {
    expect(KNOWN_FLAGS.size).toBe(8);
  });
});
