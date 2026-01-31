import { Redis } from 'ioredis';
import { uuidv7 } from 'uuidv7';
import type { SessionInfo } from '@oslsr/types';

// Session expiry constants (in seconds)
const SESSION_INACTIVITY_EXPIRY = 8 * 60 * 60;       // 8 hours
const ABSOLUTE_SESSION_EXPIRY = 24 * 60 * 60;        // 24 hours (default)
const REMEMBER_ME_SESSION_EXPIRY = 30 * 24 * 60 * 60; // 30 days

// Redis key patterns
const SESSION_KEY_PREFIX = 'session:';
const USER_SESSION_KEY_PREFIX = 'user_session:';

// Redis client (lazy-initialized singleton to avoid connection during test imports)
let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

interface SessionData {
  userId: string;
  sessionId: string;
  createdAt: string;
  lastActivity: string;
  isRememberMe: boolean;
  absoluteExpiresAt: string;
  jti?: string;  // Current token JTI
}

export class SessionService {
  /**
   * Creates a new session for a user
   * Implements single-session enforcement by invalidating previous sessions
   */
  static async createSession(userId: string, rememberMe = false): Promise<SessionInfo> {
    const redis = getRedisClient();
    const sessionId = uuidv7();
    const now = new Date();

    // Calculate absolute expiry based on Remember Me
    const absoluteExpirySeconds = rememberMe ? REMEMBER_ME_SESSION_EXPIRY : ABSOLUTE_SESSION_EXPIRY;
    const absoluteExpiresAt = new Date(now.getTime() + absoluteExpirySeconds * 1000);

    // Calculate inactivity expiry
    const inactivityExpiresAt = new Date(now.getTime() + SESSION_INACTIVITY_EXPIRY * 1000);

    const sessionData: SessionData = {
      userId,
      sessionId,
      createdAt: now.toISOString(),
      lastActivity: now.toISOString(),
      isRememberMe: rememberMe,
      absoluteExpiresAt: absoluteExpiresAt.toISOString(),
    };

    // Check for existing session and invalidate it (single-session enforcement)
    const existingSessionId = await redis.get(`${USER_SESSION_KEY_PREFIX}${userId}`);
    if (existingSessionId) {
      // Mark old session as invalidated
      await this.invalidateSession(existingSessionId, 'new_login');
    }

    // Store the new session
    const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
    await redis.setex(sessionKey, absoluteExpirySeconds, JSON.stringify(sessionData));

    // Store user -> session mapping for single-session lookup
    await redis.setex(`${USER_SESSION_KEY_PREFIX}${userId}`, absoluteExpirySeconds, sessionId);

    return {
      userId,
      sessionId,
      lastActivity: sessionData.lastActivity,
      expiresAt: inactivityExpiresAt.toISOString(),
      isRememberMe: rememberMe,
      absoluteExpiresAt: sessionData.absoluteExpiresAt,
    };
  }

  /**
   * Gets session data by session ID
   */
  static async getSession(sessionId: string): Promise<SessionData | null> {
    const redis = getRedisClient();
    const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;

    const data = await redis.get(sessionKey);
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Gets the current active session for a user
   */
  static async getUserSession(userId: string): Promise<SessionData | null> {
    const redis = getRedisClient();
    const sessionId = await redis.get(`${USER_SESSION_KEY_PREFIX}${userId}`);

    if (!sessionId) {
      return null;
    }

    return this.getSession(sessionId);
  }

  /**
   * Updates the last activity time for a session
   * Returns false if session is expired or doesn't exist
   */
  static async updateLastActivity(sessionId: string): Promise<boolean> {
    const redis = getRedisClient();
    const session = await this.getSession(sessionId);

    if (!session) {
      return false;
    }

    // Check if session has exceeded absolute expiry
    if (new Date() > new Date(session.absoluteExpiresAt)) {
      await this.invalidateSession(sessionId, 'absolute_timeout');
      return false;
    }

    // Check inactivity timeout
    const lastActivity = new Date(session.lastActivity);
    const inactivityLimit = new Date(lastActivity.getTime() + SESSION_INACTIVITY_EXPIRY * 1000);

    if (new Date() > inactivityLimit) {
      await this.invalidateSession(sessionId, 'inactivity');
      return false;
    }

    // Update last activity
    session.lastActivity = new Date().toISOString();

    // Calculate remaining TTL for the session
    const remainingTTL = Math.floor(
      (new Date(session.absoluteExpiresAt).getTime() - Date.now()) / 1000
    );

    if (remainingTTL > 0) {
      const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
      await redis.setex(sessionKey, remainingTTL, JSON.stringify(session));
    }

    return true;
  }

  /**
   * Validates a session - checks both inactivity and absolute timeout
   */
  static async validateSession(sessionId: string): Promise<{
    valid: boolean;
    reason?: 'not_found' | 'inactivity' | 'absolute_timeout' | 'invalidated';
    session?: SessionData;
  }> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return { valid: false, reason: 'not_found' };
    }

    const now = new Date();

    // Check absolute expiry
    if (now > new Date(session.absoluteExpiresAt)) {
      await this.invalidateSession(sessionId, 'absolute_timeout');
      return { valid: false, reason: 'absolute_timeout' };
    }

    // Check inactivity timeout
    const lastActivity = new Date(session.lastActivity);
    const inactivityLimit = new Date(lastActivity.getTime() + SESSION_INACTIVITY_EXPIRY * 1000);

    if (now > inactivityLimit) {
      await this.invalidateSession(sessionId, 'inactivity');
      return { valid: false, reason: 'inactivity' };
    }

    return { valid: true, session };
  }

  /**
   * Invalidates a session
   */
  static async invalidateSession(sessionId: string, reason: string): Promise<void> {
    const redis = getRedisClient();
    const session = await this.getSession(sessionId);

    if (session) {
      // Remove user -> session mapping
      await redis.del(`${USER_SESSION_KEY_PREFIX}${session.userId}`);

      // Store invalidation reason for logging/debugging
      const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
      const invalidatedSession = {
        ...session,
        invalidatedAt: new Date().toISOString(),
        invalidationReason: reason,
      };

      // Keep for 1 hour for debugging, then auto-delete
      await redis.setex(`${sessionKey}:invalidated`, 3600, JSON.stringify(invalidatedSession));
    }

    // Delete the active session
    await redis.del(`${SESSION_KEY_PREFIX}${sessionId}`);
  }

  /**
   * Invalidates all sessions for a user (e.g., on password change)
   */
  static async invalidateAllUserSessions(userId: string): Promise<void> {
    const redis = getRedisClient();
    const sessionId = await redis.get(`${USER_SESSION_KEY_PREFIX}${userId}`);

    if (sessionId) {
      await this.invalidateSession(sessionId, 'password_change');
    }
  }

  /**
   * Links a token JTI to a session (for logout tracking)
   */
  static async linkTokenToSession(sessionId: string, jti: string): Promise<void> {
    const session = await this.getSession(sessionId);

    if (session) {
      session.jti = jti;
      const redis = getRedisClient();
      const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;

      // Get remaining TTL
      const ttl = await redis.ttl(sessionKey);
      if (ttl > 0) {
        await redis.setex(sessionKey, ttl, JSON.stringify(session));
      }
    }
  }

  /**
   * Gets session expiry constants for external use
   */
  static getExpiryConstants() {
    return {
      SESSION_INACTIVITY_EXPIRY,
      ABSOLUTE_SESSION_EXPIRY,
      REMEMBER_ME_SESSION_EXPIRY,
    };
  }
}
