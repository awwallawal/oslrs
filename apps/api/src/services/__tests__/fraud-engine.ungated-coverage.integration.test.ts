/**
 * Story 13-69 — THE DETECTORS RUN, AND THIS IS THE PROOF THEY REACH THEIR COMPUTATION.
 *
 * ⭐ WHY THIS FILE EXISTS. Fraud detection was enqueued only when a submission
 * carried GPS (`submission-processing.service.ts`, `if (args.gps)`). Four of the
 * five detectors never needed coordinates — duplicate, straight-lining, timing and
 * speed score behaviour and content — so one over-broad `if` disabled all four in
 * order to protect one. Measured 2026-09-17: across all 8,282 detections ever
 * written, `gps_score`, `timing_score` and `straightline_score` had NEVER been
 * non-zero and `speed_score` had fired exactly once. Exactly 3 submissions in the
 * system carried GPS, and exactly those 3 were ever scored.
 *
 * ⛔ "A ROW WAS WRITTEN" IS NOT THE CLAIM. A detector that returns 0 because it
 * cannot measure is the exact defect this story exists to fix, and it is
 * indistinguishable from a clean population unless you look at WHY. So every
 * assertion below is on the presence of a computed field and the ABSENCE of a
 * `reason` marker — `speed_details.tier` rather than `speed_score === 0`,
 * `straightline_details.analyzedBatteries` rather than a score, and so on.
 * [[pattern-a-clean-result-must-prove-it-measured]]
 *
 * ⛔ AND IT IS ASSERTED ON THE STORED ROW, NOT ON THE ENGINE'S RETURN VALUE. The
 * defect class in this path has always been at the storage boundary (13-2 R-A2: a
 * `''` enumerator id, a NOT NULL column, a uuid cast on a TEXT sentinel — every one
 * of them invisible to a mocked `db.insert`). A test written from the worker's own
 * config rather than from a real submission is what hid a dead password reset for
 * eight months.
 *
 * ⭐ THE FORM SCHEMAS ARE THE REAL ONES, parsed from the shipped XLSForms through
 * the real parser and converter. Two detectors read the form rather than the
 * answers — `straight_lining` needs a battery of >=5 `select_one` in ONE section,
 * and `speed_run`'s bootstrap reference is computed from the question mix — so a
 * hand-written schema would prove the heuristics work on a form that does not
 * exist. It also means this file reds if either form's shape changes underneath it.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED HERE: thresholds and calibration are R-A8's
 * 1,482 held rows. This story turns the detectors ON; it does not tune what they
 * fire at. The assertions are about REACHABILITY, never about a score's value.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { XlsformParserService } from '../xlsform-parser.service.js';
import { convertToNativeForm } from '../xlsform-to-native-converter.js';

/*
 * The worker module instantiates a BullMQ `Worker` at import time. Mock ONLY the
 * transport (bullmq + the redis factory) so the processor can be captured and
 * invoked directly — the database, the engine and the heuristics all stay REAL.
 * This is what makes the AC5 claim ("the worker completes on a null-coordinate
 * job") an assertion about the worker rather than about a stub of it.
 */
let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

/** Every job any producer enqueues in this file, by queue name. */
const enqueued: Array<{ queue: string; data: Record<string, unknown> }> = [];

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
    add(_jobName: string, data: Record<string, unknown>, opts?: { jobId?: string }) {
      enqueued.push({ queue: this.name, data });
      return Promise.resolve({ id: opts?.jobId ?? 'mock-job' });
    }
    close() { return Promise.resolve(); }
  },
}));

vi.mock('../../lib/redis.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/redis.js')>();
  return { ...actual, createRedisConnection: () => ({}) };
});

