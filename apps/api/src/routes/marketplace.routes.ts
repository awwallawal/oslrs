import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplace.controller.js';
import { marketplaceSearchRateLimit, marketplaceProfileRateLimit } from '../middleware/marketplace-rate-limit.js';

const router = Router();

// Public routes — no authentication or authorization middleware
router.get('/search', marketplaceSearchRateLimit, MarketplaceController.search);
router.get('/profiles/:id', marketplaceProfileRateLimit, MarketplaceController.getProfile);

export default router;
