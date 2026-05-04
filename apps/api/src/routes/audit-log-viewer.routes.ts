/**
 * Story 9-11 — Audit Log Viewer routes (read-side).
 *
 * Distinct from `audit.routes.ts` (write-side; Story 6-1 hash-chain
 * verification + emergency endpoints). All endpoints here are super-admin-only
 * and surface the audit_logs table for compliance investigation.
 *
 * Mount path: `/api/v1/admin/audit-logs/*` (mounted from admin.routes.ts).
 *
 * Endpoints (per AC#9):
 *   - GET    /                         — list with filters + cursor pagination
 *   - GET    /distinct/:field          — distinct values for filter dropdowns
 *   - GET    /principals/search?q=...  — actor autocomplete
 *   - POST   /export                   — CSV export with filter signature
 *   - GET    /:id                      — single audit log detail
 *
 * Note on route ordering: the `:id` parameter route is registered LAST so
 * that the more-specific `/distinct/:field`, `/principals/search`, `/export`
 * routes match first. Express tries routes in registration order.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import {
  auditLogReadRateLimit,
  auditLogExportRateLimit,
} from '../middleware/audit-log-rate-limit.js';
import {
  listAuditLogs,
  getAuditLogById,
  getDistinctValues,
  searchPrincipals,
  exportAuditLogsCsv,
  ExportTooLargeError,
  type AuditLogFilter,
  type PrincipalType,
} from '../services/audit-log-viewer.service.js';
import { AuditService, AUDIT_ACTIONS } from '../services/audit.service.js';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import pino from 'pino';

const logger = pino({ name: 'audit-log-viewer-routes' });

const router = Router();

// All endpoints require authenticated super-admin.
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

const PRINCIPAL_TYPES = ['user', 'consumer', 'system'] as const;
const DISTINCT_FIELDS = ['action', 'target_resource'] as const;

const principalTypesSchema = z
  .union([
    z.string().transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean)),
    z.array(z.string()),
  ])
  .pipe(
    z.array(z.enum(PRINCIPAL_TYPES)).min(1, 'At least one principal type must be selected')
  );

const actionsSchema = z
  .union([
    z.string().transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean)),
    z.array(z.string()),
  ])
  .pipe(z.array(z.string().min(1).max(64)).max(50));

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: 'Invalid ISO date',
  });

const listQuerySchema = z.object({
  principal: principalTypesSchema.optional(),
  actorId: z.string().uuid().optional(),
  action: actionsSchema.optional(),
  targetResource: z.string().min(1).max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z
    .union([z.string().transform((s) => parseInt(s, 10)), z.number()])
    .optional()
    .pipe(z.number().int().min(1).max(100).optional()),
});

function buildFilterFromQuery(parsed: z.infer<typeof listQuerySchema>): AuditLogFilter {
  // Default the principal-types so an unfiltered request returns everything.
  const principalTypes: PrincipalType[] = parsed.principal ?? ['user', 'consumer', 'system'];
  // Default time window: last 24 hours (per AC#2).
  const now = Date.now();
  const defaultFrom = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  return {
    principalTypes,
    actorId: parsed.actorId,
    actions: parsed.action,
    targetResource: parsed.targetResource,
    from: parsed.from ?? defaultFrom,
    to: parsed.to,
    cursor: parsed.cursor,
    limit: parsed.limit,
  };
}

/** GET / — list with filters + cursor pagination. AC#2, AC#5, AC#6. */
router.get(
  '/',
  auditLogReadRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = listQuerySchema.parse(req.query);
      const filter = buildFilterFromQuery(parsed);
      const result = await listAuditLogs(filter);
      res.json({ data: result });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(new AppError('INVALID_QUERY', err.issues[0]?.message ?? 'Invalid query', 400));
      }
      next(err);
    }
  }
);

