import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMswForTest,
  mockServerState,
  ODK_BASE_URL,
} from './msw/index.js';
import { clearOdkSession, createAppUser, requireOdkConfig } from '../odk-client.js';
import { encryptAppUserToken, provisionAppUser } from '../odk-app-user.service.js';
import type { OdkConfig, OdkAppUserRecord, UserRole } from '@oslsr/types';
import { randomBytes } from 'node:crypto';

/**
 * ODK App User Service Integration Tests
 *
 * Tests the full App User provisioning flow with MSW mock ODK Central server.
 * Covers AC1-AC10 acceptance criteria from Story 2-3.
 */

// Initialize MSW for this test file
initMswForTest();

// Generate a test encryption key
const TEST_ENCRYPTION_KEY = randomBytes(32).toString('hex');

// Mock environment variables and clear session cache between tests
beforeEach(() => {
  vi.stubEnv('ODK_CENTRAL_URL', ODK_BASE_URL);
  vi.stubEnv('ODK_ADMIN_EMAIL', 'admin@example.com');
  vi.stubEnv('ODK_ADMIN_PASSWORD', 'secret123');
  vi.stubEnv('ODK_PROJECT_ID', '1');
  vi.stubEnv('ODK_TOKEN_ENCRYPTION_KEY', TEST_ENCRYPTION_KEY);
  clearOdkSession();
});

describe('createAppUser (ODK Client)', () => {
  it('should create an App User in ODK Central (AC2)', async () => {
    const config = requireOdkConfig();
    const displayName = 'John Doe (enumerator)';

    const result = await createAppUser(config, config.ODK_PROJECT_ID, displayName);

    expect(result).toMatchObject({
      id: expect.any(Number),
      type: 'field_key',
      displayName,
      token: expect.any(String),
      createdAt: expect.any(String),
    });

    // Verify token is a 64-character hex string
    expect(result.token).toMatch(/^[0-9a-f]{64}$/i);
  });

  it('should send correct request body to ODK Central', async () => {
    const config = requireOdkConfig();
    const displayName = 'Jane Smith (supervisor)';

    await createAppUser(config, config.ODK_PROJECT_ID, displayName);

    const requests = mockServerState.getRequestsByPath('/app-users');
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toEqual({ displayName });
  });

  it('should handle 401 authentication failure (AC6)', async () => {
    const config = requireOdkConfig();
    mockServerState.setNextError(401, 401.2, 'Authentication failed');

    await expect(createAppUser(config, config.ODK_PROJECT_ID, 'Test User')).rejects.toThrow();
  });

  it('should handle 404 project not found (AC6)', async () => {
    const config = requireOdkConfig();
    mockServerState.setNextError(404, 404.1, 'Project not found');

    await expect(createAppUser(config, 999, 'Test User')).rejects.toThrow();
  });

  it('should handle 500 server error (AC6)', async () => {
    const config = requireOdkConfig();
    mockServerState.setNextError(500, 500.1, 'Internal server error');

    await expect(createAppUser(config, config.ODK_PROJECT_ID, 'Test User')).rejects.toThrow();
  });
});

describe('encryptAppUserToken', () => {
  it('should encrypt token with AES-256-GCM (AC4)', () => {
    const config = requireOdkConfig();
    const mockOdkResponse = {
      id: 123,
      type: 'field_key' as const,
      displayName: 'Test User',
      token: 'a'.repeat(64),
      createdAt: new Date().toISOString(),
    };
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    const result = encryptAppUserToken(userId, mockOdkResponse, config);

    expect(result).toMatchObject({
      userId,
      odkAppUserId: 123,
      displayName: 'Test User',
      encryptedToken: expect.any(String),
      tokenIv: expect.any(String),
      odkProjectId: config.ODK_PROJECT_ID,
    });

    // Verify IV is 24 hex characters (12 bytes)
    expect(result.tokenIv).toMatch(/^[0-9a-f]{24}$/i);

    // Verify ciphertext is hex-encoded
    expect(result.encryptedToken).toMatch(/^[0-9a-f]+$/i);
  });

  it('should generate unique IV for each encryption', () => {
    const config = requireOdkConfig();
    const mockOdkResponse = {
      id: 123,
      type: 'field_key' as const,
      displayName: 'Test User',
      token: 'a'.repeat(64),
      createdAt: new Date().toISOString(),
    };
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    const result1 = encryptAppUserToken(userId, mockOdkResponse, config);
    const result2 = encryptAppUserToken(userId, mockOdkResponse, config);

    expect(result1.tokenIv).not.toBe(result2.tokenIv);
    expect(result1.encryptedToken).not.toBe(result2.encryptedToken);
  });

  it('should throw if encryption key is missing', () => {
    const configWithoutKey: OdkConfig = {
      ODK_CENTRAL_URL: ODK_BASE_URL,
      ODK_ADMIN_EMAIL: 'admin@example.com',
      ODK_ADMIN_PASSWORD: 'secret123',
      ODK_PROJECT_ID: 1,
      ODK_TOKEN_ENCRYPTION_KEY: undefined,
    };
    const mockOdkResponse = {
      id: 123,
      type: 'field_key' as const,
      displayName: 'Test User',
      token: 'a'.repeat(64),
      createdAt: new Date().toISOString(),
    };
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    expect(() => encryptAppUserToken(userId, mockOdkResponse, configWithoutKey)).toThrow(
      'ODK_TOKEN_ENCRYPTION_KEY is required for App User provisioning'
    );
  });
});

