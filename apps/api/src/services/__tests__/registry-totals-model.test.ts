import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockExecute(...args) },
}));

import {
  getRegistryTotals,
  deriveCompleteness,
  deriveVerification,
  answeredFieldDenominator,
  assertAxesPartition,
  EMPTY_ANSWER_TEXTS,
  REGISTRY_DEEP_FIELD_MARKERS,
  REGISTRY_CORE_FIELD_MARKERS,
} from '../registry-totals.service.js';
import { sqlToText } from './sql-text.test-helpers.js';
import { REGISTRY_DATA_STATUSES } from '../registry-data-status.js';
import { respondentSourceTypes } from '../../db/schema/respondents.js';

/**
 * Story 12-4 — the registryTotals aggregate model.
 *
 * Mocked-DB unit coverage. The raw-SQL ↔ live-schema parity is proven separately
 * by `registry-totals-db-smoke.integration.test.ts`.
 *
 * `getRegistryTotals` issues exactly TWO `db.execute` calls inside one
 * `Promise.all` — (1) the unified rows, (2) the draft count — so the mock is
 * primed in that order.
 */

type Row = Record<string, unknown>;

const row = (over: Row = {}): Row => ({
  respondent_id: `r-${Math.random().toString(36).slice(2)}`,
  lga_id: 'ibadan_north',
  source: 'public',
  status: 'active',
  nin: null,
  phone_number: null,
  metadata: null,
  consent_marketplace: false,
  consent_enriched: false,
  created_at: '2026-06-01T00:00:00.000Z',
  raw_data: null,
  ...over,
});

/** A row that lands in each of the four documented buckets. */
const completed = (over: Row = {}) => row({ raw_data: { gender: 'female' }, ...over });
const dataLost = (over: Row = {}) =>
  row({ metadata: { questionnaire_data_lost: true }, ...over });
const pendingNin = (over: Row = {}) => row({ status: 'pending_nin_capture', ...over });
const noSubmission = (over: Row = {}) => row({ ...over });

/**
 * `getRegistryTotals` issues THREE `db.execute` calls inside one `Promise.all`:
 * (1) the unified rows, (2) the non-expired drafts' phones, (3) every
 * registered phone — (2) and (3) are reconciled in TS so a draft that has since
 * become a registry record drops out of the funnel.
 */
function prime(
  rows: Row[],
  draftPhones: (string | null)[] = [],
  registeredPhones: (string | null)[] = [],
) {
  mockExecute
    .mockResolvedValueOnce({ rows })
    .mockResolvedValueOnce({ rows: draftPhones.map((phone) => ({ phone })) })
    .mockResolvedValueOnce({
      rows: registeredPhones.map((phone_number) => ({ phone_number })),
    });
}

