/**
 * Story 13-38 (AC7 + AC8) — marketplace card field backfill.
 *
 * The load-bearing test here is the DRY-RUN one: a `--dry-run` flag that is parsed
 * and then read by nothing is the 13-49 review finding (a test that passes over a
 * hole). So this asserts the absence of the UPDATE, not just `updated === 0`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

const { backfillMarketplaceCardFields } = await import('../marketplace-card-backfill.service.js');

interface RowInput {
  id?: string;
  experience_level?: string | null;
  business_name?: string | null;
  /** Story 13-58 — what the PROFILE currently holds. */
  association_name?: string | null;
  /** Story 13-58 — what the RESPONDENT's metadata says (13-67's write). */
  respondent_association_name?: string | null;
  raw_data?: Record<string, unknown> | null;
  adopted_draft_answers?: Record<string, unknown> | null;
  first_name?: string | null;
  last_name?: string | null;
}

function makeRow(overrides: RowInput = {}) {
  return {
    id: '018e1234-5678-7000-8000-000000000001',
    experience_level: null,
    business_name: null,
    association_name: null,
    respondent_association_name: null,
    raw_data: { years_experience: 'over_10' },
    adopted_draft_answers: null,
    first_name: null,
    last_name: null,
    ...overrides,
  };
}

/**
 * The SQL text of the Nth execute() call (0 = the candidate SELECT).
 *
 * Recurses into nested `sql` fragments — the optional scope clause is composed as
 * its own fragment, so a flat walk renders it as an empty string and any assertion
 * about it would pass or fail for the wrong reason.
 */
function sqlTextOf(callIndex: number): string {
  const flatten = (node: unknown): string => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(flatten).join('');
    if (node && typeof node === 'object') {
      const obj = node as { queryChunks?: unknown[]; value?: unknown };
      if (Array.isArray(obj.queryChunks)) return obj.queryChunks.map(flatten).join('');
      if (Array.isArray(obj.value)) return obj.value.join('');
    }
    return '';
  };
  return flatten(mockExecute.mock.calls[callIndex]?.[0]);
}

/**
 * The whole Nth execute() call serialised — SQL text AND bound values.
 *
 * [AI-Review][Low] 2026-09-08 — added because asserting on the SQL TEXT alone
 * cannot distinguish "wrote the stored value back" from "blanked it": the UPDATE
 * names all three columns either way. Bound values appear only here, so a stored
 * value showing up in this string is real evidence it was preserved. Same
 * technique the marketplace service test uses on its own queries.
 */
function sqlPayloadOf(callIndex: number): string {
  return JSON.stringify(mockExecute.mock.calls[callIndex]?.[0]);
}

/** First execute() = the candidate SELECT; every later one = an UPDATE. */
function primeDb(rows: ReturnType<typeof makeRow>[]) {
  mockExecute.mockReset();
  mockExecute.mockImplementation(() => {
    if (mockExecute.mock.calls.length === 1) return Promise.resolve({ rows });
    return Promise.resolve({ rows: [] });
  });
}

function updateCallCount() {
  return Math.max(0, mockExecute.mock.calls.length - 1);
}

