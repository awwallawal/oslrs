import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { MarketplaceService } from '../services/marketplace.service.js';
import { MarketplaceEditService } from '../services/marketplace-edit.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import { RevealStepUpService } from '../services/reveal-step-up.service.js';
import { SmsOtpService } from '../services/sms-otp.service.js';
import { MfaService } from '../services/mfa.service.js';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import type { AuthenticatedRequest } from '../types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_TOKEN_REGEX = /^[0-9a-f]{32}$/i;

const editTokenRequestSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
});

const profileEditSchema = z.object({
  editToken: z.string().regex(HEX_TOKEN_REGEX, 'Invalid edit token format'),
  bio: z.string().max(150, 'Bio must be 150 characters or less').nullable().optional(),
  portfolioUrl: z.string().url('Invalid URL format').max(500).nullable().optional(),
});

// Story 9-41 AC#6 — optional purpose-binding inputs on the reveal body. Only
// load-bearing above the configured per-viewer volume threshold; below it the
// fields are ignored and the reveal stays frictionless.
const revealBodySchema = z.object({
  purpose: z.string().trim().max(280, 'Purpose must be 280 characters or less').optional(),
  tosAccepted: z.boolean().optional(),
});

// Story 9-41 AC#5 — step-up satisfaction body. `method` selects the rung being
// proven; `code` is the OTP / TOTP / backup code from the existing OTP/MFA flow.
const revealStepUpSchema = z.object({
  method: z.enum(['otp', 'mfa']),
  code: z.string().min(4).max(16),
});

