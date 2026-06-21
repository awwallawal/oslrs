/**
 * Export Controller — PII-Rich CSV/PDF Exports
 *
 * Story 5.4: Handles respondent data export for authorized roles.
 * Validates filters, enforces PDF row limit, logs PII access, generates exports.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import pino from 'pino';
import { AppError } from '@oslsr/utils';
import { ExportQueryService, SUBMISSION_METADATA_COLUMNS, UNIFIED_METADATA_COLUMNS, buildColumnsFromFormSchema, flattenRawDataRow, buildChoiceMaps } from '../services/export-query.service.js';
import { normalizeRawDataKeys, canonicalGroupFor } from '../services/registry-key-normalization.js';
import { ExportService } from '../services/export.service.js';
import { AuditService, PII_ACTIONS, type PiiAction } from '../services/audit.service.js';
import { QuestionnaireService } from '../services/questionnaire.service.js';
import { sendTelegramMessage } from '../services/alerting/telegram-channel.js';
import { db } from '../db/index.js';
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
  formId: z.string().uuid().optional(),
  exportType: z.enum(['summary', 'full', 'unified']).default('summary'),
});

/** Zod schema for export download query params (includes format) */
export const exportQuerySchema = exportFilterSchema.extend({
  format: z.enum(['csv', 'pdf']),
});

const logger = pino({ name: 'export-controller' });

/** PDF export row limit */
const PDF_MAX_ROWS = 1000;

/**
 * Story 9-43 AC#2 (F-009) — hard ceiling for CSV exports. Previously only PDF
 * was capped; CSV buffered the entire table in memory unbounded. Above this the
 * request fails with an explicit 413 instead of risking OOM. The CSV body is
 * also STREAMED row-by-row (ExportService.streamCsvExport) rather than built as
 * one Buffer, so memory stays bounded by this cap. Generous vs current scale;
 * raise only alongside DB-cursor streaming.
 */
const CSV_MAX_ROWS = 100000;

/**
 * Upper bound for the Unified export (Story 9-59 review M3). Unlike Summary, the
 * unified mode is CSV-only (so the PDF cap never applies) yet streams every
 * respondent WITH their full `raw_data` JSONB and flattens per row — unbounded
 * memory as the registry grows. This ceiling is generous (well above the current
 * ~139 respondents) but makes the failure mode an explicit, filterable error
 * rather than an OOM. Raise it only alongside a streaming implementation.
 */
const UNIFIED_MAX_ROWS = 50000;

/** Column definitions for respondent export */
const EXPORT_COLUMNS: ExportColumn[] = [
  { key: 'firstName', header: 'First Name', width: 80 },
  { key: 'lastName', header: 'Last Name', width: 80 },
  // Story 9-26 Part I — NIN is 11 digits; Excel auto-formats long numerics as
  // scientific notation (e.g. 1.23E+10) without text-mode coercion.
  { key: 'nin', header: 'NIN', width: 90, format: 'text' },
  // Story 9-26 Part I — phone is E.164 (+234XXXXXXXXXX); Excel sees the
  // leading `+` as a formula prefix and mangles display.
  { key: 'phoneNumber', header: 'Phone', width: 85, format: 'text' },
  { key: 'dateOfBirth', header: 'Date of Birth', width: 70 },
  { key: 'lgaName', header: 'LGA', width: 80 },
  { key: 'source', header: 'Source', width: 60 },
  { key: 'consentMarketplace', header: 'Marketplace Consent', width: 60 },
  { key: 'consentEnriched', header: 'Enriched Consent', width: 60 },
  { key: 'registeredAt', header: 'Registration Date', width: 80 },
  { key: 'totalSubmissions', header: 'Submissions', width: 50 },
  { key: 'fraudScore', header: 'Fraud Score', width: 50 },
  { key: 'fraudSeverity', header: 'Fraud Severity', width: 60 },
  { key: 'verificationStatus', header: 'Verification Status', width: 70 },
];

