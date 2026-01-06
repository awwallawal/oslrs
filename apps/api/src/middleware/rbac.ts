import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@oslsr/types';
import { AppError } from '@oslsr/utils';

/**
 * Middleware to authorize users based on their roles.
 * Expects req.user to be populated by an authentication middleware.
 */
export const authorize = (...allowedRoles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return next(new AppError('AUTH_REQUIRED', 'Authentication required', 401));
    }

    if (!allowedRoles.includes(user.role)) {
      return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
    }

    next();
  };
};

/**
 * Middleware to enforce LGA-locking for field staff (Supervisors and Enumerators).
 */
export const requireLgaLock = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    
    if (!user) {
      return next(new AppError('AUTH_REQUIRED', 'Authentication required', 401));
    }

    // Field staff MUST be locked to their assigned LGA
    if (user.role === UserRole.SUPERVISOR || user.role === UserRole.ENUMERATOR) {
      if (!user.lgaId) {
        return next(new AppError('LGA_LOCK_REQUIRED', 'Field staff must be assigned to an LGA', 403));
      }

      // If the request specifies an LGA (param, query, or body), verify it matches the user's lock
      const targetLgaId = req.params.lgaId || req.query.lgaId || req.body.lgaId;
      
      if (targetLgaId && user.lgaId !== targetLgaId) {
        return next(new AppError('LGA_ACCESS_DENIED', 'Access denied to data outside your assigned LGA', 403));
      }
      
      // Force injection of lgaId for field staff if not provided? 
      // For now, just ensuring they don't cross boundaries if provided.
    }

    next();
  };
};
