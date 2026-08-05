/**
 * Audit Controller — Hash Chain Verification Endpoint
 *
 * Story 6-1: Provides Super Admin access to audit log integrity verification.
 * GET /api/v1/audit-logs/verify-chain — verify hash chain integrity
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { AuditService } from '../services/audit.service.js';

const verifyQuerySchema = z.object({
  mode: z.enum(['full', 'spot']).optional().default('spot'),
  limit: z.coerce.number().int().min(1).max(10000).optional().default(100),
});

const BACKGROUND_THRESHOLD = 10_000;

/**
 * A bare `valid: false` is unactionable, and on this system it is also PERMANENT.
 *
 * Prod has carried 117 concurrency forks since 2026-04-04 with **zero** rows failing their own
 * hash — nothing tampered, but the linear order the verifier assumes never existed, and those
 * forks cannot be repaired without recomputing stored hashes (precisely what the chain exists to
 * prevent). So this endpoint would report INVALID forever, and an auditor reading one boolean
 * would reasonably conclude the audit log is compromised.
 *
 * Whenever the chain is not valid, attach the breakdown that says which invariant broke:
 * self-hash failures are the tamper signal; forks and gaps are properties of the writer.
 * (13-49 R12.)
 */
async function withClassification<T extends { valid: boolean | null }>(result: T) {
  if (result.valid !== false) return result;
  return { ...result, classification: await AuditService.classifyChainFailure() };
}

export class AuditController {
  /**
   * GET /api/v1/audit-logs/verify-chain
   * Query params:
   *   - mode: 'full' | 'spot' (default: 'spot')
   *   - limit: number (default: 100, max: 10000, only used in spot mode)
   */
  static async verifyHashChain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parseResult = verifyQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          errors: parseResult.error.flatten().fieldErrors,
        });
      }
      const query = parseResult.data;

      if (query.mode === 'full') {
        const recordCount = await AuditService.getRecordCount();

        if (recordCount > BACKGROUND_THRESHOLD) {
          res.status(200).json({
            data: {
              valid: null,
              totalRecords: recordCount,
              verified: 0,
              message: `Full chain verification deferred: ${recordCount} records exceed ${BACKGROUND_THRESHOLD} threshold. Use spot-check mode (mode=spot&limit=N) for quick health checks.`,
            },
          });
          return;
        }

        const result = await AuditService.verifyHashChain();
        res.status(200).json({ data: await withClassification(result) });
        return;
      }

      // Spot-check mode (default)
      const result = await AuditService.verifyHashChain({ limit: query.limit });
      res.status(200).json({ data: await withClassification(result) });
    } catch (err) {
      next(err);
    }
  }
}
