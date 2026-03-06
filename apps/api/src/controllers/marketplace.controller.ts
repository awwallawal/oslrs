import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { MarketplaceService } from '../services/marketplace.service.js';

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
}
