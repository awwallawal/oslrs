import { Router } from 'express';
import { RegistrationController } from '../controllers/registration.controller.js';
import { magicLinkRateLimit } from '../middleware/magic-link-rate-limit.js';
import { registrationRateLimit } from '../middleware/registration-rate-limit.js';
import { wizardDraftRateLimit } from '../middleware/wizard-draft-rate-limit.js';

/**
 * Story 9-12 — public registration endpoints.
 *
 * All endpoints unauthenticated. The wizard is pre-account by design;
 * identity is established via magic-link redemption (return-to-complete) or
 * via the final wizard submit (`POST /wizard`).
 *
 * Rate limiting (post code review 2026-05-11 sessions 6 + 7):
 *   - complete-nin / defer-reminder → magic-link rate-limit (3/email/hour;
 *     same budget pool as `POST /auth/public/magic-link`).
 *   - draft (PUT + GET) → `wizardDraftRateLimit` (120/IP/15min). Per-IP key
 *     (NOT per-email). Permissive enough for 2-second-debounced auto-save
 *     across a typical 10-15 minute wizard session; bounds single-IP flood.
 *     MR-11 fix replaced the initial magicLinkRateLimit choice which was
 *     incorrectly per-email at 3/hour and would have locked users out.
 *   - wizard submit → registrationRateLimit (5/IP/15min) per the legacy
 *     `/auth/public/register` discipline — H1 fix. Captcha integration is a
 *     follow-up that requires frontend hCaptcha widget on the wizard.
 */
const router = Router();

router.post(
  '/complete-nin',
  magicLinkRateLimit,
  RegistrationController.completeNin,
);

router.post(
  '/defer-reminder',
  magicLinkRateLimit,
  RegistrationController.deferReminder,
);

// Story 9-12 Task 4.4 — server-side wizard draft auto-save + hydration.
// Code review H2 (2026-05-11 session 6) + MR-11 (session 7) — dedicated
// per-IP limiter sized for legitimate auto-save volumes.
router.put('/draft', wizardDraftRateLimit, RegistrationController.saveDraft);
router.get('/draft', wizardDraftRateLimit, RegistrationController.getDraft);

// Story 9-12 Task 5 — final wizard submit. Creates the respondent row;
// pending-NIN path also issues a pending_nin_complete magic-link.
// Code review H1 (2026-05-11) — restore the legacy `/auth/public/register`
// rate-limit discipline (5/IP/15min). Captcha integration deferred to
// follow-up (requires frontend hCaptcha widget on Step 5 of the wizard).
router.post('/wizard', registrationRateLimit, RegistrationController.submitWizard);

// Story 9-28 Path B — Cohort A supplemental-survey submission. Magic-link
// token (purpose=supplemental_survey) authorizes a Step 4-only write for an
// already-registered respondent. Same rate limit as the wizard submit.
router.post(
  '/supplemental',
  registrationRateLimit,
  RegistrationController.submitSupplementalSurvey,
);

export default router;
