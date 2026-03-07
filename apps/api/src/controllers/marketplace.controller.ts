import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { MarketplaceService } from '../services/marketplace.service.js';
import { MarketplaceEditService } from '../services/marketplace-edit.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
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

      const authReq = req as AuthenticatedRequest;
      const viewerId = authReq.user.sub;
      const ipAddress = req.ip || req.socket?.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';
      const deviceFingerprint = req.get('x-device-fingerprint') || null;

      const result = await MarketplaceService.revealContact(id, viewerId, ipAddress, userAgent, deviceFingerprint);

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
