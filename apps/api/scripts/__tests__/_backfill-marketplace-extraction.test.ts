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
    source: 'public',
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

  /**
   * 13-2 R-A2 review P4 — the staged publish scopes by batch, and the scope must fail
   * CLOSED: a mistyped or valueless id parsing as "no batch" would publish every
   * consenting person at once, the event staging exists to prevent.
   */
  it('scopes to one batch, and refuses a malformed or valueless --batch-id', () => {
    const id = '01a071c8-709f-73a3-9e31-eb0e8cedf01a';
    expect(parseArgs(['--dry-run', '--batch-id', id]).batchId).toBe(id);
    expect(parseArgs(['--dry-run']).batchId).toBeNull();
    expect(() => parseArgs(['--dry-run', '--batch-id', '01a071c8'])).toThrow(/--batch-id/);
    expect(() => parseArgs(['--dry-run', '--batch-id'])).toThrow(/--batch-id/);
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
          source: 'imported_association',
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
        source: 'imported_association',
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

/**
 * Story 13-2 R-A2 half (b) — THE PREDICATE ITSELF.
 *
 * ⭐ Why these assert on SQL TEXT rather than on returned rows. `fetchCandidates`
 * is the whole of half (b): opening `PIPELINE_EXCLUDED_STATUSES` creates zero
 * profiles on its own, and this SELECT is what decides who gets one. A test that
 * mocks `db.execute`'s RESULT (as every test above does, correctly, for mapping)
 * cannot see the predicate at all — it would pass unchanged if the `source` filter
 * were still `= 'public'`, which is precisely the defect half (b) exists to fix.
 *
 * So these read the emitted SQL. It is a coarser instrument, and deliberately so:
 * it is the only place the widening is observable without a live database.
 */
function emittedSql(): string {
  const arg = mockDbExecute.mock.calls[0]?.[0] as { queryChunks?: unknown[] } | undefined;
  if (!arg?.queryChunks) throw new Error('db.execute was not called with a drizzle SQL object');
  return arg.queryChunks
    .map((c) => (typeof c === 'object' && c !== null && 'value' in c
      ? (c as { value: string[] }).value.join('')
      : ''))
    .join('');
}

describe('fetchCandidates — the widened source predicate (13-2 R-A2 half b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbExecute.mockResolvedValue({ rows: [] });
  });

  it('makes imported_association rows eligible (the 8,278 this story exists for)', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain('imported_association');
  });

  /**
   * ⛔ THE DISCRIMINATING TWIN, and the reason this was not fixed by DELETING the
   * source condition. Dropping it would have made every source eligible, sweeping
   * in `enumerator` and `clerk` respondents whose profiles are created by the live
   * worker path — a different cohort, published as a side effect of a story about
   * association imports. The widening is an ALLOW-LIST, not a removal.
   */
  it('does NOT make enumerator or clerk rows eligible (allow-list, not removal)', async () => {
    await fetchCandidates(null);
    const emitted = emittedSql();
    expect(emitted).not.toContain("'enumerator'");
    expect(emitted).not.toContain("'clerk'");
  });

  it('keeps public rows eligible (the original cohort is not displaced)', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain("'public'");
  });

  /**
   * The sibling conditions the story names as load-bearing. Asserted because the
   * widening edits the same WHERE clause they live in, and a careless rewrite of
   * that clause is exactly how consent gets dropped.
   */
  it('still requires consent_marketplace and still skips respondents who have a profile', async () => {
    await fetchCandidates(null);
    const emitted = emittedSql();
    expect(emitted).toContain('r.consent_marketplace = true');
    expect(emitted).toContain('mp.id IS NULL');
  });

  /**
   * ⛔ NEW EXCLUSION THE WIDENING MAKES NECESSARY. Before half (b) the script only
   * saw `source = 'public'`, and no public row is ever `rolled_back` — that status
   * only arises from a retracted import batch. Widening to imported rows puts
   * soft-deleted people in reach of the selection for the first time.
   *
   * The worker would still refuse them at the status gate, so no profile would be
   * created either way. What breaks without this is the OPERATOR'S COUNT: the
   * dry-run would promise N profiles and the run would produce fewer, and
   * predict-then-compare cannot tell that apart from a real defect.
   */
  it('excludes rolled_back respondents so the dry-run count is honest', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).toContain('rolled_back');
  });

  /**
   * ⚖️ NO VOUCH ⇒ NO BADGE, NEVER NO CARD (13-58; re-affirmed by Awwal 2026-09-13).
   * R-A2 first required `association_name` in this SELECT, which withheld the card
   * from a consenting person over a metadata gap. Pinned in the negative so the
   * exclusion cannot quietly return; the real-DB sibling proves the rows ARE selected.
   */
  it('does NOT make the card conditional on an association vouch', async () => {
    await fetchCandidates(null);
    expect(emittedSql()).not.toContain('association_name');
  });
});
