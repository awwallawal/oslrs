/**
 * MFA Controller — Story 9-13.
 *
 * Endpoints (mounted under `/auth/*` in `auth.routes.ts`):
 *
 *   POST /auth/mfa/enroll              authenticated + fresh re-auth
 *   POST /auth/mfa/verify              authenticated (also flips mfa_enabled on first success)
 *   POST /auth/mfa/disable             authenticated + fresh re-auth + current TOTP
 *   POST /auth/mfa/regenerate-codes    authenticated + fresh re-auth + current TOTP
 *   POST /auth/login/mfa               UNAUTH — challenge_token + totp_code
 *   POST /auth/login/mfa-backup        UNAUTH — challenge_token + backup_code
 *
 * Audit events emitted via `AuditService.logAction` (fire-and-forget) per AC#8.
 * IP read from `req.ip` after `realIpMiddleware` (CF-Connecting-IP-aware).
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { MfaService } from '../services/mfa.service.js';
import { AuthService } from '../services/auth.service.js';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'mfa-controller' });

// Cookie configuration — must match auth.controller.ts so the cookie can be
// read/cleared by either controller.
const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const totpCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

// (F18 — code-review 2026-05-02: removed dead `backupCodeSchema` that wasn't
// referenced by any handler. The login-step-2-backup path uses
// `loginMfaBackupSchema` below, which already includes the 10-digit regex.)

const loginMfaSchema = z.object({
  mfaChallengeToken: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

const loginMfaBackupSchema = z.object({
  mfaChallengeToken: z.string().min(1),
  code: z.string().regex(/^\d{10}$/, 'Backup code must be 10 digits'),
});

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export class MfaController {
  /**
   * POST /auth/mfa/enroll — generate fresh secret + 8 backup codes.
   * Returns plaintext backup codes ONCE.
   */
  static async enroll(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);

      const user = await db.query.users.findFirst({ where: eq(users.id, req.user.sub) });
      if (!user) throw new AppError('AUTH_REQUIRED', 'User not found', 401);

      const enrollment = await MfaService.enrollSecret(user.id, user.email);

      AuditService.logAction({
        actorId: user.id,
        action: AUDIT_ACTIONS.MFA_ENROLLED,
        targetResource: 'users',
        targetId: user.id,
        details: { event: 'enrollment_started' },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.status(200).json({
        data: {
          secret: enrollment.secret,
          provisioningUri: enrollment.provisioningUri,
          qrCodeDataUri: enrollment.qrCodeDataUri,
          backupCodes: enrollment.backupCodes,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/mfa/verify — authenticated TOTP verification.
   * If user.mfa_enabled was false, flips it to true (post-enrollment confirmation).
   */
  static async verify(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);

      const validation = totpCodeSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: validation.error.errors,
        });
      }

      const userId = req.user.sub;
      const ipAddress = req.ip || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const userBefore = await db.query.users.findFirst({ where: eq(users.id, userId) });
      const wasEnabled = userBefore?.mfaEnabled === true;

      try {
        await MfaService.verifyCode(userId, validation.data.code);
      } catch (err) {
        if (err instanceof AppError && err.code === 'MFA_INVALID_CODE') {
          AuditService.logAction({
            actorId: userId,
            action: AUDIT_ACTIONS.MFA_VERIFY_FAILURE,
            targetResource: 'users',
            targetId: userId,
            details: { context: 'authenticated_verify' },
            ipAddress,
            userAgent,
          });
          // recordFailure already incremented; emit lockout audit if it tripped
          const fresh = await db.query.users.findFirst({ where: eq(users.id, userId) });
          if (fresh?.mfaLockedUntil && new Date() < new Date(fresh.mfaLockedUntil)) {
            AuditService.logAction({
              actorId: userId,
              action: AUDIT_ACTIONS.MFA_LOCKOUT,
              targetResource: 'users',
              targetId: userId,
              details: { lockedUntil: fresh.mfaLockedUntil },
              ipAddress,
              userAgent,
            });
          }
        }
        throw err;
      }

      // First successful verify post-enrollment → flip mfa_enabled = true
      if (!wasEnabled) {
        await MfaService.finalizeEnrollment(userId);
        AuditService.logAction({
          actorId: userId,
          action: AUDIT_ACTIONS.MFA_ENROLLED,
          targetResource: 'users',
          targetId: userId,
          details: { event: 'enrollment_completed' },
          ipAddress,
          userAgent,
        });
      }

      AuditService.logAction({
        actorId: userId,
        action: AUDIT_ACTIONS.MFA_VERIFY_SUCCESS,
        targetResource: 'users',
        targetId: userId,
        details: { context: 'authenticated_verify' },
        ipAddress,
        userAgent,
      });

      res.status(200).json({
        data: { ok: true, mfaEnabled: true },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/login/mfa — login step-2 with TOTP.
   * Consumes challenge token, verifies TOTP, issues JWT + refresh cookie.
   */
  static async loginMfa(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = loginMfaSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: validation.error.errors,
        });
      }

      const ipAddress = req.ip || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const payload = await MfaService.consumeChallengeToken(validation.data.mfaChallengeToken);
      if (!payload) {
        throw new AppError(
          'MFA_CHALLENGE_INVALID',
          'Your login session expired. Please log in again.',
          401,
        );
      }

      try {
        await MfaService.verifyCode(payload.userId, validation.data.code);
      } catch (err) {
        if (err instanceof AppError && err.code === 'MFA_INVALID_CODE') {
          AuditService.logAction({
            actorId: payload.userId,
            action: AUDIT_ACTIONS.MFA_VERIFY_FAILURE,
            targetResource: 'users',
            targetId: payload.userId,
            details: { context: 'login_step2' },
            ipAddress,
            userAgent,
          });
          const fresh = await db.query.users.findFirst({ where: eq(users.id, payload.userId) });
          if (fresh?.mfaLockedUntil && new Date() < new Date(fresh.mfaLockedUntil)) {
            AuditService.logAction({
              actorId: payload.userId,
              action: AUDIT_ACTIONS.MFA_LOCKOUT,
              targetResource: 'users',
              targetId: payload.userId,
              details: { lockedUntil: fresh.mfaLockedUntil },
              ipAddress,
              userAgent,
            });
          }
        }
        throw err;
      }

      const result = await AuthService.completeStaffLoginAfterMfa(
        payload.userId,
        payload.rememberMe,
        ipAddress,
        userAgent,
      );

      const refreshCookieMaxAge = payload.rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

      res.cookie(REFRESH_TOKEN_COOKIE_NAME, result.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge,
      });

      AuditService.logAction({
        actorId: payload.userId,
        action: AUDIT_ACTIONS.MFA_VERIFY_SUCCESS,
        targetResource: 'users',
        targetId: payload.userId,
        details: { context: 'login_step2' },
        ipAddress,
        userAgent,
      });

      res.status(200).json({
        data: {
          accessToken: result.accessToken,
          user: result.user,
          expiresIn: result.expiresIn,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/login/mfa-backup — login step-2 with a backup code.
   */
  static async loginMfaBackup(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = loginMfaBackupSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: validation.error.errors,
        });
      }

      const ipAddress = req.ip || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      const payload = await MfaService.consumeChallengeToken(validation.data.mfaChallengeToken);
      if (!payload) {
        throw new AppError(
          'MFA_CHALLENGE_INVALID',
          'Your login session expired. Please log in again.',
          401,
        );
      }

      let remaining = 0;
      try {
        const result = await MfaService.redeemBackupCode(payload.userId, validation.data.code);
        remaining = result.remaining;
      } catch (err) {
        if (err instanceof AppError && err.code === 'MFA_INVALID_BACKUP_CODE') {
          AuditService.logAction({
            actorId: payload.userId,
            action: AUDIT_ACTIONS.MFA_VERIFY_FAILURE,
            targetResource: 'users',
            targetId: payload.userId,
            details: { context: 'login_backup' },
            ipAddress,
            userAgent,
          });
        }
        throw err;
      }

      const session = await AuthService.completeStaffLoginAfterMfa(
        payload.userId,
        payload.rememberMe,
        ipAddress,
        userAgent,
      );

      const refreshCookieMaxAge = payload.rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;

      res.cookie(REFRESH_TOKEN_COOKIE_NAME, session.refreshToken, {
        ...COOKIE_OPTIONS,
        maxAge: refreshCookieMaxAge,
      });

      AuditService.logAction({
        actorId: payload.userId,
        action: AUDIT_ACTIONS.MFA_BACKUP_USED,
        targetResource: 'users',
        targetId: payload.userId,
        details: { remaining },
        ipAddress,
        userAgent,
      });

      // TODO(9-13): trigger "backup code used" email via EmailService once a
      // template exists; tracked under AC#4 follow-up. The audit log already
      // captures the event; email is the operator-side notification.
      logger.info({ event: 'mfa.backup_used_email_pending', userId: payload.userId, remaining });

      res.status(200).json({
        data: {
          accessToken: session.accessToken,
          user: session.user,
          expiresIn: session.expiresIn,
          backupCodesRemaining: remaining,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/mfa/disable — requires fresh re-auth + current TOTP.
   * Clears mfa_secret + all backup codes + flips mfa_enabled = false.
   */
  static async disable(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);

      const validation = totpCodeSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: validation.error.errors,
        });
      }

      const userId = req.user.sub;
      await MfaService.verifyCode(userId, validation.data.code);
      await MfaService.disableMfa(userId);

      AuditService.logAction({
        actorId: userId,
        action: AUDIT_ACTIONS.MFA_DISABLED,
        targetResource: 'users',
        targetId: userId,
        // F11 (code-review 2026-05-02): include initiator context so future
        // forensic reviews can distinguish self-disable from admin-tool reset
        // (the latter routes through scripts/ not this controller, so this
        // branch is always self-initiated).
        details: { initiator: 'self', requiredReAuth: true, requiredTotp: true },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.status(200).json({ data: { ok: true } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /auth/mfa/regenerate-codes — requires fresh re-auth + current TOTP.
   * Rotates the 8 backup codes; returns plaintext ONCE.
   */
  static async regenerateCodes(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);

      const validation = totpCodeSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: validation.error.errors,
        });
      }

      const userId = req.user.sub;
      await MfaService.verifyCode(userId, validation.data.code);
      const codes = await MfaService.regenerateBackupCodes(userId);

      AuditService.logAction({
        actorId: userId,
        action: AUDIT_ACTIONS.MFA_REGENERATED,
        targetResource: 'users',
        targetId: userId,
        // F12 (code-review 2026-05-02): record old-codes-invalidated count for
        // forensic value. The MfaService transaction deletes all rows then
        // inserts BACKUP_CODE_COUNT new ones, so the new count is constant.
        details: { invalidatedAllOldCodes: true, newCodeCount: codes.length },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      res.status(200).json({ data: { backupCodes: codes } });
    } catch (err) {
      next(err);
    }
  }
}
