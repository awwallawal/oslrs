import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { Redis } from 'ioredis';
import pino from 'pino';

const logger = pino({ name: 'sensitive-action-middleware' });

// Redis client (lazy-initialized singleton to avoid connection during test imports)
let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

// Re-auth key prefix
const REAUTH_KEY_PREFIX = 'reauth:';

// Re-auth validity duration (5 minutes)
const REAUTH_VALIDITY = 5 * 60;

/**
 * List of sensitive actions that require re-authentication
 * when the user logged in with "Remember Me"
 */
const SENSITIVE_ACTIONS = [
  // Profile changes
  { method: 'PUT', pathPattern: /^\/api\/v1\/users\/[^/]+\/profile$/ },
  { method: 'PATCH', pathPattern: /^\/api\/v1\/users\/[^/]+\/profile$/ },

  // Password changes
  { method: 'PUT', pathPattern: /^\/api\/v1\/users\/[^/]+\/password$/ },
  { method: 'POST', pathPattern: /^\/api\/v1\/auth\/change-password$/ },

  // Bank details
  { method: 'PUT', pathPattern: /^\/api\/v1\/users\/[^/]+\/bank-details$/ },
  { method: 'PATCH', pathPattern: /^\/api\/v1\/users\/[^/]+\/bank-details$/ },

  // Payment disputes
  { method: 'POST', pathPattern: /^\/api\/v1\/payments\/disputes$/ },
  { method: 'PUT', pathPattern: /^\/api\/v1\/payments\/disputes\/[^/]+$/ },

  // Security settings
  { method: 'PUT', pathPattern: /^\/api\/v1\/users\/[^/]+\/security$/ },
  { method: 'DELETE', pathPattern: /^\/api\/v1\/users\/[^/]+\/sessions$/ },
];

/**
 * Checks if a request is for a sensitive action
 */
function isSensitiveAction(method: string, path: string): boolean {
  return SENSITIVE_ACTIONS.some(
    (action) => action.method === method && action.pathPattern.test(path)
  );
}

/**
 * Middleware to require re-authentication for sensitive actions
 * when the user is logged in with "Remember Me"
 *
 * Usage flow:
 * 1. User makes request to sensitive endpoint
 * 2. If Remember Me session and no recent re-auth, return 403 with AUTH_REAUTH_REQUIRED
 * 3. Frontend shows re-auth modal
 * 4. User submits password to POST /api/v1/auth/reauth
 * 5. On success, re-auth is stored in Redis for 5 minutes
 * 6. User retries original request, now succeeds
 */
export const requireReAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip if not authenticated
    if (!req.user) {
      return next();
    }

    // Skip if not a sensitive action
    if (!isSensitiveAction(req.method, req.path)) {
      return next();
    }

    // Skip if not a "Remember Me" session
    if (!req.user.rememberMe) {
      return next();
    }

    // Check for recent re-authentication
    const redis = getRedisClient();
    const reAuthKey = `${REAUTH_KEY_PREFIX}${req.user.sub}`;
    const reAuthTime = await redis.get(reAuthKey);

    if (reAuthTime) {
      // Re-auth is still valid
      logger.info({
        event: 'sensitive_action.reauth_valid',
        userId: req.user.sub,
        action: req.path,
      });
      return next();
    }

    // Re-authentication required
    logger.info({
      event: 'sensitive_action.reauth_required',
      userId: req.user.sub,
      action: req.path,
      method: req.method,
    });

    throw new AppError(
      'AUTH_REAUTH_REQUIRED',
      'Please re-enter your password to continue with this action',
      403,
      {
        action: req.path,
        reason: 'sensitive_action',
      }
    );
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    logger.error({
      event: 'sensitive_action.error',
      error: (error as Error).message,
    });

    next(error);
  }
};

/**
 * Marks a user as recently re-authenticated
 * Called after successful re-auth POST /api/v1/auth/reauth
 */
export async function setReAuthValid(userId: string): Promise<void> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  await redis.setex(reAuthKey, REAUTH_VALIDITY, Date.now().toString());

  logger.info({
    event: 'sensitive_action.reauth_granted',
    userId,
    validFor: REAUTH_VALIDITY,
  });
}

/**
 * Clears re-auth status for a user (e.g., on logout)
 */
export async function clearReAuth(userId: string): Promise<void> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  await redis.del(reAuthKey);
}

/**
 * Gets the remaining validity time for a user's re-auth (in seconds)
 */
export async function getReAuthValidity(userId: string): Promise<number | null> {
  const redis = getRedisClient();
  const reAuthKey = `${REAUTH_KEY_PREFIX}${userId}`;
  const ttl = await redis.ttl(reAuthKey);
  return ttl > 0 ? ttl : null;
}
