/**
 * Productivity Controller
 *
 * Handles team productivity endpoints: data view, targets, export.
 *
 * Created in Story 5.6a (Supervisor Team Productivity Table).
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { ProductivityService } from '../services/productivity.service.js';
import { ProductivityTargetService } from '../services/productivity-target.service.js';
import { ExportService } from '../services/export.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import { db } from '../db/index.js';
import { users } from '../db/schema/users.js';
import { lgas } from '../db/schema/lgas.js';
import { eq } from 'drizzle-orm';
import type { AuthenticatedRequest } from '../types.js';
import type { ExportColumn } from '../services/export.service.js';

/** Max rows to retrieve for export (no pagination limit) */
const EXPORT_MAX_ROWS = 10000;

/** Zod schema for GET /productivity/team query params */
const productivityQuerySchema = z.object({
  period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['all', 'complete', 'on_track', 'behind', 'inactive']).default('all'),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['fullName', 'todayCount', 'target', 'percent', 'status', 'weekCount', 'monthCount', 'rejRate', 'lastActiveAt']).default('fullName'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

/** Zod schema for PUT /productivity/targets body */
const updateTargetsSchema = z.object({
  defaultTarget: z.number().min(1).max(500).optional(),
  lgaOverrides: z.array(z.object({
    lgaId: z.string().min(1),
    dailyTarget: z.number().min(1).max(500),
  })).optional(),
}).refine(
  (data) => data.defaultTarget !== undefined || (data.lgaOverrides && data.lgaOverrides.length > 0),
  { message: 'At least one of defaultTarget or lgaOverrides must be provided' },
);

/** Zod schema for POST /productivity/export body */
const exportBodySchema = z.object({
  format: z.enum(['csv', 'pdf']),
  period: z.enum(['today', 'week', 'month', 'custom']).default('today'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.enum(['all', 'complete', 'on_track', 'behind', 'inactive']).default('all'),
  search: z.string().max(100).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

/** Export column definitions for productivity table */
const PRODUCTIVITY_EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'fullName', header: 'Enumerator', width: 100 },
  { key: 'todayCount', header: 'Today', width: 50 },
  { key: 'target', header: 'Target', width: 50 },
  { key: 'percent', header: '%', width: 40 },
  { key: 'status', header: 'Status', width: 60 },
  { key: 'weekCount', header: 'This Week', width: 70 },
  { key: 'monthCount', header: 'This Month', width: 70 },
  { key: 'approvedCount', header: 'Approved', width: 60 },
  { key: 'rejectedCount', header: 'Rejected', width: 60 },
  { key: 'rejRate', header: 'Rej. Rate', width: 55 },
  { key: 'daysActive', header: 'Days Active', width: 70 },
  { key: 'lastActiveAt', header: 'Last Active', width: 80 },
];

export class ProductivityController {
  /**
   * GET /api/v1/productivity/team
   * Returns team productivity data with pagination, filters, summary.
   */
  static async getTeamProductivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const parseResult = productivityQuerySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const filters = parseResult.data;

      // Supervisor sees own team; super_admin sees all
      const supervisorId = user.role === 'super_admin' ? null : user.sub;
      const result = await ProductivityService.getTeamProductivity(supervisorId, filters);

      // Audit log (fire-and-forget)
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_PRODUCTIVITY,
        'staff_productivity',
        null,
        { filters, resultCount: result.totalItems },
      );

      res.json({
        data: result.rows,
        summary: result.summary,
        meta: {
          pagination: {
            page: filters.page,
            pageSize: filters.pageSize,
            totalPages: Math.ceil(result.totalItems / filters.pageSize),
            totalItems: result.totalItems,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/productivity/targets
   * Returns active targets (default + per-LGA overrides).
   */
  static async getTargets(req: Request, res: Response, next: NextFunction) {
    try {
      const targets = await ProductivityTargetService.getActiveTargets();
      res.json({ data: targets });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /api/v1/productivity/targets
   * Update targets (Super Admin only). Temporal versioning.
   */
  static async updateTargets(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const parseResult = updateTargetsSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid target data', 400, {
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const updated = await ProductivityTargetService.updateTargets(parseResult.data, user.sub);
      res.json({ data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/productivity/export
   * Export filtered productivity data as CSV or PDF.
   */
  static async exportTeamProductivity(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }

      const parseResult = exportBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid export parameters', 400, {
          errors: parseResult.error.flatten().fieldErrors,
        });
      }

      const { format, ...filters } = parseResult.data;

      // Get all data (no pagination limit for export)
      const supervisorId = user.role === 'super_admin' ? null : user.sub;
      const result = await ProductivityService.getTeamProductivity(supervisorId, {
        ...filters,
        page: 1,
        pageSize: EXPORT_MAX_ROWS,
      });

      // Audit log
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.EXPORT_PRODUCTIVITY,
        'staff_productivity',
        null,
        { format, filters, recordCount: result.totalItems },
      );

      // Resolve metadata for filename and PDF subtitle (M2 review fix)
      const dateStr = new Date().toISOString().split('T')[0];
      let lgaStr = 'all';
      let lgaDisplayName = 'All LGAs';
      let supervisorName = '';
      if (user.lgaId) {
        lgaStr = user.lgaId;
        const lgaRecord = await db.query.lgas.findFirst({ where: eq(lgas.id, user.lgaId) });
        lgaDisplayName = lgaRecord?.name ?? user.lgaId;
      }
      if (user.sub) {
        const userRecord = await db.query.users.findFirst({
          where: eq(users.id, user.sub),
          columns: { fullName: true },
        });
        supervisorName = userRecord?.fullName ?? '';
      }
      const periodLabel = filters.period === 'today' ? 'Today'
        : filters.period === 'week' ? 'This Week'
        : filters.period === 'month' ? 'This Month'
        : `${filters.dateFrom ?? ''} – ${filters.dateTo ?? ''}`;

      const filename = `oslsr-team-productivity-${lgaStr}-${dateStr}`;

      if (format === 'csv') {
        const csvBuffer = await ExportService.generateCsvExport(
          result.rows as unknown as Record<string, unknown>[],
          PRODUCTIVITY_EXPORT_COLUMNS,
        );

        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}.csv"`,
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        });
        res.send(csvBuffer);
      } else {
        const subtitleParts = [`LGA: ${lgaDisplayName}`, `Period: ${periodLabel}`];
        if (supervisorName) subtitleParts.push(`Supervisor: ${supervisorName}`);

        const pdfBuffer = await ExportService.generatePdfReport(
          result.rows as unknown as Record<string, unknown>[],
          PRODUCTIVITY_EXPORT_COLUMNS,
          {
            title: 'Team Productivity Report',
            subtitle: subtitleParts.join('  |  '),
          },
        );

        res.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${filename}.pdf"`,
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
}
