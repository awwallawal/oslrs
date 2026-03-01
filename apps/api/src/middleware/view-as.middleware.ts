/**
 * View-As Middleware — Attaches View-As session state and blocks mutations
 *
 * Two middleware functions:
 * 1. attachViewAsState — checks Redis for active View-As session, attaches to req.viewAs
 * 2. blockMutationsInViewAs — rejects POST/PUT/PATCH/DELETE when View-As is active
 *
 * Story 6-7: Super Admin View-As Feature
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from '@oslsr/utils';
import { ViewAsService } from '../services/view-as.service.js';

/**
 * Middleware that checks Redis for an active View-As session and attaches to req.viewAs.
 * Must run after authenticate middleware so req.user is available.
 */
export const attachViewAsState = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    return next();
  }

  const viewAsState = await ViewAsService.getViewAsState(req.user.sub);
  if (viewAsState) {
    req.viewAs = viewAsState;
  }

  next();
};

/**
 * Middleware that rejects mutation requests (POST/PUT/PATCH/DELETE) when View-As is active.
 * Returns 403 with "Actions disabled in View-As mode" message.
 */
export const blockMutationsInViewAs = (req: Request, _res: Response, next: NextFunction): void => {
  if (req.viewAs && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next(new AppError('VIEW_AS_READ_ONLY', 'Actions disabled in View-As mode', 403));
  }

  next();
};
