import { randomBytes } from 'node:crypto';
import { Redis } from 'ioredis';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError, hashPassword } from '@oslsr/utils';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';

// Password reset constants
const RESET_TOKEN_EXPIRY = 60 * 60;           // 1 hour (in seconds)
const RESET_RATE_LIMIT = 3;                   // 3 requests per hour
const RESET_RATE_WINDOW = 60 * 60;            // 1 hour (in seconds)

// Redis key patterns
const RESET_TOKEN_KEY_PREFIX = 'password_reset:';
const RESET_RATE_KEY_PREFIX = 'password_reset_rate:';

// Check if we're in test mode (vitest sets VITEST env var)
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

// Redis client (singleton)
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const getRedisClient = () => redisClient;

interface ResetTokenData {
  userId: string;
  email: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export class PasswordResetService {
  /**
   * Generates a cryptographically secure reset token (32 bytes, base64url encoded)
   */
  private static generateSecureToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Checks rate limit for password reset requests
   * Returns true if within limit, false if exceeded
   */
  static async checkRateLimit(email: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: Date;
  }> {
    // Skip rate limiting in test mode
    if (isTestMode()) {
      return {
        allowed: true,
        remaining: RESET_RATE_LIMIT,
        resetAt: new Date(Date.now() + RESET_RATE_WINDOW * 1000),
      };
    }

    const redis = getRedisClient();
    const normalizedEmail = email.toLowerCase().trim();
    const key = `${RESET_RATE_KEY_PREFIX}${normalizedEmail}`;

    const count = await redis.get(key);
    const currentCount = count ? parseInt(count, 10) : 0;

    if (currentCount >= RESET_RATE_LIMIT) {
      const ttl = await redis.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + ttl * 1000),
      };
    }

    return {
      allowed: true,
      remaining: RESET_RATE_LIMIT - currentCount - 1,
      resetAt: new Date(Date.now() + RESET_RATE_WINDOW * 1000),
    };
  }

  /**
   * Increments rate limit counter for an email
   */
  private static async incrementRateLimit(email: string): Promise<void> {
    const redis = getRedisClient();
    const normalizedEmail = email.toLowerCase().trim();
    const key = `${RESET_RATE_KEY_PREFIX}${normalizedEmail}`;

    const exists = await redis.exists(key);
    if (exists) {
      await redis.incr(key);
    } else {
      await redis.setex(key, RESET_RATE_WINDOW, '1');
    }
  }

  /**
   * Requests a password reset for an email
   * Returns the token (for email sending) or null if email doesn't exist
   * NOTE: Response to user should always be the same to prevent email enumeration
   */
  static async requestReset(email: string): Promise<{
    token: string | null;
    userId: string | null;
  }> {
    const normalizedEmail = email.toLowerCase().trim();

    // Check rate limit first
    const rateLimit = await this.checkRateLimit(normalizedEmail);
    if (!rateLimit.allowed) {
      throw new AppError(
        'AUTH_RESET_RATE_LIMITED',
        'Too many password reset requests. Please try again later.',
        429
      );
    }

    // Increment rate limit counter regardless of whether email exists
    // This prevents timing attacks
    await this.incrementRateLimit(normalizedEmail);

    // Look up user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    // If user doesn't exist, return null but don't throw
    // The caller should show the same message to prevent enumeration
    if (!user) {
      return { token: null, userId: null };
    }

    // Check if user is in a valid state for password reset
    if (user.status === 'suspended' || user.status === 'deactivated') {
      // Still return null to prevent enumeration
      return { token: null, userId: null };
    }

    // Generate secure token
    const token = this.generateSecureToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + RESET_TOKEN_EXPIRY * 1000);

    // Store token in Redis
    const redis = getRedisClient();
    const tokenData: ResetTokenData = {
      userId: user.id,
      email: normalizedEmail,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false,
    };

    await redis.setex(
      `${RESET_TOKEN_KEY_PREFIX}${token}`,
      RESET_TOKEN_EXPIRY,
      JSON.stringify(tokenData)
    );

    // Also store token in database for audit trail
    await db.update(users)
      .set({
        passwordResetToken: token,
        passwordResetExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return { token, userId: user.id };
  }

  /**
   * Validates a password reset token
   * Returns user data if valid, throws if invalid or expired
   */
  static async validateToken(token: string): Promise<{
    userId: string;
    email: string;
  }> {
    const redis = getRedisClient();
    const key = `${RESET_TOKEN_KEY_PREFIX}${token}`;

    const data = await redis.get(key);

    if (!data) {
      throw new AppError(
        'AUTH_RESET_TOKEN_INVALID',
        'This reset link is invalid or has expired',
        400
      );
    }

    const tokenData: ResetTokenData = JSON.parse(data);

    // Check if token has been used
    if (tokenData.used) {
      throw new AppError(
        'AUTH_RESET_TOKEN_INVALID',
        'This reset link has already been used',
        400
      );
    }

    // Check expiry (Redis TTL handles this, but double-check)
    if (new Date() > new Date(tokenData.expiresAt)) {
      throw new AppError(
        'AUTH_RESET_TOKEN_EXPIRED',
        'This reset link has expired',
        400
      );
    }

    return {
      userId: tokenData.userId,
      email: tokenData.email,
    };
  }

  /**
   * Resets the password using a valid token
   * Invalidates all existing sessions after password change
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    // Validate token first
    const { userId, email } = await this.validateToken(token);

    // Hash the new password
    const passwordHash = await hashPassword(newPassword);

    // Update password in database
    await db.update(users)
      .set({
        passwordHash,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        failedLoginAttempts: 0,  // Reset failed attempts
        lockedUntil: null,       // Unlock account if locked
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Mark token as used in Redis
    const redis = getRedisClient();
    const key = `${RESET_TOKEN_KEY_PREFIX}${token}`;
    const data = await redis.get(key);

    if (data) {
      const tokenData: ResetTokenData = JSON.parse(data);
      tokenData.used = true;

      // Keep for 1 hour to prevent reuse attempts from showing success
      await redis.setex(key, 3600, JSON.stringify(tokenData));
    }

    // Invalidate all existing sessions for this user
    await SessionService.invalidateAllUserSessions(userId);

    // Invalidate all tokens for this user
    await TokenService.invalidateAllUserTokens(userId);
  }

  /**
   * Gets reset token constants for external use
   */
  static getConstants() {
    return {
      RESET_TOKEN_EXPIRY,
      RESET_RATE_LIMIT,
      RESET_RATE_WINDOW,
    };
  }
}
