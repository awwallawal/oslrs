/**
 * Audit Service — Immutable Append-Only Audit Logging with Hash Chain
 *
 * Provides two modes for audit logging:
 * - Fire-and-forget (logPiiAccess): for list views and non-critical logging
 * - Transactional (logPiiAccessTx): for use within db.transaction()
 *
 * Story 6-1 additions:
 * - SHA-256 hash chain for tamper detection
 * - Append-only enforcement via DB trigger (see drizzle/0007_audit_logs_immutable.sql)
 * - Expanded AUDIT_ACTIONS covering PII, data, auth, admin, and system events
 * - Hash chain verification endpoint
 *
 * Note: PostgreSQL superusers CAN bypass the append-only trigger — this is acceptable
 * for emergency DB maintenance, and such access is logged by PostgreSQL's own mechanisms.
 *
 * Created in prep-2 (Lightweight Audit Logging for PII Access).
 * Enhanced in Story 6-1 (Immutable Append-Only Audit Logs).
 */

import { createHash } from 'node:crypto';
import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.js';
import { sql } from 'drizzle-orm';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import type { AuthenticatedRequest } from '../types.js';

const logger = pino({ name: 'audit-service' });

/** Genesis hash — seed for the hash chain (Story 6-1, AC5) */
export const GENESIS_HASH = createHash('sha256').update('OSLRS-AUDIT-GENESIS-2026').digest('hex');

/** Comprehensive audit action types (Story 6-1, AC7) */
export const AUDIT_ACTIONS = {
  // PII Access (existing — backward compatible)
  PII_VIEW_RECORD: 'pii.view_record',
  PII_VIEW_LIST: 'pii.view_list',
  PII_EXPORT_CSV: 'pii.export_csv',
  PII_EXPORT_PDF: 'pii.export_pdf',
  PII_SEARCH: 'pii.search',
  PII_VIEW_PRODUCTIVITY: 'pii.view_productivity',
  PII_EXPORT_PRODUCTIVITY: 'pii.export_productivity',
  // Data Modification
  DATA_CREATE: 'data.create',
  DATA_UPDATE: 'data.update',
  DATA_DELETE: 'data.delete',
  // Authentication
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_PASSWORD_CHANGE: 'auth.password_change',
  AUTH_TOKEN_REFRESH: 'auth.token_refresh',
  // Admin Actions
  ADMIN_USER_DEACTIVATE: 'admin.user_deactivate',
  ADMIN_USER_REACTIVATE: 'admin.user_reactivate',
  ADMIN_ROLE_CHANGE: 'admin.role_change',
  ADMIN_CONFIG_UPDATE: 'admin.config_update',
  // System Events
  SYSTEM_BACKUP: 'system.backup',
  SYSTEM_RESTORE: 'system.restore',
  SYSTEM_MIGRATION: 'system.migration',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * Backward-compatible PII_ACTIONS alias (Task 5.2).
 * Existing 9 consumer call sites continue using PII_ACTIONS unchanged.
 */
export const PII_ACTIONS = {
  VIEW_RECORD: AUDIT_ACTIONS.PII_VIEW_RECORD,
  VIEW_LIST: AUDIT_ACTIONS.PII_VIEW_LIST,
  EXPORT_CSV: AUDIT_ACTIONS.PII_EXPORT_CSV,
  EXPORT_PDF: AUDIT_ACTIONS.PII_EXPORT_PDF,
  SEARCH_PII: AUDIT_ACTIONS.PII_SEARCH,
  VIEW_PRODUCTIVITY: AUDIT_ACTIONS.PII_VIEW_PRODUCTIVITY,
  EXPORT_PRODUCTIVITY: AUDIT_ACTIONS.PII_EXPORT_PRODUCTIVITY,
} as const;

export type PiiAction = (typeof PII_ACTIONS)[keyof typeof PII_ACTIONS];

/**
 * Canonical JSON stringification for hash consistency across JSONB round-trips.
 * PostgreSQL JSONB may reorder object keys; this ensures deterministic output
 * by sorting keys at every nesting level.
 */
function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) return '{}';
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val).sort()) {
        sorted[k] = val[k];
      }
      return sorted;
    }
    return val;
  });
}

/** Transaction type inferred from Drizzle db.transaction callback */
type DbTransaction = Parameters<Parameters<typeof db['transaction']>[0]>[0];

export interface HashChainVerificationResult {
  valid: boolean;
  totalRecords: number;
  verified: number;
  firstTampered?: { id: string; createdAt: Date };
}

