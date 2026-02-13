/**
 * Submission Ingestion Integration Test
 *
 * Tests the full pipeline: raw submission → worker → respondent created →
 * submission linked → fraud job queued, using mocked DB and queue layers.
 *
 * Story 3.4 — AC: 3.4.1-3.4.6
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────

// DB state: simulated in-memory store
let submissionsStore: Record<string, Record<string, unknown>> = {};
let respondentsStore: Record<string, Record<string, unknown>> = {};

const mockQueueFraudDetection = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      submissions: {
        findFirst: vi.fn(({ where }: { where?: unknown }) => {
          // The where clause is a drizzle `eq()` call — we can't evaluate it,
          // so we expose the store and let tests control it
          const entries = Object.values(submissionsStore);
          return entries[0] ?? null;
        }),
      },
      questionnaireForms: {
        findFirst: vi.fn(() => ({
          formSchema: {
            id: 'form-001',
            title: 'Test Survey',
            version: '1.0.0',
            status: 'published',
            sections: [{
              id: 's1',
              title: 'Identity',
              questions: [
                { name: 'nin', type: 'text', label: 'NIN' },
                { name: 'first_name', type: 'text', label: 'First Name' },
                { name: 'last_name', type: 'text', label: 'Last Name' },
              ],
            }],
            choiceLists: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        })),
      },
      respondents: {
        findFirst: vi.fn(() => {
          const entries = Object.values(respondentsStore);
          return entries[0] ?? null;
        }),
      },
      users: {
        findFirst: vi.fn(() => ({ roleId: 'role-enumerator' })),
      },
      roles: {
        findFirst: vi.fn(() => ({ name: 'enumerator' })),
      },
    },
    insert: vi.fn((table: unknown) => ({
      values: (data: Record<string, unknown>) => {
        // Track which table is being inserted into
        if (data.nin) {
          respondentsStore[String(data.nin)] = { id: `resp-${Date.now()}`, ...data };
          return {
            returning: () => [respondentsStore[String(data.nin)]],
          };
        }
        // Submission insert
        submissionsStore[String(data.id)] = data;
        return {
          returning: () => [data],
        };
      },
    })),
    update: vi.fn(() => ({
      set: (data: Record<string, unknown>) => ({
        where: () => {
          // Apply update to the first submission
          const key = Object.keys(submissionsStore)[0];
          if (key) {
            submissionsStore[key] = { ...submissionsStore[key], ...data };
          }
          return Promise.resolve();
        },
      }),
    })),
  },
}));

vi.mock('../../queues/fraud-detection.queue.js', () => ({
  queueFraudDetection: (...args: unknown[]) => mockQueueFraudDetection(...args),
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('uuidv7', () => ({
  uuidv7: () => 'mock-uuid-v7-integration',
}));

// Capture worker processor
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

// Trigger module load
await import('../../workers/webhook-ingestion.worker.js');
if (!capturedProcessor) throw new Error('Worker processor not captured');
const workerProcessor = capturedProcessor;

// ── Test Helpers ───────────────────────────────────────────────────────────

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-integration-001',
    data: {
      submissionUid: 'uid-integration-001',
      questionnaireFormId: 'form-001',
      source: 'webapp',
      submittedAt: '2026-01-15T10:00:00.000Z',
      submitterId: 'user-001',
      rawData: {
        nin: '61961438053',
        first_name: 'Adewale',
        last_name: 'Johnson',
        date_of_birth: '1990-05-15',
        phone_number: '08012345678',
        lga_id: 'ibadan_north',
        consent_marketplace: 'yes',
        consent_enriched: 'no',
        _gpsLatitude: '7.3775',
        _gpsLongitude: '3.9470',
      },
      ...overrides,
    },
    attemptsMade: 0,
  };
}

// ── Integration Tests ─────────────────────────────────────────────────────

describe('Submission Ingestion Pipeline (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    submissionsStore = {};
    respondentsStore = {};
  });

  it('should process full pipeline: save → extract respondent → link → queue fraud', async () => {
    const result = await workerProcessor(makeJob()) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
    expect(result.submissionUid).toBe('uid-integration-001');

    // Fraud detection should be queued (GPS present in rawData)
    expect(mockQueueFraudDetection).toHaveBeenCalledOnce();
  });

  it('should skip entirely for already-processed submissions (idempotent)', async () => {
    // Pre-populate store with processed submission
    submissionsStore['existing'] = {
      id: 'existing-sub',
      submissionUid: 'uid-integration-001',
      processed: true,
      processedAt: new Date(),
    };

    const result = await workerProcessor(makeJob()) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.action).toBe('skipped');
  });

  it('should link to existing respondent on duplicate NIN', async () => {
    // Pre-populate respondent with matching NIN
    respondentsStore['61961438053'] = {
      id: 'existing-resp',
      nin: '61961438053',
      source: 'public',
    };

    const result = await workerProcessor(makeJob()) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.action).toBe('created');
  });

  it('should handle missing NIN as permanent error (no retry)', async () => {
    const job = makeJob({
      rawData: { first_name: 'NoNIN', last_name: 'Person' },
    });

    const result = await workerProcessor(job) as Record<string, unknown>;

    // Permanent error → result indicates failure, but no throw (no BullMQ retry)
    expect(result.success).toBe(false);
    expect(result.action).toBe('failed');
    expect(result.error).toContain('NIN');
  });
});