describe('getRegistryTotals (Story 12-4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC2 — return shape and the sum invariant', () => {
    it('zero-fills EVERY canonical status, even absent ones', async () => {
      prime([completed()]);
      const totals = await getRegistryTotals();

      for (const status of REGISTRY_DATA_STATUSES) {
        expect(totals.byDataStatus).toHaveProperty(status);
        expect(typeof totals.byDataStatus[status]).toBe('number');
      }
      expect(totals.byDataStatus.nin_unavailable).toBe(0);
    });

    it('is keyed from REGISTRY_DATA_STATUSES, so a new status flows through without a 12-4 edit', async () => {
      prime([completed()]);
      const totals = await getRegistryTotals();
      expect(Object.keys(totals.byDataStatus).sort()).toEqual([...REGISTRY_DATA_STATUSES].sort());
    });

    it('every axis sums to totalRespondents', async () => {
      prime([completed(), dataLost(), pendingNin(), noSubmission(), completed()]);
      const totals = await getRegistryTotals();

      const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
      expect(sum(totals.byDataStatus)).toBe(totals.totalRespondents);
      expect(sum(totals.byCompleteness)).toBe(totals.totalRespondents);
      expect(sum(totals.byVerification)).toBe(totals.totalRespondents);
      expect(sum(totals.bySource)).toBe(totals.totalRespondents);
    });
  });

  describe('AC4 — reproduces the documented prod split shape', () => {
    /**
     * Scaled representative counts, as AC4 permits. The story's literal
     * 139 = 76+55+7+1 is from 2026-06-15 and the register has since passed 300
     * — asserting those numbers would encode a stale measurement as a
     * requirement. What must hold is the SHAPE: each branch reachable, and the
     * parts summing to the whole.
     */
    it('tallies completed / data_lost / no_submission / pending_nin and sums to the total', async () => {
      prime([
        ...Array.from({ length: 7 }, () => completed()),
        ...Array.from({ length: 5 }, () => dataLost()),
        ...Array.from({ length: 3 }, () => noSubmission()),
        pendingNin(),
      ]);

      const totals = await getRegistryTotals();

      expect(totals.byDataStatus.completed).toBe(7);
      expect(totals.byDataStatus.data_lost).toBe(5);
      expect(totals.byDataStatus.no_submission).toBe(3);
      expect(totals.byDataStatus.pending_nin).toBe(1);
      expect(totals.totalRespondents).toBe(16);
      expect(
        Object.values(totals.byDataStatus).reduce((a, b) => a + b, 0),
      ).toBe(totals.totalRespondents);
    });

    it('exposes the funnel head 12-6 needs (withAnswers === byDataStatus.completed)', async () => {
      prime([completed(), completed(), dataLost()]);
      const totals = await getRegistryTotals();
      expect(totals.withAnswers).toBe(2);
      expect(totals.withAnswers).toBe(totals.byDataStatus.completed);
      expect(totals.totalRespondents).toBe(3);
    });

    it('counts the imported branch by source prefix as well as by status', async () => {
      prime([
        row({ status: 'imported_unverified' }),
        row({ source: 'imported_association' }),
      ]);
      const totals = await getRegistryTotals();
      expect(totals.byDataStatus.imported).toBe(2);
    });
  });

  describe('AC7 — the axes come from RAW FIELDS, not from the flat atom', () => {
    /**
     * ⭐ THE REGRESSION LOCK FOR THIS STORY'S NAMED TRAP.
     *
     * `deriveDataStatus` picks ONE label by precedence, so a respondent who has
     * answers AND deferred their NIN is labelled only `completed` — the
     * NIN-deferral fact is discarded. If a dev ever derives Axis-3 FROM that
     * flat value, `pending_nin` silently under-reports. This asserts the two
     * facts coexist.
     */
    it('keeps completeness and verification orthogonal — a completed row can still be pending_nin', async () => {
      prime([completed({ status: 'pending_nin_capture' })]);
      const totals = await getRegistryTotals();

      expect(totals.byDataStatus.completed).toBe(1);
      expect(totals.byDataStatus.pending_nin).toBe(0); // precedence collapsed it...
      expect(totals.byVerification.pending_nin).toBe(1); // ...but Axis-3 preserved it
    });

    it('separates a deep enumerator row from a Public-Core row that the flat atom calls identical', async () => {
      prime([
        completed({ raw_data: { gender: 'female', household_size: '4' } }), // deep
        completed({ raw_data: { gender: 'male', main_occupation: 'tailor' } }), // core only
      ]);
      const totals = await getRegistryTotals();

      expect(totals.byDataStatus.completed).toBe(2); // flat atom cannot tell them apart
      expect(totals.byCompleteness.full).toBe(1);
      expect(totals.byCompleteness.core).toBe(1);
    });

    it('breaks down by source (Axis-1)', async () => {
      prime([row({ source: 'public' }), row({ source: 'enumerator' }), row({ source: 'public' })]);
      const totals = await getRegistryTotals();
      expect(totals.bySource.public).toBe(2);
      expect(totals.bySource.enumerator).toBe(1);
    });

    it('zero-fills every KNOWN channel, so an empty one reads 0 instead of vanishing (AC7.1)', async () => {
      prime([row({ source: 'public' })]);
      const totals = await getRegistryTotals();

      for (const source of respondentSourceTypes) {
        expect(totals.bySource).toHaveProperty(source);
      }
      expect(totals.bySource.imported_association).toBe(0);
    });

    it('stays open-ended — a channel the enum does not know yet still counts', async () => {
      prime([row({ source: 'some_future_channel' })]);
      const totals = await getRegistryTotals();
      expect(totals.bySource.some_future_channel).toBe(1);
      expect(totals.totalRespondents).toBe(1);
    });

    it('never emits a `verified` tier — NIN is captured, not validated (AC9)', async () => {
      prime([row({ nin: '12345678901' })]);
      const totals = await getRegistryTotals();

      expect(totals.byVerification.nin_on_file).toBe(1);
      expect(totals.byVerification).not.toHaveProperty('verified');
    });
  });

  describe('AC2 — identity resolution (R2 key: NIN → E.164 phone → id)', () => {
    it('merges two rows carrying the SAME NIN into one person', async () => {
      prime([
        row({ respondent_id: 'a', nin: '12345678901', raw_data: { gender: 'female' } }),
        row({ respondent_id: 'b', nin: '12345678901' }),
      ]);
      const totals = await getRegistryTotals();

      expect(totals.totalRespondents).toBe(1);
      // Answers survive the merge — one row had them.
      expect(totals.byDataStatus.completed).toBe(1);
      expect(totals.identityAmbiguous).toBe(0);
    });

    /**
     * ⚠️ THE PHONE RUNG DETECTS, IT DOES NOT MERGE — and that is deliberate.
     *
     * AC2 names the key as NIN → E.164 phone → id, but it ALSO rules that a
     * household sharing one handset must not be merged. Both cannot hold: a
     * repeated phone is either one person registered twice (13-49 produced
     * exactly these) or several people on one handset, and NOTHING in the data
     * separates them — names are not fields (§2q).
     *
     * Given the two error directions, the ruled one is chosen: merging a
     * household would DELETE real citizens from the register, so collisions are
     * counted separately and reported through `identityAmbiguous` instead.
     * Normalisation still matters — it is what makes the collision VISIBLE
     * across differing input formats.
     */
    it('DETECTS a phone collision across differing input formats rather than merging it', async () => {
      prime([
        row({ respondent_id: 'a', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', phone_number: '08012345678' }),
      ]);
      const totals = await getRegistryTotals();

      expect(totals.totalRespondents).toBe(2);
      // Both formats normalised to the same key — which is how we know to flag.
      expect(totals.identityAmbiguous).toBe(2);
    });

    it('does not flag two DIFFERENT phones as a collision', async () => {
      prime([
        row({ respondent_id: 'a', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', phone_number: '+2348011111111' }),
      ]);
      const totals = await getRegistryTotals();

      expect(totals.totalRespondents).toBe(2);
      expect(totals.identityAmbiguous).toBe(0);
    });

    it('does NOT merge a household sharing one handset — and reports the ambiguity', async () => {
      // Three people, one phone, no NINs. Merging would delete two citizens
      // from the register; AC2 forbids it.
      prime([
        row({ respondent_id: 'a', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', phone_number: '+2348012345678' }),
        row({ respondent_id: 'c', phone_number: '+2348012345678' }),
      ]);
      const totals = await getRegistryTotals();

      expect(totals.totalRespondents).toBe(3);
      expect(totals.identityAmbiguous).toBe(3);
    });

    it('counts a row with neither NIN nor phone as its own person, flagged ambiguous', async () => {
      prime([row({ respondent_id: 'a' }), row({ respondent_id: 'b' })]);
      const totals = await getRegistryTotals();
      expect(totals.totalRespondents).toBe(2);
      expect(totals.identityAmbiguous).toBe(2);
    });

    /**
     * ⭐ THE REGRESSION LOCK FOR THE DUPLICATE CLASS THIS REGISTER ACTUALLY HAS.
     *
     * Story 13-49's adoption deduped on the INCOMING NIN, so a no-NIN
     * self-registration matched nothing and 7 people ended up holding two rows:
     * one WITH a NIN, one without, same handset
     * ([[pattern-batch-job-races-live-users]]).
     *
     * A first-rung-wins key keys those two rows differently — `nin:…` and
     * `tel:…` — so they never meet, and the pair is neither merged NOR flagged:
     * invisible in both directions, in the field the story calls "the honest
     * uncertainty band on the headline". The phone rung is therefore computed
     * for every row, including NIN-bearing ones.
     */
    it('FLAGS a NIN row and a no-NIN row sharing one handset (the 13-49 shape)', async () => {
      prime([
        row({ respondent_id: 'a', nin: '12345678901', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', nin: null, phone_number: '08012345678' }),
      ]);
      const totals = await getRegistryTotals();

      // Still two people — nothing in the data proves they are one, and AC2
      // forbids guessing. But the uncertainty is now REPORTED.
      expect(totals.totalRespondents).toBe(2);
      expect(totals.identityAmbiguous).toBe(2);
    });

    it('does not flag a NIN holder whose phone nobody else shares', async () => {
      prime([
        row({ respondent_id: 'a', nin: '12345678901', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', nin: '10987654321', phone_number: '+2348011111111' }),
      ]);
      const totals = await getRegistryTotals();
      expect(totals.totalRespondents).toBe(2);
      expect(totals.identityAmbiguous).toBe(0);
    });

    it('never reports more ambiguity than there are people', async () => {
      prime([
        row({ respondent_id: 'a', nin: '12345678901', phone_number: '+2348012345678' }),
        row({ respondent_id: 'b', phone_number: '08012345678' }),
        row({ respondent_id: 'c', phone_number: '2348012345678' }),
      ]);
      const totals = await getRegistryTotals();
      expect(totals.identityAmbiguous).toBeLessThanOrEqual(totals.totalRespondents);
    });

    it('does not treat a malformed NIN as an identity key', async () => {
      // Format-only per 13-15; `123` is not 11 digits, so it must fall through
      // to the phone/id rungs rather than merging two unrelated people.
      prime([
        row({ respondent_id: 'a', nin: '123' }),
        row({ respondent_id: 'b', nin: '123' }),
      ]);
      const totals = await getRegistryTotals();
      expect(totals.totalRespondents).toBe(2);
    });
  });

  describe('AC8 — drafts are a funnel metric, never part of the total', () => {
    it('reports inProgressDrafts separately from totalRespondents', async () => {
      prime([completed(), completed()], Array.from({ length: 42 }, () => null));
      const totals = await getRegistryTotals();

      expect(totals.totalRespondents).toBe(2);
      expect(totals.inProgressDrafts).toBe(42);
      expect(
        Object.values(totals.byDataStatus).reduce((a, b) => a + b, 0),
      ).toBe(2); // drafts are NOT in any status bucket
    });

    /**
     * ⭐ "Non-expired" IS NOT "in progress".
     *
     * The self-serve path deletes a draft on registration, which made the two
     * look equivalent. Story 13-49's adoption programme deliberately does NOT
     * delete what it adopts ("doing nothing deletes it at expiry") and turned
     * ~174 drafts into registry records — so a raw non-expired count reports
     * hundreds of ALREADY-REGISTERED people as still in progress, printed
     * beside the very total that already contains them.
     */
    it('EXCLUDES a draft whose person has since registered', async () => {
      prime(
        [completed()],
        ['+2348012345678', '+2348022222222'], // two drafts
        ['+2348012345678'], // …one of them is now a respondent
      );
      const totals = await getRegistryTotals();
      expect(totals.inProgressDrafts).toBe(1);
    });

    it('matches the registered person across differing phone formats', async () => {
      // The draft stores what the user typed; the respondent column is E.164.
      // One normaliser (`normaliseNigerianPhone`) has to bridge them, or the
      // exclusion silently never fires.
      prime([completed()], ['08012345678'], ['+2348012345678']);
      expect((await getRegistryTotals()).inProgressDrafts).toBe(0);
    });

    it('still counts a draft with no usable phone — absence of proof is not proof', async () => {
      prime([completed()], [null, '   ', 'not-a-phone'], ['+2348012345678']);
      expect((await getRegistryTotals()).inProgressDrafts).toBe(3);
    });
  });

  describe('empty registry', () => {
    it('returns a fully zero-filled shape rather than throwing', async () => {
      prime([]);
      const totals = await getRegistryTotals();
      expect(totals.totalRespondents).toBe(0);
      expect(totals.withAnswers).toBe(0);
      expect(Object.values(totals.bySource).reduce((a, b) => a + b, 0)).toBe(0);
      expect(totals.byCompleteness.partial).toBe(0);
    });
  });
});

describe('assertAxesPartition — the invariant GUARD itself (AC2.1)', () => {
  /**
   * These exist because a RED-verify mutation that disarmed the invariant left
   * the suite GREEN: the "every axis sums to totalRespondents" tests assert the
   * safe OUTCOME and would have passed with the guard deleted
   * ([[pattern-test-that-passes-over-a-hole]]). Ask of any guard: would this
   * fail if I removed it? These now do.
   */
  it('throws when an axis under-counts the population', () => {
    expect(() => assertAxesPartition({ byDataStatus: { completed: 2 } }, 3))
      .toThrowError(/invariant breach: byDataStatus sums to 2, expected 3/);
  });

  it('throws when an axis over-counts the population', () => {
    expect(() => assertAxesPartition({ bySource: { public: 5 } }, 4))
      .toThrowError(/invariant breach/);
  });

  it('names the OFFENDING axis, not just the failure', () => {
    expect(() =>
      assertAxesPartition(
        { byDataStatus: { completed: 3 }, byVerification: { nin_on_file: 1 } },
        3,
      ),
    ).toThrowError(/byVerification/);
  });

  it('passes when every axis partitions the population exactly', () => {
    expect(() =>
      assertAxesPartition(
        { byDataStatus: { completed: 2, data_lost: 1 }, bySource: { public: 3 } },
        3,
      ),
    ).not.toThrow();
  });

  it('accepts an empty registry (0 === 0)', () => {
    expect(() => assertAxesPartition({ byDataStatus: {} }, 0)).not.toThrow();
  });
});

describe('deriveCompleteness (Axis-2, Story 12-4 AC7.2)', () => {
  it('classifies a deep-field row as full', () => {
    expect(deriveCompleteness({ household_size: '4' })).toBe('full');
  });

  it('classifies a core-only row as core', () => {
    expect(deriveCompleteness({ gender: 'female', main_occupation: 'tailor' })).toBe('core');
  });

  it('classifies an absent or empty submission as partial', () => {
    expect(deriveCompleteness(null)).toBe('partial');
    expect(deriveCompleteness({})).toBe('partial');
  });

  it('treats empty strings and empty arrays as unanswered', () => {
    expect(deriveCompleteness({ household_size: '', gender: '' })).toBe('partial');
    expect(deriveCompleteness({ skills_possessed: [] })).toBe('partial');
  });

  it('is form-agnostic: depth is decided by fields present, not by which form', () => {
    // Same instrument could produce either; only the CONTENT differs.
    const publicCoreShape = { surname: 'A', gender: 'male', skills_possessed: ['tailoring'] };
    const enumeratorShape = { ...publicCoreShape, monthly_income: '50000' };
    expect(deriveCompleteness(publicCoreShape)).toBe('core');
    expect(deriveCompleteness(enumeratorShape)).toBe('full');
  });

  it('keeps the two marker sets disjoint (a core field must never imply full)', () => {
    const deep = new Set<string>(REGISTRY_DEEP_FIELD_MARKERS);
    const overlap = REGISTRY_CORE_FIELD_MARKERS.filter((f) => deep.has(f));
    expect(overlap).toEqual([]);
  });
});

describe('deriveVerification (Axis-3, Story 12-4 AC9)', () => {
  it('reports a captured NIN as nin_on_file, never verified', () => {
    expect(deriveVerification({ nin: '12345678901' })).toBe('nin_on_file');
  });

  it('reports no NIN as self_declared', () => {
    expect(deriveVerification({ nin: null })).toBe('self_declared');
    expect(deriveVerification({ nin: '   ' })).toBe('self_declared');
  });

  it('reports a deferred NIN as pending_nin', () => {
    expect(deriveVerification({ status: 'pending_nin_capture' })).toBe('pending_nin');
  });

  it('surfaces a STALLED PROMOTE — pending_nin_capture wins even with a NIN present', () => {
    // The 13-53 seam. If the promote failed, that must stay visible rather than
    // be smoothed into nin_on_file.
    expect(deriveVerification({ nin: '12345678901', status: 'pending_nin_capture' }))
      .toBe('pending_nin');
  });

  it('classifies imported rows as unverified_import by status OR source prefix', () => {
    expect(deriveVerification({ status: 'imported_unverified' })).toBe('unverified_import');
    expect(deriveVerification({ source: 'imported_association' })).toBe('unverified_import');
    // AC9.2: 13-2's new enum value needs no 12-4 edit.
    expect(deriveVerification({ source: 'imported_itf_supa' })).toBe('unverified_import');
  });
});

/**
 * ⭐ ONE definition of "answered", spoken in two languages.
 *
 * TS `hasAnswer` (Axis-2) treated `[]` as unanswered while the SQL denominator
 * compared only against `''` — and `->>'skills_possessed'` renders an empty
 * array as the TEXT `'[]'`. So the same respondent could be `partial` on the
 * completeness axis AND counted as having answered in a published rate's
 * denominator. `skills_possessed` / `skills_other` are core markers, so it was
 * reachable, not theoretical.
 */
describe('EMPTY_ANSWER_TEXTS — the emptiness contract, both halves', () => {
  it('treats an empty array, object, string and whitespace as unanswered (TS half)', () => {
    expect(deriveCompleteness({ household_size: [] })).toBe('partial');
    expect(deriveCompleteness({ household_size: {} })).toBe('partial');
    expect(deriveCompleteness({ household_size: '   ' })).toBe('partial');
  });

  it('treats 0 and false as REAL answers — they are responses, not absences', () => {
    expect(deriveCompleteness({ household_size: 0 })).toBe('full');
    expect(deriveCompleteness({ has_business: false })).toBe('full');
  });

  it('excludes the SAME texts in the SQL half', () => {
    const text = sqlToText(answeredFieldDenominator('skills_possessed'));
    for (const empty of EMPTY_ANSWER_TEXTS) {
      expect(text).toContain(empty === '' ? 'NOT IN' : empty);
    }
    // A bare `<> ''` would let the text '[]' through — that was the drift.
    expect(text).not.toMatch(/<>\s*''\s*\)?\s*$/);
  });
});

describe('answeredFieldDenominator (ruling R-E)', () => {
  it('refuses a field name that is not code-controlled', () => {
    expect(() => answeredFieldDenominator("gender'; DROP TABLE respondents; --"))
      .toThrowError(/Unsafe raw_data field name/);
  });

  it('refuses an unsafe alias', () => {
    expect(() => answeredFieldDenominator('gender', 'ru; DROP TABLE x'))
      .toThrowError(/Unsafe alias/);
  });

  it('accepts an ordinary question name', () => {
    expect(() => answeredFieldDenominator('employment_status')).not.toThrow();
  });
});
