import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockFindFirstSubmission = vi.fn();
const mockInsertSubmission = vi.fn();
const mockUpdateSubmission = vi.fn();
const mockProcessSubmission = vi.fn();
/**
 * Story 13-57 — the SET payload is now behaviour, not plumbing. The terminal
 * state IS the three-column shape (`processed` / `processed_at` /
 * `processing_error`), so a test that only asserts "an update happened" cannot
 * tell the fix from the bug. Capturing it is an ADDED capability; no existing
 * assertion is relaxed.
 */
const mockUpdateSet = vi.fn();

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
        set: (val: unknown) => {
          mockUpdateSet(val);
          return {
            where: () => Promise.resolve(),
          };
        },
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

/** A Postgres error object as `pg` surfaces it — SQLSTATE on `.code`. */
function pgError(code: string, message: string, constraint?: string): Error {
  const err = new Error(message) as Error & { code: string; constraint?: string };
  err.code = code;
  if (constraint) err.constraint = constraint;
  return err;
}

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
const workerModule = await import('../webhook-ingestion.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const processorFn = capturedProcessor;
const { handleExhaustedRetries } = workerModule; // Story 13-57 (AC2.3)

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

  /**
   * ⭐ STORY 13-57 AC2 — THE THREE STATES, AND THE TWO HOLES THAT MADE TWO OF
   * THEM LOOK THE SAME.
   *
   * `processed = false` used to mean BOTH "queued" and "permanently dead". Two
   * submissions sat in the second sense for five days in August 2026 and were
   * found by accident. These tests pin the shape that tells them apart, and the
   * two routes into it that previously led nowhere.
   */
  describe('13-57 — terminal failure state', () => {
    /** The exact three-column shape from `submission-terminal-state.ts`. */
    function expectTerminalSet(reason: string | RegExp) {
      expect(mockUpdateSet).toHaveBeenCalledTimes(1);
      const set = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
      // `processed: true` means "the pipeline is FINISHED", not "it succeeded" —
      // `processing_error` is the discriminator.
      expect(set.processed).toBe(true);
      expect(set.processedAt).toBeInstanceOf(Date);
      expect(set.processingError).toEqual(
        typeof reason === 'string' ? reason : expect.stringMatching(reason),
      );
    }

    it('a PermanentProcessingError lands the terminal three-column shape, with the reason', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockRejectedValue(
        new PermanentProcessingError('UNPROCESSABLE_INPUT: phone_number (wrong_length:expected_10_got_11)'),
      );

      await processorFn(makeJob());

      expectTerminalSet('UNPROCESSABLE_INPUT: phone_number (wrong_length:expected_10_got_11)');
    });

    /**
     * THE OTHER HALF OF THE 2026-08-04 MECHANISM. A CHECK-constraint violation
     * is not a transient blip — it will fail identically on every retry — but
     * it used to be re-thrown, retried three times, and then abandoned at
     * `processed = false` with no reason at all.
     */
    it('a CHECK-constraint violation is terminal, NOT re-thrown for retry', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockRejectedValue(
        pgError(
          '23514',
          'new row for relation "respondents" violates check constraint "chk_respondents_phone_number_e164"',
          'chk_respondents_phone_number_e164',
        ),
      );

      const result = await processorFn(makeJob());

      expect(result).toMatchObject({ success: false, action: 'failed' });
      expectTerminalSet(/chk_respondents_phone_number_e164/);
    });

    /**
     * The exclusions are deliberate and must stay excluded: a foreign-key
     * violation here CAN be a delete-order race (Story 13-30 chased a real
     * one), so it keeps its retries. If this test ever flips, someone has
     * widened the non-retryable set into territory where retrying is correct.
     */
    it('a foreign-key violation is still retried, not buried', async () => {
      mockFindFirstSubmission.mockResolvedValue(null);
      mockProcessSubmission.mockRejectedValue(
        pgError('23503', 'insert or update violates foreign key constraint'),
      );

      await expect(processorFn(makeJob())).rejects.toThrow(/foreign key/);
      expect(mockUpdateSet).not.toHaveBeenCalled();
    });
  });

  /**
   * AC2.3 — when BullMQ gives up, the row must stop looking queued. Asserting
   * the RETURN VALUE (did the branch run?) as well as the write, because a
   * handler that quietly no-ops is indistinguishable from one that works.
   */
  describe('13-57 — retries exhausted', () => {
    it('marks the submission terminal once the final attempt has failed', async () => {
      mockFindFirstSubmission.mockResolvedValue({ id: 'sub-1', processed: false });

      const marked = await handleExhaustedRetries(
        { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } } as never,
        new Error('Connection timeout'),
      );

      expect(marked).toBe(true);
      const set = mockUpdateSet.mock.calls[0][0] as Record<string, unknown>;
      expect(set.processed).toBe(true);
      expect(set.processingError).toMatch(/^RETRIES_EXHAUSTED after 3 attempt\(s\): Connection timeout$/);
    });

    it('does NOTHING while retries remain — a queued row must keep looking queued', async () => {
      mockFindFirstSubmission.mockResolvedValue({ id: 'sub-1', processed: false });

      const marked = await handleExhaustedRetries(
        { ...makeJob(), attemptsMade: 1, opts: { attempts: 3 } } as never,
        new Error('Connection timeout'),
      );

      expect(marked).toBe(false);
      expect(mockUpdateSet).not.toHaveBeenCalled();
    });

    it('does NOTHING when the row is already terminal — no double-reporting', async () => {
      mockFindFirstSubmission.mockResolvedValue({ id: 'sub-1', processed: true });

      const marked = await handleExhaustedRetries(
        { ...makeJob(), attemptsMade: 3, opts: { attempts: 3 } } as never,
        new Error('Connection timeout'),
      );

      expect(marked).toBe(false);
      expect(mockUpdateSet).not.toHaveBeenCalled();
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
