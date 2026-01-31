/**
 * ODK Config Tests (Story 2-4, AC7)
 *
 * Tests for requireTokenEncryptionKey() and config validation functions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateOdkTokenConfig,
  isOdkFullyConfigured,
  requireTokenEncryptionKey,
} from '../odk-config.js';

describe('ODK Config Validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  describe('requireTokenEncryptionKey', () => {
    it('should throw ODK_CONFIG_ERROR when key is missing', () => {
      delete process.env.ODK_TOKEN_ENCRYPTION_KEY;

      expect(() => requireTokenEncryptionKey()).toThrow();
      try {
        requireTokenEncryptionKey();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number };
        expect(appError.code).toBe('ODK_CONFIG_ERROR');
        expect(appError.statusCode).toBe(503);
      }
    });

    it('should throw ODK_CONFIG_ERROR when key is empty string', () => {
      process.env.ODK_TOKEN_ENCRYPTION_KEY = '';

      expect(() => requireTokenEncryptionKey()).toThrow();
      try {
        requireTokenEncryptionKey();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number };
        expect(appError.code).toBe('ODK_CONFIG_ERROR');
        expect(appError.statusCode).toBe(503);
      }
    });

    it('should throw ODK_CONFIG_ERROR when key is too short', () => {
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'abc123'; // 6 chars, needs 64

      expect(() => requireTokenEncryptionKey()).toThrow();
      try {
        requireTokenEncryptionKey();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number };
        expect(appError.code).toBe('ODK_CONFIG_ERROR');
        expect(appError.statusCode).toBe(503);
      }
    });

    it('should throw ODK_CONFIG_ERROR when key is too long', () => {
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'a'.repeat(128); // 128 chars, needs 64

      expect(() => requireTokenEncryptionKey()).toThrow();
      try {
        requireTokenEncryptionKey();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number };
        expect(appError.code).toBe('ODK_CONFIG_ERROR');
        expect(appError.statusCode).toBe(503);
      }
    });

    it('should throw ODK_CONFIG_ERROR when key contains invalid hex chars', () => {
      // 64 chars but contains invalid hex characters (xyz)
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'xyz'.repeat(21) + 'a';

      expect(() => requireTokenEncryptionKey()).toThrow();
      try {
        requireTokenEncryptionKey();
      } catch (error: unknown) {
        const appError = error as { code: string; statusCode: number };
        expect(appError.code).toBe('ODK_CONFIG_ERROR');
        expect(appError.statusCode).toBe(503);
      }
    });

    it('should return valid key string when properly configured', () => {
      const validKey = 'a'.repeat(64); // Valid 64-char hex string
      process.env.ODK_TOKEN_ENCRYPTION_KEY = validKey;

      const result = requireTokenEncryptionKey();

      expect(result).toBe(validKey);
    });

    it('should accept mixed case hex characters', () => {
      const mixedCaseKey = 'aAbBcCdDeEfF'.repeat(5) + 'aabb'; // 64 chars, mixed case hex
      process.env.ODK_TOKEN_ENCRYPTION_KEY = mixedCaseKey;

      const result = requireTokenEncryptionKey();

      expect(result).toBe(mixedCaseKey);
    });
  });

  describe('validateOdkTokenConfig', () => {
    it('should return valid:false when ODK_CENTRAL_URL is missing', () => {
      delete process.env.ODK_CENTRAL_URL;
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

      const result = validateOdkTokenConfig();

      expect(result.valid).toBe(false);
      expect(result.features.basicOperations).toBe(false);
    });

    it('should return valid:true with all config present', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret';
      process.env.ODK_PROJECT_ID = '1';
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

      const result = validateOdkTokenConfig();

      expect(result.valid).toBe(true);
      expect(result.features.basicOperations).toBe(true);
      expect(result.features.tokenManagement).toBe(true);
    });

    it('should return tokenManagement:false when encryption key missing', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret';
      process.env.ODK_PROJECT_ID = '1';
      delete process.env.ODK_TOKEN_ENCRYPTION_KEY;

      const result = validateOdkTokenConfig();

      expect(result.features.basicOperations).toBe(true);
      expect(result.features.tokenManagement).toBe(false);
      expect(result.errors.some(e => e.includes('ENCRYPTION_KEY'))).toBe(true);
    });

    it('should fail validation when encryption key present but invalid', () => {
      // When encryption key is present, schema validates it - invalid key fails entire validation
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret';
      process.env.ODK_PROJECT_ID = '1';
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'too-short';

      const result = validateOdkTokenConfig();

      // Both features disabled because schema validation fails on invalid key
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('isOdkFullyConfigured', () => {
    it('should return false when encryption key missing', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret';
      process.env.ODK_PROJECT_ID = '1';
      delete process.env.ODK_TOKEN_ENCRYPTION_KEY;

      const result = isOdkFullyConfigured();

      expect(result).toBe(false);
    });

    it('should return true when all config valid', () => {
      process.env.ODK_CENTRAL_URL = 'https://odk.example.com';
      process.env.ODK_ADMIN_EMAIL = 'admin@example.com';
      process.env.ODK_ADMIN_PASSWORD = 'secret';
      process.env.ODK_PROJECT_ID = '1';
      process.env.ODK_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

      const result = isOdkFullyConfigured();

      expect(result).toBe(true);
    });
  });
});
