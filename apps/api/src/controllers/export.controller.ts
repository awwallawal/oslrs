/**
 * Export Controller — PII-Rich CSV/PDF Exports
 *
 * Story 5.4: Handles respondent data export for authorized roles.
 * Validates filters, enforces PDF row limit, logs PII access, generates exports.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { ExportQueryService } from '../services/export-query.service.js';
import { ExportService } from '../services/export.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types.js';
import type { ExportColumn } from '../services/export.service.js';

/** Zod schema for export filter params (shared between export + count endpoints) */
export const exportFilterSchema = z.object({
  lgaId: z.string().optional(),
  source: z.enum(['enumerator', 'public', 'clerk']).optional(),
  dateFrom: z.string().datetime({ offset: true }).optional(),
  dateTo: z.string().datetime({ offset: true }).optional(),
  severity: z.enum(['clean', 'low', 'medium', 'high', 'critical']).optional(),
  verificationStatus: z.string().optional(),
});

/** Zod schema for export download query params (includes format) */
export const exportQuerySchema = exportFilterSchema.extend({
  format: z.enum(['csv', 'pdf']),
});

/** PDF export row limit */
const PDF_MAX_ROWS = 1000;

/** Column definitions for respondent export */
const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'firstName', header: 'First Name', width: 80 },
  { key: 'lastName', header: 'Last Name', width: 80 },
  { key: 'nin', header: 'NIN', width: 90 },
  { key: 'phoneNumber', header: 'Phone', width: 85 },
  { key: 'dateOfBirth', header: 'DOB', width: 70 },
  { key: 'lgaName', header: 'LGA', width: 80 },
  { key: 'source', header: 'Source', width: 60 },
  { key: 'registeredAt', header: 'Registered', width: 70 },
  { key: 'fraudSeverity', header: 'Fraud', width: 50 },
  { key: 'verificationStatus', header: 'Status', width: 60 },
];

export class ExportController {
  /**
   * GET /api/v1/exports/respondents
   * Download filtered respondent export as CSV or PDF.
   */
  static async exportRespondents(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      // Validate query params
      const parseResult = exportQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Invalid export parameters',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const { format, lgaId, source, dateFrom, dateTo, severity, verificationStatus } = parseResult.data;
      const filters = { lgaId, source, dateFrom, dateTo, severity, verificationStatus };

      // Check filtered count first (enforce PDF row limit)
      const count = await ExportQueryService.getFilteredCount(filters);

      if (format === 'pdf' && count > PDF_MAX_ROWS) {
        throw new AppError(
          'PDF_ROW_LIMIT',
          'PDF exports are limited to 1,000 records. Apply filters to narrow results or use CSV format for larger exports.',
          400,
        );
      }

      // Audit log BEFORE generating export (capture intent)
      const auditAction = format === 'csv' ? PII_ACTIONS.EXPORT_CSV : PII_ACTIONS.EXPORT_PDF;
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        auditAction,
        'respondents',
        null,
        { filters, recordCount: count, format },
      );

      // Fetch full data
      const { data } = await ExportQueryService.getRespondentExportData(filters);

      // Generate date string for filename
      const dateStr = new Date().toISOString().split('T')[0];

      if (format === 'csv') {
        const csvBuffer = await ExportService.generateCsvExport(
          data as unknown as Record<string, unknown>[],
          EXPORT_COLUMNS,
        );

        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="oslsr-export-${dateStr}.csv"`,
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        });
        res.send(csvBuffer);
      } else {
        const pdfBuffer = await ExportService.generatePdfReport(
          data as unknown as Record<string, unknown>[],
          EXPORT_COLUMNS,
          { title: 'Respondent Export' },
        );

        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="oslsr-export-${dateStr}.pdf"`,
          'Content-Length': pdfBuffer.length.toString(),
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        });
        res.send(pdfBuffer);
      }
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/exports/respondents/count
   * Preview filtered record count (no rate limit).
   */
  static async getExportPreviewCount(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      // Validate filter params with Zod (same schema as export, minus format)
      const parseResult = exportFilterSchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Invalid filter parameters',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const { lgaId, source, dateFrom, dateTo, severity, verificationStatus } = parseResult.data;
      const filters = { lgaId, source, dateFrom, dateTo, severity, verificationStatus };

      const count = await ExportQueryService.getFilteredCount(filters);

      res.json({ data: { count } });
    } catch (err) {
      next(err);
    }
  }
}
