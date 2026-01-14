import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'captcha-middleware' });

// hCaptcha verification URL
const HCAPTCHA_VERIFY_URL = 'https://hcaptcha.com/siteverify';

interface HCaptchaResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Middleware to verify hCaptcha tokens
 * Expects captchaToken in request body
 */
export const verifyCaptcha = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { captchaToken } = req.body;

    // Skip CAPTCHA in test/development mode
    if (process.env.NODE_ENV !== 'production' && process.env.SKIP_CAPTCHA === 'true') {
      logger.info({
        event: 'captcha.skipped',
        reason: 'development_mode',
      });
      return next();
    }

    // Allow bypass token for testing
    if (process.env.NODE_ENV !== 'production' && captchaToken === 'test-captcha-bypass') {
      logger.info({
        event: 'captcha.skipped',
        reason: 'test_bypass_token',
      });
      return next();
    }

    if (!captchaToken) {
      throw new AppError(
        'AUTH_CAPTCHA_FAILED',
        'Please complete the CAPTCHA verification',
        400
      );
    }

    const secret = process.env.HCAPTCHA_SECRET_KEY;

    if (!secret) {
      // In development without secret, log warning but allow through
      if (process.env.NODE_ENV !== 'production') {
        logger.warn({
          event: 'captcha.missing_secret',
          note: 'HCAPTCHA_SECRET_KEY not configured, skipping verification in development',
        });
        return next();
      }

      // In production, this is an error
      logger.error({
        event: 'captcha.configuration_error',
        error: 'HCAPTCHA_SECRET_KEY not configured',
      });
      throw new AppError(
        'INTERNAL_ERROR',
        'CAPTCHA service not configured',
        500
      );
    }

    // Verify with hCaptcha API
    const params = new URLSearchParams({
      secret,
      response: captchaToken,
      remoteip: req.ip || '',
    });

    const response = await fetch(HCAPTCHA_VERIFY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const result: HCaptchaResponse = await response.json();

    if (!result.success) {
      logger.warn({
        event: 'captcha.verification_failed',
        errorCodes: result['error-codes'],
        ip: req.ip,
      });

      throw new AppError(
        'AUTH_CAPTCHA_FAILED',
        'CAPTCHA verification failed. Please try again.',
        400
      );
    }

    logger.info({
      event: 'captcha.verified',
      hostname: result.hostname,
      ip: req.ip,
    });

    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error({
      event: 'captcha.error',
      error: (error as Error).message,
    });

    // Don't expose internal errors
    next(new AppError(
      'AUTH_CAPTCHA_FAILED',
      'CAPTCHA verification failed. Please try again.',
      400
    ));
  }
};

/**
 * Optional CAPTCHA verification - logs but doesn't fail
 * Useful for monitoring without blocking
 */
export const optionalCaptcha = async (req: Request, res: Response, next: NextFunction) => {
  const { captchaToken } = req.body;

  if (!captchaToken) {
    logger.info({
      event: 'captcha.skipped',
      reason: 'no_token_provided',
    });
    return next();
  }

  return verifyCaptcha(req, res, next);
};
