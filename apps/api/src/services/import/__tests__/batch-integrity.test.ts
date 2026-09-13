/**
 * Story 13-2 R-A2 review P2 — the batch integrity reading. PURE.
 *
 * Every signal here is arithmetic, not a threshold. These pin each one in both
 * directions (it fires when true, stays silent when not), because a signal list that
 * only ever grows is a list nobody reads.
 */
import { describe, it, expect } from 'vitest';
import { computeBatchIntegrity, nameKey, type IntegrityInput } from '../batch-integrity.js';

const row = (firstName: string, lastName: string, phoneNumber: string | null, lgaId = 'ibadan_north') => ({
  firstName,
  lastName,
  phoneNumber,
  lgaId,
});

function input(over: Partial<IntegrityInput> = {}): IntegrityInput {
  return {
    basis: 'predicted',
    rowsParsed: 3,
    rowsFailed: 0,
    inserted: 3,
    matchedExisting: 0,
    skipped: 0,
    rows: [row('Ade', 'Bello', '+2348000000001'), row('Bisi', 'Kola', '+2348000000002'), row('Chidi', 'Obi', '+2348000000003')],
    provenance: null,
    isAssociationBatch: false,
    ...over,
  };
}

describe('nameKey', () => {
  it('is order- and case-insensitive and collapses whitespace (13-2 R-A6)', () => {
    expect(nameKey('Tunde', 'Bakare')).toBe(nameKey('bakare', '  TUNDE '));
    expect(nameKey(null, null)).toBe('');
  });
});

describe('computeBatchIntegrity', () => {
  it('reports a clean batch with no signals', () => {
    const r = computeBatchIntegrity(input());
    expect(r.signals).toEqual([]);
    expect(r.sharedPhoneRows).toBe(0);
    expect(r.sameNameRows).toBe(0);
    expect(r.matchedExistingRatio).toBe(0);
    expect(r.declaredGap).toBeNull();
  });

  it('counts rows on shared phones, the numbers, and the heaviest share', () => {
    const r = computeBatchIntegrity(
      input({
        rows: [
          row('A', 'One', '+2348000000009'),
          row('B', 'Two', '+2348000000009'),
          row('C', 'Three', '+2348000000009'),
          row('D', 'Four', '+2348000000001'),
          row('E', 'Five', null),
        ],
      }),
    );
    expect(r.sharedPhoneRows).toBe(3);
    expect(r.sharedPhoneNumbers).toBe(1);
    expect(r.maxRowsPerPhone).toBe(3);
    expect(r.signals).toContain('shared_phone_rows_present');
  });

  /** Same name in DIFFERENT LGAs is two people; swapped order in the SAME LGA is one key. */
  it('counts same-name rows only within one LGA, ignoring name order', () => {
    const r = computeBatchIntegrity(
      input({
        rows: [
          row('Tunde', 'Bakare', '+2348000000001', 'ibadan_north'),
          row('Bakare', 'Tunde', '+2348000000002', 'ibadan_north'),
          row('Tunde', 'Bakare', '+2348000000003', 'ogbomosho_north'),
        ],
      }),
    );
    expect(r.sameNameRows).toBe(2);
    expect(r.signals).toContain('same_name_rows_present');
  });

  /** The padding tell: more people landed than the head said the association has. */
  it('flags received above declared, and below, and neither when equal', () => {
    const above = computeBatchIntegrity(input({ inserted: 58, matchedExisting: 2, provenance: { declaredMembers: 50 } }));
    expect(above.declaredGap).toBe(10);
    expect(above.signals).toContain('received_exceeds_declared');

    const below = computeBatchIntegrity(input({ inserted: 40, provenance: { declaredMembers: 50 } }));
    expect(below.declaredGap).toBe(-10);
    expect(below.signals).toContain('received_below_declared');

    const equal = computeBatchIntegrity(input({ inserted: 50, provenance: { declaredMembers: 50 } }));
    expect(equal.declaredGap).toBe(0);
    expect(equal.signals).not.toContain('received_exceeds_declared');
    expect(equal.signals).not.toContain('received_below_declared');
  });

  it('flags missing provenance only for association batches', () => {
    expect(computeBatchIntegrity(input({ isAssociationBatch: true })).signals).toContain('provenance_missing');
    expect(computeBatchIntegrity(input({ isAssociationBatch: false })).signals).not.toContain('provenance_missing');
    expect(
      computeBatchIntegrity(input({ isAssociationBatch: true, provenance: { rawRows: 3, cleanRows: 3 } })).signals,
    ).not.toContain('provenance_missing');
  });

  it('derives the clean-over-raw share and the matched-existing ratio (farming: 8,234 / 10,090; 12 / 8,234)', () => {
    const r = computeBatchIntegrity(
      input({ rowsParsed: 8234, inserted: 8222, matchedExisting: 12, provenance: { rawRows: 10090, cleanRows: 8234 } }),
    );
    expect(r.cleanOverRaw).toBe(0.8161);
    expect(r.matchedExistingRatio).toBe(0.0015);
    expect(r.signals).toContain('rows_matched_existing');
  });

  it('returns null ratios rather than dividing by zero', () => {
    const r = computeBatchIntegrity(input({ rowsParsed: 0, inserted: 0, rows: [], provenance: { rawRows: 0, cleanRows: 0 } }));
    expect(r.matchedExistingRatio).toBeNull();
    expect(r.cleanOverRaw).toBeNull();
  });
});
