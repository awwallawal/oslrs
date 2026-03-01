/**
 * Remuneration Controller — Bulk Payment Recording & Management
 *
 * Story 6.4: HTTP handler layer for payment batch creation, correction,
 * history queries, and receipt file downloads.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '@oslsr/utils';
import { RemunerationService } from '../services/remuneration.service.js';
import { AuditService, PII_ACTIONS } from '../services/audit.service.js';
import type { AuthenticatedRequest } from '../types.js';

/** Zod schema for creating a payment batch */
const createPaymentBatchSchema = z.object({
  trancheName: z.string().min(1, 'Tranche name is required'),
  trancheNumber: z.number().int().positive('Tranche number must be a positive integer'),
  amount: z.number().int().positive('Amount must be a positive integer (in kobo)'),
  staffIds: z.array(z.string().uuid()).min(1, 'At least one staff member is required'),
  bankReference: z.string().optional(),
  description: z.string().optional(),
  lgaId: z.string().uuid().optional(),
  roleFilter: z.string().optional(),
});

/** Zod schema for correcting a payment record */
const correctPaymentRecordSchema = z.object({
  newAmount: z.number().int().positive('Amount must be a positive integer (in kobo)'),
  reason: z.string().min(1, 'Correction reason is required'),
});

/** Zod schema for list filters */
const listFiltersSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/** Zod schema for staff history filters */
const staffHistorySchema = listFiltersSchema.extend({
  includeCorrections: z.coerce.boolean().optional().default(false),
});

/** Zod schema for eligible staff filters */
const eligibleStaffSchema = z.object({
  roleFilter: z.string().optional(),
  lgaId: z.string().uuid().optional(),
});

/** Zod schema for opening a dispute (Story 6.5) */
const openDisputeSchema = z.object({
  paymentRecordId: z.string().uuid('Payment record ID must be a valid UUID'),
  staffComment: z.string().min(10, 'Please describe the issue in at least 10 characters'),
});

/** Zod schema for dispute queue filters (Story 6.6) */
const disputeQueueFiltersSchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional().transform((val) => {
    if (!val) return undefined;
    return Array.isArray(val) ? val : [val];
  }),
  lgaId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

/** Zod schema for resolving a dispute (Story 6.6) */
const resolveDisputeSchema = z.object({
  adminResponse: z.string().min(1, 'Resolution response is required'),
});

/** Zod schema for reopening a dispute (Story 6.6) */
const reopenDisputeSchema = z.object({
  staffComment: z.string().min(10, 'Please describe why you are reopening (at least 10 characters)'),
});

export class RemunerationController {
  /**
   * POST /api/v1/remuneration
   * Create a payment batch with individual records.
   */
  static async createBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      // Parse body — multipart form data sends fields as strings
      // Explicit field extraction to prevent mass assignment
      let staffIds = req.body.staffIds;
      if (typeof staffIds === 'string') {
        try { staffIds = JSON.parse(staffIds); } catch { /* let Zod reject it */ }
      }
      const body = {
        trancheName: req.body.trancheName,
        trancheNumber: req.body.trancheNumber != null ? Number(req.body.trancheNumber) : undefined,
        amount: req.body.amount != null ? Number(req.body.amount) : undefined,
        staffIds,
        bankReference: req.body.bankReference,
        description: req.body.description,
        lgaId: req.body.lgaId,
        roleFilter: req.body.roleFilter,
      };

      const parseResult = createPaymentBatchSchema.safeParse(body);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Invalid payment batch data',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const receiptFile = req.file ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      } : undefined;

