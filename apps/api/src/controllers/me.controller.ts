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

  /**
   * Story 9-40 (AC#4) — `PUT /api/v1/me/registration`. Self-service edit of the
   * caller's own registration. Currently accepts only `consentMarketplace`
   * (boolean). The user is resolved from the JWT; no arbitrary identifier is
   * accepted. Returns the refreshed respondent summary.
   */
  static async updateRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const { consentMarketplace } = req.body ?? {};
      if (typeof consentMarketplace !== 'boolean') {
        throw new AppError(
          'VALIDATION_ERROR',
          'consentMarketplace (boolean) is required',
          400,
        );
      }

      const data = await MeService.updateMarketplaceConsent({
        userId: user.sub,
        consentMarketplace,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });

      return res.status(200).json({ status: 'ok', data });
    } catch (error) {
      next(error);
    }
  }
}
