import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

/**
 * Story 13-46 (review A8 / finding M4) — capture the module's pino logger so the "unknown tier is
 * LOUD" assertion has something to assert on. The service's logger is module-private, so the only
 * honest seam is the pino factory itself.
 */
const mockLogError = vi.hoisted(() => vi.fn());
vi.mock('pino', () => ({
  default: () => ({
    error: (...args: unknown[]) => mockLogError(...args),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { getRegistryCountCore } from '../registry-totals.service.js';

/**
 * Fast unit coverage for the count-core parsing. The raw-SQL ↔ schema parity is
 * covered by `registry-totals-db-smoke.integration.test.ts` (real DB).
 */
describe('getRegistryCountCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Story 13-46 (AC5) — the query is now GROUPING SETS: one grand-total row carrying a NULL tier,
  // plus one row per Axis-3 tier present in the data. The fixtures below mirror that shape.
  const ZERO_TIERS = {
    nin_on_file: 0,
    self_declared: 0,
    pending_nin: 0,
    unverified_import: 0,
  };

  it('returns respondent-scoped totals', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { total_respondents: 142, with_answers: 79, verification_tier: null, tier_count: 142 },
        { total_respondents: 142, with_answers: 79, verification_tier: 'nin_on_file', tier_count: 100 },
        { total_respondents: 142, with_answers: 79, verification_tier: 'self_declared', tier_count: 42 },
      ],
    });
    const result = await getRegistryCountCore();
    expect(result).toEqual({
      totalRespondents: 142,
      withAnswers: 79,
      byVerification: { ...ZERO_TIERS, nin_on_file: 100, self_declared: 42 },
    });
  });

  it('coerces pg numeric-as-text counts to numbers', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        { total_respondents: '142', with_answers: '79', verification_tier: null, tier_count: '142' },
        { total_respondents: '142', with_answers: '79', verification_tier: 'pending_nin', tier_count: '142' },
      ],
    });
    const result = await getRegistryCountCore();
    expect(result).toEqual({
      totalRespondents: 142,
      withAnswers: 79,
      byVerification: { ...ZERO_TIERS, pending_nin: 142 },
    });
  });

  it('returns zeros for an empty result set', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const result = await getRegistryCountCore();
    expect(result).toEqual({ totalRespondents: 0, withAnswers: 0, byVerification: ZERO_TIERS });
  });

  it('zero-fills a tier absent from the result — a missing row is 0, never undefined', async () => {
    // The web renders every tier unconditionally; an absent key would be `undefined` on the page.
    mockExecute.mockResolvedValueOnce({
      rows: [
        { total_respondents: 5, with_answers: 5, verification_tier: null, tier_count: 5 },
        { total_respondents: 5, with_answers: 5, verification_tier: 'nin_on_file', tier_count: 5 },
      ],
    });
    const result = await getRegistryCountCore();
    expect(result.byVerification).toEqual({ ...ZERO_TIERS, nin_on_file: 5 });
  });

  it('IGNORES an unknown tier string rather than widening the record — and says so LOUDLY', async () => {
    // A tier the SQL emits but the taxonomy does not know must not silently appear in a published
    // payload the shared type says is a closed union.
    //
    // ⚠️ review A8 / finding M4 — THIS TEST USED TO BLESS THE INCONSISTENCY IT WAS DOCUMENTING.
    // It asserted a headline of 3 with tiers summing to 0 and stopped there, enshrining exactly the
    // state the integration test ("the tiers PARTITION the headline") declares unacceptable. Two
    // tests, two contradictory invariants, and in prod the silent one wins. The drop is still the
    // right behaviour — widening a closed union at runtime would be worse — but it must be an
    // ERROR the operator can see, not arithmetic that quietly stops adding up.
    mockExecute.mockResolvedValueOnce({
      rows: [
        { total_respondents: 3, with_answers: 3, verification_tier: null, tier_count: 3 },
        { total_respondents: 3, with_answers: 3, verification_tier: 'verified', tier_count: 3 },
      ],
    });

    const result = await getRegistryCountCore();

    expect(result.byVerification).toEqual(ZERO_TIERS);
    expect(result.byVerification).not.toHaveProperty('verified');
    // The load-bearing half: the divergence is ANNOUNCED rather than quietly not adding up.
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'registry.unknown_verification_tier', tier: 'verified' }),
    );
  });
});
