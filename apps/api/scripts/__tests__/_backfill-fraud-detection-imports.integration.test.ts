/**
 * Story 13-2 R-A2 review (2026-09-13) — the fraud enqueue script, AGAINST A REAL DATABASE.
 *
 * ⭐ WHY THIS EXISTS. The unit sibling reads the emitted SQL text, which proves the
 * predicate was WRITTEN. It cannot prove the selection picks the right SUBMISSION
 * or that the dry-run's numbers reconcile — and those are what the operator predicts
 * against before a run over 8,278 people. The review found both wrong in the
 * original: the counts double-subtracted overlapping exclusions, and the selection
 * would have taken a later FIELD submission instead of the import row.
 *
 * Every assertion is scoped to this run's own import batch (`--batch-id`), so the
 * numbers are exact even on a test DB shared with other suites.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db/index.js';
import { fetchCandidates, fetchCohortCounts } from '../_backfill-fraud-detection-imports.js';

const TAG = `ra2fdi-${Date.now()}`;
const ids: Record<string, string> = {};

interface Seed {
  key: string;
  status: string;
  importSubmission: boolean;
  laterFieldSubmission: boolean;
  alreadyScored: boolean;
}

/**
 * One row per bucket, plus the case that motivated the submission filter: a person
 * on the roll who later gained a FIELD submission on the same respondent row.
 */
const SEEDS: Seed[] = [
  { key: 'selectable', status: 'imported_unverified', importSubmission: true, laterFieldSubmission: false, alreadyScored: false },
  { key: 'merged-later', status: 'imported_unverified', importSubmission: true, laterFieldSubmission: true, alreadyScored: false },
  { key: 'scored', status: 'imported_unverified', importSubmission: true, laterFieldSubmission: false, alreadyScored: true },
  { key: 'rolled-back-no-sub', status: 'rolled_back', importSubmission: false, laterFieldSubmission: false, alreadyScored: false },
  { key: 'field-only', status: 'imported_unverified', importSubmission: false, laterFieldSubmission: true, alreadyScored: false },
];

async function insertSubmission(respondentId: string, uid: string, formId: string, submittedAt: string): Promise<string> {
  const [s] = (await db.execute(sql`
    INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                             raw_data, submitted_at, ingested_at, created_at, updated_at)
    VALUES (gen_random_uuid(), ${respondentId}::uuid, ${uid}, ${formId},
            ${JSON.stringify({ skills_possessed: ['farming'] })}::jsonb, ${submittedAt}::timestamptz, now(), now(), now())
    RETURNING id
  `) as { rows: Array<{ id: string }> }).rows;
  return s.id;
}

beforeAll(async () => {
  const [u] = (await db.execute(sql`
    INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
    SELECT gen_random_uuid(), ${`${TAG}@test.local`}, ${`${TAG} uploader`}, r.id, 'active', 'local', now(), now()
    FROM roles r LIMIT 1
    RETURNING id
  `) as { rows: Array<{ id: string }> }).rows;
  ids.uploader = u.id;

  const [b] = (await db.execute(sql`
    INSERT INTO import_batches (id, source, original_filename, file_hash, file_size_bytes,
                                parser_used, lawful_basis, uploaded_by)
    VALUES (gen_random_uuid(), 'imported_association', ${`${TAG}.csv`}, ${TAG}, 1,
            'csv', 'public_interest', ${ids.uploader}::uuid)
    RETURNING id
  `) as { rows: Array<{ id: string }> }).rows;
  ids.batch = b.id;

  for (const seed of SEEDS) {
    const [r] = (await db.execute(sql`
      INSERT INTO respondents (id, first_name, last_name, source, status, consent_marketplace,
                               import_batch_id, created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${TAG}-${seed.key}`}, 'Test', 'imported_association', ${seed.status},
              true, ${ids.batch}::uuid, now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;
    ids[`resp-${seed.key}`] = r.id;

    if (seed.importSubmission) {
      ids[`import-sub-${seed.key}`] = await insertSubmission(
        r.id, `${TAG}-${seed.key}-import`, 'import:imported_association', '2026-09-01T00:00:00Z',
      );
    }
    if (seed.laterFieldSubmission) {
      // NEWER than the import row — the old predicate's "most recent" would pick this.
      ids[`field-sub-${seed.key}`] = await insertSubmission(
        r.id, `${TAG}-${seed.key}-field`, '00000000-0000-4000-8000-000000000001', '2026-09-10T00:00:00Z',
      );
    }
    if (seed.alreadyScored) {
      await db.execute(sql`
        INSERT INTO fraud_detections (id, submission_id, import_batch_id, config_snapshot_version,
                                      gps_score, speed_score, straightline_score, duplicate_score,
                                      timing_score, total_score, severity, computed_at)
        VALUES (gen_random_uuid(), ${ids[`import-sub-${seed.key}`]}::uuid, ${ids.batch}::uuid, 1,
                0, 0, 0, 0, 0, 0, 'clean', now())
      `);
    }
  }
});

afterAll(async () => {
  await db.execute(sql`DELETE FROM fraud_detections WHERE import_batch_id = ${ids.batch}::uuid`);
  await db.execute(sql`
    DELETE FROM submissions WHERE respondent_id IN
      (SELECT id FROM respondents WHERE import_batch_id = ${ids.batch}::uuid)
  `);
  await db.execute(sql`DELETE FROM respondents WHERE import_batch_id = ${ids.batch}::uuid`);
  await db.execute(sql`DELETE FROM import_batches WHERE id = ${ids.batch}::uuid`);
  await db.execute(sql`DELETE FROM users WHERE id = ${ids.uploader}::uuid`);
});

describe('_backfill-fraud-detection-imports against a real database', () => {
  it('selects exactly the two unscored import rows, and nobody else in the batch', async () => {
    const candidates = await fetchCandidates(null, ids.batch);
    expect(candidates.map((c) => c.respondentId).sort()).toEqual(
      [ids['resp-selectable'], ids['resp-merged-later']].sort(),
    );
  });

  /**
   * ⛔ The person with a later field submission must be scored on the ROLL row. The
   * previous predicate took the most recent submission with raw data — the field
   * one — and would have scored a field visit as if it were the import.
   */
  it('picks the IMPORT submission even when a newer field submission exists', async () => {
    const candidates = await fetchCandidates(null, ids.batch);
    const merged = candidates.find((c) => c.respondentId === ids['resp-merged-later']);
    expect(merged?.submissionId).toBe(ids['import-sub-merged-later']);
    expect(merged?.submissionId).not.toBe(ids['field-sub-merged-later']);
  });

  /**
   * ⛔ The numbers the operator predicts against are a PARTITION. The rolled-back row
   * here ALSO has no submission — under the old overlapping counts it was subtracted
   * twice and the documented formula came out one short.
   */
  it('reports a cohort whose buckets partition the batch and reconcile to the selection', async () => {
    const counts = await fetchCohortCounts(ids.batch);
    const candidates = await fetchCandidates(null, ids.batch);

    expect(counts).toEqual({
      batches: 1,
      respondents: 5,
      rolledBack: 1,
      noBatch: 0,
      noImportSubmission: 1,
      alreadyScored: 1,
      selectable: 2,
    });
    expect(
      counts.respondents - counts.rolledBack - counts.noBatch - counts.noImportSubmission - counts.alreadyScored,
    ).toBe(counts.selectable);
    expect(candidates).toHaveLength(counts.selectable);
  });
});
