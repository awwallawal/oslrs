import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  maskId,
  KNOWN_FLAGS,
  buildCohortQuery,
} from '../_backfill-wizard-questionnaire-loss.js';

/**
 * Story 9-26 Part B — unit tests for the operator-gated data-loss marker
 * backfill. Tests the pure functions only; the DB-touching selectCohort + main
 * pipeline is exercised via the operator-driven --dry-run on real prod data.
 */
describe('_backfill-wizard-questionnaire-loss — parseArgs', () => {
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

  it('defaults --since to 2026-05-14 (UTC midnight)', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.since.toISOString()).toBe('2026-05-14T00:00:00.000Z');
  });

  it('defaults --until to 2026-05-20 (Part A deploy cutover, UTC midnight)', () => {
    const args = parseArgs(['--dry-run']);
    expect(args.until.toISOString()).toBe('2026-05-20T00:00:00.000Z');
  });

  it('parses --since / --until overrides', () => {
    const args = parseArgs(['--dry-run', '--since', '2026-05-15', '--until', '2026-05-18']);
    expect(args.since.toISOString()).toBe('2026-05-15T00:00:00.000Z');
    expect(args.until.toISOString()).toBe('2026-05-18T00:00:00.000Z');
  });

  it('defaults --max-rows to 200', () => {
    expect(parseArgs(['--dry-run']).maxRows).toBe(200);
  });

  it('parses --max-rows integer', () => {
    expect(parseArgs(['--dry-run', '--max-rows', '50']).maxRows).toBe(50);
  });

  it('rejects unknown flags (typo defense)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag --dry-rn/);
    expect(() => parseArgs(['--confirm', 'x'])).toThrow(/Unknown flag --confirm/);
  });

  it('rejects invalid --since / --until dates', () => {
    expect(() => parseArgs(['--dry-run', '--since', 'not-a-date'])).toThrow(/--since must be a valid date/);
    expect(() => parseArgs(['--dry-run', '--until', 'nope'])).toThrow(/--until must be a valid date/);
  });

  it('rejects non-positive --max-rows', () => {
    expect(() => parseArgs(['--dry-run', '--max-rows', '0'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-rows', '-5'])).toThrow();
    expect(() => parseArgs(['--dry-run', '--max-rows', 'abc'])).toThrow();
  });
});

describe('_backfill-wizard-questionnaire-loss — KNOWN_FLAGS', () => {
  it('contains exactly the documented flags', () => {
    expect([...KNOWN_FLAGS].sort()).toEqual(
      ['confirm-i-am-not-dry-running', 'dry-run', 'help', 'max-rows', 'since', 'until'].sort(),
    );
  });
});

describe('_backfill-wizard-questionnaire-loss — maskId', () => {
  it('truncates long ids to 8 chars + ellipsis', () => {
    expect(maskId('019e24ef-9629-77ef-8a3e-12517d34bbff')).toBe('019e24ef…');
  });

  it('returns short ids unchanged', () => {
    expect(maskId('abc')).toBe('abc');
  });
});

describe('_backfill-wizard-questionnaire-loss — buildCohortQuery (cohort SQL lock)', () => {
  // Story 9-26 Part H / M2 — the cohort SQL decides which rows get the
  // irreversible questionnaire_data_lost stamp. Lock the source filter, window
  // bounds, and idempotency guard so a future edit can't silently broaden the
  // marked set (e.g. dropping the IS DISTINCT FROM guard → re-stamping rows, or
  // dropping the --until bound → marking post-fix respondents that DIDN'T lose data).
  it('locks the source filter + idempotency guard', () => {
    const { sql } = buildCohortQuery(parseArgs(['--dry-run'])).toSQL();
    expect(sql).toContain(`= 'public'`);
    expect(sql).toContain('questionnaire_data_lost');
    expect(sql).toContain(`IS DISTINCT FROM 'true'`);
  });

  it('binds both created_at window bounds (gte since + lt until)', () => {
    const { sql, params } = buildCohortQuery(parseArgs(['--dry-run'])).toSQL();
    // Lower bound (gte) and upper bound (lt) must BOTH be present — dropping the
    // --until bound would mark post-fix respondents that never lost data.
    expect(sql).toMatch(/created_at"?\s*>=/);
    expect(sql).toMatch(/created_at"?\s*</);
    // The two window values are bound as parameters (since + until).
    expect(params.length).toBeGreaterThanOrEqual(2);
  });
});
