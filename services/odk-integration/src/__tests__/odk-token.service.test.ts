import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken } from '@oslsr/utils';
import { UserRole, ODK_TOKEN_NOT_FOUND, ODK_TOKEN_ACCESS_DENIED, ODK_TOKEN_DECRYPTION_ERROR } from '@oslsr/types';
import {
  createOdkTokenService,
  type TokenAccessContext,
  type OdkTokenPersistence,
  type OdkTokenAudit,
  type OdkTokenConfig,
} from '../odk-token.service.js';

describe('OdkTokenService', () => {
  // Test encryption key (32 bytes = 64 hex chars)
  const testKeyHex = randomBytes(32).toString('hex');
  const testKey = Buffer.from(testKeyHex, 'hex');
  const testToken = 'odk-app-user-token-12345678901234567890';
  const testUserId = '01912345-6789-7abc-def0-123456789abc';
  const otherUserId = '01912345-6789-7abc-def0-999999999999';

  // Encrypt a test token for use in tests
  const encryptedTestToken = encryptToken(testToken, testKey);

  // Mock persistence
  const createMockPersistence = (record: any = null): OdkTokenPersistence => ({
    findByUserId: vi.fn().mockResolvedValue(record),
  });

  // Mock audit
  const createMockAudit = (): OdkTokenAudit => ({
    logTokenAccessed: vi.fn().mockResolvedValue(undefined),
  });

  // Mock config
  const createMockConfig = (encryptionKey?: string): OdkTokenConfig => ({
    encryptionKey: encryptionKey ?? testKeyHex,
  });

  // Create mock logger
  const createMockLogger = () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  });

  // Valid ODK App User record
  const createValidRecord = () => ({
    id: '01912345-0000-7abc-def0-123456789abc',
    userId: testUserId,
    odkAppUserId: 123,
    displayName: 'Test User (enumerator)',
    encryptedToken: encryptedTestToken.ciphertext,
    tokenIv: encryptedTestToken.iv,
    odkProjectId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('getDecryptedToken', () => {
    it('should successfully retrieve token with system context', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: 'system-job-processor',
        purpose: 'system',
      };

      const result = await service.getDecryptedToken(testUserId, context);

      expect(result).toBe(testToken);
      expect(persistence.findByUserId).toHaveBeenCalledWith(testUserId);
      expect(audit.logTokenAccessed).toHaveBeenCalled();
    });

    it('should successfully retrieve token with owner context (enketo_launch)', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: testUserId, // Owner accessing their own token
        purpose: 'enketo_launch',
      };

      const result = await service.getDecryptedToken(testUserId, context);

      expect(result).toBe(testToken);
      expect(audit.logTokenAccessed).toHaveBeenCalled();
    });

    it('should throw authorization error for non-owner enketo_launch access', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: otherUserId, // Different user trying to access
        purpose: 'enketo_launch',
      };

      await expect(service.getDecryptedToken(testUserId, context)).rejects.toMatchObject({
        code: ODK_TOKEN_ACCESS_DENIED,
        statusCode: 403,
      });

      expect(audit.logTokenAccessed).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should reject health_check purpose in getDecryptedToken (AC2: no plaintext returned)', async () => {
      // Per AC2: health_check should NOT return plaintext
      // Use validateTokenHealth() instead for health checks
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      // Even SUPER_ADMIN cannot get plaintext via health_check purpose
      const context: TokenAccessContext = {
        callerId: otherUserId,
        purpose: 'health_check',
        role: UserRole.SUPER_ADMIN,
      };

      await expect(service.getDecryptedToken(testUserId, context)).rejects.toMatchObject({
        code: ODK_TOKEN_ACCESS_DENIED,
        statusCode: 403,
      });

      // No audit log since authorization failed
      expect(audit.logTokenAccessed).not.toHaveBeenCalled();
    });

    it('should reject health_check purpose regardless of role', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: otherUserId,
        purpose: 'health_check',
        role: UserRole.ENUMERATOR,
      };

      await expect(service.getDecryptedToken(testUserId, context)).rejects.toMatchObject({
        code: ODK_TOKEN_ACCESS_DENIED,
        statusCode: 403,
      });
    });

    it('should throw TOKEN_NOT_FOUND when user has no ODK App User', async () => {
      const persistence = createMockPersistence(null); // No record found
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: 'system',
        purpose: 'system',
      };

      await expect(service.getDecryptedToken(testUserId, context)).rejects.toMatchObject({
        code: ODK_TOKEN_NOT_FOUND,
        statusCode: 404,
      });

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw TOKEN_DECRYPTION_ERROR when ciphertext is tampered', async () => {
      // Create a record with tampered ciphertext
      const record = createValidRecord();
      // Tamper with byte 0 of ciphertext (not auth tag)
      const ciphertextBuffer = Buffer.from(record.encryptedToken, 'hex');
      ciphertextBuffer[0] ^= 0xff; // Flip bits
      record.encryptedToken = ciphertextBuffer.toString('hex');

      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: 'system',
        purpose: 'system',
      };

      await expect(service.getDecryptedToken(testUserId, context)).rejects.toMatchObject({
        code: ODK_TOKEN_DECRYPTION_ERROR,
        statusCode: 500,
      });

      expect(logger.error).toHaveBeenCalled();
    });

    it('should create audit log on successful retrieval', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const context: TokenAccessContext = {
        callerId: testUserId,
        purpose: 'enketo_launch',
      };

      await service.getDecryptedToken(testUserId, context);

      expect(audit.logTokenAccessed).toHaveBeenCalledWith(
        testUserId,
        testUserId,
        'enketo_launch'
      );
    });

  });

  describe('validateTokenHealth', () => {
    it('should return valid:true for decryptable token', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId);

      expect(result).toEqual({ valid: true });
      expect(audit.logTokenAccessed).not.toHaveBeenCalled(); // No audit for health check
    });

    it('should return valid:false with error for missing user', async () => {
      const persistence = createMockPersistence(null);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return valid:false with error for corrupted token', async () => {
      const record = createValidRecord();
      // Corrupt the ciphertext
      const ciphertextBuffer = Buffer.from(record.encryptedToken, 'hex');
      ciphertextBuffer[0] ^= 0xff;
      record.encryptedToken = ciphertextBuffer.toString('hex');

      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('decrypt');
    });

    it('should NOT expose plaintext token in health check', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId);

      // Result should only have valid/error, never the actual token
      expect(result).not.toHaveProperty('token');
      expect(JSON.stringify(result)).not.toContain(testToken);
    });

    it('should allow health check with SUPER_ADMIN context (AC6)', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId, {
        callerId: otherUserId,
        role: UserRole.SUPER_ADMIN,
      });

      expect(result).toEqual({ valid: true });
      expect(audit.logTokenAccessed).not.toHaveBeenCalled(); // No audit for health check
    });

    it('should reject health check with non-SUPER_ADMIN context', async () => {
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      const result = await service.validateTokenHealth(testUserId, {
        callerId: otherUserId,
        role: UserRole.ENUMERATOR,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('SUPER_ADMIN');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should allow health check without context (internal/system calls)', async () => {
      // When no context is provided, assume internal system call (backward compatible)
      const record = createValidRecord();
      const persistence = createMockPersistence(record);
      const audit = createMockAudit();
      const config = createMockConfig();
      const logger = createMockLogger();

      const service = createOdkTokenService({ persistence, audit, config, logger });

      // No context = internal system call, allowed
      const result = await service.validateTokenHealth(testUserId);

      expect(result).toEqual({ valid: true });
    });
  });
});
