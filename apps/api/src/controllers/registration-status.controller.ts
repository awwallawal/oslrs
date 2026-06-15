/**
 * Story 9-58 (Deliverable A) — public registration-status check controller.
 *
 * `POST /api/v1/registration-status/request` — captcha-verified + rate-limited
 * (middleware) public endpoint. Returns the SAME neutral response regardless of
 * whether the identifier matches (AC2: no on-screen status = no enumeration
 * oracle). The actual status + magic-link are delivered to the registered
 * channel by `RegistrationStatusService.handleRequest`, which is fired WITHOUT
 * await so match / no-match paths take indistinguishable wall-clock time
 * (AC2.2 timing-oracle mitigation).
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { RegistrationStatusService, classifyIdentifier } from '../services/registration-status.service.js';
import pino from 'pino';

const logger = pino({ name: 'registration-status-controller' });

const requestSchema = z.object({
  identifier: z.string().trim().min(3, 'Enter your email, phone, or reference code').max(200),
});

export class RegistrationStatusController {
  static async requestStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const parsed = requestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(
          'REGISTRATION_STATUS_INVALID_INPUT',
          'Enter your email, phone, or reference code.',
          400,
        );
      }
      const { identifier } = parsed.data;

      // AC8.2 — log only the identifier CLASS at info level, never the raw value.
      logger.info({
        event: 'registration_status.requested',
        identifierClass: classifyIdentifier(identifier),
        ip: req.ip,
      });

      // Capture request-scoped values BEFORE firing the async work.
      const ipAddress = req.ip || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Fire-and-forget: resolve + deliver + audit happen out of band so the
      // response time is constant regardless of match (AC2.2). Errors are
      // swallowed inside the service; never surfaced to the caller.
      void RegistrationStatusService.handleRequest({ identifier, ipAddress, userAgent });

      // AC2.1 — constant neutral response. Always 200 on a valid captcha.
      return res.status(200).json({
        status: 'ok',
        data: {
          message:
            "If you're in our registry, we've sent your status and a secure link to your registered email or phone. Please check it.",
        },
      });
    } catch (error) {
      next(error);
    }
  }
}