export class AuditService {
  /**
   * Compute SHA-256 hash for a single audit record (Task 3.1).
   * Formula: SHA256(id | action | actorId | createdAt | canonicalJSON(details) | previousHash)
   */
  static computeHash(
    id: string,
    action: string,
    actorId: string | null,
    createdAt: Date,
    details: unknown,
    previousHash: string,
  ): string {
    const payload = `${id}|${action}|${actorId ?? 'SYSTEM'}|${createdAt.toISOString()}|${canonicalJsonStringify(details)}|${previousHash}`;
    return createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Fire-and-forget PII access logging with hash chain.
   * Does NOT await — failures are logged as warnings but never throw.
   * Signature unchanged from original for backward compatibility (Task 6.1).
   */
  static logPiiAccess(
    req: AuthenticatedRequest,
    action: PiiAction,
    targetResource: string,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): void {
    const id = uuidv7();
    const mergedDetails = {
      ...details,
      actorRole: req.user.role,
    };
    const createdAt = new Date();

    // Wrap in transaction for hash chain serialization (Task 3.4)
    db.transaction(async (tx) => {
      // Lock the most recent record to serialize concurrent hash chain inserts
      const prevResult = await tx.execute(
        sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
      );
      const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
      const hash = AuditService.computeHash(id, action, req.user.sub, createdAt, mergedDetails, previousHash);

      await tx.insert(auditLogs).values({
        id,
        actorId: req.user.sub,
        action,
        targetResource,
        targetId,
        details: mergedDetails,
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        hash,
        previousHash,
        createdAt,
      });
    }).catch((err) =>
      logger.warn({ err, event: 'audit.pii_log_failed', action, targetResource }, 'Failed to write PII audit log'),
    );
  }

  /**
   * Transactional PII access logging with hash chain.
   * Awaits the insert — use within db.transaction() for critical operations.
   * Signature unchanged from original for backward compatibility (Task 6.2).
   */
  static async logPiiAccessTx(
    tx: DbTransaction,
    actorId: string,
    action: PiiAction,
    targetResource: string,
    targetId: string | null,
    details?: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
    actorRole?: string,
  ): Promise<void> {
    const id = uuidv7();
    const mergedDetails = actorRole
      ? { ...(details ?? {}), actorRole }
      : (details ?? null);
    const createdAt = new Date();

    // Lock the most recent record to serialize concurrent hash chain inserts (Task 3.4)
    const prevResult = await tx.execute(
      sql`SELECT hash FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 1 FOR UPDATE`,
    );
    const previousHash = (prevResult.rows[0] as Record<string, string>)?.hash ?? GENESIS_HASH;
    const hash = AuditService.computeHash(id, action, actorId, createdAt, mergedDetails, previousHash);

    await tx.insert(auditLogs).values({
      id,
      actorId,
      action,
      targetResource,
      targetId,
      details: mergedDetails,
      ipAddress: ipAddress ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
      hash,
      previousHash,
      createdAt,
    });
  }

  /**
   * Verify the integrity of the audit log hash chain (Task 4.1).
   * Walks records in chronological order, recomputes each hash, and compares
   * against stored values. Detects any tampered or modified records.
   *
   * @param options.limit - Spot-check mode: verify only the last N records (default: all)
   */
  static async verifyHashChain(options?: { limit?: number }): Promise<HashChainVerificationResult> {
    const countResult = await db.execute(sql`SELECT COUNT(*) as cnt FROM audit_logs`);
    const totalRecords = parseInt((countResult.rows[0] as Record<string, string>).cnt, 10);

    if (totalRecords === 0) {
      return { valid: true, totalRecords: 0, verified: 0 };
    }

    const limit = options?.limit;

    // Fetch records in chronological order
    const records = await db.execute(
      limit
        ? sql`
            WITH numbered AS (
              SELECT id, action, actor_id, created_at, details, hash, previous_hash,
                     ROW_NUMBER() OVER (ORDER BY created_at DESC, id DESC) as rn
              FROM audit_logs
            )
            SELECT id, action, actor_id, created_at, details, hash, previous_hash
            FROM numbered WHERE rn <= ${limit}
            ORDER BY created_at ASC, id ASC
          `
        : sql`
            SELECT id, action, actor_id, created_at, details, hash, previous_hash
            FROM audit_logs
            ORDER BY created_at ASC, id ASC
          `,
    );

    let verified = 0;
    let lastHash: string | null = null;

    for (const row of records.rows) {
      const r = row as Record<string, unknown>;
      const createdAt = new Date(r.created_at as string);

      // Verify hash computation: stored hash should match recomputed hash
      const hashInput = (r.previous_hash as string | null) ?? GENESIS_HASH;
      const expectedHash = AuditService.computeHash(
        r.id as string,
        r.action as string,
        r.actor_id as string | null,
        createdAt,
        r.details,
        hashInput,
      );

      if (r.hash !== expectedHash) {
        return { valid: false, totalRecords, verified, firstTampered: { id: r.id as string, createdAt } };
      }

      // Verify chain link: previous_hash should match the actual previous record's hash
      // Skip for first record in spot-check mode (predecessor not loaded)
      if (lastHash !== null && r.previous_hash !== lastHash) {
        return { valid: false, totalRecords, verified, firstTampered: { id: r.id as string, createdAt } };
      }

      lastHash = r.hash as string;
      verified++;
    }

    return { valid: true, totalRecords, verified };
  }

  /**
   * Get total audit log count (used by controller for performance guard).
   */
  static async getRecordCount(): Promise<number> {
    const result = await db.execute(sql`SELECT COUNT(*) as cnt FROM audit_logs`);
    return parseInt((result.rows[0] as Record<string, string>).cnt, 10);
  }
}
