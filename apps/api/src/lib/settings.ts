/**
 * prep-settings-landing-and-feature-flags — typed key-value settings accessor.
 *
 * Read-fast / write-audited semantics for `system_settings`:
 *   - getSetting<T>(key)     — Redis-cached for 60s; falls through to DB on miss.
 *   - getSettingRow(key)     — full row (incl. description + audit metadata);
 *                              uncached, used by admin GET /:key.
 *   - setSetting<T>(key, ...)— transactional: SELECT FOR UPDATE → upsert →
 *                              returns prior value atomically. Caller is
 *                              responsible for invoking the audit-log emit
 *                              (typically via SettingsService).
 *   - listSettings()         — admin landing page; bypasses cache (small N).
 *
 * The type parameter T is consumer-supplied — callers cast the JSONB value to
 * their expected type. No runtime validation here; that's the caller's job
 * (typically via a typed wrapper, e.g. getSmsOtpEnabled() that calls
 * getSetting<boolean>('auth.sms_otp_enabled')).
 *
 * SECURITY NOTE: every flip is audit-logged with full old_value + new_value
 * captured in immutable hash-chain audit details. **Never store secrets here**
 * (API keys, signing keys, credentials) — they would be persisted in plain
 * text inside the audit log forever. Use environment variables or a dedicated
 * secrets store for those.
 *
 * PERFORMANCE NOTE: getSetting has no single-flight guard; on a cold cache,
 * 100 concurrent reads = 100 DB round-trips. Acceptable for super-admin-only
 * low-traffic admin tooling. If usage expands to high-frequency call sites,
 * add a Redis SETNX-based dogpile lock.
 */
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import pino from 'pino';
import { db } from '../db/index.js';
import { systemSettings } from '../db/schema/system-settings.js';
import { getRedisClient } from './redis.js';

const logger = pino({ name: 'lib-settings' });

const CACHE_PREFIX = 'settings:';
const CACHE_TTL_SECONDS = 60;

function cacheKey(key: string): string {
  return `${CACHE_PREFIX}${key}`;
}

function errDetails(err: unknown): Record<string, unknown> {
  return { cause: err instanceof Error ? err.message : String(err) };
}

export interface SettingRowShape {
  key: string;
  value: unknown;
  description: string | null;
  updatedBy: string;
  updatedAt: Date;
  createdAt: Date;
}

/**
 * Read a setting by key. Redis-cached for 60s with cache-fallthrough on miss.
 * Returns null if the key does not exist.
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();

  // Try cache first
  try {
    const cached = await redis.get(cacheKey(key));
    if (cached !== null) {
      // Sentinel for "key does not exist" cached as the literal string "__NULL__".
      // Real string values get JSON-encoded with quotes, so the bare string
      // `__NULL__` can only mean the sentinel — not a stored value.
      if (cached === '__NULL__') return null;
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn({ err, key, event: 'settings.cache_read_failed' }, 'Redis read failed; falling through to DB');
  }

  // Cache miss — read from DB
  let row: { value: unknown } | undefined;
  try {
    const result = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    row = result[0];
  } catch (err) {
    throw new AppError(
      'SETTINGS_DB_READ_FAILED',
      `Failed to read setting "${key}" from database`,
      500,
      errDetails(err),
    );
  }

  const value = row ? (row.value as T) : null;

  // Populate cache (best-effort; never block on failure)
  try {
    const payload = value === null ? '__NULL__' : JSON.stringify(value);
    await redis.set(cacheKey(key), payload, 'EX', CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key, event: 'settings.cache_write_failed' }, 'Redis cache populate failed (non-fatal)');
  }

  return value;
}

/**
 * Read the full setting row (key + value + description + audit metadata).
 * Bypasses cache — used by admin GET /:key (non-perf-critical detail view).
 * Returns null if the key does not exist.
 */
export async function getSettingRow(key: string): Promise<SettingRowShape | null> {
  try {
    const rows = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedBy: systemSettings.updatedBy,
        updatedAt: systemSettings.updatedAt,
        createdAt: systemSettings.createdAt,
      })
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    return rows[0] ?? null;
  } catch (err) {
    throw new AppError(
      'SETTINGS_DB_READ_FAILED',
      `Failed to read setting row "${key}" from database`,
      500,
      errDetails(err),
    );
  }
}

