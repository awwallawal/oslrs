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
      const body = {
        ...req.body,
        trancheNumber: req.body.trancheNumber ? Number(req.body.trancheNumber) : undefined,
        amount: req.body.amount ? Number(req.body.amount) : undefined,
        staffIds: typeof req.body.staffIds === 'string'
          ? JSON.parse(req.body.staffIds)
          : req.body.staffIds,
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
}
