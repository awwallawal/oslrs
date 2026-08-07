import { describe, it, expect, vi } from 'vitest';
import {
  findRespondentByIdentity,
  promoteRespondentWithArrivingNin,
  NIN_ARRIVAL_PROMOTABLE_STATUSES,
} from '../respondent-identity.js';

/**
 * 13-49 R21. The SQL itself (token-set intersection) cannot be evaluated by a mock, and it was
 * verified read-only against live prod instead: every duplicate-phone pair in the registry scored
 * >= 2 shared tokens, and no pair of genuinely distinct people did.
 *
 * What IS testable here is the part that decides whether the query runs at all — and that is the
 * safety trade. A partial match is where wrong-person merges come from, so all three identity
 * fields are required and a missing one must SHORT-CIRCUIT rather than widen the search.
 */
/**
 * The drizzle `sql` template stringifies with its double quotes ESCAPED (`\"nin\"`), so a pattern
 * written the way the SQL reads never matches and a `not.toMatch` passes unconditionally. That is
 * how the original `lower("first_name") =` assertion below came to be green while asserting
 * nothing (found 13-53). Build patterns through here so the escaping is handled once.
 */
const inSql = (fragment: string) =>
  new RegExp(
    fragment
      // The fragment is SQL, so `(` `)` `$` etc. are literals, not regex syntax.
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // …and drizzle's stringified form escapes every double quote.
      .replace(/"/g, '\\\\"')
      .replace(/ /g, '\\s+'),
    'i',
  );

const exec = (rows: unknown[]) => ({ execute: vi.fn().mockResolvedValue({ rows }) });

describe('13-49 R21 — findRespondentByIdentity', () => {

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
    expect(issued).not.toMatch(inSql('lower("first_name") ='));
    // Self-check on the matcher itself: the pattern above must be capable of firing, or the
    // `not.toMatch` proves nothing. This is the assertion the escaped-quote bug silently voided.
    expect('lower(\\"first_name\\") = lower($1)').toMatch(inSql('lower("first_name") ='));
  });

  /**
   * 13-53 — the NIN-arrival direction. R21 asked "does the register already hold this person?"
   * only when the INCOMING row had no NIN. This asks it when the incoming row HAS one and the NIN
   * matched nothing, and it must look ONLY at rows that hold no NIN: two rows with different NINs
   * are a conflict for a human, never a silent merge (AC1.3).
   */
  describe('13-53 — requireNoNin', () => {
    it('restricts the search to NIN-less rows when asked', async () => {
      const e = exec([]);
      await findRespondentByIdentity(
        e,
        { firstName: 'Bashiru', lastName: 'Yusuff Titilope', phoneNumber: '+2348164048995' },
        { requireNoNin: true },
      );
      const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
      expect(issued).toMatch(inSql('"nin" IS NULL'));
      // Still the token key, not exact equality — the seam is about WHICH ROWS, not HOW we match.
      expect(issued).toMatch(/INTERSECT/i);
      /**
       * Review H1 — the lookup carries the SAME status allow-list as the UPDATE, and it has to.
       * `LIMIT 1` over `created_at ASC` means the first eligible row is the ONLY row considered:
       * an unfiltered lookup would hand back an `imported_unverified` row (the oldest rows in the
       * register) INSTEAD OF the pending row beside it, and the UPDATE would then refuse it — a
       * miss that looks exactly like "we do not hold this person".
       */
      for (const status of NIN_ARRIVAL_PROMOTABLE_STATUSES) {
        expect(issued).toMatch(new RegExp(`'${status}'`));
      }
      expect(issued).not.toMatch(/imported_unverified/);
    });

    it('does NOT restrict by default — the R21 no-NIN path is unchanged', async () => {
      const e = exec([]);
      await findRespondentByIdentity(e, {
        firstName: 'Bashiru',
        lastName: 'Yusuff Titilope',
        phoneNumber: '+2348164048995',
      });
      const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
      expect(issued).not.toMatch(inSql('"nin" IS NULL'));
      // Same self-check: prove the pattern CAN fire, so the negative means something.
      expect('AND \\"nin\\" IS NULL').toMatch(inSql('"nin" IS NULL'));
    });
  });
});

/**
 * 13-53 AC1.2/AC1.3 — promote in place.
 *
 * The person keeps the number they were already given, and the UPDATE carries the AC1.3 refusal in
 * SQL rather than in a caller's branch: `nin IS NULL` means a row that already holds a NIN cannot
 * be overwritten even by a caller that passes the wrong id. That is also what makes it race-safe —
 * two concurrent arrivals cannot both win.
 */
