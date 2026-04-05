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
