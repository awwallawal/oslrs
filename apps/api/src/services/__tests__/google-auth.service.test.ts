import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { db } from '../../db/index.js';
import { users, roles, auditLogs } from '../../db/schema/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { GoogleAuthService } from '../google-auth.service.js';
import { randomInt } from 'crypto';

// Mock google-auth-library to prevent network calls during token verification tests
vi.mock('google-auth-library', () => {
  return {
    OAuth2Client: vi.fn().mockImplementation(() => ({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
    })),
  };
});

// Track test users for cleanup
const testUsers: string[] = [];

// Generate unique emails to avoid collisions
const uniqueEmail = () => `test-google-${Date.now()}-${randomInt(10000)}@example.com`;

describe('GoogleAuthService', () => {
  let publicRoleId: string;

  beforeEach(() => {
    // Set GOOGLE_CLIENT_ID for tests
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  });

  beforeAll(async () => {
    // Ensure public_user role exists
    await db.insert(roles).values([
      { name: 'public_user', description: 'Public User' },
    ]).onConflictDoNothing();

    const publicRole = await db.query.roles.findFirst({
      where: eq(roles.name, 'public_user'),
    });
    publicRoleId = publicRole!.id;
  });

  afterAll(async () => {
    // Wrap in transaction to prevent race conditions with parallel test files (Story 6-1 review fix)
    await db.transaction(async (tx) => {
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
      if (testUsers.length > 0) {
        await tx.delete(auditLogs).where(inArray(auditLogs.actorId, testUsers));
        await tx.delete(users).where(inArray(users.id, testUsers));
      }
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
    });
    vi.restoreAllMocks();
  });

  describe('verifyGoogleToken', () => {
    it('should reject when GOOGLE_CLIENT_ID is not configured', async () => {
      const savedClientId = process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_ID;

      await expect(
        GoogleAuthService.verifyGoogleToken('some-token')
      ).rejects.toMatchObject({
        code: 'AUTH_GOOGLE_TOKEN_INVALID',
      });

      process.env.GOOGLE_CLIENT_ID = savedClientId;
    });

    it('should reject invalid/malformed tokens', async () => {
      await expect(
        GoogleAuthService.verifyGoogleToken('invalid-token')
      ).rejects.toMatchObject({
        code: 'AUTH_GOOGLE_TOKEN_INVALID',
        statusCode: 401,
      });
    });

    it('should reject empty tokens', async () => {
      await expect(
        GoogleAuthService.verifyGoogleToken('')
      ).rejects.toMatchObject({
        code: 'AUTH_GOOGLE_TOKEN_INVALID',
      });
    });
  });

  describe('registerOrLoginWithGoogle', () => {
    it('should create a new user for first-time Google signup', async () => {
      const email = uniqueEmail();
      const googlePayload = {
        googleId: `google-${Date.now()}`,
        email,
        name: 'Test Google User',
        emailVerified: true,
      };

      const result = await GoogleAuthService.registerOrLoginWithGoogle(
        googlePayload,
        '127.0.0.1',
        'test-agent'
      );

      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe(email);
      expect(result.user.authProvider).toBe('google');
      expect(result.user.role).toBe('public_user');
      expect(result.user.status).toBe('active');
      expect(result.refreshToken).toBeDefined();
      expect(result.sessionId).toBeDefined();

      testUsers.push(result.user.id);

      // Verify user was created in DB with correct fields
      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.user.id),
      });
      expect(createdUser).toBeDefined();
      expect(createdUser!.authProvider).toBe('google');
      expect(createdUser!.googleId).toBe(googlePayload.googleId);
      expect(createdUser!.emailVerifiedAt).toBeDefined();
      expect(createdUser!.status).toBe('active');
      expect(createdUser!.passwordHash).toBeNull();
    });

    it('should login existing Google user by googleId', async () => {
      const email = uniqueEmail();
      const googleId = `google-existing-${Date.now()}`;

      // First, create the user
      const firstResult = await GoogleAuthService.registerOrLoginWithGoogle(
        { googleId, email, name: 'Existing User', emailVerified: true },
        '127.0.0.1',
        'test-agent'
      );
      testUsers.push(firstResult.user.id);

      // Now login with same googleId
      const loginResult = await GoogleAuthService.registerOrLoginWithGoogle(
        { googleId, email, name: 'Existing User', emailVerified: true },
        '127.0.0.1',
        'test-agent'
      );

      expect(loginResult.accessToken).toBeDefined();
      expect(loginResult.user.id).toBe(firstResult.user.id);
      expect(loginResult.user.email).toBe(email);
    });

    it('should reject Google signup when email exists with email provider', async () => {
      const email = uniqueEmail();

      // Create an email-based user first
      const [emailUser] = await db.insert(users).values({
        email,
        fullName: 'Email User',
        authProvider: 'email',
        passwordHash: 'hashed-password',
        roleId: publicRoleId,
        status: 'active',
      }).returning();
      testUsers.push(emailUser.id);

      // Try Google signup with same email
      await expect(
        GoogleAuthService.registerOrLoginWithGoogle(
          { googleId: `google-conflict-${Date.now()}`, email, name: 'Conflict User', emailVerified: true },
          '127.0.0.1',
          'test-agent'
        )
      ).rejects.toMatchObject({
        code: 'AUTH_EMAIL_ONLY',
        statusCode: 409,
      });
    });

    it('should reject login for suspended Google user', async () => {
      const email = uniqueEmail();
      const googleId = `google-suspended-${Date.now()}`;

      // Create a suspended Google user
      const [suspendedUser] = await db.insert(users).values({
        email,
        fullName: 'Suspended Google User',
        authProvider: 'google',
        googleId,
        emailVerifiedAt: new Date(),
        roleId: publicRoleId,
        status: 'suspended',
      }).returning();
      testUsers.push(suspendedUser.id);

      await expect(
        GoogleAuthService.registerOrLoginWithGoogle(
          { googleId, email, name: 'Suspended User', emailVerified: true },
          '127.0.0.1',
          'test-agent'
        )
      ).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        statusCode: 403,
      });
    });

    it('should reject login for deactivated Google user', async () => {
      const email = uniqueEmail();
      const googleId = `google-deactivated-${Date.now()}`;

      const [deactivatedUser] = await db.insert(users).values({
        email,
        fullName: 'Deactivated Google User',
        authProvider: 'google',
        googleId,
        emailVerifiedAt: new Date(),
        roleId: publicRoleId,
        status: 'deactivated',
      }).returning();
      testUsers.push(deactivatedUser.id);

      await expect(
        GoogleAuthService.registerOrLoginWithGoogle(
          { googleId, email, name: 'Deactivated User', emailVerified: true },
          '127.0.0.1',
          'test-agent'
        )
      ).rejects.toMatchObject({
        code: 'AUTH_ACCOUNT_SUSPENDED',
        statusCode: 403,
      });
    });

    it('should set emailVerifiedAt immediately for new Google users', async () => {
      const email = uniqueEmail();
      const googlePayload = {
        googleId: `google-verified-${Date.now()}`,
        email,
        name: 'Verified User',
        emailVerified: true,
      };

      const result = await GoogleAuthService.registerOrLoginWithGoogle(
        googlePayload,
        '127.0.0.1',
        'test-agent'
      );
      testUsers.push(result.user.id);

      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.user.id),
      });

      expect(createdUser!.emailVerifiedAt).toBeDefined();
      expect(createdUser!.emailVerifiedAt).toBeInstanceOf(Date);
    });

    it('should set rememberMe session (30 days) for Google users', async () => {
      const email = uniqueEmail();
      const result = await GoogleAuthService.registerOrLoginWithGoogle(
        { googleId: `google-session-${Date.now()}`, email, name: 'Session User', emailVerified: true },
        '127.0.0.1',
        'test-agent'
      );
      testUsers.push(result.user.id);

      // Access token and refresh token should be returned
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.expiresIn).toBeDefined();
    });

    it('should create audit log entry for Google registration', async () => {
      const email = uniqueEmail();
      const result = await GoogleAuthService.registerOrLoginWithGoogle(
        { googleId: `google-audit-${Date.now()}`, email, name: 'Audit User', emailVerified: true },
        '127.0.0.1',
        'test-agent'
      );
      testUsers.push(result.user.id);

      // Check audit log
      const auditLog = await db.query.auditLogs.findFirst({
        where: eq(auditLogs.targetId, result.user.id),
      });
      expect(auditLog).toBeDefined();
      expect(auditLog!.action).toMatch(/auth\.google_/);
    });

    it('should use email prefix as fullName when Google name is empty', async () => {
      const email = uniqueEmail();
      const result = await GoogleAuthService.registerOrLoginWithGoogle(
        { googleId: `google-noname-${Date.now()}`, email, name: '', emailVerified: true },
        '127.0.0.1',
        'test-agent'
      );
      testUsers.push(result.user.id);

      const createdUser = await db.query.users.findFirst({
        where: eq(users.id, result.user.id),
      });

      expect(createdUser!.fullName).toBe(email.split('@')[0]);
    });
  });
});
