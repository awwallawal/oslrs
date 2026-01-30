/**
 * ODK Backfill Service Tests (Story 2-5, Task 10.2)
 *
 * Tests for:
 * - Gap detection (ODK has more than app_db)
 * - Backfill skips existing submissions (idempotent)
 * - Lock prevents concurrent backfill
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createOdkBackfillService,
  type OdkBackfillPersistence,
  type OdkBackfillLock,
  type OdkBackfillService,
} from '../odk-backfill.service.js';
import { server, resetServerState, setForms, setSubmissionCount, setSubmissions, mockServerState } from './msw/index.js';

// Suppress logs during tests
vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  }),
}));

// Mock ODK configuration
vi.mock('../odk-config.js', () => ({
  isOdkFullyConfigured: vi.fn(() => true),
}));

vi.mock('../odk-client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../odk-client.js')>();
  return {
    ...actual,
    getOdkConfig: vi.fn(() => ({
      ODK_CENTRAL_URL: 'https://odk.example.com',
      ODK_ADMIN_EMAIL: 'admin@example.com',
      ODK_ADMIN_PASSWORD: 'password',
      ODK_PROJECT_ID: 1,
    })),
  };
});

describe('ODK Backfill Service', () => {
  let service: OdkBackfillService;
  let mockPersistence: OdkBackfillPersistence;
  let mockLock: OdkBackfillLock;
  let lockedProjects: Set<number>;
  let queuedSubmissions: Array<{ instanceId: string; xmlFormId: string }>;
  let existingSubmissions: Set<string>;
  let appDbCounts: Map<string, number>;

  beforeEach(() => {
    server.listen({ onUnhandledRequest: 'bypass' });
    resetServerState();
    // Set credentials to match the mock config
    mockServerState.setValidCredentials('admin@example.com', 'password');

    // Reset test state
    lockedProjects = new Set();
    queuedSubmissions = [];
    existingSubmissions = new Set();
    appDbCounts = new Map();

    // Mock persistence
    mockPersistence = {
      getAppDbSubmissionCount: vi.fn(async (xmlFormId: string) => {
        return appDbCounts.get(xmlFormId) ?? 0;
      }),
      submissionExists: vi.fn(async (odkSubmissionId: string) => {
        return existingSubmissions.has(odkSubmissionId);
      }),
      queueSubmissionForIngestion: vi.fn(async (submission, xmlFormId) => {
        queuedSubmissions.push({ instanceId: submission.instanceId, xmlFormId });
      }),
      getLastSyncedDate: vi.fn(async () => null),
    };

    // Mock lock
    mockLock = {
      acquireLock: vi.fn(async (projectId: number) => {
        if (lockedProjects.has(projectId)) {
          return false;
        }
        lockedProjects.add(projectId);
        return true;
      }),
      releaseLock: vi.fn(async (projectId: number) => {
        lockedProjects.delete(projectId);
      }),
      isLocked: vi.fn(async (projectId: number) => {
        return lockedProjects.has(projectId);
      }),
    };

    service = createOdkBackfillService({
      persistence: mockPersistence,
      lock: mockLock,
    });
  });

  afterEach(() => {
    server.resetHandlers();
    server.close();
    vi.clearAllMocks();
  });

  describe('getSubmissionGap', () => {
    it('should detect gap when ODK has more submissions than app_db', async () => {
      // Setup: ODK has 10 submissions, app_db has 3
      setForms(1, [
        { xmlFormId: 'test-form', name: 'Test Form', state: 'open' },
      ]);
      setSubmissionCount('test-form', 10);
      appDbCounts.set('test-form', 3);

      const result = await service.getSubmissionGap(1);

      expect(result.projectId).toBe(1);
      expect(result.totalOdkCount).toBe(10);
      expect(result.totalAppDbCount).toBe(3);
      expect(result.totalGap).toBe(7);
      expect(result.byForm).toHaveLength(1);
      expect(result.byForm[0]).toMatchObject({
        xmlFormId: 'test-form',
        odkCount: 10,
        appDbCount: 3,
        gap: 7,
      });
    });

    it('should handle multiple forms', async () => {
      setForms(1, [
        { xmlFormId: 'form-a', name: 'Form A', state: 'open' },
        { xmlFormId: 'form-b', name: 'Form B', state: 'open' },
      ]);
      setSubmissionCount('form-a', 5);
      setSubmissionCount('form-b', 15);
      appDbCounts.set('form-a', 5); // No gap
      appDbCounts.set('form-b', 10); // Gap of 5

      const result = await service.getSubmissionGap(1);

      expect(result.totalOdkCount).toBe(20);
      expect(result.totalAppDbCount).toBe(15);
      expect(result.totalGap).toBe(5);
      expect(result.byForm).toHaveLength(2);
    });

    it('should report zero gap when counts match', async () => {
      setForms(1, [
        { xmlFormId: 'synced-form', name: 'Synced Form', state: 'open' },
      ]);
      setSubmissionCount('synced-form', 100);
      appDbCounts.set('synced-form', 100);

      const result = await service.getSubmissionGap(1);

      expect(result.totalGap).toBe(0);
      expect(result.byForm[0].gap).toBe(0);
    });

    it('should throw when ODK is not configured', async () => {
      const { isOdkFullyConfigured } = await import('../odk-config.js');
      vi.mocked(isOdkFullyConfigured).mockReturnValueOnce(false);

      await expect(service.getSubmissionGap(1)).rejects.toMatchObject({
        code: 'ODK_CONFIG_ERROR',
      });
    });
  });

  describe('backfillMissingSubmissions', () => {
    it('should queue submissions not in app_db', async () => {
      setForms(1, [
        { xmlFormId: 'backfill-form', name: 'Backfill Form', state: 'open' },
      ]);
      setSubmissions('backfill-form', [
        { instanceId: 'sub-1', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { instanceId: 'sub-2', submitterId: 1, createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
        { instanceId: 'sub-3', submitterId: 1, createdAt: '2024-01-03T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
      ]);

      const result = await service.backfillMissingSubmissions(1);

      expect(result.submissionsQueued).toBe(3);
      expect(result.submissionsSkipped).toBe(0);
      expect(queuedSubmissions).toHaveLength(3);
      expect(queuedSubmissions.map(s => s.instanceId)).toEqual(['sub-1', 'sub-2', 'sub-3']);
    });

    it('should skip existing submissions (idempotent)', async () => {
      setForms(1, [
        { xmlFormId: 'idempotent-form', name: 'Idempotent Form', state: 'open' },
      ]);
      setSubmissions('idempotent-form', [
        { instanceId: 'exists-1', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { instanceId: 'new-1', submitterId: 1, createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
        { instanceId: 'exists-2', submitterId: 1, createdAt: '2024-01-03T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
      ]);

      // Mark some as existing
      existingSubmissions.add('exists-1');
      existingSubmissions.add('exists-2');

      const result = await service.backfillMissingSubmissions(1);

      expect(result.submissionsQueued).toBe(1);
      expect(result.submissionsSkipped).toBe(2);
      expect(queuedSubmissions).toHaveLength(1);
      expect(queuedSubmissions[0].instanceId).toBe('new-1');
    });

    it('should release lock after completion', async () => {
      setForms(1, [
        { xmlFormId: 'lock-test', name: 'Lock Test', state: 'open' },
      ]);
      setSubmissions('lock-test', []);

      await service.backfillMissingSubmissions(1);

      expect(mockLock.releaseLock).toHaveBeenCalledWith(1);
      expect(await service.isBackfillInProgress(1)).toBe(false);
    });

    it('should release lock even on error', async () => {
      setForms(1, [
        { xmlFormId: 'error-form', name: 'Error Form', state: 'open' },
      ]);
      setSubmissions('error-form', [
        { instanceId: 'error-sub', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]);

      // Make queueing fail
      mockPersistence.queueSubmissionForIngestion = vi.fn().mockRejectedValue(new Error('Queue error'));

      await expect(service.backfillMissingSubmissions(1)).rejects.toThrow('Queue error');
      expect(mockLock.releaseLock).toHaveBeenCalledWith(1);
    });

    it('should throw when ODK is not configured', async () => {
      const { isOdkFullyConfigured } = await import('../odk-config.js');
      vi.mocked(isOdkFullyConfigured).mockReturnValueOnce(false);

      await expect(service.backfillMissingSubmissions(1)).rejects.toMatchObject({
        code: 'ODK_CONFIG_ERROR',
      });
    });
  });

  describe('lock mechanism', () => {
    it('should prevent concurrent backfill operations', async () => {
      setForms(1, [
        { xmlFormId: 'concurrent-form', name: 'Concurrent Form', state: 'open' },
      ]);
      setSubmissions('concurrent-form', [
        { instanceId: 'slow-sub', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]);

      // Simulate slow queue operation
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      mockPersistence.queueSubmissionForIngestion = vi.fn().mockImplementation(async () => {
        await firstPromise;
      });

      // Start first backfill
      const backfill1 = service.backfillMissingSubmissions(1);

      // Try to start second backfill while first is running
      await expect(service.backfillMissingSubmissions(1)).rejects.toMatchObject({
        code: 'ODK_BACKFILL_IN_PROGRESS',
        statusCode: 409,
      });

      // Complete first backfill
      resolveFirst!();
      await backfill1;
    });

    it('should allow backfill for different projects concurrently', async () => {
      setForms(1, [{ xmlFormId: 'form-p1', name: 'Form P1', state: 'open' }]);
      setForms(2, [{ xmlFormId: 'form-p2', name: 'Form P2', state: 'open' }]);
      setSubmissions('form-p1', []);
      setSubmissions('form-p2', []);

      // Both should succeed
      const [result1, result2] = await Promise.all([
        service.backfillMissingSubmissions(1),
        service.backfillMissingSubmissions(2),
      ]);

      expect(result1.projectId).toBe(1);
      expect(result2.projectId).toBe(2);
    });

    it('should report lock status correctly', async () => {
      setForms(1, [{ xmlFormId: 'status-form', name: 'Status Form', state: 'open' }]);
      setSubmissions('status-form', []);

      // Not locked initially
      expect(await service.isBackfillInProgress(1)).toBe(false);

      // Lock manually
      await mockLock.acquireLock(1, 600);
      expect(await service.isBackfillInProgress(1)).toBe(true);

      // Unlock
      await mockLock.releaseLock(1);
      expect(await service.isBackfillInProgress(1)).toBe(false);
    });
  });

  describe('form processing', () => {
    it('should process all forms in project', async () => {
      setForms(1, [
        { xmlFormId: 'form-1', name: 'Form 1', state: 'open' },
        { xmlFormId: 'form-2', name: 'Form 2', state: 'open' },
        { xmlFormId: 'form-3', name: 'Form 3', state: 'open' },
      ]);
      setSubmissions('form-1', [
        { instanceId: 'f1-s1', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      ]);
      setSubmissions('form-2', [
        { instanceId: 'f2-s1', submitterId: 1, createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
        { instanceId: 'f2-s2', submitterId: 1, createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
      ]);
      setSubmissions('form-3', []);

      const result = await service.backfillMissingSubmissions(1);

      expect(result.byForm).toHaveLength(3);
      expect(result.byForm[0]).toMatchObject({ xmlFormId: 'form-1', queued: 1, skipped: 0 });
      expect(result.byForm[1]).toMatchObject({ xmlFormId: 'form-2', queued: 2, skipped: 0 });
      expect(result.byForm[2]).toMatchObject({ xmlFormId: 'form-3', queued: 0, skipped: 0 });
      expect(result.submissionsQueued).toBe(3);
    });

    it('should include timestamps in result', async () => {
      setForms(1, [{ xmlFormId: 'time-form', name: 'Time Form', state: 'open' }]);
      setSubmissions('time-form', []);

      const before = new Date().toISOString();
      const result = await service.backfillMissingSubmissions(1);
      const after = new Date().toISOString();

      expect(result.startedAt).toBeDefined();
      expect(result.completedAt).toBeDefined();
      expect(result.startedAt >= before).toBe(true);
      expect(result.completedAt <= after).toBe(true);
    });
  });
});
