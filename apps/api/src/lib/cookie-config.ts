/**
 * Shared refresh-token cookie configuration.
 *
 * Story 9-16 (magic-link login) — extracted from `auth.controller.ts` once a
 * second consumer (`magic-link.controller.ts`) needed the identical cookie
 * name + options + max-age policy. Keeping ONE source of truth prevents the
 * two login channels (password + magic-link) from drifting on cookie scope,
 * sameSite, or expiry — a drift that would silently break refresh-token
 * delivery for one channel.
 */

export const REFRESH_TOKEN_COOKIE_NAME = 'refreshToken';

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
};

/**
 * Refresh-cookie max-age in milliseconds. Remember-me sessions last 30 days;
 * default sessions last 7 days. Mirrors the ternary previously inlined in
 * `staffLogin` / `publicLogin`.
 */
export function refreshCookieMaxAge(rememberMe: boolean): number {
  return rememberMe
    ? 30 * 24 * 60 * 60 * 1000 // 30 days
    : 7 * 24 * 60 * 60 * 1000; // 7 days
}
