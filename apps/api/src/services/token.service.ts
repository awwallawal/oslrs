import jwt from 'jsonwebtoken';
import { getRedisClient } from '../lib/redis.js';
import { uuidv7 } from 'uuidv7';
import { AppError, sha256Hex } from '@oslsr/utils';
import type { JwtPayload, AuthUser } from '@oslsr/types';

// Token expiry constants (in seconds)
const ACCESS_TOKEN_EXPIRY = 15 * 60;           // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

// Session expiry constants
const SESSION_INACTIVITY_EXPIRY = 8 * 60 * 60;       // 8 hours
const ABSOLUTE_SESSION_EXPIRY = 24 * 60 * 60;        // 24 hours (default)
const REMEMBER_ME_SESSION_EXPIRY = 30 * 24 * 60 * 60; // 30 days

// Redis key patterns
const BLACKLIST_KEY_PREFIX = 'jwt:blacklist:';
const REFRESH_TOKEN_KEY_PREFIX = 'refresh:';
const USER_REFRESH_KEY_PREFIX = 'user_refresh_token:';
// F-022 (Story 9-42): tombstone for a rotated (consumed) refresh token. Presenting
// a tombstoned token at /refresh is a replay → the whole token family is revoked.
const CONSUMED_REFRESH_KEY_PREFIX = 'refresh_consumed:';

// M1 (Story 9-48): grace window in which a just-rotated (consumed) refresh token
// presented AGAIN is treated as benign multi-tab concurrency (re-issued) rather
// than a replay (family-revoke). One httpOnly cookie is shared across tabs, each
// with its own proactive refresh timer, so a near-simultaneous second /refresh is
// normal. Kept SMALL to bound the stolen-then-just-rotated replay window; outside
// it, full F-022 reuse detection + family revoke is unchanged.
const REFRESH_ROTATION_GRACE_SECONDS = 10;

/**
 * OPS-3 (Story 9-48): persisted shape of a consumed-token tombstone. Stored as
 * JSON (not a bare userId) so the grace-window branch can re-mint a full session
 * (userId + sessionId + rememberMe) for a benign multi-tab replay, and decide
 * benign-vs-replay from `rotatedAt`. Never carries a usable plaintext token.
 */
export interface RefreshTokenTombstone {
  userId: string;
  sessionId: string;
  rememberMe: boolean;
  rotatedAt: number; // epoch ms at rotation
}

export class TokenService {
  private static isTestMode(): boolean {
    return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  }

  /**
   * OPS-3 (sec-r2 / Story 9-48): SHA-256 hex of a refresh token for storage and
   * lookup AT REST. Refresh tokens are persisted ONLY as this hash — the active
   * entry key (`refresh:<hash>`), the per-user reverse-index VALUE, and the
   * consumed-token tombstone key (`refresh_consumed:<hash>`). The plaintext exists
   * only in transit (the httpOnly cookie) and in the return values that set it.
   *
   * Delegates to the shared `sha256Hex` primitive — identical rationale to
   * F-011/OPS-2: refresh tokens are `uuidv7()` (high-entropy random), so unsalted
   * SHA-256 carries no dictionary/rainbow risk a salt would defend, and a per-token
   * salt would break the lookup-by-hash design. A secondary Redis-backup leak thus
   * cannot be replayed into account takeover.
   */
  private static hashToken(token: string): string {
    return sha256Hex(token);
  }

  /**
   * M1 (Story 9-48): true if a consumed token was rotated within the grace window
   * (benign multi-tab concurrency), false otherwise (treat as replay → revoke).
   *
   * Uses wall-clock (`Date.now()` vs the stored `rotatedAt`). Correct on the single
   * VPS today. If the API is ever scaled horizontally, inter-instance clock skew
   * would shift the grace boundary by that skew — keep instances NTP-synced, or move
   * the decision to a Redis-server-relative timestamp, before multi-instance deploy.
   */
  static isWithinRotationGrace(rotatedAt: number): boolean {
    return Date.now() - rotatedAt <= REFRESH_ROTATION_GRACE_SECONDS * 1000;
  }

  private static getJwtSecret(): string {
    if (this.isTestMode()) {
      return process.env.JWT_SECRET || 'test-jwt-secret-minimum-32-characters-long';
    }
    if (!process.env.JWT_SECRET) {
      throw new AppError('MISSING_JWT_SECRET', 'JWT_SECRET environment variable is required', 500);
    }
    return process.env.JWT_SECRET;
  }

