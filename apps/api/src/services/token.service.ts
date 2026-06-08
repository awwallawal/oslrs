import jwt from 'jsonwebtoken';
import { getRedisClient } from '../lib/redis.js';
import { uuidv7 } from 'uuidv7';
import { AppError } from '@oslsr/utils';
import type { JwtPayload, AuthUser } from '@oslsr/types';

// Token expiry constants (in seconds)
const ACCESS_TOKEN_EXPIRY = 15 * 60;           // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

// Session expiry constants
const SESSION_INACTIVITY_EXPIRY = 8 * 60 * 60;       // 8 hours
const ABSOLUTE_SESSION_EXPIRY = 24 * 60 * 60;        // 24 hours (default)
const REMEMBER_ME_SESSION_EXPIRY = 30 * 24 * 60 * 60; // 30 days

// Redis key patterns
const BLACKLIST_KEY_PREFIX = 'jwt:blacklist:';
const REFRESH_TOKEN_KEY_PREFIX = 'refresh:';
const USER_REFRESH_KEY_PREFIX = 'user_refresh_token:';
// F-022 (Story 9-42): tombstone for a rotated (consumed) refresh token. Presenting
// a tombstoned token at /refresh is a replay → the whole token family is revoked.
const CONSUMED_REFRESH_KEY_PREFIX = 'refresh_consumed:';

export class TokenService {
  private static isTestMode(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  }

  private static getJwtSecret(): string {
    if (this.isTestMode()) {
      return process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
    }
    if (!process.env.JWT_SECRET) {
      throw new AppError('MISSING_JWT_SECRET', 'JWT_SECRET environment variable is required', 500);
    }
    return process.env.JWT_SECRET;
  }

  /**
   * Returns the refresh token signing secret.
   * Currently unused — refresh tokens use opaque UUIDs stored in Redis.
   * Retained as defense-in-depth for future JWT-signed refresh tokens.
   */
  private static getRefreshSecret(): string {
    if (this.isTestMode()) {
      return process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-minimum-32-chars-long';
    }
    if (!process.env.REFRESH_TOKEN_SECRET) {
      throw new AppError('MISSING_REFRESH_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET environment variable is required', 500);
    }
    return process.env.REFRESH_TOKEN_SECRET;
  }

  /**
   * Generates an access token (JWT) for a user
   */
  static generateAccessToken(user: AuthUser, rememberMe = false): { token: string; jti: string; expiresIn: number } {
    const jti = uuidv7();

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      jti,
      role: user.role,
      lgaId: user.lgaId,
      email: user.email,
      rememberMe,
    };

    const token = jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    return {
      token,
      jti,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  /**
   * Generates a refresh token and stores it in Redis
   */
  static async generateRefreshToken(userId: string, sessionId: string, rememberMe = false): Promise<string> {
    const redis = getRedisClient();
    const refreshToken = uuidv7();

    // Calculate expiry based on Remember Me
    const expirySeconds = rememberMe ? REMEMBER_ME_SESSION_EXPIRY : REFRESH_TOKEN_EXPIRY;

    // Store refresh token in Redis with metadata
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`;
    await redis.setex(key, expirySeconds, JSON.stringify({
      userId,
      sessionId,
      rememberMe,
      createdAt: new Date().toISOString(),
    }));

    // Maintain reverse index for efficient user-level revocation
    await redis.setex(`${USER_REFRESH_KEY_PREFIX}${userId}`, expirySeconds, refreshToken);

    return refreshToken;
  }

  /**
   * Validates a refresh token and returns associated data
   */
  static async validateRefreshToken(refreshToken: string): Promise<{
    userId: string;
    sessionId: string;
    rememberMe: boolean;
    createdAt: string;
  } | null> {
    const redis = getRedisClient();
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`;

    const data = await redis.get(key);
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Invalidates a refresh token (e.g., on logout) and cleans up reverse index
   */
  static async invalidateRefreshToken(refreshToken: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`;

    // Read token data to get userId for reverse index cleanup
    const data = await redis.get(key);
    await redis.del(key);

    if (data) {
      const { userId } = JSON.parse(data);
      // Clean up reverse index if it still points to this token
      const currentToken = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      if (currentToken === refreshToken) {
        await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      }
    }
  }

  /**
   * F-012 (Story 9-42): positively invalidate a user's active refresh token at
   * logout, via the reverse index. Unlike `revokeAllUserTokens`, this does NOT
   * stamp a global `tokens_revoked_at` timestamp — logout already blacklists the
   * access-token JTI, and skipping the timestamp avoids a sub-second
   * logout→re-login race where a freshly issued access token could be wrongly
   * treated as revoked. Returns the number of refresh tokens deleted (0 or 1).
   */
  static async invalidateUserRefreshTokens(userId: string): Promise<number> {
    const redis = getRedisClient();
    const refreshToken = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
    if (refreshToken) {
      await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`);
      await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      return 1;
    }
    return 0;
  }

