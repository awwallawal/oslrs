import jwt from 'jsonwebtoken';
import { Redis } from 'ioredis';
import { uuidv7 } from 'uuidv7';
import { AppError } from '@oslsr/utils';
import type { JwtPayload, AuthUser } from '@oslsr/types';
import { UserRole } from '@oslsr/types';

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

// Redis client (singleton)
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const getRedisClient = () => redisClient;

export class TokenService {
  private static jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';
  private static refreshSecret = process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production';

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

    const token = jwt.sign(payload, this.jwtSecret, {
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

    return refreshToken;
  }

  /**
   * Validates a refresh token and returns associated data
   */
  static async validateRefreshToken(refreshToken: string): Promise<{
    userId: string;
    sessionId: string;
    rememberMe: boolean;
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
   * Invalidates a refresh token (e.g., on logout)
   */
  static async invalidateRefreshToken(refreshToken: string): Promise<void> {
    const redis = getRedisClient();
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${refreshToken}`;
    await redis.del(key);
  }

  /**
   * Verifies an access token and returns the payload
   */
  static verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as JwtPayload;
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
