import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { inArray, sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import { db } from '../../db/index.js';
import { submissions } from '../../db/schema/submissions.js';
import { respondents } from '../../db/schema/respondents.js';
import { questionnaireForms } from '../../db/schema/questionnaires.js';
import { SurveyAnalyticsService } from '../survey-analytics.service.js';

/**
 * Real-DB SMOKE for Story 12-6's `getDataHealth` — the raw-SQL ↔ schema drift
 * guard AC6.1 makes mandatory.
 *
 * WHY THIS EXISTS: the per-field pass and the recovery drill are raw
 * `db.execute` over the canonical unified source joined to `respondents` and
 * `lgas`. Raw SQL is NOT type-checked against the Drizzle schema, and the unit
 * tests mock `db.execute` — the combination has shipped prod 500s twice in this
 * repo (`users.role`→`role_id`, plus a hotfix). Columns this depends on:
 * `respondents.reference_code / first_name / last_name / metadata / status /
 * source / submitter_id`, `submissions.raw_data`, `lgas.name / code`. Rename or
 * drop any of them and this reddens instead of the Ministry's dashboard.
 *
 * ── Concurrency discipline (the 2026-07-22 lesson, inherited from 12-4) ─────
 * Vitest runs test FILES in parallel, so a global count is unsound on a shared
 * test DB: another suite inserting a respondent mid-window reddens this one for
 * an unrelated reason, and it passes in isolation — which reads as a flake and
 * gets re-run instead of fixed. Every assertion below is scoped to rows this
 * file OWNS via a far-future date window no other suite writes into. The one
 * unscoped call asserts only what a concurrent writer cannot move: that the SQL
 * EXECUTES.
 */

const TAG = '_data_health_smoke_';

/** A window no other suite writes into, so the scope is exclusively ours. */
const WINDOW = { dateFrom: '2099-05-01T00:00:00.000Z', dateTo: '2099-05-31T23:59:59.000Z' };
const STAMP = new Date('2099-05-15T12:00:00.000Z');

const completedId = uuidv7();
const completedVariantKeyId = uuidv7();
const dataLostId = uuidv7();
const noSubmissionId = uuidv7();

const completedSubId = uuidv7();
const variantSubId = uuidv7();

const formId = uuidv7();

const ourRespondentIds = [completedId, completedVariantKeyId, dataLostId, noSubmissionId];

/**
 * Resolved from the DB in `beforeAll`, not hard-coded.
 *
 * The first draft used 'ibadan_north' / 'oyo_east' and the `lgas` LEFT JOIN
 * produced NULL names — the test DB seeds only three LGAs. Hard-coding a code
 * makes the join assertion depend on seed CONTENT, which is exactly how a real
 * join failure would later be dismissed as "just the seed".
 */
let lgaCode = '';
let lgaName = '';

describe('getDataHealth — real-DB smoke (raw-SQL ↔ schema parity)', () => {
  beforeAll(async () => {
    // `questionnaire_forms.uploaded_by` is NOT NULL and FKs to `users`, so the
    // fixture borrows an existing user rather than minting one — creating a user
    // here would drag in the whole auth fixture surface for a column this test
    // never reads. (Found BY this smoke: the first draft omitted five NOT NULL
    // columns, which is precisely the schema-drift class it exists to catch.)
    const anyLga = await db.execute(sql`SELECT code, name FROM lgas ORDER BY code LIMIT 1`);
    const lga = anyLga.rows[0] as { code: string; name: string } | undefined;
    if (!lga) throw new Error('data-health smoke needs at least one lga row');
    lgaCode = lga.code;
    lgaName = lga.name;

    const anyUser = await db.execute(sql`SELECT id FROM users LIMIT 1`);
    const uploadedBy = (anyUser.rows[0] as { id: string } | undefined)?.id;
    if (!uploadedBy) throw new Error('data-health smoke needs at least one user row');

    // A published form, so the per-field axis has real questions to walk. Note
    // `intro_note` — a `note` is not a question and must not appear as a field.
    await db.insert(questionnaireForms).values({
      id: formId,
      formId: `${TAG}form`,
      version: '1',
      title: `${TAG}Instrument`,
      status: 'published',
      isNative: true,
      fileHash: `${TAG}hash`,
      fileName: `${TAG}.xlsx`,
      fileSize: 1,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      uploadedBy,
      formSchema: {
        title: `${TAG}Instrument`,
        sections: [
          {
            name: 'core',
            label: 'Core',
            questions: [
              { name: 'gender', label: 'Gender', type: 'select_one', required: false, choiceList: 'g' },
              { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: false },
              { name: 'monthly_income', label: 'Monthly income', type: 'number', required: false },
              { name: 'intro_note', label: 'Welcome', type: 'note', required: false },
            ],
          },
        ],
        choiceLists: { g: [{ value: 'female', label: 'Female' }] },
      },
      createdAt: STAMP,
    });

    // A — answers on file, spelled with the schema's own key.
    await db.insert(respondents).values({
      id: completedId, nin: null, firstName: 'Health', lastName: 'One',
      status: 'active', source: 'enumerator', referenceCode: `${TAG}A`,
      lgaId: lgaCode, createdAt: STAMP,
    });
    await db.insert(submissions).values({
      id: completedSubId, submissionUid: `${TAG}${completedSubId}`,
      questionnaireFormId: formId, respondentId: completedId,
      rawData: { gender: 'female', date_of_birth: '1990-01-01' },
      submittedAt: new Date(), source: 'enumerator',
    });

    // B — answers on file, but date of birth is spelled `dob` (an older form
    // version). This is the variant-key trap: without normalization the
    // date_of_birth rate would read 50% when both respondents answered it.
    await db.insert(respondents).values({
      id: completedVariantKeyId, nin: null, firstName: 'Health', lastName: 'Two',
      status: 'active', source: 'public', referenceCode: `${TAG}B`,
      lgaId: lgaCode, createdAt: STAMP,
    });
    await db.insert(submissions).values({
      id: variantSubId, submissionUid: `${TAG}${variantSubId}`,
      questionnaireFormId: formId, respondentId: completedVariantKeyId,
      rawData: { gender: 'male', dob: '1988-05-05' },
      submittedAt: new Date(), source: 'public',
    });

    // C — data_lost: the row exists, the answers do not. Recoverable.
    await db.insert(respondents).values({
      id: dataLostId, nin: null, firstName: 'Lost', lastName: 'Answers',
      status: 'active', source: 'public', referenceCode: `${TAG}C`,
      lgaId: lgaCode, createdAt: STAMP,
      metadata: { questionnaire_data_lost: true },
      phoneNumber: '+2348011122233',
    });

    // D — registered, never submitted. Must NOT appear in the recovery cohort:
    // "no questionnaire yet" is a different state from "answers lost".
    await db.insert(respondents).values({
      id: noSubmissionId, nin: null, firstName: 'Never', lastName: 'Submitted',
      status: 'active', source: 'public', referenceCode: `${TAG}D`,
      lgaId: lgaCode, createdAt: STAMP,
    });
  });

  afterAll(async () => {
    await db.delete(submissions).where(inArray(submissions.id, [completedSubId, variantSubId]));
    await db.delete(respondents).where(inArray(respondents.id, ourRespondentIds));
    await db.delete(questionnaireForms).where(inArray(questionnaireForms.id, [formId]));
  });

  it('EXECUTES against the live schema (the drift guard)', async () => {
    // The unscoped call is the only one that can prove the raw SQL runs against
    // the real columns. Assert nothing a concurrent writer could move.
    const result = await SurveyAnalyticsService.getDataHealth({ type: 'system' });

    expect(result.withAnswers).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.fields)).toBe(true);
    expect(result.recoveryCohort.total).toBeGreaterThanOrEqual(0);
    expect(result.recoveryCohort.rows.length).toBeLessThanOrEqual(result.recoveryCohort.limit);
  });

  it('computes per-field rates over OUR cohort, normalising variant key spellings', async () => {
    const result = await SurveyAnalyticsService.getDataHealth({ type: 'system' }, WINDOW, {
      formId,
    });

    // A + B answered; C (data_lost) and D (no submission) cannot answer a field
    // and are correctly outside the per-field denominator.
    expect(result.withAnswers).toBe(2);

    const byKey = Object.fromEntries(result.fields.map((f) => [f.key, f]));

    expect(byKey.gender.answeredCount).toBe(2);
    expect(byKey.gender.responseRate).toBe(100);

    // ⭐ THE POINT OF THIS SMOKE. B spelled it `dob`; the schema asks for
    // `date_of_birth`. Without normalizeRawDataKeys this reads 1/2 = 50% and
    // the view reports a data-quality problem it invented itself.
    expect(byKey.date_of_birth.answeredCount).toBe(2);
    expect(byKey.date_of_birth.responseRate).toBe(100);

    // Nobody was asked about income — a 0% question must still be listed, and
    // listed FIRST, because it is the most important row here.
    expect(byKey.monthly_income.answeredCount).toBe(0);
    expect(byKey.monthly_income.responseRate).toBe(0);
    expect(result.fields[0].key).toBe('monthly_income');

    // A note is not a question.
    expect(byKey.intro_note).toBeUndefined();
  });

  it('surfaces the data_lost cohort with the existing registry projection, and nothing wider', async () => {
    const result = await SurveyAnalyticsService.getDataHealth({ type: 'system' }, WINDOW, {
      formId,
    });

    expect(result.recoveryCohort.total).toBe(1);
    expect(result.recoveryCohort.rows).toHaveLength(1);

    const row = result.recoveryCohort.rows[0];
    expect(row.respondentId).toBe(dataLostId);
    expect(row.referenceCode).toBe(`${TAG}C`);
    expect(row.fullName).toBe('Lost Answers');
    expect(row.phoneNumber).toBe('+2348011122233');
    // Proves the `lgas` join resolves through the real table, not just that a
    // column exists — `lgaName` is the only field here that is not a
    // respondents column.
    expect(row.lgaName).toBe(lgaName);
    expect(row.lgaId).toBe(lgaCode);
    expect(row.registeredAt).toContain('2099-05-15');

    // D is `no_submission`, NOT `data_lost`. Conflating the two would put people
    // with nothing lost onto a recovery campaign's target list.
    expect(result.recoveryCohort.rows.map((r) => r.respondentId)).not.toContain(noSubmissionId);
  });

  it('bounds the drill through the real query', async () => {
    const result = await SurveyAnalyticsService.getDataHealth({ type: 'system' }, {}, {
      limit: 1,
    });

    expect(result.recoveryCohort.rows.length).toBeLessThanOrEqual(1);
    expect(result.recoveryCohort.limit).toBe(1);
  });
});
