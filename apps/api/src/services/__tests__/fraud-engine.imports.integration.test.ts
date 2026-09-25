/**
 * Story 13-2 R-A2 half (c) — THE IMPORTED COHORT, SCORED FOR REAL.
 *
 * ⭐ THIS IS THE TEST THAT PROVES THE CRASH IS FIXED, AND IT HAS TO TOUCH A REAL
 * DATABASE TO DO IT.
 *
 * The defect R-A2 found was not logical, it was a type error at the storage
 * boundary: `fraud_detections.enumerator_id` was `uuid NOT NULL`, imported
 * submissions carry neither `enumerator_id` nor `submitter_id`, and the engine
 * coerced that to `''`. Postgres answers `invalid input syntax for type uuid: ""`,
 * so every one of the 8,278 jobs would have thrown, retried three times and
 * dead-lettered — while every mocked unit test in the suite stayed green, because
 * a mocked `db.insert` accepts an empty string happily.
 *
 * So the assertions below deliberately end in a REAL INSERT of a REAL engine result.
 * Anything less re-creates the exact blind spot the story exists to close.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { ensureRoles } from '../../__tests__/helpers/ensure-roles.js'; // 13-73 R4
import { fraudDetections } from '../../db/schema/index.js';
import { FraudEngine } from '../fraud-engine.service.js';
import { AssessorService } from '../assessor.service.js';
import { VerificationAnalyticsService } from '../verification-analytics.service.js';

const TAG = `ra2c-${Date.now()}`;
const ids: Record<string, string> = {};
/** Run-unique LGA: scopes the analytics breakdown to this file's rows (lga_id is plain text). */
const LGA = `${TAG}-lga`;

/**
 * Rows in the seeded batch: three share one identity, five share one phone, and two
 * are the same person with first/last swapped.
 *
 * Names are NOT run-tagged: every count is scoped to this run's import batch, so a
 * tag buys no isolation — and prefixing the FIRST name would make the inverted pair
 * two different token sets, so the test could not see name-order handling at all.
 */
const ROLL = [
  { key: 'dup-a', first: 'Ade', last: 'Bello', phone: '+2348000000001' },
  { key: 'dup-b', first: 'Ade', last: 'Bello', phone: '+2348000000002' },
  { key: 'dup-c', first: 'ade', last: ' bello ', phone: '+2348000000003' },
  // 13-2 R-A6: name ORDER is unreliable for the NCARES rows — the same person
  // recorded surname-first on one line and given-name-first on another.
  { key: 'inv-a', first: 'Tunde', last: 'Bakare', phone: '+2348000000021' },
  { key: 'inv-b', first: 'Bakare', last: 'Tunde', phone: '+2348000000022' },
  { key: 'shared-1', first: 'Bisi', last: 'Kola', phone: '+2348000009999' },
  { key: 'shared-2', first: 'Chidi', last: 'Nwosu', phone: '+2348000009999' },
  { key: 'shared-3', first: 'Dayo', last: 'Ogun', phone: '+2348000009999' },
  { key: 'shared-4', first: 'Emeka', last: 'Obi', phone: '+2348000009999' },
  { key: 'shared-5', first: 'Femi', last: 'Alao', phone: '+2348000009999' },
  { key: 'clean', first: 'Grace', last: 'Udo', phone: '+2348000000010' },
];

