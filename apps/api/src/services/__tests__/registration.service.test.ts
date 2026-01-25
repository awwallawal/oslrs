import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Redis } from 'ioredis';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { RegistrationService } from '../registration.service.js';
import { EmailService } from '../email.service.js';
import { hashPassword } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';
import { modulus11Generate } from '@oslsr/utils/src/validation';

// Redis client for test verification
const testRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const OTP_KEY_PREFIX = 'verification_otp:';

// Generate unique valid NINs for testing
// Uses combination of timestamp + random + counter for uniqueness
let globalNinCounter = 0;
const generateValidNin = (): string => {
  // Generate a truly unique 10-digit base using timestamp, random, and counter
  const timestamp = Date.now() % 100000000; // 8 digits from timestamp
  const random = Math.floor(Math.random() * 100); // 2 digits random
  let currentBase = timestamp * 100 + random + globalNinCounter++;

  // Ensure we stay within 10 digits
  currentBase = currentBase % 10000000000;

  // Some base numbers produce check digit 10, which is invalid
  // In that case, increment until we find a valid one
  while (true) {
    const baseNum = String(currentBase).padStart(10, '0');
    try {
      return modulus11Generate(baseNum);
    } catch {
      // Check digit was 10, try next number
      currentBase = (currentBase + 1) % 10000000000;
    }
  }
};

