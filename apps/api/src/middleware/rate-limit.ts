import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';
import { AppError } from '@oslsr/utils';

const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const publicVerificationRateLimit = rateLimit({
  store: new RedisStore({
    // @ts-expect-error - Known type mismatch with ioredis
    sendCommand: (...args: string[]) => redisClient.call(...args),
  }),
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP (matches marketplace search limit)
  message: {
    status: 'error',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many verification requests, please try again later'
  },
  handler: (req, res, next, options) => {
      res.status(options.statusCode).json(options.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});