await import('../../workers/fraud-detection.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const runWorker = capturedProcessor;

const { SubmissionProcessingService } = await import('../submission-processing.service.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(HERE, '../../../../../test-fixtures');

function nativeSchemaFor(file: string) {
  const parsed = XlsformParserService.parseXlsxFile(readFileSync(resolve(FIXTURES, file)));
  return convertToNativeForm(parsed);
}

const TAG = `s1369-${Date.now()}`;
const ids: Record<string, string> = {};

/**
 * ⛔ THESE ANSWERS ARE THE FORM'S OWN VOCABULARY — 13-69 REVIEW H2 FIXED THEM.
 *
 * The first version of this file invented them, and seven of eleven were not
 * things a real submission can contain: three question names that do not exist on
 * `oslsr_master_v3` (`employment_sector`, `work_type`, `income_band`), four values
 * outside their question's choice list (`education_level: 'secondary'`,
 * `disability_status: 'none'`, `lga_id: 'ibadan-north'` — the real ids use
 * underscores — and `employment_status: 'self_employed'`, which is a yes/no
 * question), and one answer written to a `select_multiple` as a scalar. The file
 * still went green, because every assertion it makes is about REACHABILITY and the
 * identity battery happened to carry enough real keys to be analysed. That is the
 * §2ak pattern — a test written from the author's idea of a submission rather than
 * from the schema — and it is what hid a dead password reset for eight months.
 *
 * Every name and value below is checked against the parsed fixture in `beforeAll`,
 * so this file now REDS if the form's vocabulary moves under it.
 *
 * The labour answers follow a real SKIP PATH (`employment_status: 'no'` →
 * `temp_absent` → `looking_for_work` → `available_for_work`); see the straight-
 * lining limitation test for why that matters.
 */
const MASTER_ANSWERS: Record<string, string> = {
  gender: 'female', marital_status: 'single', education_level: 'sss',
  disability_status: 'no', lga_id: 'ibadan_north',
  employment_status: 'no', temp_absent: 'no', looking_for_work: 'yes',
  main_occupation: 'Tailor',
};

/**
 * The PRIOR submission's answers differ from the one under test. The original
 * seeded the two identically, which made every duplicate comparison a trivial 1.0
 * exact match — the heuristic's easiest possible input, and not one that proves it
 * compares anything. These overlap partially, so `maxMatchRatio` is a real ratio.
 */
const PRIOR_ANSWERS: Record<string, string> = {
  gender: 'male', marital_status: 'married', education_level: 'nce_ond',
  disability_status: 'no', lga_id: 'akinyele',
  employment_status: 'yes', employment_type: 'self_employed', years_experience: '4_6',
  main_occupation: 'Welder',
};

/** Public Core carries its own subset of the same vocabulary. */
const PUBLIC_ANSWERS: Record<string, string> = {
  gender: 'female', lga_id: 'ibadan_north',
  employment_type: 'self_employed', years_experience: '4_6',
  main_occupation: 'Tailor',
};

/**
 * ⛔ THE GUARD THAT MAKES THE ABOVE A MEASUREMENT RATHER THAN A CLAIM. Asserting
 * the answers against the parsed schema is the only thing standing between this
 * file and a repeat of H2: invented keys score exactly like real ones in a
 * reachability assertion.
 */
function assertAnswersAreRealFor(schema: Record<string, unknown>, answers: Record<string, string>) {
  const questions = (schema.sections as Array<Record<string, unknown>>)
    .flatMap((s) => s.questions as Array<Record<string, unknown>>);
  const choiceLists = schema.choiceLists as Record<string, Array<{ value: string }>>;

  for (const [name, value] of Object.entries(answers)) {
    const q = questions.find((x) => x.name === name);
    expect(q, `question '${name}' does not exist on this form`).toBeDefined();
    if (q!.type === 'select_one') {
      const values = (choiceLists[q!.choices as string] ?? []).map((c) => c.value);
      expect(values, `'${value}' is not a choice of '${name}'`).toContain(value);
    } else {
      expect(q!.type, `'${name}' is not a scalar-answerable question`).toBe('text');
    }
  }
}

/** The parsed fixtures, kept so the answer-vocabulary guard can run against them. */
const schemas: Record<string, Record<string, unknown>> = {};

beforeAll(async () => {
  /*
   * ⛔ THE ROLE IS NAMED — 13-69 REVIEW H2. This used to be `FROM roles r LIMIT 1`,
   * which on the test DB can hand back `PERF_USER`. It did not matter to the
   * assertions only because this file writes `enumerator_id` itself; it matters to
   * whether the row this file seeds is the row prod produces, and
   * `submission-processing` writes `enumerator_id` ONLY for the enumerator role.
   */
  const [u] = (await db.execute(sql`
    INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
    SELECT gen_random_uuid(), ${`${TAG}@test.local`}, ${`${TAG} enumerator`}, r.id, 'active', 'local', now(), now()
    FROM roles r WHERE r.name = 'enumerator'
    RETURNING id
  `) as { rows: Array<{ id: string }> }).rows;
  expect(u, 'no `enumerator` role in this database — the seed did not run').toBeDefined();
  ids.enumerator = u.id;

  for (const [key, file] of [['master', 'oslsr_master_v3.xlsx'], ['public', 'oslsr-public-core-v1.xlsx']] as const) {
    const schema = nativeSchemaFor(file) as unknown as Record<string, unknown>;
    schemas[key] = schema;
    const [f] = (await db.execute(sql`
      INSERT INTO questionnaire_forms (id, form_id, version, title, status, file_hash, file_name,
                                       file_size, mime_type, form_schema, is_native, uploaded_by,
                                       created_at, updated_at)
      VALUES (gen_random_uuid(), ${`${TAG}-${key}`}, '1.0.0', ${`${TAG} ${key}`}, 'published',
              ${`${TAG}-${key}`}, ${file}, 1, 'application/vnd.ms-excel',
              ${JSON.stringify(schema)}::jsonb, true, ${ids.enumerator}::uuid, now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;
    ids[`form-${key}`] = f.id;
  }

  // H2 — every seeded answer is a real question with a real value on its form.
  assertAnswersAreRealFor(schemas.master, MASTER_ANSWERS);
  assertAnswersAreRealFor(schemas.master, PRIOR_ANSWERS);
  assertAnswersAreRealFor(schemas.public, PUBLIC_ANSWERS);

  /*
   * `chk_respondents_phone_number_e164` is `^\+234\d{10}$` and is a REAL constraint
   * on this table — a plausible-looking test number with the wrong digit count is
   * rejected at insert. Run-unique so a leaked row from a failed run cannot collide.
   */
  const phoneBase = String(Date.now()).slice(-8);
  let seq = 0;
  const respondent = async (first: string): Promise<string> => {
    const phone = `+2348${phoneBase}${seq++}`;
    const [r] = (await db.execute(sql`
      INSERT INTO respondents (id, first_name, last_name, phone_number, lga_id, source, status,
                               consent_marketplace, created_at, updated_at)
      VALUES (gen_random_uuid(), ${first}, ${TAG}, ${phone},
              ${`${TAG}-lga`}, 'enumerator', 'active', false, now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;
    return r.id;
  };

  /**
   * ⛔ `enumerator_id` MUST be set on the PRIOR submission too, and that is not
   * incidental. `loadSubmissionContext` scopes the duplicate heuristic's history
   * with `eq(submissions.enumerator_id, enumeratorId)` — with no prior row the
   * heuristic returns `no_data_or_history` and a confident zero, which would make
   * this file assert exactly the failure mode it exists to detect.
   */
  const fieldSubmission = async (
    key: string,
    respondentId: string,
    opts: { enumerator: boolean; form: string; completion: number; answers: Record<string, string>;
            /** 13-69 review M2 — the clerk/webapp shape: a submitter, but NO enumerator_id. */
            source?: 'enumerator' | 'public' | 'clerk'; submitterOnly?: string },
  ): Promise<string> => {
    const submitter = opts.enumerator ? ids.enumerator : (opts.submitterOnly ?? null);
    const enumerator = opts.enumerator ? ids.enumerator : null;
    const [s] = (await db.execute(sql`
      INSERT INTO submissions (id, respondent_id, submission_uid, questionnaire_form_id,
                               submitter_id, enumerator_id, raw_data,
                               gps_latitude, gps_longitude, completion_time_seconds,
                               submitted_at, ingested_at, source, processed, created_at, updated_at)
      VALUES (gen_random_uuid(), ${respondentId}::uuid, ${`${TAG}-${key}`}, ${opts.form},
              ${submitter}, ${enumerator},
              ${JSON.stringify(opts.answers)}::jsonb,
              NULL, NULL, ${opts.completion},
              now(), now(), ${opts.source ?? (opts.enumerator ? 'enumerator' : 'public')}, true, now(), now())
      RETURNING id
    `) as { rows: Array<{ id: string }> }).rows;
    return s.id;
  };

  ids['resp-prior'] = await respondent('Prior');
  ids['sub-prior'] = await fieldSubmission('prior', ids['resp-prior'], {
    enumerator: true, form: ids['form-master'], completion: 900, answers: PRIOR_ANSWERS,
  });

  ids['resp-field'] = await respondent('Field');
  ids['sub-field'] = await fieldSubmission('field', ids['resp-field'], {
    enumerator: true, form: ids['form-master'], completion: 800, answers: MASTER_ANSWERS,
  });

  ids['resp-public'] = await respondent('Public');
  ids['sub-public'] = await fieldSubmission('public', ids['resp-public'], {
    enumerator: false, form: ids['form-public'], completion: 600, answers: PUBLIC_ANSWERS,
  });

  /*
   * 13-69 REVIEW M2 — the CLERK/WEBAPP shape, which the story's per-channel table
   * omitted entirely. `determineSubmitterRole` maps five of the seven prod roles to
   * `clerk`, and `submission-processing` writes `enumerator_id` ONLY for the
   * enumerator role — so these rows carry a submitter and no enumerator. The
   * ungate scores them too, and this seeds one so what they actually reach is
   * pinned rather than assumed.
   */
  const [clerkUser] = (await db.execute(sql`
    INSERT INTO users (id, email, full_name, role_id, status, auth_provider, created_at, updated_at)
    SELECT gen_random_uuid(), ${`${TAG}-clerk@test.local`}, ${`${TAG} clerk`}, r.id, 'active', 'local', now(), now()
    FROM roles r WHERE r.name = 'data_entry_clerk'
    RETURNING id
  `) as { rows: Array<{ id: string }> }).rows;
  expect(clerkUser, 'no `data_entry_clerk` role in this database').toBeDefined();
  ids.clerk = clerkUser.id;

  ids['resp-clerk'] = await respondent('Clerk');
  ids['sub-clerk'] = await fieldSubmission('clerk', ids['resp-clerk'], {
    enumerator: false, submitterOnly: ids.clerk, source: 'clerk',
    form: ids['form-master'], completion: 700, answers: MASTER_ANSWERS,
  });

  // Driven through the REAL producer rather than a hand-made job — see the
  // end-to-end describe block below.
  ids['resp-joined'] = await respondent('Joined');
  ids['sub-joined'] = await fieldSubmission('joined', ids['resp-joined'], {
    enumerator: true, form: ids['form-master'], completion: 750, answers: MASTER_ANSWERS,
  });
});

afterAll(async () => {
  await db.execute(sql`
    DELETE FROM fraud_detections WHERE submission_id IN
      (SELECT id FROM submissions WHERE submission_uid LIKE ${`${TAG}-%`})
  `);
  await db.execute(sql`DELETE FROM submissions WHERE submission_uid LIKE ${`${TAG}-%`}`);
  await db.execute(sql`DELETE FROM respondents WHERE last_name = ${TAG}`);
  await db.execute(sql`DELETE FROM questionnaire_forms WHERE form_id LIKE ${`${TAG}-%`}`);
  await db.execute(sql`DELETE FROM users WHERE email LIKE ${`${TAG}%`}`);
});

/** Read a detection back FROM THE COLUMNS. Nothing here trusts the engine's return. */
async function storedDetectionFor(submissionId: string) {
  const res = (await db.execute(sql`
    SELECT gps_score, speed_score, straightline_score, duplicate_score, timing_score,
           gps_details, speed_details, straightline_details, duplicate_details, timing_details
    FROM fraud_detections WHERE submission_id = ${submissionId}::uuid
  `)) as { rows: Array<Record<string, unknown>> };
  expect(res.rows).toHaveLength(1);
  return res.rows[0];
}

describe('13-69 — the producer and the worker, joined end to end (AC1)', () => {
  /**
   * ⭐ THE RED-VERIFY ANCHOR FOR THE UNGATE ITSELF, and the reason this test does
   * not simply call the worker with a hand-made job.
   *
   * The rest of this file proves the ENGINE reaches its computations; it would
   * stay green with the `if (args.gps)` gate fully restored, because it invokes
   * the processor directly. So this one test drives the REAL producer
   * (`runPostSubmissionSideEffects`, with `gps: null` — exactly what the public
   * wizard and every GPS-less enumerator submission pass) and then feeds the job
   * it actually enqueued into the REAL worker. Restore the gate and no job is
   * produced: the expectation below fails, and so does everything downstream of
   * the captured job. That is the mutation this story's AC1 asks for.
   */
  it('a GPS-less side-effects run enqueues a job the worker can process', async () => {
    enqueued.length = 0;

    await SubmissionProcessingService.runPostSubmissionSideEffects({
      respondentId: ids['resp-joined'],
      submissionId: ids['sub-joined'],
      email: null,
      status: 'active',
      isNew: false,
      consentMarketplace: false,
      gps: null,
    });

    const fraudJobs = enqueued.filter((j) => j.queue === 'fraud-detection');
    expect(fraudJobs).toHaveLength(1);
    expect(fraudJobs[0].data).toEqual({
      submissionId: ids['sub-joined'],
      respondentId: ids['resp-joined'],
    });

    // …and the job that producer actually built is one the worker can complete.
    const result = await runWorker({ id: `${TAG}-joined`, data: fraudJobs[0].data });
    expect(result).toMatchObject({ processed: true, submissionId: ids['sub-joined'] });

    const stored = await storedDetectionFor(ids['sub-joined']);
    expect(stored.gps_details).toEqual({ reason: 'no_gps_data' });

    /*
     * 13-69 REVIEW L2 — AND THE DETECTORS ARE ASSERTED ON *THIS* PATH, not only on
     * the directly-driven one. This is the single test that reds when the gate
     * comes back, so it is the only place where "a real producer ran and the
     * detectors reached their computation" is one claim rather than two. Without
     * these four lines the mutation-proof test proved a row existed and nothing
     * about what was in it.
     */
    expect(stored.timing_details).toHaveProperty('watHour');
    expect(stored.speed_details).toHaveProperty('tier');
    expect(stored.speed_details).not.toHaveProperty('reason');
    expect(stored.duplicate_details).not.toHaveProperty('reason');
    expect(stored.straightline_details).not.toHaveProperty('reason');
  });
});

describe('13-69 — an ungated, GPS-less submission is scored (AC1, AC5)', () => {
  /**
   * ⛔ THE COORDINATE KEYS ARE ABSENT, NOT NULL. That is the shape the ungated
   * producer now sends, and the point of the assertion is that nothing on the
   * path reads them: the worker destructures only `submissionId` and
   * `respondentId`, and `FraudEngine.evaluate` re-loads GPS from the submission
   * row. `FraudDetectionJobData` has typed them optional all along — the brief's
   * warning that they were REQUIRED, and that a removed gate would therefore open
   * onto a throwing path, does not match the code.
   */
  it('completes the worker and writes a row for a job carrying no coordinates at all', async () => {
    const result = await runWorker({
      id: `${TAG}-field`,
      data: { submissionId: ids['sub-field'], respondentId: ids['resp-field'] },
    });

    expect(result).toMatchObject({ processed: true, submissionId: ids['sub-field'] });

    const stored = (await db.execute(sql`
      SELECT count(*)::int AS n FROM fraud_detections WHERE submission_id = ${ids['sub-field']}::uuid
    `)) as { rows: Array<{ n: number }> };
    expect(stored.rows[0].n).toBe(1);
  });
});

describe('13-69 — the four non-GPS detectors REACH their computation (AC2)', () => {
  /*
   * Each assertion pairs a computed field with the absence of that heuristic's
   * "could not measure" marker. Asserting only the score would pass on a zero the
   * detector never earned — which is the whole defect.
   */
  it('timing scored from the submission clock alone', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    const timing = d.timing_details as Record<string, unknown>;
    expect(timing).toHaveProperty('watHour');
    expect(typeof timing.watHour).toBe('number');
    expect(timing).not.toHaveProperty('reason');
  });

  it('speed reached a tier instead of reporting no completion time', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    const speed = d.speed_details as Record<string, unknown>;
    expect(speed).toHaveProperty('tier');
    expect(speed.completionTimeSeconds).toBe(800);
    expect(speed).not.toHaveProperty('reason');
  });

  it('straight-lining found and analysed a real battery on the master form', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    const sl = d.straightline_details as Record<string, unknown>;
    expect(sl).not.toHaveProperty('reason'); // not `no_batteries_found`
    expect(Number(sl.analyzedBatteries)).toBeGreaterThanOrEqual(1);
  });

  it('duplicate compared against the enumerator’s own history', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    const dup = d.duplicate_details as Record<string, unknown>;
    expect(dup).not.toHaveProperty('reason'); // not `no_data_or_history`
    expect(Number(dup.comparedSubmissions)).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⛔ AND GPS MUST SAY WHY IT IS ZERO (AC4). "Scored and found nothing" and
   * "could not score" are the same number in the score column, and telling them
   * apart is the difference between a working control and this story. The marker
   * is `no_gps_data` — the vocabulary that shipped with the heuristic — and is
   * deliberately NOT renamed to the brief's `no_gps_captured`: one condition with
   * two names is a reader who cannot tell whether they mean the same thing.
   */
  it('gps records WHY it scored zero, read back from the column', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    expect(Number(d.gps_score)).toBe(0);
    expect(d.gps_details).toEqual({ reason: 'no_gps_data' });
  });
});

describe('13-69 REVIEW H1 — straight-lining REACHES its computation and still cannot score', () => {
  /**
   * ⛔ THE UNCOMFORTABLE HALF OF THIS STORY, PINNED SO IT CANNOT BE FORGOTTEN.
   *
   * AC2 asks that each detector REACH its computation, and straight-lining does:
   * `analyzedBatteries >= 1`, no `no_batteries_found`. But on `oslsr_master_v3`
   * reaching it is all it can do, for two independent structural reasons measured
   * against the real form:
   *
   *   1. IDENTITY BATTERY (the only one that is ever analysed) — its five
   *      `select_one` questions draw on five DISJOINT choice lists (gender_list,
   *      marital_list, edu_list, yes_no, lga_list) with not one value in common.
   *      PIR — the share of identical answers — therefore cannot exceed 0.2 against
   *      a 0.8 threshold, and entropy cannot fall below 2.32 against a 0.5
   *      threshold. No respondent, however lazy, can trip either.
   *   2. LABOUR BATTERY — 6 `select_one`, so `identifyBatteries` counts it, but its
   *      skip logic lets a respondent answer at most FOUR of them (measured over
   *      every path through employment_status → temp_absent → looking_for_work →
   *      available_for_work). The heuristic needs `minBatterySize` (5) ANSWERED, so
   *      it `continue`s — silently, with no `reason` in the details. A real
   *      straight-liner answering "no / no / no / no" down that whole battery is
   *      discarded before the PIR of 1.0 is ever computed.
   *
   * So the honest enumerator-channel claim is THREE detectors (timing, speed,
   * duplicate) plus a fourth that runs and is structurally incapable of firing.
   * This is recorded as residual R5 rather than fixed here: the fix belongs in
   * `fraud-heuristics/`, which AC10 puts out of scope, and it is a threshold/design
   * question of R-A8's kind. The test exists so that (a) nobody reads a zero
   * `straightline_score` as evidence of clean data, and (b) if anyone ever
   * restructures the form or the heuristic, this reds and the residual closes.
   */
  it('analyses exactly one battery on the master form, and scores zero doing it', async () => {
    const d = await storedDetectionFor(ids['sub-field']);
    const sl = d.straightline_details as Record<string, unknown>;

    // Reached (AC2) …
    expect(sl).not.toHaveProperty('reason');
    expect(Number(sl.batteryCount)).toBe(2);
    // … but only ONE of the two is ever analysed: the labour battery's skip logic
    // caps a real respondent at 4 of its 6 questions, below minBatterySize.
    expect(Number(sl.analyzedBatteries)).toBe(1);
    expect(Number(sl.flaggedBatteries)).toBe(0);
    expect(Number(d.straightline_score)).toBe(0);

    // The ceiling, stated as an assertion rather than as a comment: the identity
    // battery's five questions have no shared choice value, so PIR maxes out at
    // 1/5 and entropy bottoms out well above the threshold.
    const battery = (sl.batteryResults as Array<Record<string, unknown>>)[0];
    expect(Number(battery.pir)).toBeLessThanOrEqual(0.2);
    expect(Number(battery.entropy)).toBeGreaterThan(
      Number((sl.thresholds as Record<string, unknown>).entropyThreshold),
    );
  });
});

describe('13-69 REVIEW M2 — the CLERK/WEBAPP channel, which the story did not name', () => {
  /**
   * Five of the seven prod roles map to `clerk` (`determineSubmitterRole`), and
   * their submissions carry a `submitter_id` but NO `enumerator_id` — the column
   * `submission-processing` writes only for the enumerator role. The engine falls
   * back to the submitter for ATTRIBUTION (`enumeratorId ?? submitterId`), so the
   * detection row is filed under the clerk's uuid, but the duplicate heuristic's
   * history query keys on `submissions.enumerator_id`, which is null for every one
   * of their rows — so it finds nothing to compare against and says so.
   *
   * Ungating scores this channel too. What it buys there is timing + speed, the
   * same as the public channel and for a different reason. Pinned here so the next
   * person to read a clerk detection's zeroes does not re-run this investigation.
   */
  it('reaches timing + speed, files under the submitter, and cannot reach duplicate', async () => {
    const result = await runWorker({
      id: `${TAG}-clerk`,
      data: { submissionId: ids['sub-clerk'], respondentId: ids['resp-clerk'] },
    });
    expect(result).toMatchObject({ processed: true });

    const d = await storedDetectionFor(ids['sub-clerk']);
    expect(d.timing_details).toHaveProperty('watHour');
    expect(d.speed_details).toHaveProperty('tier');
    expect(d.speed_details).not.toHaveProperty('reason');
    expect(d.duplicate_details).toMatchObject({ reason: 'no_data_or_history' });

    const [row] = ((await db.execute(sql`
      SELECT enumerator_id FROM fraud_detections WHERE submission_id = ${ids['sub-clerk']}::uuid
    `)) as { rows: Array<{ enumerator_id: string | null }> }).rows;
    expect(row.enumerator_id).toBe(ids.clerk);
  });
});

describe('13-69 — what the PUBLIC channel can and cannot measure (AC3)', () => {
  /**
   * ⛔ THIS IS A RECORD OF A LIMITATION, NOT A TARGET TO FIX HERE.
   *
   * The brief's claim was "duplicate, straightline, timing and speed all score on
   * a GPS-less submission, on both channels". On the public channel two of those
   * four are structurally unmeasurable and always will be, until someone changes
   * a form or a data model:
   *
   *   - straight-lining needs one section with >=5 `select_one`; the pinned Public
   *     Core form's largest has 3, so `identifyBatteries` returns [].
   *   - duplicate compares against the submitter's own recent submissions; the
   *     wizard writes `enumerator_id = null` AND `submitter_id = null`
   *     (`registration.controller.ts`), so there is no history to key on.
   *
   * Ungating still takes the public channel from nothing to timing + speed. This
   * test exists so the next person to read a public detection's three zeroes finds
   * a stated reason instead of concluding the engine is dark again — and so that
   * if either form or writer ever changes, they find out here.
   */
  it('scores timing and speed, and names the two it cannot reach', async () => {
    const result = await runWorker({
      id: `${TAG}-public`,
      data: { submissionId: ids['sub-public'], respondentId: ids['resp-public'] },
    });
    expect(result).toMatchObject({ processed: true });

    const d = await storedDetectionFor(ids['sub-public']);

    // Reached:
    expect(d.timing_details).toHaveProperty('watHour');
    expect(d.speed_details).toHaveProperty('tier');
    expect(d.speed_details).not.toHaveProperty('reason');

    // Structurally unreachable — and SAYING SO, which is the only acceptable zero:
    expect(d.straightline_details).toMatchObject({ reason: 'no_batteries_found' });
    expect(d.duplicate_details).toMatchObject({ reason: 'no_data_or_history' });
    expect(d.gps_details).toEqual({ reason: 'no_gps_data' });
  });
});
