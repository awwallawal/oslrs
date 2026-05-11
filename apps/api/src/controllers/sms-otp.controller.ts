import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { SmsOtpService } from '../services/sms-otp.service.js';
import { isSmsOtpEnabled } from '../services/sms-provider.adapter.js';

/**
 * Story 9-12 AC#7 / Task 2.4 — SMS OTP route handlers.
 *
 * The handlers gate on `auth.sms_otp_enabled` from `system_settings`. Default
 * value is `false`, which means every request returns
 * `503 SMS_OTP_DISABLED` regardless of provider state. When the operator
 * flips the flag on via the Settings Landing UI, the service path runs.
 */

const requestSchema = z.object({
  phone: z
    .string()
    .regex(
      /^\+234\d{10}$/,
      'Phone must be in canonical Nigerian E.164 form (e.g. +2348012345678)',
    ),
});

const verifySchema = z.object({
  phone: z.string().regex(/^\+234\d{10}$/),
  code: z.string().regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export class SmsOtpController {
  static async request(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(await isSmsOtpEnabled())) {
        throw new AppError('SMS_OTP_DISABLED', 'SMS OTP is not enabled on this deployment', 503);
      }
      const validation = requestSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('SMS_OTP_INVALID_INPUT', 'Invalid input', 400, {
          issues: validation.error.flatten(),
        });
      }
      const result = await SmsOtpService.requestOtp(validation.data.phone);
      return res.status(200).json({ status: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  }

  static async verify(req: Request, res: Response, next: NextFunction) {
    try {
      if (!(await isSmsOtpEnabled())) {
        throw new AppError('SMS_OTP_DISABLED', 'SMS OTP is not enabled on this deployment', 503);
      }
      const validation = verifySchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('SMS_OTP_INVALID_INPUT', 'Invalid input', 400, {
          issues: validation.error.flatten(),
        });
      }
      const result = await SmsOtpService.verifyOtp(validation.data.phone, validation.data.code);
      return res.status(200).json({ status: 'ok', data: result });
    } catch (error) {
      next(error);
    }
  }
}
