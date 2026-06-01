import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  maskEmail,
  firstNameFrom,
  escapeHtml,
  buildEmail,
  KNOWN_FLAGS,
  buildCohortQuery,
} from '../_recover-abandoned-wizard-drafts.js';

/**
 * Story 9-26 Part J — unit tests for the operator-gated recovery email script.
 * Tests the pure functions only; the DB-touching selectCohort + main pipeline
 * is exercised via the operator-driven --dry-run on real prod data.
 */
describe('_recover-abandoned-wizard-drafts — parseArgs', () => {
  it('accepts --dry-run alone', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.dryRun).toBe(true);
    expect(args.confirmLive).toBe(false);
  });

  it('accepts --confirm-i-am-not-dry-running alone', () => {
    const args = parseArgs(['--confirm-i-am-not-dry-running']);
    expect(args.confirmLive).toBe(true);
  });

  it('defaults --rate-per-minute to 10 and --max-recipients to 200', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.ratePerMinute).toBe(10);
    expect(args.maxRecipients).toBe(200);
  });

  it('parses --rate-per-minute + --confirm-resend-pro-active', () => {
    const args = parseArgs(['--confirm-i-am-not-dry-running', '--confirm-resend-pro-active', '--rate-per-minute', '15']);
    expect(args.ratePerMinute).toBe(15);
    expect(args.confirmResendPro).toBe(true);
  });

  it('parses --since as Date at UTC midnight', () => {
    const args = parseArgs(['--dry-run', '--since', '2026-05-14']);
    expect(args.since?.toISOString()).toBe('2026-05-14T00:00:00.000Z');
  });

  it('rejects unknown flags (typo defense)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--rate', '5'])).toThrow(/Unknown flag --rate/);
  });

  it('rejects non-positive --rate-per-minute / --max-recipients', () => {
    expect(() => parseArgs(['--dry-run', '--rate-per-minute', '0'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-recipients', '-1'])).toThrow();
  });

  it('rejects invalid --since', () => {
    expect(() => parseArgs(['--dry-run', '--since', 'bad'])).toThrow(/--since must be a valid date/);
  });
});

describe('_recover-abandoned-wizard-drafts — KNOWN_FLAGS', () => {
  it('contains exactly the documented flags', () => {
    expect([...KNOWN_FLAGS].sort()).toEqual(
      [
        'confirm-i-am-not-dry-running',
        'confirm-resend-pro-active',
        'dry-run',
        'help',
        'max-recipients',
        'rate-per-minute',
        'since',
      ].sort(),
    );
  });
});

describe('_recover-abandoned-wizard-drafts — pure helpers', () => {
  it('maskEmail keeps domain + first chars', () => {
    expect(maskEmail('awwal@example.com')).toBe('awwa*@example.com');
    expect(maskEmail('ab@x.com')).toBe('ab@x.com');
    expect(maskEmail('notanemail')).toBe('***');
  });

  it('firstNameFrom extracts first token, falls back to "there"', () => {
    expect(firstNameFrom('Awwal Lawal')).toBe('Awwal');
    expect(firstNameFrom('   ')).toBe('there');
    expect(firstNameFrom(undefined)).toBe('there');
  });

  it('escapeHtml neutralises markup', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });
});

describe('_recover-abandoned-wizard-drafts — buildEmail', () => {
  it('uses the Part-J subject and embeds the resume URL + escaped name', () => {
    const { subject, text, html } = buildEmail('Tolu <x>', 'https://oyoskills.com/resume?t=abc');
    expect(subject).toBe('Complete your Oyo Skills Registry registration');
    expect(text).toContain('https://oyoskills.com/resume?t=abc');
    expect(html).toContain('https://oyoskills.com/resume?t=abc');
    // Name is HTML-escaped in the html body.
    expect(html).toContain('Tolu &lt;x&gt;');
    expect(html).not.toContain('Tolu <x>');
  });

  // Story 9-26 Part H / L3 — wizard_resume tokens have a 72h TTL
  // (magic-link.service.ts:28). The copy MUST state 72 hours; a regression back
  // to the original "7 days" wording (pre-pass F2) would send recipients to
  // dead links on days 3–7. Lock the correct lifetime in both bodies.
  it('states the correct 72-hour link lifetime in both text and html', () => {
    const { text, html } = buildEmail('Ada', 'https://oyoskills.com/resume?t=xyz');
    expect(text).toContain('72 hours');
    expect(html).toContain('72 hours');
    expect(text).not.toContain('7 days');
    expect(html).not.toContain('7 days');
  });
});

describe('_recover-abandoned-wizard-drafts — buildCohortQuery (cohort SQL lock)', () => {
  // Story 9-26 Part H / M2 — selectCohort is the highest-risk logic (it decides
  // who gets emailed). Lock the distinguishing predicates so a future edit that
  // broadens or breaks the narrow Part-J cohort fails loudly in CI rather than
  // only being caught by an operator eyeballing a dry-run.
  it('locks the narrow Part-J predicates: non-empty answers + still-resumable', () => {
    const { sql } = buildCohortQuery(parseArgs(['--dry-run'])).toSQL();
    // Must require the questionnaireResponses key AND that it is non-empty.
    expect(sql).toContain(`? 'questionnaireResponses'`);
    expect(sql).toContain(`<> '{}'::jsonb`);
    // Still-resumable: expiry strictly in the future.
    expect(sql).toContain('expires_at');
    expect(sql).toContain('NOW()');
    // The redundant JSON email guard was removed (email column is NOT NULL UNIQUE).
    expect(sql).not.toContain(`->>'email'`);
  });

  it('adds a created_at lower bound only when --since is passed', () => {
    const without = buildCohortQuery(parseArgs(['--dry-run'])).toSQL().sql;
    expect(without).not.toMatch(/created_at"?\s*>=/);
    const withSince = buildCohortQuery(parseArgs(['--dry-run', '--since', '2026-05-14'])).toSQL().sql;
    expect(withSince).toMatch(/created_at"?\s*>=/);
  });
});
