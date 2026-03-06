import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplace.controller.js';
import { marketplaceSearchRateLimit, marketplaceProfileRateLimit } from '../middleware/marketplace-rate-limit.js';
import { authenticate } from '../middleware/auth.js';
import { verifyCaptcha } from '../middleware/captcha.js';

const router = Router();

// Public routes — no authentication or authorization middleware
router.get('/search', marketplaceSearchRateLimit, MarketplaceController.search);
router.get('/profiles/:id', marketplaceProfileRateLimit, MarketplaceController.getProfile);

// Authenticated + CAPTCHA — contact reveal (PII access)
router.post('/profiles/:id/reveal',
  authenticate,
  verifyCaptcha,
  MarketplaceController.revealContact,
);

export default router;
