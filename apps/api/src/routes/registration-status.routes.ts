import { Router } from 'express';
import { RegistrationStatusController } from '../controllers/registration-status.controller.js';
import { registrationStatusRateLimit } from '../middleware/registration-status-rate-limit.js';
import { verifyCaptcha } from '../middleware/captcha.js';

/**
 * Story 9-58 (Deliverable A) — public registration-status check.
 *
 * Unauthenticated. Defence-in-depth ordering (AC7): per-IP rate-limit FIRST
 * (cheap rejection of floods), THEN server-side captcha verification, THEN the
 * controller (which fires the resolve+deliver+audit out of band and returns a
 * constant neutral response). Captcha + rate-limit are both skipped/bypassed in
 * test mode per the project-wide convention.
 */
const router = Router();

router.post(
  '/request',
  registrationStatusRateLimit,
  verifyCaptcha,
  RegistrationStatusController.requestStatus,
);

export default router;