/** GET /distinct/:field — distinct values for filter dropdowns. AC#3. */
router.get(
  '/distinct/:field',
  auditLogReadRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const field = req.params.field;
      if (!DISTINCT_FIELDS.includes(field as (typeof DISTINCT_FIELDS)[number])) {
        throw new AppError(
          'INVALID_FIELD',
          `Field must be one of: ${DISTINCT_FIELDS.join(', ')}`,
          400
        );
      }
      const values = await getDistinctValues(field as 'action' | 'target_resource');
      res.json({ data: values });
    } catch (err) {
      next(err);
    }
  }
);

/** GET /principals/search?q=... — actor autocomplete. AC#3. */
router.get(
  '/principals/search',
  auditLogReadRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      if (q.trim().length === 0) {
        return res.json({ data: [] });
      }
      const results = await searchPrincipals(q);
      res.json({ data: results });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /export — CSV export with filter signature in filename + first comment row.
 * AC#8. The export action is itself audit-logged via AUDIT_LOG_EXPORTED.
 */
router.post(
  '/export',
  auditLogExportRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Body shape mirrors the GET / query schema (the UI POSTs the current
      // filter state as JSON to avoid URL-length limits with long action arrays).
      const bodySchema = z.object({
        principal: z.array(z.enum(PRINCIPAL_TYPES)).optional(),
        actorId: z.string().uuid().optional(),
        action: z.array(z.string().min(1).max(64)).max(50).optional(),
        targetResource: z.string().min(1).max(64).optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
      });
      const parsed = bodySchema.parse(req.body ?? {});
      const filter: AuditLogFilter = {
        principalTypes: parsed.principal ?? ['user', 'consumer', 'system'],
        actorId: parsed.actorId,
        actions: parsed.action,
        targetResource: parsed.targetResource,
        from: parsed.from,
        to: parsed.to,
      };

      // Look up the exporter's full_name for the AC#8 first-row signature.
      const exporterId = (req as Request & { user?: { sub: string } }).user?.sub;
      if (!exporterId) {
        throw new AppError('AUTH_REQUIRED', 'Authentication required', 401);
      }
      const userRow = await db.execute(
        sql`SELECT full_name FROM users WHERE id = ${exporterId}::uuid LIMIT 1`
      );
      const exporterName =
        (userRow.rows[0] as { full_name?: string } | undefined)?.full_name ??
        '(unknown)';

      const result = await exportAuditLogsCsv(filter, exporterId, exporterName);

      // AC#8 — the export action is itself audit-logged.
      AuditService.logAction({
        actorId: exporterId,
        action: AUDIT_ACTIONS.AUDIT_LOG_EXPORTED,
        targetResource: 'audit_logs',
        targetId: null,
        details: {
          filter_signature: result.filterSignature,
          row_count: result.rowCount,
          exporting_actor_id: exporterId,
        },
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${result.filename}"`
      );
      res.setHeader('X-Audit-Log-Row-Count', String(result.rowCount));
      res.send(result.csv);
    } catch (err) {
      if (err instanceof ExportTooLargeError) {
        return next(
          new AppError(
            'EXPORT_TOO_LARGE',
            `Refine filters or use the API for bulk export (matched ${err.count} rows; max ${10000}).`,
            413
          )
        );
      }
      if (err instanceof z.ZodError) {
        return next(
          new AppError('INVALID_BODY', err.issues[0]?.message ?? 'Invalid body', 400)
        );
      }
      logger.error({ err }, 'audit-log export failed');
      next(err);
    }
  }
);

/** GET /:id — single audit log detail. AC#7. Registered LAST to avoid swallowing more-specific paths. */
router.get(
  '/:id',
  auditLogReadRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);
      const row = await getAuditLogById(id);
      if (!row) {
        throw new AppError('AUDIT_LOG_NOT_FOUND', 'Audit log entry not found', 404);
      }
      res.json({ data: row });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return next(new AppError('INVALID_ID', 'Invalid audit log id', 400));
      }
      next(err);
    }
  }
);

export default router;