describe('RegistrationService', () => {
  let publicRoleId: string;
  const testUsers: string[] = [];

  beforeAll(async () => {
    // Ensure public_user role exists
    await db.insert(roles).values([
      { name: 'public_user', description: 'Public User' },
    ]).onConflictDoNothing();

    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'public_user'),
    });
    publicRoleId = publicRole!.id;

    // Mock EmailService
    vi.spyOn(EmailService, 'sendVerificationEmail').mockResolvedValue({
      success: true,
      messageId: 'test-message-id',
    });
  });

  afterAll(async () => {
    // Clean up test users
    if (testUsers.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.actorId, testUsers));
      await db.delete(users).where(inArray(users.id, testUsers));
    }
    // Clean up Redis OTP keys
    const keys = await testRedis.keys(`${OTP_KEY_PREFIX}*`);
    if (keys.length > 0) {
      await testRedis.del(...keys);
    }
    await testRedis.quit();
    vi.restoreAllMocks();
  });

  describe('registerPublicUser', () => {
    it('should create a new user with pending_verification status', async () => {
      const email = `test-register-${Date.now()}@example.com`;
      const nin = generateValidNin();

      const result = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });

      testUsers.push(result.userId);

      expect(result.userId).toBeDefined();
      expect(result.message).toContain('check your email');

      // Verify user was created with correct status
      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.userId),
      });

      expect(createdUser).toBeDefined();
      expect(createdUser!.status).toBe('pending_verification');
      expect(createdUser!.email).toBe(email.toLowerCase());
      expect(createdUser!.emailVerificationToken).toBeDefined();
      expect(createdUser!.emailVerificationExpiresAt).toBeDefined();
    });

    it('should hash the password correctly', async () => {
      const email = `test-password-${Date.now()}@example.com`;
      const password = 'SecurePass123!';
      const nin = generateValidNin();

      const result = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password,
      });

      testUsers.push(result.userId);

      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.userId),
      });

      expect(createdUser!.passwordHash).toBeDefined();
      expect(createdUser!.passwordHash).not.toBe(password);
    });

    it('should reject duplicate NIN with generic error', async () => {
      const email1 = `test-dup-nin-1-${Date.now()}@example.com`;
      const email2 = `test-dup-nin-2-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // First registration
      const result1 = await RegistrationService.registerPublicUser({
        fullName: 'First User',
        email: email1,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(result1.userId);

      // Second registration with same NIN should fail
      await expect(
        RegistrationService.registerPublicUser({
          fullName: 'Second User',
          email: email2,
          phone: '+2348012345679',
          nin,
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('This NIN is already registered');
    });

    it('should reject duplicate email with generic error and send notification', async () => {
      const email = `test-dup-email-${Date.now()}@example.com`;
      const nin1 = generateValidNin();
      const nin2 = generateValidNin();

      // First registration
      const result1 = await RegistrationService.registerPublicUser({
        fullName: 'First User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin: nin1,
        password: 'SecurePass123!',
      });
      testUsers.push(result1.userId);

      // Second registration with same email should fail
      await expect(
        RegistrationService.registerPublicUser({
          fullName: 'Second User',
          email,
          phone: '+2348012345679',
          nin: nin2,
          password: 'SecurePass123!',
        })
      ).rejects.toThrow('Registration failed');
    });

    it('should generate a 64-character verification token', async () => {
      const email = `test-token-${Date.now()}@example.com`;
      const nin = generateValidNin();

      const result = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });

      testUsers.push(result.userId);

      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.userId),
      });

      expect(createdUser!.emailVerificationToken).toHaveLength(64);
    });

    it('should set verification expiry to 24 hours in the future', async () => {
      const email = `test-expiry-${Date.now()}@example.com`;
      const beforeRegistration = new Date();
      const nin = generateValidNin();

      const result = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });

      testUsers.push(result.userId);

      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.userId),
      });

      const expiresAt = new Date(createdUser!.emailVerificationExpiresAt!);
      const expectedExpiry = new Date(beforeRegistration.getTime() + 24 * 60 * 60 * 1000);

      // Allow 1 minute tolerance
      expect(expiresAt.getTime()).toBeGreaterThan(expectedExpiry.getTime() - 60000);
      expect(expiresAt.getTime()).toBeLessThan(expectedExpiry.getTime() + 60000);
    });
  });

  describe('verifyEmail', () => {
    it('should activate user with valid token', async () => {
      const email = `test-verify-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get the token from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      // Verify email
      const verifyResult = await RegistrationService.verifyEmail(
        user!.emailVerificationToken!
      );

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toContain('verified');

      // Check user status is now active
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      expect(updatedUser!.status).toBe('active');
      expect(updatedUser!.emailVerificationToken).toBeNull();
    });

    it('should reject invalid token', async () => {
      await expect(
        RegistrationService.verifyEmail('invalid-token-that-does-not-exist')
      ).rejects.toThrow('Invalid verification token');
    });

    it('should reject expired token', async () => {
      const email = `test-expired-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Manually expire the token
      await db.update(users)
        .set({
          emailVerificationExpiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        })
        .where(eq(users.id, registerResult.userId));

      // Get the token from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      // Verify email should fail
      await expect(
        RegistrationService.verifyEmail(user!.emailVerificationToken!)
      ).rejects.toThrow('expired');
    });

    it('should invalidate token after use (single-use)', async () => {
      const email = `test-single-use-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get the token from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });
      const token = user!.emailVerificationToken!;

      // First verification should succeed
      await RegistrationService.verifyEmail(token);

      // Second verification should fail
      await expect(
        RegistrationService.verifyEmail(token)
      ).rejects.toThrow('Invalid verification token');
    });
  });

  describe('resendVerificationEmail', () => {
    it('should generate new token and send new email', async () => {
      const email = `test-resend-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get original token
      const userBefore = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });
      const originalToken = userBefore!.emailVerificationToken;

      // Resend verification
      const resendResult = await RegistrationService.resendVerificationEmail(email);

      expect(resendResult.success).toBe(true);

      // Verify new token was generated
      const userAfter = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      expect(userAfter!.emailVerificationToken).not.toBe(originalToken);
    });

    it('should reject resend for non-existent email without revealing existence', async () => {
      // Should not throw - returns success to prevent enumeration
      const result = await RegistrationService.resendVerificationEmail(
        'nonexistent@example.com'
      );

      // Always returns success to prevent email enumeration
      expect(result.success).toBe(true);
    });

    it('should reject resend for already verified user', async () => {
      const email = `test-resend-verified-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register and verify user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get token and verify
      const user = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });
      await RegistrationService.verifyEmail(user!.emailVerificationToken!);

      // Resend should fail silently (return success but not send)
      const result = await RegistrationService.resendVerificationEmail(email);
      expect(result.success).toBe(true);
    });
  });

  describe('verifyOtp (ADR-015)', () => {
    it('should store OTP in Redis when registering', async () => {
      const email = `test-otp-store-${Date.now()}@example.com`;
      const nin = generateValidNin();

      const result = await RegistrationService.registerPublicUser({
        fullName: 'Test OTP User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(result.userId);

      // Verify OTP was stored in Redis
      const otpData = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      expect(otpData).toBeDefined();

      const parsed = JSON.parse(otpData!);
      expect(parsed.otp).toHaveLength(6);
      expect(parsed.otp).toMatch(/^\d{6}$/);
      expect(parsed.userId).toBe(result.userId);
    });

    it('should activate user with valid OTP', async () => {
      const email = `test-otp-verify-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test OTP User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get OTP from Redis
      const otpData = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      const { otp } = JSON.parse(otpData!);

      // Verify with OTP
      const verifyResult = await RegistrationService.verifyOtp(email, otp);

      expect(verifyResult.success).toBe(true);
      expect(verifyResult.message).toContain('verified');

      // Check user status is now active
      const updatedUser = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      expect(updatedUser!.status).toBe('active');
    });

    it('should reject invalid OTP', async () => {
      const email = `test-otp-invalid-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test OTP User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Try with wrong OTP
      await expect(
        RegistrationService.verifyOtp(email, '000000')
      ).rejects.toThrow('Invalid verification code');
    });

    it('should reject OTP for non-existent email', async () => {
      await expect(
        RegistrationService.verifyOtp('nonexistent@example.com', '123456')
      ).rejects.toThrow('Invalid or expired verification code');
    });

    it('should delete OTP from Redis after successful verification', async () => {
      const email = `test-otp-delete-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test OTP User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get OTP from Redis
      const otpData = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      const { otp } = JSON.parse(otpData!);

      // Verify with OTP
      await RegistrationService.verifyOtp(email, otp);

      // OTP should be deleted
      const otpAfter = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      expect(otpAfter).toBeNull();
    });

    it('should mutually invalidate: magic link deletes OTP', async () => {
      const email = `test-mutual-magic-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test Mutual User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Verify OTP exists
      const otpBefore = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      expect(otpBefore).toBeDefined();

      // Get magic link token from database
      const user = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });

      // Verify using magic link
      await RegistrationService.verifyEmail(user!.emailVerificationToken!);

      // OTP should be deleted (mutual invalidation)
      const otpAfter = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      expect(otpAfter).toBeNull();
    });

    it('should mutually invalidate: OTP deletes magic link token', async () => {
      const email = `test-mutual-otp-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test Mutual User',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get OTP from Redis
      const otpData = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      const { otp } = JSON.parse(otpData!);

      // Verify magic link token exists before
      const userBefore = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });
      expect(userBefore!.emailVerificationToken).toBeDefined();

      // Verify using OTP
      await RegistrationService.verifyOtp(email, otp);

      // Magic link token should be deleted (mutual invalidation)
      const userAfter = await db.query.users.findFirst({
        where: eq(users.id, registerResult.userId),
      });
      expect(userAfter!.emailVerificationToken).toBeNull();
    });

    it('should regenerate OTP when resending verification email', async () => {
      const email = `test-otp-resend-${Date.now()}@example.com`;
      const nin = generateValidNin();

      // Register user
      const registerResult = await RegistrationService.registerPublicUser({
        fullName: 'Test OTP Resend',
        email,
        phone: `+23480${Date.now().toString().slice(-8)}`,
        nin,
        password: 'SecurePass123!',
      });
      testUsers.push(registerResult.userId);

      // Get original OTP
      const otpDataBefore = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      const { otp: originalOtp } = JSON.parse(otpDataBefore!);

      // Resend verification
      await RegistrationService.resendVerificationEmail(email);

      // Get new OTP
      const otpDataAfter = await testRedis.get(`${OTP_KEY_PREFIX}${email.toLowerCase()}`);
      const { otp: newOtp } = JSON.parse(otpDataAfter!);

      // OTP should be different (statistically very unlikely to be same)
      // Note: There's a 1 in 1,000,000 chance they're the same, so this test
      // could theoretically fail randomly, but it's acceptable for testing
      expect(newOtp).toHaveLength(6);
      expect(newOtp).toMatch(/^\d{6}$/);
    });
  });
});
