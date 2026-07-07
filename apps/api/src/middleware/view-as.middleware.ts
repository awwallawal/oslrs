/**
 * View-As read-only enforcement (Story 6-7: Super Admin View-As Feature).
 *
 * The actual enforcement lives in the `authenticate` middleware (auth.ts),
 * which attaches the View-As session state and calls `viewAsReadOnlyError` to
 * block mutations. This module exports the shared, PURE decision helpers
 * (`viewAsReadOnlyError` / `isViewAsManagementRoute`) so prod and tests
 * exercise the SAME logic — Story 9-45 AC#2 (F-010).
 *
 * (2026-07-07 hygiene) The old standalone middleware `attachViewAsState` +
 * `blockMutationsInViewAs` were removed: both were exported but mounted on no
 * route (a full security-middleware sweep confirmed the real enforcement is the
 * inline `authenticate` path). Restore from git history if a standalone mount
 * is ever wanted.
 */

import { Request } from 'express';
import { AppError } from '@oslsr/utils';

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
 * while View-As is active, else null. Pure decision — consumed by the
 * `authenticate` flow (auth.ts) so prod and tests exercise the SAME logic (the
 * old code ran a flawed inline copy while tests greened against dead
 * middleware — F-010 test-integrity lesson).
 */
export function viewAsReadOnlyError(req: Request): AppError | null {
  if (!req.viewAs) return null;
  if (!MUTATION_METHODS.includes(req.method)) return null;
  if (isViewAsManagementRoute(req)) return null;
  return new AppError('VIEW_AS_READ_ONLY', 'Actions disabled in View-As mode', 403);
}
