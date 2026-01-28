import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { UserRole } from '@oslsr/types';
import type { CreateOdkAppUserPayload, OdkAppUserRecord, OdkAppUserResponse } from '@oslsr/types';
import type { OdkAppUserPersistence, OdkAppUserAudit } from '@oslsr/odk-integration';
import {
  processOdkAppUserJob,
  type JobContext,
  type ProcessorDependencies,
  type ProcessorSuccessResult,
  type ProcessorSkippedResult,
} from '../odk-app-user.worker.js';

/**
 * Comprehensive Processor Tests for ODK App User Worker
 *
 * These tests exercise the actual processor logic with mocked dependencies,
 * covering all acceptance criteria and edge cases. This pattern allows testing
 * without BullMQ/Redis and provides confidence in the business logic.
 *
 * Coverage:
 * - AC1: Field role provisioning on activation
 * - AC5: Idempotency (skip if exists)
 * - AC6: Error propagation for retry
 * - AC8: Audit logging
 * - AC10: Back-office role filtering
 */

// Silent logger for tests
const testLogger = pino({ level: 'silent' });

// Factory for creating mock persistence
const createMockPersistence = (): OdkAppUserPersistence => ({
  findByUserId: vi.fn(),
  create: vi.fn(),
});

// Factory for creating mock audit
const createMockAudit = (): OdkAppUserAudit => ({
  logProvisioned: vi.fn(),
});

// Factory for creating mock provision function
const createMockProvisionFn = () => vi.fn<
  Parameters<typeof import('@oslsr/odk-integration').provisionAppUser>,
  ReturnType<typeof import('@oslsr/odk-integration').provisionAppUser>
>();

// Factory for creating test dependencies
const createTestDeps = (overrides?: Partial<ProcessorDependencies>): ProcessorDependencies => ({
  persistence: createMockPersistence(),
  audit: createMockAudit(),
  provisionFn: createMockProvisionFn(),
  logger: testLogger,
  ...overrides,
});

// Default job context
const defaultContext: JobContext = {
  jobId: 'test-job-123',
  attemptsMade: 0,
  maxAttempts: 5,
};

// Valid field role payload
const enumeratorPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890ab',
  fullName: 'John Enumerator',
  role: UserRole.ENUMERATOR,
};

const supervisorPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890ac',
  fullName: 'Jane Supervisor',
  role: UserRole.SUPERVISOR,
};

// Back-office role payloads
const verificationAssessorPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890ad',
  fullName: 'Bob Assessor',
  role: UserRole.VERIFICATION_ASSESSOR,
};

const superAdminPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890ae',
  fullName: 'Alice Admin',
  role: UserRole.SUPER_ADMIN,
};

const governmentOfficialPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890af',
  fullName: 'Gov Official',
  role: UserRole.GOVERNMENT_OFFICIAL,
};

const dataEntryClerkPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890b0',
  fullName: 'Data Clerk',
  role: UserRole.DATA_ENTRY_CLERK,
};

const publicUserPayload: CreateOdkAppUserPayload = {
  userId: '018e5f2a-1234-7890-abcd-1234567890b1',
  fullName: 'Public Person',
  role: UserRole.PUBLIC_USER,
};

// Mock successful provision response
const mockSuccessResponse: OdkAppUserResponse = {
  id: 'new-odk-app-user-id',
  userId: enumeratorPayload.userId,
  odkAppUserId: 123,
  displayName: 'John Enumerator (enumerator)',
  odkProjectId: 1,
  createdAt: new Date().toISOString(),
};

