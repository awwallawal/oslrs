/**
 * MFA Service tests — Story 9-13.
 *
 * Integration-style: real Postgres + real Redis (matches the project pattern in
 * google-auth.service.test.ts). Pre-requisite: `pnpm --filter @oslsr/api db:push:force`
 * has been run so `users.mfa_*` columns and `user_backup_codes` table exist.
 *
 * Coverage:
 *   - Backup code format + uniqueness
 *   - Provisioning URI conformance (RFC 6238)
 *   - Enrollment persists secret + 8 hashed codes
 *   - verifyCode happy path + replay rejection + invalid + locked-out
 *   - recordFailure threshold tripping → mfa_locked_until
 *   - redeemBackupCode atomic race-safety + remaining counter
 *   - mintChallengeToken / consumeChallengeToken single-use
 *   - disableMfa clears secret + codes
 *   - regenerateBackupCodes invalidates old codes
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { authenticator } from 'otplib';
import { db } from '../../db/index.js';
import { users, roles, userBackupCodes, auditLogs } from '../../db/schema/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { MfaService, BACKUP_CODE_COUNT, BACKUP_CODE_LENGTH, MFA_ISSUER } from '../mfa.service.js';
import { getRedisClient } from '../../lib/redis.js';
import { randomInt } from 'crypto';

const testUsers: string[] = [];
const uniqueEmail = () => `test-mfa-${Date.now()}-${randomInt(10000)}@example.com`;

async function createSuperAdminUser(email: string): Promise<string> {
  // Ensure super_admin role exists
  await db.insert(roles).values({ name: 'super_admin', description: 'Super Admin' }).onConflictDoNothing();
  const role = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
  const passwordHash = await hashPassword('TestPassword123!');
  const [user] = await db
    .insert(users)
    .values({
      email,
      fullName: 'Test MFA User',
      passwordHash,
      roleId: role!.id,
      status: 'active',
    })
    .returning();
  testUsers.push(user.id);
  return user.id;
}

describe('MfaService', () => {
  beforeAll(async () => {
    // Sanity check that schema is applied — fail fast with a useful message if not.
    try {
      await db.select().from(userBackupCodes).limit(1);
    } catch (err) {
      throw new Error(
        `user_backup_codes table missing — run 'pnpm --filter @oslsr/api db:push:force' before testing. (${(err as Error).message})`,
      );
    }
  });

  afterAll(async () => {
    if (testUsers.length === 0) return;
    await db.transaction(async (tx) => {
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs DISABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
      await tx.delete(auditLogs).where(inArray(auditLogs.actorId, testUsers));
      await tx.delete(userBackupCodes).where(inArray(userBackupCodes.userId, testUsers));
      await tx.delete(users).where(inArray(users.id, testUsers));
      await tx.execute(sql`DO $$ BEGIN ALTER TABLE audit_logs ENABLE TRIGGER trg_audit_logs_immutable; EXCEPTION WHEN undefined_object THEN NULL; END $$`);
    });
  });

  beforeEach(async () => {
    // Test mode runs with isTestMode() true so login-rate-limit skips, but the
    // mfa.service uses Redis directly (replay/lockout/challenge keys). Make sure
    // we start each test with no leftover keys for deterministic behaviour.
    const redis = getRedisClient();
    const keys = await redis.keys('mfa:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  describe('generateBackupCode', () => {
    it('produces a 10-digit numeric string', () => {
      const code = MfaService.generateBackupCode();
      expect(code).toMatch(/^\d{10}$/);
      expect(code.length).toBe(BACKUP_CODE_LENGTH);
    });

    it('digit distribution is roughly even (no obvious bias)', () => {
      const counts = new Array(10).fill(0);
      for (let i = 0; i < 1000; i++) {
        const code = MfaService.generateBackupCode();
        for (const ch of code) counts[parseInt(ch, 10)]++;
      }
      // Every digit should appear at least 5% of the time across 10000 samples
      // (uniform = 10%; tolerance loose to avoid flakes).
      for (const c of counts) {
        expect(c).toBeGreaterThan(500);
      }
    });
  });

  describe('generateBackupCodes', () => {
    it('produces 8 unique codes', () => {
      const codes = MfaService.generateBackupCodes();
      expect(codes).toHaveLength(BACKUP_CODE_COUNT);
      expect(new Set(codes).size).toBe(BACKUP_CODE_COUNT);
    });
  });

  describe('enrollSecret', () => {
    it('persists secret and 8 hashed backup codes; returns plaintext codes', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const result = await MfaService.enrollSecret(userId, 'enroll@example.com');

      expect(result.secret).toMatch(/^[A-Z2-7]+$/); // base32
      expect(result.qrCodeDataUri).toMatch(/^data:image\/png;base64,/);
      expect(result.backupCodes).toHaveLength(BACKUP_CODE_COUNT);
      expect(result.backupCodes.every((c) => /^\d{10}$/.test(c))).toBe(true);

      // Provisioning URI must conform to RFC 6238 / Google Authenticator format.
      expect(result.provisioningUri).toContain('otpauth://totp/');
      expect(result.provisioningUri).toContain(`issuer=${MFA_ISSUER}`);
      expect(result.provisioningUri).toContain('secret=');

      // Secret persisted on the user row
      const fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaSecret).toBe(result.secret);
      expect(fresh?.mfaEnabled).toBe(false); // not flipped until first verify

      // 8 backup-code rows persisted; each code_hash is a bcrypt string (length > 50).
      const persisted = await db.select().from(userBackupCodes).where(eq(userBackupCodes.userId, userId));
      expect(persisted).toHaveLength(BACKUP_CODE_COUNT);
      expect(persisted.every((p) => p.codeHash.length > 50)).toBe(true);
      expect(persisted.every((p) => p.usedAt === null)).toBe(true);
    });

    it('replaces prior secret + codes on re-enrollment', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'first@example.com');
      const second = await MfaService.enrollSecret(userId, 'second@example.com');

      const stored = await db.select().from(userBackupCodes).where(eq(userBackupCodes.userId, userId));
      expect(stored).toHaveLength(BACKUP_CODE_COUNT);
      const fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaSecret).toBe(second.secret);
    });
  });

  describe('verifyCode', () => {
    it('throws MFA_NOT_ENROLLED when user has no secret', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await expect(MfaService.verifyCode(userId, '123456')).rejects.toMatchObject({
        code: 'MFA_NOT_ENROLLED',
      });
    });

    it('accepts a valid current TOTP code and clears the fail counter', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const enrollment = await MfaService.enrollSecret(userId, 'verify@example.com');
      const code = authenticator.generate(enrollment.secret);

      await expect(MfaService.verifyCode(userId, code)).resolves.toBeUndefined();

      // Fail counter should be cleared
      const redis = getRedisClient();
      const counter = await redis.get(`mfa:fail:${userId}`);
      expect(counter).toBeNull();
    });

    it('rejects a replay of the same code in the same window', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const enrollment = await MfaService.enrollSecret(userId, 'replay@example.com');
      const code = authenticator.generate(enrollment.secret);

      await MfaService.verifyCode(userId, code);
      await expect(MfaService.verifyCode(userId, code)).rejects.toMatchObject({
        code: 'MFA_REPLAY_REJECTED',
      });
    });

    it('rejects an invalid code with MFA_INVALID_CODE', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'invalid@example.com');
      await expect(MfaService.verifyCode(userId, '000000')).rejects.toMatchObject({
        code: 'MFA_INVALID_CODE',
      });
    });

    it('rejects when user is currently locked out (MFA_LOCKED_OUT)', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'lock@example.com');
      await db
        .update(users)
        .set({ mfaLockedUntil: new Date(Date.now() + 60_000) })
        .where(eq(users.id, userId));

      await expect(MfaService.verifyCode(userId, '123456')).rejects.toMatchObject({
        code: 'MFA_LOCKED_OUT',
        statusCode: 429,
      });
    });
  });

  describe('recordFailure / lockout', () => {
    it('sets mfa_locked_until on the 5th failure within the window', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'lockout@example.com');

      // F24 (code-review 2026-05-02): each wrong attempt MUST be a distinct
      // code because F7's replay-protection (sha256 of code stored in Redis
      // with EX 30) rejects the SAME code's second submission with
      // MFA_REPLAY_REJECTED instead of MFA_INVALID_CODE. Original test used
      // '111111' four times then '222222' which only registered as 1+1=2
      // failures (replay-rejected attempts don't increment the lockout
      // counter), so the 5th-failure threshold was never hit.
      const wrongCodes = ['111111', '222222', '333333', '444444', '555555'];

      // 4 wrong (distinct) attempts — should NOT lock.
      for (let i = 0; i < 4; i++) {
        await expect(MfaService.verifyCode(userId, wrongCodes[i])).rejects.toMatchObject({
          code: 'MFA_INVALID_CODE',
        });
      }
      let fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaLockedUntil).toBeNull();

      // 5th wrong attempt (distinct code) trips the lockout
      await expect(MfaService.verifyCode(userId, wrongCodes[4])).rejects.toMatchObject({
        code: 'MFA_INVALID_CODE',
      });
      fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaLockedUntil).not.toBeNull();
      expect(new Date(fresh!.mfaLockedUntil!).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('finalizeEnrollment', () => {
    it('flips mfa_enabled = true', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'final@example.com');
      await MfaService.finalizeEnrollment(userId);
      const fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaEnabled).toBe(true);
    });
  });

  describe('redeemBackupCode', () => {
    it('redeems a valid backup code, marks it used, returns remaining count', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const { backupCodes } = await MfaService.enrollSecret(userId, 'redeem@example.com');

      const result = await MfaService.redeemBackupCode(userId, backupCodes[0]);
      expect(result.remaining).toBe(BACKUP_CODE_COUNT - 1);

      // Same code cannot be redeemed twice
      await expect(MfaService.redeemBackupCode(userId, backupCodes[0])).rejects.toMatchObject({
        code: 'MFA_INVALID_BACKUP_CODE',
      });
    });

    it('rejects an invalid backup code', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'wrongbk@example.com');
      await expect(MfaService.redeemBackupCode(userId, '0000000000')).rejects.toMatchObject({
        code: 'MFA_INVALID_BACKUP_CODE',
      });
    });

    it('only one of two simultaneous redemption attempts wins', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const { backupCodes } = await MfaService.enrollSecret(userId, 'race@example.com');

      const [a, b] = await Promise.allSettled([
        MfaService.redeemBackupCode(userId, backupCodes[0]),
        MfaService.redeemBackupCode(userId, backupCodes[0]),
      ]);
      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
      const rejected = [a, b].filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
    });
  });

  describe('challenge tokens', () => {
    it('mintChallengeToken → consumeChallengeToken roundtrips', async () => {
      const token = await MfaService.mintChallengeToken({
        userId: 'user-abc',
        email: 'cha@example.com',
        rememberMe: true,
      });
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url

      const payload = await MfaService.consumeChallengeToken(token);
      expect(payload).toMatchObject({
        userId: 'user-abc',
        email: 'cha@example.com',
        rememberMe: true,
      });
    });

    it('challenge tokens are single-use', async () => {
      const token = await MfaService.mintChallengeToken({
        userId: 'user-xyz',
        email: 'one@example.com',
        rememberMe: false,
      });
      await MfaService.consumeChallengeToken(token);
      const second = await MfaService.consumeChallengeToken(token);
      expect(second).toBeNull();
    });

    it('returns null for unknown challenge tokens', async () => {
      const result = await MfaService.consumeChallengeToken('not-a-real-token');
      expect(result).toBeNull();
    });
  });

  describe('disableMfa', () => {
    it('clears secret, deletes backup codes, sets mfa_enabled=false', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await MfaService.enrollSecret(userId, 'disable@example.com');
      await MfaService.finalizeEnrollment(userId);

      await MfaService.disableMfa(userId);
      const fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
      expect(fresh?.mfaEnabled).toBe(false);
      expect(fresh?.mfaSecret).toBeNull();

      const remaining = await db.select().from(userBackupCodes).where(eq(userBackupCodes.userId, userId));
      expect(remaining).toHaveLength(0);
    });
  });

  describe('regenerateBackupCodes', () => {
    it('replaces the 8 backup codes; old codes no longer valid', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      const first = await MfaService.enrollSecret(userId, 'regen@example.com');
      const newCodes = await MfaService.regenerateBackupCodes(userId);

      expect(newCodes).toHaveLength(BACKUP_CODE_COUNT);
      expect(new Set(newCodes).size).toBe(BACKUP_CODE_COUNT);

      // Old codes should NOT redeem
      await expect(MfaService.redeemBackupCode(userId, first.backupCodes[0])).rejects.toMatchObject({
        code: 'MFA_INVALID_BACKUP_CODE',
      });
      // New codes should redeem
      const result = await MfaService.redeemBackupCode(userId, newCodes[0]);
      expect(result.remaining).toBe(BACKUP_CODE_COUNT - 1);
    });
  });

  describe('checkRateLimit', () => {
    it('throws MFA_LOCKED_OUT inside the lockout window', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await db
        .update(users)
        .set({ mfaLockedUntil: new Date(Date.now() + 60_000) })
        .where(eq(users.id, userId));

      await expect(MfaService.checkRateLimit(userId)).rejects.toMatchObject({
        code: 'MFA_LOCKED_OUT',
      });
    });

    it('passes outside the lockout window', async () => {
      const userId = await createSuperAdminUser(uniqueEmail());
      await db
        .update(users)
        .set({ mfaLockedUntil: new Date(Date.now() - 60_000) })
        .where(eq(users.id, userId));

      await expect(MfaService.checkRateLimit(userId)).resolves.toBeUndefined();
    });
  });
});
