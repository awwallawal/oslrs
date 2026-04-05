/**
 * TokenService Tests
 * Story SEC2-3: JWT secret validation — no fallback defaults
 * Story SEC2-4: Token revocation on role change
 *
 * Verifies:
 * - Test mode uses deterministic test secrets without env vars
 * - Non-test mode throws AppError when JWT_SECRET is missing
 * - No fallback default strings exist
 * - revokeAllUserTokens deletes refresh tokens and sets revocation timestamp
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoisted mock for Redis so we can configure per-test
const mockRedis = vi.hoisted(() => ({
  setex: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
  exists: vi.fn(),
  set: vi.fn(),
}));

// Mock Redis — TokenService imports getRedisClient
vi.mock('../../lib/redis.js', () => ({
  getRedisClient: vi.fn(() => mockRedis),
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  describe('revokeAllUserTokens', () => {
    it('sets revocation timestamp and deletes refresh token for user', async () => {
      mockRedis.get.mockResolvedValue('some-refresh-token-id');
      mockRedis.del.mockResolvedValue(1);

      const result = await TokenService.revokeAllUserTokens('user-123');

      // Should set revocation timestamp
      expect(mockRedis.set).toHaveBeenCalledWith(
        'user:user-123:tokens_revoked_at',
        expect.any(String)
      );

      // Should look up user's refresh token via reverse index
      expect(mockRedis.get).toHaveBeenCalledWith('user_refresh_token:user-123');

      // Should delete both the refresh token and the reverse index
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:some-refresh-token-id');
      expect(mockRedis.del).toHaveBeenCalledWith('user_refresh_token:user-123');

      expect(result).toBe(1);
    });

    it('returns 0 when user has no active refresh token', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await TokenService.revokeAllUserTokens('user-456');

      // Should still set revocation timestamp
      expect(mockRedis.set).toHaveBeenCalledWith(
        'user:user-456:tokens_revoked_at',
        expect.any(String)
      );

      // Should not delete anything (no refresh token found)
      expect(mockRedis.del).not.toHaveBeenCalled();

      expect(result).toBe(0);
    });

    it('stores valid revocation timestamp as recent Date.now() value', async () => {
      mockRedis.get.mockResolvedValue('token-abc');
      mockRedis.del.mockResolvedValue(1);

      await TokenService.revokeAllUserTokens('user-audit');

      const timestampArg = mockRedis.set.mock.calls[0][1];
      const timestamp = parseInt(timestampArg, 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(Date.now() - timestamp).toBeLessThan(5000); // within 5 seconds
    });

    it('revoked refresh token fails validation (returns null)', async () => {
      // Step 1: Revoke — the token gets deleted from Redis
      mockRedis.get.mockResolvedValueOnce('target-refresh-token'); // reverse index lookup
      mockRedis.del.mockResolvedValue(1);
      await TokenService.revokeAllUserTokens('user-revoke');

      // Step 2: Validate — the deleted token no longer exists
      mockRedis.get.mockResolvedValueOnce(null); // refresh token key gone
      const result = await TokenService.validateRefreshToken('target-refresh-token');
      expect(result).toBeNull();
    });
  });

  describe('generateRefreshToken maintains reverse index', () => {
    it('stores user-to-token reverse index alongside the refresh token', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const refreshToken = await TokenService.generateRefreshToken('user-789', 'session-abc');

      expect(refreshToken).toBeDefined();

      // Should store the refresh token data
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${refreshToken}`,
        expect.any(Number),
        expect.stringContaining('user-789')
      );

      // Should store the reverse index: user_refresh_token:{userId} → refreshToken
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_refresh_token:user-789',
        expect.any(Number),
        refreshToken
      );
    });

    it('second login overwrites reverse index — only latest token tracked', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const token1 = await TokenService.generateRefreshToken('user-multi', 'session-1');
      const token2 = await TokenService.generateRefreshToken('user-multi', 'session-2');

      expect(token1).not.toBe(token2);

      // Both tokens stored individually
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${token1}`, expect.any(Number), expect.any(String)
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${token2}`, expect.any(Number), expect.any(String)
      );

      // Reverse index was written twice — second call overwrites first
      const reverseIndexCalls = mockRedis.setex.mock.calls.filter(
        (call: unknown[]) => call[0] === 'user_refresh_token:user-multi'
      );
      expect(reverseIndexCalls).toHaveLength(2);
      expect(reverseIndexCalls[1][2]).toBe(token2); // latest token wins
    });
  });

  describe('invalidateRefreshToken cleans up reverse index', () => {
    it('deletes reverse index when it points to the invalidated token', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-logout', sessionId: 's1', rememberMe: false, createdAt: new Date().toISOString() })) // token data
        .mockResolvedValueOnce('the-refresh-token'); // reverse index lookup
      mockRedis.del.mockResolvedValue(1);

      await TokenService.invalidateRefreshToken('the-refresh-token');

      // Should delete the refresh token key
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:the-refresh-token');
      // Should delete the reverse index
      expect(mockRedis.del).toHaveBeenCalledWith('user_refresh_token:user-logout');
    });

    it('preserves reverse index when it points to a different token', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-multi', sessionId: 's1', rememberMe: false, createdAt: new Date().toISOString() })) // token data
        .mockResolvedValueOnce('newer-token'); // reverse index points to different token
      mockRedis.del.mockResolvedValue(1);

      await TokenService.invalidateRefreshToken('old-token');

      // Should delete the refresh token key
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:old-token');
      // Should NOT delete the reverse index (it belongs to the newer token)
      expect(mockRedis.del).not.toHaveBeenCalledWith('user_refresh_token:user-multi');
    });
  });
});
