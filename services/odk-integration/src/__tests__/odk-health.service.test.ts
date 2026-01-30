/**
 * ODK Health Service Tests (Story 2-5, AC: 1, 4, 6, 8)
 *
 * Tests for connectivity checking, submission count aggregation,
 * sync failure CRUD operations, and retry mechanism.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mockServerState } from './msw/server-state.js';
import { server } from './msw/server.js';
import {
  createOdkHealthService,
  type OdkHealthServiceDeps,
} from '../odk-health.service.js';
import type { OdkSyncFailure, OdkOperation } from '@oslsr/types';

// Setup MSW
beforeEach(() => {
  server.listen({ onUnhandledRequest: 'error' });
  mockServerState.reset();
  // Set valid credentials
  mockServerState.setValidCredentials('admin@example.com', 'secret123');
  // Set up test ODK environment
  process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
  process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
  process.env.ODK_ADMIN_PASSWORD = 'secret123';
  process.env.ODK_PROJECT_ID = '1';
  process.env.ODK_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
});

afterEach(() => {
  server.resetHandlers();
  server.close();
  // Clear ODK env vars
  delete process.env.ODK_CENTRAL_URL;
  delete process.env.ODK_ADMIN_EMAIL;
  delete process.env.ODK_ADMIN_PASSWORD;
  delete process.env.ODK_PROJECT_ID;
  delete process.env.ODK_TOKEN_ENCRYPTION_KEY;
});

// Mock dependencies
function createMockDeps(overrides?: Partial<OdkHealthServiceDeps>): OdkHealthServiceDeps {
  return {
    persistence: {
      createSyncFailure: vi.fn().mockResolvedValue({ id: 'failure-1' }),
      getSyncFailures: vi.fn().mockResolvedValue([]),
      getSyncFailureById: vi.fn().mockResolvedValue(null),
      updateSyncFailure: vi.fn().mockResolvedValue(undefined),
      deleteSyncFailure: vi.fn().mockResolvedValue(undefined),
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    ...overrides,
  };
}

describe('OdkHealthService', () => {
  describe('checkOdkConnectivity', () => {
    it('should return reachable=true when ODK Central responds successfully', async () => {
      const deps = createMockDeps();
      const service = createOdkHealthService(deps);

      const result = await service.checkOdkConnectivity();

      expect(result.reachable).toBe(true);
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.lastChecked).toBeDefined();
      expect(result.consecutiveFailures).toBe(0);
    });

    it('should return reachable=false when ODK Central is unreachable', async () => {
      // Inject error to simulate unreachable
      mockServerState.setNextError(503, 'SERVICE_UNAVAILABLE', 'ODK Central is down');

      const deps = createMockDeps();
      const service = createOdkHealthService(deps);

      const result = await service.checkOdkConnectivity();

      expect(result.reachable).toBe(false);
      expect(result.consecutiveFailures).toBeGreaterThan(0);
    });

    it('should return ODK_CONFIG_ERROR when ODK is not configured', async () => {
      // Clear ODK config
      delete process.env.ODK_CENTRAL_URL;

      const deps = createMockDeps();
      const service = createOdkHealthService(deps);

      await expect(service.checkOdkConnectivity()).rejects.toMatchObject({
        code: 'ODK_CONFIG_ERROR',
      });
    });
  });

  describe('getSubmissionCounts', () => {
    it('should aggregate submission counts across all forms', async () => {
      // Pre-register forms with submissions
      mockServerState.preRegisterForm('form1', 1);
      mockServerState.preRegisterForm('form2', 1);
      mockServerState.setSubmissionCount('form1', 10);
      mockServerState.setSubmissionCount('form2', 15);

      const deps = createMockDeps();
      const service = createOdkHealthService(deps);

      const result = await service.getSubmissionCounts(1);

      expect(result.odkCount).toBe(25); // 10 + 15
      expect(result.byForm).toHaveLength(2);
      expect(result.byForm.find(f => f.xmlFormId === 'form1')?.odkCount).toBe(10);
      expect(result.byForm.find(f => f.xmlFormId === 'form2')?.odkCount).toBe(15);
    });

    it('should return zero when no forms exist', async () => {
      const deps = createMockDeps();
      const service = createOdkHealthService(deps);

      const result = await service.getSubmissionCounts(1);

      expect(result.odkCount).toBe(0);
      expect(result.byForm).toHaveLength(0);
    });
  });

  describe('recordSyncFailure', () => {
    it('should persist a sync failure record', async () => {
      const mockPersistence = {
        createSyncFailure: vi.fn().mockResolvedValue({
          id: 'failure-123',
          operation: 'form_deploy',
          errorMessage: 'Connection timeout',
          errorCode: 'ODK_TIMEOUT',
          retryCount: 0,
          createdAt: new Date().toISOString(),
        }),
        getSyncFailures: vi.fn(),
        getSyncFailureById: vi.fn(),
        updateSyncFailure: vi.fn(),
        deleteSyncFailure: vi.fn(),
      };

      const deps = createMockDeps({ persistence: mockPersistence });
      const service = createOdkHealthService(deps);

      const failure = await service.recordSyncFailure({
        operation: 'form_deploy',
        errorMessage: 'Connection timeout',
        errorCode: 'ODK_TIMEOUT',
        context: { formId: 'test-form' },
      });

      expect(mockPersistence.createSyncFailure).toHaveBeenCalledWith({
        operation: 'form_deploy',
        errorMessage: 'Connection timeout',
        errorCode: 'ODK_TIMEOUT',
        context: { formId: 'test-form' },
      });
      expect(failure.id).toBe('failure-123');
    });
  });

  describe('getSyncFailures', () => {
    it('should return unresolved sync failures', async () => {
      const mockFailures: OdkSyncFailure[] = [
        {
          id: 'failure-1',
          operation: 'form_deploy',
          errorMessage: 'Timeout',
          errorCode: 'ODK_TIMEOUT',
          retryCount: 2,
          resolvedAt: null,
          createdAt: '2026-01-29T10:00:00Z',
          updatedAt: '2026-01-29T10:00:00Z',
        },
        {
          id: 'failure-2',
          operation: 'app_user_create',
          errorMessage: 'Auth failed',
          errorCode: 'ODK_AUTH_FAILED',
          retryCount: 0,
          resolvedAt: null,
          createdAt: '2026-01-29T11:00:00Z',
          updatedAt: '2026-01-29T11:00:00Z',
        },
      ];

      const mockPersistence = {
        createSyncFailure: vi.fn(),
        getSyncFailures: vi.fn().mockResolvedValue(mockFailures),
        getSyncFailureById: vi.fn(),
        updateSyncFailure: vi.fn(),
        deleteSyncFailure: vi.fn(),
      };

      const deps = createMockDeps({ persistence: mockPersistence });
      const service = createOdkHealthService(deps);

      const failures = await service.getSyncFailures();

      expect(failures).toHaveLength(2);
      expect(mockPersistence.getSyncFailures).toHaveBeenCalledWith({ unresolvedOnly: true });
    });
  });

  describe('retrySyncFailure', () => {
    it('should re-attempt failed form_deploy operation', async () => {
      const failureRecord: OdkSyncFailure = {
        id: 'failure-1',
        operation: 'form_deploy',
        errorMessage: 'Previous timeout',
        errorCode: 'ODK_TIMEOUT',
        context: { formId: 'test-form', fileName: 'test.xlsx' },
        retryCount: 1,
        resolvedAt: null,
        createdAt: '2026-01-29T10:00:00Z',
        updatedAt: '2026-01-29T10:00:00Z',
      };

      const mockPersistence = {
        createSyncFailure: vi.fn(),
        getSyncFailures: vi.fn(),
        getSyncFailureById: vi.fn().mockResolvedValue(failureRecord),
        updateSyncFailure: vi.fn().mockResolvedValue(undefined),
        deleteSyncFailure: vi.fn(),
      };

      const deps = createMockDeps({ persistence: mockPersistence });
      const service = createOdkHealthService(deps);

      // Mock the retry operation handler
      service.setRetryHandler('form_deploy', vi.fn().mockResolvedValue({ success: true }));

      const result = await service.retrySyncFailure('failure-1');

      expect(result.success).toBe(true);
      expect(result.failureId).toBe('failure-1');
      expect(mockPersistence.updateSyncFailure).toHaveBeenCalledWith('failure-1', expect.objectContaining({
        resolvedAt: expect.any(String),
      }));
    });

    it('should increment retry count on failure', async () => {
      const failureRecord: OdkSyncFailure = {
        id: 'failure-1',
        operation: 'form_deploy',
        errorMessage: 'Timeout',
        errorCode: 'ODK_TIMEOUT',
        context: { formId: 'test-form' },
        retryCount: 1,
        resolvedAt: null,
        createdAt: '2026-01-29T10:00:00Z',
        updatedAt: '2026-01-29T10:00:00Z',
      };

      const mockPersistence = {
        createSyncFailure: vi.fn(),
        getSyncFailures: vi.fn(),
        getSyncFailureById: vi.fn().mockResolvedValue(failureRecord),
        updateSyncFailure: vi.fn().mockResolvedValue(undefined),
        deleteSyncFailure: vi.fn(),
      };

      const deps = createMockDeps({ persistence: mockPersistence });
      const service = createOdkHealthService(deps);

      // Mock the retry operation to fail again
      service.setRetryHandler('form_deploy', vi.fn().mockRejectedValue(new Error('Still timing out')));

      const result = await service.retrySyncFailure('failure-1');

      expect(result.success).toBe(false);
      expect(mockPersistence.updateSyncFailure).toHaveBeenCalledWith('failure-1', expect.objectContaining({
        retryCount: 2,
        errorMessage: 'Still timing out',
      }));
    });

    it('should throw when failure record not found', async () => {
      const mockPersistence = {
        createSyncFailure: vi.fn(),
        getSyncFailures: vi.fn(),
        getSyncFailureById: vi.fn().mockResolvedValue(null),
        updateSyncFailure: vi.fn(),
        deleteSyncFailure: vi.fn(),
      };

      const deps = createMockDeps({ persistence: mockPersistence });
      const service = createOdkHealthService(deps);

      await expect(service.retrySyncFailure('non-existent')).rejects.toMatchObject({
        code: 'SYNC_FAILURE_NOT_FOUND',
      });
    });
  });
});
