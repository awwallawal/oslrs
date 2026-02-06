import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';
import { users } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { AppError } from '@oslsr/utils';
import { PhotoProcessingService } from '../services/photo-processing.service.js';
import { IDCardService } from '../services/id-card.service.js';

const photoService = new PhotoProcessingService();
const idCardService = new IDCardService();

export class UserController {
  static async uploadSelfie(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        throw new AppError('VALIDATION_ERROR', 'No image file provided', 400);
      }

      // Check if user is authenticated (middleware should have set req.user)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  static async downloadIDCard(req: Request, res: Response, next: NextFunction) {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const userId = (req as any).user?.userId;
        if (!userId) {
            throw new AppError('AUTH_REQUIRED', 'User not authenticated', 401);
        }

        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
            with: {
                role: true,
                lga: true
            }
        });

        if (!user) {
            throw new AppError('USER_NOT_FOUND', 'User not found', 404);
        }

        if (!user.liveSelfieIdCardUrl) {
            throw new AppError('VALIDATION_ERROR', 'User does not have a verified ID photo', 400);
        }

        // Fetch photo buffer
        const photoBuffer = await photoService.getPhotoBuffer(user.liveSelfieIdCardUrl);

        // Generate PDF
        const pdfBuffer = await idCardService.generateIDCard({
            fullName: user.fullName,
            role: user.role.name,
            lga: user.lga?.name || 'Oyo State',
            photoBuffer,
            verificationUrl: `${process.env.PUBLIC_APP_URL || 'https://oslrs.oyostate.gov.ng'}/verify-staff/${user.id}`
        });

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="oslrs-id-${user.id}.pdf"`,
            'Content-Length': pdfBuffer.length.toString()
        });

        res.send(pdfBuffer);

    } catch (error) {
        next(error);
    }
  }

  static async verifyStaff(req: Request, res: Response, next: NextFunction) {
      try {
          const { id } = req.params;
          
          const user = await db.query.users.findFirst({
              where: eq(users.id, id),
              with: {
                  role: true,
                  lga: true
              }
          });

          if (!user) {
              throw new AppError('USER_NOT_FOUND', 'Staff member not found', 404);
          }

          res.status(200).json({
              data: {
                  id: user.id,
                  fullName: user.fullName,
                  status: user.status,
                  role: user.role.name,
                  lga: user.lga?.name,
                  photoUrl: user.liveSelfieIdCardUrl ? await photoService.getSignedUrl(user.liveSelfieIdCardUrl) : null,
                  verifiedAt: user.liveSelfieVerifiedAt
              }
          });
      } catch (error) {
          next(error);
      }
  }
}
