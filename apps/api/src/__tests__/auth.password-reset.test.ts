import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { purgeUsersWithAuditDrain, withAuditLogsMutable } from './helpers/audit-safe-teardown.js';
import { hashPassword } from '@oslsr/utils';
import type { ResetPasswordRequest } from '@oslsr/types';
import { PasswordResetService } from '../services/password-reset.service.js';
import { Redis } from 'ioredis';
import { createHash } from 'node:crypto';

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
    // Story 13-30: the "allow login with new password" test performs a
    // successful login as testUser, firing a fire-and-forget audit_logs write;
    // drain it before deleting to avoid the teardown FK race.
    await purgeUsersWithAuditDrain([testUserId]);
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
      const payload: ResetPasswordRequest = {
        token: freshToken,
        newPassword: 'weak', // Too short, no uppercase, no number, no special char
      };
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    // REGRESSION (2026-09-15): this payload is EXACTLY what apps/web builds in
    // usePasswordReset.ts, and it is typed as the wire contract ON PURPOSE - TypeScript
    // rejects an excess property, so nobody can quietly re-add `confirmPassword` here to
    // make a failure go away. From 3d84842 (2026-01-14) the server schema required
    // `confirmPassword`, no client ever sent it, and every real password reset died with
    // 400 "Invalid request data". The suite stayed green because these tests were written
    // from the schema instead of from the caller.
    it('should reset password with the payload the WEB CLIENT actually sends', async () => {
      const payload: ResetPasswordRequest = {
        token: freshToken,
        newPassword: 'NewSecurePass123!',
      };
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send(payload);

      expect(res.body.code).not.toBe('VALIDATION_ERROR');
      expect(res.status).toBe(200);
      expect(res.body.data.message).toContain('Password reset successful');
    });

    it('should reject used token', async () => {
      // The token should be invalidated after use
      const payload: ResetPasswordRequest = {
        token: freshToken,
        newPassword: 'AnotherPass123!',
      };
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send(payload);

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

      // Store in Redis under the HASHED key (F-011: reset tokens are hashed at rest)
      // so the service's hashed lookup finds it and the expiry check fires.
      await testRedisClient.setex(
        `password_reset:${createHash('sha256').update(expiredToken).digest('hex')}`,
        3600, // Keep in Redis for test
        JSON.stringify(tokenData)
      );
    });

    afterAll(async () => {
      await withAuditLogsMutable(async (tx) => {
        if (expiredUserId) {
          await tx.delete(auditLogs).where(eq(auditLogs.actorId, expiredUserId));
          await tx.delete(users).where(eq(users.id, expiredUserId));
        }
      });
      // Clean up Redis token (hashed key, F-011)
      await testRedisClient.del(`password_reset:${createHash('sha256').update(expiredToken).digest('hex')}`);
    });

    it('should reject expired token on validation', async () => {
      const res = await request
        .get(`/api/v1/auth/reset-password/${expiredToken}`);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_EXPIRED');
    });

    it('should reject expired token on reset', async () => {
      const payload: ResetPasswordRequest = {
        token: expiredToken,
        newPassword: 'NewPass123!',
      };
      const res = await request
        .post('/api/v1/auth/reset-password')
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_RESET_TOKEN_EXPIRED');
    });
  });
});
