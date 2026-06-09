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
import { createHash } from 'node:crypto';

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

// OPS-3 (Story 9-48): refresh tokens are stored hashed at rest — same sha256 hex
// the service uses. Mirrors the hash a Redis-backup leak would expose.
const h = (token: string): string => createHash('sha256').update(token).digest('hex');

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

      // OPS-3: active entry is keyed by the HASH, not the plaintext token.
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${h(refreshToken)}`,
        expect.any(Number),
        expect.stringContaining('user-789')
      );

      // OPS-3: reverse index VALUE is the hash, not the plaintext token.
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_refresh_token:user-789',
        expect.any(Number),
        h(refreshToken)
      );
    });

    it('second login overwrites reverse index — only latest token tracked', async () => {
      mockRedis.setex.mockResolvedValue('OK');

      const token1 = await TokenService.generateRefreshToken('user-multi', 'session-1');
      const token2 = await TokenService.generateRefreshToken('user-multi', 'session-2');

      expect(token1).not.toBe(token2);

      // OPS-3: both tokens stored individually, keyed by their hash.
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${h(token1)}`, expect.any(Number), expect.any(String)
      );
      expect(mockRedis.setex).toHaveBeenCalledWith(
        `refresh:${h(token2)}`, expect.any(Number), expect.any(String)
      );

      // Reverse index was written twice — second call overwrites first (hash value).
      const reverseIndexCalls = mockRedis.setex.mock.calls.filter(
        (call: unknown[]) => call[0] === 'user_refresh_token:user-multi'
      );
      expect(reverseIndexCalls).toHaveLength(2);
      expect(reverseIndexCalls[1][2]).toBe(h(token2)); // latest token's hash wins
    });
  });

  // F-012 (Story 9-42) — positive logout invalidation of the refresh token.
  describe('invalidateUserRefreshTokens', () => {
    it('deletes the active refresh token + reverse index, returns 1', async () => {
      mockRedis.get.mockResolvedValueOnce('logout-refresh-token'); // reverse index
      mockRedis.del.mockResolvedValue(1);

      const result = await TokenService.invalidateUserRefreshTokens('user-logout');

      expect(mockRedis.get).toHaveBeenCalledWith('user_refresh_token:user-logout');
      expect(mockRedis.del).toHaveBeenCalledWith('refresh:logout-refresh-token');
      expect(mockRedis.del).toHaveBeenCalledWith('user_refresh_token:user-logout');
      expect(result).toBe(1);
    });

    it('does NOT stamp a global tokens_revoked_at timestamp (avoids re-login race)', async () => {
      mockRedis.get.mockResolvedValueOnce('logout-refresh-token');
      mockRedis.del.mockResolvedValue(1);

      await TokenService.invalidateUserRefreshTokens('user-logout');

      // Unlike revokeAllUserTokens, no `set` of the revocation timestamp.
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('returns 0 when the user has no active refresh token', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await TokenService.invalidateUserRefreshTokens('user-none');

      expect(mockRedis.del).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('post-invalidation, the prior refresh token fails validation (returns null)', async () => {
      // Invalidate — the active token is deleted.
      mockRedis.get.mockResolvedValueOnce('prior-token'); // reverse index lookup
      mockRedis.del.mockResolvedValue(1);
      await TokenService.invalidateUserRefreshTokens('user-x');

      // Validate — the deleted token no longer resolves.
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await TokenService.validateRefreshToken('prior-token');
      expect(result).toBeNull();
    });
  });

  // F-022 (Story 9-42) — refresh-token rotation + reuse detection.
  describe('rotateRefreshToken', () => {
    it('tombstones the consumed token, retires it, and mints a new token', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      const newToken = await TokenService.rotateRefreshToken('old-token', 'user-rot', 'sess-1', false);

      // OPS-3: tombstone keyed by HASH; M1: VALUE is JSON carrying the re-mint data.
      const tombstoneCall = mockRedis.setex.mock.calls.find(
        (call: unknown[]) => call[0] === `refresh_consumed:${h('old-token')}`,
      );
      expect(tombstoneCall).toBeDefined();
      expect(tombstoneCall![1]).toBe(7 * 24 * 60 * 60); // REFRESH_TOKEN_EXPIRY
      const tombstone = JSON.parse(tombstoneCall![2] as string);
      expect(tombstone).toMatchObject({ userId: 'user-rot', sessionId: 'sess-1', rememberMe: false });
      expect(typeof tombstone.rotatedAt).toBe('number');
      // The plaintext token never appears in the tombstone value.
      expect(tombstoneCall![2]).not.toContain('old-token');

      // Retire the old active token (hashed key).
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:${h('old-token')}`);
      // New token is distinct + the reverse index was updated to its hash.
      expect(newToken).not.toBe('old-token');
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'user_refresh_token:user-rot',
        expect.any(Number),
        h(newToken),
      );
    });

    it('uses the 30-day tombstone TTL for remember-me sessions', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);

      await TokenService.rotateRefreshToken('old-token', 'user-rm', 'sess-1', true);

      const tombstoneCall = mockRedis.setex.mock.calls.find(
        (call: unknown[]) => call[0] === `refresh_consumed:${h('old-token')}`,
      );
      expect(tombstoneCall).toBeDefined();
      expect(tombstoneCall![1]).toBe(30 * 24 * 60 * 60); // REMEMBER_ME_SESSION_EXPIRY
      expect(JSON.parse(tombstoneCall![2] as string)).toMatchObject({ userId: 'user-rm', rememberMe: true });
    });
  });

  describe('consumed-token tombstone accessors', () => {
    it('getConsumedRefreshToken returns the parsed tombstone (lookup hashes input)', async () => {
      const tombstone = { userId: 'user-replay', sessionId: 'sess-r', rememberMe: false, rotatedAt: Date.now() };
      mockRedis.get.mockResolvedValueOnce(JSON.stringify(tombstone));
      const result = await TokenService.getConsumedRefreshToken('replayed-token');
      // OPS-3: lookup keyed by the HASH of the incoming plaintext.
      expect(mockRedis.get).toHaveBeenCalledWith(`refresh_consumed:${h('replayed-token')}`);
      expect(result).toEqual(tombstone);
    });

    it('getConsumedRefreshToken returns null for a never-rotated token', async () => {
      mockRedis.get.mockResolvedValueOnce(null);
      const result = await TokenService.getConsumedRefreshToken('fresh-token');
      expect(result).toBeNull();
    });

    it('clearConsumedRefreshToken deletes the tombstone by hashed key', async () => {
      mockRedis.del.mockResolvedValue(1);
      await TokenService.clearConsumedRefreshToken('replayed-token');
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh_consumed:${h('replayed-token')}`);
    });
  });

  // M1 (Story 9-48) — rotation grace window decision helper.
  describe('isWithinRotationGrace', () => {
    it('returns true for a token rotated within the grace window', () => {
      expect(TokenService.isWithinRotationGrace(Date.now() - 1000)).toBe(true);
    });

    it('returns false for a token rotated well outside the grace window', () => {
      expect(TokenService.isWithinRotationGrace(Date.now() - 60_000)).toBe(false);
    });
  });

  describe('invalidateRefreshToken cleans up reverse index', () => {
    it('deletes reverse index when it points to the invalidated token', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-logout', sessionId: 's1', rememberMe: false, createdAt: new Date().toISOString() })) // token data
        .mockResolvedValueOnce(h('the-refresh-token')); // OPS-3: reverse index VALUE is the hash
      mockRedis.del.mockResolvedValue(1);

      await TokenService.invalidateRefreshToken('the-refresh-token');

      // Should delete the refresh token key (hashed)
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:${h('the-refresh-token')}`);
      // Should delete the reverse index (guard matches the hash)
      expect(mockRedis.del).toHaveBeenCalledWith('user_refresh_token:user-logout');
    });

    it('preserves reverse index when it points to a different token', async () => {
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({ userId: 'user-multi', sessionId: 's1', rememberMe: false, createdAt: new Date().toISOString() })) // token data
        .mockResolvedValueOnce(h('newer-token')); // reverse index points to a different token's hash
      mockRedis.del.mockResolvedValue(1);

      await TokenService.invalidateRefreshToken('old-token');

      // Should delete the refresh token key (hashed)
      expect(mockRedis.del).toHaveBeenCalledWith(`refresh:${h('old-token')}`);
      // Should NOT delete the reverse index (it belongs to the newer token)
      expect(mockRedis.del).not.toHaveBeenCalledWith('user_refresh_token:user-multi');
    });
  });
});

/**
 * OPS-3 (Story 9-48) — refresh tokens hashed at rest, end-to-end.
 *
 * Uses a Map-backed Redis so the hash-at-store → hash-at-lookup round-trip is
 * actually exercised (not just call-shape assertions). Proves the plaintext token
 * is never persisted and that the at-rest hash, if leaked, is not a usable bearer
 * secret (mirrors the F-011/OPS-2 "hash-as-input is useless" guarantee).
 */
describe('TokenService — OPS-3 refresh tokens hashed at rest', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    vi.clearAllMocks();
    store.clear();
    mockRedis.setex.mockImplementation((key: string, _ttl: number, val: string) => {
      store.set(key, val);
      return Promise.resolve('OK');
    });
    mockRedis.get.mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null));
    mockRedis.del.mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    });
  });

  it('AC#1 — persists only sha256(token) across active entry, reverse index, and tombstone', async () => {
    const token = await TokenService.generateRefreshToken('user-h', 'sess-h', false);

    // Active entry is keyed by the hash; the plaintext appears in NO key.
    expect(store.has(`refresh:${h(token)}`)).toBe(true);
    expect([...store.keys()].some((k) => k.includes(token))).toBe(false);
    // Reverse-index VALUE is the hash, not the plaintext.
    expect(store.get('user_refresh_token:user-h')).toBe(h(token));

    // Rotate → tombstone keyed by the hash; the plaintext appears in no value either.
    const newToken = await TokenService.rotateRefreshToken(token, 'user-h', 'sess-h', false);
    expect(store.has(`refresh_consumed:${h(token)}`)).toBe(true);
    expect([...store.values()].some((v) => v.includes(token))).toBe(false);
    // Old active entry retired; replacement lives under its OWN hash.
    expect(store.has(`refresh:${h(token)}`)).toBe(false);
    expect(store.has(`refresh:${h(newToken)}`)).toBe(true);
  });

  it('AC#1 — login → refresh → refresh (rotation chain) works with the plaintext cookie token', async () => {
    const token = await TokenService.generateRefreshToken('user-c', 'sess-c', false);
    expect((await TokenService.validateRefreshToken(token))?.userId).toBe('user-c');

    const token2 = await TokenService.rotateRefreshToken(token, 'user-c', 'sess-c', false);
    // The just-rotated token no longer resolves; the replacement does.
    expect(await TokenService.validateRefreshToken(token)).toBeNull();
    expect((await TokenService.validateRefreshToken(token2))?.userId).toBe('user-c');

    const token3 = await TokenService.rotateRefreshToken(token2, 'user-c', 'sess-c', false);
    expect((await TokenService.validateRefreshToken(token3))?.userId).toBe('user-c');
  });

  it('AC#2 — submitting the stored hash AS the token does not resolve (lookup re-hashes input)', async () => {
    const token = await TokenService.generateRefreshToken('user-z', 'sess-z', false);
    const leakedHash = h(token); // what a Redis-backup leak would expose

    // Replaying the at-rest hash hashes to sha256(hash) ≠ stored key → miss.
    expect(await TokenService.validateRefreshToken(leakedHash)).toBeNull();

    // And it must not resolve as a consumed tombstone after a rotation either.
    await TokenService.rotateRefreshToken(token, 'user-z', 'sess-z', false);
    expect(await TokenService.getConsumedRefreshToken(leakedHash)).toBeNull();
    // The genuine plaintext, however, IS recognised as consumed.
    expect(await TokenService.getConsumedRefreshToken(token)).toMatchObject({ userId: 'user-z' });
  });

  // M2 (Story 9-48 review) — at-most-one active refresh token per user. A second
  // mint (multi-tab grace re-issue, or a fresh login) must REAP the prior active
  // entry rather than orphan it, so the single-valued reverse index stays an accurate
  // record and a later logout/revoke is exhaustive (no orphan live until TTL).
  it('M2 — minting reaps the prior active entry; no orphan survives logout', async () => {
    const tokenA = await TokenService.generateRefreshToken('user-orphan', 'sess-1', false);
    expect(store.has(`refresh:${h(tokenA)}`)).toBe(true);

    // Second mint for the same user → tokenA's active entry is reaped, not orphaned.
    const tokenB = await TokenService.generateRefreshToken('user-orphan', 'sess-1', false);
    expect(store.has(`refresh:${h(tokenB)}`)).toBe(true);
    expect(store.has(`refresh:${h(tokenA)}`)).toBe(false);

    // Exactly ONE active refresh entry exists for the user (the latest).
    expect([...store.keys()].filter((k) => k.startsWith('refresh:'))).toEqual([
      `refresh:${h(tokenB)}`,
    ]);

    // Logout (F-012, by userId via the reverse index) now clears it completely —
    // pre-fix, tokenA would have lingered as a usable orphan until its TTL.
    await TokenService.invalidateUserRefreshTokens('user-orphan');
    expect([...store.keys()].filter((k) => k.startsWith('refresh:'))).toHaveLength(0);
    expect(store.has('user_refresh_token:user-orphan')).toBe(false);
  });
});
