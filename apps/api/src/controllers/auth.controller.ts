import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { activationSchema } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

export class AuthController {
  /**
   * POST /api/v1/auth/activate/:token
   */
  static async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const { token } = req.params;
      
      const validation = activationSchema.safeParse(req.body);
      if (!validation.success) {
        throw new AppError('VALIDATION_ERROR', 'Invalid profile data', 400, { errors: validation.error.errors });
      }

      const user = await AuthService.activateAccount(token, validation.data);

      res.status(200).json({
        data: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          status: user.status
        }
      });
    } catch (err) {
      next(err);
    }
  }
}
