import { describe, it, expect, vi, beforeEach } from 'vitest';

// Story 13-27 (AC3/AC5) — the marketplace-extraction backfill. The correctness
// that matters: arg parsing (typo-safety), candidate mapping from the SQL result,
// and the enqueue loop's idempotency behaviour (PREVIEW enqueues nothing; the
// queue's null return counts as deduped, not enqueued; an empty candidate set —
// i.e. everyone already has a profile — enqueues nothing).

const mockDbExecute = vi.fn();
const mockQueueMarketplaceExtraction = vi.fn();
const mockGetJob = vi.fn();

vi.mock('../../src/db/index.js', () => ({
  db: { execute: (...args: unknown[]) => mockDbExecute(...args) },
}));
vi.mock('../../src/queues/marketplace-extraction.queue.js', () => ({
  queueMarketplaceExtraction: (...args: unknown[]) => mockQueueMarketplaceExtraction(...args),
  // Story 13-27 (review L1) — the backfill probes for an in-flight duplicate via
  // getJob(jobId) before enqueuing; mock the queue handle + the shared jobId key.
  getMarketplaceExtractionQueue: () => ({ getJob: (...args: unknown[]) => mockGetJob(...args) }),
  marketplaceExtractionJobId: (respondentId: string) => `marketplace-${respondentId}`,
}));
vi.mock('pino', () => ({
  default: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import {
  parseArgs,
  fetchCandidates,
  enqueueCandidates,
  type CandidateRow,
} from '../_backfill-marketplace-extraction.js';

function makeCandidate(overrides: Partial<CandidateRow> = {}): CandidateRow {
  return {
    respondentId: 'resp-1',
    submissionId: 'sub-1',
    firstName: 'Ada',
    status: 'active',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('parseArgs', () => {
  it('parses dry-run / apply / confirm / max-rows', () => {
    expect(parseArgs(['--dry-run'])).toMatchObject({ dryRun: true, apply: false });
    expect(parseArgs(['--apply', '--confirm-i-am-not-dry-running'])).toMatchObject({
      apply: true,
      confirmLive: true,
    });
    expect(parseArgs(['--dry-run', '--max-rows', '5']).maxRows).toBe(5);
    expect(parseArgs(['--dry-run']).maxRows).toBeNull();
  });

  it('throws on an unknown flag (typo-safety)', () => {
    expect(() => parseArgs(['--aply'])).toThrow(/Unknown flag/);
  });
});

describe('fetchCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps SQL rows to CandidateRow', async () => {
    mockDbExecute.mockResolvedValueOnce({
      rows: [
        {
          respondent_id: 'r-1',
          submission_id: 's-1',
          first_name: 'Ada',
          status: 'active',
          created_at: '2026-07-05T00:00:00Z',
        },
      ],
    });
    const rows = await fetchCandidates(null);
    expect(rows).toEqual([
      {
        respondentId: 'r-1',
        submissionId: 's-1',
        firstName: 'Ada',
        status: 'active',
        createdAt: new Date('2026-07-05T00:00:00Z'),
      },
    ]);
  });

  it('returns an empty list when everyone already has a profile (idempotent selection)', async () => {
    // The SQL LEFT JOIN + `mp.id IS NULL` guard means a fully-backfilled DB yields
    // zero candidates — a second run is a no-op.
    mockDbExecute.mockResolvedValueOnce({ rows: [] });
    expect(await fetchCandidates(null)).toEqual([]);
  });
});

describe('enqueueCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueueMarketplaceExtraction.mockResolvedValue('job-id');
    mockGetJob.mockResolvedValue(null); // default: no in-flight duplicate
  });

  it('PREVIEW (live=false) enqueues nothing', async () => {
    const result = await enqueueCandidates([makeCandidate(), makeCandidate({ respondentId: 'resp-2' })], {
      live: false,
    });
    expect(mockQueueMarketplaceExtraction).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: 0, deduped: 0, failed: 0 });
  });

  it('LIVE enqueues one job per candidate with (respondentId, submissionId)', async () => {
    const result = await enqueueCandidates(
      [makeCandidate(), makeCandidate({ respondentId: 'resp-2', submissionId: 'sub-2' })],
      { live: true },
    );
    expect(mockQueueMarketplaceExtraction).toHaveBeenCalledTimes(2);
    expect(mockQueueMarketplaceExtraction).toHaveBeenCalledWith({ respondentId: 'resp-1', submissionId: 'sub-1' });
    expect(mockQueueMarketplaceExtraction).toHaveBeenCalledWith({ respondentId: 'resp-2', submissionId: 'sub-2' });
    expect(result).toEqual({ enqueued: 2, deduped: 0, failed: 0 });
  });

  it('counts a pre-existing in-flight job as deduped and does NOT re-enqueue it (getJob probe)', async () => {
    // First respondent already has a queued job → deduped + skipped; second is fresh.
    mockGetJob.mockResolvedValueOnce({ id: 'marketplace-resp-1' }).mockResolvedValueOnce(null);
    const result = await enqueueCandidates([makeCandidate(), makeCandidate({ respondentId: 'resp-2' })], {
      live: true,
    });
    // Only the fresh candidate is enqueued; the dupe never hits the producer.
    expect(mockQueueMarketplaceExtraction).toHaveBeenCalledTimes(1);
    expect(mockQueueMarketplaceExtraction).toHaveBeenCalledWith({ respondentId: 'resp-2', submissionId: 'sub-1' });
    expect(result).toEqual({ enqueued: 1, deduped: 1, failed: 0 });
  });

  it('still counts a legacy null producer return as deduped (defensive)', async () => {
    mockQueueMarketplaceExtraction.mockResolvedValueOnce(null); // producer self-reported a dedup
    const result = await enqueueCandidates([makeCandidate(), makeCandidate({ respondentId: 'resp-2' })], {
      live: true,
    });
    expect(result).toEqual({ enqueued: 1, deduped: 1, failed: 0 });
  });

  it('counts a per-row enqueue error as failed (and keeps going)', async () => {
    mockQueueMarketplaceExtraction
      .mockRejectedValueOnce(new Error('redis down'))
      .mockResolvedValueOnce('job-id');
    const result = await enqueueCandidates([makeCandidate(), makeCandidate({ respondentId: 'resp-2' })], {
      live: true,
    });
    expect(result).toEqual({ enqueued: 1, deduped: 0, failed: 1 });
  });

  it('an empty candidate set enqueues nothing (fully backfilled → no-op)', async () => {
    const result = await enqueueCandidates([], { live: true });
    expect(mockQueueMarketplaceExtraction).not.toHaveBeenCalled();
    expect(result).toEqual({ enqueued: 0, deduped: 0, failed: 0 });
  });
});
