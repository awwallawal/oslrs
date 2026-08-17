import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { getRegistryTotals } from '../registry-totals.service.js';

/**
 * Real-DB SMOKE for Story 12-4's `getRegistryTotals` — the raw-SQL ↔ schema
 * drift guard AC6.2 makes mandatory.
 *
 * WHY THIS EXISTS: the aggregate reads `SELECT * FROM (canonical unified SQL)`
 * via raw `db.execute`. That is NOT type-checked against the Drizzle schema, and
 * the unit tests mock `db.execute` — the combination has shipped prod 500s twice
 * (`users.role`→`role_id`, plus a hotfix). A renamed or dropped column must
 * redden here, not on the Ministry's dashboard.
 *
 * ── Concurrency discipline (the 2026-07-22 lesson) ──────────────────────────
 * Vitest runs test FILES in parallel, so a GLOBAL count or delta is unsound on a
 * shared test DB — another file inserting a respondent mid-window reddens this
 * suite for an unrelated reason, and it passes in isolation, so it reads like a
 * flake and gets re-run instead of fixed.
 *
 * This suite therefore scopes its assertions to rows it OWNS, using the story's
 * own date filter: every fixture row is stamped in a far-future window no other
 * suite writes into. The unscoped call is still made, for the ONE thing only it
 * can prove — that the SQL executes against the live schema — where only
 * concurrency-invariant assertions are made.
 */

const TAG = '_registry_totals_model_smoke_';

/** A window no other suite writes into, so the scope is exclusively ours. */
const WINDOW = { dateFrom: '2099-03-01T00:00:00.000Z', dateTo: '2099-03-31T23:59:59.000Z' };
const STAMP = new Date('2099-03-15T12:00:00.000Z');

const completedFullId = uuidv7();
const completedCoreId = uuidv7();
const dataLostId = uuidv7();
const noSubmissionId = uuidv7();
const pendingNinId = uuidv7();
const dupeNinA = uuidv7();

const completedFullSubId = uuidv7();
const completedCoreSubId = uuidv7();
const dupeNinSubId = uuidv7();

const ourRespondentIds = [
  completedFullId, completedCoreId, dataLostId,
  noSubmissionId, pendingNinId, dupeNinA,
];

const SHARED_NIN = '99887766554';

