import { Request, Response, NextFunction } from 'express';
import { Redis } from 'ioredis';
import { StaffService } from '../services/staff.service.js';
import { importQueue } from '../queues/import.queue.js';
import { AppError } from '@oslsr/utils';
import type { AuthenticatedRequest } from '../types.js';

// Redis connection for rate limiting
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }
  return redis;
}

export class StaffController {
  /**
   * GET /api/v1/staff
   *
   * List all staff members with pagination, filtering, and search.
   * Story 2.5-3, AC1
   */
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { page, limit, status, roleId, lgaId, search } = req.query;

      const result = await StaffService.listUsers({
        page: page ? Number(page) : undefined,
        limit: limit ? Math.min(Number(limit), 100) : undefined,
        status: status as string | undefined,
        roleId: roleId as string | undefined,
        lgaId: lgaId as string | undefined,
        search: search as string | undefined,
      });

      res.json({
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /api/v1/staff/:userId/role
   *
   * Update a user's role with session invalidation.
   * Story 2.5-3, AC5, AC6
   */
  static async updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      const { userId } = req.params;
      const { roleId } = req.body;

      if (!roleId) {
        throw new AppError('VALIDATION_ERROR', 'roleId is required', 400);
      }

      const result = await StaffService.updateRole(userId, roleId, actorId);

      res.json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/staff/:userId/deactivate
   *
   * Deactivate a user account with session invalidation.
   * Story 2.5-3, AC4, AC6
   */
  static async deactivate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      const { userId } = req.params;

      const result = await StaffService.deactivateUser(userId, actorId);

      res.json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/staff/:userId/reactivate
   *
   * Reactivate a deactivated or suspended user account.
   */
  static async reactivate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      const { userId } = req.params;

      const result = await StaffService.reactivateUser(userId, actorId);

      res.json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /api/v1/staff/:userId/id-card
   *
   * Download ID card for a staff member (Super Admin only).
   * Story 2.5-3, AC7
   */
  static async downloadIdCard(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params;

      const { buffer, fileName } = await StaffService.downloadIdCard(userId);

      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
      });

      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  static async createManual(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      const { user, emailStatus } = await StaffService.createManual(req.body, actorId);
      res.status(201).json({
        data: {
          ...user,
          emailStatus, // AC8: Include email status in response
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async importCsv(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      if (!req.file) {
        throw new AppError('FILE_REQUIRED', 'No CSV file uploaded', 400);
      }

      const buffer = req.file.buffer;
      const rows = await StaffService.validateCsv(buffer);

      const job = await importQueue.add('process-import', {
        rows,
        actorId,
      });

      res.status(202).json({
        message: 'Import job queued',
        data: {
          jobId: job.id,
          statusUrl: `/api/v1/staff/import/${job.id}`,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getImportStatus(req: Request, res: Response, next: NextFunction) {
    try {
      const { jobId } = req.params;
      const job = await importQueue.getJob(jobId);

      if (!job) {
        throw new AppError('JOB_NOT_FOUND', 'Import job not found', 404);
      }

      const state = await job.getState();
      const progress = job.progress;
      const result = job.returnvalue;
      const reason = job.failedReason;

      res.json({
        data: {
          jobId: job.id,
          state,
          progress,
          result,
          error: reason,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /api/v1/staff/:userId/resend-invitation
   *
   * Resend invitation email to a staff member.
   * AC5: Manual Resend Capability
   */
  static async resendInvitation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user?.sub) {
        throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);
      }
      const actorId = req.user.sub;

      const { userId } = req.params;
      if (!userId) throw new AppError('MISSING_PARAM', 'User ID is required', 400);

      const result = await StaffService.resendInvitation(userId, actorId, getRedis());

      res.json({
        data: result,
      });
    } catch (err) {
      // Handle rate limit exceeded with proper headers
      if (err instanceof AppError && err.code === 'RATE_LIMIT_EXCEEDED') {
        res.setHeader('Retry-After', err.details?.retryAfter?.toString() || '86400');
      }
      next(err);
    }
  }
}
