/**
 * Admin Import Routes (Story 11-2) — mounted under `/api/v1/admin/imports/*`.
 *
 * Flat file under `routes/` (project convention; there is no `routes/admin/`
 * subdirectory). Mounted as a sub-router inside `admin.routes.ts` alongside
 * settings / operations / audit-logs, so the `/admin` prefix + super-admin gate
 * are consistent.
 *
 * Endpoints (all super-admin only):
 *   POST /dry-run       multipart upload → parse + preview (no DB writes)
 *   POST /confirm       commit a dry-run draft transactionally
 *   POST /:id/rollback  soft-delete a batch within 14 days
 *   GET  /              paginated batch list (filter: source/status/uploaded_by)
 *   GET  /:id           batch detail
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import {
  importDryRunRateLimit,
  importConfirmRateLimit,
  importRollbackRateLimit,
} from '../middleware/import-rate-limit.js';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { ImportService } from '../services/import.service.js';
import type { ColumnMapping } from '../services/import/parsers/types.js';
import type { AuthenticatedRequest } from '../types.js';

const router = Router();

// 10MB in-memory upload — files are parsed then discarded; nothing is persisted
// to disk. Matches the AC#3 cap; raising it needs nginx + body-parser changes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// All import endpoints are super-admin only.
router.use(authenticate);
router.use(authorize(UserRole.SUPER_ADMIN));

function actorOf(req: Request): { actorId: string; ipAddress?: string; userAgent?: string } {
  const user = (req as AuthenticatedRequest).user;
  return {
    actorId: user.sub,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  };
}

/** POST /api/v1/admin/imports/dry-run */
router.post(
  '/dry-run',
  importDryRunRateLimit,
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'A file upload (field "file") is required.', 400);
      }
      const { source, parser_used, source_description, column_mapping } = req.body as Record<string, string>;
      if (!source || !parser_used) {
        throw new AppError('VALIDATION_ERROR', 'source and parser_used are required.', 400);
      }

      let columnMapping: ColumnMapping | undefined;
      if (column_mapping) {
        try {
          columnMapping = JSON.parse(column_mapping) as ColumnMapping;
        } catch {
          throw new AppError('VALIDATION_ERROR', 'column_mapping must be valid JSON.', 400);
        }
      }

      const { actorId } = actorOf(req);
      const result = await ImportService.dryRun({
        buffer: req.file.buffer,
        originalFilename: req.file.originalname,
        source,
        parserUsed: parser_used,
        columnMapping,
        sourceDescription: source_description ?? null,
        actorId,
      });

      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  },
);

/** POST /api/v1/admin/imports/confirm */
router.post('/confirm', importConfirmRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dry_run_token, lawful_basis, lawful_basis_note } = req.body as Record<string, string>;
    if (!dry_run_token) {
      throw new AppError('VALIDATION_ERROR', 'dry_run_token is required.', 400);
    }
    const { actorId, ipAddress, userAgent } = actorOf(req);
    const result = await ImportService.confirm({
      dryRunToken: dry_run_token,
      lawfulBasis: lawful_basis,
      lawfulBasisNote: lawful_basis_note ?? null,
      actorId,
      ipAddress,
      userAgent,
    });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
});

/** POST /api/v1/admin/imports/:id/rollback */
router.post('/:id/rollback', importRollbackRateLimit, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { reason } = req.body as Record<string, string>;
    const { actorId, ipAddress, userAgent } = actorOf(req);
    const result = await ImportService.rollback({
      batchId: req.params.id,
      reason: reason ?? '',
      actorId,
      ipAddress,
      userAgent,
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/admin/imports */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = req.query as Record<string, string | undefined>;
    const result = await ImportService.list({
      page: q.page ? parseInt(q.page, 10) : undefined,
      pageSize: q.page_size ? parseInt(q.page_size, 10) : undefined,
      source: q.source,
      status: q.status,
      uploadedBy: q.uploaded_by,
    });
    res.status(200).json({
      data: result.batches,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/admin/imports/:id/failure-report.csv (AC#8 — CSV download) */
router.get('/:id/failure-report.csv', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { filename, csv } = await ImportService.getFailureReportCsv(req.params.id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    next(err);
  }
});

/** GET /api/v1/admin/imports/:id */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const batch = await ImportService.get(req.params.id);
    res.status(200).json({ data: batch });
  } catch (err) {
    next(err);
  }
});

export default router;
