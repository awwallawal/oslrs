/**
 * Story 13-2 R-A2 half (c) — the fraud-detection enqueue script.
 *
 * Mirrors the marketplace backfill's test shape: arg parsing (typo-safety), the
 * selection predicate read off the emitted SQL, and the enqueue loop's idempotency.
 * The engine-side proof that an imported row can actually be SCORED lives in
 * `src/services/__tests__/fraud-engine.imports.integration.test.ts`, against a real
 * database — a mocked db cannot see the uuid cast that was the original defect.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDbExecute = vi.fn();
const mockQueueFraudDetection = vi.fn();
const mockGetJob = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));
vi.mock('../../src/queues/fraud-detection.queue.js', () => ({
  queueFraudDetection: (...args: unknown[]) => mockQueueFraudDetection(...args),
  getFraudDetectionQueue: () => ({ getJob: (...args: unknown[]) => mockGetJob(...args) }),
}));
vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  parseArgs,
  fetchCandidates,
  enqueueCandidates,
  type CandidateRow,
} from '../_backfill-fraud-detection-imports.js';

function makeCandidate(over: Partial<CandidateRow> = {}): CandidateRow {
  return {
    respondentId: 'resp-1',
    submissionId: 'sub-1',
    batchId: 'batch-1',
    status: 'imported_unverified',
    ...over,
  };
}

/**
 * Flatten the static SQL text of a drizzle `sql` object, DESCENDING into nested
 * fragments — the selection is composed from a shared `cohortSql` CTE, and a flat
 * read of the outer chunks would see none of the predicate.
 */
function sqlText(chunk: unknown): string {
  if (typeof chunk !== 'object' || chunk === null) return '';
  if ('queryChunks' in chunk) return (chunk as { queryChunks: unknown[] }).queryChunks.map(sqlText).join('');
  if ('value' in chunk && Array.isArray((chunk as { value: unknown }).value)) {
    return (chunk as { value: string[] }).value.join('');
  }
  return '';
}

function emittedSql(): string {
  const arg = mockDbExecute.mock.calls[0]?.[0] as { queryChunks?: unknown[] } | undefined;
  if (!arg?.queryChunks) throw new Error('db.execute was not called with a drizzle SQL object');
  return sqlText(arg);
}

describe('parseArgs', () => {
  it('parses dry-run / apply / confirm / max-rows / batch-size', () => {
    expect(parseArgs(['--dry-run'])).toMatchObject({ dryRun: true, apply: false });
    expect(parseArgs(['--apply', '--confirm-i-am-not-dry-running'])).toMatchObject({
      apply: true,
      confirmLive: true,
    });
    expect(parseArgs(['--dry-run', '--max-rows', '5']).maxRows).toBe(5);
    expect(parseArgs(['--dry-run', '--batch-size', '10']).batchSize).toBe(10);
  });

  it('defaults the batch size rather than enqueuing everything at once', () => {
    // All ten BullMQ workers run IN the API process on a 2 GB box; an unbounded
    // burst of 8,278 jobs is a self-inflicted load spike.
    expect(parseArgs(['--dry-run']).batchSize).toBe(250);
  });

  it('throws on an unknown flag (typo-safety)', () => {
    expect(() => parseArgs(['--aply'])).toThrow(/Unknown flag/);
  });

  /**
   * ⛔ A scoping flag that fails OPEN is worse than none: `--batch-id` with a typo or
   * no value would otherwise parse as "no batch" and run over EVERY batch — the
   * 8,222-row one included — on a run the operator meant to keep small.
   */
  it('scopes to one batch, and refuses a malformed or valueless --batch-id', () => {
    const id = '01a071c8-0000-4000-8000-000000000000';
    expect(parseArgs(['--dry-run', '--batch-id', id]).batchId).toBe(id);
    expect(parseArgs(['--dry-run']).batchId).toBeNull();
    expect(() => parseArgs(['--dry-run', '--batch-id', '01a071c8'])).toThrow(/--batch-id/);
    expect(() => parseArgs(['--dry-run', '--batch-id'])).toThrow(/--batch-id/);
  });
});

