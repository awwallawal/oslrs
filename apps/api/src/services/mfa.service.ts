/**
 * MFA Service — Story 9-13.
 *
 * TOTP enrollment + verification + backup-code redemption + login-step-2 challenge tokens
 * for super_admin accounts. Backed by `users.mfa_*` columns and `user_backup_codes`.
 *
 * Per Story 9-13 Tech Notes:
 * - `otplib` chosen over speakeasy (actively maintained as of 2026)
 * - RFC 6238 ±1-step (30s) skew tolerance — load-bearing on systemd-timesyncd
 * - Replay protection via Redis SET NX EX 30 (atomic, second writer rejected)
 * - Per-user lockout via Redis INCR + EXPIRE 900 → 5 strikes in 15 min triggers
 *   `users.mfa_locked_until = NOW() + 15 min`
 * - mfa_secret stored plaintext in Phase 1; TODO(9-9) backfill encryption when
 *   AES-256 helper from Story 9-9 AC#5 lands. Do NOT invent an ad-hoc helper.
 */

import { authenticator } from 'otplib';
import qrcode from 'qrcode';
import crypto from 'node:crypto';
import { hashPassword, comparePassword, AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users, userBackupCodes } from '../db/schema/index.js';
import { eq, and, sql } from 'drizzle-orm';
import { getRedisClient } from '../lib/redis.js';
import pino from 'pino';

const logger = pino({ name: 'mfa-service' });

// ---------------------------------------------------------------------------
// Constants — keep aligned with Story 9-13 ACs
// ---------------------------------------------------------------------------

export const MFA_ISSUER = 'OSLRS';
export const BACKUP_CODE_COUNT = 8;
export const BACKUP_CODE_LENGTH = 10; // 10-digit numeric

const REPLAY_TTL_SECONDS = 30; // matches TOTP step
const FAIL_WINDOW_SECONDS = 15 * 60; // 15 min sliding window
const FAIL_THRESHOLD = 5; // 5 failures within window → lockout
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 min
const CHALLENGE_TTL_SECONDS = 5 * 60; // 5 min

// Replay key hashes the code rather than embedding it (F7 — defence-in-depth
// against Redis log inspection / debug-session leakage of plaintext TOTP codes).
// 16 hex chars (64 bits) is plenty of entropy for a 6-digit code's collision
// space and keeps Redis keys short. Prefer this over storing the code directly.
const hashCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex').slice(0, 16);

const REPLAY_KEY = (userId: string, code: string) => `mfa:replay:${userId}:${hashCode(code)}`;
const FAIL_KEY = (userId: string) => `mfa:fail:${userId}`;
const CHALLENGE_KEY = (token: string) => `mfa:challenge:${token}`;

