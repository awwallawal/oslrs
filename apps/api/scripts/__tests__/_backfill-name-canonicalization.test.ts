import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  suggestDecision,
  computeProposed,
  dbMatchesSnapshot,
  buildWorkbook,
  parseReviewedRows,
  DECISIONS,
  KNOWN_FLAGS,
  type ProposedRow,
} from '../_backfill-name-canonicalization.js';

/**
 * Story 9-18 Part F (AC#F5/F6) — unit tests for the name-canonicalization
 * backfill. Pure functions only; the DB-touching apply/dry-run is exercised via
 * the operator-driven --dry-run + --apply on real data.
 */

describe('_backfill-name-canonicalization — parseArgs', () => {
  it('accepts --dry-run alone', () => {
    const a = parseArgs(['--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(a.apply).toBe(false);
  });

  it('accepts --apply with --confirm + --file', () => {
    const a = parseArgs(['--apply', '--confirm-i-am-not-dry-running', '--file', '/tmp/r.xlsx']);
    expect(a.apply).toBe(true);
    expect(a.confirmLive).toBe(true);
    expect(a.file).toBe('/tmp/r.xlsx');
  });

  it('rejects an unknown flag (typo defence)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag/);
  });

  it('rejects a non-positive --max-rows', () => {
    expect(() => parseArgs(['--dry-run', '--max-rows', '0'])).toThrow(/max-rows/);
  });

  it('KNOWN_FLAGS includes the apply + file flags', () => {
    expect(KNOWN_FLAGS.has('apply')).toBe(true);
    expect(KNOWN_FLAGS.has('file')).toBe(true);
  });
});

describe('suggestDecision (advisory surname heuristic)', () => {
  it('suggests swap when the stored first name is a known surname', () => {
    expect(suggestDecision('OLOWU', 'Kayode')).toBe('swap');
  });

  it('keeps a normal given-first order', () => {
    expect(suggestDecision('Ada', 'Okafor')).toBe('keep');
  });

  it('keeps when a name is missing (nothing to swap)', () => {
    expect(suggestDecision('Adebayo', '')).toBe('keep');
    expect(suggestDecision(null, 'Olowu')).toBe('keep');
  });

  it('keeps the ambiguous both-look-like-surnames case (safe default)', () => {
    expect(suggestDecision('OLOWU', 'BALOGUN')).toBe('keep');
  });
});

describe('computeProposed', () => {
  it('swaps first/last on decision=swap', () => {
    expect(computeProposed('OLOWU', 'Kayode', 'swap')).toEqual({ given: 'Kayode', family: 'OLOWU' });
  });

  it('preserves order on keep/skip', () => {
    expect(computeProposed('Ada', 'Okafor', 'keep')).toEqual({ given: 'Ada', family: 'Okafor' });
    expect(computeProposed('Ada', 'Okafor', 'skip')).toEqual({ given: 'Ada', family: 'Okafor' });
  });
});

describe('dbMatchesSnapshot (apply-path guard — AI-Review H1/H2)', () => {
  it('matches when the live DB equals the reviewed snapshot (trim-tolerant)', () => {
    expect(dbMatchesSnapshot('OLOWU', 'Kayode', 'OLOWU', 'Kayode')).toBe(true);
    expect(dbMatchesSnapshot('  OLOWU ', 'Kayode ', 'OLOWU', 'Kayode')).toBe(true);
  });

  it('does NOT match when the row drifted since dry-run', () => {
    expect(dbMatchesSnapshot('OLOWU', 'Babatunde', 'OLOWU', 'Kayode')).toBe(false);
  });

  it('does NOT match an already-swapped row (re-run idempotency)', () => {
    // After a first apply the DB is {Kayode, OLOWU} while the snapshot is the
    // pre-swap {OLOWU, Kayode} → mismatch → re-run skips instead of swapping back.
    expect(dbMatchesSnapshot('Kayode', 'OLOWU', 'OLOWU', 'Kayode')).toBe(false);
  });
});

describe('buildWorkbook', () => {
  const rows: ProposedRow[] = [
    { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'Kayode', suggested: 'swap' },
    { respondentId: 'r2', currentFirst: 'Ada', currentLast: 'Okafor', suggested: 'keep' },
  ];

  it('writes a header row + a data-validation dropdown on the decision column', () => {
    const ws = buildWorkbook(rows).worksheets[0];
    expect(ws.getRow(1).getCell(1).value).toBe('respondent_id');
    expect(ws.getRow(1).getCell(6).value).toBe('decision');
    const dv = ws.getRow(2).getCell(6).dataValidation;
    expect(dv?.type).toBe('list');
    expect(dv?.formulae?.[0]).toContain('swap');
    expect(dv?.formulae?.[0]).toContain('keep');
  });

  it('pre-fills the heuristic suggestion + amber-highlights suggested swaps', () => {
    const ws = buildWorkbook(rows).worksheets[0];
    expect(ws.getRow(2).getCell(6).value).toBe('swap'); // r1 suggested swap
    expect(ws.getRow(3).getCell(6).value).toBe('keep'); // r2 suggested keep
    expect(ws.getRow(2).getCell(6).fill).toBeDefined(); // amber on the swap row
    expect(ws.getRow(3).getCell(6).fill).toBeUndefined(); // no fill on keep
  });
});

describe('parseReviewedRows', () => {
  it('round-trips the operator decisions', () => {
    const wb = buildWorkbook([
      { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'Kayode', suggested: 'swap' },
    ]);
    expect(parseReviewedRows(wb)).toEqual([
      { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'Kayode', decision: 'swap' },
    ]);
  });

  it('throws on an invalid decision value', () => {
    const wb = buildWorkbook([
      { respondentId: 'r1', currentFirst: 'A', currentLast: 'B', suggested: 'keep' },
    ]);
    wb.worksheets[0].getRow(2).getCell(6).value = 'bogus';
    expect(() => parseReviewedRows(wb)).toThrow(/invalid decision/i);
  });

  it('skips blank trailing rows', () => {
    const wb = buildWorkbook([
      { respondentId: 'r1', currentFirst: 'A', currentLast: 'B', suggested: 'keep' },
    ]);
    wb.worksheets[0].addRow({}); // empty trailing row
    expect(parseReviewedRows(wb)).toHaveLength(1);
  });

  it('exposes exactly the three canonical decisions', () => {
    expect([...DECISIONS]).toEqual(['swap', 'keep', 'skip']);
  });
});
