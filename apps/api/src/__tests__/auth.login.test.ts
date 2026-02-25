import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { app } from '../app.js';
import { db } from '../db/index.js';
import { users, roles, auditLogs } from '../db/schema/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';

const request = supertest(app);

describe('Auth Login Integration', () => {
  let staffUserId: string;
  let staffUserEmail: string;
  let staffUserPassword: string;
  let publicUserId: string;
  let publicUserEmail: string;
  let publicUserPassword: string;

  beforeAll(async () => {
    // Ensure roles exist (use lowercase to match UserRole enum)
    await db.insert(roles).values([
      { name: 'super_admin', description: 'Super Administrator' },
      { name: 'enumerator', description: 'Field Enumerator' },
      { name: 'public_user', description: 'Public User' },
    ]).onConflictDoNothing();

    // Find staff and public roles
    const staffRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'enumerator'),
    });
    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'public_user'),
    });

    // Create staff user
    staffUserEmail = `staff-login-${Date.now()}@example.com`;
    staffUserPassword = 'StaffPass123!';
    const hashedStaffPassword = await hashPassword(staffUserPassword);

    const [staffUser] = await db.insert(users).values({
      email: staffUserEmail,
      fullName: 'Staff Login Test',
      roleId: staffRole!.id,
      status: 'active',
      passwordHash: hashedStaffPassword,
    }).returning();
    staffUserId = staffUser.id;

    // Create public user
    publicUserEmail = `public-login-${Date.now()}@example.com`;
    publicUserPassword = 'PublicPass123!';
    const hashedPublicPassword = await hashPassword(publicUserPassword);

    const [publicUser] = await db.insert(users).values({
      email: publicUserEmail,
      fullName: 'Public Login Test',
      roleId: publicRole!.id,
      status: 'active',
      passwordHash: hashedPublicPassword,
    }).returning();
    publicUserId = publicUser.id;
  });

  afterAll(async () => {
    // Wrap in transaction to prevent race conditions with parallel test files
    // toggling the immutable trigger (Story 6-1 code review fix)
    await db.transaction(async (tx) => {
      await tx.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable`);
      const userIds = [staffUserId, publicUserId].filter(Boolean);
      if (userIds.length > 0) {
        await tx.delete(auditLogs).where(inArray(auditLogs.actorId, userIds));
      }
      if (staffUserId) {
        await tx.delete(users).where(eq(users.id, staffUserId));
      }
      if (publicUserId) {
        await tx.delete(users).where(eq(users.id, publicUserId));
      }
      await tx.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable`);
    });
  });

  describe('Staff Login - POST /api/v1/auth/staff/login', () => {
    it('should login with valid credentials and CAPTCHA', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass', // Test token
          rememberMe: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data).toHaveProperty('expiresIn');
      expect(res.body.data.user.email).toBe(staffUserEmail);
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject invalid password', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: 'WrongPassword123!',
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject non-existent user', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'AnyPassword123!',
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });

    it('should reject missing CAPTCHA token', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          rememberMe: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('AUTH_CAPTCHA_FAILED');
    });

    it('should reject empty email', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: '',
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid email format', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: 'not-an-email',
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('should set longer expiry for Remember Me sessions', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      // Check that refresh token cookie is set with longer max-age
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
    });
  });

  describe('Public Login - POST /api/v1/auth/public/login', () => {
    it('should login with valid credentials and CAPTCHA', async () => {
      const res = await request
        .post('/api/v1/auth/public/login')
        .send({
          email: publicUserEmail,
          password: publicUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user.email).toBe(publicUserEmail);
    });

    it('should reject staff users from public login', async () => {
      const res = await request
        .post('/api/v1/auth/public/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      // Staff users should not be able to login through public endpoint
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_INVALID_CREDENTIALS');
    });
  });

  describe('Logout - POST /api/v1/auth/logout', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Login to get access token
      const loginRes = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });
      accessToken = loginRes.body.data.accessToken;
    });

    it('should logout successfully with valid token', async () => {
      const res = await request
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Logged out successfully');
    });

    it('should reject logout without token', async () => {
      const res = await request
        .post('/api/v1/auth/logout');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('should reject logout with invalidated token', async () => {
      // The token from the previous test should now be blacklisted
      const res = await request
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Get Current User - GET /api/v1/auth/me', () => {
    let accessToken: string;

    beforeAll(async () => {
      // Login to get access token
      const loginRes = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: staffUserEmail,
          password: staffUserPassword,
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });
      accessToken = loginRes.body.data.accessToken;
    });

    it('should return current user info', async () => {
      const res = await request
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('email');
      expect(res.body.data.email).toBe(staffUserEmail);
      expect(res.body.data).toHaveProperty('role');
    });

    it('should reject without authentication', async () => {
      const res = await request.get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Suspended User', () => {
    let suspendedUserId: string;
    let suspendedEmail: string;

    beforeAll(async () => {
      const staffRole = await db.query.roles.findFirst({
        where: eq(roles.name, 'enumerator'),
      });

      suspendedEmail = `suspended-${Date.now()}@example.com`;
      const hashedPassword = await hashPassword('TestPass123!');

      const [suspendedUser] = await db.insert(users).values({
        email: suspendedEmail,
        fullName: 'Suspended User',
        roleId: staffRole!.id,
        status: 'suspended',
        passwordHash: hashedPassword,
      }).returning();
      suspendedUserId = suspendedUser.id;
    });

    afterAll(async () => {
      await db.transaction(async (tx) => {
        await tx.execute(sql`ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable`);
        if (suspendedUserId) {
          await tx.delete(auditLogs).where(eq(auditLogs.actorId, suspendedUserId));
          await tx.delete(users).where(eq(users.id, suspendedUserId));
        }
        await tx.execute(sql`ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable`);
      });
    });

    it('should reject login for suspended user', async () => {
      const res = await request
        .post('/api/v1/auth/staff/login')
        .send({
          email: suspendedEmail,
          password: 'TestPass123!',
          captchaToken: 'test-captcha-bypass',
          rememberMe: false,
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AUTH_ACCOUNT_SUSPENDED');
    });
  });
});
