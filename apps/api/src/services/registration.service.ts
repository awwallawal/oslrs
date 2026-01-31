import { Redis } from 'ioredis';
import { timingSafeEqual } from 'node:crypto';
import { db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError, hashPassword, generateVerificationToken, generateOtpCode } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';
import { EmailService } from './email.service.js';
import pino from 'pino';

const logger = pino({ name: 'registration-service' });

// Token expiry constants
const VERIFICATION_TOKEN_EXPIRY_HOURS = 24;
const OTP_EXPIRY_MINUTES = 10;
const OTP_EXPIRY_SECONDS = OTP_EXPIRY_MINUTES * 60;

// Redis key patterns for OTP (ADR-015)
const OTP_KEY_PREFIX = 'verification_otp:';

// Redis client (lazy-initialized singleton to avoid connection during test imports)
let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

interface RegisterPublicUserData {
  fullName: string;
  email: string;
  phone: string;
  nin: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

interface RegistrationResult {
  userId: string;
  message: string;
}

interface VerifyEmailResult {
  success: boolean;
  message: string;
}

interface ResendVerificationResult {
  success: boolean;
  message: string;
}

export class RegistrationService {
  /**
   * Registers a new public user with pending_verification status
   */
  static async registerPublicUser(data: RegisterPublicUserData): Promise<RegistrationResult> {
    const { fullName, email, phone, nin, password, ipAddress = 'unknown', userAgent = 'unknown' } = data;
    const normalizedEmail = email.toLowerCase().trim();

    logger.info({
      event: 'auth.registration_started',
      email: normalizedEmail,
    });

    // Get public_user role
    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, UserRole.PUBLIC_USER),
    });

    if (!publicRole) {
      logger.error({
        event: 'auth.registration_failed',
        reason: 'role_not_found',
        role: UserRole.PUBLIC_USER,
      });
      throw new AppError(
        'INTERNAL_ERROR',
        'Registration service not configured correctly',
        500
      );
    }

    // Check for existing NIN (with explicit error message)
    const existingNin = await db.query.users.findFirst({
      where: eq(users.nin, nin),
    });

    if (existingNin) {
      logger.warn({
        event: 'auth.registration_failed',
        reason: 'nin_duplicate',
        // Don't log NIN for privacy
      });
      throw new AppError(
        'REGISTRATION_NIN_EXISTS',
        'This NIN is already registered. Please login instead.',
        409
      );
    }

    // Check for existing email (with generic error to prevent enumeration)
    const existingEmail = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    if (existingEmail) {
      logger.warn({
        event: 'auth.registration_failed',
        reason: 'email_duplicate',
      });

      // Send notification to existing email holder
      await EmailService.sendDuplicateRegistrationAttemptEmail({
        email: normalizedEmail,
        fullName: existingEmail.fullName,
        attemptedAt: new Date().toISOString(),
      });

      // Return generic error to prevent email enumeration
      throw new AppError(
        'REGISTRATION_FAILED',
        'Registration failed. Please check your details.',
        400
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateVerificationToken();
    const verificationExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    );

    try {
      // Create user in transaction
      const result = await db.transaction(async (tx) => {
        const [newUser] = await tx.insert(users).values({
          email: normalizedEmail,
          fullName: fullName.trim(),
          phone,
          nin,
          passwordHash,
          roleId: publicRole.id,
          status: 'pending_verification',
          emailVerificationToken: verificationToken,
          emailVerificationExpiresAt: verificationExpiry,
        }).returning();

        // Create audit log
        await tx.insert(auditLogs).values({
          actorId: newUser.id,
          action: 'auth.registration_success',
          targetResource: 'users',
          targetId: newUser.id,
          details: { registeredAt: new Date().toISOString() },
          ipAddress,
          userAgent,
        });

        return newUser;
      });

      logger.info({
        event: 'auth.registration_success',
        userId: result.id,
      });

      // Generate OTP for hybrid verification (ADR-015)
      const otpCode = generateOtpCode();

      // Store OTP in Redis with 10-minute TTL
      const redis = getRedisClient();
      await redis.setex(
        `${OTP_KEY_PREFIX}${normalizedEmail}`,
        OTP_EXPIRY_SECONDS,
        JSON.stringify({
          otp: otpCode,
          userId: result.id,
          createdAt: new Date().toISOString(),
        })
      );

      // Send verification email (non-blocking)
      EmailService.sendVerificationEmail({
        email: normalizedEmail,
        fullName: fullName.trim(),
        verificationUrl: EmailService.generateVerificationUrl(verificationToken),
        otpCode,
        magicLinkExpiresInHours: VERIFICATION_TOKEN_EXPIRY_HOURS,
        otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
      }).catch((err) => {
        logger.error({
          event: 'auth.verification_email_failed',
          userId: result.id,
          error: err.message,
        });
      });

      return {
        userId: result.id,
        message: 'Registration successful! Please check your email to verify your account.',
      };
    } catch (err: unknown) {
      // Handle unique constraint violations at database level (race condition)
      const dbError = err as { code?: string; constraint_name?: string };
      if (dbError.code === '23505') {
        if (dbError.constraint_name === 'users_nin_unique') {
          logger.warn({
            event: 'auth.registration_failed',
            reason: 'nin_duplicate_race',
          });
          throw new AppError(
            'REGISTRATION_NIN_EXISTS',
            'This NIN is already registered. Please login instead.',
            409
          );
        }
        if (dbError.constraint_name === 'users_email_unique') {
          logger.warn({
            event: 'auth.registration_failed',
            reason: 'email_duplicate_race',
          });
          // Generic error to prevent enumeration
          throw new AppError(
            'REGISTRATION_FAILED',
            'Registration failed. Please check your details.',
            400
          );
        }
      }

      if (err instanceof AppError) {
        throw err;
      }

      logger.error({
        event: 'auth.registration_failed',
        reason: 'unknown',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      throw new AppError(
        'INTERNAL_ERROR',
        'Registration failed. Please try again later.',
        500
      );
    }
  }

  /**
   * Verifies a user's email address using the verification token
   */
  static async verifyEmail(token: string, ipAddress = 'unknown', userAgent = 'unknown'): Promise<VerifyEmailResult> {
    logger.info({
      event: 'auth.email_verification_started',
    });

    // Find user by verification token
    const user = await db.query.users.findFirst({
      where: eq(users.emailVerificationToken, token),
    });

    if (!user) {
      logger.warn({
        event: 'auth.email_verification_failed',
        reason: 'invalid_token',
      });
      throw new AppError(
        'VERIFICATION_TOKEN_INVALID',
        'Invalid verification token',
        400
      );
    }

    // Check if token is expired
    if (user.emailVerificationExpiresAt && new Date() > new Date(user.emailVerificationExpiresAt)) {
      logger.warn({
        event: 'auth.email_verification_failed',
        reason: 'token_expired',
        userId: user.id,
      });
      throw new AppError(
        'VERIFICATION_TOKEN_EXPIRED',
        'This verification link has expired. Please request a new one.',
        400
      );
    }

    // Activate user and invalidate token
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({
          status: 'active',
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: 'auth.email_verification_success',
        targetResource: 'users',
        targetId: user.id,
        details: { verifiedAt: new Date().toISOString(), method: 'magic_link' },
        ipAddress,
        userAgent,
      });
    });

    // Mutual invalidation: Delete OTP from Redis (ADR-015)
    const redis = getRedisClient();
    await redis.del(`${OTP_KEY_PREFIX}${user.email}`);

    logger.info({
      event: 'auth.email_verification_success',
      userId: user.id,
      method: 'magic_link',
    });

    return {
      success: true,
      message: 'Email verified successfully! You can now log in.',
    };
  }

  /**
   * Resends the verification email to a user
   * Always returns success to prevent email enumeration
   */
  static async resendVerificationEmail(email: string): Promise<ResendVerificationResult> {
    const normalizedEmail = email.toLowerCase().trim();

    logger.info({
      event: 'auth.resend_verification_started',
    });

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, normalizedEmail),
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.info({
        event: 'auth.resend_verification_skipped',
        reason: 'user_not_found',
      });
      return {
        success: true,
        message: 'If this email is registered and unverified, a verification email will be sent.',
      };
    }

    // Skip if already verified
    if (user.status !== 'pending_verification') {
      logger.info({
        event: 'auth.resend_verification_skipped',
        reason: 'already_verified',
        userId: user.id,
      });
      return {
        success: true,
        message: 'If this email is registered and unverified, a verification email will be sent.',
      };
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken();
    const verificationExpiry = new Date(
      Date.now() + VERIFICATION_TOKEN_EXPIRY_HOURS * 60 * 60 * 1000
    );

    // Update user with new token
    await db.update(users)
      .set({
        emailVerificationToken: verificationToken,
        emailVerificationExpiresAt: verificationExpiry,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    // Generate new OTP for hybrid verification (ADR-015)
    const otpCode = generateOtpCode();

    // Store new OTP in Redis (overwrites any existing)
    const redis = getRedisClient();
    await redis.setex(
      `${OTP_KEY_PREFIX}${normalizedEmail}`,
      OTP_EXPIRY_SECONDS,
      JSON.stringify({
        otp: otpCode,
        userId: user.id,
        createdAt: new Date().toISOString(),
      })
    );

    // Send verification email with both magic link and OTP
    await EmailService.sendVerificationEmail({
      email: normalizedEmail,
      fullName: user.fullName,
      verificationUrl: EmailService.generateVerificationUrl(verificationToken),
      otpCode,
      magicLinkExpiresInHours: VERIFICATION_TOKEN_EXPIRY_HOURS,
      otpExpiresInMinutes: OTP_EXPIRY_MINUTES,
    });

    logger.info({
      event: 'auth.resend_verification_success',
      userId: user.id,
    });

    return {
      success: true,
      message: 'If this email is registered and unverified, a verification email will be sent.',
    };
  }

  /**
   * Verifies a user's email address using OTP (ADR-015 fallback)
   * Mutually invalidates the magic link token
   */
  static async verifyOtp(
    email: string,
    otp: string,
    ipAddress = 'unknown',
    userAgent = 'unknown'
  ): Promise<VerifyEmailResult> {
    const normalizedEmail = email.toLowerCase().trim();

    logger.info({
      event: 'auth.otp_verification_started',
    });

    // Check OTP in Redis
    const redis = getRedisClient();
    const otpDataRaw = await redis.get(`${OTP_KEY_PREFIX}${normalizedEmail}`);

    if (!otpDataRaw) {
      logger.warn({
        event: 'auth.otp_verification_failed',
        reason: 'otp_not_found_or_expired',
      });
      throw new AppError(
        'VERIFICATION_OTP_INVALID',
        'Invalid or expired verification code. Please request a new one.',
        400
      );
    }

    const otpData = JSON.parse(otpDataRaw) as { otp: string; userId: string; createdAt: string };

    // Verify OTP matches using constant-time comparison to prevent timing attacks
    const otpBuffer = Buffer.from(otp.padEnd(6, '0'));
    const storedOtpBuffer = Buffer.from(otpData.otp.padEnd(6, '0'));
    const otpMatches = otpBuffer.length === storedOtpBuffer.length &&
                       timingSafeEqual(otpBuffer, storedOtpBuffer);

    if (!otpMatches) {
      logger.warn({
        event: 'auth.otp_verification_failed',
        reason: 'otp_mismatch',
        userId: otpData.userId,
      });
      throw new AppError(
        'VERIFICATION_OTP_INVALID',
        'Invalid verification code. Please check and try again.',
        400
      );
    }

    // Find user by ID from OTP data
    const user = await db.query.users.findFirst({
      where: eq(users.id, otpData.userId),
    });

    if (!user) {
      // This shouldn't happen, but handle it gracefully
      logger.error({
        event: 'auth.otp_verification_failed',
        reason: 'user_not_found',
        userId: otpData.userId,
      });
      throw new AppError(
        'VERIFICATION_FAILED',
        'Verification failed. Please try again.',
        400
      );
    }

    // Check if already verified
    if (user.status !== 'pending_verification') {
      logger.info({
        event: 'auth.otp_verification_skipped',
        reason: 'already_verified',
        userId: user.id,
      });

      // Delete OTP anyway
      await redis.del(`${OTP_KEY_PREFIX}${normalizedEmail}`);

      return {
        success: true,
        message: 'Email already verified. You can log in.',
      };
    }

    // Activate user and invalidate magic link token
    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({
          status: 'active',
          emailVerificationToken: null,
          emailVerificationExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));

      await tx.insert(auditLogs).values({
        actorId: user.id,
        action: 'auth.email_verification_success',
        targetResource: 'users',
        targetId: user.id,
        details: { verifiedAt: new Date().toISOString(), method: 'otp' },
        ipAddress,
        userAgent,
      });
    });

    // Delete OTP from Redis (mutual invalidation complete)
    await redis.del(`${OTP_KEY_PREFIX}${normalizedEmail}`);

    logger.info({
      event: 'auth.email_verification_success',
      userId: user.id,
      method: 'otp',
    });

    return {
      success: true,
      message: 'Email verified successfully! You can now log in.',
    };
  }
}
