import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { PasswordResetService } from '../services/password-reset.service.js';
import { Redis } from 'ioredis';

const request = supertest(app);

// Redis client for direct token manipulation in tests
const testRedisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

describe('Auth Password Reset Integration', () => {
  let testUserId: string;
  let testUserEmail: string;
  let resetToken: string;

  beforeAll(async () => {
    // Ensure roles exist (use lowercase to match UserRole enum)
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Administrator' },
      { name: 'enumerator', description: 'Field Enumerator' },
    ]).onConflictDoNothing();

    // Find a role
    const staffRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'enumerator'),
    });

    // Create test user
    testUserEmail = `reset-${Date.now()}@example.com`;
    const hashedPassword = await hashPassword('OriginalPass123!');

    const [user] = await db.insert(users).values({
      email: testUserEmail,
      fullName: 'Reset Test User',
      roleId: staffRole!.id,
      status: 'active',
      passwordHash: hashedPassword,
    }).returning();
    testUserId = user.id;
  });

  afterAll(async () => {
    // Wrap in transaction to prevent race conditions with parallel test files (Story 6-1 review fix)
    await db.transaction(async (tx) => {
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
      if (testUserId) {
        await tx.delete(auditLogs).where(eq(auditLogs.actorId, testUserId));
        await tx.delete(users).where(eq(users.id, testUserId));
      }
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
    });
    await testRedisClient.quit();
  });

  describe('Forgot Password - POST /api/v1/auth/forgot-password', () => {
    it('should return success for valid email', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .send({
          email: testUserEmail,
          captchaToken: 'test-captcha-bypass',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('password reset link');
    });

    it('should return same response for non-existent email (security)', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'nonexistent@example.com',
          captchaToken: 'test-captcha-bypass',
        });

      // Same response to prevent email enumeration
      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('password reset link');
    });

    it('should reject missing CAPTCHA', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .send({
          email: testUserEmail,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_CAPTCHA_FAILED');
    });

    it('should reject invalid email format', async () => {
      const res = await request
        .post('/api/v1/auth/forgot-password')
        .send({
          email: 'not-an-email',
          captchaToken: 'test-captcha-bypass',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Validate Reset Token - GET /api/v1/auth/reset-password/:token', () => {
    beforeAll(async () => {
      // Use the service to create a valid reset token (stores in Redis)
      const result = await PasswordResetService.requestReset(testUserEmail);
      resetToken = result.token!;
    });

    it('should validate a valid token', async () => {
      const res = await request
        .get(`/api/v1/auth/reset-password/${resetToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(true);
    });

    it('should reject invalid token', async () => {
      const res = await request
        .get('/api/v1/auth/reset-password/invalid-token-12345678901234567890123456789012');

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_INVALID');
    });
  });

  describe('Reset Password - POST /api/v1/auth/reset-password', () => {
    let freshToken: string;

    beforeAll(async () => {
      // Create a fresh token for these tests
      const result = await PasswordResetService.requestReset(testUserEmail);
      freshToken = result.token!;
    });

    it('should reject password not meeting complexity requirements', async () => {
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send({
          token: freshToken,
          newPassword: 'weak', // Too short, no uppercase, no number, no special char
          confirmPassword: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reset password with valid token and strong password', async () => {
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send({
          token: freshToken,
          newPassword: 'NewSecurePass123!',
          confirmPassword: 'NewSecurePass123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Password reset successful');
    });

    it('should reject used token', async () => {
      // The token should be invalidated after use
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send({
          token: freshToken,
          newPassword: 'AnotherPass123!',
          confirmPassword: 'AnotherPass123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_INVALID');
    });

    it('should allow login with new password', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: testUserEmail,
          password: 'NewSecurePass123!',
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should reject old password after reset', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: testUserEmail,
          password: 'OriginalPass123!',
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });
  });

  describe('Expired Token', () => {
    let expiredToken: string;
    let expiredUserId: string;

    beforeAll(async () => {
      const staffRole = await db.query.roles.findFirst({
        where: eq(roles.name, 'enumerator'),
      });

      const email = `expired-token-${Date.now()}@example.com`;
      const hashedPassword = await hashPassword('TestPass123!');

      const [user] = await db.insert(users).values({
        email,
        fullName: 'Expired Token Test',
        roleId: staffRole!.id,
        status: 'active',
        passwordHash: hashedPassword,
      }).returning();
      expiredUserId = user.id;

      // Create an expired reset token directly in Redis
      expiredToken = 'expired-test-token-' + Date.now();
      const tokenData = {
        userId: expiredUserId,
        email,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        expiresAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago (expired)
        used: false,
      };

      // Store in Redis with a short TTL (token won't auto-expire in test, but expiry check will fail)
      await testRedisClient.setex(
        `password_reset:${expiredToken}`,
        3600, // Keep in Redis for test
        JSON.stringify(tokenData)
      );
    });

    afterAll(async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
        if (expiredUserId) {
          await tx.delete(auditLogs).where(eq(auditLogs.actorId, expiredUserId));
          await tx.delete(users).where(eq(users.id, expiredUserId));
        }
        await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
      });
      // Clean up Redis token
      await testRedisClient.del(`password_reset:${expiredToken}`);
    });

    it('should reject expired token on validation', async () => {
      const res = await request
        .get(`/api/v1/auth/reset-password/${expiredToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_EXPIRED');
    });

    it('should reject expired token on reset', async () => {
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send({
          token: expiredToken,
          newPassword: 'NewPass123!',
          confirmPassword: 'NewPass123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_EXPIRED');
    });
  });
});