export class ExportController {
  /**
   * Story 9-43 AC#3 (F-013) — write the PII-access audit row FAIL-CLOSED before
   * any export bytes leave the server. Uses the transactional `logPiiAccessTx`
   * and AWAITS it; if the audit write fails the export is aborted (throws) and
   * NO data is sent. A best-effort human alert fires on `audit.pii_log_failed`
   * (never masks the abort). Silent audit loss on a PII export is the worst
   * failure mode here, so it must be fail-closed.
   */
  private static async auditExportOrFail(
    req: AuthenticatedRequest,
    action: PiiAction,
    targetResource: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    try {
      await db.transaction(async (tx) => {
        await AuditService.logPiiAccessTx(
          tx,
          req.user.sub,
          action,
          targetResource,
          null,
          details,
          req.ip || req.socket?.remoteAddress || 'unknown',
          req.headers['user-agent'] || 'unknown',
          req.user.role,
        );
      });
    } catch (err) {
      logger.error(
        { event: 'audit.pii_log_failed', action, targetResource, error: (err as Error).message },
        'Export aborted: PII-access audit write failed (fail-closed)',
      );
      // Best-effort operator page — swallow its own failure so it can never
      // mask the abort below.
      void sendTelegramMessage(
        `🚨 EXPORT AUDIT FAILURE — ${action} on ${targetResource} ABORTED (audit write failed). Investigate immediately.`,
      ).catch(() => { /* alerting is best-effort */ });
      throw new AppError(
        'AUDIT_WRITE_FAILED',
        'Export aborted: the access audit log could not be written, so no data was returned.',
        500,
      );
    }
  }

