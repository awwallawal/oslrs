import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../../db/index.js';
import { magicLinkTokens, users, roles, lgas, respondents } from '../../db/schema/index.js';
import { eq, inArray, sql } from 'drizzle-orm';
import { hashPassword } from '@oslsr/utils';
import { MagicLinkService } from '../magic-link.service.js';
import { createHash } from 'node:crypto';

/**
 * Story 9-12 AC#6 — service-level tests for MagicLinkService.
 *
 * Real-DB integration tests. Verifies token issuance, single-use atomicity,
 * expiry handling, and per-purpose TTLs. Does NOT exercise the email send
 * path — failures there are swallowed by design (anti-enumeration), and
 * wiring is covered separately by route tests in `magic-link.routes.test.ts`.
 */

const TEST_EMAIL_PREFIX = `magic-link-test-${Date.now()}`;

describe('MagicLinkService', () => {
  // Hold ids we create so afterAll cleanup is targeted.
  const createdTokenIds: string[] = [];
  let testUserId: string;
  let testRespondentId: string;
  const testEmail = `${TEST_EMAIL_PREFIX}@example.com`;

  beforeAll(async () => {
    // Roles + super-admin user (for FK + audit).
    await db
      .insert(roles)
      .values([{ name: 'super_admin', description: 'Super Administrator' }])
      .onConflictDoNothing();

    const role = await db.query.roles.findFirst({ where: eq(roles.name, 'super_admin') });
    const hashedPw = await hashPassword('TestPass123!');

    const [user] = await db
      .insert(users)
      .values({
        email: testEmail,
        fullName: 'MagicLink Test User',
        phone: `0801${String(Date.now() % 10_000_000).padStart(7, '0')}`,
        roleId: role!.id,
        status: 'active',
        passwordHash: hashedPw,
      })
      .returning();
    testUserId = user.id;

    // A respondent for pending_nin_complete tests. Use a non-NIN respondent
    // (NIN nullable post Story 11-1) with status pending_nin_capture.
    // First we need an LGA for the FK; pick any existing one.
    const lga = await db.query.lgas.findFirst();
    if (!lga) throw new Error('No LGAs in test DB; seed first');
    const [respondent] = await db
      .insert(respondents)
      .values({
        lgaId: lga.id,
        firstName: 'MagicLink',
        lastName: 'Test Respondent',
        status: 'pending_nin_capture',
        source: 'public',
        consentMarketplace: false,
        consentEnriched: false,
      })
      .returning();
    testRespondentId = respondent.id;
  }, 30000);

  beforeEach(async () => {
    // Clean any tokens from prior tests in this run.
    if (createdTokenIds.length > 0) {
      await db.delete(magicLinkTokens).where(inArray(magicLinkTokens.id, createdTokenIds));
      createdTokenIds.length = 0;
    }
  });

  afterAll(async () => {
    // Targeted cleanup — never DROP tables.
    await db.delete(magicLinkTokens).where(eq(magicLinkTokens.email, testEmail));
    if (testRespondentId) await db.delete(respondents).where(eq(respondents.id, testRespondentId));
    if (testUserId) await db.delete(users).where(eq(users.id, testUserId));
  });

  describe('issueToken', () => {
    it('issues a base64url plaintext token of the expected length', async () => {
      const result = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(result.id);
      expect(result.tokenPlaintext).toMatch(/^[A-Za-z0-9_-]+$/); // base64url charset
      // 32 bytes → ceil(32 * 4/3) base64 chars = 43 (no padding for base64url).
      expect(result.tokenPlaintext.length).toBeGreaterThanOrEqual(40);
      expect(result.tokenPlaintext.length).toBeLessThanOrEqual(50);
    });

    it('persists SHA-256 hash, not plaintext', async () => {
      const result = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'login',
      });
      createdTokenIds.push(result.id);

      const expectedHash = createHash('sha256').update(result.tokenPlaintext).digest('hex');
      const row = await db.query.magicLinkTokens.findFirst({
        where: eq(magicLinkTokens.id, result.id),
      });

      expect(row).toBeDefined();
      expect(row!.tokenHash).toBe(expectedHash);
      // Critical: the plaintext must NEVER be findable in the row.
      expect(row!.tokenHash).not.toContain(result.tokenPlaintext);
    });

    it('sets per-purpose TTL: 72h for wizard_resume', async () => {
      const before = Date.now();
      const result = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(result.id);
      const ttlMs = result.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(72 * 60 * 60 * 1000 + 5000);
    });

    it('sets per-purpose TTL: 72h for pending_nin_complete', async () => {
      const before = Date.now();
      const result = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'pending_nin_complete',
        respondentId: testRespondentId,
      });
      createdTokenIds.push(result.id);
      const ttlMs = result.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(72 * 60 * 60 * 1000 - 1000);
    });

    it('sets per-purpose TTL: 15min for login', async () => {
      const before = Date.now();
      const result = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'login',
        userId: testUserId,
      });
      createdTokenIds.push(result.id);
      const ttlMs = result.expiresAt.getTime() - before;
      expect(ttlMs).toBeGreaterThanOrEqual(15 * 60 * 1000 - 1000);
      expect(ttlMs).toBeLessThanOrEqual(15 * 60 * 1000 + 5000);
    });

    it('produces fresh plaintext on each call', async () => {
      const a = await MagicLinkService.issueToken({ email: testEmail, purpose: 'login' });
      const b = await MagicLinkService.issueToken({ email: testEmail, purpose: 'login' });
      createdTokenIds.push(a.id, b.id);
      expect(a.tokenPlaintext).not.toBe(b.tokenPlaintext);
    });

    it('throws actionable error when email is missing', async () => {
      await expect(
        MagicLinkService.issueToken({ email: '', purpose: 'login' }),
      ).rejects.toThrow(/email is required/i);
    });

    it('lowercases the email at storage', async () => {
      const result = await MagicLinkService.issueToken({
        email: 'MIXED-Case@Example.COM',
        purpose: 'login',
      });
      createdTokenIds.push(result.id);
      const row = await db.query.magicLinkTokens.findFirst({
        where: eq(magicLinkTokens.id, result.id),
      });
      expect(row!.email).toBe('mixed-case@example.com');
    });
  });

  describe('redeemToken', () => {
    it('successfully redeems a fresh token and marks it used', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(issued.id);

      const redeemed = await MagicLinkService.redeemToken({
        plaintext: issued.tokenPlaintext,
        purpose: 'wizard_resume',
      });

      expect(redeemed.id).toBe(issued.id);
      expect(redeemed.usedAt).not.toBeNull();
      expect(redeemed.email).toBe(testEmail);
    });

    it('rejects on second redemption attempt (single-use)', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(issued.id);

      await MagicLinkService.redeemToken({
        plaintext: issued.tokenPlaintext,
        purpose: 'wizard_resume',
      });

      await expect(
        MagicLinkService.redeemToken({
          plaintext: issued.tokenPlaintext,
          purpose: 'wizard_resume',
        }),
      ).rejects.toThrow(/already been used/i);
    });

    it('rejects on purpose mismatch', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(issued.id);

      await expect(
        MagicLinkService.redeemToken({
          plaintext: issued.tokenPlaintext,
          purpose: 'login', // wrong purpose
        }),
      ).rejects.toThrow(/invalid|unknown/i);
    });

    it('rejects on unknown plaintext (no DB row)', async () => {
      await expect(
        MagicLinkService.redeemToken({
          plaintext: 'not-a-real-token-' + Date.now(),
          purpose: 'login',
        }),
      ).rejects.toThrow(/invalid|unknown/i);
    });

    it('rejects on expired token', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'login',
      });
      createdTokenIds.push(issued.id);

      // Force expiry in the past.
      await db
        .update(magicLinkTokens)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(magicLinkTokens.id, issued.id));

      await expect(
        MagicLinkService.redeemToken({
          plaintext: issued.tokenPlaintext,
          purpose: 'login',
        }),
      ).rejects.toThrow(/expired/i);
    });

    it('rejects when token is missing or empty', async () => {
      await expect(
        MagicLinkService.redeemToken({ plaintext: '', purpose: 'login' }),
      ).rejects.toThrow(/missing|empty/i);
    });
  });

  describe('revokeToken', () => {
    it('marks an unused token as used (idempotent)', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'login',
      });
      createdTokenIds.push(issued.id);

      await MagicLinkService.revokeToken(issued.id);
      // Idempotency: second revoke is a no-op.
      await MagicLinkService.revokeToken(issued.id);

      const row = await db.query.magicLinkTokens.findFirst({
        where: eq(magicLinkTokens.id, issued.id),
      });
      expect(row!.usedAt).not.toBeNull();
    });

    it('redemption fails after revoke', async () => {
      const issued = await MagicLinkService.issueToken({
        email: testEmail,
        purpose: 'wizard_resume',
      });
      createdTokenIds.push(issued.id);

      await MagicLinkService.revokeToken(issued.id);

      await expect(
        MagicLinkService.redeemToken({
          plaintext: issued.tokenPlaintext,
          purpose: 'wizard_resume',
        }),
      ).rejects.toThrow(/already been used/i);
    });
  });

  describe('buildMagicLinkUrl', () => {
    it('produces a URL with token + purpose query params', () => {
      const url = MagicLinkService.buildMagicLinkUrl('test-plaintext', 'wizard_resume');
      const parsed = new URL(url);
      expect(parsed.pathname).toBe('/auth/magic');
      expect(parsed.searchParams.get('token')).toBe('test-plaintext');
      expect(parsed.searchParams.get('purpose')).toBe('wizard_resume');
    });
  });
});
