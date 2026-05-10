/**
 * Rate-limit coverage test — Story 9-9 AC#4 (2026-05-10).
 *
 * This test is the canonical contract between the auth route table and the
 * rate-limit middleware wiring. It asserts:
 *
 *   1. Every route declared in `auth.routes.ts` has a coverage map entry
 *      (no orphan routes — adding a new endpoint without updating this map
 *      fails the test).
 *
 *   2. Every coverage map entry maps to an actual route (no stale entries —
 *      removing an endpoint without cleaning the map fails the test).
 *
 *   3. Each route has at least the documented number of middleware handlers.
 *      Drift detection: if someone removes a rate-limit middleware from a
 *      route, the handler count drops and the test fails.
 *
 *   4. Endpoints intentionally without a rate-limit middleware (logout, me,
 *      mfa/enroll) MUST carry an explicit `rationale` string documenting why.
 *      Cannot silently leave an endpoint unprotected.
 *
 * Threshold contract — the documented per-limiter values match NFR4.4 spec:
 *
 *   | Limiter                          | Threshold      | Source        |
 *   |----------------------------------|----------------|---------------|
 *   | loginRateLimit                   | 5/IP/15min     | NFR4.4 line 1 |
 *   | strictLoginRateLimit             | 10/IP/1hr      | defense-in-depth |
 *   | refreshRateLimit                 | 10/IP/1min     | sensible default |
 *   | passwordResetRateLimit (IP)      | 10/IP/1hr      | defense-in-depth |
 *   | PasswordResetService.checkRate   | 3/email/1hr    | NFR4.4 line 5 (service layer) |
 *   | passwordResetCompletionRateLimit | 5/IP/15min     | sensible default |
 *   | registrationRateLimit            | 5/IP/15min     | sensible default |
 *   | resendVerificationRateLimit      | 3/email/1hr    | sensible default |
 *   | verifyEmailRateLimit             | 10/IP/15min    | sensible default |
 *   | activationRateLimit              | 10/IP/15min    | sensible default |
 *   | googleAuthRateLimit              | 10/IP/1hr      | sensible default |
 *   | mfaRateLimit                     | 10/IP/1min     | Story 9-13 AC#7 |
 *   | reauthRateLimit                  | 5/IP/15min     | AC#4 audit fix  |
 *
 * If ANY of those values are changed at the source-file level, update this
 * table AND run `pnpm vitest run apps/api/src/middleware/__tests__/rate-limit-coverage.test.ts`
 * to confirm intent. Threshold values are not asserted dynamically here (the
 * `express-rate-limit` library does not expose its options on the returned
 * middleware), so this comment block is the reviewer-facing contract.
 *
 * Behavioral verification (N+1 → 429) is out of scope for this audit-coverage
 * test; that belongs in a separate integration test suite using supertest +
 * Redis test fixtures.
 */

import { describe, it, expect } from 'vitest';
import authRouter from '../../routes/auth.routes.js';

interface CoverageEntry {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  path: string;
  /** Human-readable names of the rate limiters expected on this route. Empty array = exempt. */
  rateLimiters: string[];
  /** Minimum total middleware handlers (rate limiters + auth + captcha + controller). */
  expectedHandlerCount: { min: number };
  /** Required when `rateLimiters` is empty — explains why no rate limiter is needed. */
  rationale?: string;
}

/**
 * Source-of-truth coverage map for `/api/v1/auth/*`.
 * Updated 2026-05-10 per Story 9-9 AC#4 audit.
 *
 * Adding a new route to `auth.routes.ts`? Add an entry here. Test will fail
 * otherwise.
 *
 * Removing a route? Delete its entry here. Test will fail otherwise.
 *
 * Removing a rate limiter from a route without a written exemption rationale?
 * Test will fail.
 */
