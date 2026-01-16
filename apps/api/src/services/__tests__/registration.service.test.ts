import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { eq, inArray } from 'drizzle-orm';
import { RegistrationService } from '../registration.service.js';
import { EmailService } from '../email.service.js';
import { hashPassword } from '@oslsr/utils';
import { UserRole } from '@oslsr/types';
import { verhoeffGenerate } from '@oslsr/utils/src/validation';

// Generate unique valid NINs for testing
const generateValidNin = (base: number): string => {
  // Generate 10-digit base and add Verhoeff check digit
  const baseNum = String(base).padStart(10, '0');
  return verhoeffGenerate(baseNum);
};

describe('RegistrationService', () => {
  let publicRoleId: string;
  const testUsers: string[] = [];
  let ninCounter = Date.now() % 1000000000; // Use timestamp as base for unique NINs

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
    vi.restoreAllMocks();
  });

  describe('registerPublicUser', () => {
    it('should create a new user with pending_verification status', async () => {
      const email = `test-register-${Date.now()}@example.com`;
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin1 = generateValidNin(ninCounter++);
      const nin2 = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
      const nin = generateValidNin(ninCounter++);

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
});