  /**
   * Story 9-43 AC#2 (F-009) — set CSV response headers and STREAM the rows to
   * the response instead of buffering the whole table. Caller enforces the row
   * cap beforehand.
   */
  private static async streamCsv(
    res: Response,
    filename: string,
    data: Record<string, unknown>[],
    columns: ExportColumn[],
  ): Promise<void> {
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'Pragma': 'no-cache',
    });
    await ExportService.streamCsvExport(res, data, columns);
  }

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

      const { format, lgaId, source, dateFrom, dateTo, severity, verificationStatus, formId, exportType } = parseResult.data;
      const filters = { lgaId, source, dateFrom, dateTo, severity, verificationStatus };

      // Generate date string for filename
      const dateStr = new Date().toISOString().split('T')[0];

      // ── Full Response Mode ──────────────────────────────────────────
      if (exportType === 'full') {
        if (format !== 'csv') {
          throw new AppError(
            'VALIDATION_ERROR',
            'Full Response export only supports CSV format',
            400,
          );
        }
        if (!formId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'formId is required for Full Response export',
            400,
          );
        }

        const formSchema = await QuestionnaireService.getFormSchemaById(formId);
        if (!formSchema) {
          throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found or has no schema', 404);
        }

        const fullFilters = { ...filters, formId };
        const count = await ExportQueryService.getSubmissionFilteredCount(fullFilters);

        // F-009 — hard CSV ceiling (explicit 413 instead of unbounded buffer).
        if (count > CSV_MAX_ROWS) {
          throw new AppError(
            'CSV_ROW_LIMIT',
            `CSV export is limited to ${CSV_MAX_ROWS.toLocaleString()} records. Apply filters to narrow the result.`,
            413,
          );
        }

        // F-013 — fail-closed PII-access audit BEFORE any bytes leave the server.
        await ExportController.auditExportOrFail(
          req as AuthenticatedRequest,
          PII_ACTIONS.EXPORT_CSV,
          'submissions',
          { filters: fullFilters, recordCount: count, format, exportType, formId },
        );

        const { data } = await ExportQueryService.getSubmissionExportData(fullFilters);

        // Build dynamic columns from form schema
        const formColumns = buildColumnsFromFormSchema(formSchema);
        const allColumns = [...SUBMISSION_METADATA_COLUMNS, ...formColumns];

        // Pre-build choice maps once for O(1) label lookups across all rows
        const choiceMaps = buildChoiceMaps(formSchema);

        // Flatten rawData for each row and merge with metadata
        const flatRows = data.map((row) => {
          const { rawData, ...metadata } = row;
          const flatFields = flattenRawDataRow(rawData, formSchema, choiceMaps);
          return { ...metadata, ...flatFields };
        });

        await ExportController.streamCsv(
          res,
          `oslsr-full-export-${dateStr}.csv`,
          flatRows as unknown as Record<string, unknown>[],
          allColumns,
        );
        return;
      }

      // ── Unified Mode (Story 9-59: all respondents + answers-where-present) ──
      if (exportType === 'unified') {
        if (format !== 'csv') {
          throw new AppError(
            'VALIDATION_ERROR',
            'Unified export only supports CSV format',
            400,
          );
        }
        if (!formId) {
          throw new AppError(
            'VALIDATION_ERROR',
            'formId is required for Unified export (used for answer columns + label mapping)',
            400,
          );
        }

        const formSchema = await QuestionnaireService.getFormSchemaById(formId);
        if (!formSchema) {
          throw new AppError('FORM_NOT_FOUND', 'Questionnaire form not found or has no schema', 404);
        }

        // Unified row count == distinct respondents (one row per respondent).
        const count = await ExportQueryService.getFilteredCount(filters);

        // Review M3 — explicit, filterable ceiling instead of an unbounded
        // in-memory build (the mode loads full raw_data per respondent).
        // 9-43 review L2 — 413 (Payload Too Large), harmonized with the CSV cap
        // (both are "the CSV result is too big → narrow filters"). The PDF cap
        // stays 400 by design: it's a format-choice rejection ("use CSV"), not a
        // payload-size one.
        if (count > UNIFIED_MAX_ROWS) {
          throw new AppError(
            'UNIFIED_ROW_LIMIT',
            `Unified export is limited to ${UNIFIED_MAX_ROWS.toLocaleString()} respondents. Apply filters to narrow the result.`,
            413,
          );
        }

        // F-013 — fail-closed PII-access audit BEFORE any bytes leave the server.
        await ExportController.auditExportOrFail(
          req as AuthenticatedRequest,
          PII_ACTIONS.EXPORT_CSV,
          'respondents',
          { filters, recordCount: count, format, exportType, formId },
        );

        const { data } = await ExportQueryService.getUnifiedExportData(filters);

        // Answer columns come from the form schema (deduped, labeled) — exactly
        // like Full mode. Key-normalization (below) fills the schema's question
        // name from whichever legacy variant the older submission used, so the
        // CSV has no confusing half-empty duplicate columns (AC3).
        const formColumns = buildColumnsFromFormSchema(formSchema);
        const allColumns = [...UNIFIED_METADATA_COLUMNS, ...formColumns];
        const choiceMaps = buildChoiceMaps(formSchema);

        // Review M1 — answer columns come from the SELECTED form schema, so any
        // submission answer key absent from that schema (e.g. an older form
        // version's question) is omitted from the CSV. Normalization rescues the
        // known cross-version concepts; anything else is genuinely dropped.
        // Surface that to the operator via a structured warning rather than
        // silently losing data (a full pre-download preview is Epic 12 / 12-8).
        const schemaQuestionNames = new Set(formColumns.map((c) => c.key));
        const droppedAnswerKeys = new Set<string>();
        let rowsWithDroppedAnswers = 0;

        const flatRows = data.map((row) => {
          const { rawData, ...metadata } = row;

          // Detect answer keys this schema cannot represent (from the ORIGINAL
          // rawData, before additive normalization adds variant spellings). A
          // key is representable if it IS a schema question, or shares a
          // canonical group with one that is.
          let rowDropped = false;
          for (const [key, value] of Object.entries(rawData)) {
            if (value == null || value === '') continue;
            if (schemaQuestionNames.has(key)) continue;
            const group = canonicalGroupFor(key);
            if (group && group.some((member) => schemaQuestionNames.has(member))) continue;
            droppedAnswerKeys.add(key);
            rowDropped = true;
          }
          if (rowDropped) rowsWithDroppedAnswers += 1;

          // AC3 then AC4: normalize variant keys → then code→label via the
          // SAME flattenRawDataRow the Full mode uses (no raw codes emitted).
          const normalized = normalizeRawDataKeys(rawData);
          const flatFields = flattenRawDataRow(normalized, formSchema, choiceMaps);
          return { ...metadata, ...flatFields };
        });

        if (droppedAnswerKeys.size > 0) {
          logger.warn(
            {
              event: 'export.unified_unmapped_answer_keys',
              formId,
              droppedKeyCount: droppedAnswerKeys.size,
              droppedKeys: [...droppedAnswerKeys].slice(0, 50),
              rowsAffected: rowsWithDroppedAnswers,
            },
            'Unified export: submission answer keys not present in the selected form schema were omitted from the CSV',
          );
        }

        await ExportController.streamCsv(
          res,
          `oslsr-unified-export-${dateStr}.csv`,
          flatRows as unknown as Record<string, unknown>[],
          allColumns,
        );
        return;
      }

      // ── Summary Mode (existing behavior) ────────────────────────────
      // Check filtered count first (enforce PDF row limit)
      const count = await ExportQueryService.getFilteredCount(filters);

      if (format === 'pdf' && count > PDF_MAX_ROWS) {
        throw new AppError(
          'PDF_ROW_LIMIT',
          'PDF exports are limited to 1,000 records. Apply filters to narrow results or use CSV format for larger exports.',
          400,
        );
      }

      // F-009 — hard CSV ceiling (explicit 413 instead of unbounded buffer).
      if (format === 'csv' && count > CSV_MAX_ROWS) {
        throw new AppError(
          'CSV_ROW_LIMIT',
          `CSV export is limited to ${CSV_MAX_ROWS.toLocaleString()} records. Apply filters to narrow the result.`,
          413,
        );
      }

      // F-013 — fail-closed PII-access audit BEFORE any bytes leave the server.
      const auditAction = format === 'csv' ? PII_ACTIONS.EXPORT_CSV : PII_ACTIONS.EXPORT_PDF;
      await ExportController.auditExportOrFail(
        req as AuthenticatedRequest,
        auditAction,
        'respondents',
        { filters, recordCount: count, format, exportType },
      );

      // Fetch full data
      const { data } = await ExportQueryService.getRespondentExportData(filters);

      if (format === 'csv') {
        await ExportController.streamCsv(
          res,
          `oslsr-export-${dateStr}.csv`,
          data as unknown as Record<string, unknown>[],
          EXPORT_COLUMNS,
        );
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
      // Review L3 — if a CSV stream failed AFTER headers/body bytes were already
      // flushed, the response is committed; `next(err)` would throw
      // ERR_HTTP_HEADERS_SENT. Destroy the socket so the client sees a truncated
      // download (a clear failure) rather than a hung handler.
      if (res.headersSent) {
        logger.error(
          { event: 'export.stream_failed_after_headers', error: (err as Error).message },
          'Export stream failed after the response was committed; destroying the connection',
        );
        res.destroy();
        return;
      }
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

      const { lgaId, source, dateFrom, dateTo, severity, verificationStatus, formId, exportType } = parseResult.data;
      const filters = { lgaId, source, dateFrom, dateTo, severity, verificationStatus };

      let count: number;
      if (exportType === 'full' && formId) {
        count = await ExportQueryService.getSubmissionFilteredCount({ ...filters, formId });
      } else {
        count = await ExportQueryService.getFilteredCount(filters);
      }

      res.json({ data: { count } });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/exports/forms
   * List published forms for the form selector dropdown.
   */
  static async getPublishedForms(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const result = await QuestionnaireService.listForms({ status: 'published', pageSize: 200 });

      const data = result.data.map((form) => ({
        id: form.id,
        title: form.title,
        formId: form.formId,
        version: form.version,
      }));

      res.json({ data });
    } catch (err) {
      next(err);
    }
  }
}
