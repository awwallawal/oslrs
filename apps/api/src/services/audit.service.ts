/**
 * Audit Service — Reusable PII Access Logging
 *
 * Provides two modes for audit logging of PII access events:
 * - Fire-and-forget (logPiiAccess): for list views and non-critical logging
 * - Transactional (logPiiAccessTx): for use within db.transaction()
 *
 * Created in prep-2 (Lightweight Audit Logging for PII Access).
 * Required by Stories 5.3, 5.4, 5.5.
 */

import { db } from '../db/index.js';
import { auditLogs } from '../db/schema/audit.js';
import { uuidv7 } from 'uuidv7';
import pino from 'pino';
import type { AuthenticatedRequest } from '../types.js';

const logger = pino({ name: 'audit-service' });

/** PII-specific audit action constants */
export const PII_ACTIONS = {
  VIEW_RECORD: 'pii.view_record',
  VIEW_LIST: 'pii.view_list',
  EXPORT_CSV: 'pii.export_csv',
  EXPORT_PDF: 'pii.export_pdf',
  SEARCH_PII: 'pii.search',
  VIEW_PRODUCTIVITY: 'pii.view_productivity',
  EXPORT_PRODUCTIVITY: 'pii.export_productivity',
} as const;

export type PiiAction = (typeof PII_ACTIONS)[keyof typeof PII_ACTIONS];

/** Transaction type inferred from Drizzle db.transaction callback */
type DbTransaction = Parameters<Parameters<typeof db['transaction']>[0]>[0];

export class AuditService {
  /**
   * Fire-and-forget PII access logging.
   * Does NOT await the insert — failures are logged as warnings but never throw.
   * Use for list views and non-critical audit events.
   */
  static logPiiAccess(
    req: AuthenticatedRequest,
    action: PiiAction,
    targetResource: string,
    targetId: string | null,
    details?: Record<string, unknown>,
  ): void {
    db.insert(auditLogs)
      .values({
        id: uuidv7(),
        actorId: req.user.sub,
        action,
        targetResource,
        targetId,
        details: {
          ...details,
          actorRole: req.user.role,
        },
        ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
      })
      .catch((err) =>
        logger.warn({ err, event: 'audit.pii_log_failed', action, targetResource }, 'Failed to write PII audit log'),
      );
  }

  /**
   * Transactional PII access logging.
   * Awaits the insert — use within db.transaction() for critical operations.
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
    const mergedDetails = actorRole
      ? { ...(details ?? {}), actorRole }
      : (details ?? null);

    await tx.insert(auditLogs).values({
      id: uuidv7(),
      actorId,
      action,
      targetResource,
      targetId,
      details: mergedDetails,
      ipAddress: ipAddress ?? 'unknown',
      userAgent: userAgent ?? 'unknown',
    });
  }
}
