import { Router } from 'express';
import { MarketplaceController } from '../controllers/marketplace.controller.js';
import { marketplaceSearchRateLimit } from '../middleware/marketplace-rate-limit.js';

const router = Router();

// Public route — no authentication or authorization middleware
router.get('/search', marketplaceSearchRateLimit, MarketplaceController.search);

export default router;
