/**
 * Story 13-71 AC5 / AC6 — accuracy and the unavailable-reason reach their COLUMNS.
 *
 * ⛔ WHY THIS IS A REAL-DB TEST AND NOT A MOCK. The sibling
 * `webhook-ingestion.worker.test.ts` mocks `db.insert` and asserts on the values
 * object the worker builds. That is a fine test of the worker's arithmetic and a
 * useless test of this story's claim: the two columns being added here did not
 * exist an hour ago, and a mocked insert accepts a key that no column backs
 * exactly as readily as one that does. The defect class in this path has always
 * been AT THE STORAGE BOUNDARY (13-2 R-A2: a `''` enumerator id, a NOT NULL
 * column, a uuid cast on a TEXT sentinel — every one invisible to a mocked
 * insert). So every assertion below reads the row back out of PostgreSQL by
 * column name. [[pattern-a-record-about-the-work-is-not-the-work]]
 *
 * ⭐ AND IT READS THE COLUMN, NOT `raw_data`. Both values also travel in
 * `raw_data` as `_gpsAccuracy` / `_gpsUnavailableReason`, so an assertion on the
 * stored JSON would pass even if the column write were deleted entirely — which
 * is precisely the fix-that-never-fires shape. `SELECT gps_accuracy,
 * gps_unavailable_reason` is the only phrasing of this test that can fail for the
 * right reason. [[pattern-ship-a-fix-that-never-fires]]
 *
 * AC6's "countable per enumerator" is asserted too: a `GROUP BY
 * gps_unavailable_reason` is the weekly ops read's whole purpose, and it is the
 * thing a jsonb key could not have given without a scan.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';

/*
 * Mock ONLY the transport. The BullMQ `Worker` is constructed at module import
 * time, so this captures the processor and lets it be invoked directly while the
 * database stays entirely real.
 */
let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock('bullmq', () => ({
  Worker: class MockWorker {
    constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
      capturedProcessor = processor;
    }
    on() { return this; }
    isRunning() { return true; }
    close() { return Promise.resolve(); }
  },
  Job: class MockJob {},
  Queue: class MockQueue {
    constructor(public name: string) {}
    add(_jobName: string, _data: unknown, opts?: { jobId?: string }) {
      return Promise.resolve({ id: opts?.jobId ?? 'mock-job' });
    }
    close() { return Promise.resolve(); }
  },
}));

vi.mock('../../lib/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/redis.js')>();
  return { ...actual, createRedisConnection: () => ({}) };
});

/*
 * Respondent extraction is a different story's concern and needs a whole
 * respondent to succeed. Stub it so this file tests exactly one thing: that the
 * INSERT the worker performs lands these two columns. The insert happens before
 * processing is called, so stubbing it removes noise without removing the claim.
 */
/*
 * ⚠️ A PLAIN FUNCTION, NOT `vi.fn().mockResolvedValue(...)`. This package's vitest
 * config sets `mockReset: true`, which clears a factory-preset return value before
 * EVERY test — the stub then resolves `undefined` and the worker dies reading
 * `result.respondentId`. Observed here on the first run.
 * [[pitfall-vitest-from-repo-root-skips-mockreset]] is the same setting seen from
 * the other side.
 */
vi.mock('../../services/submission-processing.service.js', () => ({
  SubmissionProcessingService: {
    processSubmission: async () => ({ respondentId: null, action: 'created' }),
  },
  PermanentProcessingError: class PermanentProcessingError extends Error {},
  RESPONDENT_FIELD_MAP: {},
}));

await import('../webhook-ingestion.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const runWorker = capturedProcessor;

const TAG = `s1371-gps-${Date.now()}`;
let formId = '';
let userId = '';

/** Feed the worker one job, exactly as the queue would. */
async function ingest(uid: string, rawData: Record<string, unknown>) {
  await runWorker({
    id: `job-${uid}`,
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      submissionUid: uid,
      questionnaireFormId: formId,
      source: 'enumerator',
      submittedAt: new Date().toISOString(),
      submitterId: null,
      rawData,
    },
  });
}

