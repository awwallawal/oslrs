/**
 * Story 13-2 R-A2 review P1 — the provenance record's shape and arithmetic.
 *
 * A provenance record that does not add up is worse than none: it is evidence that
 * LOOKS checked. These pin each rule in both directions, and pin the two real
 * reconciliations (AFAN farming, ASNAT tilers) so a future edit to the rules cannot
 * silently reject the records already written to production.
 */
import { describe, it, expect } from 'vitest';
import { importProvenanceStatsSchema, reconcileProvenanceStats } from '../../import-provenance.js';

describe('importProvenanceStatsSchema', () => {
  it('accepts a partial record — every field is optional', () => {
    expect(importProvenanceStatsSchema.safeParse({}).success).toBe(true);
    expect(importProvenanceStatsSchema.safeParse({ declaredMembers: 60 }).success).toBe(true);
  });

  /** Strict on purpose: a stray key is how names or phones would sneak into a "numbers only" column. */
  it('rejects unknown keys (no free-form personal data can ride along)', () => {
    expect(importProvenanceStatsSchema.safeParse({ rawRows: 1, heads: ['Ade Bello'] }).success).toBe(false);
  });

  it('rejects negative, fractional and non-numeric counts', () => {
    expect(importProvenanceStatsSchema.safeParse({ rawRows: -1 }).success).toBe(false);
    expect(importProvenanceStatsSchema.safeParse({ rawRows: 1.5 }).success).toBe(false);
    expect(importProvenanceStatsSchema.safeParse({ rawRows: '70' }).success).toBe(false);
  });

  it('requires snake_case reason keys and caps the note', () => {
    expect(importProvenanceStatsSchema.safeParse({ heldByReason: { 'Shared Phone': 3 } }).success).toBe(false);
    expect(importProvenanceStatsSchema.safeParse({ heldByReason: { shared_phone: 3 } }).success).toBe(true);
    expect(importProvenanceStatsSchema.safeParse({ note: 'x'.repeat(501) }).success).toBe(false);
  });
});

describe('reconcileProvenanceStats', () => {
  it('accepts the AFAN farming reconciliation (10,090 − 374 − 1,482 = 8,234)', () => {
    const problems = reconcileProvenanceStats(
      {
        rawRows: 10090,
        rawRowsBySource: { ncares: 6516, lpres: 3535, fish: 39 },
        mergedRows: 374,
        heldRows: 1482,
        heldByReason: { shared_phone_with_other_names: 786, no_usable_phone: 153 },
        cleanRows: 8234,
      },
      8234,
    );
    expect(problems).toEqual([]);
  });

  it('accepts the ASNAT tilers reconciliation (70 − 0 − 14 = 56)', () => {
    expect(reconcileProvenanceStats({ rawRows: 70, mergedRows: 0, heldRows: 14, cleanRows: 56 }, 56)).toEqual([]);
  });

  it('refuses cleanRows that disagree with the uploaded file', () => {
    expect(reconcileProvenanceStats({ cleanRows: 57 }, 56)).toEqual([
      'cleanRows 57 ≠ data rows in the uploaded file 56',
    ]);
  });

  it('refuses a raw → clean journey that does not add up', () => {
    const problems = reconcileProvenanceStats({ rawRows: 70, mergedRows: 0, heldRows: 13, cleanRows: 56 }, 56);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/= 57, but cleanRows is 56/);
  });

  it('refuses a per-source split that does not sum to rawRows', () => {
    expect(reconcileProvenanceStats({ rawRows: 100, rawRowsBySource: { a: 60, b: 30 } }, null)).toEqual([
      'rawRowsBySource sums to 90, but rawRows is 100',
    ]);
  });

  /** Reasons overlap (one row, several flags), so they may sum past heldRows — but no single reason can exceed it. */
  it('allows overlapping held reasons, but not a reason larger than heldRows', () => {
    expect(reconcileProvenanceStats({ heldRows: 10, heldByReason: { a: 8, b: 7 } }, null)).toEqual([]);
    expect(reconcileProvenanceStats({ heldRows: 10, heldByReason: { a: 11 } }, null)).toEqual([
      'heldByReason.a 11 exceeds heldRows 10',
    ]);
  });

  it('does not invent a check when an input is missing', () => {
    expect(reconcileProvenanceStats({ rawRows: 70, cleanRows: 56 }, 56)).toEqual([]);
    expect(reconcileProvenanceStats({ cleanRows: 56 }, null)).toEqual([]);
  });
});
