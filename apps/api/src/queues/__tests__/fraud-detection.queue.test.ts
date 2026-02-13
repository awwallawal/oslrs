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

import { queueFraudDetection, closeFraudDetectionQueue } from '../fraud-detection.queue.js';

// ── Tests ──────────────────────────────────────────────────────────────────

describe('fraud-detection queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should add a fraud detection job with correct jobId', async () => {
    mockQueueAdd.mockResolvedValue({ id: 'fraud-sub-001' });

    const result = await queueFraudDetection({
      submissionId: 'sub-001',
      respondentId: 'resp-001',
      gpsLatitude: 7.3775,
      gpsLongitude: 3.9470,
    });

    expect(result).toBe('fraud-sub-001');
    expect(mockQueueAdd).toHaveBeenCalledWith(
      'fraud-detection',
      {
        submissionId: 'sub-001',
        respondentId: 'resp-001',
        gpsLatitude: 7.3775,
        gpsLongitude: 3.9470,
      },
      { jobId: 'fraud-sub-001' }
    );
  });

  it('should return null for duplicate job (already exists)', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Job already exists'));

    const result = await queueFraudDetection({
      submissionId: 'sub-001',
      respondentId: 'resp-001',
    });

    expect(result).toBeNull();
  });

  it('should re-throw non-dedup errors', async () => {
    mockQueueAdd.mockRejectedValue(new Error('Connection refused'));

    await expect(
      queueFraudDetection({
        submissionId: 'sub-001',
        respondentId: 'resp-001',
      })
    ).rejects.toThrow('Connection refused');
  });
});
