import { describe, it, expect, vi } from 'vitest';
import { findRespondentByIdentity } from '../respondent-identity.js';

/**
 * 13-49 R21. The SQL itself (token-set intersection) cannot be evaluated by a mock, and it was
 * verified read-only against live prod instead: every duplicate-phone pair in the registry scored
 * >= 2 shared tokens, and no pair of genuinely distinct people did.
 *
 * What IS testable here is the part that decides whether the query runs at all — and that is the
 * safety trade. A partial match is where wrong-person merges come from, so all three identity
 * fields are required and a missing one must SHORT-CIRCUIT rather than widen the search.
 */
describe('13-49 R21 — findRespondentByIdentity', () => {
  const exec = (rows: unknown[]) => ({ execute: vi.fn().mockResolvedValue({ rows }) });

  it('returns the match when all three identity fields are present', async () => {
    const e = exec([{ id: 'resp-1', reference_code: 'OSL-2026-ABC123', status: 'active' }]);
    const got = await findRespondentByIdentity(e, {
      firstName: 'Segun Adewale',
      lastName: 'Akingbade',
      phoneNumber: '+2348164048995',
    });
    expect(got).toEqual({ id: 'resp-1', referenceCode: 'OSL-2026-ABC123', status: 'active' });
    expect(e.execute).toHaveBeenCalledTimes(1);
  });

  it('returns null — WITHOUT querying — when any identity field is missing', async () => {
    for (const candidate of [
      { firstName: null, lastName: 'Akingbade', phoneNumber: '+2348164048995' },
      { firstName: 'Segun', lastName: null, phoneNumber: '+2348164048995' },
      { firstName: 'Segun', lastName: 'Akingbade', phoneNumber: null },
      { firstName: '', lastName: 'Akingbade', phoneNumber: '+2348164048995' },
    ]) {
      const e = exec([{ id: 'should-not-be-used' }]);
      await expect(findRespondentByIdentity(e, candidate)).resolves.toBeNull();
      // Load-bearing: it must not fall back to a looser query. Better one duplicate than two
      // citizens collapsed into one record.
      expect(e.execute).not.toHaveBeenCalled();
    }
  });

  it('returns null when nothing matches', async () => {
    const e = exec([]);
    await expect(
      findRespondentByIdentity(e, { firstName: 'A', lastName: 'B', phoneNumber: '+2348000000000' }),
    ).resolves.toBeNull();
  });

  /**
   * The query must key on the phone AND compare name TOKENS. Exact first+last equality caught
   * NONE of four real collisions, because surname-first is normal here and middle names come and
   * go. This pins the shape so a future simplification cannot quietly reintroduce that.
   */
  it('issues a token-intersection query, not exact name equality', async () => {
    const e = exec([]);
    await findRespondentByIdentity(e, {
      firstName: 'Segun Adewale',
      lastName: 'Akingbade',
      phoneNumber: '+2348164048995',
    });
    const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
    expect(issued).toMatch(/INTERSECT/i);
    expect(issued).toMatch(/string_to_array/i);
    expect(issued).toMatch(/rolled_back/);
    expect(issued).not.toMatch(/lower\("first_name"\)\s*=/i);
  });
});
