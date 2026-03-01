/**
 * View-As Service — Redis-based session management for Super Admin role previewing
 *
 * Allows Super Admin to view other role's dashboards in a sandboxed, read-only context.
 * Sessions are stored in Redis with a 30-minute TTL as a safety net.
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { Redis } from 'ioredis';
import { AppError } from '@oslsr/utils';
import { AuditService } from './audit.service.js';
import pino from 'pino';

const logger = pino({ name: 'view-as-service' });

// Redis key prefix
const VIEW_AS_KEY_PREFIX = 'view_as:';

// Session TTL: 30 minutes (auto-expire safety net)
const VIEW_AS_TTL_SECONDS = 30 * 60; // 1800 seconds

// Roles that cannot be viewed-as
const EXCLUDED_ROLES = ['super_admin', 'public_user'] as const;

// Field roles that require LGA selection
const FIELD_ROLES = ['enumerator', 'supervisor'] as const;

// Valid viewable roles
const VIEWABLE_ROLES = [
  'supervisor',
  'enumerator',
  'data_entry_clerk',
  'verification_assessor',
  'government_official',
] as const;

export interface ViewAsSession {
  targetRole: string;
  targetLgaId: string | null;
  reason: string | null;
  startedAt: string;
  expiresAt: string;
}

interface ReqLike {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}

interface StartViewAsParams {
  adminId: string;
  targetRole: string;
  targetLgaId?: string;
  reason?: string;
  req: ReqLike;
}

// Redis client (lazy-initialized singleton to avoid connection during test imports)
let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

export class ViewAsService {
  /**
   * Start a View-As session for a Super Admin.
   * Stores session in Redis with 30-minute TTL.
   */
  static async startViewAs(params: StartViewAsParams): Promise<ViewAsSession> {
    const { adminId, targetRole, targetLgaId, reason, req } = params;

    // Validate: targetRole is not super_admin
    if (targetRole === 'super_admin') {
      throw new AppError('VIEW_AS_INVALID_ROLE', 'Cannot view-as Super Admin', 400);
    }

    // Validate: targetRole is not public_user
    if (targetRole === 'public_user') {
      throw new AppError('VIEW_AS_INVALID_ROLE', 'Cannot view-as Public User', 400);
    }

    // Validate: targetRole is a valid viewable role
    if (!VIEWABLE_ROLES.includes(targetRole as (typeof VIEWABLE_ROLES)[number])) {
      throw new AppError('VIEW_AS_INVALID_ROLE', `Invalid target role: ${targetRole}`, 400);
    }

    // Validate: field roles require LGA
    if (FIELD_ROLES.includes(targetRole as (typeof FIELD_ROLES)[number]) && !targetLgaId) {
      throw new AppError('VIEW_AS_LGA_REQUIRED', 'LGA selection is required for field roles', 400);
    }

    // Check: no existing View-As session active
    const redis = getRedisClient();
    const existing = await redis.get(`${VIEW_AS_KEY_PREFIX}${adminId}`);
    if (existing) {
      throw new AppError('VIEW_AS_ALREADY_ACTIVE', 'View-As session already active', 409);
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + VIEW_AS_TTL_SECONDS * 1000);

    const session: ViewAsSession = {
      targetRole,
      targetLgaId: targetLgaId ?? null,
      reason: reason ?? null,
      startedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };

    // Store in Redis with TTL
    await redis.set(
      `${VIEW_AS_KEY_PREFIX}${adminId}`,
      JSON.stringify(session),
      'EX',
      VIEW_AS_TTL_SECONDS,
    );

    // Audit log: fire-and-forget
    AuditService.logAction({
      actorId: adminId,
      action: 'view_as.start',
      targetResource: 'user',
      targetId: adminId,
      details: {
        targetRole,
        targetLgaId: targetLgaId ?? null,
        reason: reason ?? null,
      },
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: (Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent']) || 'unknown',
    });

    logger.info({ adminId, targetRole, targetLgaId }, 'View-As session started');

    return session;
  }

  /**
   * End a View-As session, compute duration, clean up Redis.
   */
  static async endViewAs(
    adminId: string,
    req: ReqLike,
  ): Promise<{ duration: number }> {
    const redis = getRedisClient();
    const raw = await redis.get(`${VIEW_AS_KEY_PREFIX}${adminId}`);

    if (!raw) {
      throw new AppError('VIEW_AS_NOT_FOUND', 'No active View-As session', 404);
    }

    const session: ViewAsSession = JSON.parse(raw);
    const duration = Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000);

    // Delete from Redis
    await redis.del(`${VIEW_AS_KEY_PREFIX}${adminId}`);

    // Audit log: fire-and-forget
    AuditService.logAction({
      actorId: adminId,
      action: 'view_as.end',
      targetResource: 'user',
      targetId: adminId,
      details: {
        targetRole: session.targetRole,
        targetLgaId: session.targetLgaId,
        duration,
      },
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: (Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent']) || 'unknown',
    });

    logger.info({ adminId, targetRole: session.targetRole, duration }, 'View-As session ended');

    return { duration };
  }

  /**
   * Get the current View-As state for an admin (or null if not active).
   */
  static async getViewAsState(adminId: string): Promise<ViewAsSession | null> {
    const redis = getRedisClient();
    const raw = await redis.get(`${VIEW_AS_KEY_PREFIX}${adminId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ViewAsSession;
  }

  /**
   * Boolean check: is admin currently in View-As mode?
   */
  static async isViewingAs(adminId: string): Promise<boolean> {
    const state = await ViewAsService.getViewAsState(adminId);
    return state !== null;
  }
}
