/**
 * Respondent Controller — Detail + Registry List
 *
 * Story 5.3: Individual Record PII View (Authorized Roles).
 * Story 5.5: Respondent Data Registry Table — paginated list with filters.
 *
 * GET /api/v1/respondents — paginated respondent list with filters
 * GET /api/v1/respondents/:id — full respondent detail
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { RespondentService } from '../services/respondent.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import { ExportService, type ExportColumn } from '../services/export.service.js';
import type { AuthenticatedRequest } from '../types.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Roles that see PII and trigger audit logging */
const PII_AUTHORIZED_ROLES = ['super_admin', 'verification_assessor', 'government_official'];

/** Zod validation for list query params */
const respondentListSchema = z.object({
  lgaId: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  source: z.enum(['enumerator', 'public', 'clerk']).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  verificationStatus: z.enum(['pending', 'verified', 'rejected', 'quarantined']).optional(),
  severity: z.string().optional(),
  formId: z.string().optional(),
  enumeratorId: z.string().optional(),
  search: z.string().min(3).max(100).optional(),
  cursor: z.string().optional(),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.enum(['registeredAt', 'fraudScore', 'lgaName', 'verificationStatus']).default('registeredAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const submissionExportSchema = z.object({
  format: z.enum(['csv', 'pdf']),
});

export class RespondentController {
  /**
   * GET /api/v1/respondents — paginated respondent registry list
   */
  static async listRespondents(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parsed = respondentListSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const filters = parsed.data;

      // Validate UUID format for optional UUID filter params
      if (filters.lgaId && filters.lgaId.length > 0 && !filters.lgaId.includes('-')) {
        // LGA IDs can be codes (e.g., 'ibadan-north') — allow non-UUID
      }
      if (filters.formId && !UUID_REGEX.test(filters.formId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid formId format', 400);
      }
      if (filters.enumeratorId && !UUID_REGEX.test(filters.enumeratorId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid enumeratorId format', 400);
      }

      const result = await RespondentService.listRespondents(filters, user.role, user.sub);

      // Audit log for ALL roles (supervisors see operational data that should be tracked)
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_LIST,
        'respondents',
        null,
        { filters: parsed.data, resultCount: result.data.length },
      );

      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/respondents/:id — full respondent detail
   */
  static async getRespondentDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { id } = req.params;
      if (!UUID_REGEX.test(id)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid respondent ID format', 400);
      }

      const detail = await RespondentService.getRespondentDetail(id, user.role, user.sub);

      // Audit log PII access for authorized roles (fire-and-forget, non-blocking)
      if (PII_AUTHORIZED_ROLES.includes(user.role)) {
        AuditService.logPiiAccess(
          req as AuthenticatedRequest,
          PII_ACTIONS.VIEW_RECORD,
          'respondents',
          id,
          { lgaId: detail.lgaId, source: detail.source },
        );
      }

      res.json({ data: detail });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/respondents/:respondentId/submissions/:submissionId/responses
   * Flattened form responses for a single submission.
   */
  static async getSubmissionResponses(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { respondentId, submissionId } = req.params;
      if (!UUID_REGEX.test(respondentId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid respondent ID format', 400);
      }
      if (!UUID_REGEX.test(submissionId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid submission ID format', 400);
      }

      const result = await RespondentService.getSubmissionResponses(
        respondentId,
        submissionId,
        user.role,
        user.sub,
      );

      // Audit log for ALL roles (submission response viewing is a PII access event)
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_SUBMISSION_RESPONSE,
        'submissions',
        submissionId,
        { respondentId },
      );

      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/respondents/:respondentId/submissions/:submissionId/export?format=csv|pdf
   * Export single submission response detail (drawer content) as CSV or PDF.
   */
  static async exportSubmissionResponses(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { respondentId, submissionId } = req.params;
      if (!UUID_REGEX.test(respondentId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid respondent ID format', 400);
      }
      if (!UUID_REGEX.test(submissionId)) {
        throw new AppError('VALIDATION_ERROR', 'Invalid submission ID format', 400);
      }

      const parsed = submissionExportSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid export parameters', 400, {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { format } = parsed.data;
      const detail = await RespondentService.getSubmissionResponses(
        respondentId,
        submissionId,
        user.role,
        user.sub,
      );

      const rows: Record<string, unknown>[] = [
        { section: 'Submission Info', field: 'Date', value: detail.submittedAt },
        { section: 'Submission Info', field: 'Source', value: detail.source },
        { section: 'Submission Info', field: 'Enumerator', value: detail.enumeratorName ?? '' },
        {
          section: 'Submission Info',
          field: 'Completion Time (s)',
          value: detail.completionTimeSeconds != null ? String(detail.completionTimeSeconds) : '',
        },
        {
          section: 'Submission Info',
          field: 'GPS',
          value:
            detail.gpsLatitude != null && detail.gpsLongitude != null
              ? `${detail.gpsLatitude}, ${detail.gpsLongitude}`
              : '',
        },
        { section: 'Submission Info', field: 'Fraud Severity', value: detail.fraudSeverity ?? '' },
        {
          section: 'Submission Info',
          field: 'Fraud Score',
          value: detail.fraudScore != null ? String(detail.fraudScore) : '',
        },
        {
          section: 'Submission Info',
          field: 'Verification Status',
          value: detail.verificationStatus ?? '',
        },
        { section: 'Submission Info', field: 'Form Title', value: detail.formTitle },
        { section: 'Submission Info', field: 'Form Version', value: detail.formVersion },
      ];

      for (const section of detail.sections) {
        for (const field of section.fields) {
          rows.push({
            section: section.title,
            field: field.label,
            value: field.value,
          });
        }
      }

      const columns: ExportColumn[] = [
        { key: 'section', header: 'Section', width: 140 },
        { key: 'field', header: 'Field', width: 180 },
        { key: 'value', header: 'Value', width: 220 },
      ];

      const action = format === 'csv' ? PII_ACTIONS.EXPORT_CSV : PII_ACTIONS.EXPORT_PDF;
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        action,
        'submissions',
        submissionId,
        { respondentId, recordCount: rows.length, format, scope: 'submission_response' },
      );

      const dateStr = new Date().toISOString().slice(0, 10);
      const baseName = `oslsr-submission-${submissionId.slice(0, 8)}-${dateStr}`;

      if (format === 'csv') {
        const csv = await ExportService.generateCsvExport(rows, columns);
        res.set({
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${baseName}.csv"`,
          'Content-Length': csv.length.toString(),
        });
        res.send(csv);
        return;
      }

      const pdf = await ExportService.generatePdfReport(rows, columns, {
        title: 'Submission Response Detail',
        subtitle: `Submission ID: ${submissionId}`,
      });
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${baseName}.pdf"`,
        'Content-Length': pdf.length.toString(),
      });
      res.send(pdf);
    } catch (err) {
      next(err);
    }
  }
}
