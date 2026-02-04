import { UserRole, JwtPayload } from '@oslsr/types';
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
    }
  }
}

/**
 * Express Request with guaranteed authenticated user.
 * Use this type in controllers after authenticate middleware has run.
 */
export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
  sessionId?: string;
}
