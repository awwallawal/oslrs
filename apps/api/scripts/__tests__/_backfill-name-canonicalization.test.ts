import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  computeCanonical,
  dbMatchesSnapshot,
  rowStatus,
  buildWorkbook,
  parseReviewedRows,
  KNOWN_FLAGS,
  type ProposedRow,
} from '../_backfill-name-canonicalization.js';

/**
 * Story 9-18 Part F (AC#F5/F6) — unit tests for the surname-designation
 * name-canonicalization backfill. Pure functions only; the DB-touching
 * preview/apply is exercised by the operator-driven --apply.
 */

describe('_backfill-name-canonicalization — parseArgs', () => {
  it('accepts --dry-run alone', () => {
    const a = parseArgs(['--dry-run']);
    expect(a.dryRun).toBe(true);
    expect(a.apply).toBe(false);
  });

  it('accepts --apply --file (preview)', () => {
    const a = parseArgs(['--apply', '--file', '/tmp/r.xlsx']);
    expect(a.apply).toBe(true);
    expect(a.confirmLive).toBe(false);
    expect(a.file).toBe('/tmp/r.xlsx');
  });

  it('accepts --apply --confirm --file (live)', () => {
    const a = parseArgs(['--apply', '--confirm-i-am-not-dry-running', '--file', '/tmp/r.xlsx']);
    expect(a.confirmLive).toBe(true);
  });

  it('rejects an unknown flag (typo defence)', () => {
    expect(() => parseArgs(['--dry-rn'])).toThrow(/Unknown flag/);
  });

  it('rejects a non-positive --max-rows', () => {
    expect(() => parseArgs(['--dry-run', '--max-rows', '0'])).toThrow(/max-rows/);
  });

  it('KNOWN_FLAGS no longer references a decision concept', () => {
    expect(KNOWN_FLAGS.has('apply')).toBe(true);
    expect(KNOWN_FLAGS.has('file')).toBe(true);
  });
});

describe('computeCanonical (surname-designation)', () => {
  it('surname-first 2-token → given is the other name', () => {
    expect(computeCanonical('OLOWU', 'Kayode', 'OLOWU')).toEqual({
      given: 'Kayode',
      family: 'OLOWU',
      matched: true,
      changed: true,
    });
  });

  it('surname-first 3-token (surname in first slot, given spans last)', () => {
    expect(computeCanonical('OLOWU', 'KAYODE FEMI', 'OLOWU')).toEqual({
      given: 'KAYODE FEMI',
      family: 'OLOWU',
      matched: true,
      changed: true,
    });
  });

  it('surname is the LAST token of a multi-token last_name (swap could not do this)', () => {
    expect(computeCanonical('Adaora', 'Winnie Adelakun', 'Adelakun')).toEqual({
      given: 'Adaora Winnie',
      family: 'Adelakun',
      matched: true,
      changed: true,
    });
  });

  it('already-correct order → matched but not changed (auto no-op)', () => {
    expect(computeCanonical('Funke', 'Akindele', 'Akindele')).toEqual({
      given: 'Funke',
      family: 'Akindele',
      matched: true,
      changed: false,
    });
  });

  it('matches case-insensitively while preserving the operator surname casing', () => {
    const c = computeCanonical('olowu', 'Kayode', 'OLOWU');
    expect(c.matched).toBe(true);
    expect(c.family).toBe('OLOWU');
    expect(c.given).toBe('Kayode');
  });

  it('flags (matched=false) when the surname is not found in the name', () => {
    expect(computeCanonical('Funke', 'Akindele', 'Balogun').matched).toBe(false);
  });

  it('flags (matched=false) when there is no surname', () => {
    expect(computeCanonical('Funke', 'Akindele', '').matched).toBe(false);
  });

  it('flags when removing the surname would leave no given name', () => {
    expect(computeCanonical('Solo', 'Solo', 'Solo Solo').matched).toBe(false);
  });
});

