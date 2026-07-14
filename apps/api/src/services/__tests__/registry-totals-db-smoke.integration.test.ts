import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { getRegistryCountCore, type RegistryCountCore } from '../registry-totals.service.js';

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
 * so exact totals aren't deterministic against a shared test DB. Instead we
 * capture a baseline, insert a known 4-respondent split, and assert the DELTA.
 * The project runs integration suites serially (pre-push `--concurrency=1`,
 * Pitfall #37), so the delta is stable.
 *
 * The four structurally-distinct rows:
 *   A — completed           (one non-empty submission)        → +1 total, +1 answers
 *   B — no submission       (registered, answers not on file) → +1 total, +0 answers
 *   C — superseded          (old non-empty + newer EMPTY '{}') → +1 total, +1 answers
 *   D — empty-only          (one '{}' submission)             → +1 total, +0 answers
 * Expected delta: totalRespondents +4, withAnswers +2.
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

let baseline: RegistryCountCore;

describe('getRegistryCountCore — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // Capture the baseline BEFORE inserting our synthetic split.
    baseline = await getRegistryCountCore();

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
    const after = await getRegistryCountCore();

    // +4 registered people, +2 with complete survey responses.
    expect(after.totalRespondents - baseline.totalRespondents).toBe(4);
    expect(after.withAnswers - baseline.withAnswers).toBe(2);

    // The funnel invariant: with-answers is a strict subset of registered.
    expect(after.withAnswers).toBeLessThan(after.totalRespondents);
  });
});
