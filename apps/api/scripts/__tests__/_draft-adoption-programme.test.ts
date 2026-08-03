import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  isLiveRun,
  maskEmail,
  maskNin,
  maskPhone,
  KNOWN_FLAGS,
} from '../_draft-adoption-programme.js';

/**
 * Story 13-49 Task 8 — the CLI gate (AC10).
 *
 * Pure functions only; the DB-touching `main` is exercised by the operator-driven --dry-run
 * and then by the single-record live apply that residual R1 holds open.
 *
 * The property under test is one-directional: it must be IMPOSSIBLE to write by forgetting
 * something. Every path that is not explicitly "yes, live, I mean it" resolves to a preview.
 */

describe('13-49 CLI — parseArgs', () => {
  it('defaults to a preview with no flags at all', () => {
    const a = parseArgs([]);
    expect(isLiveRun(a)).toBe(false);
  });

  it('accepts --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
    expect(isLiveRun(parseArgs(['--dry-run']))).toBe(false);
  });

  it('rejects unknown flags — a typo must never become a live run', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--confirm'])).toThrow(/Unknown flag --confirm/);
  });

  /**
   * Regression: found by RUNNING the script, not by a unit test. pnpm forwards the standard
   * `--` separator verbatim, so `pnpm draft:adopt -- --dry-run` arrived as ['--', '--dry-run']
   * and died on "Unknown flag --" before doing anything.
   */
  it('tolerates the bare -- separator that pnpm forwards', () => {
    const a = parseArgs(['--', '--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(isLiveRun(a)).toBe(false);
  });

  it('still parses values correctly after a -- separator', () => {
    expect(parseArgs(['--', '--max', '1']).max).toBe(1);
  });

  it('parses --max as a positive integer and rejects everything else', () => {
    expect(parseArgs(['--max', '1']).max).toBe(1);
    expect(parseArgs([]).max).toBeNull();
    expect(() => parseArgs(['--max', '0'])).toThrow(/--max/);
    expect(() => parseArgs(['--max', '-3'])).toThrow(/--max/);
    expect(() => parseArgs(['--max', '1.5'])).toThrow(/--max/);
    expect(() => parseArgs(['--max', 'all'])).toThrow(/--max/);
  });

  it('defaults --rate-per-minute to 10 and rejects non-positive values', () => {
    expect(parseArgs([]).ratePerMinute).toBe(10);
    expect(parseArgs(['--rate-per-minute', '4']).ratePerMinute).toBe(4);
    expect(() => parseArgs(['--rate-per-minute', '0'])).toThrow();
    expect(() => parseArgs(['--rate-per-minute', 'fast'])).toThrow();
  });

  it('takes --sheet and --explain as values, not booleans', () => {
    const a = parseArgs(['--sheet', 'C:/tmp/x.xlsx', '--explain', 'draft-7']);
    expect(a.sheetPath).toBe('C:/tmp/x.xlsx');
    expect(a.explainDraftId).toBe('draft-7');
  });

  it('defaults the sheet to the triage workbook and --explain to nothing', () => {
    const a = parseArgs([]);
    expect(a.sheetPath).toMatch(/draft-triage-2026-08-01\.xlsx$/);
    expect(a.explainDraftId).toBeNull();
  });

  it('exposes its own flag vocabulary for the help text to stay honest', () => {
    expect(KNOWN_FLAGS.has('confirm-i-am-not-dry-running')).toBe(true);
    expect(KNOWN_FLAGS.has('apply')).toBe(true);
  });
});

describe('13-49 CLI — isLiveRun (the AC10 gate)', () => {
  it('requires BOTH --apply and the confirm flag', () => {
    expect(isLiveRun(parseArgs(['--apply', '--confirm-i-am-not-dry-running']))).toBe(true);
  });

  /**
   * `--apply` alone is the flag someone reaches for while exploring. On a write path against
   * citizen records, exploring must not write.
   */
  it('treats --apply ALONE as a preview', () => {
    expect(isLiveRun(parseArgs(['--apply']))).toBe(false);
  });

  it('treats the confirm flag alone as a preview', () => {
    expect(isLiveRun(parseArgs(['--confirm-i-am-not-dry-running']))).toBe(false);
  });

  /**
   * ⚠️ REWRITTEN BY CODE REVIEW 2026-08-02, and the original is the more useful artefact.
   *
   * It read `parseArgs(['--dry-run','--apply'])` → `isLiveRun` false, and passed — but it
   * passed for the WRONG REASON: it omitted `--confirm-i-am-not-dry-running`, so the assertion
   * held on the confirm flag being absent and never touched `--dry-run` at all. Meanwhile
   * `args.dryRun` had no consumer anywhere in the script, so the full triple
   * `--dry-run --apply --confirm-i-am-not-dry-running` WROTE AND SENT.
   *
   * A test that asserts a safe outcome without exercising the mechanism that is supposed to
   * make it safe is worse than no test: it reports coverage over a hole.
   */
  it('REFUSES contradictory --dry-run + --apply outright, confirm flag or not', () => {
    expect(() => parseArgs(['--dry-run', '--apply'])).toThrow(/contradictory/i);
    expect(() =>
      parseArgs(['--dry-run', '--apply', '--confirm-i-am-not-dry-running']),
    ).toThrow(/contradictory/i);
  });

  it('--dry-run can never be live, even if the other flags say so', () => {
    // Belt and braces: parseArgs rejects the combination, and isLiveRun would refuse it anyway.
    expect(
      isLiveRun({
        dryRun: true,
        apply: true,
        confirmLive: true,
        max: null,
        ratePerMinute: 10,
        sheetPath: 'x.xlsx',
        explainDraftId: null,
        promoteNins: false,
        help: false,
      }),
    ).toBe(false);
  });

  it('parses the AC14 promotion mode', () => {
    expect(parseArgs(['--promote-nins']).promoteNins).toBe(true);
    expect(parseArgs(['--dry-run']).promoteNins).toBe(false);
  });

  it('the AC10 single-record gate parses as live and capped at one', () => {
    const a = parseArgs(['--apply', '--confirm-i-am-not-dry-running', '--max', '1']);
    expect(isLiveRun(a)).toBe(true);
    expect(a.max).toBe(1);
  });
});

describe('13-49 CLI — maskEmail', () => {
  it('masks the local part while keeping the row identifiable in a log', () => {
    expect(maskEmail('adebayo@example.com')).toBe('adeb***@example.com');
    expect(maskEmail('ab@example.com')).toBe('ab@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });
});

/**
 * ⚠️ ADDED BY CODE REVIEW 2026-08-02. `maskEmail` existed and was used, and then `printExplain`
 * printed the same person's NIN and phone in the clear two lines below it. Masking one
 * identifier while publishing two others is not a privacy control, it is a habit.
 */
describe('13-49 CLI — maskNin / maskPhone', () => {
  it('leaves enough NIN to recognise the row, never enough to re-key it', () => {
    expect(maskNin('27287257118')).toBe('********118');
    expect(maskNin('')).toBe('(none)');
  });

  it('masks a phone down to its last four', () => {
    expect(maskPhone('+2348012345678')).toBe('**********5678');
    expect(maskPhone('')).toBe('(none)');
  });
});