describe('rowStatus', () => {
  it('classifies the four states', () => {
    expect(rowStatus(computeCanonical('OLOWU', 'Kayode', 'OLOWU'), 'OLOWU')).toBe('change');
    expect(rowStatus(computeCanonical('Funke', 'Akindele', 'Akindele'), 'Akindele')).toBe('no change');
    expect(rowStatus(computeCanonical('Funke', 'Akindele', 'Balogun'), 'Balogun')).toBe('UNMATCHED');
    expect(rowStatus(computeCanonical('Funke', 'Akindele', ''), '')).toBe('no surname');
  });
});

describe('dbMatchesSnapshot (apply-path guard — AI-Review H1/H2)', () => {
  it('matches the reviewed snapshot (trim-tolerant)', () => {
    expect(dbMatchesSnapshot('OLOWU', 'Kayode', 'OLOWU', 'Kayode')).toBe(true);
    expect(dbMatchesSnapshot('  OLOWU ', 'Kayode ', 'OLOWU', 'Kayode')).toBe(true);
  });

  it('does NOT match a drifted row', () => {
    expect(dbMatchesSnapshot('OLOWU', 'Babatunde', 'OLOWU', 'Kayode')).toBe(false);
  });

  it('does NOT match an already-canonicalised row (re-run idempotency)', () => {
    expect(dbMatchesSnapshot('Kayode', 'OLOWU', 'OLOWU', 'Kayode')).toBe(false);
  });
});

describe('buildWorkbook', () => {
  const rows: ProposedRow[] = [
    { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'KAYODE FEMI', surname: 'OLOWU' }, // change
    { respondentId: 'r2', currentFirst: 'Funke', currentLast: 'Akindele', surname: '' }, // no surname
    { respondentId: 'r3', currentFirst: 'Funke', currentLast: 'Akindele', surname: 'Balogun' }, // unmatched
  ];

  it('writes the surname-centric header (no decision column)', () => {
    const ws = buildWorkbook(rows).worksheets[0];
    expect(ws.getRow(1).getCell(1).value).toBe('respondent_id');
    expect(ws.getRow(1).getCell(4).value).toBe('surname');
    expect(ws.getRow(1).getCell(5).value).toBe('proposed_given');
    expect(ws.getRow(1).getCell(7).value).toBe('status');
  });

  it('computes proposed given/family + status from the surname', () => {
    const ws = buildWorkbook(rows).worksheets[0];
    expect(ws.getRow(2).getCell(5).value).toBe('KAYODE FEMI'); // proposed_given
    expect(ws.getRow(2).getCell(6).value).toBe('OLOWU'); // proposed_family
    expect(ws.getRow(2).getCell(7).value).toBe('change');
  });

  it('amber-flags no-surname + unmatched rows (need a second look)', () => {
    const ws = buildWorkbook(rows).worksheets[0];
    expect(ws.getRow(2).getCell(4).fill).toBeUndefined(); // r1 resolved → no flag
    expect(ws.getRow(3).getCell(4).fill).toBeDefined(); // r2 no surname → amber
    expect(ws.getRow(4).getCell(4).fill).toBeDefined(); // r3 unmatched → amber
    expect(ws.getRow(3).getCell(7).value).toBe('no surname');
    expect(ws.getRow(4).getCell(7).value).toBe('UNMATCHED');
  });
});

describe('parseReviewedRows', () => {
  it('round-trips the operator surname column', () => {
    const wb = buildWorkbook([
      { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'Kayode', surname: 'OLOWU' },
    ]);
    expect(parseReviewedRows(wb)).toEqual([
      { respondentId: 'r1', currentFirst: 'OLOWU', currentLast: 'Kayode', surname: 'OLOWU' },
    ]);
  });

  it('throws when the surname column is missing', () => {
    const wb = buildWorkbook([{ respondentId: 'r1', currentFirst: 'A', currentLast: 'B', surname: 'B' }]);
    wb.worksheets[0].getRow(1).getCell(4).value = 'note'; // rename surname header
    expect(() => parseReviewedRows(wb)).toThrow(/missing column: surname/);
  });

  it('skips blank trailing rows', () => {
    const wb = buildWorkbook([{ respondentId: 'r1', currentFirst: 'A', currentLast: 'B', surname: 'B' }]);
    wb.worksheets[0].addRow({});
    expect(parseReviewedRows(wb)).toHaveLength(1);
  });
});