/** Read the row back BY COLUMN. Nothing here trusts the worker's return value. */
async function storedRow(uid: string) {
  const { rows } = (await db.execute(sql`
    SELECT gps_latitude, gps_longitude, gps_accuracy, gps_unavailable_reason, raw_data
    FROM submissions WHERE submission_uid = ${uid}
  `)) as {
    rows: Array<{
      gps_latitude: number | null;
      gps_longitude: number | null;
      gps_accuracy: number | null;
      gps_unavailable_reason: string | null;
      raw_data: Record<string, unknown> | null;
    }>;
  };
  expect(rows, `no submission row stored for ${uid}`).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  // `questionnaire_forms.uploaded_by` is NOT NULL, so the form needs an owner.
  // The role is NAMED rather than `LIMIT 1` — on this database an unnamed pick
  // can hand back `PERF_USER`, and a fixture that quietly changes identity is
  // how a test stops describing the row production actually writes.
  const users = (await db.execute(sql`
    INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
    SELECT gen_random_uuid(), ${`${TAG}@test.local`}, ${`${TAG} enumerator`}, r.id, 'active', 'local', now(), now()
    FROM roles r WHERE r.name = 'enumerator'
    RETURNING id
  `)) as { rows: Array<{ id: string }> };
  expect(users.rows[0], 'no `enumerator` role in this database — the seed did not run').toBeDefined();
  userId = users.rows[0].id;

  const forms = (await db.execute(sql`
    INSERT INTO questionnaire_forms (id, form_id, version, title, status, file_hash, file_name,
                                     file_size, mime_type, form_schema, is_native, uploaded_by,
                                     created_at, updated_at)
    VALUES (gen_random_uuid(), ${TAG}, '1.0.0', ${`${TAG} form`}, 'published',
            ${TAG}, 'fixture.xlsx', 1, 'application/vnd.ms-excel',
            ${JSON.stringify({ sections: [], choiceLists: {} })}::jsonb, true, ${userId}::uuid,
            now(), now())
    RETURNING id
  `)) as { rows: Array<{ id: string }> };
  formId = forms.rows[0].id;
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM submissions WHERE submission_uid LIKE ${`${TAG}-%`}`);
  await db.execute(sql`DELETE FROM questionnaire_forms WHERE form_id = ${TAG}`);
  await db.execute(sql`DELETE FROM users WHERE email = ${`${TAG}@test.local`}`);
});

describe('13-71 AC5/AC6 — gps_accuracy and gps_unavailable_reason are COLUMNS', () => {
  it('AC5: a capture carrying accuracy reads back from gps_accuracy, not only raw_data', async () => {
    const uid = `${TAG}-accuracy`;
    await ingest(uid, {
      gender: 'female',
      _gpsLatitude: 7.3775,
      _gpsLongitude: 3.947,
      _gpsAccuracy: 12.5,
    });

    const row = await storedRow(uid);
    // The claim: THE COLUMN holds it.
    expect(row.gps_accuracy).toBe(12.5);
    // And the coordinates it qualifies are there too — an accuracy with no
    // position to be accurate about would be meaningless.
    expect(row.gps_latitude).toBe(7.3775);
    expect(row.gps_longitude).toBe(3.947);
    // No reason: this submission HAS a position.
    expect(row.gps_unavailable_reason).toBeNull();
  });

  it('AC6: a refusal carrying a reason reads back from gps_unavailable_reason, with no coordinates', async () => {
    const uid = `${TAG}-reason`;
    await ingest(uid, {
      gender: 'male',
      _gpsUnavailableReason: 'permission_denied',
    });

    const row = await storedRow(uid);
    expect(row.gps_unavailable_reason).toBe('permission_denied');
    // ⭐ This is the row that was INVISIBLE before this story: "did not tap" and
    // "tapped and was refused" were the same absent value.
    expect(row.gps_latitude).toBeNull();
    expect(row.gps_longitude).toBeNull();
    expect(row.gps_accuracy).toBeNull();
  });

  it('AC6: reasons are GROUP-BY-able per enumerator — the point of a column over a jsonb key', async () => {
    await ingest(`${TAG}-grp1`, { _gpsUnavailableReason: 'permission_denied' });
    await ingest(`${TAG}-grp2`, { _gpsUnavailableReason: 'timeout' });
    await ingest(`${TAG}-grp3`, { _gpsUnavailableReason: 'permission_denied' });

    // The suffix is `-grp` and NOT `-r`: a `-r%` pattern also matches the
    // `-reason` row seeded by the test above, which made this count 3 instead of
    // 2 on its first run. A run-unique TAG does not save you from a prefix that
    // is itself a prefix of another fixture.
    const { rows } = (await db.execute(sql`
      SELECT gps_unavailable_reason AS reason, COUNT(*)::int AS n
      FROM submissions
      WHERE submission_uid LIKE ${`${TAG}-grp%`}
      GROUP BY gps_unavailable_reason
      ORDER BY n DESC
    `)) as { rows: Array<{ reason: string; n: number }> };

    expect(rows).toEqual([
      { reason: 'permission_denied', n: 2 },
      { reason: 'timeout', n: 1 },
    ]);
  });

  it('a non-numeric accuracy lands as NULL, never as NaN in a double precision column', async () => {
    const uid = `${TAG}-nan`;
    await ingest(uid, { _gpsAccuracy: 'not-a-number' });

    const row = await storedRow(uid);
    expect(row.gps_accuracy).toBeNull();
  });

  /*
   * ⛔ ADVERSARIAL REVIEW R6 — THE COLUMN IS VALIDATED AT THE STORAGE BOUNDARY.
   *
   * The worker used to pass `_gpsUnavailableReason` through on the strength of a
   * comment claiming the controller's zod enum had already constrained it. It had
   * not: `responses` is `z.record(z.unknown())`, so a reason carried in the ANSWERS
   * reached `rawData` untouched. This exact test, run against the code before the
   * fix, stored `"i-invented-this-value"` in the column.
   *
   * ⭐ The check has to live HERE as well as at the controller, because this is
   * where the write happens and the controller is only one producer — 13-72's
   * re-enqueue builds `rawData` itself and never passes through that zod schema.
   */
  it('R6: an unrecognised reason is dropped to NULL, never stored as free text', async () => {
    const uid = `${TAG}-bogus`;
    await ingest(uid, { gender: 'female', _gpsUnavailableReason: 'i-invented-this-value' });

    const row = await storedRow(uid);
    // ⭐ NULL, not the string. An ungroupable bucket is worse than an absent one:
    // AC6's whole promise is that this column answers a GROUP BY.
    expect(row.gps_unavailable_reason).toBeNull();
    // And it is still visible in raw_data for forensics — dropped from the column,
    // not erased from the record.
    expect(row.raw_data?._gpsUnavailableReason).toBe('i-invented-this-value');
  });

  it('R6: every value in the shared vocabulary IS accepted — the guard is not a wall', async () => {
    for (const reason of ['permission_denied', 'position_unavailable', 'timeout', 'unsupported', 'other']) {
      const uid = `${TAG}-vocab-${reason}`;
      await ingest(uid, { _gpsUnavailableReason: reason });
      const row = await storedRow(uid);
      expect(row.gps_unavailable_reason, `vocabulary member ${reason} was rejected`).toBe(reason);
    }
  });

  it('R6: a NEGATIVE accuracy lands as NULL — a radius is a distance', async () => {
    const uid = `${TAG}-negacc`;
    await ingest(uid, { _gpsAccuracy: -9999 });

    const row = await storedRow(uid);
    expect(row.gps_accuracy).toBeNull();
  });

  /**
   * ⛔ ULTRA REVIEW U11 — THE GATE AND THIS WRITE DISAGREED ABOUT WHERE A POSITION LIVES.
   *
   * `assertGeopointCaptured` accepts a submission whose position is in the geopoint
   * ANSWER, and nothing here read that answer. Such a row PASSED the requirement
   * and then landed with NULL coordinates AND NULL reason — straight into R5's
   * `unexplained` bucket, which is defined as the state the requirement makes
   * unreachable. The gate was reporting coverage the column could not show.
   */
  it('U11: a position living only in the ANSWER still reaches the columns', async () => {
    const uid = `${TAG}-answeronly`;
    await ingest(uid, {
      gender: 'female',
      // No `_gpsLatitude` envelope key at all — only the geopoint answer.
      site_location: { latitude: 7.2, longitude: 3.8, accuracy: 6 },
    });

    const row = await storedRow(uid);
    expect(row.gps_latitude).toBe(7.2);
    expect(row.gps_longitude).toBe(3.8);
    expect(row.gps_accuracy).toBe(6);
    expect(row.gps_unavailable_reason).toBeNull();
  });

  it('U11: the validated ENVELOPE still wins over an answer', async () => {
    const uid = `${TAG}-envelopewins`;
    await ingest(uid, {
      _gpsLatitude: 1.5,
      _gpsLongitude: 2.5,
      site_location: { latitude: 9.9, longitude: 9.9, accuracy: 1 },
    });

    const row = await storedRow(uid);
    expect(row.gps_latitude).toBe(1.5);
    expect(row.gps_longitude).toBe(2.5);
  });

  it('U11: the OPEN-TIME capture is metadata and is never read as the position', async () => {
    // `_gpsOpenCapture` records where the interview STARTED (AC2). Treating it as
    // the submitted position would file the wrong coordinate for every row whose
    // answer went missing.
    const uid = `${TAG}-opencapture`;
    await ingest(uid, { _gpsOpenCapture: { latitude: 5.5, longitude: 5.5, accuracy: 2 } });

    const row = await storedRow(uid);
    expect(row.gps_latitude).toBeNull();
  });

  it('a legacy payload with neither key stores NULL in both — nothing is invented', async () => {
    const uid = `${TAG}-legacy`;
    await ingest(uid, { gender: 'female' });

    const row = await storedRow(uid);
    expect(row.gps_accuracy).toBeNull();
    expect(row.gps_unavailable_reason).toBeNull();
  });
});
