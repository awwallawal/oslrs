import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { PhotoProcessingService } from '../services/photo-processing.service.js';

const photoService = new PhotoProcessingService();

export class UserController {
  static async uploadSelfie(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'No image file provided', 400);
      }

      // Check if user is authenticated (middleware should have set req.user)
      const userId = (req as any).user?.userId;
      if (!userId) {
        throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
      }

      const { originalUrl, idCardUrl, livenessScore } = await photoService.processLiveSelfie(req.file.buffer);

      // Update user record
      const [updatedUser] = await db.update(users)
        .set({
          liveSelfieOriginalUrl: originalUrl,
          liveSelfieIdCardUrl: idCardUrl,
          livenessScore: livenessScore?.toString(), // Store as text
          liveSelfieVerifiedAt: new Date(), // Auto-verify for now, or null if manual review needed
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId))
        .returning();

      if (!updatedUser) {
        throw new AppError('USER_NOT_FOUND', 'User not found', 404);
      }

      res.status(200).json({
        status: 'success',
        data: {
          liveSelfieOriginalUrl: updatedUser.liveSelfieOriginalUrl,
          liveSelfieIdCardUrl: updatedUser.liveSelfieIdCardUrl,
          livenessScore: parseFloat(updatedUser.livenessScore || '0'),
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
