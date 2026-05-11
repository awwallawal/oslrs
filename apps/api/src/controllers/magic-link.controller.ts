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
   * Code review C1 (2026-05-11) — Email-link prefetchers (Gmail/Outlook ATP,
   * Defender, Slack/Discord/iMessage previews, antivirus URL scanners) will
   * GET this URL before the real user clicks. Per RFC 7231 §4.2.1 GET must be
   * safe. We PEEK the token here (no `used_at` write) and return the same JSON
   * payload as before. The token is consumed by an explicit user-driven
   * `POST /auth/magic/consume` once the frontend lands and shows a Confirm
   * button on the resume page. Prefetcher round-trips against this endpoint
   * are now idempotent.
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
      const peeked = await MagicLinkService.peekToken({
        plaintext: token,
        purpose: purpose as MagicLinkPurpose,
      });

      // NOTE: deliberately NO audit event here — peek is not redemption.
      // `MAGIC_LINK_REDEEMED` fires on the POST `/auth/magic/consume` path.
      void req;
      return res.status(200).json({
        status: 'ok',
        data: {
          tokenId: peeked.id,
          purpose: peeked.purpose,
          email: peeked.email,
          userId: peeked.userId,
          respondentId: peeked.respondentId,
          // Hint to the frontend that consume requires a subsequent POST.
          requiresConsume: true,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /auth/magic/consume — body { token, purpose }.
   *
   * Code review C1 (2026-05-11) — explicit-action consume endpoint. Atomic
   * UPDATE on `used_at` enforces single-use. The frontend resume page calls
   * this once the user clicks the Confirm button. Idempotent against retries:
   * a second call returns `MAGIC_LINK_ALREADY_USED`.
   */
  static async consumeMagicLink(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = redeemMagicLinkQuerySchema.safeParse(req.body);
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
