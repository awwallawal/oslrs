import { describe, it, expect, vi } from 'vitest';

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

// Trigger module load to capture processor
await import('../fraud-detection.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

// ── Tests ──────────────────────────────────────────────────────────────────

describe('fraud-detection worker (stub)', () => {
  it('should return stub result with processed=false', async () => {
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

    expect(result.processed).toBe(false);
    expect(result.reason).toContain('stub');
    expect(result.submissionId).toBe('sub-001');
  });

  it('should handle job without GPS coordinates', async () => {
    const job = {
      id: 'fraud-job-002',
      data: {
        submissionId: 'sub-002',
        respondentId: 'resp-002',
      },
    };

    const result = await processorFn(job) as Record<string, unknown>;

    expect(result.processed).toBe(false);
    expect(result.submissionId).toBe('sub-002');
  });
});
