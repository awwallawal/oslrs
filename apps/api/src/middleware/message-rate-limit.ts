import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'message-rate-limit' });

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

let redisClient: Redis | null = null;

const getRedisClient = () => {
  if (!redisClient && !isTestMode()) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

const shouldSkipRateLimit = () => isTestMode();

/**
 * Rate limiter for message send endpoints.
 * 30 messages per minute per authenticated user.
 * Applied to POST /send and POST /broadcast only.
 */
export const messageRateLimit = rateLimit({
  store: isTestMode() ? undefined : new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => getRedisClient()?.call(...args),
    prefix: 'rl:message:',
  }),
  windowMs: 60_000, // 1 minute
  max: 30, // 30 messages per minute per user
  keyGenerator: (req) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (req as any).user?.sub || req.ip || 'unknown';
  },
  message: {
    status: 'error',
    code: 'MESSAGE_RATE_LIMIT_EXCEEDED',
    message: 'Too many messages. Please try again later.',
  },
  handler: (req, res, next, options) => {
    logger.warn({
      event: 'message.rate_limit_exceeded',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: (req as any).user?.sub,
      ip: req.ip,
    });
    res.status(429).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: isTestMode() ? false : { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  skip: shouldSkipRateLimit,
});
