import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  initMswForTest,
  ODK_BASE_URL,
} from './msw/index.js';
import { clearOdkSession, createAppUser, requireOdkConfig } from '../odk-client.js';
import { encryptAppUserToken } from '../odk-app-user.service.js';
import { createOdkTokenService, type TokenAccessContext } from '../odk-token.service.js';
import type { OdkAppUserRecord, UserRole } from '@oslsr/types';
import { UserRole as UserRoleEnum, ODK_TOKEN_NOT_FOUND, ODK_TOKEN_DECRYPTION_ERROR } from '@oslsr/types';
import { randomBytes } from 'node:crypto';

/**
 * ODK Token Service Integration Tests (Story 2-4)
 *
 * Tests the full token lifecycle:
 * - Provision App User (via MSW mock ODK Central)
 * - Encrypt token for storage
 * - Retrieve and decrypt token
 * - Token isolation between users
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

describe('Token Full Flow Integration', () => {
  // In-memory storage to simulate database
  const tokenStore: Map<string, OdkAppUserRecord> = new Map();

  // Mock persistence using in-memory store
  const createMockPersistence = () => ({
    findByUserId: vi.fn().mockImplementation(async (userId: string) => {
      return tokenStore.get(userId) || null;
    }),
  });

  // Mock audit
  const createMockAudit = () => ({
    logTokenAccessed: vi.fn().mockResolvedValue(undefined),
  });

  // Mock logger
  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });

  beforeEach(() => {
    tokenStore.clear();
  });

  it('should complete full flow: provision → encrypt → store → retrieve → decrypt (AC5)', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';
    const displayName = 'John Doe (enumerator)';

    // Step 1: Create App User in ODK Central (MSW mock)
    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, displayName);
    expect(odkAppUser.token).toBeTruthy();

    // Step 2: Encrypt the token
    const encryptedData = encryptAppUserToken(userId, odkAppUser, config);
    expect(encryptedData.encryptedToken).toBeTruthy();
    expect(encryptedData.tokenIv).toBeTruthy();

    // Step 3: Store in mock database
    const record: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: encryptedData.encryptedToken,
      tokenIv: encryptedData.tokenIv,
      odkProjectId: encryptedData.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    tokenStore.set(userId, record);

    // Step 4: Create token service and retrieve token
    const persistence = createMockPersistence();
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const context: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    const decryptedToken = await tokenService.getDecryptedToken(userId, context);

    // Step 5: Verify decrypted token matches original
    expect(decryptedToken).toBe(odkAppUser.token);

    // Verify audit was logged
    expect(audit.logTokenAccessed).toHaveBeenCalledWith(userId, 'system', 'system');
  });

  it('should isolate tokens between multiple users (AC5)', async () => {
    const config = requireOdkConfig();

    // Create two App Users with different tokens
    const user1Id = '018e5f2a-0001-7abc-def0-123456789abc';
    const user2Id = '018e5f2a-0002-7abc-def0-123456789abc';

    const odkAppUser1 = await createAppUser(config, config.ODK_PROJECT_ID, 'User One (enumerator)');
    const odkAppUser2 = await createAppUser(config, config.ODK_PROJECT_ID, 'User Two (supervisor)');

    // Verify tokens are different
    expect(odkAppUser1.token).not.toBe(odkAppUser2.token);

    // Encrypt and store both tokens
    const encrypted1 = encryptAppUserToken(user1Id, odkAppUser1, config);
    const encrypted2 = encryptAppUserToken(user2Id, odkAppUser2, config);

    // Verify encrypted values are different
    expect(encrypted1.encryptedToken).not.toBe(encrypted2.encryptedToken);

    // Store in mock database
    tokenStore.set(user1Id, {
      id: 'record-1',
      userId: user1Id,
      odkAppUserId: odkAppUser1.id,
      displayName: odkAppUser1.displayName,
      encryptedToken: encrypted1.encryptedToken,
      tokenIv: encrypted1.tokenIv,
      odkProjectId: encrypted1.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    tokenStore.set(user2Id, {
      id: 'record-2',
      userId: user2Id,
      odkAppUserId: odkAppUser2.id,
      displayName: odkAppUser2.displayName,
      encryptedToken: encrypted2.encryptedToken,
      tokenIv: encrypted2.tokenIv,
      odkProjectId: encrypted2.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create token service
    const persistence = createMockPersistence();
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const systemContext: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    // Retrieve both tokens
    const decrypted1 = await tokenService.getDecryptedToken(user1Id, systemContext);
    const decrypted2 = await tokenService.getDecryptedToken(user2Id, systemContext);

    // Verify each token matches its original
    expect(decrypted1).toBe(odkAppUser1.token);
    expect(decrypted2).toBe(odkAppUser2.token);
    expect(decrypted1).not.toBe(decrypted2);
  });
});

describe('Token Decryption Error Scenarios', () => {
  // Mock persistence with corrupted data
  const createMockPersistence = (record: OdkAppUserRecord | null) => ({
    findByUserId: vi.fn().mockResolvedValue(record),
  });

  const createMockAudit = () => ({
    logTokenAccessed: vi.fn().mockResolvedValue(undefined),
  });

  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });

  it('should fail gracefully when token data is corrupted', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    // Create a valid App User first
    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, 'Test User');
    const encrypted = encryptAppUserToken(userId, odkAppUser, config);

    // Corrupt the ciphertext by flipping bits
    const corruptedCiphertext = Buffer.from(encrypted.encryptedToken, 'hex');
    corruptedCiphertext[0] ^= 0xff; // Flip bits in actual ciphertext

    const corruptedRecord: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: corruptedCiphertext.toString('hex'),
      tokenIv: encrypted.tokenIv,
      odkProjectId: encrypted.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const persistence = createMockPersistence(corruptedRecord);
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const context: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    await expect(tokenService.getDecryptedToken(userId, context)).rejects.toMatchObject({
      code: ODK_TOKEN_DECRYPTION_ERROR,
      statusCode: 500,
    });

    // Verify error was logged (without exposing crypto details)
    expect(logger.error).toHaveBeenCalled();
  });

  it('should fail gracefully when IV is corrupted', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, 'Test User');
    const encrypted = encryptAppUserToken(userId, odkAppUser, config);

    // Use wrong IV
    const wrongIv = randomBytes(12).toString('hex');

    const recordWithWrongIv: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: encrypted.encryptedToken,
      tokenIv: wrongIv, // Wrong IV
      odkProjectId: encrypted.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const persistence = createMockPersistence(recordWithWrongIv);
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const context: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    await expect(tokenService.getDecryptedToken(userId, context)).rejects.toMatchObject({
      code: ODK_TOKEN_DECRYPTION_ERROR,
      statusCode: 500,
    });
  });

  it('should fail gracefully when encryption key is wrong', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, 'Test User');
    const encrypted = encryptAppUserToken(userId, odkAppUser, config);

    const record: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: encrypted.encryptedToken,
      tokenIv: encrypted.tokenIv,
      odkProjectId: encrypted.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const persistence = createMockPersistence(record);
    const audit = createMockAudit();
    const logger = createMockLogger();

    // Use a different encryption key
    const wrongKey = randomBytes(32).toString('hex');
    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: wrongKey },
      logger,
    });

    const context: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    await expect(tokenService.getDecryptedToken(userId, context)).rejects.toMatchObject({
      code: ODK_TOKEN_DECRYPTION_ERROR,
      statusCode: 500,
    });
  });

  it('should return TOKEN_NOT_FOUND for non-existent user', async () => {
    const persistence = createMockPersistence(null);
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const context: TokenAccessContext = {
      callerId: 'system',
      purpose: 'system',
    };

    await expect(tokenService.getDecryptedToken('non-existent-user', context)).rejects.toMatchObject({
      code: ODK_TOKEN_NOT_FOUND,
      statusCode: 404,
    });
  });
});

describe('Token Health Check Integration', () => {
  const createMockPersistence = (record: OdkAppUserRecord | null) => ({
    findByUserId: vi.fn().mockResolvedValue(record),
  });

  const createMockAudit = () => ({
    logTokenAccessed: vi.fn().mockResolvedValue(undefined),
  });

  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });

  it('should validate healthy token without exposing plaintext', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    // Create valid encrypted token
    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, 'Test User');
    const encrypted = encryptAppUserToken(userId, odkAppUser, config);

    const record: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: encrypted.encryptedToken,
      tokenIv: encrypted.tokenIv,
      odkProjectId: encrypted.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const persistence = createMockPersistence(record);
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const result = await tokenService.validateTokenHealth(userId);

    expect(result).toEqual({ valid: true });

    // Health check should NOT create audit log
    expect(audit.logTokenAccessed).not.toHaveBeenCalled();

    // Result should NOT contain the actual token
    expect(JSON.stringify(result)).not.toContain(odkAppUser.token);
  });

  it('should detect unhealthy (corrupted) token', async () => {
    const config = requireOdkConfig();
    const userId = '018e5f2a-1234-7890-abcd-1234567890ab';

    const odkAppUser = await createAppUser(config, config.ODK_PROJECT_ID, 'Test User');
    const encrypted = encryptAppUserToken(userId, odkAppUser, config);

    // Corrupt the ciphertext
    const corruptedCiphertext = Buffer.from(encrypted.encryptedToken, 'hex');
    corruptedCiphertext[0] ^= 0xff;

    const corruptedRecord: OdkAppUserRecord = {
      id: 'record-id',
      userId,
      odkAppUserId: odkAppUser.id,
      displayName: odkAppUser.displayName,
      encryptedToken: corruptedCiphertext.toString('hex'),
      tokenIv: encrypted.tokenIv,
      odkProjectId: encrypted.odkProjectId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const persistence = createMockPersistence(corruptedRecord);
    const audit = createMockAudit();
    const logger = createMockLogger();

    const tokenService = createOdkTokenService({
      persistence,
      audit,
      config: { encryptionKey: TEST_ENCRYPTION_KEY },
      logger,
    });

    const result = await tokenService.validateTokenHealth(userId);

    expect(result.valid).toBe(false);
    expect(result.error).toContain('decrypt');
  });
});