export const AUTH_RATE_LIMIT_COVERAGE: CoverageEntry[] = [
  // Account activation
  { method: 'GET',  path: '/activate/:token/validate', rateLimiters: ['activationRateLimit'], expectedHandlerCount: { min: 2 } },
  { method: 'POST', path: '/activate/:token',          rateLimiters: ['activationRateLimit'], expectedHandlerCount: { min: 2 } },

  // Login (layered: strict + standard + captcha)
  { method: 'POST', path: '/staff/login',  rateLimiters: ['strictLoginRateLimit', 'loginRateLimit'], expectedHandlerCount: { min: 4 } },
  { method: 'POST', path: '/public/login', rateLimiters: ['strictLoginRateLimit', 'loginRateLimit'], expectedHandlerCount: { min: 4 } },

  // Google OAuth
  { method: 'POST', path: '/google/verify', rateLimiters: ['googleAuthRateLimit'], expectedHandlerCount: { min: 2 } },

  // Public registration + email/OTP verification
  { method: 'POST', path: '/public/register',     rateLimiters: ['registrationRateLimit'],       expectedHandlerCount: { min: 3 } },
  { method: 'GET',  path: '/verify-email/:token', rateLimiters: ['verifyEmailRateLimit'],        expectedHandlerCount: { min: 2 } },
  { method: 'POST', path: '/verify-otp',          rateLimiters: ['verifyEmailRateLimit'],        expectedHandlerCount: { min: 3 } },
  { method: 'POST', path: '/resend-verification', rateLimiters: ['resendVerificationRateLimit'], expectedHandlerCount: { min: 3 } },

  // Session lifecycle
  {
    method: 'POST', path: '/logout', rateLimiters: [], expectedHandlerCount: { min: 2 },
    rationale: 'Authenticated; revokes own session. Burst attempts cannot escalate privilege. Explicit AC#4 audit decision 2026-05-10.',
  },
  { method: 'POST', path: '/refresh', rateLimiters: ['refreshRateLimit'], expectedHandlerCount: { min: 2 } },

  // Password reset (per-email enforcement is in PasswordResetService.checkRateLimit, NOT in route middleware — see audit notes)
  { method: 'POST', path: '/forgot-password',         rateLimiters: ['passwordResetRateLimit'],           expectedHandlerCount: { min: 3 } },
  { method: 'GET',  path: '/reset-password/:token',   rateLimiters: ['passwordResetCompletionRateLimit'], expectedHandlerCount: { min: 2 } },
  { method: 'POST', path: '/reset-password',          rateLimiters: ['passwordResetCompletionRateLimit'], expectedHandlerCount: { min: 2 } },

  // Re-auth (AC#4 audit fix 2026-05-10 — added reauthRateLimit)
  { method: 'POST', path: '/reauth', rateLimiters: ['reauthRateLimit'], expectedHandlerCount: { min: 3 } },

  // Read-only session info
  {
    method: 'GET', path: '/me', rateLimiters: [], expectedHandlerCount: { min: 2 },
    rationale: 'Authenticated; read-only token validation. No write, no auth-derivation. Explicit AC#4 audit decision 2026-05-10.',
  },

  // MFA mutations (Story 9-13)
  {
    method: 'POST', path: '/mfa/enroll', rateLimiters: [], expectedHandlerCount: { min: 4 },
    rationale: 'Authenticated + super_admin role + requireFreshReAuth (Redis-keyed 5-min window). One-time per-user action; the freshReAuth window is the binding control. Explicit AC#4 audit decision 2026-05-10.',
  },
  { method: 'POST', path: '/mfa/verify',           rateLimiters: ['mfaRateLimit'], expectedHandlerCount: { min: 3 } },
  { method: 'POST', path: '/mfa/disable',          rateLimiters: ['mfaRateLimit'], expectedHandlerCount: { min: 5 } },
  { method: 'POST', path: '/mfa/regenerate-codes', rateLimiters: ['mfaRateLimit'], expectedHandlerCount: { min: 5 } },

  // Login step-2 (TOTP / backup code) — full layered stack
  { method: 'POST', path: '/login/mfa',        rateLimiters: ['strictLoginRateLimit', 'loginRateLimit', 'mfaRateLimit'], expectedHandlerCount: { min: 5 } },
  { method: 'POST', path: '/login/mfa-backup', rateLimiters: ['strictLoginRateLimit', 'loginRateLimit', 'mfaRateLimit'], expectedHandlerCount: { min: 5 } },
];

interface ActualRoute {
  method: string;
  path: string;
  handlerCount: number;
}

interface RouterLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: unknown[];
  };
}

interface RouterLike {
  stack: RouterLayer[];
}