describe('processOdkAppUserJob - Processor Logic', () => {
  describe('AC1: Field Role Provisioning', () => {
    it('should provision ENUMERATOR role successfully', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);

      const result = await processOdkAppUserJob(enumeratorPayload, defaultContext, deps);

      expect(result.success).toBe(true);
      expect((result as ProcessorSuccessResult).odkAppUserId).toBe(123);
      expect(deps.provisionFn).toHaveBeenCalledWith(
        enumeratorPayload.userId,
        enumeratorPayload.fullName,
        enumeratorPayload.role,
        deps.persistence,
        deps.audit
      );
    });

    it('should provision SUPERVISOR role successfully', async () => {
      const deps = createTestDeps();
      const supervisorResponse = { ...mockSuccessResponse, userId: supervisorPayload.userId };
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(supervisorResponse);

      const result = await processOdkAppUserJob(supervisorPayload, defaultContext, deps);

      expect(result.success).toBe(true);
      expect(deps.provisionFn).toHaveBeenCalledWith(
        supervisorPayload.userId,
        supervisorPayload.fullName,
        supervisorPayload.role,
        deps.persistence,
        deps.audit
      );
    });

    it('should return correct displayName in result', async () => {
      const deps = createTestDeps();
      const responseWithName = { ...mockSuccessResponse, displayName: 'John Enumerator (enumerator)' };
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(responseWithName);

      const result = await processOdkAppUserJob(enumeratorPayload, defaultContext, deps) as ProcessorSuccessResult;

      expect(result.displayName).toBe('John Enumerator (enumerator)');
    });
  });

  describe('AC10: Back-Office Role Filtering', () => {
    const backOfficeTestCases = [
      { name: 'VERIFICATION_ASSESSOR', payload: verificationAssessorPayload },
      { name: 'SUPER_ADMIN', payload: superAdminPayload },
      { name: 'GOVERNMENT_OFFICIAL', payload: governmentOfficialPayload },
      { name: 'DATA_ENTRY_CLERK', payload: dataEntryClerkPayload },
      { name: 'PUBLIC_USER', payload: publicUserPayload },
    ];

    backOfficeTestCases.forEach(({ name, payload }) => {
      it(`should skip ${name} role without calling provisionFn`, async () => {
        const deps = createTestDeps();

        const result = await processOdkAppUserJob(payload, defaultContext, deps);

        expect(result.success).toBe(true);
        expect((result as ProcessorSkippedResult).skipped).toBe(true);
        expect((result as ProcessorSkippedResult).reason).toBe('back-office role');
        expect(deps.provisionFn).not.toHaveBeenCalled();
      });
    });

    it('should include userId and role in skipped result', async () => {
      const deps = createTestDeps();

      const result = await processOdkAppUserJob(superAdminPayload, defaultContext, deps) as ProcessorSkippedResult;

      expect(result.userId).toBe(superAdminPayload.userId);
      expect(result.role).toBe(UserRole.SUPER_ADMIN);
    });
  });

  describe('AC5: Idempotency (via provisionFn)', () => {
    it('should return existing App User when provisionFn returns cached result', async () => {
      const deps = createTestDeps();
      const existingResponse: OdkAppUserResponse = {
        id: 'existing-id',
        userId: enumeratorPayload.userId,
        odkAppUserId: 456,
        displayName: 'Existing User (enumerator)',
        odkProjectId: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      };
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(existingResponse);

      const result = await processOdkAppUserJob(enumeratorPayload, defaultContext, deps) as ProcessorSuccessResult;

      expect(result.success).toBe(true);
      expect(result.odkAppUserId).toBe(456);
      // provisionFn is called - it handles idempotency internally
      expect(deps.provisionFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('AC6: Error Handling and Retry', () => {
    it('should propagate ODK API errors for BullMQ retry', async () => {
      const deps = createTestDeps();
      const odkError = new Error('ODK Central API error: 503 Service Unavailable');
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(odkError);

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps))
        .rejects.toThrow('ODK Central API error: 503 Service Unavailable');
    });

    it('should propagate authentication errors for retry', async () => {
      const deps = createTestDeps();
      const authError = new Error('ODK_AUTH_FAILED: Failed to authenticate with ODK Central');
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(authError);

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps))
        .rejects.toThrow('ODK_AUTH_FAILED');
    });

    it('should propagate network errors for retry', async () => {
      const deps = createTestDeps();
      const networkError = new Error('ECONNREFUSED: Connection refused');
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(networkError);

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps))
        .rejects.toThrow('ECONNREFUSED');
    });

    it('should propagate database errors for retry', async () => {
      const deps = createTestDeps();
      const dbError = new Error('Database connection lost');
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(dbError);

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps))
        .rejects.toThrow('Database connection lost');
    });

    it('should handle encryption key missing error', async () => {
      const deps = createTestDeps();
      const encryptionError = new Error('ODK_TOKEN_ENCRYPTION_KEY is required for App User provisioning');
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(encryptionError);

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps))
        .rejects.toThrow('ODK_TOKEN_ENCRYPTION_KEY is required');
    });
  });

  describe('Payload Validation', () => {
    it('should reject invalid UUID in userId', async () => {
      const deps = createTestDeps();
      const invalidPayload = {
        userId: 'not-a-uuid',
        fullName: 'Test User',
        role: UserRole.ENUMERATOR,
      };

      await expect(processOdkAppUserJob(invalidPayload, defaultContext, deps))
        .rejects.toThrow('Invalid job payload');
      expect(deps.provisionFn).not.toHaveBeenCalled();
    });

    it('should reject empty fullName', async () => {
      const deps = createTestDeps();
      const invalidPayload = {
        userId: '018e5f2a-1234-7890-abcd-1234567890ab',
        fullName: '',
        role: UserRole.ENUMERATOR,
      };

      await expect(processOdkAppUserJob(invalidPayload, defaultContext, deps))
        .rejects.toThrow('Invalid job payload');
      expect(deps.provisionFn).not.toHaveBeenCalled();
    });

    it('should reject invalid role enum', async () => {
      const deps = createTestDeps();
      const invalidPayload = {
        userId: '018e5f2a-1234-7890-abcd-1234567890ab',
        fullName: 'Test User',
        role: 'invalid_role' as UserRole,
      };

      await expect(processOdkAppUserJob(invalidPayload, defaultContext, deps))
        .rejects.toThrow('Invalid job payload');
      expect(deps.provisionFn).not.toHaveBeenCalled();
    });

    it('should accept fullName with special characters', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const specialPayload = {
        userId: '018e5f2a-1234-7890-abcd-1234567890ab',
        fullName: "Olúwásẹ́gun Adéwálé-Johnson Jr. III",
        role: UserRole.ENUMERATOR,
      };

      const result = await processOdkAppUserJob(specialPayload, defaultContext, deps);

      expect(result.success).toBe(true);
      expect(deps.provisionFn).toHaveBeenCalledWith(
        specialPayload.userId,
        specialPayload.fullName,
        specialPayload.role,
        deps.persistence,
        deps.audit
      );
    });

    it('should accept fullName at max length (200 chars)', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const maxLengthPayload = {
        userId: '018e5f2a-1234-7890-abcd-1234567890ab',
        fullName: 'A'.repeat(200),
        role: UserRole.ENUMERATOR,
      };

      const result = await processOdkAppUserJob(maxLengthPayload, defaultContext, deps);

      expect(result.success).toBe(true);
    });

    it('should reject fullName exceeding max length', async () => {
      const deps = createTestDeps();
      const tooLongPayload = {
        userId: '018e5f2a-1234-7890-abcd-1234567890ab',
        fullName: 'A'.repeat(201),
        role: UserRole.ENUMERATOR,
      };

      await expect(processOdkAppUserJob(tooLongPayload, defaultContext, deps))
        .rejects.toThrow('Invalid job payload');
    });
  });

  describe('Job Context Handling', () => {
    it('should work with first attempt (attemptsMade: 0)', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const context: JobContext = { jobId: 'job-1', attemptsMade: 0, maxAttempts: 5 };

      const result = await processOdkAppUserJob(enumeratorPayload, context, deps);

      expect(result.success).toBe(true);
    });

    it('should work with retry attempt (attemptsMade: 3)', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const context: JobContext = { jobId: 'job-1', attemptsMade: 3, maxAttempts: 5 };

      const result = await processOdkAppUserJob(enumeratorPayload, context, deps);

      expect(result.success).toBe(true);
    });

    it('should work with final attempt (attemptsMade: 4, max: 5)', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const context: JobContext = { jobId: 'job-1', attemptsMade: 4, maxAttempts: 5 };

      const result = await processOdkAppUserJob(enumeratorPayload, context, deps);

      expect(result.success).toBe(true);
    });

    it('should handle undefined jobId gracefully', async () => {
      const deps = createTestDeps();
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);
      const context: JobContext = { jobId: undefined, attemptsMade: 0, maxAttempts: 5 };

      const result = await processOdkAppUserJob(enumeratorPayload, context, deps);

      expect(result.success).toBe(true);
    });
  });

  describe('Dependency Injection', () => {
    it('should call provisionFn with correct persistence interface', async () => {
      const mockPersistence = createMockPersistence();
      const deps = createTestDeps({ persistence: mockPersistence });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);

      await processOdkAppUserJob(enumeratorPayload, defaultContext, deps);

      expect(deps.provisionFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        mockPersistence,
        expect.anything()
      );
    });

    it('should call provisionFn with correct audit interface', async () => {
      const mockAudit = createMockAudit();
      const deps = createTestDeps({ audit: mockAudit });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);

      await processOdkAppUserJob(enumeratorPayload, defaultContext, deps);

      expect(deps.provisionFn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.anything(),
        mockAudit
      );
    });
  });

  describe('Logging Behavior', () => {
    it('should use provided logger for all events', async () => {
      const logSpy = vi.fn();
      const spyLogger = {
        info: logSpy,
        error: logSpy,
        fatal: logSpy,
        debug: logSpy,
        warn: logSpy,
        trace: logSpy,
        child: () => spyLogger,
        level: 'info',
      } as unknown as pino.Logger;

      const deps = createTestDeps({ logger: spyLogger });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockResolvedValue(mockSuccessResponse);

      await processOdkAppUserJob(enumeratorPayload, defaultContext, deps);

      // Should log job_started and job_completed
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.job_started' }));
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.job_completed' }));
    });

    it('should log error event on failure', async () => {
      const logSpy = vi.fn();
      const spyLogger = {
        info: logSpy,
        error: logSpy,
        fatal: logSpy,
        debug: logSpy,
        warn: logSpy,
        trace: logSpy,
        child: () => spyLogger,
        level: 'info',
      } as unknown as pino.Logger;

      const deps = createTestDeps({ logger: spyLogger });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(new Error('Test error'));

      await expect(processOdkAppUserJob(enumeratorPayload, defaultContext, deps)).rejects.toThrow();

      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.create_failed' }));
    });

    it('should log skipped_backoffice for non-field roles', async () => {
      const logSpy = vi.fn();
      const spyLogger = {
        info: logSpy,
        error: logSpy,
        fatal: logSpy,
        debug: logSpy,
        warn: logSpy,
        trace: logSpy,
        child: () => spyLogger,
        level: 'info',
      } as unknown as pino.Logger;

      const deps = createTestDeps({ logger: spyLogger });

      await processOdkAppUserJob(superAdminPayload, defaultContext, deps);

      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.skipped_backoffice' }));
    });

    it('should log provision_exhausted on final attempt failure', async () => {
      const logSpy = vi.fn();
      const spyLogger = {
        info: logSpy,
        error: logSpy,
        fatal: logSpy,
        debug: logSpy,
        warn: logSpy,
        trace: logSpy,
        child: () => spyLogger,
        level: 'info',
      } as unknown as pino.Logger;

      const deps = createTestDeps({ logger: spyLogger });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(new Error('Final error'));
      const finalContext: JobContext = { jobId: 'job-1', attemptsMade: 4, maxAttempts: 5 };

      await expect(processOdkAppUserJob(enumeratorPayload, finalContext, deps)).rejects.toThrow();

      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({
        event: 'odk.appuser.provision_exhausted',
        action_required: expect.stringContaining('Manual intervention'),
      }));
    });

    it('should NOT log provision_exhausted on non-final attempt failure', async () => {
      const logSpy = vi.fn();
      const spyLogger = {
        info: logSpy,
        error: logSpy,
        fatal: logSpy,
        debug: logSpy,
        warn: logSpy,
        trace: logSpy,
        child: () => spyLogger,
        level: 'info',
      } as unknown as pino.Logger;

      const deps = createTestDeps({ logger: spyLogger });
      (deps.provisionFn as ReturnType<typeof createMockProvisionFn>).mockRejectedValue(new Error('Retry error'));
      const midContext: JobContext = { jobId: 'job-1', attemptsMade: 2, maxAttempts: 5 };

      await expect(processOdkAppUserJob(enumeratorPayload, midContext, deps)).rejects.toThrow();

      // Should log create_failed but NOT provision_exhausted
      expect(logSpy).toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.create_failed' }));
      expect(logSpy).not.toHaveBeenCalledWith(expect.objectContaining({ event: 'odk.appuser.provision_exhausted' }));
    });
  });
});
