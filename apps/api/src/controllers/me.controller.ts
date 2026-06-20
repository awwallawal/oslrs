/**
 * Story 9-38 (AC#10) — authenticated "current user" controller.
 *
 * `GET /api/v1/me/registration-status` — returns the CALLER'S OWN public-user
 * registration state (resolved from the JWT, never an arbitrary identifier).
 * The shared spine consumed by the dashboard (Story 9-40) + entry wrong-door
 * recovery (Story 9-39).
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { modulus11Check } from '@oslsr/utils/src/validation';
import { MeService, type WizardShapedData } from '../services/me.service.js';
import { submitWizardSchema } from '../validation/registration.schema.js';

// Story 9-61 (AC#3) — session-authed NIN completion input. Same NIN rules as the
// wizard submit (11 digits + Modulus-11) — the token is dropped (the JWT is the
// credential), nothing else is accepted.
const meCompleteNinSchema = z.object({
  nin: z
    .string()
    .regex(/^\d{11}$/, 'NIN must be 11 digits')
    .refine(modulus11Check, 'NIN failed the Modulus 11 checksum'),
});

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

  /**
   * Story 9-61 (AC#1) — `GET /api/v1/me/registration`. Returns the caller's
   * editable registration (draft / pending_nin / edit / none) mapped into
   * wizard-shaped data the dashboard wizard hydrates from. JWT-resolved.
   */
  static async getEditableRegistration(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub || !user?.email) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      const data = await MeService.getEditableRegistration({
        userId: user.sub,
        email: user.email,
      });
      return res.status(200).json({ status: 'ok', data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Story 9-61 (AC#2) — `PUT /api/v1/me/registration/wizard`. Full in-session
   * edit of the caller's registration through the wizard's validated path
   * (validated with the SAME `submitWizardSchema` — AC#5), keyed off the JWT.
   */
  static async editRegistrationWizard(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub || !user?.email) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      const validation = submitWizardSchema.safeParse(req.body);
      if (!validation.success) {
        // Generic 400 — parity with the public submit's anti-enumeration discipline.
        throw new AppError('WIZARD_EDIT_INVALID_INPUT', 'Invalid registration edit', 400);
      }
      const v = validation.data;
      const wizardData: WizardShapedData = {
        givenName: v.givenName,
        familyName: v.familyName,
        dateOfBirth: v.dateOfBirth,
        gender: v.gender,
        phone: v.phone,
        email: v.email,
        lgaId: v.lgaId,
        nin: v.nin,
        pendingNin: v.pendingNin,
        consentMarketplace: v.consentMarketplace,
        consentEnriched: v.consentEnriched,
        questionnaireResponses: v.questionnaireResponses,
      };
      const data = await MeService.updateRegistrationFromWizard({
        userId: user.sub,
        data: wizardData,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      return res.status(200).json({ status: 'ok', data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Story 9-61 (AC#3) — `POST /api/v1/me/registration/complete-nin`. The
   * logged-in pending-NIN caller completes their NIN in-session (replaces the
   * magic-link token gate for authenticated callers). JWT-resolved.
   */
  static async completeNin(req: Request, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.sub || !user?.email) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      const validation = meCompleteNinSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('COMPLETE_NIN_INVALID_INPUT', 'Invalid input', 400);
      }
      const data = await MeService.completeNinAuthenticated({
        userId: user.sub,
        email: user.email,
        nin: validation.data.nin,
        ipAddress: req.ip,
        userAgent: req.get('user-agent') ?? undefined,
      });
      return res.status(200).json({ status: 'ok', data });
    } catch (error) {
      next(error);
    }
  }
}
