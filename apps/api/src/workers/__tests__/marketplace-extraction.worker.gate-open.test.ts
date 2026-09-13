/**
 * Story 13-58 — [AI-Review][Medium] 2026-09-08.
 *
 * ⭐ THE COHORT'S OWN STATUS, WHICH NOTHING ELSE TESTS.
 *
 * Every association test in `marketplace-extraction.worker.test.ts` seeds
 * `status: 'active'`. The 8,278 people this story exists for are
 * `imported_unverified`, and the worker returns at the `PIPELINE_EXCLUDED_STATUSES`
 * gate (`marketplace-extraction.worker.ts:211`) BEFORE it ever reaches the
 * association derivation (`:249`). So the whole suite could stay green while the
 * derivation carried a status or source predicate that drops the entire cohort.
 *
 * This story's ordering argument — build the badge BEFORE opening the gate, so the
 * profiles are not created badge-less — rests on exactly one claim: that when the
 * gate opens, extraction carries the name for an `imported_unverified` respondent.
 * Nothing pinned that claim. This file does, by opening the gate in a module mock
 * and asserting the upsert on the other side of it.
 *
 * ⚠️ It is a SEPARATE FILE on purpose: the mock below rewrites
 * `PIPELINE_EXCLUDED_STATUSES` for the whole module graph, and the sibling file's
 * gate behaviour must keep testing the REAL constant.
 *
 * ✅ UPDATE — 13-2 R-A2 (2026-09-12): the REAL gate is now open for
 * `imported_unverified`, so this file no longer stands alone against production.
 * The mock is kept deliberately: it pins the DERIVATION (does extraction carry the
 * vouch at that status?) independently of the constant, so the two concerns cannot
 * fail as one. The third test asserts the real constant and is the tripwire.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

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
}));

vi.mock('ioredis', () => ({
  Redis: class MockRedis { constructor() { /* no-op */ } },
}));

vi.mock('uuidv7', () => ({ uuidv7: () => 'mock-uuid-v7' }));

/**
 * The gate, opened — and ONLY the gate. Everything else in the schema module is
 * the real thing (`importActual`), so the `respondents` table object the worker
 * builds its query from is genuine and a drift here still reds.
 */
vi.mock('../../db/schema/respondents.js', async () => {
  const actual = await vi.importActual<typeof import('../../db/schema/respondents.js')>(
    '../../db/schema/respondents.js',
  );
  return { ...actual, PIPELINE_EXCLUDED_STATUSES: [] as string[] };
});

const mockFindFirstSubmission = vi.fn();
const mockFindFirstRespondent = vi.fn();
const mockFindFirstLga = vi.fn();
const mockSelect = vi.fn();
const mockInsert = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      submissions: { findFirst: (...args: unknown[]) => mockFindFirstSubmission(...args) },
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
      lgas: { findFirst: (...args: unknown[]) => mockFindFirstLga(...args) },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

await import('../marketplace-extraction.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

function setupDbMocks(respondent: Record<string, unknown>) {
  mockFindFirstSubmission.mockResolvedValue({
    id: 'sub-001',
    rawData: { skills_possessed: 'farming' },
  });
  mockFindFirstRespondent.mockResolvedValue(respondent);
  mockFindFirstLga.mockResolvedValue(null);

  const limitFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const innerJoinFn = vi.fn().mockReturnValue({ where: whereFn });
  const fromFn = vi.fn().mockReturnValue({ innerJoin: innerJoinFn });
  mockSelect.mockReturnValue({ from: fromFn });

  const onConflictFn = vi.fn().mockResolvedValue(undefined);
  const valuesFn = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictFn });
  mockInsert.mockReturnValue({ values: valuesFn });

  return { valuesFn, onConflictFn };
}

describe('marketplace-extraction — the imported cohort, once the gate opens (13-58)', () => {
  beforeEach(() => {
    mockFindFirstSubmission.mockReset();
    mockFindFirstRespondent.mockReset();
    mockFindFirstLga.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
  });

  /**
   * The claim the story's ordering rests on. `imported_unverified` is the status of
   * all 8,278; if the vouch did not survive it, they would materialise badge-less
   * and need a second production backfill over live rows — the exact cost the
   * sequencing was designed to avoid.
   */
  it('carries the association name for an imported_unverified respondent', async () => {
    const mocks = setupDbMocks({
      id: 'resp-001',
      status: 'imported_unverified',
      consentMarketplace: true,
      consentEnriched: false,
      lgaId: null,
      metadata: { association_name: 'AFAN' },
    });

    await processorFn({ id: 'job-001', data: { submissionId: 'sub-001', respondentId: 'resp-001' } });

    expect(mocks.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ associationName: 'AFAN' }),
    );
  });

  /**
   * The discriminating twin, at the cohort's own status: an imported respondent whose
   * metadata carries NO name still gets a CARD, with no vouch on it. Without this, a
   * worker that wrote a constant name would pass the test above.
   *
   * ⚖️ The card itself is the ruled outcome (13-58; re-affirmed by Awwal 2026-09-13):
   * no vouch means no badge, never no card. A 13-2 R-A2 review briefly inverted this
   * test to refuse the profile; that guard was rejected and removed. Asserting the
   * INSERT (not merely the null) is what keeps it from coming back unnoticed.
   */
  it('writes a badge-less profile for an imported_unverified respondent with no vouch', async () => {
    const mocks = setupDbMocks({
      id: 'resp-002',
      status: 'imported_unverified',
      consentMarketplace: true,
      consentEnriched: false,
      lgaId: null,
      metadata: { normalisation_warnings: ['phone_reformatted'] },
    });

    await processorFn({ id: 'job-002', data: { submissionId: 'sub-001', respondentId: 'resp-002' } });

    expect(mocks.valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ associationName: null }),
    );
  });

  /**
   * ⭐ THE TRIPWIRE, INVERTED BY 13-2 R-A2 (2026-09-12).
   *
   * Until R-A2 this asserted the REAL constant was still SHUT, so that this file —
   * which opens the gate in a module mock — could not be misread as evidence that
   * production was open. R-A2 is the story that opens it, so the assertion flips:
   * `imported_unverified` must now be ABSENT from the real constant.
   *
   * It is deliberately still an assertion on `importActual`, not on the mock. That
   * is what makes it a tripwire rather than a tautology: it is the one test in the
   * suite that fails if the gate change is reverted or never made, and the two
   * tests above would keep passing either way because they read the mocked value.
   *
   * ⛔ `rolled_back` STAYS EXCLUDED — it is a 14-day soft-delete, not a trust tier.
   * Asserted explicitly because a change that opened the whole array (`[]`) would
   * satisfy every other assertion in this story while silently republishing every
   * retracted batch.
   */
  it('has the real gate OPEN for imported_unverified and STILL SHUT for rolled_back (13-2 R-A2)', async () => {
    const actual = await vi.importActual<typeof import('../../db/schema/respondents.js')>(
      '../../db/schema/respondents.js',
    );

    expect(actual.PIPELINE_EXCLUDED_STATUSES).not.toContain('imported_unverified');
    expect(actual.PIPELINE_EXCLUDED_STATUSES).toContain('rolled_back');
  });
});
