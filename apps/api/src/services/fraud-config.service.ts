/**
 * Fraud Configuration Service
 *
 * Manages fraud detection thresholds with Redis caching and temporal versioning.
 * Thresholds are NEVER updated — new versions are always INSERTed.
 *
 * Created in Story 4.3 (Fraud Engine Configurable Thresholds).
 *
 * @see ADR-003 — Fraud Detection Engine Design
 */

import { Redis } from 'ioredis';
import { db } from '../db/index.js';
import { fraudThresholds } from '../db/schema/index.js';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import type { FraudThresholdConfig, HeuristicCategory } from '@oslsr/types';
import pino from 'pino';

const logger = pino({ name: 'fraud-config-service' });

// Redis key patterns
const REDIS_KEY_ACTIVE_THRESHOLDS = 'fraud:thresholds:active';
const REDIS_TTL_SECONDS = 300; // 5 minutes

// Lazy-initialized Redis client (avoid connection during test imports)
let redisClient: Redis | null = null;

const getRedisClient = (): Redis => {
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return redisClient;
};

const isTestMode = () => process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

/**
 * Maps a DB row to FraudThresholdConfig interface.
 * Drizzle returns numeric columns as strings — convert to numbers.
 */
function toThresholdConfig(row: typeof fraudThresholds.$inferSelect): FraudThresholdConfig {
  return {
    id: row.id,
    ruleKey: row.ruleKey,
    displayName: row.displayName,
    ruleCategory: row.ruleCategory as HeuristicCategory,
    thresholdValue: Number(row.thresholdValue),
    weight: row.weight ? Number(row.weight) : null,
    severityFloor: row.severityFloor,
    isActive: row.isActive,
    effectiveFrom: row.effectiveFrom.toISOString(),
    effectiveUntil: row.effectiveUntil?.toISOString() ?? null,
    version: row.version,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    notes: row.notes,
  };
}

export class FraudConfigService {
  /**
   * Get all active thresholds (current versions only).
   * Reads from Redis cache first, falls back to DB.
   */
  static async getActiveThresholds(): Promise<FraudThresholdConfig[]> {
    // Try cache first (skip in test mode)
    if (!isTestMode()) {
      try {
        const cached = await getRedisClient().get(REDIS_KEY_ACTIVE_THRESHOLDS);
        if (cached) {
          logger.debug({ event: 'fraud.config.cache_hit' });
          return JSON.parse(cached);
        }
      } catch (err) {
        logger.warn({ event: 'fraud.config.cache_error', error: String(err) });
        // Fall through to DB query
      }
    }

    // Query DB: active thresholds where effective_until IS NULL (current version)
    const rows = await db
      .select()
      .from(fraudThresholds)
      .where(and(
        eq(fraudThresholds.isActive, true),
        isNull(fraudThresholds.effectiveUntil),
      ))
      .orderBy(fraudThresholds.ruleCategory, fraudThresholds.ruleKey);

    const configs = rows.map(toThresholdConfig);

    // Cache result (skip in test mode)
    if (!isTestMode()) {
      try {
        await getRedisClient().setex(
          REDIS_KEY_ACTIVE_THRESHOLDS,
          REDIS_TTL_SECONDS,
          JSON.stringify(configs),
        );
        logger.debug({ event: 'fraud.config.cache_set', count: configs.length });
      } catch (err) {
        logger.warn({ event: 'fraud.config.cache_set_error', error: String(err) });
      }
    }

    return configs;
  }

  /**
   * Get a single threshold value by rule key.
   * Uses getActiveThresholds (cached) and filters.
   */
  static async getThresholdValue(ruleKey: string): Promise<number | null> {
    const thresholds = await FraudConfigService.getActiveThresholds();
    const found = thresholds.find((t) => t.ruleKey === ruleKey);
    return found?.thresholdValue ?? null;
  }

  /**
   * Get thresholds grouped by category for UI display.
   */
  static async getThresholdsByCategory(): Promise<Record<string, FraudThresholdConfig[]>> {
    const thresholds = await FraudConfigService.getActiveThresholds();
    const grouped: Record<string, FraudThresholdConfig[]> = {};

    for (const threshold of thresholds) {
      const category = threshold.ruleCategory;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(threshold);
    }

    return grouped;
  }

  /**
   * Update a threshold by creating a new version.
   * NEVER updates existing rows — always INSERT new, close previous.
   *
   * @param ruleKey - The rule to update
   * @param newValue - New threshold value
   * @param adminId - Admin performing the update
   * @param options - Optional weight, severityFloor, isActive, notes
   */
  static async updateThreshold(
    ruleKey: string,
    newValue: number,
    adminId: string,
    options?: {
      weight?: number;
      severityFloor?: string;
      isActive?: boolean;
      notes?: string;
    },
  ): Promise<FraudThresholdConfig> {
    // Find the current active version
    const [current] = await db
      .select()
      .from(fraudThresholds)
      .where(and(
        eq(fraudThresholds.ruleKey, ruleKey),
        isNull(fraudThresholds.effectiveUntil),
      ))
      .orderBy(desc(fraudThresholds.version))
      .limit(1);

    if (!current) {
      throw new Error(`No active threshold found for rule key: ${ruleKey}`);
    }

    const now = new Date();
    const newVersion = current.version + 1;

    // Transaction: close current version + insert new version
    const [newRow] = await db.transaction(async (tx) => {
      // Close previous version
      await tx
        .update(fraudThresholds)
        .set({ effectiveUntil: now })
        .where(eq(fraudThresholds.id, current.id));

      // Insert new version
      return tx
        .insert(fraudThresholds)
        .values({
          ruleKey: current.ruleKey,
          displayName: current.displayName,
          ruleCategory: current.ruleCategory,
          thresholdValue: String(newValue),
          weight: options?.weight !== undefined ? String(options.weight) : current.weight,
          severityFloor: options?.severityFloor ?? current.severityFloor,
          isActive: options?.isActive ?? current.isActive,
          effectiveFrom: now,
          effectiveUntil: null,
          version: newVersion,
          createdBy: adminId,
          notes: options?.notes ?? null,
        })
        .returning();
    });

    // Immediately invalidate Redis cache (AC 4.3.5: explicit DEL, not TTL-only)
    await FraudConfigService.invalidateCache();

    // Audit log
    logger.info({
      event: 'fraud.threshold.updated',
      ruleKey,
      oldValue: Number(current.thresholdValue),
      newValue,
      oldVersion: current.version,
      newVersion,
      adminId,
    });

    return toThresholdConfig(newRow);
  }

  /**
   * Invalidate all fraud threshold cache keys.
   * Called after any threshold update for immediate-apply semantics.
   */
  static async invalidateCache(): Promise<void> {
    if (isTestMode()) return;

    try {
      await getRedisClient().del(REDIS_KEY_ACTIVE_THRESHOLDS);
      logger.info({ event: 'fraud.config.cache_invalidated' });
    } catch (err) {
      logger.error({ event: 'fraud.config.cache_invalidate_error', error: String(err) });
    }
  }

  /**
   * Get the current maximum config version across all active thresholds.
   * Used for config_snapshot_version in fraud_detections.
   */
  static async getCurrentConfigVersion(): Promise<number> {
    const [result] = await db
      .select({ maxVersion: sql<number>`COALESCE(MAX(${fraudThresholds.version}), 1)` })
      .from(fraudThresholds)
      .where(and(
        eq(fraudThresholds.isActive, true),
        isNull(fraudThresholds.effectiveUntil),
      ));

    return result?.maxVersion ?? 1;
  }
}