describe('13-53 — promoteRespondentWithArrivingNin', () => {
  it('promotes and returns the EXISTING reference code', async () => {
    const e = exec([
      { id: 'resp-1', reference_code: 'OSL-2026-56C9PG', status: 'active' },
    ]);
    await expect(
      promoteRespondentWithArrivingNin(e, { respondentId: 'resp-1', nin: '12345678901' }),
    ).resolves.toEqual({ id: 'resp-1', referenceCode: 'OSL-2026-56C9PG', status: 'active' });
  });

  it('guards the UPDATE on nin IS NULL — a row holding a NIN is never overwritten', async () => {
    const e = exec([{ id: 'resp-1', reference_code: 'X', status: 'active' }]);
    await promoteRespondentWithArrivingNin(e, { respondentId: 'resp-1', nin: '12345678901' });
    const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
    expect(issued).toMatch(/UPDATE/i);
    expect(issued).toMatch(inSql('"nin" IS NULL'));
  });

  /**
   * Review H1 — the status allow-list, enforced in the UPDATE as well as in the lookup.
   *
   * The first cut excluded only `rolled_back`, which let a NIN arrival flip an
   * `imported_unverified` row to `active` — relabelling a deliberately-unverified import as
   * field-verified AND re-opening the `PIPELINE_EXCLUDED_STATUSES` gate that keeps those rows out
   * of fraud / marketplace. Asserted as an allow-list, so ADDING a status to the enum cannot
   * silently widen what a promote may touch.
   */
  it('promotes only the NIN-lifecycle statuses — never imported_unverified or rolled_back', async () => {
    const e = exec([{ id: 'resp-1', reference_code: 'X', status: 'active' }]);
    await promoteRespondentWithArrivingNin(e, { respondentId: 'resp-1', nin: '12345678901' });
    const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
    expect(NIN_ARRIVAL_PROMOTABLE_STATUSES).toEqual([
      'pending_nin_capture',
      'nin_unavailable',
      'active',
    ]);
    for (const status of NIN_ARRIVAL_PROMOTABLE_STATUSES) {
      expect(issued).toMatch(new RegExp(`'${status}'`));
    }
    expect(issued).not.toMatch(/imported_unverified/);
    // The allow-list subsumes the old `<> 'rolled_back'` — prove it is genuinely excluded rather
    // than merely no longer mentioned.
    expect(issued).not.toMatch(/rolled_back/);
  });

  /**
   * Reviews M1 / L3 / H2 — everything the arriving submission may contribute, and the shape that
   * makes it safe. Every one is a COALESCE or a JSONB merge: fill a blank, never overwrite.
   */
  it('NULL-FILLS reference code / DOB / LGA and folds guardian consent — never clobbers', async () => {
    const e = exec([{ id: 'resp-1', reference_code: 'OSL-2026-KEPT01', status: 'active' }]);
    await promoteRespondentWithArrivingNin(e, {
      respondentId: 'resp-1',
      nin: '12345678901',
      fallbackReferenceCode: 'OSL-2026-NEW999',
      dateOfBirth: '1998-04-02',
      lgaId: 'ibadan-north',
      guardian: {
        name: 'Amina Yusuff',
        relationship: 'mother',
        phone: '+2348012345678',
        consent: 'yes',
        isSupervisedApprentice: 'yes',
      },
    });
    const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
    expect(issued).toMatch(inSql('"reference_code" = COALESCE("reference_code"'));
    expect(issued).toMatch(inSql('"date_of_birth" = COALESCE("date_of_birth"'));
    expect(issued).toMatch(inSql('"lga_id" = COALESCE("lga_id"'));
    // The 9-55 merge shape: `||` preserves defer_reason_nin / reminder_state / adopted_by.
    expect(issued).toMatch(inSql('"metadata" = COALESCE("metadata"'));
    expect(issued).toMatch(/guardian/);
    // A bare assignment anywhere in the SET list would mean an overwrite — the one thing worse
    // than a duplicate. This is the assertion that fails if a COALESCE is ever unwrapped.
    expect(issued).not.toMatch(inSql('"reference_code" = $'));
  });

  it('omits every optional fragment when the caller passes none — the SET stays minimal', async () => {
    const e = exec([{ id: 'resp-1', reference_code: 'X', status: 'active' }]);
    await promoteRespondentWithArrivingNin(e, { respondentId: 'resp-1', nin: '12345678901' });
    const issued = JSON.stringify(e.execute.mock.calls[0]?.[0] ?? {});
    // No optional passed → not a single COALESCE / JSONB merge in the SET list. Keyed on
    // `COALESCE` rather than the column names because `reference_code` legitimately appears in
    // RETURNING — a negative on the bare name would fail for the wrong reason, which is its own
    // small version of [[pattern-test-that-passes-over-a-hole]] in reverse.
    expect(issued).not.toMatch(/COALESCE/i);
    for (const col of ['date_of_birth', 'lga_id', 'metadata']) {
      expect(issued).not.toMatch(new RegExp(col));
    }
    // …and the self-check that the patterns above CAN fire, so these negatives mean something.
    expect('COALESCE(\\"lga_id\\"').toMatch(/COALESCE/i);
    expect('COALESCE(\\"lga_id\\"').toMatch(/lga_id/);
  });

  it('returns null when it updates nothing — lost the race, caller falls through', async () => {
    const e = exec([]);
    await expect(
      promoteRespondentWithArrivingNin(e, { respondentId: 'resp-1', nin: '12345678901' }),
    ).resolves.toBeNull();
  });

  it('returns null — WITHOUT querying — on a missing id or NIN', async () => {
    for (const args of [
      { respondentId: '', nin: '12345678901' },
      { respondentId: 'resp-1', nin: '' },
    ]) {
      const e = exec([{ id: 'should-not-be-used' }]);
      await expect(promoteRespondentWithArrivingNin(e, args)).resolves.toBeNull();
      expect(e.execute).not.toHaveBeenCalled();
    }
  });
});
