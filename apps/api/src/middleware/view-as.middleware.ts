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

const MUTATION_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

// Exact view-as MANAGEMENT routes that must stay usable while View-As is active
// (so a Super Admin can always END a session). Story 9-45 AC#2 (F-010).
const VIEW_AS_MGMT_PATHS = new Set([
  '/api/v1/view-as/start',
  '/api/v1/view-as/end',
  '/api/v1/view-as/current',
]);

/**
 * Story 9-45 AC#2 (F-010) — decide the View-As read-only exemption by EXACT
 * pathname (query string stripped), never a substring of `originalUrl`.
 *
 * The old inline check used `req.originalUrl.includes('/view-as/end')`, which
 * matched the QUERY STRING — so `POST /staff/:id/deactivate?x=/view-as/end`
 * slipped through the read-only block. Matching the normalized pathname against
 * an exact allowlist closes that bypass.
 */
export function isViewAsManagementRoute(req: Request): boolean {
  const pathname = (req.originalUrl || '').split('?')[0].replace(/\/+$/, '');
  return VIEW_AS_MGMT_PATHS.has(pathname);
}

/**
 * Returns a 403 AppError if this request is a mutation that must be blocked
 * while View-As is active, else null. Pure decision — shared by the standalone
 * `blockMutationsInViewAs` middleware AND the `authenticate` flow so prod and
 * tests exercise the SAME logic (the old code ran a flawed inline copy while
 * tests greened against dead middleware — F-010 test-integrity lesson).
 */
export function viewAsReadOnlyError(req: Request): AppError | null {
  if (!req.viewAs) return null;
  if (!MUTATION_METHODS.includes(req.method)) return null;
  if (isViewAsManagementRoute(req)) return null;
  return new AppError('VIEW_AS_READ_ONLY', 'Actions disabled in View-As mode', 403);
}

/**
 * Middleware that rejects mutation requests (POST/PUT/PATCH/DELETE) when View-As
 * is active, exempting the exact view-as management routes.
 */
export const blockMutationsInViewAs = (req: Request, _res: Response, next: NextFunction): void => {
  const err = viewAsReadOnlyError(req);
  if (err) return next(err);
  next();
};
