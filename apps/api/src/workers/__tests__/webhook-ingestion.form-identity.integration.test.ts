/**
 * Story 13-73 AC5 — the form IDENTITY is snapshot onto the submission, and it
 * reads back FROM THE COLUMNS.
 *
 * ⭐ WHY. The `questionnaire_forms` row was the only record of what a submission
 * was answered against, and deleting it orphaned 283 submissions across 5 form ids
 * (measured 2026-09-18). `form_id_logical` + `form_version` are copied at insert so
 * the identity survives the row.
 *
 * ⛔ REAL DATABASE, READ BACK BY COLUMN NAME — for the reason the sibling
 * `webhook-ingestion.gps-columns.integration.test.ts` gives: a mocked insert
 * accepts a key no column backs as readily as one that does. The defect class in
 * this path lives at the storage boundary [[pattern-a-record-about-the-work-is-not-the-work]].
 *
 * ⛔ AND THE DECISIVE CASE IS THE DELETE. The first test snapshots, DELETES the
 * form row, and reads the identity back from the submission alone — which is the
 * whole claim of AC5, and the one thing no earlier row in production could do.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../../db/index.js';
import { ensureRoles } from '../../__tests__/helpers/ensure-roles.js'; // 13-73 R4

/* Mock ONLY the transport; the database stays entirely real (see the gps-columns sibling). */
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
 * Respondent extraction is another story's concern; the INSERT this file tests
 * happens before it. ⚠️ A PLAIN FUNCTION, not `vi.fn().mockResolvedValue` — this
 * package sets `mockReset: true`, which would clear a factory-preset value.
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

const { snapshotFormIdentity } = await import('../../services/form-identity.js');

const TAG = `s1373-fid-${Date.now()}`;
let userId = '';

async function makeForm(logical: string, version: string): Promise<string> {
  const { rows } = (await db.execute(sql`
    INSERT INTO questionnaire_forms (id, form_id, version, title, status, file_hash, file_name,
                                     file_size, mime_type, form_schema, is_native, uploaded_by,
                                     created_at, updated_at)
    VALUES (gen_random_uuid(), ${logical}, ${version}, ${`${TAG} form`}, 'published',
            ${`${logical}-${version}`}, 'fixture.xlsx', 1, 'application/vnd.ms-excel',
            ${JSON.stringify({ sections: [], choiceLists: {} })}::jsonb, true, ${userId}::uuid,
            now(), now())
    RETURNING id
  `)) as { rows: Array<{ id: string }> };
  return rows[0].id;
}

/** Feed the worker one job, exactly as the queue would. */
async function ingest(uid: string, questionnaireFormId: string) {
  await runWorker({
    id: `job-${uid}`,
    attemptsMade: 0,
    opts: { attempts: 3 },
    data: {
      submissionUid: uid,
      questionnaireFormId,
      source: 'enumerator',
      submittedAt: new Date().toISOString(),
      submitterId: null,
      rawData: { gender: 'female' },
    },
  });
}

/** Read the row back BY COLUMN. Nothing here trusts the worker's return value. */
async function storedIdentity(uid: string) {
  const { rows } = (await db.execute(sql`
    SELECT questionnaire_form_id, form_id_logical, form_version
    FROM submissions WHERE submission_uid = ${uid}
  `)) as { rows: Array<{ questionnaire_form_id: string; form_id_logical: string | null; form_version: string | null }> };
  expect(rows, `no submission row stored for ${uid}`).toHaveLength(1);
  return rows[0];
}

