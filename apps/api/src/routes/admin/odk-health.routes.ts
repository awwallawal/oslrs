import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { isOdkFullyConfigured, getOdkConfig } from '@oslsr/odk-integration';
import { authenticate } from '../../middleware/auth.js';
import { authorize } from '../../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { OdkHealthAdminService } from '../../services/odk-health-admin.service.js';
import { OdkBackfillAdminService } from '../../services/odk-backfill-admin.service.js';

const router = Router();

// All routes require Super Admin + ODK configuration check
router.use(authenticate, authorize(UserRole.SUPER_ADMIN));

// Middleware to check ODK is configured
router.use((req: Request, res: Response, next: NextFunction) => {
  if (!isOdkFullyConfigured()) {
    return next(new AppError(
      'ODK_CONFIG_ERROR',
      'ODK integration is not fully configured',
      503
    ));
  }
  next();
});

/**
 * GET /api/v1/admin/odk/health
 *
 * Returns ODK health dashboard data (cached from last health check).
 * Per AC1: Displays failures in "ODK Sync Failures" widget.
 * Per Task 7.3: Don't call ODK API live - use cached data.
 */
router.get('/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const healthData = await OdkHealthAdminService.getHealthDashboard();

    res.json({
      status: 'success',
      data: healthData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/odk/health/check
 *
 * Triggers a manual health check.
 * Returns job ID for tracking.
 */
router.post('/health/check', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = await OdkHealthAdminService.triggerHealthCheck();

    res.json({
      status: 'success',
      data: {
        jobId,
        message: 'Health check job queued',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/odk/failures/:id/retry
 *
 * Retry a specific sync failure.
 * Per AC2: Re-attempts the operation and updates status.
 */
router.post('/failures/:id/retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.sub;
    if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

    const { id } = req.params;

    const result = await OdkHealthAdminService.retryFailure(id, userId);

    res.json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/v1/admin/odk/failures/:id
 *
 * Dismiss/resolve a sync failure (marks as resolved without retry).
 * Creates audit log entry.
 */
router.delete('/failures/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.sub;
    if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

    const { id } = req.params;

    await OdkHealthAdminService.dismissFailure(id, userId);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/odk/failures
 *
 * Get all unresolved sync failures.
 */
router.get('/failures', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const failures = await OdkHealthAdminService.getUnresolvedFailures();

    res.json({
      status: 'success',
      data: failures,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/odk/backfill/gap
 *
 * Get submission gap between ODK Central and app_db.
 * Per AC5: Shows which forms have missing submissions.
 */
router.get('/backfill/gap', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getOdkConfig();
    if (!config) {
      throw new AppError('ODK_CONFIG_ERROR', 'ODK integration is not fully configured', 503);
    }

    const gapResult = await OdkBackfillAdminService.getSubmissionGap(config.ODK_PROJECT_ID);

    res.json({
      status: 'success',
      data: gapResult,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/odk/backfill
 *
 * Pull missing submissions from ODK Central.
 * Per AC5: Acquires lock, queries ODK for missing submissions,
 * ingests through standard BullMQ pipeline (idempotent via submission ID check).
 */
router.post('/backfill', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getOdkConfig();
    if (!config) {
      throw new AppError('ODK_CONFIG_ERROR', 'ODK integration is not fully configured', 503);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = (req as any).user?.sub;
    if (!userId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

    const result = await OdkBackfillAdminService.backfillMissingSubmissions(config.ODK_PROJECT_ID, userId);

    res.json({
      status: 'success',
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/odk/backfill/status
 *
 * Check if backfill is in progress.
 */
router.get('/backfill/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getOdkConfig();
    if (!config) {
      throw new AppError('ODK_CONFIG_ERROR', 'ODK integration is not fully configured', 503);
    }

    const inProgress = await OdkBackfillAdminService.isBackfillInProgress(config.ODK_PROJECT_ID);

    res.json({
      status: 'success',
      data: { inProgress },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
