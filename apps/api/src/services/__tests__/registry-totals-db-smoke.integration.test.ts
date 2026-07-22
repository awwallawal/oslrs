import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { getRegistryCountCore } from '../registry-totals.service.js';
import { countScopedRegistryRows } from '../../../test/registry-scoped-counts.js';

/**
 * Real-DB SMOKE for the 13-25 count-core (`getRegistryCountCore`).
 *
 * WHY THIS EXISTS: the count-core is raw `db.execute(sql\`… LEFT JOIN LATERAL …\`)`
 * — NOT type-checked against the Drizzle schema, and the unit tests mock
 * `db.execute`. That combination has shipped prod 500s before (the 2026-06-09
 * `users.role`→`role_id` analytics break; see the unified-export smoke). This
 * asserts the query EXECUTES against the real schema AND reproduces the
 * "139 ≠ 79" registry split: registered PEOPLE > the completed-survey subset.
 *
 * The count-core is GLOBAL (no scope filter — the whole registry IS the count),
 * so exact totals aren't deterministic against a shared test DB.
 *
 * ⚠️ Do NOT assert a global DELTA over a baseline captured in `beforeAll`
 * (`after.total - baseline.total === 4`). Vitest runs test FILES in parallel —
 * only the pre-push gate serialises them — so any other file inserting a
 * respondent in that window reddens this suite for a reason that has nothing to
 * do with the count-core, while passing in isolation (so it reads like
 * contention and gets re-run instead of fixed). Assert on the rows this suite
 * OWNS via `countScopedRegistryRows` (same canonical SQL the count-core reads),
 * and keep the global call only for what it uniquely proves: that the raw SQL
 * EXECUTES against the real schema, plus invariants no writer can break.
 *
 * The four structurally-distinct rows:
 *   A — completed           (one non-empty submission)        → +1 total, +1 answers
 *   B — no submission       (registered, answers not on file) → +1 total, +0 answers
 *   C — superseded          (old non-empty + newer EMPTY '{}') → +1 total, +1 answers
 *   D — empty-only          (one '{}' submission)             → +1 total, +0 answers
 * Expected over OUR rows: total 4, withAnswers 2.
 * C and D pin the two things the SQL must get right: latest-non-empty (not
 * latest) and the `<> '{}'` emptiness test (the `hasNonEmptyRawData` embodiment).
 */

const TAG = '_registry_totals_smoke_';

const completedId = uuidv7();
const noSubmissionId = uuidv7();
const supersededId = uuidv7();
const emptyOnlyId = uuidv7();

const completedSubId = uuidv7();
const supersededOldSubId = uuidv7();
const supersededNewSubId = uuidv7();
const emptyOnlySubId = uuidv7();

const ourRespondentIds = [completedId, noSubmissionId, supersededId, emptyOnlyId];

describe('getRegistryCountCore — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // A — completed.
    await db.insert(respondents).values({
      id: completedId, nin: null, firstName: 'Completed', lastName: 'Person',
      status: 'active', source: 'public', referenceCode: `${TAG}A`,
    });
    await db.insert(submissions).values({
      id: completedSubId, submissionUid: `${TAG}${completedSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: completedId,
      rawData: { employment_status: 'employed', dob: '1990-01-01' },
      submittedAt: new Date(), source: 'public',
    });

    // B — registered, no submission at all.
    await db.insert(respondents).values({
      id: noSubmissionId, nin: null, firstName: 'NoSub', lastName: 'Person',
      status: 'active', source: 'enumerator', referenceCode: `${TAG}B`,
    });

    // C — superseded: older non-empty, newer EMPTY correction. Latest-non-empty
    //     must win → counts as with-answers.
    await db.insert(respondents).values({
      id: supersededId, nin: null, firstName: 'Superseded', lastName: 'Person',
      status: 'active', source: 'public', referenceCode: `${TAG}C`,
    });
    await db.insert(submissions).values({
      id: supersededOldSubId, submissionUid: `${TAG}${supersededOldSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: supersededId,
      rawData: { employment_status: 'self_employed', dob: '1980-01-01' },
      submittedAt: new Date('2026-05-01T00:00:00.000Z'), source: 'public',
    });
    await db.insert(submissions).values({
      id: supersededNewSubId, submissionUid: `${TAG}${supersededNewSubId}`,
      questionnaireFormId: 'smoke-form', respondentId: supersededId,
      rawData: {}, submittedAt: new Date('2026-06-01T00:00:00.000Z'), source: 'public',
    });

    // D — a single EMPTY '{}' submission → NOT with-answers.
    await db.insert(respondents).values({
      id: emptyOnlyId, nin: null, firstName: 'EmptyOnly', lastName: 'Person',
      status: 'active', source: 'public', referenceCode: `${TAG}D`,
    });
    await db.insert(submissions).values({
      id: emptyOnlySubId, submissionUid: `${TAG}${emptyOnlySubId}`,
      questionnaireFormId: 'smoke-form', respondentId: emptyOnlyId,
      rawData: {}, submittedAt: new Date(), source: 'public',
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(inArray(submissions.id, [
      completedSubId, supersededOldSubId, supersededNewSubId, emptyOnlySubId,
    ]));
    await db.delete(respondents).where(inArray(respondents.id, [
      completedId, noSubmissionId, supersededId, emptyOnlyId,
    ]));
  });

  it('executes against the real schema and reproduces the registered > with-answers split', async () => {
    // What ONLY the global call can prove: the raw LATERAL SQL executes against
    // the live schema (the drift guard this suite exists for). Assert just the
    // funnel invariant on it — B and D are registered-without-answers, so the
    // strict inequality holds no matter what any concurrent writer adds.
    const global = await getRegistryCountCore();
    expect(global.withAnswers).toBeLessThan(global.totalRespondents);

    // The semantics (A/B/C/D) are asserted over the rows we OWN, through the
    // SAME canonical source the count-core reads — concurrency-invariant.
    const ours = await countScopedRegistryRows(ourRespondentIds);
    expect(ours.total).toBe(4); // 4 registered people, one row each
    expect(ours.withAnswers).toBe(2); // A + C (latest-NON-EMPTY wins for C; D's '{}' doesn't count)
  });
});