describe('fetchCandidates — the selection predicate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('selects only the selectable bucket of imported_association rows', async () => {
    await fetchCandidates(null);
    const emitted = emittedSql();
    expect(emitted).toContain("r.source = 'imported_association'");
    expect(emitted).toContain("WHEN r.import_batch_id IS NULL THEN 'no_batch'");
    expect(emitted).toContain("WHERE bucket = 'selectable'");
  });

  /**
   * ⛔ Idempotency lives in the SELECT, not only in the queue: a submission that
   * already has a detection must never be re-enqueued, or a re-run doubles the
   * review queue.
   */
  it('skips submissions that already have a fraud detection', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain("FROM fraud_detections fd WHERE fd.submission_id = s.id) THEN 'already_scored'");
  });

  /**
   * ⛔ A retracted batch is soft-deleted. The worker refuses it at its own status
   * gate, so nothing would be written either way — what breaks without this is the
   * OPERATOR'S COUNT, which is what predict-then-compare turns on.
   */
  it('excludes rolled_back respondents so the dry-run count is honest', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain("WHEN r.status = 'rolled_back' THEN 'rolled_back'");
  });

  /**
   * ⛔ Review (2026-09-13): the submission scored must be the IMPORT submission. A
   * field submission later merged onto the same person is scored by the live path.
   */
  it('scores the import submission, never a later field submission', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain("sub.questionnaire_form_id LIKE 'import:%'");
  });

  /**
   * Scoped to the association channel, NOT to imports generally: roll-padding
   * reasons about a membership roll, and the other import sources' padding risk has
   * never been measured against their data.
   */
  it('does not sweep in other import sources', async () => {
    await fetchCandidates(null);
    const emitted = emittedSql();
    expect(emitted).not.toContain('imported_itf_supa');
    expect(emitted).not.toContain('imported_other');
  });
});

describe('enqueueCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetJob.mockResolvedValue(null);
    mockQueueFraudDetection.mockResolvedValue('job-id');
  });

  it('PREVIEW (live=false) enqueues nothing', async () => {
    const r = await enqueueCandidates([makeCandidate()], { live: false, batchSize: 250 });
    expect(mockQueueFraudDetection).not.toHaveBeenCalled();
    expect(r).toEqual({ enqueued: 0, deduped: 0, failed: 0 });
  });

  it('LIVE enqueues one job per candidate with (submissionId, respondentId)', async () => {
    const r = await enqueueCandidates(
      [makeCandidate(), makeCandidate({ respondentId: 'resp-2', submissionId: 'sub-2' })],
      { live: true, batchSize: 250 },
    );
    expect(mockQueueFraudDetection).toHaveBeenCalledWith({ submissionId: 'sub-1', respondentId: 'resp-1' });
    expect(mockQueueFraudDetection).toHaveBeenCalledWith({ submissionId: 'sub-2', respondentId: 'resp-2' });
    expect(r).toEqual({ enqueued: 2, deduped: 0, failed: 0 });
  });

  it('counts a pre-existing in-flight job as deduped and does NOT re-enqueue it', async () => {
    mockGetJob.mockResolvedValueOnce({ id: 'fraud-sub-1' }).mockResolvedValueOnce(null);
    const r = await enqueueCandidates(
      [makeCandidate(), makeCandidate({ respondentId: 'resp-2', submissionId: 'sub-2' })],
      { live: true, batchSize: 250 },
    );
    expect(mockQueueFraudDetection).toHaveBeenCalledTimes(1);
    expect(r).toEqual({ enqueued: 1, deduped: 1, failed: 0 });
  });

  it('counts a per-row enqueue error as failed and keeps going', async () => {
    mockQueueFraudDetection.mockRejectedValueOnce(new Error('redis down')).mockResolvedValueOnce('job-id');
    const r = await enqueueCandidates(
      [makeCandidate(), makeCandidate({ respondentId: 'resp-2', submissionId: 'sub-2' })],
      { live: true, batchSize: 250 },
    );
    expect(r).toEqual({ enqueued: 1, deduped: 0, failed: 1 });
  });

  it('processes every candidate across batch boundaries', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      makeCandidate({ respondentId: `resp-${i}`, submissionId: `sub-${i}` }));
    const r = await enqueueCandidates(many, { live: true, batchSize: 2, pauseMs: 0 });
    expect(r.enqueued).toBe(7);
  });

  it('an empty candidate set enqueues nothing (fully backfilled, no-op)', async () => {
    const r = await enqueueCandidates([], { live: true, batchSize: 250 });
    expect(mockQueueFraudDetection).not.toHaveBeenCalled();
    expect(r).toEqual({ enqueued: 0, deduped: 0, failed: 0 });
  });
});