// Configure otplib globally — RFC 6238 + ±1-step skew + 6-digit codes
authenticator.options = {
  step: 30,
  window: 1,
  digits: 6,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EnrollmentResult {
  secret: string;
  provisioningUri: string;
  qrCodeDataUri: string;
  /** Plaintext — returned ONCE; persisted as bcrypt hashes. */
  backupCodes: string[];
}

export interface ChallengePayload {
  userId: string;
  email: string;
  exp: number;
  rememberMe: boolean;
}

// ---------------------------------------------------------------------------
// MFA Service
// ---------------------------------------------------------------------------

export class MfaService {
  /**
   * Generate a fresh TOTP secret + 8 backup codes for an authenticated user.
   *
   * Side effects:
   *   - Sets `users.mfa_secret` (also clears any prior secret for re-enrollment).
   *   - Replaces `user_backup_codes` rows for this user (any old unused codes purged).
   *   - Does NOT flip `mfa_enabled` — that happens on first successful verify.
   *
   * Returns plaintext backup codes ONCE; caller must surface them to the user
   * and never persist them anywhere else.
   */
  static async enrollSecret(userId: string, email: string): Promise<EnrollmentResult> {
    const secret = authenticator.generateSecret();
    const provisioningUri = authenticator.keyuri(email, MFA_ISSUER, secret);
    const qrCodeDataUri = await qrcode.toDataURL(provisioningUri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
    });

    const backupCodes = MfaService.generateBackupCodes();
    const codeHashes = await Promise.all(backupCodes.map((c) => hashPassword(c)));

    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ mfaSecret: secret, updatedAt: new Date() })
        .where(eq(users.id, userId));

      // Purge prior codes (covers re-enrollment path — old unused codes must be invalidated).
      await tx.delete(userBackupCodes).where(eq(userBackupCodes.userId, userId));

      await tx.insert(userBackupCodes).values(
        codeHashes.map((codeHash) => ({
          userId,
          codeHash,
        })),
      );
    });

    logger.info({ event: 'mfa.enroll_started', userId });

    return { secret, provisioningUri, qrCodeDataUri, backupCodes };
  }

  /**
   * Throws `MFA_LOCKED_OUT` if the user is currently inside their lockout window.
   * Lightweight precheck — controllers can call this before prompting the user
   * for a code to surface the lockout deadline up-front.
   */
  static async checkRateLimit(userId: string): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      throw new AppError('MFA_NOT_ENROLLED', 'MFA is not enrolled for this account', 400);
    }
    if (user.mfaLockedUntil && new Date() < new Date(user.mfaLockedUntil)) {
      throw new AppError(
        'MFA_LOCKED_OUT',
        'Too many failed MFA attempts. Try again later.',
        429,
        { lockedUntil: user.mfaLockedUntil },
      );
    }
  }

  /**
   * Verify a 6-digit TOTP code against a user's stored secret.
   *
   * Throws on:
   *   - User not found OR no secret (`MFA_NOT_ENROLLED`)
   *   - User currently locked out (`MFA_LOCKED_OUT`)
   *   - Code already redeemed within its 30s window (`MFA_REPLAY_REJECTED`)
   *   - Code invalid (`MFA_INVALID_CODE`) — increments fail counter
   *
   * On success: clears the per-user fail counter. The caller decides what to
   * do with that success (flip `mfa_enabled`, mint JWT, etc.).
   */
  static async verifyCode(userId: string, code: string): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user || !user.mfaSecret) {
      throw new AppError('MFA_NOT_ENROLLED', 'MFA is not enrolled for this account', 400);
    }

    if (user.mfaLockedUntil && new Date() < new Date(user.mfaLockedUntil)) {
      throw new AppError(
        'MFA_LOCKED_OUT',
        'Too many failed MFA attempts. Try again later.',
        429,
        { lockedUntil: user.mfaLockedUntil },
      );
    }

    // Replay guard: SET NX EX 30 — atomic, second writer rejected.
    const redis = getRedisClient();
    const replayKey = REPLAY_KEY(userId, code);
    const claimed = await redis.set(replayKey, '1', 'EX', REPLAY_TTL_SECONDS, 'NX');
    if (claimed !== 'OK') {
      throw new AppError(
        'MFA_REPLAY_REJECTED',
        'This code was already used. Wait for the next code.',
        401,
      );
    }

    const valid = authenticator.check(code, user.mfaSecret);
    if (!valid) {
      await MfaService.recordFailure(userId);
      throw new AppError('MFA_INVALID_CODE', 'Invalid MFA code', 401);
    }

    // Success — clear fail counter
    await redis.del(FAIL_KEY(userId));
  }

  /**
   * Mark MFA as enrolled for a user (after a successful enrollment-context verify).
   * Idempotent — safe to call when already true.
   */
  static async finalizeEnrollment(userId: string): Promise<void> {
    await db
      .update(users)
      .set({ mfaEnabled: true, updatedAt: new Date() })
      .where(eq(users.id, userId));
    logger.info({ event: 'mfa.enrollment_finalized', userId });
  }

  /**
   * Atomic backup-code redemption. Race-safe: two simultaneous requests for the
   * same code → only one wins (the UPDATE filters on `used_at IS NULL`).
   *
   * Returns the number of unused backup codes remaining for this user AFTER
   * redemption (so the caller can render "X codes left" UX).
   *
   * Throws `MFA_INVALID_BACKUP_CODE` if the code does not match any unused row,
   * or `MFA_LOCKED_OUT` if user is currently locked out.
   */
  static async redeemBackupCode(userId: string, code: string): Promise<{ remaining: number }> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });
    if (!user) {
      throw new AppError('MFA_NOT_ENROLLED', 'MFA is not enrolled for this account', 400);
    }
    if (user.mfaLockedUntil && new Date() < new Date(user.mfaLockedUntil)) {
      throw new AppError(
        'MFA_LOCKED_OUT',
        'Too many failed MFA attempts. Try again later.',
        429,
        { lockedUntil: user.mfaLockedUntil },
      );
    }

    // Pull all unused codes for this user; bcrypt verify each (small N=8, OK).
    const unused = await db
      .select()
      .from(userBackupCodes)
      .where(and(eq(userBackupCodes.userId, userId), sql`${userBackupCodes.usedAt} IS NULL`));

    let matchedId: string | null = null;
    for (const row of unused) {
      if (await comparePassword(code, row.codeHash)) {
        matchedId = row.id;
        break;
      }
    }

    if (!matchedId) {
      await MfaService.recordFailure(userId);
      throw new AppError('MFA_INVALID_BACKUP_CODE', 'Invalid backup code', 401);
    }

    // Atomic redemption — race-safe
    const redeemed = await db.execute(sql`
      UPDATE user_backup_codes
         SET used_at = NOW()
       WHERE id = ${matchedId}
         AND used_at IS NULL
       RETURNING id
    `);

    if (redeemed.rows.length === 0) {
      // Lost the race — another request consumed this code first. Use a
      // distinct error code (F6) so the controller can audit/log it differently
      // and so frontend doesn't increment "wrong code" UX state for what was
      // actually a valid code being beat-to-it.
      throw new AppError(
        'MFA_BACKUP_RACE_LOST',
        'This backup code was just used by another request. Please try a different backup code.',
        409,
      );
    }

    // Count remaining unused
    const remainingRow = await db.execute(sql`
      SELECT COUNT(*)::int AS remaining
        FROM user_backup_codes
       WHERE user_id = ${userId}
         AND used_at IS NULL
    `);
    const remaining = (remainingRow.rows[0] as { remaining: number } | undefined)?.remaining ?? 0;

    // Clear fail counter on success
    await getRedisClient().del(FAIL_KEY(userId));

    return { remaining };
  }

  /**
   * Disable MFA for a user.
   * Clears mfa_secret, deletes all backup codes, sets mfa_enabled=false,
   * leaves grace_until untouched (caller may reset separately if needed).
   */
  static async disableMfa(userId: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          mfaEnabled: false,
          mfaSecret: null,
          mfaLockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await tx.delete(userBackupCodes).where(eq(userBackupCodes.userId, userId));
    });

    // Clear any cached fail counter
    await getRedisClient().del(FAIL_KEY(userId));

    logger.info({ event: 'mfa.disabled', userId });
  }

  /**
   * Regenerate the 8 backup codes. Old codes are deleted in the same
   * transaction so a stolen old code cannot be used after regeneration.
   * Returns plaintext codes ONCE.
   */
  static async regenerateBackupCodes(userId: string): Promise<string[]> {
    const codes = MfaService.generateBackupCodes();
    const codeHashes = await Promise.all(codes.map((c) => hashPassword(c)));

    await db.transaction(async (tx) => {
      await tx.delete(userBackupCodes).where(eq(userBackupCodes.userId, userId));
      await tx.insert(userBackupCodes).values(codeHashes.map((codeHash) => ({ userId, codeHash })));
    });

    logger.info({ event: 'mfa.codes_regenerated', userId });
    return codes;
  }

  // ---------------------------------------------------------------------------
  // Login step-2 challenge tokens (Redis-backed, EX=300)
  // ---------------------------------------------------------------------------

  static async mintChallengeToken(payload: { userId: string; email: string; rememberMe: boolean }): Promise<string> {
    const token = crypto.randomBytes(32).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + CHALLENGE_TTL_SECONDS;
    const data: ChallengePayload = {
      userId: payload.userId,
      email: payload.email,
      exp,
      rememberMe: payload.rememberMe,
    };
    await getRedisClient().set(CHALLENGE_KEY(token), JSON.stringify(data), 'EX', CHALLENGE_TTL_SECONDS);
    return token;
  }

  static async consumeChallengeToken(token: string): Promise<ChallengePayload | null> {
    const redis = getRedisClient();
    const raw = await redis.get(CHALLENGE_KEY(token));
    if (!raw) return null;
    // Single-use: delete on consume (matches reset-token / OTP single-use semantics).
    await redis.del(CHALLENGE_KEY(token));
    try {
      return JSON.parse(raw) as ChallengePayload;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Failure tracking (per-user lockout)
  // ---------------------------------------------------------------------------

  /**
   * INCR the per-user fail counter. On 5th failure within window, set
   * `users.mfa_locked_until = NOW() + 15 min` and return the count.
   * Caller catches the audit emission ('mfa.lockout') for the threshold-tripping case.
   */
  static async recordFailure(userId: string): Promise<{ count: number; lockedOut: boolean }> {
    const redis = getRedisClient();
    const key = FAIL_KEY(userId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, FAIL_WINDOW_SECONDS);
    }

    let lockedOut = false;
    if (count >= FAIL_THRESHOLD) {
      const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      await db
        .update(users)
        .set({ mfaLockedUntil: lockedUntil, updatedAt: new Date() })
        .where(eq(users.id, userId));
      lockedOut = true;
      // Reset counter so post-lockout-expiry attempts don't carry old strikes.
      await redis.del(key);
      logger.warn({ event: 'mfa.lockout', userId, lockedUntil });
    }

    return { count, lockedOut };
  }

  // ---------------------------------------------------------------------------
  // Backup code generation — 10-digit numeric, evenly distributed
  // ---------------------------------------------------------------------------

  static generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
      codes.push(MfaService.generateBackupCode());
    }
    return codes;
  }

  static generateBackupCode(): string {
    // 10-digit numeric. Bias-free: rejection-sample to keep distribution flat.
    let result = '';
    while (result.length < BACKUP_CODE_LENGTH) {
      const buf = crypto.randomBytes(1);
      const n = buf[0];
      // 250 = floor(255/10)*10 — values >= 250 introduce bias, drop them
      if (n < 250) {
        result += String(n % 10);
      }
    }
    return result;
  }
}
