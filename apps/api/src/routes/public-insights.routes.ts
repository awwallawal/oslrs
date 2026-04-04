/**
 * Public Insights Routes
 *
 * Story 8.1: Analytics Backend Foundation & Descriptive Statistics API (AC#4)
 * Unauthenticated endpoint — rate limited, no query params accepted.
 * Mounted outside authenticated router in app.ts.
 */

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { getRedisClient } from '../lib/redis.js';
import { PublicInsightsController } from '../controllers/public-insights.controller.js';

const router = Router();

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const publicInsightsRateLimit = rateLimit({
  store: isTestEnv ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient().call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 req/min per IP
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
  },
  handler: (_req, res, _next, options) => {
    res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// NO auth middleware — public endpoint
router.get('/', publicInsightsRateLimit, PublicInsightsController.getInsights);
router.get('/trends', publicInsightsRateLimit, PublicInsightsController.getTrends);

export default router;
