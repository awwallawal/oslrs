import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FraudDetectionResult } from '@oslsr/types';

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

let capturedProcessor: ((job: unknown) => Promise<unknown>) | null = null;

vi.mock('bullmq', () => {
  return {
    Worker: class MockWorker {
      constructor(_name: string, processor: (job: unknown) => Promise<unknown>) {
        capturedProcessor = processor;
      }
      on() { return this; }
      isRunning() { return true; }
      close() { return Promise.resolve(); }
    },
    Job: class MockJob {},
  };
});

vi.mock('ioredis', () => {
  return {
    Redis: class MockRedis {
      constructor() { /* no-op */ }
    },
  };
});

const mockEvaluate = vi.fn<(id: string) => Promise<FraudDetectionResult>>();
vi.mock('../../services/fraud-engine.service.js', () => ({
  FraudEngine: {
    evaluate: (id: string) => mockEvaluate(id),
  },
}));

const mockInsert = vi.fn().mockReturnValue({ values: () => Promise.resolve() });
vi.mock('../../db/index.js', () => ({
  db: {
    insert: () => mockInsert(),
  },
}));

// Trigger module load to capture processor
await import('../fraud-detection.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

// ── Tests ──────────────────────────────────────────────────────────────────

const mockResult: FraudDetectionResult = {
  submissionId: 'sub-001',
  enumeratorId: 'enum-001',
  configVersion: 1,
  componentScores: { gps: 10, speed: 5, straightline: 0, duplicate: 0, timing: 0 },
  totalScore: 15,
  severity: 'clean',
  details: { gps: null, speed: null, straightline: null, duplicate: null, timing: null },
};

describe('fraud-detection worker', () => {
  beforeEach(() => {
    // Re-establish mock implementations after mockReset (vitest base config)
    mockInsert.mockReturnValue({ values: () => Promise.resolve() });
  });

  it('should call FraudEngine.evaluate and return result', async () => {
    mockEvaluate.mockResolvedValue(mockResult);

    const job = {
      id: 'fraud-job-001',
      data: {
        submissionId: 'sub-001',
        respondentId: 'resp-001',
        gpsLatitude: 7.3775,
        gpsLongitude: 3.9470,
      },
    };

    const result = await processorFn(job) as Record<string, unknown>;

    expect(mockEvaluate).toHaveBeenCalledWith('sub-001');
    expect(result.processed).toBe(true);
    expect(result.submissionId).toBe('sub-001');
    expect(result.totalScore).toBe(15);
    expect(result.severity).toBe('clean');
  });

  it('should throw on FraudEngine error (for BullMQ retry)', async () => {
    mockEvaluate.mockRejectedValue(new Error('Submission not found'));

    const job = {
      id: 'fraud-job-002',
      data: {
        submissionId: 'sub-002',
        respondentId: 'resp-002',
      },
    };

    await expect(processorFn(job)).rejects.toThrow('Submission not found');
  });
});
