import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQueueAdd = vi.fn();

vi.mock('bullmq', () => {
  return {
    Queue: class MockQueue {
      constructor() { /* no-op */ }
      add(...args: unknown[]) { return mockQueueAdd(...args); }
      close() { return Promise.resolve(); }
    },
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      constructor() { /* no-op */ }
    },
  };
});

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { queueMarketplaceExtraction, closeMarketplaceExtractionQueue } from '../marketplace-extraction.queue.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('marketplace-extraction queue', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should add a marketplace extraction job with respondentId-based dedup key', async () => {
    mockQueueAdd.mockResolvedValue({ id: 'marketplace-resp-001' });

    const result = await queueMarketplaceExtraction({
      respondentId: 'resp-001',
      submissionId: 'sub-001',
    });

    expect(result).toBe('marketplace-resp-001');
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'marketplace-extraction',
      {
        respondentId: 'resp-001',
        submissionId: 'sub-001',
      },
      { jobId: 'marketplace-resp-001' }
    );
  });

  it('should return null for duplicate job (same respondentId)', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Job already exists'));

    const result = await queueMarketplaceExtraction({
      respondentId: 'resp-001',
      submissionId: 'sub-002',
    });

    expect(result).toBeNull();
  });

  it('should re-throw non-dedup errors', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Connection refused'));

    await expect(
      queueMarketplaceExtraction({
        respondentId: 'resp-001',
        submissionId: 'sub-001',
      })
    ).rejects.toThrow('Connection refused');
  });
});