beforeAll(async () => {
  await ensureRoles('enumerator'); // 13-73 R4 (code review) — `FROM roles r LIMIT 1` needs SOME role
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

  for (const row of ROLL) {
    const [r] = (await db.execute(sql`
      INSERT INTO respondents (id, first_name, last_name, phone_number, lga_id, source, status,
                               consent_marketplace, import_batch_id, metadata, created_at, updated_at)
      VALUES (gen_random_uuid(), ${row.first}, ${row.last}, ${row.phone}, ${LGA},
              'imported_association', 'imported_unverified', true, ${ids.batch}::uuid,
              ${JSON.stringify({ association_name: 'AFAN' })}::jsonb, now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;

    const [s] = (await db.execute(sql`
      INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                               raw_data, submitted_at, ingested_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${r.id}::uuid, ${`${TAG}-${row.key}`}, 'import:imported_association',
              ${JSON.stringify({ skills_possessed: ['farming'] })}::jsonb, now(), now(), now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;

    ids[`sub-${row.key}`] = s.id;
    ids[`resp-${row.key}`] = r.id;
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

describe('FraudEngine.evaluate on an imported row (13-2 R-A2)', () => {
  it('returns a null enumerator and names the import batch instead', async () => {
    const result = await FraudEngine.evaluate(ids['sub-clean']);

    expect(result.enumeratorId).toBeNull();
    expect(result.importBatchId).toBe(ids.batch);
  });

  /**
   * ⛔ THE CRASH ITSELF. Before this story the engine produced `enumeratorId: ''`
   * and this insert answered `invalid input syntax for type uuid: ""`. The assertion
   * that matters is that the statement COMPLETES — the row count is just how a test
   * observes it.
   */
  it('stores a detection for an imported row (the insert that used to throw)', async () => {
    const result = await FraudEngine.evaluate(ids['sub-clean']);

    await db.insert(fraudDetections).values({
      submissionId: result.submissionId,
      enumeratorId: result.enumeratorId,
      importBatchId: result.importBatchId,
      configSnapshotVersion: result.configVersion,
      gpsScore: String(result.componentScores.gps),
      speedScore: String(result.componentScores.speed),
      straightlineScore: String(result.componentScores.straightline),
      duplicateScore: String(result.componentScores.duplicate),
      timingScore: String(result.componentScores.timing),
      totalScore: String(result.totalScore),
      severity: result.severity,
    });

    const stored = (await db.execute(sql`
      SELECT enumerator_id, import_batch_id FROM fraud_detections
      WHERE submission_id = ${result.submissionId}::uuid
    `)) as { rows: Array<{ enumerator_id: string | null; import_batch_id: string | null }> };

    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].enumerator_id).toBeNull();
    expect(stored.rows[0].import_batch_id).toBe(ids.batch);
  });

  /**
   * ⛔ AND THE FOUR FIELD SCORES MUST BE ZERO, NOT ABSENT-LOOKING-LIKE-CLEAN.
   * An import cannot evidence GPS, speed, straight-lining or off-hours. The
   * provenance split means those heuristics never run; this pins that they are not
   * quietly running and returning noise — especially `timing`, which WOULD have
   * fired on the operator's single import clock for all 8,222 rows at once.
   */
  it('scores none of the field heuristics (no GPS, speed, straightline or timing)', async () => {
    const result = await FraudEngine.evaluate(ids['sub-clean']);

    expect(result.componentScores.gps).toBe(0);
    expect(result.componentScores.speed).toBe(0);
    expect(result.componentScores.straightline).toBe(0);
    expect(result.componentScores.timing).toBe(0);
  });

  it('gives a clean, unshared row no duplicate score', async () => {
    const result = await FraudEngine.evaluate(ids['sub-clean']);
    expect(result.componentScores.duplicate).toBe(0);
    expect(result.severity).toBe('clean');
  });

  /**
   * The signal the fraud half exists for: the same person entered three times under
   * different phone numbers — exactly what survives the importer's phone/NIN dedup.
   */
  it('scores a duplicated identity inside the batch', async () => {
    const result = await FraudEngine.evaluate(ids['sub-dup-a']);

    expect(result.componentScores.duplicate).toBeGreaterThan(0);
    expect(result.details.duplicate).toMatchObject({
      flags: expect.arrayContaining(['duplicate_identity_in_batch']),
      sameIdentityCount: 3,
    });
  });

  /** Case and stray whitespace must not split a duplicate cluster apart. */
  it('normalises case and whitespace when matching identities', async () => {
    const result = await FraudEngine.evaluate(ids['sub-dup-c']);
    expect(result.details.duplicate).toMatchObject({ sameIdentityCount: 3 });
  });

  /**
   * ⛔ THE FALSE-POSITIVE GUARD, AND THE MOST IMPORTANT TEST HERE. The farming
   * consolidation has 345 shared numbers, 333 of them on 2-4 rows: a shared handset is
   * ORDINARY.
   * Five rows on one phone crosses the configured minimum; the seeded batch has
   * exactly five, so this fires — but a household of two or three must stay silent,
   * which the `clean` row above pins from the other side.
   */
  it('flags contact reuse only once it crosses the configured minimum', async () => {
    const result = await FraudEngine.evaluate(ids['sub-shared-1']);

    expect(result.details.duplicate).toMatchObject({
      flags: expect.arrayContaining(['contact_reused_across_batch']),
      samePhoneCount: 5,
    });
  });

  /**
   * ⛔ 13-2 R-A2 REVIEW C1 — A HEURISTIC THAT COULD NEVER REACH A SEVERITY.
   *
   * `roll_padding` lives in the `duplicate` slot, capped at `duplicate_weight` (20).
   * For a field row that cap is one of five components summing to 100; for an
   * import it is the ONLY component, so the composite topped out at 20 — below
   * `severity_low_min` (25). Every imported detection was `clean`, and `clean` is
   * excluded from the fraud list by default and never enters the assessor queue.
   * The anti-roll-padding mechanism would have run 8,278 times and shown nobody
   * anything. `componentScores.duplicate > 0` (the assertion above) passed over it.
   */
  it('lets a duplicate-identity cluster reach a reviewable severity', async () => {
    const result = await FraudEngine.evaluate(ids['sub-dup-a']);

    expect(result.severity).not.toBe('clean');
    // Three rows, excess 2 → 12 × 2/3 = 8 of a 20-point slot → 40 on the 0–100 scale.
    expect(result.totalScore).toBe(40);
    // The raw component keeps its own scale, so the stored column stays comparable
    // with field detections.
    expect(result.componentScores.duplicate).toBe(8);
  });

  /**
   * ⛔ REVIEW M — THE IDENTITY KEY WAS ORDER-SENSITIVE. The code's own comment
   * justified a coarse key by R-A6 (name order unreliable for 5,301 NCARES rows),
   * then compared `first || ' ' || last` as a string — so "Tunde Bakare" and
   * "Bakare Tunde" were two people, and the padding hid exactly where R-A6 says
   * the data is weakest.
   */
  it('treats the same name in swapped order as one identity', async () => {
    const result = await FraudEngine.evaluate(ids['sub-inv-a']);
    expect(result.details.duplicate).toMatchObject({ sameIdentityCount: 2 });
  });

  /**
   * ⛔ REVIEW H — PROVENANCE IS A PROPERTY OF THE SUBMISSION, NOT THE PERSON.
   * Provenance was read off `respondents.import_batch_id`, so ANY later submission
   * attached to an imported person — a wizard registration merged by identity, or an
   * enumerator capturing a NIN already on file — ran roll-padding only and skipped
   * GPS, speed, straight-lining and off-hours. An enumerator fabricating visits to
   * people already on an association roll would have been unscoreable.
   */
  it('scores a FIELD submission on an imported person with the field heuristics', async () => {
    const [s] = (await db.execute(sql`
      INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                               enumerator_id, gps_latitude, gps_longitude, completion_time_seconds,
                               raw_data, submitted_at, ingested_at, created_at, updated_at)
      VALUES (gen_random_uuid(), ${ids['resp-clean']}::uuid, ${`${TAG}-field-visit`},
              gen_random_uuid()::text, ${ids.uploader}, 7.3775, 3.947, 600,
              ${JSON.stringify({ skills_possessed: ['farming'] })}::jsonb, now(), now(), now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;

    const result = await FraudEngine.evaluate(s.id);

    expect(result.importBatchId).toBeNull();
    expect(result.enumeratorId).toBe(ids.uploader);
    // The field registry ran: the GPS heuristic produced details, roll-padding did not.
    expect(result.details.gps).not.toBeNull();
    expect(result.details.duplicate).not.toMatchObject({ flags: expect.arrayContaining(['duplicate_identity_in_batch']) });
  });

  /**
   * ⛔ REVIEW H — THE ASSESSOR QUEUE INNER-JOINED `users`. The story's consumer sweep
   * converted the four joins in the fraud controller and missed the four identical
   * ones in `assessor.service.ts`, so an imported detection was invisible to the
   * assessor surfaces R-A10 names as the ones that CAN see it.
   */
  it('shows a reviewed imported detection in the assessor audit queue', async () => {
    await db.execute(sql`
      UPDATE fraud_detections SET resolution = 'needs_investigation'
      WHERE submission_id = ${ids['sub-clean']}::uuid
    `);

    const queue = await AssessorService.getAuditQueue({ pageSize: 100 });
    const mine = queue.data.find((d) => d.submissionId === ids['sub-clean']);

    expect(mine).toBeDefined();
    expect(mine?.enumeratorName).toBeNull();
    expect(mine?.importBatchId).toBe(ids.batch);
  });

  /**
   * ⛔ REVIEW L2 — `roll_padding` and `duplicate_response` SHARE `duplicate_score`.
   * The drill-down filtered on the column alone, so an imported roll-padding
   * detection appeared under "Duplicate response", and the analytics "Duplicate" bar
   * counted it. Both are now split by provenance (`import_batch_id`).
   */
  it('files a roll-padding detection under roll_padding, never under duplicate_response', async () => {
    const result = await FraudEngine.evaluate(ids['sub-dup-a']);
    expect(result.componentScores.duplicate).toBeGreaterThan(0);
    await db.insert(fraudDetections).values({
      submissionId: result.submissionId,
      enumeratorId: result.enumeratorId,
      importBatchId: result.importBatchId,
      configSnapshotVersion: result.configVersion,
      gpsScore: '0', speedScore: '0', straightlineScore: '0', timingScore: '0',
      duplicateScore: String(result.componentScores.duplicate),
      totalScore: String(result.totalScore),
      severity: result.severity,
      resolution: 'needs_investigation',
    });

    const asRollPadding = await AssessorService.getAuditQueue({ heuristic: 'roll_padding', pageSize: 100 });
    const asDuplicate = await AssessorService.getAuditQueue({ heuristic: 'duplicate_response', pageSize: 100 });
    expect(asRollPadding.data.some((d) => d.submissionId === ids['sub-dup-a'])).toBe(true);
    expect(asDuplicate.data.some((d) => d.submissionId === ids['sub-dup-a'])).toBe(false);

    // Scoped to this run's LGA, so the counts are exact on a shared test DB.
    const breakdown = await VerificationAnalyticsService.getFraudTypeBreakdown({ lgaId: LGA });
    expect(breakdown.rollPadding).toBe(1);
    expect(breakdown.duplicateResponse).toBe(0);
  });
});
