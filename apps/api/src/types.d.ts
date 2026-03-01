import { JwtPayload } from '@oslsr/types';
import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      sessionId?: string;
      viewAs?: {
        targetRole: string;
        targetLgaId: string | null;
        reason: string | null;
        startedAt: string;
        expiresAt: string;
      };
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
