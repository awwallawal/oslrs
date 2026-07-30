import { expect, type Page } from '@playwright/test';

export type StaffRole = 'admin' | 'supervisor';

const DEFAULT_CREDENTIALS: Record<StaffRole, { email: string; password: string }> = {
  admin: {
    email: process.env.E2E_ADMIN_EMAIL ?? 'admin@dev.local',
    password: process.env.E2E_ADMIN_PASSWORD ?? 'admin123',
  },
  supervisor: {
    email: process.env.E2E_SUPERVISOR_EMAIL ?? 'supervisor@dev.local',
    password: process.env.E2E_SUPERVISOR_PASSWORD ?? 'super123',
  },
};

/**
 * Login as a staff member via /staff/login (inline, matches GP-1 pattern).
 * Handles email, password, hCaptcha verification, and waits for dashboard redirect.
 *
 * Centralises the login flow so that all E2E specs share a single implementation.
 * If the login UI changes (hCaptcha selector, button text, etc.), only this file needs updating.
 */
/**
 * TWO CONSTRAINTS ON LOGIN IN THIS SUITE (measured 2026-07-27, Story 13-36 review).
 * Both are easy to rediscover the hard way, so they are recorded here.
 *
 * 1. ONE SESSION PER ACCOUNT — the suite must run single-worker.
 *    The access token lives only in memory (`lib/auth-token-holder.ts`, ADR-022), so
 *    a hard page load rebuilds the session from the httpOnly refresh cookie. But the
 *    API is single-session by design: every login reaps the user's previous refresh
 *    token (`token.service.ts:146`). Because every spec logs in as the same seeded
 *    account per role, parallel workers invalidate each other, and any reload after
 *    that gets 401 → AUTH_LOGOUT → the public home page. Instrumented probe:
 *      pass → `refresh=200, me=200, <page query>=200` (renders in 2-5s)
 *      fail → `refresh=401, refresh=401`, url becomes `/`
 *    Failure rate by worker count: 1 → 0%, 2 → 17%, 4 → 42%, 6 → 58%. Hence
 *    `workers: 1` in playwright.config.ts — see the rationale there before changing it.
 *
 * 2. LOGINS ARE RATE-LIMITED — do not add retry/recovery logins.
 *    The dev server does not set NODE_ENV=test, so the login rate limiter is ACTIVE
 *    (auth.setup.ts:20). A `reloadAuthenticated()` helper that re-logged-in after a
 *    bounced reload was tried and REVERTED: it roughly doubles login volume, trips
 *    the limiter, and strands the page on /staff/login — turning a rare flake into a
 *    reproducible failure (2/12 at `workers: 1`, where the plain reload was 0/5).
 *    Fix the concurrency, never paper over it with more logins.
 */

export async function staffLogin(page: Page, role: StaffRole): Promise<void> {
  const { email, password } = DEFAULT_CREDENTIALS[role];

  await page.goto('/staff/login');
  await page.getByLabel('Email Address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);

  // HCaptcha auto-bypassed via VITE_E2E=true (component calls onVerify on mount)
  await expect(page.getByRole('button', { name: /sign in/i })).toBeEnabled();

  // Race-safe pattern: start the URL wait BEFORE the click. Naive
  // click→waitForURL pattern can flake if React Router navigates faster
  // than the next await is registered. See feedback_route_registration_test_discipline.md.
  //
  // Story 13-36: the wait also accepts `/auth/mfa-challenge` so an MFA-enrolled
  // account fails in ~1s with the line below instead of burning the full 30s
  // navigationTimeout on an unexplained "waiting for **/dashboard/**".
  await Promise.all([
    page.waitForURL(/\/(dashboard|auth\/mfa-challenge)\b/),
    page.getByRole('button', { name: /sign in/i }).click(),
  ]);

  if (page.url().includes('/auth/mfa-challenge')) {
    throw new Error(
      `E2E precondition failed: "${email}" has MFA enrolled, so staff login stops at the TOTP ` +
        `challenge and every admin-dependent test times out.\n` +
        `The suite expects the CI-equivalent dev-seed state (MFA off, no grace window).\n` +
        `Fix: pnpm --filter @oslsr/api db:seed:dev  ` +
        `(it re-converges drifted @dev.local accounts — see apps/api/src/db/seeds/index.ts).\n` +
        `Same fix for the sibling symptom: login succeeds but privileged pages show ` +
        `"MFA enrollment is required before you can continue" (a stale, expired mfa_grace_until).`,
    );
  }
}
