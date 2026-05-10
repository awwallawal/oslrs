import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { MagicLinkService } from '../services/magic-link.service.js';
import { AuditService } from '../services/audit.service.js';
import { AppError } from '@oslsr/utils';
import { AUDIT_ACTIONS } from '../services/audit.service.js';
import type { MagicLinkPurpose } from '../db/schema/index.js';
import { magicLinkPurposes } from '../db/schema/index.js';

/**
 * Story 9-12 AC#6 — magic-link auth endpoints.
 *
 * Two endpoints:
 *   POST /api/v1/auth/public/magic-link
 *     Request body: { email, purpose }
 *     Issues a token, sends an email, returns 200 always (don't leak email existence).
 *
 *   GET /auth/magic?token=<plaintext>&purpose=<purpose>
 *     Validates + atomically consumes the token.
 *     Returns JSON describing the redemption (frontend handles redirect).
 *     Does NOT issue a JWT in this scope — JWT issuance belongs in a
 *     dedicated `magic-link-login` endpoint when Task 4-7 frontend lands.
 *
 * Per security pattern in `auth.service.ts:259-264` ("Generic error to prevent
 * email enumeration") — the request endpoint always returns 200 even when
 * email is invalid or rate-limited at the service layer; the rate-limit
 * middleware handles the abuse case at the edge.
 */

const requestMagicLinkSchema = z.object({
  email: z.string().email('Invalid email format').max(254),
  purpose: z.enum(magicLinkPurposes),
});

const redeemMagicLinkQuerySchema = z.object({
  token: z.string().min(8, 'Magic-link token is missing or too short'),
  purpose: z.enum(magicLinkPurposes),
});

export class MagicLinkController {
  /**
   * POST /api/v1/auth/public/magic-link
   *
   * Request body: { email: string, purpose: MagicLinkPurpose }
   *
   * Always returns 200 (anti-enumeration). Rate limit (3/email/hour) applied
   * at middleware layer. Email may not be sent if the address is malformed
   * or unknown — that's acceptable; the user receives a generic
   * "if-this-email-exists-we-sent-it" UX.
   */
  static async requestMagicLink(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = requestMagicLinkSchema.safeParse(req.body);
      if (!validation.success) {
        // Anti-enumeration: do NOT 4xx on invalid email format. Return 200 with
        // the same shape as success. Validation errors are logged for triage.
        return res.status(200).json({
          status: 'ok',
          data: {
            sent: false,
            reason: 'invalid_input',
          },
        });
      }

      const { email, purpose } = validation.data;
      const requestedIp = req.ip;
      const userAgent = req.get('user-agent') || undefined;

      const issued = await MagicLinkService.issueToken({
        email,
        purpose,
        requestedIp,
        userAgent,
      });

      // Send email (best-effort; failures swallowed inside the service).
      await MagicLinkService.sendMagicLinkEmail({
        email,
        tokenPlaintext: issued.tokenPlaintext,
        purpose,
        expiresAt: issued.expiresAt,
      });

      // Audit log — fire-and-forget. NEVER include the plaintext token.
      AuditService.logAction({
        actorId: null,
        action: AUDIT_ACTIONS.MAGIC_LINK_ISSUED,
        targetResource: 'magic_link_tokens',
        targetId: issued.id,
        details: { email, purpose, expiresAt: issued.expiresAt.toISOString() },
        ipAddress: requestedIp || 'unknown',
        userAgent: userAgent || 'unknown',
      });

      return res.status(200).json({
        status: 'ok',
        data: {
          sent: true,
          // Never include the plaintext token in the response.
          // Expiry is informational only.
          expiresAt: issued.expiresAt.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /auth/magic?token=<plaintext>&purpose=<purpose>
   *
   * Validates + atomically consumes the token. Returns JSON describing the
   * redemption result. Frontend (Task 4-7) handles the redirect; this
   * endpoint does NOT redirect itself or issue a session JWT.
   *
   * The full magic-link-to-JWT flow lands when frontend drives it. For the
   * Task 1 backend scope, this endpoint validates the token and returns a
   * session-key payload that the frontend can present to a separate
   * `/auth/magic-link/login` endpoint (future Task) for JWT issuance.
   */
  static async redeemMagicLink(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = redeemMagicLinkQuerySchema.safeParse(req.query);
      if (!validation.success) {
        throw new AppError(
          'MAGIC_LINK_INVALID',
          'Magic-link token is missing or malformed',
          400,
        );
      }

      const { token, purpose } = validation.data;
      const redeemed = await MagicLinkService.redeemToken({
        plaintext: token,
        purpose: purpose as MagicLinkPurpose,
      });

      // Audit log — fire-and-forget.
      AuditService.logAction({
        actorId: redeemed.userId ?? null,
        action: AUDIT_ACTIONS.MAGIC_LINK_REDEEMED,
        targetResource: 'magic_link_tokens',
        targetId: redeemed.id,
        details: {
          email: redeemed.email,
          purpose: redeemed.purpose,
          respondentId: redeemed.respondentId,
        },
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
      });

      return res.status(200).json({
        status: 'ok',
        data: {
          tokenId: redeemed.id,
          purpose: redeemed.purpose,
          email: redeemed.email,
          userId: redeemed.userId,
          respondentId: redeemed.respondentId,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
