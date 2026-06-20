import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { MeController } from '../controllers/me.controller.js';

/**
 * Story 9-38 (AC#10) — authenticated "current user" routes.
 *
 * `GET /api/v1/me/registration-status` returns the caller's OWN registration
 * state (none / draft / pending_nin / complete). Authenticated — the user is
 * resolved from the JWT, never from a request param (anti-enumeration). Any
 * authenticated role may call it; for a non-public account with no linked
 * respondent + no draft it simply returns `{ state: 'none' }`.
 */
const router = Router();

router.get(
  '/registration-status',
  authenticate,
  MeController.getRegistrationStatus,
);

// Story 9-40 (AC#4) — self-service edit of the caller's own registration
// (currently the marketplace-consent flag). Authenticated; subject = JWT.
router.put(
  '/registration',
  authenticate,
  MeController.updateRegistration,
);

// Story 9-60 — in-session registration edit + resume + pending-NIN completion.
// All authenticated; the caller is resolved from the JWT (anti-enumeration).
router.get('/registration', authenticate, MeController.getEditableRegistration);
router.put('/registration/wizard', authenticate, MeController.editRegistrationWizard);
router.post('/registration/complete-nin', authenticate, MeController.completeNin);

export default router;