describe('backfillMarketplaceCardFields', () => {
  beforeEach(() => {
    mockExecute.mockReset();
  });

  describe('dry-run is the default and writes NOTHING', () => {
    it('issues no UPDATE at all, even with rows that need one', async () => {
      primeDb([
        makeRow({ id: 'a', raw_data: { years_experience: 'over_10' } }),
        makeRow({ id: 'b', raw_data: { years_experience: 'less_1', business_name: 'Bola Motors' } }),
      ]);

      const result = await backfillMarketplaceCardFields();

      expect(result.dryRun).toBe(true);
      expect(result.scanned).toBe(2);
      expect(result.needsUpdate).toBe(2);
      expect(result.updated).toBe(0);
      // The real guard: exactly ONE query ran — the SELECT.
      expect(mockExecute).toHaveBeenCalledTimes(1);
      expect(updateCallCount()).toBe(0);
    });

    it('treats an explicit apply:false the same as the default', async () => {
      primeDb([makeRow()]);

      const result = await backfillMarketplaceCardFields({ apply: false });

      expect(result.updated).toBe(0);
      expect(updateCallCount()).toBe(0);
    });
  });

  describe('apply mode', () => {
    it('writes exactly the rows that differ', async () => {
      primeDb([
        // needs a fix: `over_10` currently stores NULL (the pre-13-38 bug)
        makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'over_10' } }),
        // already correct on both fields — must NOT be written
        makeRow({
          id: 'b',
          experience_level: '1_3',
          business_name: 'Ade Tailoring',
          raw_data: { years_experience: '1_3', business_name: 'Ade Tailoring' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.dryRun).toBe(false);
      expect(result.needsUpdate).toBe(1);
      expect(result.updated).toBe(1);
      expect(updateCallCount()).toBe(1);
    });

    it('recomputes the buckets the old normaliser lost (over_10 / less_1 / 7_10)', async () => {
      primeDb([
        makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'over_10' } }),
        makeRow({ id: 'b', experience_level: null, raw_data: { years_experience: 'less_1' } }),
        makeRow({ id: 'c', experience_level: '4-7', raw_data: { years_experience: '7_10' } }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.experienceChanged).toBe(3);
      expect(result.updated).toBe(3);
    });

    it('is idempotent — a second pass over already-correct rows writes nothing', async () => {
      primeDb([
        makeRow({
          id: 'a',
          experience_level: 'over_10',
          business_name: 'Bola Motors',
          raw_data: { years_experience: 'over_10', business_name: 'Bola Motors' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.needsUpdate).toBe(0);
      expect(result.updated).toBe(0);
      expect(updateCallCount()).toBe(0);
    });
  });

  describe('answer sources', () => {
    it('falls back to respondents.adopted_draft_answers and counts it', async () => {
      primeDb([
        makeRow({
          id: 'a',
          raw_data: null,
          adopted_draft_answers: { years_experience: '4_6', business_name: 'Iya Basira Foods' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.fromAdoptedAnswers).toBe(1);
      expect(result.businessNameChanged).toBe(1);
      expect(result.updated).toBe(1);
    });

    it('counts rows with no answer source and leaves them alone', async () => {
      primeDb([makeRow({ id: 'a', raw_data: null, adopted_draft_answers: null })]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.noAnswerSource).toBe(1);
      expect(result.needsUpdate).toBe(0);
      expect(updateCallCount()).toBe(0);
    });
  });

  describe('honesty guards', () => {
    it('counts an unbucketable answer instead of guessing a bucket', async () => {
      primeDb([
        makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'a long time' } }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.unresolvedExperience).toBe(1);
      // null -> null is not a change, so nothing is written.
      expect(result.needsUpdate).toBe(0);
      expect(updateCallCount()).toBe(0);
    });

    // [AI-Review][High] 2026-08-17 — the backfill must never DELETE a working
    // hero stat. `experienceDiffers` had no null-guard (unlike its business_name
    // sibling), so an answer the new canon cannot bucket blanked a valid stored
    // value. A repair tool that destroys good rows is worse than not running.
    it.each([
      // Old-canon-only labels: the pre-13-38 worker accepted these, the new
      // normaliser deliberately refuses them as ambiguous.
      ['an old-canon-only label', { years_experience: 'senior' }],
      ['another old-canon label', { years_experience: 'expert' }],
      // Free text nobody can bucket.
      ['unbucketable free text', { years_experience: 'quite a while' }],
    ])('never blanks a valid stored experience_level when the answer is %s', async (_case, rawData) => {
      primeDb([
        makeRow({ id: 'a', experience_level: '8-15', business_name: null, raw_data: rawData }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.experienceChanged).toBe(0);
      expect(result.needsUpdate).toBe(0);
      expect(updateCallCount()).toBe(0);
    });

    // The nastier half of the same defect: the row DOES get updated (for the
    // business name), and the UPDATE carries an experience_level assignment with
    // it. Guarding only `experienceDiffers` does not stop that write — what the
    // column is SET to has to be guarded too. Asserted end-to-end in the real-DB
    // smoke, where the stored value can actually be read back
    // (`marketplace-card-fields-db-smoke.integration.test.ts`); a mocked
    // `db.execute` can only see the SQL text, which names the column either way.
    it('counts no experience change when a row updates for the business name alone', async () => {
      primeDb([
        makeRow({
          id: 'a',
          experience_level: '8-15',
          business_name: null,
          raw_data: { business_name: 'Bola Motors' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.businessNameChanged).toBe(1);
      expect(result.experienceChanged).toBe(0);
      expect(result.updated).toBe(1);
    });

    it('still CORRECTS a legacy value when the answer does bucket', async () => {
      // The guard must not turn the backfill into a no-op: `4-7` holding a row
      // whose real answer was `7_10` is exactly what this exists to repair.
      primeDb([
        makeRow({ id: 'a', experience_level: '4-7', raw_data: { years_experience: '7_10' } }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.experienceChanged).toBe(1);
      expect(result.updated).toBe(1);
    });

    it('never blanks a business_name that is already stored', async () => {
      primeDb([
        makeRow({
          id: 'a',
          experience_level: 'over_10',
          business_name: 'Edited By Owner Ltd',
          // the LATEST submission carries no business_name; an earlier one did, and
          // the live worker stored it. "Absent here" is not "retracted".
          raw_data: { years_experience: 'over_10' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.businessNameChanged).toBe(0);
      expect(result.needsUpdate).toBe(0);
      expect(updateCallCount()).toBe(0);
    });
  });

  // [AI-Review][High] 2026-08-18 — the public marketplace's DEFAULT browse order is
  // `ORDER BY mp.updated_at DESC, mp.id DESC` and its pagination cursor is keyed on
  // the same column. Stamping updated_at in a data repair silently re-ranks every
  // card on the site, which no reader of this file would expect a backfill to do.
  describe('does not disturb the public marketplace ordering', () => {
    it('omits updated_at from the UPDATE — the row is repaired, not "updated"', async () => {
      primeDb([makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'over_10' } })]);

      await backfillMarketplaceCardFields({ apply: true });

      expect(updateCallCount()).toBe(1);
      const update = sqlTextOf(1);
      expect(update).toMatch(/UPDATE marketplace_profiles/);
      expect(update).toMatch(/experience_level =/);
      // The assertion that matters: no timestamp write, so browse order is stable.
      expect(update).not.toMatch(/updated_at/);
      expect(update).not.toMatch(/now\(\)/);
    });
  });

  // [AI-Review][Medium] 2026-08-18 — an unscoped apply rewrites every row in the
  // database it is pointed at. Tests must be able to fence themselves in.
  describe('scoping', () => {
    it('sweeps every row when no ids are given (the operator run)', async () => {
      primeDb([makeRow({ id: 'a' }), makeRow({ id: 'b' })]);

      const result = await backfillMarketplaceCardFields();

      expect(result.scanned).toBe(2);
      expect(sqlTextOf(0)).not.toMatch(/WHERE mp\.id IN/);
    });

    it('restricts the sweep to the given profile ids', async () => {
      primeDb([makeRow({ id: 'a' })]);

      await backfillMarketplaceCardFields({ profileIds: ['018e1234-5678-7000-8000-000000000001'] });

      // The guard is the SQL itself: a scope that never reaches the WHERE clause
      // would still return the mock's rows and look green.
      expect(sqlTextOf(0)).toMatch(/WHERE mp\.id IN \(/);
    });

    /**
     * ⚠️ [AI-Review][Medium] 2026-08-18 (re-review) — this test INVERTED. It used
     * to assert "ignores an empty id list rather than silently sweeping nothing",
     * i.e. `[]` fell through to the same unscoped branch as `undefined`.
     *
     * That preferred the wrong failure. Sweeping NOTHING is a visible no-op the
     * operator reads as `scanned=0`; sweeping EVERYTHING with `apply: true`
     * rewrites every marketplace profile in the target database — the exact "live
     * grenade" the scoping parameter was added to prevent, reached by the input
     * that looks most harmless (a filter that matched nothing, a seed that
     * returned no rows). `[]` now means "scope to nothing", `undefined` still
     * means "every row" for the operator's one-shot run.
     */
    it('treats an empty id list as scope-to-nothing, never as no-scope', async () => {
      primeDb([makeRow({ id: 'a' })]);

      const result = await backfillMarketplaceCardFields({ profileIds: [] });

      expect(result.scanned).toBe(0);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  // [AI-Review][Medium] 2026-08-18 — report-only. Nothing below changes a write.
  describe('self-named signboards are counted for the operator, never suppressed', () => {
    it('counts a business_name containing the respondent\'s own name', async () => {
      primeDb([
        makeRow({
          id: 'a',
          first_name: 'Adekemi',
          last_name: 'Ogunlade',
          raw_data: { years_experience: '1_3', business_name: 'Adekemi Fashion House' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.businessNameLikePersonName).toBe(1);
      // ...and it is still written. Counting is not censoring.
      expect(result.businessNameChanged).toBe(1);
      expect(result.updated).toBe(1);
    });

    it('does not count an ordinary trading name', async () => {
      primeDb([
        makeRow({
          id: 'a',
          first_name: 'Adekemi',
          last_name: 'Ogunlade',
          raw_data: { years_experience: '1_3', business_name: 'Sunrise Welders' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.businessNameLikePersonName).toBe(0);
    });

    it('counts a name already stored, not only one this run would write', async () => {
      primeDb([
        makeRow({
          id: 'a',
          experience_level: '1_3',
          business_name: 'Ogunlade & Sons Motors',
          first_name: 'Adekemi',
          last_name: 'Ogunlade',
          raw_data: { years_experience: '1_3' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true });

      expect(result.businessNameLikePersonName).toBe(1);
      expect(result.needsUpdate).toBe(0);
    });
  });

  /**
   * [AI-Review][Medium] 2026-08-18 (re-review). `profileIds: []` used to take the
   * SAME branch as `profileIds: undefined` — `scopeIds && scopeIds.length > 0` is
   * false for both — so a caller whose id list computed empty silently swept the
   * WHOLE table. With `apply: true` that is the "live grenade" the scoping
   * parameter exists to prevent, fired by the one input that looks safest.
   */
  describe('scoping — an empty id list means NOTHING, not everything', () => {
    it('scans and writes nothing for an empty profileIds, even in apply mode', async () => {
      primeDb([
        makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'over_10' } }),
        makeRow({ id: 'b', experience_level: null, raw_data: { years_experience: '1_3' } }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: [] });

      expect(result.scanned).toBe(0);
      expect(result.needsUpdate).toBe(0);
      expect(result.updated).toBe(0);
      // The strongest assertion: it never even reached the database.
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('still sweeps every row when profileIds is OMITTED (the operator run)', async () => {
      primeDb([
        makeRow({ id: 'a', experience_level: null, raw_data: { years_experience: 'over_10' } }),
        makeRow({ id: 'b', experience_level: null, raw_data: { years_experience: '1_3' } }),
      ]);

      const result = await backfillMarketplaceCardFields({});

      expect(result.scanned).toBe(2);
      expect(sqlTextOf(0)).not.toContain('WHERE mp.id IN');
    });

    it('scopes to exactly the ids given', async () => {
      primeDb([makeRow({ id: 'a', raw_data: { years_experience: 'over_10' } })]);

      await backfillMarketplaceCardFields({ profileIds: ['018e1234-5678-7000-8000-00000000000a'] });

      expect(sqlTextOf(0)).toContain('WHERE mp.id IN');
    });
  });

  /**
   * Story 13-58 — the profiles that already exist.
   *
   * The extraction worker is the go-forward write path for `association_name`, but it
   * only fires on a submission. Anyone who ALREADY holds a marketplace profile never
   * revisits it, so on prod today the eleven people the AFAN import matched carry the
   * vouch on their respondent row and a badge-less card — the fix would ship and fire
   * for nobody. This is the same catch-up this service already performs for the two
   * 13-38 fields, and for the same reason.
   */
  describe('association name catch-up (Story 13-58)', () => {
    it('adds the association name to a profile that has none', async () => {
      primeDb([makeRow({ id: 'a', association_name: null, respondent_association_name: 'AFAN' })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(1);
      expect(updateCallCount()).toBe(1);
    });

    it('counts nothing when the stored name already matches', async () => {
      primeDb([makeRow({ id: 'a', association_name: 'AFAN', respondent_association_name: 'AFAN' })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(0);
    });

    /**
     * ADD or CORRECT, never subtract — the rule this whole service is built on. A
     * respondent with no resolvable name must not blank a vouch already on the card:
     * the association made its claim, and this one-shot's silence is not a retraction.
     */
    it('never blanks a stored vouch when the respondent resolves no name', async () => {
      // `experience_level` matches its answer on purpose: with any other field
      // differing the row updates anyway, and this test would pass while proving
      // nothing about the vouch.
      primeDb([makeRow({
        id: 'a',
        experience_level: 'over_10',
        association_name: 'ASNAT',
        respondent_association_name: null,
      })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(0);
      expect(updateCallCount()).toBe(0);
    });

    it('treats a whitespace-only respondent name as no name at all', async () => {
      primeDb([makeRow({
        id: 'a',
        experience_level: 'over_10',
        association_name: null,
        respondent_association_name: '   ',
      })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(0);
      expect(updateCallCount()).toBe(0);
    });

    it('writes nothing in dry-run, the default', async () => {
      primeDb([makeRow({ id: 'a', association_name: null, respondent_association_name: 'AFAN' })]);

      const result = await backfillMarketplaceCardFields({ profileIds: ['a'] });

      expect(result.dryRun).toBe(true);
      expect(result.associationNameChanged).toBe(1);
      expect(result.updated).toBe(0);
      expect(updateCallCount()).toBe(0);
    });

    /**
     * The name is read from the RESPONDENT's metadata, which is where 13-67 wrote it —
     * not from `import_batches`, whose `source_description` is an operator note
     * ("...WhatsApp intake, 56 clean rows of 70"), and never from a source column.
     */
    it('reads the name from respondent metadata, not from the import batch', async () => {
      primeDb([makeRow({ id: 'a', association_name: null, respondent_association_name: 'AFAN' })]);

      await backfillMarketplaceCardFields({ profileIds: ['a'] });

      const selectSql = sqlTextOf(0);
      expect(selectSql).toContain('association_name');
      expect(selectSql).not.toContain('import_batches');
      expect(selectSql).not.toContain('source_description');
    });

    /**
     * A row picked up ONLY for its association name must not have its other two
     * columns rewritten from a recomputed value — the same per-field discipline the
     * experience/business-name pair already enforces on each other.
     */
    it('does not disturb experience or business name when only the vouch changes', async () => {
      primeDb([
        makeRow({
          id: 'a',
          experience_level: 'over_10',
          business_name: 'Bola Motors',
          association_name: null,
          respondent_association_name: 'AFAN',
          raw_data: { years_experience: 'over_10', business_name: 'Bola Motors' },
        }),
      ]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(1);
      expect(result.experienceChanged).toBe(0);
      expect(result.businessNameChanged).toBe(0);
      // [AI-Review][Low] 2026-09-08 — this used to assert the UPDATE text CONTAINS
      // 'association_name', which passes unconditionally: the statement names all
      // three columns on every write. Assert the BOUND VALUES instead — that the
      // two untouched columns carry their STORED values back, which is the actual
      // no-blanking claim and the thing that would break if the per-field ternaries
      // were replaced by the recomputed value.
      const updatePayload = sqlPayloadOf(1);
      expect(updatePayload).toContain('AFAN');
      expect(updatePayload).toContain('over_10');
      expect(updatePayload).toContain('Bola Motors');
    });

    /**
     * ⚠️ [AI-Review][High] 2026-09-08 — THE VOUCH DOES NOT DEPEND ON ANSWERS.
     *
     * The association block used to sit BELOW `if (!answers) { noAnswerSource++;
     * continue; }`, so a profile whose respondent has no submission raw_data and no
     * adopted answers had its vouch silently dropped — and not even counted, so the
     * operator's dry-run printed `association_name add/fixed 0` and read as a clean
     * sweep. `experience_level` and `business_name` are derived FROM answers;
     * `association_name` is read from the respondent's own metadata and is not.
     *
     * These rows are real: the import path wrote only the respondent until Story
     * 13-2 AC3.4 added the submission row (`import.service.ts:555-573`), so batches
     * predating that change carry a vouch and no answers at all.
     */
    it('backfills the vouch on a row with NO answer source at all', async () => {
      primeDb([makeRow({
        id: 'a',
        association_name: null,
        respondent_association_name: 'AFAN',
        raw_data: null,
        adopted_draft_answers: null,
      })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.associationNameChanged).toBe(1);
      expect(result.updated).toBe(1);
      // Still reported as answer-less: the guard was not deleted, it was moved
      // below the one field that never needed it.
      expect(result.noAnswerSource).toBe(1);
      // ...and the answer-derived fields stay untouched, because there was nothing
      // to derive them from.
      expect(result.experienceChanged).toBe(0);
      expect(result.businessNameChanged).toBe(0);
    });

    it('still skips an answer-less row that has no vouch either', async () => {
      primeDb([makeRow({
        id: 'a',
        association_name: null,
        respondent_association_name: null,
        raw_data: null,
        adopted_draft_answers: null,
      })]);

      const result = await backfillMarketplaceCardFields({ apply: true, profileIds: ['a'] });

      expect(result.noAnswerSource).toBe(1);
      expect(result.needsUpdate).toBe(0);
      expect(updateCallCount()).toBe(0);
    });
  });
});
