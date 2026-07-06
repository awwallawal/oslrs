/**
 * Story 13-17 — global step-up re-auth gate.
 *
 * Framework-free single-flight coordination between `api-client.ts` (which
 * detects `403 AUTH_REAUTH_REQUIRED` responses) and the React layer
 * (AuthContext → global ReAuthModal). Mirrors the 9-49 auth-token-holder
 * split: api-client is the REQUESTER; AuthContext is the HOST — it registers
 * a listener that opens the modal and later settles the outcome.
 *
 * Single-flight: N concurrent re-auth-required rejections share ONE modal
 * prompt — every queued request settles on the same outcome (mirrors the
 * 9-49 boot-refresh queue). Fail-closed: with no registered host (tests,
 * detached non-React contexts) the request resolves `false` — the caller
 * rejects honestly instead of retrying blind.
 */

type ReAuthRequestListener = (action: string) => void;

let listener: ReAuthRequestListener | null = null;
let inFlight: { promise: Promise<boolean>; resolve: (ok: boolean) => void } | null = null;

/**
 * Register the UI host that runs the step-up re-auth flow (AuthContext).
 * Pass null on unmount.
 */
export function setReAuthRequestListener(l: ReAuthRequestListener | null): void {
  listener = l;
}

/**
 * Ask the host UI to run the step-up re-auth flow for `action` (a
 * human-readable description shown in the modal). Resolves `true` after a
 * successful re-auth, `false` on cancel/failure or when no host is
 * registered. Never rejects.
 */
export function requestReAuth(action: string): Promise<boolean> {
  if (!listener) return Promise.resolve(false);
  if (!inFlight) {
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((r) => {
      resolve = r;
    });
    inFlight = { promise, resolve };
    listener(action);
  }
  return inFlight.promise;
}

/**
 * Settle the in-flight re-auth request (host side): `true` after a verified
 * re-auth, `false` on cancel. Safe to call with nothing pending (no-op) —
 * e.g. the modal's close-after-success path.
 */
export function resolveReAuth(ok: boolean): void {
  if (!inFlight) return;
  const current = inFlight;
  inFlight = null;
  current.resolve(ok);
}

/** True while a re-auth prompt is unresolved. */
export function hasPendingReAuth(): boolean {
  return inFlight !== null;
}

/** Test-only: reset module state between tests. */
export function __resetReAuthGate(): void {
  listener = null;
  inFlight = null;
}
