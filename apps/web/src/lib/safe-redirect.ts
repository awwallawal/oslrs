/**
 * Open-redirect guard for post-auth navigation targets.
 *
 * WHY (2026-07-24): the login / password-reset / MFA flows `navigate(redirectTo)`
 * where `redirectTo` ultimately derives from `location.pathname` (captured by
 * `ProtectedRoute` as `state.from`). A victim lured to
 * `https://oyoskills.com//evil.com` (or a backslash variant) would have that path
 * captured as `from` and, after auth, `navigate('//evil.com')` would be
 * interpreted by the browser as a PROTOCOL-RELATIVE URL → an external redirect
 * (open redirect → phishing / XSS vector).
 *
 * react-router 6.30.4 does NOT sanitize these navigation targets
 * (GHSA-wrjc-x8rr-h8h6 open-redirect, GHSA-jjmj-jmhj-qwj2 open-redirect→XSS); the
 * fix lands only in v7, which crosses a major and broke our web build
 * (react-router v7 `MemoryRouterProps` — see package.json override-policy). So we
 * do NOT rely on the library to sanitize: every redirect target passes through
 * this guard, which admits ONLY same-origin, root-relative paths. This closes the
 * vector at the application layer regardless of the react-router version — the
 * basis for the osv-scanner.toml accepted-risk on those two advisories.
 */

/** A safe fallback when a redirect target is absent or fails validation. */
const DEFAULT_SAFE_PATH = '/';

const CONTROL_CHAR_MAX = 0x1f; // U+0000–U+001F
const BACKSLASH = 0x5c; // "\"

/** True if the string contains any control character or a backslash. */
function hasUnsafeChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c <= CONTROL_CHAR_MAX || c === BACKSLASH) return true;
  }
  return false;
}

/**
 * Return `path` only if it is an unambiguous same-origin, root-relative path;
 * otherwise return `fallback`. Rejects: non-strings, empty/whitespace, anything
 * not starting with a single `/`, protocol-relative (`//`), backslash bypasses,
 * any embedded backslash/control char, and encoded slash/backslash bypasses
 * (`/%2f…`, `/%5c…`) that a browser may normalise after navigation.
 */
export function toSafeInternalPath(
  path: string | null | undefined,
  fallback: string = DEFAULT_SAFE_PATH,
): string {
  if (typeof path !== 'string') return fallback;
  const p = path.trim();
  if (p.length === 0) return fallback;
  if (!p.startsWith('/')) return fallback;
  if (p.startsWith('//')) return fallback;
  if (/^\/%2f/i.test(p) || /^\/%5c/i.test(p)) return fallback;
  if (hasUnsafeChar(p)) return fallback;
  return p;
}
