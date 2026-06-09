/**
 * Story 9-49 (ADR-022) — in-memory access-token holder.
 *
 * The access token lives ONLY in module memory — never `localStorage` or
 * `sessionStorage` — so a successful XSS cannot read a usable bearer token at
 * rest (closing the residual exposure F-004 left). AuthContext is the WRITER
 * (login / silent-refresh / logout); `api-client.ts` is the READER (attaches the
 * `Authorization: Bearer` header). Transport is unchanged (still Bearer, AC#5).
 *
 * Single-flight boot refresh (AC#3): on boot/reload AuthContext re-mints the token
 * from the httpOnly refresh cookie via `/auth/refresh`. While that request is in
 * flight, authed requests must AWAIT it rather than fire a 401 stampede.
 * `setBootRefresh()` registers the in-flight promise; `awaitAccessToken()` resolves
 * once it settles. The promise auto-clears on settle so later reads don't block.
 */

let accessToken: string | null = null;
let bootRefresh: Promise<unknown> | null = null;

/** Set (or replace) the in-memory access token. Pass null to clear. */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

/** Current in-memory access token (synchronous; null if unauthenticated). */
export function getAccessToken(): string | null {
  return accessToken;
}

/** Clear the in-memory access token (logout / failed refresh). */
export function clearAccessToken(): void {
  accessToken = null;
}

/**
 * Register the in-flight boot/silent refresh so concurrent authed requests can
 * queue on it (AC#3). Auto-clears once the promise settles so a stale resolved
 * promise never gates later reads.
 */
export function setBootRefresh(p: Promise<unknown> | null): void {
  bootRefresh = p;
  if (p) {
    void p.then(
      () => { if (bootRefresh === p) bootRefresh = null; },
      () => { if (bootRefresh === p) bootRefresh = null; },
    );
  }
}

/**
 * Resolve the current access token, first awaiting any in-flight boot refresh
 * (AC#3 request-queue-until-ready). Returns null if still unauthenticated after
 * the refresh settles. A failed boot refresh is swallowed → caller stays
 * unauthenticated (the request will then 401 and the app redirects to sign-in).
 */
export async function awaitAccessToken(): Promise<string | null> {
  if (accessToken) return accessToken;
  if (bootRefresh) {
    try {
      await bootRefresh;
    } catch {
      /* refresh failed — remain unauthenticated */
    }
  }
  return accessToken;
}

/** Test-only: reset module state between tests. */
export function __resetAuthTokenHolder(): void {
  accessToken = null;
  bootRefresh = null;
}
