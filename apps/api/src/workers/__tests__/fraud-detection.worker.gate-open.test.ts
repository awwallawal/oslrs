/**
 * Story 13-2 R-A2 — the FRAUD half of the gate change.
 *
 * ⭐ WHY THIS FILE EXISTS, AND WHY IT IS NOT A COPY OF ITS MARKETPLACE SIBLING.
 *
 * `PIPELINE_EXCLUDED_STATUSES` is consulted by TWO workers —
 * `marketplace-extraction.worker.ts:211` and `fraud-detection.worker.ts:59`. R-A2
 * removes `imported_unverified` from it, so BOTH gates open in the same edit. The
 * marketplace side is pinned by `marketplace-extraction.worker.gate-open.test.ts`;
 * nothing pinned this side, which means the fraud gate could have been opened (or
 * later re-closed) with the whole suite staying green.
 *
 * ⚠️ Unlike the marketplace sibling, this file does NOT mock the constant open. It
 * asserts the REAL one, because after R-A2 the real gate IS open — so a module mock
 * would make the test pass whether or not the production change was ever made. Every
 * assertion here reds if the constant is reverted.
 *
 * ⛔ WHAT THIS FILE DELIBERATELY DOES NOT CLAIM. Passing the gate is not the same as
 * being scored. The engine is mocked here; that an imported row can actually be
 * SCORED, STORED and SEEN (nullable `enumerator_id`, the provenance-split registry,
 * a severity the heuristic can reach, the assessor queue's joins) is proven against
 * a real database in `services/__tests__/fraud-engine.imports.integration.test.ts`.
 * These tests pin exactly one thing: the gate no longer refuses the cohort.
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

vi.mock('../../lib/redis.js', () => ({
  createRedisConnection: () => ({}),
}));

const mockFindFirstRespondent = vi.fn();
const mockInsertValues = vi.fn();
const mockEvaluate = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      respondents: { findFirst: (...args: unknown[]) => mockFindFirstRespondent(...args) },
    },
    insert: () => ({ values: (...args: unknown[]) => mockInsertValues(...args) }),
  },
}));

vi.mock('../../services/fraud-engine.service.js', () => ({
  FraudEngine: { evaluate: (...args: unknown[]) => mockEvaluate(...args) },
}));

await import('../fraud-detection.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

/** A clean engine verdict, so the gate is the only thing under test. */
function cleanVerdict(submissionId: string) {
  return {
    submissionId,
    enumeratorId: '00000000-0000-0000-0000-0000000000ff',
    configVersion: 1,
    componentScores: { gps: 0, speed: 0, straightline: 0, duplicate: 0, timing: 0 },
    totalScore: 0,
    severity: 'clean',
    details: { gps: null, speed: null, straightline: null, duplicate: null, timing: null },
  };
}

describe('fraud-detection — the gate, after 13-2 R-A2', () => {
  beforeEach(() => {
    mockFindFirstRespondent.mockReset();
    mockInsertValues.mockReset();
    mockEvaluate.mockReset();
    mockInsertValues.mockResolvedValue(undefined);
  });

  /**
   * The change itself. Before R-A2 the worker returned `{processed:false}` at
   * `:59` without ever calling the engine; the 8,278 association rows were the
   * source most exposed to padded rolls and the one the engine never saw.
   */
  it('no longer refuses an imported_unverified respondent at the status gate', async () => {
    mockFindFirstRespondent.mockResolvedValue({ status: 'imported_unverified' });
    mockEvaluate.mockResolvedValue(cleanVerdict('sub-imported'));

    const result = await processorFn({
      id: 'job-1',
      data: { submissionId: 'sub-imported', respondentId: 'resp-imported' },
    });

    expect(mockEvaluate).toHaveBeenCalledWith('sub-imported');
    expect(result).toMatchObject({ processed: true, submissionId: 'sub-imported' });
  });

  /**
   * ⛔ THE DISCRIMINATING TWIN. `rolled_back` is a 14-day soft-delete, not a trust
   * tier: scoring a retracted batch would resurrect it into the fraud queue and the
   * supervisor surfaces that read it. Without this assertion, emptying the array
   * entirely would pass every other test in this story.
   */
  it('still refuses a rolled_back respondent at the status gate', async () => {
    mockFindFirstRespondent.mockResolvedValue({ status: 'rolled_back' });

    const result = await processorFn({
      id: 'job-2',
      data: { submissionId: 'sub-rolled', respondentId: 'resp-rolled' },
    });

    expect(mockEvaluate).not.toHaveBeenCalled();
    expect(mockInsertValues).not.toHaveBeenCalled();
    expect(result).toMatchObject({ processed: false, submissionId: 'sub-rolled' });
  });

  /**
   * The gate must not have been widened by accident either: a field respondent who
   * merely lacks a NIN was never excluded and must still be scored.
   */
  it('still scores a pending_nin_capture respondent (never excluded)', async () => {
    mockFindFirstRespondent.mockResolvedValue({ status: 'pending_nin_capture' });
    mockEvaluate.mockResolvedValue(cleanVerdict('sub-pending'));

    await processorFn({
      id: 'job-3',
      data: { submissionId: 'sub-pending', respondentId: 'resp-pending' },
    });

    expect(mockEvaluate).toHaveBeenCalledWith('sub-pending');
  });

  /**
   * The tripwire, asserted on the REAL constant — the mirror of the one in
   * `marketplace-extraction.worker.gate-open.test.ts`. It is what makes a revert
   * of the gate change loud on both sides rather than only the marketplace one.
   */
  it('has the real gate OPEN for imported_unverified and STILL SHUT for rolled_back', async () => {
    const actual = await vi.importActual<typeof import('../../db/schema/respondents.js')>(
      '../../db/schema/respondents.js',
    );

    expect(actual.PIPELINE_EXCLUDED_STATUSES).not.toContain('imported_unverified');
    expect(actual.PIPELINE_EXCLUDED_STATUSES).toContain('rolled_back');
  });
});
