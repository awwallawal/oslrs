/**
 * MFA Grace-Period Gate — Story 9-13.
 *
 * Runs from inside `authenticate.ts` (similar to the View-As block) after
 * `req.user` is set. Only super_admin sessions are inspected; everything else
 * passes through with no DB query.
 *
 * Behaviour:
 *   - During grace (`mfa_grace_until > NOW()` AND `mfa_enabled = false`):
 *       login proceeds normally, dashboard banner shown by the frontend.
 *       This middleware does NOTHING.
 *   - Post-grace (`mfa_grace_until <= NOW()` AND `mfa_enabled = false`):
 *       all routes blocked except the MFA enrollment endpoints + a thin
 *       allow-list for session basics (`/auth/me`, `/auth/logout`,
 *       `/auth/reauth`).
 *       Returns 403 with code `FORCE_MFA_ENROLLMENT` so the frontend can
 *       redirect to `/dashboard/super-admin/security/mfa`.
 *       Audit event `mfa.grace_expired_redirect` emitted (fire-and-forget).
 *   - MFA enabled OR no grace_until set: pass-through.
 */
import type { Request } from 'express';
import { AppError } from '@oslsr/utils';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'mfa-grace' });

// Endpoints a super_admin in post-grace state may still hit.
// Tightened by code-review F4 (2026-05-02): only the enrollment-track endpoints
// belong here. `disable` + `regenerate-codes` were intentionally REMOVED — they
// require fresh re-auth + current TOTP which an unenrolled user cannot satisfy
// anyway, but the broader allow-list shape was wrong intent. The whole point
// of forced enrollment is to enroll, not to side-step into other MFA mutations.
const GRACE_ALLOWED_PATTERNS: RegExp[] = [
  /^\/api\/v1\/auth\/mfa\/enroll$/,
  /^\/api\/v1\/auth\/mfa\/verify$/,
  /^\/api\/v1\/auth\/me$/,
  /^\/api\/v1\/auth\/logout$/,
  /^\/api\/v1\/auth\/reauth$/,
  /^\/api\/v1\/csp-report$/, // CSP telemetry — not user-actionable, never block
];

function isGraceAllowed(originalUrl: string | undefined): boolean {
  if (!originalUrl) return false;
  // Strip query string before matching.
  const path = originalUrl.split('?')[0];
  return GRACE_ALLOWED_PATTERNS.some((re) => re.test(path));
}

/**
 * Returns `null` to allow the request, or an `AppError` to block it.
 * Caller (authenticate middleware) propagates via `next(error)`.
 */
export async function mfaGraceCheck(req: Request): Promise<AppError | null> {
  if (!req.user || req.user.role !== 'super_admin') return null;

  if (isGraceAllowed(req.originalUrl)) return null;

  const user = await db.query.users.findFirst({
    where: eq(users.id, req.user.sub),
  });

  if (!user) return null; // Token-valid but DB-missing — let auth handle elsewhere.

  if (user.mfaEnabled) return null;
  if (!user.mfaGraceUntil) return null; // Not gated (e.g. seeded super_admin with no grace).

  const now = new Date();
  if (now < new Date(user.mfaGraceUntil)) return null; // Still in grace.

  // Post-grace and not enrolled — block.
  AuditService.logAction({
    actorId: user.id,
    action: AUDIT_ACTIONS.MFA_GRACE_EXPIRED_REDIRECT,
    targetResource: 'users',
    targetId: user.id,
    details: {
      attemptedPath: req.originalUrl,
      graceUntil: user.mfaGraceUntil,
    },
    ipAddress: req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
  });

  logger.info({
    event: 'mfa.grace_expired_redirect',
    userId: user.id,
    attemptedPath: req.originalUrl,
  });

  return new AppError(
    'FORCE_MFA_ENROLLMENT',
    'MFA enrollment is required before you can continue.',
    403,
    {
      enrollmentPath: '/dashboard/super-admin/security/mfa',
      graceUntil: user.mfaGraceUntil,
    },
  );
}