const marketplaceSearchSchema = z.object({
  q: z.string().max(200).optional(),
  lgaId: z.string().max(50).optional(),
  profession: z.string().max(100).optional(),
  experienceLevel: z.string().max(50).optional(),
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export class MarketplaceController {
  static async search(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = marketplaceSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid search parameters', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await MarketplaceService.searchProfiles(parsed.data);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || !UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile ID format', 400);
      }

      const profile = await MarketplaceService.getProfileById(id);

      if (!profile) {
        throw new AppError('NOT_FOUND', 'Profile not found', 404);
      }

      res.json({ data: profile });
    } catch (err) {
      next(err);
    }
  }

  static async revealContact(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      if (!id || !UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile ID format', 400);
      }

      const parsedBody = revealBodySchema.safeParse(req.body ?? {});
      if (!parsedBody.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid reveal request', 400, {
          errors: parsedBody.error.flatten().fieldErrors,
        });
      }

      const authReq = req as AuthenticatedRequest;
      const viewerId = authReq.user.sub;
      const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      const deviceFingerprint = req.get('x-device-fingerprint') || null;

      // AC#5 — the highest step-up rung this viewer currently holds (Redis marker).
      const stepUpLevel = await RevealStepUpService.getSatisfiedLevel(viewerId);

      const result = await MarketplaceService.revealContact(
        id, viewerId, ipAddress, userAgent, deviceFingerprint,
        {
          purpose: parsedBody.data.purpose ?? null,
          tosAccepted: parsedBody.data.tosAccepted ?? false,
          stepUpLevel,
        },
      );

      if (result.status === 'not_found') {
        throw new AppError('NOT_FOUND', 'Profile not found or contact details not available', 404);
      }

      if (result.status === 'rate_limited') {
        res.setHeader('Retry-After', String(result.retryAfter));
        res.status(429).json({
          status: 'error',
          code: 'REVEAL_LIMIT_EXCEEDED',
          message: 'Daily contact reveal limit reached (50 per 24 hours)',
          retryAfter: result.retryAfter,
        });
        return;
      }

      // AC#2 — this candidate has been contacted by too many distinct viewers
      // in-window; a new viewer is blocked to kill targeted harvest.
      if (result.status === 'profile_cap_reached') {
        res.status(403).json({
          status: 'error',
          code: 'REVEAL_PROFILE_CAP_REACHED',
          message: 'This contact has been revealed to too many people recently. Please try again later.',
        });
        return;
      }

      // AC#4/#5 — degrade to step-up rather than hard-block. `requiredLevel` is
      // mirrored into `details` so the web ApiError (which only surfaces
      // message/status/code/details) can drive the right step-up rung UI.
      if (result.status === 'step_up_required') {
        res.status(403).json({
          status: 'error',
          code: 'REVEAL_STEP_UP_REQUIRED',
          message: 'Additional verification is required before revealing more contacts.',
          requiredLevel: result.requiredLevel,
          details: { requiredLevel: result.requiredLevel },
        });
        return;
      }

      // AC#6 — purpose declaration required above the volume threshold.
      if (result.status === 'purpose_required') {
        res.status(422).json({
          status: 'error',
          code: 'REVEAL_PURPOSE_REQUIRED',
          message: 'Please state your purpose and accept the acceptable-use terms to reveal more contacts.',
        });
        return;
      }

      // Fire-and-forget audit log via immutable hash chain
      AuditService.logPiiAccess(
        authReq,
        PII_ACTIONS.CONTACT_REVEAL,
        'marketplace_profiles',
        id,
        { viewerRole: authReq.user.role, deviceFingerprint },
      );

      res.json({ data: result.data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Story 9-41 AC#5 — request a step-up OTP to the authenticated viewer's phone.
   * Reuses the existing SMS-OTP service (no net-new auth primitive). The MFA rung
   * needs no request step (the authenticator app already holds the secret).
   */
  static async requestRevealStepUp(req: Request, res: Response, next: NextFunction) {
    try {
      const authReq = req as AuthenticatedRequest;
      const [viewer] = await db
        .select({ phone: users.phone })
        .from(users)
        .where(eq(users.id, authReq.user.sub))
        .limit(1);

      if (!viewer?.phone) {
        throw new AppError(
          'STEP_UP_PHONE_MISSING',
          'No phone number on file for OTP step-up. Use authenticator (MFA) step-up instead.',
          400,
        );
      }

      const { expiresInSeconds } = await SmsOtpService.requestOtp(viewer.phone);
      res.json({ data: { sent: true, expiresInSeconds } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * Story 9-41 AC#5 — verify an OTP/MFA code and record the satisfied step-up
   * rung so subsequent reveals in the window proceed. Reuses SmsOtpService /
   * MfaService verification; this endpoint only persists the OUTCOME.
   */
  static async verifyRevealStepUp(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = revealStepUpSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid step-up request', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const authReq = req as AuthenticatedRequest;
      const viewerId = authReq.user.sub;
      const { method, code } = parsed.data;

      if (method === 'otp') {
        const [viewer] = await db
          .select({ phone: users.phone })
          .from(users)
          .where(eq(users.id, viewerId))
          .limit(1);
        if (!viewer?.phone) {
          throw new AppError('STEP_UP_PHONE_MISSING', 'No phone number on file for OTP step-up.', 400);
        }
        await SmsOtpService.verifyOtp(viewer.phone, code);
        await RevealStepUpService.recordSatisfied(viewerId, 'otp');
      } else {
        // MFA rung — verify the TOTP code against the viewer's enrolled secret.
        await MfaService.verifyCode(viewerId, code);
        await RevealStepUpService.recordSatisfied(viewerId, 'mfa');
      }

      res.json({ data: { verified: true, level: method } });
    } catch (err) {
      next(err);
    }
  }

  static async requestEditToken(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = editTokenRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid request', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const result = await MarketplaceEditService.requestEditToken(parsed.data.phoneNumber);

      if (result.status === 'rate_limited') {
        res.status(429).json({
          status: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many edit token requests. Please try again later.',
        });
        return;
      }

      // Always return 200 with generic message (prevents phone enumeration)
      res.json({
        data: {
          message: 'If a marketplace profile exists for this phone number, an SMS with an edit link has been sent.',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async validateEditToken(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      if (!token || !HEX_TOKEN_REGEX.test(token)) {
        res.json({ data: { valid: false, reason: 'invalid' } });
        return;
      }

      const result = await MarketplaceEditService.validateEditToken(token);

      if (result.status === 'valid') {
        res.json({
          data: {
            valid: true,
            bio: result.profile.bio,
            portfolioUrl: result.profile.portfolioUrl,
          },
        });
      } else {
        res.json({ data: { valid: false, reason: result.status } });
      }
    } catch (err) {
      next(err);
    }
  }

  static async applyProfileEdit(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = profileEditSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid input', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { editToken, bio, portfolioUrl } = parsed.data;
      const result = await MarketplaceEditService.applyProfileEdit(
        editToken,
        bio ?? null,
        portfolioUrl ?? null,
      );

      if (result.status === 'expired') {
        res.status(410).json({
          status: 'error',
          code: 'TOKEN_EXPIRED',
          message: 'This edit link has expired. Please request a new one.',
        });
        return;
      }

      if (result.status === 'invalid') {
        res.status(404).json({
          status: 'error',
          code: 'NOT_FOUND',
          message: 'Invalid edit link.',
        });
        return;
      }

      res.json({ data: { message: 'Profile updated successfully' } });
    } catch (err) {
      next(err);
    }
  }
}
