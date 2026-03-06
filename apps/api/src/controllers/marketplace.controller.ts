import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { MarketplaceService } from '../services/marketplace.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

      const result = await MarketplaceService.revealContact(id, viewerId, ipAddress, userAgent);

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
        { viewerRole: authReq.user.role },
      );

      res.json({ data: result.data });
    } catch (err) {
      next(err);
    }
  }
}
