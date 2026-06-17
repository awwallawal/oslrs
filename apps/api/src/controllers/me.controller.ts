/**
 * Story 9-38 (AC#10) — authenticated "current user" controller.
 *
 * `GET /api/v1/me/registration-status` — returns the CALLER'S OWN public-user
 * registration state (resolved from the JWT, never an arbitrary identifier).
 * The shared spine consumed by the dashboard (Story 9-40) + entry wrong-door
 * recovery (Story 9-39).
 */
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { MeService } from '../services/me.service.js';

export class MeController {
  static async getRegistrationStatus(req: Request, res: Response, next: NextFunction) {
    try {
      // `authenticate` middleware guarantees req.user; guard defensively so a
      // mis-wired route surfaces a clean 401 rather than a 500.
      const user = req.user;
      if (!user?.sub || !user?.email) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const data = await MeService.getRegistrationStatus({
        userId: user.sub,
        email: user.email,
      });

      return res.status(200).json({ status: 'ok', data });
    } catch (error) {
      next(error);
    }
  }
}
