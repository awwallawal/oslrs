/**
 * Settings admin routes — super-admin-only feature flag management.
 *
 * Mounted under `/api/v1/admin/settings` via admin.routes.ts (sub-router
 * pattern matches audit-log-viewer).
 *
 * Endpoints:
 *   - GET  /            — list all settings (60/min)
 *   - GET  /:key        — get one setting full row (60/min)
 *   - PATCH /:key       — update one setting (30/min, audit-logged)
 *
 * All endpoints require `authenticate` + `authorize(UserRole.SUPER_ADMIN)`.
 * Non-super-admin returns 403 from the rbac middleware.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/rbac.js';
import { requireFreshReAuth } from '../middleware/sensitive-action.js';
import { settingsListRateLimit, settingsWriteRateLimit } from '../middleware/settings-rate-limit.js';
import { SettingsService } from '../services/settings.service.js';
import type { AuthenticatedRequest } from '../types.js';

const router = Router();

const keyParamSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z][a-z0-9_.]*$/i, 'key must be alphanumeric with dots or underscores'),
});

// Zod's z.unknown() is treated as optional inside z.object — it does NOT
// reject missing keys. We do a manual `'value' in body` check instead so
// `PATCH /:key {}` is rejected with a clear error. `description` is optional;
// when present, it must be a non-empty string.
function parsePatchBody(body: unknown): { value: unknown; description?: string } | null {
  if (!body || typeof body !== 'object') return null;
  const obj = body as Record<string, unknown>;
  if (!('value' in obj)) return null;
  if ('description' in obj) {
    if (typeof obj.description !== 'string' || obj.description.length === 0) return null;
    return { value: obj.value, description: obj.description };
  }
  return { value: obj.value };
}

/**
 * GET /api/v1/admin/settings — list all settings.
 */
router.get(
  '/',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  settingsListRateLimit,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const settings = await SettingsService.listSettings();
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /api/v1/admin/settings/:key — get one setting full row (AC#4 shape).
 */
router.get(
  '/:key',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  settingsListRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = keyParamSchema.safeParse(req.params);
      if (!parsed.success) {
        throw new AppError('SETTINGS_INVALID_KEY', 'Invalid setting key', 400, {
          issues: parsed.error.issues,
        });
      }
      const row = await SettingsService.getSettingRow(parsed.data.key);
      if (row === null) {
        throw new AppError('SETTINGS_NOT_FOUND', `Setting "${parsed.data.key}" not found`, 404);
      }
      res.json({
        key: row.key,
        value: row.value,
        description: row.description,
        updated_by: row.updatedBy,
        updated_at: row.updatedAt,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PATCH /api/v1/admin/settings/:key — update one setting (audit-logged).
 *
 * Body: `{ value: <jsonb>, description?: string }`. When `description` is
 * supplied, it is applied to the row (both INSERT and UPDATE paths). When
 * omitted, the existing description is preserved (or remains NULL on insert).
 */
router.patch(
  '/:key',
  authenticate,
  authorize(UserRole.SUPER_ADMIN),
  requireFreshReAuth, // F-014 — settings write requires step-up re-auth
  settingsWriteRateLimit,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const params = keyParamSchema.safeParse(req.params);
      if (!params.success) {
        throw new AppError('SETTINGS_INVALID_KEY', 'Invalid setting key', 400, {
          issues: params.error.issues,
        });
      }
      const body = parsePatchBody(req.body);
      if (body === null) {
        throw new AppError(
          'SETTINGS_INVALID_BODY',
          'Body must be { value: <jsonb>, description?: non-empty string }',
          400,
        );
      }

      const authReq = req as AuthenticatedRequest;
      const actorId = authReq.user?.sub;
      if (!actorId) {
        // Defensive — `authenticate` guarantees this, but TypeScript doesn't know that.
        throw new AppError('AUTH_REQUIRED', 'Actor missing on authenticated request', 401);
      }

      await SettingsService.setSetting(
        params.data.key,
        body.value,
        actorId,
        { ipAddress: req.ip, userAgent: req.get('user-agent') },
        body.description !== undefined ? { description: body.description } : undefined,
      );

      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);

export default router;
