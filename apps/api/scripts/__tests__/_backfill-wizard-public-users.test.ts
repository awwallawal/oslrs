/**
 * Story 9-38 (AC#6 / Task 5.2) — unit tests for the wizard public-user backfill
 * argument parsing + the pure candidate-partition + name-derivation helpers.
 * No DB: the script's `main()` is guarded by `!process.env.VITEST`, so importing
 * it here is side-effect-free.
 */
import { describe, it, expect } from 'vitest';
import {
  parseArgs,
  partitionCandidates,
  deriveFullName,
  type CandidateRow,
} from '../_backfill-wizard-public-users.js';

describe('_backfill-wizard-public-users parseArgs', () => {
  it('defaults to a non-applying, non-live run', () => {
    const args = parseArgs([]);
    expect(args).toEqual({ dryRun: false, apply: false, confirmLive: false, maxRows: null });
  });

  it('parses --dry-run', () => {
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });

  it('parses --apply --confirm-i-am-not-dry-running', () => {
    const args = parseArgs(['--apply', '--confirm-i-am-not-dry-running']);
    expect(args.apply).toBe(true);
    expect(args.confirmLive).toBe(true);
  });

  it('parses --max-rows N as a positive integer', () => {
    expect(parseArgs(['--max-rows', '25']).maxRows).toBe(25);
  });

  it('throws on an unknown flag', () => {
    expect(() => parseArgs(['--nope'])).toThrow(/Unknown flag/);
  });
});

describe('_backfill-wizard-public-users partitionCandidates (skip path)', () => {
  const rows: CandidateRow[] = [
    { id: 'a', firstName: 'A', lastName: 'One', email: 'a@example.com' },
    { id: 'b', firstName: 'B', lastName: null, email: null }, // no email → skip
    { id: 'c', firstName: 'C', lastName: 'Three', email: '   ' }, // whitespace-only → skip
    { id: 'd', firstName: 'D', lastName: 'Four', email: 'd@example.com' },
  ];

  it('routes rows with no recoverable email to the unrecoverable (skipped) bucket', () => {
    const { recoverable, unrecoverable } = partitionCandidates(rows);
    expect(recoverable.map((r) => r.id)).toEqual(['a', 'd']);
    expect(unrecoverable.map((r) => r.id)).toEqual(['b', 'c']);
  });

  it('handles an empty candidate list', () => {
    expect(partitionCandidates([])).toEqual({ recoverable: [], unrecoverable: [] });
  });
});

describe('_backfill-wizard-public-users deriveFullName', () => {
  it('joins first + last name', () => {
    expect(deriveFullName({ id: 'x', firstName: 'Awwal', lastName: 'Lawal', email: 'x@e.com' })).toBe('Awwal Lawal');
  });

  it('uses the given name alone for a mononym (no family name)', () => {
    expect(deriveFullName({ id: 'x', firstName: 'Sola', lastName: null, email: 'x@e.com' })).toBe('Sola');
  });

  it('falls back to "Registrant" when no name is present', () => {
    expect(deriveFullName({ id: 'x', firstName: null, lastName: null, email: 'x@e.com' })).toBe('Registrant');
  });
});