export interface SetSettingOpts {
  /** Optional description — applied on both INSERT and UPDATE when provided.
   *  Omit to preserve the existing description on UPDATE (or leave NULL on INSERT). */
  description?: string;
}

/**
 * Write a setting transactionally and return the **prior** value atomically.
 *
 * Implementation: `db.transaction { SELECT FOR UPDATE → INSERT … ON CONFLICT
 * DO UPDATE }`. The FOR UPDATE row lock serialises concurrent flips of the
 * same key, so the prior value returned to the caller is guaranteed to be
 * the value that was overwritten by *this* write — not a value from a
 * racing flip. Critical for audit-log accuracy.
 *
 * After the transaction commits, the Redis cache entry for this key is DEL'd
 * so subsequent readers see the new value within milliseconds (instead of
 * waiting up to 60s for TTL expiry). Cache invalidation is best-effort —
 * a Redis failure leaves the cache to expire naturally within the TTL window.
 *
 * NOTE: this is the low-level write. Audit-log emission is the caller's
 * responsibility (typically `SettingsService.setSetting` wraps this with the
 * SETTINGS_FLIPPED audit action, using the returned prior value).
 */
export async function setSetting<T>(
  key: string,
  value: T,
  actorId: string,
  opts?: SetSettingOpts,
): Promise<T | null> {
  let priorValue: T | null;

  try {
    priorValue = await db.transaction(async (tx) => {
      // Lock the row (or no-op if it doesn't exist) so concurrent flips of
      // the same key serialise. This guarantees the prior value we capture
      // is the value being overwritten by *this* write.
      const prior = await tx
        .select({ value: systemSettings.value })
        .from(systemSettings)
        .where(eq(systemSettings.key, key))
        .for('update')
        .limit(1);

      const oldValue = prior[0] ? (prior[0].value as T) : null;

      const insertValues: Record<string, unknown> = {
        key,
        value: value as unknown,
        updatedBy: actorId,
        updatedAt: new Date(),
      };
      const updateSet: Record<string, unknown> = {
        value: value as unknown,
        updatedBy: actorId,
        updatedAt: new Date(),
      };
      if (opts?.description !== undefined) {
        insertValues.description = opts.description;
        updateSet.description = opts.description;
      }

      await tx
        .insert(systemSettings)
        .values(insertValues as typeof systemSettings.$inferInsert)
        .onConflictDoUpdate({
          target: systemSettings.key,
          set: updateSet,
        });

      return oldValue;
    });
  } catch (err) {
    throw new AppError(
      'SETTINGS_DB_WRITE_FAILED',
      `Failed to write setting "${key}"`,
      500,
      errDetails(err),
    );
  }

  // Bust the cache (best-effort; tolerable for cache to lag briefly on Redis
  // failure since TTL would catch up within 60s).
  try {
    const redis = getRedisClient();
    await redis.del(cacheKey(key));
  } catch (err) {
    logger.warn({ err, key, event: 'settings.cache_invalidate_failed' }, 'Redis cache invalidation failed (non-fatal)');
  }

  return priorValue;
}

/**
 * List all settings. Bypasses cache — used by admin landing page only.
 */
export async function listSettings(): Promise<
  Array<{
    key: string;
    value: unknown;
    description: string | null;
    updatedBy: string;
    updatedAt: Date;
    createdAt: Date;
  }>
> {
  try {
    const rows = await db
      .select({
        key: systemSettings.key,
        value: systemSettings.value,
        description: systemSettings.description,
        updatedBy: systemSettings.updatedBy,
        updatedAt: systemSettings.updatedAt,
        createdAt: systemSettings.createdAt,
      })
      .from(systemSettings)
      .orderBy(systemSettings.key);
    return rows;
  } catch (err) {
    throw new AppError(
      'SETTINGS_DB_LIST_FAILED',
      'Failed to list settings from database',
      500,
      errDetails(err),
    );
  }
}