beforeAll(async () => {
  await ensureRoles('enumerator'); // 13-73 R4 — see the helper for why
  const users = (await db.execute(sql`
    INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
    SELECT gen_random_uuid(), ${`${TAG}@test.local`}, ${`${TAG} enumerator`}, r.id, 'active', 'local', now(), now()
    FROM roles r WHERE r.name = 'enumerator'
    RETURNING id
  `)) as { rows: Array<{ id: string }> };
  expect(users.rows[0], 'no `enumerator` role in this database — the seed did not run').toBeDefined();
  userId = users.rows[0].id;
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM submissions WHERE submission_uid LIKE ${`${TAG}-%`}`);
  await db.execute(sql`DELETE FROM questionnaire_forms WHERE form_id LIKE ${`${TAG}%`}`);
  await db.execute(sql`DELETE FROM users WHERE email = ${`${TAG}@test.local`}`);
});

describe('13-73 AC5 — form_id_logical + form_version are written at insert', () => {
  it('snapshots the identity, and it SURVIVES the form row being deleted', async () => {
    const logical = `${TAG}-master`;
    const formRowId = await makeForm(logical, 'v2026012601');
    const uid = `${TAG}-survives`;

    await ingest(uid, formRowId);
    expect(await storedIdentity(uid)).toEqual({
      questionnaire_form_id: formRowId,
      form_id_logical: logical,
      form_version: 'v2026012601',
    });

    // The mechanism that orphaned 283 rows on prod, applied directly (AC4 now
    // refuses it through the service — this bypasses the service on purpose).
    await db.execute(sql`DELETE FROM questionnaire_forms WHERE id = ${formRowId}::uuid`);

    const after = await storedIdentity(uid);
    expect(after.form_id_logical).toBe(logical);
    expect(after.form_version).toBe('v2026012601');
  });

  it('writes NULLs, and still stores the row, when the form row is ALREADY gone at insert', async () => {
    // A well-formed UUID naming no row — a submission arriving against a deleted
    // form, which is exactly what was measured on prod before AC4 existed.
    const uid = `${TAG}-already-gone`;
    const missing = randomUUID();

    await ingest(uid, missing);

    expect(await storedIdentity(uid)).toEqual({
      questionnaire_form_id: missing,
      form_id_logical: null,
      form_version: null,
    });
  });

  it('writes NULLs for a sentinel form id, which names a channel rather than a form', async () => {
    const uid = `${TAG}-sentinel`;
    await ingest(uid, 'self-edit');

    const row = await storedIdentity(uid);
    expect(row.form_id_logical).toBeNull();
    expect(row.form_version).toBeNull();
  });
});

describe('13-73 AC5 — snapshotFormIdentity against the real table', () => {
  it('resolves a live form row to its logical id + version', async () => {
    const formRowId = await makeForm(`${TAG}-direct`, '1.2.3');
    expect(await snapshotFormIdentity(formRowId)).toEqual({ formIdLogical: `${TAG}-direct`, formVersion: '1.2.3' });
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['an import sentinel', 'import:imported_association'],
    ['a missing row', randomUUID()],
  ])('resolves %s to nulls without throwing', async (_label, id) => {
    expect(await snapshotFormIdentity(id)).toEqual({ formIdLogical: null, formVersion: null });
  });
});

/*
 * 13-73 CODE REVIEW — INSIDE THE WIZARD'S TRANSACTION.
 *
 * The wizard calls the snapshot while holding a pooled connection for its
 * `db.transaction`. Reading through `db` there asks the pool (max 20,
 * connectionTimeoutMillis 2000 — db/index.ts) for a SECOND connection while the
 * first is held: 20 concurrent registrations hold all 20 and each waits 2 s for a
 * 21st, then every snapshot fails open to NULL — and every other pool user (the
 * in-process BullMQ workers included) is starved for those 2 s. So the lookup runs
 * on the caller's connection, inside a SAVEPOINT: a failure rolls back to the
 * savepoint and the registration's transaction carries on — which is the property
 * the `db` read was there to protect.
 */
describe('13-73 AC5 — inside a caller\'s transaction (code review)', () => {
  it('uses the CALLER\'S connection — no second pool checkout while the caller holds one', async () => {
    const formRowId = await makeForm(`${TAG}-intx`, '4.5.6');
    let acquired = 0;
    const onAcquire = () => { acquired++; };
    pool.on('acquire', onAcquire);
    try {
      const snap = await db.transaction(async (tx) => {
        const before = acquired;
        const s = await snapshotFormIdentity(formRowId, tx);
        expect(acquired - before, 'the snapshot checked out a SECOND pool connection mid-transaction').toBe(0);
        return s;
      });
      expect(snap).toEqual({ formIdLogical: `${TAG}-intx`, formVersion: '4.5.6' });
    } finally {
      pool.off('acquire', onAcquire);
    }
  });

  it('a FAILED lookup fails open WITHOUT aborting the caller\'s transaction', async () => {
    const formRowId = await makeForm(`${TAG}-locked`, '7.8.9');
    // Another session holds the table; the caller's lock_timeout makes the lookup FAIL.
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('LOCK TABLE questionnaire_forms IN ACCESS EXCLUSIVE MODE');
      const after = await db.transaction(async (tx) => {
        await tx.execute(sql`SET LOCAL lock_timeout = '200ms'`);
        const s = await snapshotFormIdentity(formRowId, tx);
        expect(s).toEqual({ formIdLogical: null, formVersion: null });
        // Had the failure escaped the savepoint, PostgreSQL would now refuse this with
        // "current transaction is aborted, commands ignored until end of transaction block".
        const { rows } = (await tx.execute(sql`SELECT 1 AS ok`)) as { rows: Array<{ ok: number }> };
        return rows[0].ok;
      });
      expect(after).toBe(1);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
});
