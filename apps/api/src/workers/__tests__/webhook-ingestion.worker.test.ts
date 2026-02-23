import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirstSubmission = vi.fn();
const mockInsertSubmission = vi.fn();
const mockUpdateSubmission = vi.fn();
const mockProcessSubmission = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      submissions: { findFirst: (...args: unknown[]) => mockFindFirstSubmission(...args) },
    },
    insert: (...args: unknown[]) => {
      mockInsertSubmission(...args);
      return {
        values: () => Promise.resolve(),
      };
    },
    update: (...args: unknown[]) => {
      mockUpdateSubmission(...args);
      return {
        set: () => ({
          where: () => Promise.resolve(),
        }),
      };
    },
  },
}));

vi.mock('../../services/submission-processing.service.js', () => ({
  SubmissionProcessingService: {
    processSubmission: (...args: unknown[]) => mockProcessSubmission(...args),
  },
  PermanentProcessingError: class PermanentProcessingError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'PermanentProcessingError';
    }
  },
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7-001',
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Capture the processor function passed to BullMQ Worker constructor
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

// Import after mocks to trigger module load
import { PermanentProcessingError } from '../../services/submission-processing.service.js';

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-001',
    data: {
      submissionUid: 'uid-001',
      questionnaireFormId: 'form-001',
      source: 'webapp',
      submittedAt: '2026-01-15T10:00:00.000Z',
      submitterId: 'user-001',
      rawData: {
        nin: '61961438053',
        first_name: 'Adewale',
        last_name: 'Johnson',
      },
      ...overrides,
    },
    attemptsMade: 0,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────

// Trigger module load once to capture the processor
await import('../webhook-ingestion.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;

describe('webhook-ingestion worker', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('new submission (happy path)', () => {
    it('should save raw submission and call processSubmission', async () => {
      mockFindFirstSubmission.mockResolvedValue(null); // No existing
      mockProcessSubmission.mockResolvedValue({
        action: 'processed',
        submissionId: 'mock-uuid-v7-001',
        respondentId: 'resp-001',
      });

      const result = await processorFn(makeJob());

      expect(mockInsertSubmission).toHaveBeenCalled();
      expect(mockProcessSubmission).toHaveBeenCalledWith('mock-uuid-v7-001');
      expect(result).toMatchObject({
        success: true,
        action: 'created',
        submissionUid: 'uid-001',
      });
    });
  });

  describe('idempotent re-run (already exists + already processed)', () => {
    it('should skip entirely when submission already exists and is processed', async () => {
      mockFindFirstSubmission.mockResolvedValue({
        id: 'existing-sub',
        processed: true,
      });

      const result = await processorFn(makeJob());

      expect(result).toMatchObject({
        success: true,
        action: 'skipped',
        submissionUid: 'uid-001',
      });
      expect(mockInsertSubmission).not.toHaveBeenCalled();
      expect(mockProcessSubmission).not.toHaveBeenCalled();
    });
  });

  describe('re-run (exists but NOT processed)', () => {
    it('should call processSubmission for unprocessed existing submission', async () => {
      mockFindFirstSubmission.mockResolvedValue({
        id: 'existing-sub',
        processed: false,
      });
      mockProcessSubmission.mockResolvedValue({
        action: 'processed',
        submissionId: 'existing-sub',
        respondentId: 'resp-002',
      });

      const result = await processorFn(makeJob());

      expect(mockInsertSubmission).not.toHaveBeenCalled(); // Don't re-insert
      expect(mockProcessSubmission).toHaveBeenCalledWith('existing-sub');
      expect(result).toMatchObject({
        success: true,
        action: 'skipped', // existing submission, processing triggered
        submissionUid: 'uid-001',
      });
    });
  });

  describe('permanent processing error', () => {
    it('should store processingError and NOT re-throw for permanent errors', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockRejectedValue(
        new PermanentProcessingError('Required field NIN is missing from submission rawData')
      );

      const result = await processorFn(makeJob());

      // Should update submission with processingError
      expect(mockUpdateSubmission).toHaveBeenCalled();
      // Should NOT throw — permanent errors don't retry
      expect(result).toMatchObject({
        success: false,
        action: 'failed',
        submissionUid: 'uid-001',
        error: 'Required field NIN is missing from submission rawData',
      });
    });
  });

  describe('transient processing error', () => {
    it('should re-throw transient errors for BullMQ retry', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockRejectedValue(new Error('Connection timeout'));

      await expect(processorFn(makeJob())).rejects.toThrow('Connection timeout');
    });
  });

  describe('processing success logging', () => {
    it('should return processed result on success', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockResolvedValue({
        action: 'processed',
        submissionId: 'mock-uuid-v7-001',
        respondentId: 'resp-001',
      });

      const result = await processorFn(makeJob());

      expect(result).toMatchObject({
        success: true,
        submissionId: 'mock-uuid-v7-001',
        action: 'created',
      });
    });
  });
});