  /**
   * F-022 (Story 9-42): rotate a refresh token on use (one-time-use semantics).
   * Tombstones the presented token (so a later replay is caught as reuse), deletes
   * its active entry, and mints a brand-new refresh token (which also overwrites
   * the per-user reverse index). The tombstone TTL matches the token's own
   * lifetime so the full replay window is covered.
   *
   * Concurrency note (multi-tab) — read honestly: if two /refresh calls read the
   * SAME active token BEFORE either rotates, both mint a new token and the last
   * Set-Cookie wins — no tombstone is presented, so reuse detection does NOT fire.
   * BUT there is a narrow RESIDUAL race: if tab B's validateRefreshToken runs
   * AFTER tab A has already rotated (active entry deleted + tombstone set), tab B
   * presents the now-consumed token and DOES trip reuse detection → the whole
   * family is revoked → both tabs are forced to re-log-in. This is ACCEPTED: the
   * window is sub-second, the consequence is a benign forced re-login (not account
   * compromise), and erring toward revoke is the safe default against a genuine
   * stolen-token replay. If multi-tab re-logins become a support burden, the
   * documented enhancement is a short grace window that RE-ISSUES the already-minted
   * token instead of revoking — see Story 9-42 Review Follow-ups M1.
   */
  static async rotateRefreshToken(
    oldToken: string,
    userId: string,
    sessionId: string,
    rememberMe = false,
  ): Promise<string> {
    const redis = getRedisClient();
    const ttlSeconds = rememberMe ? REMEMBER_ME_SESSION_EXPIRY : REFRESH_TOKEN_EXPIRY;

    // Tombstone the consumed token for the full replay window, then retire it.
    await redis.setex(`${CONSUMED_REFRESH_KEY_PREFIX}${oldToken}`, ttlSeconds, userId);
    await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${oldToken}`);

    // Mint the replacement (updates the reverse index to the new token).
    return this.generateRefreshToken(userId, sessionId, rememberMe);
  }

  /**
   * F-022: returns the userId associated with a consumed (tombstoned) refresh
   * token, or null if the token was never rotated. A non-null result at /refresh
   * means a replay → revoke the whole family.
   */
  static async getConsumedRefreshTokenUser(token: string): Promise<string | null> {
    const redis = getRedisClient();
    return redis.get(`${CONSUMED_REFRESH_KEY_PREFIX}${token}`);
  }

  /**
   * F-022: clears a consumed-token tombstone (called after reuse detection has
   * revoked the family, so the same replay can't repeatedly trigger revocation).
   */
  static async clearConsumedRefreshToken(token: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${CONSUMED_REFRESH_KEY_PREFIX}${token}`);
  }

  /**
   * Verifies an access token and returns the payload
   */
  static verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret()) as JwtPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session has expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
      }
      throw error;
    }
  }

  /**
   * Adds a token's JTI to the blacklist (for logout/revocation)
   */
  static async addToBlacklist(jti: string, expiresIn?: number): Promise<void> {
    const redis = getRedisClient();
    const key = `${BLACKLIST_KEY_PREFIX}${jti}`;

    // Set TTL to token's remaining lifetime or default 24 hours
    const ttl = expiresIn || ABSOLUTE_SESSION_EXPIRY;
    await redis.setex(key, ttl, 'revoked');
  }

  /**
   * Checks if a token's JTI is blacklisted
   */
  static async isBlacklisted(jti: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${BLACKLIST_KEY_PREFIX}${jti}`;
    const result = await redis.exists(key);
    return result === 1;
  }

  /**
   * Invalidates all tokens for a user (e.g., after password change)
   * This works by tracking a "revoke before" timestamp
   */
  static async invalidateAllUserTokens(userId: string): Promise<void> {
    const redis = getRedisClient();
    // Store timestamp - any token issued before this is invalid
    await redis.set(`user:${userId}:tokens_revoked_at`, Date.now().toString());
  }

  /**
   * Revokes all tokens for a user: sets revocation timestamp AND deletes refresh tokens.
   * Used on role change to force re-authentication with updated permissions.
   * Returns the number of refresh tokens deleted.
   */
  static async revokeAllUserTokens(userId: string): Promise<number> {
    const redis = getRedisClient();

    // 1. Set revocation timestamp to invalidate existing access tokens
    await redis.set(`user:${userId}:tokens_revoked_at`, Date.now().toString());

    // 2. Delete user's refresh token via reverse index
    const refreshToken = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
    if (refreshToken) {
      await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`);
      await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      return 1;
    }

    return 0;
  }

  /**
   * Checks if a token was issued before user's tokens were revoked
   */
  static async isTokenRevokedByTimestamp(userId: string, issuedAt: number): Promise<boolean> {
    const redis = getRedisClient();
    const revokedAt = await redis.get(`user:${userId}:tokens_revoked_at`);

    if (!revokedAt) {
      return false;
    }

    // Token is revoked if it was issued before the revocation timestamp
    return issuedAt * 1000 < parseInt(revokedAt, 10);
  }

  /**
   * Gets token expiry constants for external use
   */
  static getExpiryConstants() {
    return {
      ACCESS_TOKEN_EXPIRY,
      REFRESH_TOKEN_EXPIRY,
      SESSION_INACTIVITY_EXPIRY,
      ABSOLUTE_SESSION_EXPIRY,
      REMEMBER_ME_SESSION_EXPIRY,
    };
  }
}