describe('provisionAppUser (Full Flow)', () => {
  // Mock persistence and audit interfaces
  const mockPersistence = {
    findByUserId: vi.fn(),
    create: vi.fn(),
  };

  const mockAudit = {
    logProvisioned: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should provision new App User with full flow (AC1-AC4, AC8)', async () => {
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';
    const fullName = 'John Enumerator';
    const role = 'enumerator' as UserRole;

    // Mock: no existing App User
    mockPersistence.findByUserId.mockResolvedValue(null);

    // Mock: create returns the record
    mockPersistence.create.mockImplementation(async (record) => ({
      id: 'new-odk-app-user-id',
      ...record,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await provisionAppUser(userId, fullName, role, mockPersistence, mockAudit);

    // Verify result shape (without token - AC7)
    expect(result).toMatchObject({
      id: 'new-odk-app-user-id',
      userId,
      odkAppUserId: expect.any(Number),
      displayName: `${fullName} (${role})`,
      odkProjectId: 1,
      createdAt: expect.any(String),
    });
    expect(result).not.toHaveProperty('encryptedToken');
    expect(result).not.toHaveProperty('tokenIv');

    // Verify persistence was called with encrypted token
    expect(mockPersistence.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId,
        encryptedToken: expect.any(String),
        tokenIv: expect.any(String),
      })
    );

    // Verify audit log was created (AC8)
    expect(mockAudit.logProvisioned).toHaveBeenCalledWith(
      userId,
      expect.any(Number),
      1,
      `${fullName} (${role})`
    );
  });

  it('should skip provisioning if App User already exists (AC5 - idempotent)', async () => {
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';
    const existingRecord: OdkAppUserRecord = {
      id: 'existing-id',
      userId,
      odkAppUserId: 456,
      displayName: 'Existing User (enumerator)',
      encryptedToken: 'encrypted',
      tokenIv: 'iv',
      odkProjectId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock: existing App User found
    mockPersistence.findByUserId.mockResolvedValue(existingRecord);

    const result = await provisionAppUser(
      userId,
      'John Enumerator',
      'enumerator' as UserRole,
      mockPersistence,
      mockAudit
    );

    // Should return existing record
    expect(result.odkAppUserId).toBe(456);

    // Should NOT call create or audit
    expect(mockPersistence.create).not.toHaveBeenCalled();
    expect(mockAudit.logProvisioned).not.toHaveBeenCalled();
  });

  it('should not expose plaintext token in response (AC7)', async () => {
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    mockPersistence.findByUserId.mockResolvedValue(null);
    mockPersistence.create.mockImplementation(async (record) => ({
      id: 'new-id',
      ...record,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await provisionAppUser(
      userId,
      'Test User',
      'supervisor' as UserRole,
      mockPersistence,
      mockAudit
    );

    // Verify no token-related fields in response
    const resultKeys = Object.keys(result);
    expect(resultKeys).not.toContain('token');
    expect(resultKeys).not.toContain('encryptedToken');
    expect(resultKeys).not.toContain('tokenIv');
  });
});

describe('Error Handling and Retry', () => {
  it('should propagate ODK API errors for retry (AC6)', async () => {
    const config = requireOdkConfig();
    mockServerState.setNextError(503, 'SERVICE_UNAVAILABLE', 'ODK Central is down');

    await expect(createAppUser(config, config.ODK_PROJECT_ID, 'Test')).rejects.toThrow();
  });
});
