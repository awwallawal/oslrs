/**
 * Productivity Target Service
 *
 * Manages configurable daily submission targets with temporal versioning.
 * System-wide default (lgaId = NULL) plus optional per-LGA overrides.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 * Follows FraudConfigService temporal versioning pattern.
 */

import { Redis } from 'ioredis';
import { db } from '../db/index.js';
import { productivityTargets, lgas } from '../db/schema/index.js';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import type { ProductivityTarget } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'productivity-target-service' });

const REDIS_KEY_TARGETS = 'productivity:targets:active';
const REDIS_TTL_SECONDS = 300; // 5 minutes

let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

/** Default daily target if no record exists */
const FALLBACK_DEFAULT_TARGET = 25;

export class ProductivityTargetService {
  /**
   * Get the active daily target for a specific LGA.
   * Returns per-LGA override if exists, otherwise system default.
   */
  static async getTargetForLga(lgaId?: string | null): Promise<number> {
    const targets = await ProductivityTargetService.getActiveTargets();

    // Check for per-LGA override first
    if (lgaId) {
      const lgaOverride = targets.lgaOverrides.find((o) => o.lgaId === lgaId);
      if (lgaOverride) return lgaOverride.dailyTarget;
    }

    return targets.defaultTarget;
  }

  /**
   * Get all active targets (system default + per-LGA overrides).
   * Uses Redis cache with 5-minute TTL.
   */
  static async getActiveTargets(): Promise<ProductivityTarget> {
    // Try cache first (skip in test mode)
    if (!isTestMode()) {
      try {
        const cached = await getRedisClient().get(REDIS_KEY_TARGETS);
        if (cached) {
          logger.debug({ event: 'productivity.targets.cache_hit' });
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ event: 'productivity.targets.cache_error', error: String(err) });
      }
    }

    // Query DB: all active targets (effectiveUntil IS NULL)
    const rows = await db
      .select()
      .from(productivityTargets)
      .where(isNull(productivityTargets.effectiveUntil));

    // Find system-wide default (lgaId IS NULL)
    const defaultRow = rows.find((r) => r.lgaId === null);
    const defaultTarget = defaultRow?.dailyTarget ?? FALLBACK_DEFAULT_TARGET;

    // Collect per-LGA overrides (lgaId IS NOT NULL) and resolve display names
    const lgaIdOverrides = rows.filter((r) => r.lgaId !== null);
    let lgaNameMap = new Map<string, string>();
    if (lgaIdOverrides.length > 0) {
      const lgaIds = lgaIdOverrides.map((r) => r.lgaId!);
      const lgaRecords = await db
        .select({ id: lgas.id, name: lgas.name })
        .from(lgas)
        .where(inArray(lgas.id, lgaIds));
      lgaNameMap = new Map(lgaRecords.map((r) => [r.id, r.name]));
    }
    const lgaOverrides = lgaIdOverrides.map((r) => ({
      lgaId: r.lgaId!,
      lgaName: lgaNameMap.get(r.lgaId!) ?? r.lgaId!,
      dailyTarget: r.dailyTarget,
    }));

    const result: ProductivityTarget = { defaultTarget, lgaOverrides };

    // Cache result
    if (!isTestMode()) {
      try {
        await getRedisClient().setex(REDIS_KEY_TARGETS, REDIS_TTL_SECONDS, JSON.stringify(result));
        logger.debug({ event: 'productivity.targets.cache_set' });
      } catch (err) {
        logger.warn({ event: 'productivity.targets.cache_set_error', error: String(err) });
      }
    }

    return result;
  }

  /**
   * Update targets using temporal versioning.
   * Closes current active record (effectiveUntil) and inserts new (effectiveFrom).
   */
  static async updateTargets(
    updates: { defaultTarget?: number; lgaOverrides?: Array<{ lgaId: string; dailyTarget: number }> },
    adminId: string,
  ): Promise<ProductivityTarget> {
    const now = new Date();

    await db.transaction(async (tx) => {
      // Update system-wide default if provided
      if (updates.defaultTarget !== undefined) {
        const [current] = await tx
          .select()
          .from(productivityTargets)
          .where(and(isNull(productivityTargets.lgaId), isNull(productivityTargets.effectiveUntil)));

        if (current) {
          // Close current version
          await tx
            .update(productivityTargets)
            .set({ effectiveUntil: now })
            .where(eq(productivityTargets.id, current.id));
        }

        // Insert new version
        await tx.insert(productivityTargets).values({
          lgaId: null,
          dailyTarget: updates.defaultTarget,
          effectiveFrom: now,
          effectiveUntil: null,
          createdBy: adminId,
        });
      }

      // Update per-LGA overrides if provided
      if (updates.lgaOverrides) {
        for (const override of updates.lgaOverrides) {
          const [current] = await tx
            .select()
            .from(productivityTargets)
            .where(and(
              eq(productivityTargets.lgaId, override.lgaId),
              isNull(productivityTargets.effectiveUntil),
            ));

          if (current) {
            await tx
              .update(productivityTargets)
              .set({ effectiveUntil: now })
              .where(eq(productivityTargets.id, current.id));
          }

          await tx.insert(productivityTargets).values({
            lgaId: override.lgaId,
            dailyTarget: override.dailyTarget,
            effectiveFrom: now,
            effectiveUntil: null,
            createdBy: adminId,
          });
        }
      }
    });

    // Invalidate cache
    await ProductivityTargetService.invalidateCache();

    logger.info({
      event: 'productivity.targets.updated',
      adminId,
      defaultTarget: updates.defaultTarget,
      lgaOverrideCount: updates.lgaOverrides?.length ?? 0,
    });

    // Return refreshed targets
    return ProductivityTargetService.getActiveTargets();
  }

  static async invalidateCache(): Promise<void> {
    if (isTestMode()) return;
    try {
      await getRedisClient().del(REDIS_KEY_TARGETS);
      logger.info({ event: 'productivity.targets.cache_invalidated' });
    } catch (err) {
      logger.error({ event: 'productivity.targets.cache_invalidate_error', error: String(err) });
    }
  }
}
