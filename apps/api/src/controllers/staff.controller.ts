import { Request, Response, NextFunction } from 'express';
import { StaffService } from '../services/staff.service.js';
import { importQueue } from '../queues/import.queue.js';
import { AppError } from '@oslsr/utils';

export class StaffController {
  static async createManual(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = (req as any).user?.id;
      if (!actorId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

      const staff = await StaffService.createManual(req.body, actorId);
      res.status(201).json({
        status: 'success',
        data: staff,
      });
    } catch (err) {
      next(err);
    }
  }

  static async importCsv(req: Request, res: Response, next: NextFunction) {
    try {
      const actorId = (req as any).user?.id;
      if (!actorId) throw new AppError('UNAUTHORIZED', 'User not authenticated', 401);

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
        status: 'success',
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
        status: 'success',
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
}
