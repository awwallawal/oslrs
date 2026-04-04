/**
 * TokenService Tests
 * Story SEC2-3: JWT secret validation — no fallback defaults
 *
 * Verifies:
 * - Test mode uses deterministic test secrets without env vars
 * - Non-test mode throws AppError when JWT_SECRET is missing
 * - No fallback default strings exist
 */

import { describe, it, expect, vi } from 'vitest';

// Mock Redis — TokenService imports getRedisClient
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: vi.fn(() => ({
    setex: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    exists: vi.fn(),
    set: vi.fn(),
  })),
}));

import { TokenService } from '../token.service.js';
import { UserRole } from '@oslsr/types';
import type { AuthUser } from '@oslsr/types';

const testUser: AuthUser = {
  id: '018e5f2a-1234-7890-abcd-1234567890ab',
  email: 'test@dev.local',
  role: UserRole.SUPER_ADMIN,
  lgaId: null,
  fullName: 'Test User',
};

describe('TokenService', () => {
  describe('JWT secret validation', () => {
    it('generates access token in test mode without JWT_SECRET env var', () => {
      // VITEST=true is set by vitest runner, so test mode is active
      const result = TokenService.generateAccessToken(testUser);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('jti');
      expect(result).toHaveProperty('expiresIn');
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3); // valid JWT format
    });

    it('verifies tokens generated in test mode', () => {
      const { token } = TokenService.generateAccessToken(testUser);

      const payload = TokenService.verifyAccessToken(token);

      expect(payload.sub).toBe(testUser.id);
      expect(payload.role).toBe(testUser.role);
      expect(payload.email).toBe(testUser.email);
    });

    it('throws AppError when JWT_SECRET is missing in non-test mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      const originalJwtSecret = process.env.JWT_SECRET;

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.VITEST;
        delete process.env.JWT_SECRET;

        expect(() => TokenService.generateAccessToken(testUser)).toThrow('JWT_SECRET environment variable is required');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest !== undefined) process.env.VITEST = originalVitest;
        if (originalJwtSecret !== undefined) process.env.JWT_SECRET = originalJwtSecret;
      }
    });

    it('works in non-test mode when JWT_SECRET is provided via env', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      const originalJwtSecret = process.env.JWT_SECRET;

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.VITEST;
        process.env.JWT_SECRET = 'a-real-jwt-secret-that-is-at-least-32-chars-long';

        const result = TokenService.generateAccessToken(testUser);
        expect(result.token.split('.')).toHaveLength(3);
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest !== undefined) process.env.VITEST = originalVitest;
        if (originalJwtSecret !== undefined) {
          process.env.JWT_SECRET = originalJwtSecret;
        } else {
          delete process.env.JWT_SECRET;
        }
      }
    });

    it('getRefreshSecret throws when REFRESH_TOKEN_SECRET is missing in non-test mode', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      const originalVitest = process.env.VITEST;
      const originalRefreshSecret = process.env.REFRESH_TOKEN_SECRET;

      try {
        process.env.NODE_ENV = 'development';
        delete process.env.VITEST;
        delete process.env.REFRESH_TOKEN_SECRET;

        // Access private method via reflection
        const getRefreshSecret = (TokenService as any).getRefreshSecret.bind(TokenService);
        expect(() => getRefreshSecret()).toThrow('REFRESH_TOKEN_SECRET environment variable is required');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest !== undefined) process.env.VITEST = originalVitest;
        if (originalRefreshSecret !== undefined) process.env.REFRESH_TOKEN_SECRET = originalRefreshSecret;
      }
    });
  });
});
