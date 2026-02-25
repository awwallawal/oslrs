/**
 * Audit Controller — Hash Chain Verification Endpoint
 *
 * Story 6-1: Provides Super Admin access to audit log integrity verification.
 * GET /api/v1/audit-logs/verify-chain — verify hash chain integrity
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuditService } from '../services/audit.service.js';

const verifyQuerySchema = z.object({
  mode: z.enum(['full', 'spot']).optional().default('spot'),
  limit: z.coerce.number().int().min(1).max(10000).optional().default(100),
});

const BACKGROUND_THRESHOLD = 10_000;

export class AuditController {
  /**
   * GET /api/v1/audit-logs/verify-chain
   * Query params:
   *   - mode: 'full' | 'spot' (default: 'spot')
   *   - limit: number (default: 100, max: 10000, only used in spot mode)
   */
  static async verifyHashChain(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = verifyQuerySchema.parse(req.query);

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
        res.status(200).json({ data: result });
        return;
      }

      // Spot-check mode (default)
      const result = await AuditService.verifyHashChain({ limit: query.limit });
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }
}