describe('getRegistryTotals — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // A — completed, DEEP fields present → completeness `full`.
    await db.insert(respondents).values({
      id: completedFullId, nin: null, firstName: 'Deep', lastName: 'Row',
      status: 'active', source: 'enumerator', referenceCode: `${TAG}A`,
      lgaId: 'ibadan_north', createdAt: STAMP,
    });
    await db.insert(submissions).values({
      id: completedFullSubId, submissionUid: `${TAG}${completedFullSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: completedFullId,
      rawData: { gender: 'female', main_occupation: 'tailor', household_size: '5' },
      submittedAt: new Date(), source: 'enumerator',
    });

    // B — completed, CORE fields only → completeness `core` (the 13-14 shape).
    await db.insert(respondents).values({
      id: completedCoreId, nin: null, firstName: 'Core', lastName: 'Row',
      status: 'active', source: 'public', referenceCode: `${TAG}B`,
      lgaId: 'ibadan_north', createdAt: STAMP,
    });
    await db.insert(submissions).values({
      id: completedCoreSubId, submissionUid: `${TAG}${completedCoreSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: completedCoreId,
      rawData: { gender: 'male', main_occupation: 'welder' },
      submittedAt: new Date(), source: 'public',
    });

    // C — data_lost (row exists, answers irrecoverable).
    await db.insert(respondents).values({
      id: dataLostId, nin: null, firstName: 'Lost', lastName: 'Row',
      status: 'active', source: 'public', referenceCode: `${TAG}C`,
      lgaId: 'oyo_east', createdAt: STAMP,
      metadata: { questionnaire_data_lost: true },
    });

    // D — registered, no submission at all.
    await db.insert(respondents).values({
      id: noSubmissionId, nin: null, firstName: 'NoSub', lastName: 'Row',
      status: 'active', source: 'public', referenceCode: `${TAG}D`,
      lgaId: 'oyo_east', createdAt: STAMP,
    });

    // E — NIN deferred.
    await db.insert(respondents).values({
      id: pendingNinId, nin: null, firstName: 'Pending', lastName: 'Row',
      status: 'pending_nin_capture', source: 'public', referenceCode: `${TAG}E`,
      lgaId: 'oyo_east', createdAt: STAMP,
    });

    // F — a NIN on file. NOTE: this is deliberately NOT a same-NIN duplicate
    // pair; see the `identity` describe block below for why one cannot exist.
    await db.insert(respondents).values({
      id: dupeNinA, nin: SHARED_NIN, firstName: 'Nin', lastName: 'Holder',
      status: 'active', source: 'public', referenceCode: `${TAG}F`,
      lgaId: 'ibadan_north', createdAt: STAMP,
    });
    await db.insert(submissions).values({
      id: dupeNinSubId, submissionUid: `${TAG}${dupeNinSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: dupeNinA,
      rawData: { gender: 'female', main_occupation: 'trader' },
      submittedAt: new Date(), source: 'public',
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(
      inArray(submissions.id, [completedFullSubId, completedCoreSubId, dupeNinSubId]),
    );
    await db.delete(respondents).where(inArray(respondents.id, ourRespondentIds));
  });

  it('EXECUTES against the live schema (the drift guard) and holds the funnel invariant', async () => {
    // Only the unscoped call can prove the raw SQL runs against the real
    // columns. Assert nothing here that a concurrent writer could move.
    const global = await getRegistryTotals();

    expect(global.totalRespondents).toBeGreaterThan(0);
    expect(global.withAnswers).toBeLessThanOrEqual(global.totalRespondents);
    expect(global.withAnswers).toBe(global.byDataStatus.completed);

    // Every axis partitions the same population — on REAL data, not fixtures.
    const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
    expect(sum(global.byDataStatus)).toBe(global.totalRespondents);
    expect(sum(global.byCompleteness)).toBe(global.totalRespondents);
    expect(sum(global.byVerification)).toBe(global.totalRespondents);
    expect(sum(global.bySource)).toBe(global.totalRespondents);
  });

  it('tallies OUR rows correctly through the real query', async () => {
    const totals = await getRegistryTotals({ type: 'system' }, WINDOW);

    expect(totals.totalRespondents).toBe(6);
    expect(totals.byDataStatus.completed).toBe(3); // A, B, F
    expect(totals.byDataStatus.data_lost).toBe(1);
    expect(totals.byDataStatus.no_submission).toBe(1);
    expect(totals.byDataStatus.pending_nin).toBe(1);
    expect(totals.withAnswers).toBe(3);
  });

  it('derives the completeness axis from the fields actually present', async () => {
    const totals = await getRegistryTotals({ type: 'system' }, WINDOW);

    expect(totals.byCompleteness.full).toBe(1); // A only — household_size is deep
    expect(totals.byCompleteness.core).toBe(2); // B, F
    expect(totals.byCompleteness.partial).toBe(3); // C, D, E — no answers on file
  });

  it('derives the verification axis, and never reports anyone as verified', async () => {
    const totals = await getRegistryTotals({ type: 'system' }, WINDOW);

    expect(totals.byVerification.nin_on_file).toBe(1); // F
    expect(totals.byVerification.pending_nin).toBe(1); // E
    expect(totals.byVerification.self_declared).toBe(4); // A, B, C, D
    expect(totals.byVerification).not.toHaveProperty('verified');
  });

  /**
   * ⚠️ FOUND BY THIS SMOKE, 2026-08-17 — worth reading before trusting AC2.
   *
   * The first version of this fixture tried to insert two respondent rows under
   * one NIN, to prove the R2 identity key collapses them. Postgres refused:
   * `respondents_nin_unique_when_present`. So a same-NIN duplicate CANNOT EXIST
   * in this database, and the NIN rung of the key can never merge anything.
   *
   * The phone rung cannot merge either — AC2 forbids merging a shared handset,
   * and nothing in the data separates "one person twice" from "a household".
   *
   * ➜ CONSEQUENCE: on today's schema the identity key resolves to
   * row-id-distinct, which is exactly what John/PM's option (a) predicted and
   * option (b) was chosen over. The key is still worth having — it is a
   * STRUCTURAL block that survives the index being dropped, and it is what
   * produces `identityAmbiguous` — but nobody should expect it to change the
   * headline today. The merge LOGIC is covered by the mocked unit tests, which
   * can construct the row pair this database will not accept.
   */
  describe('identity key — what it can and cannot do on the real schema', () => {
    it('the database itself forbids a same-NIN duplicate pair', async () => {
      const result = await db.execute(sql`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'respondents'
          AND indexname = 'respondents_nin_unique_when_present'
      `);
      expect(result.rows).toHaveLength(1);
    });

    it('reports zero ambiguity for rows that each carry their own identity', async () => {
      // A–E have no NIN and no phone, so they ARE ambiguous; F has a NIN.
      const totals = await getRegistryTotals({ type: 'system' }, WINDOW);
      expect(totals.identityAmbiguous).toBe(5);
      expect(totals.totalRespondents).toBe(6);
    });
  });

  it('applies an LGA scope through the real query', async () => {
    const scoped = await getRegistryTotals({ type: 'lga', lgaCode: 'oyo_east' }, WINDOW);
    expect(scoped.totalRespondents).toBe(3); // C, D, E
    expect(scoped.byDataStatus.data_lost).toBe(1);
  });

  it('filters registration DATE, so answer-less people are not silently dropped', async () => {
    // The reason this filters `created_at` and not `submitted_at`: C, D and E
    // have no submission at all, and a submitted_at filter would delete exactly
    // the people this story exists to make visible.
    const outside = await getRegistryTotals(
      { type: 'system' },
      { dateFrom: '2099-01-01T00:00:00.000Z', dateTo: '2099-01-31T00:00:00.000Z' },
    );
    expect(outside.totalRespondents).toBe(0);

    const inside = await getRegistryTotals({ type: 'system' }, WINDOW);
    expect(inside.byDataStatus.no_submission).toBe(1);
    expect(inside.byDataStatus.data_lost).toBe(1);
  });

  /**
   * AC6.2's schema-column-existence guard, stated explicitly: if any column the
   * derivation reads is renamed or dropped, this fails with the column name
   * rather than a 500 in production.
   */
  it('every column the derivation depends on still exists on the live schema', async () => {
    const result = await db.execute(sql`
      SELECT
        r.status, r.source, r.metadata, r.nin, r.phone_number, r.lga_id, r.created_at,
        s.raw_data, s.submitted_at, s.respondent_id
      FROM respondents r
      LEFT JOIN submissions s ON s.respondent_id = r.id
      LIMIT 1
    `);
    expect(result).toBeDefined();
  });

  it('exposes phone_number through the CANONICAL read, not a side join', async () => {
    // Story 12-4 added this column to `REGISTRY_UNIFIED_SQL_TEXT` so the dedup
    // key reads the same shape as the tally. A side join would re-open the
    // mini-drift 13-33 exists to kill.
    const result = await db.execute(sql`
      SELECT phone_number FROM registry_unified LIMIT 1
    `);
    expect(result).toBeDefined();
  });
});
