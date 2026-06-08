import { randomBytes, createHash } from 'node:crypto';
import { getRedisClient } from '../lib/redis.js';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError, hashPassword } from '@oslsr/utils';
import { TokenService } from './token.service.js';
import { SessionService } from './session.service.js';

// Password reset constants — exported so the AC#6 (F-019) rate-limit-coverage
// test can sentinel them as the canonical NFR4.4 password-reset 3/email/hour
// contract. (NOTE: in Story 9-42, AC#4 is refresh-token rotation; the reset
// rate-limit verification is AC#6/F-019.)
const RESET_TOKEN_EXPIRY = 60 * 60;           // 1 hour (in seconds)
export const RESET_RATE_LIMIT = 3;            // 3 requests per hour (NFR4.4)
export const RESET_RATE_WINDOW = 60 * 60;     // 1 hour in seconds (NFR4.4)

// Redis key patterns
const RESET_TOKEN_KEY_PREFIX = 'password_reset:';
const RESET_RATE_KEY_PREFIX = 'password_reset_rate:';

// Check if we're in test mode (vitest sets VITEST env var)
const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

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
   * F-011 (sec-r2): SHA-256 hex of a reset token. The plaintext token is emailed
   * exactly once and NEVER persisted; only this hash is stored (Redis key +
   * `users.passwordResetToken`), and the incoming token is hashed before lookup.
   * Mirrors the magic-link.service.ts pattern so a DB/Redis backup leak cannot be
   * turned into an account takeover.
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
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

    // Google OAuth users cannot reset password — return null to preserve
    // anti-enumeration (same response as non-existent email). Story 3.0, AC7.
    // The frontend shows a generic "check your email" message regardless.
    if (user.authProvider === 'google') {
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

    // Store token in Redis — F-011: the key is the SHA-256 hash, NOT the raw token.
    const redis = getRedisClient();
    const tokenHash = this.hashToken(token);
    const tokenData: ResetTokenData = {
      userId: user.id,
      email: normalizedEmail,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      used: false,
    };

    await redis.setex(
      `${RESET_TOKEN_KEY_PREFIX}${tokenHash}`,
      RESET_TOKEN_EXPIRY,
      JSON.stringify(tokenData)
    );

    // Also store the token HASH in the database for audit trail (F-011: never the raw token)
    await db.update(users)
      .set({
        passwordResetToken: tokenHash,
        passwordResetExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Return the PLAINTEXT token for the email link; only its hash was persisted.
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
    const key = `${RESET_TOKEN_KEY_PREFIX}${this.hashToken(token)}`;

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
    const { userId } = await this.validateToken(token);

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
    const key = `${RESET_TOKEN_KEY_PREFIX}${this.hashToken(token)}`;
    const data = await redis.get(key);

    if (data) {
      const tokenData: ResetTokenData = JSON.parse(data);
      tokenData.used = true;

      // Keep for 1 hour to prevent reuse attempts from showing success
      await redis.setex(key, 3600, JSON.stringify(tokenData));
    }

    // Invalidate all existing sessions for this user
    await SessionService.invalidateAllUserSessions(userId);

    // Invalidate all tokens for this user (timestamp + refresh token deletion)
    await TokenService.revokeAllUserTokens(userId);
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
