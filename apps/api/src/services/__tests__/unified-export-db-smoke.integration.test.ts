import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { lgas } from '../../db/schema/lgas.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { ExportQueryService } from '../export-query.service.js';

/**
 * Real-DB SMOKE for the unified export (Story 9-59, AC6.2).
 *
 * WHY THIS EXISTS: `getUnifiedExportData` builds its query with
 * `db.execute(sql\`SELECT r.* … DISTINCT ON (r.id) LEFT JOIN submissions …\`)`,
 * which is NOT type-checked against the Drizzle schema, and the unit tests mock
 * `db.execute`. That combination has shipped real production 500s before (the
 * 2026-06-09 `users.role`→`role_id` analytics break). The `SELECT r.*`
 * introspection is deliberate drift-insulation, but the per-row mapping reads
 * named columns (`reference_code`, `status`, `metadata`, `raw_data`, …) — if a
 * future migration renames or drops one, this smoke catches it because Postgres
 * validates column references at PLAN time.
 *
 * It exercises the THREE structurally-distinct rows that make the registry
 * "139 ≠ 76": a completed respondent (raw_data present), a data_lost respondent
 * (metadata marker, no submission), and a no-submission respondent. It asserts
 * the query EXECUTES against the real schema and that LEFT JOIN keeps the
 * answer-less rows (the whole point of the unified mode), not specific
 * production values.
 *
 * Follows the project integration-test pattern (beforeAll/afterAll, never
 * beforeEach/afterEach; authoritative cleanup via captured ids). A live
 * Postgres is provided by CI `test-api` (DATABASE_URL + db:push) and locally.
 */

const TAG = '_unified_export_smoke_';
const lgaCode = `${TAG}lga`;
const lgaId = uuidv7();

const completedId = uuidv7();
const dataLostId = uuidv7();
const noSubmissionId = uuidv7();
const submissionId = uuidv7();

// Review M2 — a respondent whose LATEST submission is empty but an EARLIER one
// has answers must still resolve to 'completed' (latest-non-empty, not latest).
const supersededId = uuidv7();
const supersededOldSubId = uuidv7();
const supersededNewSubId = uuidv7();

describe('getUnifiedExportData — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    await db.insert(lgas).values({ id: lgaId, name: `${TAG}lga`, code: lgaCode });

    // 1. Completed — has a submission with non-empty raw_data → data_status 'completed'.
    await db.insert(respondents).values({
      id: completedId,
      nin: null,
      firstName: 'Completed',
      lastName: 'Person',
      lgaId: lgaCode,
      status: 'active',
      source: 'public',
      referenceCode: `${TAG}C`,
    });
    await db.insert(submissions).values({
      id: submissionId,
      submissionUid: `${TAG}${submissionId}`,
      questionnaireFormId: 'smoke-form',
      respondentId: completedId,
      rawData: { employment_status: 'employed', dob: '1990-01-01', skills_possessed: 'tailoring' },
      submittedAt: new Date(),
      source: 'public',
    });

    // 2. Data-lost — no submission, metadata marker → data_status 'data_lost'.
    await db.insert(respondents).values({
      id: dataLostId,
      nin: null,
      firstName: 'Lost',
      lastName: 'Person',
      lgaId: lgaCode,
      status: 'active',
      source: 'public',
      referenceCode: `${TAG}L`,
      metadata: { questionnaire_data_lost: true, lost_at: '2026-05-18T00:00:00.000Z' },
    });

    // 3. No-submission — active field respondent with nothing → data_status 'no_submission'.
    await db.insert(respondents).values({
      id: noSubmissionId,
      nin: null,
      firstName: 'Empty',
      lastName: 'Person',
      lgaId: lgaCode,
      status: 'active',
      source: 'enumerator',
      referenceCode: `${TAG}E`,
    });

    // 4. Superseded — TWO submissions: an older one WITH answers, a newer EMPTY
    //    correction. The newer (latest) must not mask the older → 'completed'
    //    with the older answers (review M2).
    await db.insert(respondents).values({
      id: supersededId,
      nin: null,
      firstName: 'Superseded',
      lastName: 'Person',
      lgaId: lgaCode,
      status: 'active',
      source: 'public',
      referenceCode: `${TAG}S`,
    });
    await db.insert(submissions).values({
      id: supersededOldSubId,
      submissionUid: `${TAG}${supersededOldSubId}`,
      questionnaireFormId: 'smoke-form',
      respondentId: supersededId,
      rawData: { employment_status: 'self_employed', dob: '1980-01-01' },
      submittedAt: new Date('2026-05-01T00:00:00.000Z'),
      source: 'public',
    });
    await db.insert(submissions).values({
      id: supersededNewSubId,
      submissionUid: `${TAG}${supersededNewSubId}`,
      questionnaireFormId: 'smoke-form',
      respondentId: supersededId,
      rawData: {},
      submittedAt: new Date('2026-06-01T00:00:00.000Z'),
      source: 'public',
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(inArray(submissions.id, [submissionId, supersededOldSubId, supersededNewSubId]));
    await db.delete(respondents).where(inArray(respondents.id, [completedId, dataLostId, noSubmissionId, supersededId]));
    await db.delete(lgas).where(eq(lgas.id, lgaId));
  });

  it('executes against the real schema and LEFT JOIN keeps answer-less rows', async () => {
    // Scope to our synthetic LGA so the assertions are deterministic regardless
    // of whatever else lives in the test DB.
    const { data } = await ExportQueryService.getUnifiedExportData({ lgaId: lgaCode });

    // All four respondents present — the answer-less ones are NOT dropped.
    expect(data).toHaveLength(4);

    const byRef = Object.fromEntries(data.map((r) => [r.referenceCode, r]));
    expect(byRef[`${TAG}C`].dataStatus).toBe('completed');
    expect(byRef[`${TAG}C`].rawData).toMatchObject({ employment_status: 'employed' });
    expect(byRef[`${TAG}L`].dataStatus).toBe('data_lost');
    expect(byRef[`${TAG}L`].questionnaireDataLost).toBe('Yes');
    expect(byRef[`${TAG}E`].dataStatus).toBe('no_submission');
    // Review M2 — older answers survive a later empty correction.
    expect(byRef[`${TAG}S`].dataStatus).toBe('completed');
    expect(byRef[`${TAG}S`].rawData).toMatchObject({ employment_status: 'self_employed' });
  });

  it('the unified row count equals getFilteredCount (distinct respondents)', async () => {
    const { totalCount } = await ExportQueryService.getUnifiedExportData({ lgaId: lgaCode });
    const filteredCount = await ExportQueryService.getFilteredCount({ lgaId: lgaCode });
    expect(totalCount).toBe(filteredCount);
    expect(totalCount).toBe(4);
  });

  it('sanity: the columns the row-mapper reads by name still exist on respondents', async () => {
    // If a future migration renames/drops one of these, the unified mapper would
    // silently emit '' — this makes that change a deliberate decision, not a
    // silent data-quality regression.
    const rows = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='respondents'
        AND column_name IN ('reference_code','status','source','metadata','date_of_birth','phone_number','consent_marketplace','consent_enriched')
    `);
    const present = new Set((rows.rows as Array<{ column_name: string }>).map((r) => r.column_name));
    for (const col of ['reference_code', 'status', 'source', 'metadata', 'date_of_birth', 'phone_number', 'consent_marketplace', 'consent_enriched']) {
      expect(present.has(col)).toBe(true);
    }
  });
});
