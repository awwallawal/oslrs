import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { isOdkFullyConfigured, getOdkConfig, createOdkHealthService } from '@oslsr/odk-integration';
import { authenticate } from '../../middleware/auth.js';
import { authorize } from '../../middleware/rbac.js';
import { UserRole } from '@oslsr/types';
import { OdkHealthAdminService } from '../../services/odk-health-admin.service.js';
import { OdkBackfillAdminService } from '../../services/odk-backfill-admin.service.js';
import pino from 'pino';

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
 * Triggers a manual health check (async, queued job).
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
 * POST /api/v1/admin/odk/health/check-now
 *
 * Performs an immediate, synchronous health check against ODK Central.
 * Returns real-time connectivity status directly (not queued).
 * Per Story 2.5-2: Used by "Check Now" button for immediate feedback.
 */
router.post('/health/check-now', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getOdkConfig();
    if (!config) {
      throw new AppError('ODK_CONFIG_ERROR', 'ODK integration is not fully configured', 503);
    }

    const logger = pino({ name: 'odk-health-check-now' });

    // Create a minimal persistence object (we don't need persistence for connectivity check)
    const healthService = createOdkHealthService({
      persistence: {
        createSyncFailure: async () => { throw new Error('Not implemented'); },
        getSyncFailures: async () => [],
        getSyncFailureById: async () => null,
        updateSyncFailure: async () => {},
        deleteSyncFailure: async () => {},
      },
      logger: {
        info: (obj) => logger.info(obj),
        warn: (obj) => logger.warn(obj),
        error: (obj) => logger.error(obj),
        debug: (obj) => logger.debug(obj),
      },
    });

    // Perform synchronous connectivity check
    const connectivity = await healthService.checkOdkConnectivity();

    // Update Redis cache with new status
    await OdkHealthAdminService.cacheConnectivityStatus(connectivity);

    // Determine overall status
    const status = connectivity.reachable
      ? 'healthy'
      : connectivity.consecutiveFailures >= 3
        ? 'error'
        : 'warning';

    // Get unresolved failure count
    const unresolvedFailures = await OdkHealthAdminService.getUnresolvedFailureCount();

    res.json({
      status: 'success',
      data: {
        status,
        lastCheckAt: connectivity.lastChecked,
        consecutiveFailures: connectivity.consecutiveFailures,
        projectId: config.ODK_PROJECT_ID,
        unresolvedFailures,
        latencyMs: connectivity.latencyMs,
        reachable: connectivity.reachable,
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