  /**
   * Returns the refresh token signing secret.
   * Currently unused — refresh tokens use opaque UUIDs stored in Redis.
   * Retained as defense-in-depth for future JWT-signed refresh tokens.
   */
  private static getRefreshSecret(): string {
    if (this.isTestMode()) {
      return process.env.REFRESH_TOKEN_SECRET || 'test-refresh-secret-minimum-32-chars-long';
    }
    if (!process.env.REFRESH_TOKEN_SECRET) {
      throw new AppError('MISSING_REFRESH_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET environment variable is required', 500);
    }
    return process.env.REFRESH_TOKEN_SECRET;
  }

  /**
   * Generates an access token (JWT) for a user
   */
  static generateAccessToken(user: AuthUser, rememberMe = false): { token: string; jti: string; expiresIn: number } {
    const jti = uuidv7();

    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub: user.id,
      jti,
      role: user.role,
      lgaId: user.lgaId,
      email: user.email,
      rememberMe,
    };

    const token = jwt.sign(payload, this.getJwtSecret(), {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    return {
      token,
      jti,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  /**
   * Generates a refresh token and stores it in Redis
   */
  static async generateRefreshToken(userId: string, sessionId: string, rememberMe = false): Promise<string> {
    const redis = getRedisClient();
    const refreshToken = uuidv7();

    // Calculate expiry based on Remember Me
    const expirySeconds = rememberMe ? REMEMBER_ME_SESSION_EXPIRY : REFRESH_TOKEN_EXPIRY;

    // OPS-3 (Story 9-48): persist ONLY the hash at rest; the plaintext is returned
    // for the httpOnly cookie and never stored.
    const tokenHash = this.hashToken(refreshToken);

    // M2 (Story 9-48 review): enforce AT-MOST-ONE active refresh token per user.
    // The system is single-session by design (`users.currentSessionId` is single-
    // valued; logout invalidates by userId via the reverse index). Without this,
    // a superseded token — e.g. the loser of a multi-tab grace re-issue, or a token
    // replaced by a fresh login — is orphaned in the `refresh:` keyspace: the single-
    // valued reverse index forgets it, so a later logout/revoke (which delete only
    // the reverse-indexed entry) leave it live until TTL (up to 30d w/ rememberMe).
    // Reaping the prior entry here keeps the reverse index an accurate, complete
    // record of the user's one live token, so logout/revoke are exhaustive. The
    // shared httpOnly cookie always carries the latest token, so a reaped orphan is
    // never presented by a legitimate client — this is pure at-rest cleanup.
    const priorHash = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
    if (priorHash && priorHash !== tokenHash) {
      await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${priorHash}`);
    }

    // Store refresh token in Redis with metadata, keyed by the hash.
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${tokenHash}`;
    await redis.setex(key, expirySeconds, JSON.stringify({
      userId,
      sessionId,
      rememberMe,
      createdAt: new Date().toISOString(),
    }));

    // Maintain reverse index for efficient user-level revocation. The VALUE is the
    // hash (not the plaintext), so user-level deletes operate directly on the hash.
    await redis.setex(`${USER_REFRESH_KEY_PREFIX}${userId}`, expirySeconds, tokenHash);

    return refreshToken;
  }

  /**
   * Validates a refresh token and returns associated data
   */
  static async validateRefreshToken(refreshToken: string): Promise<{
    userId: string;
    sessionId: string;
    rememberMe: boolean;
    createdAt: string;
  } | null> {
    const redis = getRedisClient();
    // OPS-3 (Story 9-48): hash the incoming plaintext before the lookup — Redis is
    // keyed by hash, so a leaked at-rest hash presented AS a token re-hashes to a
    // miss (proves the at-rest value is not itself a usable bearer secret).
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${this.hashToken(refreshToken)}`;

    const data = await redis.get(key);
    if (!data) {
      return null;
    }

    return JSON.parse(data);
  }

  /**
   * Invalidates a refresh token (e.g., on logout) and cleans up reverse index
   */
  static async invalidateRefreshToken(refreshToken: string): Promise<void> {
    const redis = getRedisClient();
    // OPS-3 (Story 9-48): hash the incoming plaintext for the active-entry read/del.
    const tokenHash = this.hashToken(refreshToken);
    const key = `${REFRESH_TOKEN_KEY_PREFIX}${tokenHash}`;

    // Read token data to get userId for reverse index cleanup
    const data = await redis.get(key);
    await redis.del(key);

    if (data) {
      const { userId } = JSON.parse(data);
      // Clean up reverse index if it still points to this token. The reverse-index
      // VALUE is the hash (OPS-3), so compare against the hash, not the plaintext.
      const currentToken = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      if (currentToken === tokenHash) {
        await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      }
    }
  }

  /**
   * F-012 (Story 9-42): positively invalidate a user's active refresh token at
   * logout, via the reverse index. Unlike `revokeAllUserTokens`, this does NOT
   * stamp a global `tokens_revoked_at` timestamp — logout already blacklists the
   * access-token JTI, and skipping the timestamp avoids a sub-second
   * logout→re-login race where a freshly issued access token could be wrongly
   * treated as revoked. Returns the number of refresh tokens deleted (0 or 1).
   */
  static async invalidateUserRefreshTokens(userId: string): Promise<number> {
    const redis = getRedisClient();
    // OPS-3 (Story 9-48): the reverse-index VALUE is already the hash, so the
    // active-entry delete operates on it directly — no re-hash needed.
    const tokenHash = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
    if (tokenHash) {
      await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${tokenHash}`);
      await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      return 1;
    }
    return 0;
  }

  /**
   * F-022 (Story 9-42): rotate a refresh token on use (one-time-use semantics).
   * Tombstones the presented token (so a later replay is caught as reuse), deletes
   * its active entry, and mints a brand-new refresh token (which also overwrites
   * the per-user reverse index). The tombstone TTL matches the token's own
   * lifetime so the full replay window is covered.
   *
   * Concurrency note (multi-tab) — read honestly: if two /refresh calls read the
   * SAME active token BEFORE either rotates, both mint a new token and the last
   * Set-Cookie wins — no tombstone is presented, so reuse detection does NOT fire.
   * BUT there is a narrow RESIDUAL race: if tab B's validateRefreshToken runs
   * AFTER tab A has already rotated (active entry deleted + tombstone set), tab B
   * presents the now-consumed token and DOES trip reuse detection → the whole
   * family is revoked → both tabs are forced to re-log-in. This is ACCEPTED: the
   * window is sub-second, the consequence is a benign forced re-login (not account
   * compromise), and erring toward revoke is the safe default against a genuine
   * stolen-token replay. M1 (Story 9-48) softens this for the multi-tab case via a
   * short grace window (see `isWithinRotationGrace` + AuthService.refreshToken):
   * within the window a consumed-token presentation is RE-ISSUED, not revoked.
   */
  static async rotateRefreshToken(
    oldToken: string,
    userId: string,
    sessionId: string,
    rememberMe = false,
  ): Promise<string> {
    const redis = getRedisClient();
    const ttlSeconds = rememberMe ? REMEMBER_ME_SESSION_EXPIRY : REFRESH_TOKEN_EXPIRY;

    // OPS-3 (Story 9-48): tombstone + active-entry delete are keyed by the HASH.
    const oldHash = this.hashToken(oldToken);

    // M1 (Story 9-48): tombstone VALUE carries the data needed to re-mint a full
    // session for an in-grace multi-tab replay (userId + sessionId + rememberMe)
    // plus `rotatedAt` to decide benign-vs-replay. No usable plaintext at rest.
    const tombstone: RefreshTokenTombstone = {
      userId,
      sessionId,
      rememberMe,
      rotatedAt: Date.now(),
    };

    // Tombstone the consumed token for the full replay window, then retire it.
    await redis.setex(`${CONSUMED_REFRESH_KEY_PREFIX}${oldHash}`, ttlSeconds, JSON.stringify(tombstone));
    await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${oldHash}`);

    // Mint the replacement (updates the reverse index to the new token).
    return this.generateRefreshToken(userId, sessionId, rememberMe);
  }

  /**
   * F-022 / M1 (Story 9-48): returns the consumed (tombstoned) refresh token's
   * record, or null if the token was never rotated. A non-null result at /refresh
   * means the token was already consumed — within the grace window it is benign
   * multi-tab concurrency (re-issue); outside it, a replay (revoke the family).
   * OPS-3: the incoming plaintext is hashed before the lookup.
   */
  static async getConsumedRefreshToken(token: string): Promise<RefreshTokenTombstone | null> {
    const redis = getRedisClient();
    const raw = await redis.get(`${CONSUMED_REFRESH_KEY_PREFIX}${this.hashToken(token)}`);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as RefreshTokenTombstone;
  }

  /**
   * F-022: clears a consumed-token tombstone (called after reuse detection has
   * revoked the family, so the same replay can't repeatedly trigger revocation).
   * OPS-3 (Story 9-48): hash the incoming plaintext before the delete.
   */
  static async clearConsumedRefreshToken(token: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(`${CONSUMED_REFRESH_KEY_PREFIX}${this.hashToken(token)}`);
  }

  /**
   * Verifies an access token and returns the payload
   */
  static verifyAccessToken(token: string): JwtPayload {
    try {
      const decoded = jwt.verify(token, this.getJwtSecret()) as JwtPayload;
      return decoded;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new AppError('AUTH_SESSION_EXPIRED', 'Session has expired', 401);
      }
      if (error instanceof jwt.JsonWebTokenError) {
        throw new AppError('AUTH_INVALID_TOKEN', 'Invalid token', 401);
      }
      throw error;
    }
  }

  /**
   * Adds a token's JTI to the blacklist (for logout/revocation)
   */
  static async addToBlacklist(jti: string, expiresIn?: number): Promise<void> {
    const redis = getRedisClient();
    const key = `${BLACKLIST_KEY_PREFIX}${jti}`;

    // Set TTL to token's remaining lifetime or default 24 hours
    const ttl = expiresIn || ABSOLUTE_SESSION_EXPIRY;
    await redis.setex(key, ttl, 'revoked');
  }

  /**
   * Checks if a token's JTI is blacklisted
   */
  static async isBlacklisted(jti: string): Promise<boolean> {
    const redis = getRedisClient();
    const key = `${BLACKLIST_KEY_PREFIX}${jti}`;
    const result = await redis.exists(key);
    return result === 1;
  }

  /**
   * Invalidates all tokens for a user (e.g., after password change)
   * This works by tracking a "revoke before" timestamp
   */
  static async invalidateAllUserTokens(userId: string): Promise<void> {
    const redis = getRedisClient();
    // Store timestamp - any token issued before this is invalid
    await redis.set(`user:${userId}:tokens_revoked_at`, Date.now().toString());
  }

  /**
   * Revokes all tokens for a user: sets revocation timestamp AND deletes refresh tokens.
   * Used on role change to force re-authentication with updated permissions.
   * Returns the number of refresh tokens deleted.
   */
  static async revokeAllUserTokens(userId: string): Promise<number> {
    const redis = getRedisClient();

    // 1. Set revocation timestamp to invalidate existing access tokens
    await redis.set(`user:${userId}:tokens_revoked_at`, Date.now().toString());

    // 2. Delete user's refresh token via reverse index. OPS-3 (Story 9-48): the
    // reverse-index VALUE is the token HASH, not the plaintext — delete by it directly.
    const tokenHash = await redis.get(`${USER_REFRESH_KEY_PREFIX}${userId}`);
    if (tokenHash) {
      await redis.del(`${REFRESH_TOKEN_KEY_PREFIX}${tokenHash}`);
      await redis.del(`${USER_REFRESH_KEY_PREFIX}${userId}`);
      return 1;
    }

    return 0;
  }

  /**
   * Checks if a token was issued before user's tokens were revoked
   */
  static async isTokenRevokedByTimestamp(userId: string, issuedAt: number): Promise<boolean> {
    const redis = getRedisClient();
    const revokedAt = await redis.get(`user:${userId}:tokens_revoked_at`);

    if (!revokedAt) {
      return false;
    }

    // Token is revoked if it was issued before the revocation timestamp
    return issuedAt * 1000 < parseInt(revokedAt, 10);
  }

  /**
   * Gets token expiry constants for external use
   */
  static getExpiryConstants() {
    return {
      ACCESS_TOKEN_EXPIRY,
      REFRESH_TOKEN_EXPIRY,
      SESSION_INACTIVITY_EXPIRY,
      ABSOLUTE_SESSION_EXPIRY,
      REMEMBER_ME_SESSION_EXPIRY,
    };
  }
}
