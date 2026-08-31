import { REGISTRY_UNIFIED_SQL_TEXT } from '../registry-unified.sql.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import {
  REGISTRY_UNIFIED_SQL_TEXT,
  REGISTRY_UNIFIED_VIEW_NAME,
  registryUnifiedSource,
  getRegistryUnifiedRows,
  registryUnifiedViewExists,
} from '../registry-unified.js';

/**
 * Story 13-33 — the canonical unified read. The SQL↔schema parity + view/inline/
 * count-core/export convergence is proven by the real-DB integration smoke; this
 * fast unit set locks the SQL SHAPE invariants (the respondent-anchored,
 * latest-non-empty convergence the whole story rests on) and the composition
 * helper, so a refactor can't silently turn it submission-anchored again.
 */
describe('registry-unified — canonical SQL shape', () => {
  it('is respondent-anchored (FROM respondents, not FROM submissions)', () => {
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/FROM\s+respondents\s+r/i);
    // The convergence must NOT start from submissions (the drift/exclusion bug).
    expect(REGISTRY_UNIFIED_SQL_TEXT).not.toMatch(/FROM\s+submissions\s+s\b/i);
  });

  it('joins the latest NON-EMPTY submission via LATERAL (answers cannot be masked)', () => {
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/LEFT JOIN LATERAL/i);
    // The emptiness test — the shared `hasNonEmptyRawData` embodiment.
    expect(REGISTRY_UNIFIED_SQL_TEXT).toContain("raw_data <> '{}'::jsonb");
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/ORDER BY sx\.submitted_at DESC/i);
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/LIMIT 1/i);
  });

  it('exposes the substrate consumers + 12-4 need (geo, source, status, nin, raw_data)', () => {
    for (const col of ['lga_id', 'source', 'status', 'nin', 'raw_data', 'consent_marketplace']) {
      expect(REGISTRY_UNIFIED_SQL_TEXT).toContain(col);
    }
  });

  it('view name constant is stable', () => {
    expect(REGISTRY_UNIFIED_VIEW_NAME).toBe('registry_unified');
  });
});

describe('registry-unified — composition + reads', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registryUnifiedSource composes an aliased FROM source (default ru)', () => {
    const src = registryUnifiedSource();
    // drizzle SQL — assert the compiled shape carries the canonical subquery + alias.
    expect(src).toBeTruthy();
    const custom = registryUnifiedSource('reg');
    expect(custom).toBeTruthy();
  });

  it('getRegistryUnifiedRows returns the executed rows', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ respondent_id: 'r1', lga_id: 'egbeda', source: 'public', raw_data: { gender: 'male' } }],
    });
    const rows = await getRegistryUnifiedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].respondent_id).toBe('r1');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it('registryUnifiedViewExists reflects to_regclass presence', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ oid: 'registry_unified' }] });
    expect(await registryUnifiedViewExists()).toBe(true);

    mockExecute.mockResolvedValueOnce({ rows: [{ oid: null }] });
    expect(await registryUnifiedViewExists()).toBe(false);
  });
});

describe('canonical read — rolled_back is excluded (2026-08-31)', () => {
  /*
   * ⭐ THE PROPERTY: a 14-day rollback must undo the PUBLIC figures, not only the
   * private pipelines. `rolled_back` was already in PIPELINE_EXCLUDED_STATUSES, so a
   * rollback removed rows from marketplace/fraud — but this read had no status filter,
   * so they stayed in totalRegistered, genderSplit, lgasCovered, skillsByLga and the
   * density map. Import 8,000, roll back, and the public page still says 8,000 while
   * those people are invisible to the marketplace: the worst of both.
   *
   * Asserted on the SQL TEXT because this constant feeds BOTH the inline read and the
   * `CREATE OR REPLACE VIEW` DDL — one edit, two consumers, and a source assertion
   * catches a deletion that a mocked-DB test never would.
   */
  it('the canonical SQL filters rolled_back out', () => {
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/WHERE\s+r\.status\s*<>\s*'rolled_back'/);
  });

  it('and still starts FROM respondents — the exclusion must not change the grain', () => {
    // One row per respondent is the whole contract; a status filter narrows the set,
    // it must never turn this into a submission-grained read.
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/FROM respondents r/);
    expect(REGISTRY_UNIFIED_SQL_TEXT).toMatch(/LEFT JOIN LATERAL/);
    expect(REGISTRY_UNIFIED_SQL_TEXT).not.toMatch(/DISTINCT ON/);
  });
});
