/**
 * Story 12-6 — Data-Health aggregate tests.
 *
 * The arithmetic is tested through the PURE `tallyFieldResponses`, and the
 * plumbing (which aggregate supplies which number, what the drill selects, what
 * the RBAC-visible projection contains) through `getDataHealth` over a mocked
 * DB. Splitting them that way is deliberate: a per-field rate that is wrong is
 * wrong in the tally, and a mocked DB can never demonstrate otherwise.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AnalyticsScope } from '../../middleware/analytics-scope.js';
import type { NativeFormSchema, RegistryTotals } from '@oslsr/types';

const mockExecute = vi.hoisted(() => vi.fn());
const mockGetRegistryTotals = vi.hoisted(() => vi.fn());
const mockGetFormSchemaById = vi.hoisted(() => vi.fn());
const mockListForms = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

// Only `getRegistryTotals` is faked — `buildRegistryFilter` and `hasAnswer` are
// the REAL ones, because they are part of what these tests are checking.
vi.mock('../registry-totals.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../registry-totals.service.js')>()),
  getRegistryTotals: mockGetRegistryTotals,
}));

vi.mock('../questionnaire.service.js', () => ({
  QuestionnaireService: {
    getFormSchemaById: mockGetFormSchemaById,
    listForms: mockListForms,
  },
}));

const { SurveyAnalyticsService, tallyFieldResponses } = await import('../survey-analytics.service.js');

const systemScope: AnalyticsScope = { type: 'system' };

function mockRows(rows: Record<string, unknown>[]) {
  return { rows };
}

function totalsFixture(overrides: Partial<RegistryTotals> = {}): RegistryTotals {
  return {
    totalRespondents: 139,
    withAnswers: 76,
    byDataStatus: {
      completed: 76,
      data_lost: 55,
      pending_nin: 1,
      nin_unavailable: 0,
      imported: 0,
      no_submission: 7,
    },
    bySource: { enumerator: 100, public: 39 },
    byCompleteness: { full: 40, core: 36, partial: 63 },
    byVerification: { nin_on_file: 80, self_declared: 58, pending_nin: 1, unverified_import: 0 },
    identityAmbiguous: 0,
    inProgressDrafts: 12,
    ...overrides,
  };
}

const schemaFixture: NativeFormSchema = {
  title: 'OSLSR Master v3',
  sections: [
    {
      name: 'identity',
      label: 'Identity',
      questions: [
        { name: 'gender', label: 'Gender', type: 'select_one', required: false, choiceList: 'genders' },
        { name: 'date_of_birth', label: 'Date of birth', type: 'date', required: false },
        { name: 'intro_note', label: 'Welcome', type: 'note', required: false },
      ],
    },
    {
      name: 'work',
      label: 'Work',
      questions: [
        { name: 'employment_status', label: 'Currently working?', type: 'select_one', required: false, choiceList: 'yesno' },
        { name: 'monthly_income', label: 'Monthly income', type: 'number', required: false },
      ],
    },
  ],
  choiceLists: {},
} as unknown as NativeFormSchema;

describe('tallyFieldResponses (Story 12-6 AC3)', () => {
  const columns = [
    { key: 'gender', header: 'Gender' },
    { key: 'date_of_birth', header: 'Date of birth' },
  ];

  it('divides each field by the answers-present cohort, not by rows seen', () => {
    // 3 rows on hand, but the cohort is 4: one answer-bearing respondent was
    // excluded by a filter upstream. The rate must divide by the cohort the
    // caller states, never by `rawRows.length` — that is the class of defect
    // ruling R-E named.
    const fields = tallyFieldResponses(
      [{ gender: 'female' }, { gender: 'male' }, { gender: '' }],
      columns,
      4,
    );

    const gender = fields.find((f) => f.key === 'gender')!;
    expect(gender.answeredCount).toBe(2);
    expect(gender.responseRate).toBe(50);
  });

  it('collapses variant key spellings before counting (the undercount trap)', () => {
    // `dob` and `date_of_birth` are the SAME question across form versions. A
    // tally that skipped normalization would report the schema's spelling as
    // 50% answered when every respondent actually answered it — a data-health
    // view inventing the defect it exists to report.
    const fields = tallyFieldResponses(
      [{ dob: '1990-01-01' }, { date_of_birth: '1988-05-05' }],
      columns,
      2,
    );

    const dob = fields.find((f) => f.key === 'date_of_birth')!;
    expect(dob.answeredCount).toBe(2);
    expect(dob.responseRate).toBe(100);
  });

  it('uses 12-4\'s emptiness contract — "0" and "false" are answers, [] is not', () => {
    const fields = tallyFieldResponses(
      [
        { gender: '0' },
        { gender: 'false' },
        { gender: [] },
        { gender: '   ' },
        { gender: null },
      ],
      [{ key: 'gender', header: 'Gender' }],
      5,
    );

    // A respondent who answered "0" answered. Treating a falsy-looking value as
    // unanswered would silently delete real responses from the numerator.
    expect(fields[0].answeredCount).toBe(2);
  });

  it('keeps a never-answered question in the list at 0%', () => {
    // The single most important row a data-health view can show is a question
    // nobody answered. Deriving the field list from the DATA rather than the
    // schema would make it disappear.
    const fields = tallyFieldResponses([{ gender: 'female' }], columns, 1);
    const dob = fields.find((f) => f.key === 'date_of_birth')!;
    expect(dob.answeredCount).toBe(0);
    expect(dob.responseRate).toBe(0);
    expect(fields).toHaveLength(2);
  });

  it('sorts most-under-answered first', () => {
    const fields = tallyFieldResponses(
      [{ gender: 'female', date_of_birth: '1990-01-01' }, { date_of_birth: '1991-01-01' }],
      columns,
      2,
    );
    expect(fields.map((f) => f.key)).toEqual(['gender', 'date_of_birth']);
  });

  it('clamps a rate that exceeds the cohort instead of publishing >100% (review M1)', () => {
    // ⚠️ NOT hypothetical arithmetic. The numerator counts unified ROWS (one per
    // `respondents.id`); the denominator is 12-4's `withAnswers`, counted AFTER
    // the identity-key collapse (NIN → E.164 phone). One person holding two
    // respondent rows contributes 2 and 1. The chart's X axis is pinned to
    // `domain={[0, 100]}`, so an unclamped 150% renders as a FULL bar with a
    // "150%" tooltip — wrong and silent together.
    const fields = tallyFieldResponses(
      [{ gender: 'female' }, { gender: 'male' }, { gender: 'female' }],
      [{ key: 'gender', header: 'Gender' }],
      2,
    );

    // The COUNT stays truthful — only the displayed rate is bounded.
    expect(fields[0].answeredCount).toBe(3);
    expect(fields[0].responseRate).toBe(100);
  });

  it('never reports a negative or non-finite rate', () => {
    const fields = tallyFieldResponses([{ gender: 'female' }], columns, 1);
    expect(fields.every((f) => f.responseRate >= 0 && f.responseRate <= 100)).toBe(true);
    expect(fields.every((f) => Number.isFinite(f.responseRate))).toBe(true);
  });

  it('renders 0%, never NaN, when a filter selects nobody', () => {
    // 0/0 on a Ministry dashboard must not read "NaN%".
    const fields = tallyFieldResponses([], columns, 0);
    expect(fields.every((f) => f.responseRate === 0)).toBe(true);
    expect(fields.every((f) => Number.isFinite(f.responseRate))).toBe(true);
  });
});

describe('SurveyAnalyticsService.getDataHealth (Story 12-6)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRegistryTotals.mockResolvedValue(totalsFixture());
    mockListForms.mockResolvedValue({
      data: [{ id: 'form-1', title: 'OSLSR Master v3' }],
      meta: { total: 1, page: 1, pageSize: 1, totalPages: 1 },
    });
    mockGetFormSchemaById.mockResolvedValue(schemaFixture);
  });

  it('takes every count from 12-4 rather than re-counting the registry', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([{ raw_data: { gender: 'female' } }])) // per-field pass
      .mockResolvedValueOnce(mockRows([])); // recovery drill

    const result = await SurveyAnalyticsService.getDataHealth(systemScope);

    expect(mockGetRegistryTotals).toHaveBeenCalledTimes(1);
    expect(result.withAnswers).toBe(76);
    // The cohort SIZE is 12-4's byDataStatus.data_lost — NOT rows.length, which
    // is one bounded page. A drill reporting its page size as the population
    // would understate who is recoverable.
    expect(result.recoveryCohort.total).toBe(55);
    expect(result.recoveryCohort.rows).toHaveLength(0);
  });

  it('skips note/geopoint questions via the shared schema column builder', async () => {
    mockExecute.mockResolvedValue(mockRows([]));

    const result = await SurveyAnalyticsService.getDataHealth(systemScope);

    const keys = result.fields.map((f) => f.key);
    expect(keys).toContain('gender');
    expect(keys).toContain('employment_status');
    // A note is not a question and has no response rate.
    expect(keys).not.toContain('intro_note');
  });

  it('reads the per-field pass from the canonical respondent source', async () => {
    mockExecute.mockResolvedValue(mockRows([]));

    await SurveyAnalyticsService.getDataHealth(systemScope);

    const sqlString = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(sqlString).toContain('FROM respondents r');
    expect(sqlString).not.toContain('LEFT JOIN respondents r ON r.id = s.respondent_id');
    // Narrowed projection: this pass counts answers, so nobody's NIN or phone
    // has any business crossing into the API process (12-4's discipline).
    expect(sqlString).toContain('ru.raw_data');
    expect(sqlString).not.toContain('ru.nin');
  });

  it('bounds the recovery drill and passes the bound back for the UI to state', async () => {
    mockExecute.mockResolvedValue(mockRows([]));

    const result = await SurveyAnalyticsService.getDataHealth(systemScope, {}, {
      limit: 10,
      offset: 20,
    });

    const drillSql = JSON.stringify(mockExecute.mock.calls[1][0]);
    expect(drillSql).toContain('LIMIT');
    expect(drillSql).toContain('OFFSET');
    expect(result.recoveryCohort.limit).toBe(10);
    expect(result.recoveryCohort.offset).toBe(20);
  });

  it('caps an absurd limit instead of letting a caller ask for the whole cohort', async () => {
    mockExecute.mockResolvedValue(mockRows([]));

    const result = await SurveyAnalyticsService.getDataHealth(systemScope, {}, { limit: 100_000 });

    expect(result.recoveryCohort.limit).toBe(200);
  });

  it('lets deriveDataStatus, not the SQL narrowing, decide who is data_lost', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([])) // per-field pass
      .mockResolvedValueOnce(
        mockRows([
          {
            respondent_id: 'r-1',
            lga_id: 'ibadan_north',
            status: 'active',
            source: 'enumerator',
            metadata: { questionnaire_data_lost: true },
            phone_number: '+2348012345678',
            created_at: '2026-05-01T10:00:00.000Z',
            raw_data: null,
            reference_code: 'OYO-0001',
            first_name: 'Ade',
            last_name: 'Bello',
            lga_name: 'Ibadan North',
          },
          {
            // ⚠️ A REAL divergence between the narrowing and the atom, not a
            // contrived one. The marker here is the JSONB STRING "true", not the
            // boolean. SQL's `->>` renders both as the text 'true', so the
            // narrowing selects this row — while `deriveDataStatus` tests
            // `=== true` and does not classify it `data_lost`.
            //
            // The atom wins: the row is dropped and counted. Publishing it
            // because the SQL liked it would put someone on a recovery list the
            // canonical taxonomy says is not there.
            respondent_id: 'r-2',
            lga_id: 'ibadan_north',
            status: 'active',
            source: 'enumerator',
            metadata: { questionnaire_data_lost: 'true' },
            phone_number: null,
            created_at: '2026-05-02T10:00:00.000Z',
            raw_data: null,
            reference_code: 'OYO-0002',
            first_name: 'Bola',
            last_name: null,
            lga_name: 'Ibadan North',
          },
        ]),
      );

    const result = await SurveyAnalyticsService.getDataHealth(systemScope);

    expect(result.recoveryCohort.rows).toHaveLength(1);
    expect(result.recoveryCohort.rows[0].respondentId).toBe('r-1');
    expect(result.recoveryCohort.rows[0].fullName).toBe('Ade Bello');
    expect(result.recoveryCohort.rows[0].referenceCode).toBe('OYO-0001');
    expect(result.recoveryCohort.rows[0].registeredAt).toBe('2026-05-01T10:00:00.000Z');
  });

  it('exposes no field beyond the existing registry projection (PII boundary)', async () => {
    mockExecute
      .mockResolvedValueOnce(mockRows([]))
      .mockResolvedValueOnce(
        mockRows([
          {
            respondent_id: 'r-1',
            lga_id: 'ibadan_north',
            status: 'active',
            source: 'enumerator',
            metadata: { questionnaire_data_lost: true },
            phone_number: '+2348012345678',
            created_at: '2026-05-01T10:00:00.000Z',
            raw_data: null,
            reference_code: 'OYO-0001',
            first_name: 'Ade',
            last_name: 'Bello',
            lga_name: 'Ibadan North',
          },
        ]),
      );

    const result = await SurveyAnalyticsService.getDataHealth(systemScope);

    // Exact key set, not a subset check: a widened projection is the failure
    // mode, and `toContain`-style assertions cannot see a field being ADDED.
    expect(Object.keys(result.recoveryCohort.rows[0]).sort()).toEqual([
      'fullName',
      'lgaId',
      'lgaName',
      'phoneNumber',
      'referenceCode',
      'registeredAt',
      'respondentId',
    ]);
    // NIN is on the canonical read and is deliberately NOT surfaced here.
    expect(JSON.stringify(result.recoveryCohort.rows[0])).not.toContain('nin');
  });

  it('renders an empty question axis instead of 500ing when no form is published', async () => {
    // Unreachable in prod (registration needs a published form) but ordinary on
    // a fresh dev/test database — and a tab that 500s there gets blamed on the
    // tab, not on the empty database.
    mockListForms.mockResolvedValue({ data: [], meta: { total: 0, page: 1, pageSize: 1, totalPages: 0 } });
    mockExecute.mockResolvedValue(mockRows([]));

    const result = await SurveyAnalyticsService.getDataHealth(systemScope);

    expect(result.formId).toBeNull();
    expect(result.fields).toEqual([]);
    expect(result.recoveryCohort.total).toBe(55);
  });

  it('divides by the SAME population it counted when the scope is personal (review M2)', async () => {
    // ⚠️ The numerator narrows a `personal` scope to one submitter via
    // `buildUnifiedAnswersWhere`. `getRegistryTotals` defaults `personal` to NO
    // filter — correct for `/registry-totals`, where the register is one shared
    // already-public object (12-4 ruling 2) — so taking the default here would
    // divide one enumerator's answered fields by the WHOLE register and read
    // every field as catastrophically under-answered.
    //
    // Unreachable through `/data-health` today (SA + Official both resolve to
    // `system` scope), which is exactly why it needs a test: it would surface
    // only if the route were widened, and then only as figures that look
    // plausible.
    mockExecute.mockResolvedValue(mockRows([]));

    await SurveyAnalyticsService.getDataHealth({ type: 'personal', userId: 'user-123' });

    expect(mockGetRegistryTotals).toHaveBeenCalledWith(
      { type: 'personal', userId: 'user-123' },
      {},
      'submitter',
    );

    // ...and the numerator narrowed the same way, so both halves are one population.
    const perFieldSql = JSON.stringify(mockExecute.mock.calls[0][0]);
    expect(perFieldSql).toContain('ru.submitter_id');
    expect(perFieldSql).toContain('user-123');
  });

  it('404s on an explicit formId that has no schema', async () => {
    mockGetFormSchemaById.mockResolvedValue(null);
    mockExecute.mockResolvedValue(mockRows([]));

    await expect(
      SurveyAnalyticsService.getDataHealth(systemScope, {}, { formId: 'missing-form' }),
    ).rejects.toMatchObject({ code: 'FORM_NOT_FOUND', statusCode: 404 });
  });
});
