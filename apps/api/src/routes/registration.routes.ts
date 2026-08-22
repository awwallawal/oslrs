import { Router } from 'express';
import { RegistrationController } from '../controllers/registration.controller.js';
import { magicLinkRateLimit } from '../middleware/magic-link-rate-limit.js';
import { registrationRateLimit, registrationEmailRateLimit } from '../middleware/registration-rate-limit.js';
import { wizardDraftRateLimit, wizardDraftEmailRateLimit } from '../middleware/wizard-draft-rate-limit.js';
import { registrationBurstWatch } from '../middleware/registration-burst.js'; // Story 13-46 (AC3)

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
 *   - draft (PUT + GET) → `wizardDraftRateLimit` (1,200/IP/15min, a CGNAT-tolerant
 *     flood-stop) THEN `wizardDraftEmailRateLimit` (300/normalised-email/15min).
 *     ⚠️ 13-46 raised the IP ceiling from 120 and added the email dimension: at
 *     120, and at 20-60 debounced saves per session, ONE carrier IP was exhausted
 *     by 2-6 concurrent wizards — and this limiter fails FIRST and SILENTLY,
 *     because a lost draft looks like a user who simply didn't finish.
 *     MR-11's original objection to per-email keying still holds (random addresses
 *     mint fresh buckets), which is exactly why BOTH dimensions are mounted.
 *   - wizard submit → registrationRateLimit (50/IP/15min, a crude CGNAT-tolerant
 *     flood-stop) THEN registrationEmailRateLimit (3/normalised-email/15min,
 *     the real abuse control). ⚠️ The old "5/IP/15min per the legacy
 *     `/auth/public/register` discipline" was RETIRED on 2026-08-07 because it
 *     was refusing real citizens: 36 recorded blocks across Nigerian carrier
 *     CGNAT ranges, 27 of them on the morning of a 75-invitation send. The
 *     threat model was never "mass account creation" — this path creates no
 *     accounts (the user insert is `onConflictDoNothing`, so it REUSES an
 *     account and never rejects the registration). Abuse here is ONE actor
 *     minting MANY records, and the submitted email is a far better proxy for
 *     "one actor" than a carrier gateway IP.
 *     Captcha remains a deliberate NON-GOAL (13-46): the magic link is the real
 *     gate and the login behind it is captcha-gated, so a wizard captcha would
 *     tax honest listeners to defend an asset that is not at risk.
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
// Story 13-46 (AC4) — two dimensions, cheap check first, mirroring `POST /wizard`: a CGNAT-tolerant
// per-IP flood-stop THEN the per-EMAIL limiter that actually matches "one actor hammering".
router.put('/draft', wizardDraftRateLimit, wizardDraftEmailRateLimit, RegistrationController.saveDraft);
router.get('/draft', wizardDraftRateLimit, wizardDraftEmailRateLimit, RegistrationController.getDraft);

// Story 9-12 Task 5 — final wizard submit. Creates the respondent row;
// pending-NIN path also issues a pending_nin_complete magic-link.
// 2026-08-07 (and re-stated by 13-46): the IP limit is a crude flood-stop (50/15min,
// CGNAT-tolerant); the per-EMAIL limiter is the real abuse control. Order matters — the cheap IP
// check runs first. ⚠️ Do NOT "restore" the legacy 5/IP/15min value: it was measured turning real
// citizens away behind carrier NAT (see the header note), and the register's credibility, not the
// account table, is what these limits defend.
// Story 13-46 (AC3) — the burst watch is mounted LAST so it counts only submits that were actually
// served, and it calls next() synchronously: it can page, it can never block.
router.post(
  '/wizard',
  registrationRateLimit,
  registrationEmailRateLimit,
  registrationBurstWatch,
  RegistrationController.submitWizard,
);

// Story 9-28 Path B — Cohort A supplemental-survey submission. Magic-link
// token (purpose=supplemental_survey) authorizes a Step 4-only write for an
// already-registered respondent.
//
// Story 13-46 (AC4) — RULING ON THE SHARED LIMITER, stated so it does not ride silently:
// this route KEEPS `registrationRateLimit` (the 50/IP/15min flood-stop) and deliberately does NOT
// take `registrationEmailRateLimit`. Two reasons, both specific to this path:
//   1. It is NOT unauthenticated — reaching it requires a valid single-purpose magic-link token
//      issued to a known respondent, so "one actor minting many records" is already bounded by
//      token issuance, which has its own per-email limit (`magicLinkRateLimit`, 3/email/hour).
//   2. Its payload is a Step-4 answer set for an EXISTING respondent and carries no `email` field
//      to key on, so the per-email limiter would fall back to the IP for every request — i.e. it
//      would silently re-impose a second per-IP bucket on a CGNAT-shared address, which is the
//      exact failure 2026-08-07 removed.
// The burst watch is NOT mounted here either: AC3's counter is about the PUBLIC wizard's write
// path, and mixing an invitation-gated cohort route into the same window would make the "submits
// in window" number mean two different things.
router.post(
  '/supplemental',
  registrationRateLimit,
  RegistrationController.submitSupplementalSurvey,
);

export default router;
