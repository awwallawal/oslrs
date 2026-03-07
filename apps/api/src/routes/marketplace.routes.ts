import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplace.controller.js';
import { RevealAnalyticsController } from '../controllers/reveal-analytics.controller.js';
import {
  marketplaceSearchRateLimit,
  marketplaceProfileRateLimit,
  editTokenRequestRateLimit,
  editTokenUseRateLimit,
} from '../middleware/marketplace-rate-limit.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { verifyCaptcha } from '../middleware/captcha.js';

const router = Router();

// Analytics routes — Super Admin only (MUST be before /profiles/:id wildcard)
router.get('/analytics/reveals', authenticate, authorize('super_admin'), RevealAnalyticsController.getStats);
router.get('/analytics/reveals/top-viewers', authenticate, authorize('super_admin'), RevealAnalyticsController.getTopViewers);
router.get('/analytics/reveals/top-profiles', authenticate, authorize('super_admin'), RevealAnalyticsController.getTopProfiles);
router.get('/analytics/reveals/suspicious-devices', authenticate, authorize('super_admin'), RevealAnalyticsController.getSuspiciousDevices);

// Public routes — no authentication or authorization middleware
router.get('/search', marketplaceSearchRateLimit, MarketplaceController.search);
router.get('/profiles/:id', marketplaceProfileRateLimit, MarketplaceController.getProfile);

// Authenticated + CAPTCHA — contact reveal (PII access)
router.post('/profiles/:id/reveal',
  authenticate,
  verifyCaptcha,
  MarketplaceController.revealContact,
);

// Edit token routes — public, no auth (token IS the auth) (Story 7-5)
// POST request-edit-token: CAPTCHA + IP rate limit required
router.post('/request-edit-token',
  editTokenRequestRateLimit,
  verifyCaptcha,
  MarketplaceController.requestEditToken,
);

// GET edit/:token: validate token and return profile data for form pre-population
router.get('/edit/:token', editTokenUseRateLimit, MarketplaceController.validateEditToken);

// PUT edit: apply profile edit with token in body
router.put('/edit', editTokenUseRateLimit, MarketplaceController.applyProfileEdit);

export default router;
