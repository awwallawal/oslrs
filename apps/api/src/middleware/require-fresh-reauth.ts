/**
 * Story 13-18 — consolidation shim.
 *
 * This module used to carry a second, near-identical implementation of the
 * unconditional step-up gate (Story 9-13's MFA-mutation variant). The
 * canonical implementation now lives in `sensitive-action.ts`; this re-export
 * keeps the existing `auth.routes.ts` import path (and the route tests that
 * mock this module path) stable.
 */
export { requireFreshReAuth } from './sensitive-action.js';
