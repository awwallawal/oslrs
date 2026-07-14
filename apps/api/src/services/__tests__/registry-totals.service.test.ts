import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
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

  it('returns respondent-scoped totals', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ total_respondents: 142, with_answers: 79 }] });
    const result = await getRegistryCountCore();
    expect(result).toEqual({ totalRespondents: 142, withAnswers: 79 });
  });

  it('coerces pg numeric-as-text counts to numbers', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ total_respondents: '142', with_answers: '79' }] });
    const result = await getRegistryCountCore();
    expect(result).toEqual({ totalRespondents: 142, withAnswers: 79 });
  });

  it('returns zeros for an empty result set', async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const result = await getRegistryCountCore();
    expect(result).toEqual({ totalRespondents: 0, withAnswers: 0 });
  });
});