      const batch = await RemunerationService.createPaymentBatch(
        { ...parseResult.data, receiptFile },
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.status(201).json({
        success: true,
        data: batch,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration
   * List payment batches with pagination.
   */
  static async listBatches(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parseResult = listFiltersSchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400);
      }

      const result = await RemunerationService.getPaymentBatches(parseResult.data);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/:batchId
   * Get batch detail with individual records.
   */
  static async getBatchDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { batchId } = req.params;
      if (!batchId) {
        throw new AppError('VALIDATION_ERROR', 'Batch ID is required', 400);
      }

      const batch = await RemunerationService.getBatchDetail(batchId);
      res.json({ success: true, data: batch });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/remuneration/records/:recordId
   * Correct a payment record (temporal versioning).
   */
  static async correctRecord(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { recordId } = req.params;
      if (!recordId) {
        throw new AppError('VALIDATION_ERROR', 'Record ID is required', 400);
      }

      const parseResult = correctPaymentRecordSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'Invalid correction data',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const newRecord = await RemunerationService.correctPaymentRecord(
        recordId,
        parseResult.data,
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.json({ success: true, data: newRecord });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/staff/:userId/history
   * Get staff payment history.
   */
  static async getStaffHistory(req: Request, res: Response, next: NextFunction) {
    try {
      const authUser = (req as AuthenticatedRequest).user;
      if (!authUser?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { userId } = req.params;
      if (!userId) {
        throw new AppError('VALIDATION_ERROR', 'User ID is required', 400);
      }

      // Staff can only view their own payment history (unless Super Admin)
      if (authUser.role !== 'super_admin' && authUser.sub !== userId) {
        throw new AppError('FORBIDDEN', 'You can only view your own payment history', 403);
      }

      const parseResult = staffHistorySchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400);
      }

      // Log PII access for viewing payment history
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_RECORD,
        'payment_history',
        userId,
      );

      const result = await RemunerationService.getStaffPaymentHistory(userId, parseResult.data);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/files/:fileId
   * Download a receipt file from S3.
   */
  static async downloadFile(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { fileId } = req.params;
      if (!fileId) {
        throw new AppError('VALIDATION_ERROR', 'File ID is required', 400);
      }

      const file = await RemunerationService.getFileStream(fileId);

      res.setHeader('Content-Type', file.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
      if (file.sizeBytes) {
        res.setHeader('Content-Length', file.sizeBytes.toString());
      }

      // Pipe S3 stream to response
      const body = file.stream as NodeJS.ReadableStream;
      body.pipe(res);
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/remuneration/disputes
   * Open a dispute on a payment record (Story 6.5, AC3).
   */
  static async openDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parseResult = openDisputeSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parseResult.error.errors[0]?.message || 'Invalid dispute data',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const dispute = await RemunerationService.openDispute(
        parseResult.data.paymentRecordId,
        parseResult.data.staffComment,
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.status(201).json({
        success: true,
        data: dispute,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/disputes/mine
   * Get the authenticated staff member's own disputes (Story 6.5).
   */
  static async getMyDisputes(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parseResult = listFiltersSchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400);
      }

      const result = await RemunerationService.getStaffDisputes(user.sub, parseResult.data);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/eligible-staff
   * Get staff eligible for payment recording (filtered by role/LGA).
   */
  static async getEligibleStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parseResult = eligibleStaffSchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400);
      }

      const staff = await RemunerationService.getEligibleStaff(parseResult.data);
      res.json({ success: true, data: staff });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Story 6.6: Admin Dispute Resolution Queue
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/v1/remuneration/disputes
   * Get paginated dispute queue for Super Admin (AC1).
   */
  static async getDisputeQueue(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const parseResult = disputeQueueFiltersSchema.safeParse(req.query);
      if (!parseResult.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid query parameters', 400);
      }

      const result = await RemunerationService.getDisputeQueue(parseResult.data);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/disputes/stats
   * Get dispute queue statistics (AC1).
   */
  static async getDisputeStats(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const stats = await RemunerationService.getDisputeStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/remuneration/disputes/:disputeId
   * Get dispute detail with full context (AC2).
   */
  static async getDisputeDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw new AppError('VALIDATION_ERROR', 'Dispute ID is required', 400);
      }

      // Log PII access for viewing dispute detail
      AuditService.logPiiAccess(
        req as AuthenticatedRequest,
        PII_ACTIONS.VIEW_RECORD,
        'payment_dispute',
        disputeId,
      );

      const detail = await RemunerationService.getDisputeDetail(disputeId);
      res.json({ success: true, data: detail });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/remuneration/disputes/:disputeId/acknowledge
   * Acknowledge a dispute (AC3).
   */
  static async acknowledgeDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw new AppError('VALIDATION_ERROR', 'Dispute ID is required', 400);
      }

      const updated = await RemunerationService.acknowledgeDispute(
        disputeId,
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/remuneration/disputes/:disputeId/resolve
   * Resolve a dispute with admin response and optional evidence (AC4).
   */
  static async resolveDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw new AppError('VALIDATION_ERROR', 'Dispute ID is required', 400);
      }

      const parseResult = resolveDisputeSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parseResult.error.errors[0]?.message || 'Invalid resolve data',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const evidenceFile = req.file ? {
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      } : undefined;

      const updated = await RemunerationService.resolveDispute(
        disputeId,
        parseResult.data.adminResponse,
        evidenceFile,
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PATCH /api/v1/remuneration/disputes/:disputeId/reopen
   * Reopen a resolved dispute (AC5). Staff-only.
   */
  static async reopenDispute(req: Request, res: Response, next: NextFunction) {
    try {
      const user = (req as AuthenticatedRequest).user;
      if (!user?.sub) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      const { disputeId } = req.params;
      if (!disputeId) {
        throw new AppError('VALIDATION_ERROR', 'Dispute ID is required', 400);
      }

      const parseResult = reopenDisputeSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          parseResult.error.errors[0]?.message || 'Invalid reopen data',
          400,
          { errors: parseResult.error.flatten().fieldErrors },
        );
      }

      const updated = await RemunerationService.reopenDispute(
        disputeId,
        parseResult.data.staffComment,
        user.sub,
        req.ip || req.socket?.remoteAddress,
        req.headers['user-agent'],
      );

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }
}