function extractRoutes(router: RouterLike): ActualRoute[] {
  const routes: ActualRoute[] = [];
  for (const layer of router.stack) {
    if (!layer.route) continue;
    const path = layer.route.path;
    const methods = Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]);
    for (const method of methods) {
      routes.push({
        method: method.toUpperCase(),
        path,
        handlerCount: layer.route.stack.length,
      });
    }
  }
  return routes;
}

describe('Auth route rate-limit coverage (Story 9-9 AC#4)', () => {
  const actualRoutes = extractRoutes(authRouter as unknown as RouterLike);

  it('every actual route has a coverage map entry (no orphans)', () => {
    const orphans = actualRoutes.filter(
      (r) => !AUTH_RATE_LIMIT_COVERAGE.find((e) => e.method === r.method && e.path === r.path),
    );
    expect(
      orphans,
      `Orphan route(s) — no coverage entry for: ${orphans.map((o) => `${o.method} ${o.path}`).join(', ')}. Add an entry to AUTH_RATE_LIMIT_COVERAGE.`,
    ).toEqual([]);
  });

  it('every coverage map entry maps to an actual route (no stale entries)', () => {
    const stale = AUTH_RATE_LIMIT_COVERAGE.filter(
      (e) => !actualRoutes.find((r) => r.method === e.method && r.path === e.path),
    );
    expect(
      stale,
      `Stale coverage entry(ies) — no actual route for: ${stale.map((s) => `${s.method} ${s.path}`).join(', ')}. Remove from AUTH_RATE_LIMIT_COVERAGE.`,
    ).toEqual([]);
  });

  it('every documented route meets its expected minimum handler count', () => {
    const failures: string[] = [];
    for (const entry of AUTH_RATE_LIMIT_COVERAGE) {
      const actual = actualRoutes.find((r) => r.method === entry.method && r.path === entry.path);
      if (!actual) continue; // covered by the previous test
      if (actual.handlerCount < entry.expectedHandlerCount.min) {
        failures.push(
          `${entry.method} ${entry.path}: actual ${actual.handlerCount} < expected min ${entry.expectedHandlerCount.min} (rate limiters: [${entry.rateLimiters.join(', ')}])`,
        );
      }
    }
    expect(failures, `Handler-count drift detected:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('every endpoint without a rate limiter has an explicit exemption rationale', () => {
    const unjustifiedExempt = AUTH_RATE_LIMIT_COVERAGE.filter(
      (e) => e.rateLimiters.length === 0 && (!e.rationale || e.rationale.trim() === ''),
    );
    expect(
      unjustifiedExempt,
      `Unjustified rate-limit exemption(s) — endpoints have no limiter AND no rationale: ${unjustifiedExempt.map((e) => `${e.method} ${e.path}`).join(', ')}`,
    ).toEqual([]);
  });

  it('coverage map and actual route count match exactly', () => {
    expect(
      actualRoutes.length,
      `Coverage map has ${AUTH_RATE_LIMIT_COVERAGE.length} entries but router has ${actualRoutes.length} routes. Inspect orphan/stale tests above for details.`,
    ).toBe(AUTH_RATE_LIMIT_COVERAGE.length);
  });

  it('NFR4.4 password-reset 3/email/hour is enforced at the service layer', async () => {
    // The route-level passwordResetRateLimit is per-IP (10/IP/hour, defense-in-depth).
    // NFR4.4 specifies 3/email/hour — that lives in PasswordResetService.checkRateLimit.
    // Sentinel: directly assert the exported constants match NFR4.4 spec.
    const mod = await import('../../services/password-reset.service.js');
    expect(mod.PasswordResetService).toBeDefined();
    expect(typeof mod.PasswordResetService.checkRateLimit).toBe('function');
    // R-AC4-6 (pre-commit review): assert constants directly. Changing either constant at
    // the source file fails this test, forcing reviewer to confirm intent against NFR4.4.
    expect(mod.RESET_RATE_LIMIT).toBe(3);
    expect(mod.RESET_RATE_WINDOW).toBe(60 * 60); // 1 hour in seconds
    // A behavioral test (3 calls allowed, 4th rejected) would belong in password-reset.service.test.ts.
  });
});
