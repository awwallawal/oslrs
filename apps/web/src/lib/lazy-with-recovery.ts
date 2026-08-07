import { lazy as reactLazy, type ComponentType } from 'react';

/**
 * Mirrors React's own `lazy` constraint. React types this as `ComponentType<any>` because a lazy
 * route's props are opaque to the loader; narrowing to `unknown` rejects every component that
 * takes props (it failed on `LoginPage` immediately). Same escape hatch, same reason.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

/**
 * `React.lazy` that survives a deploy.
 *
 * THE FAILURE THIS FIXES (observed on prod, 2026-08-07)
 * -----------------------------------------------------
 * Clicking "Staff Portal" in the footer produced *"Page Error — something went wrong on this
 * page"*, and a manual refresh fixed it. Nothing was broken: the deploy had landed while the tab
 * was open.
 *
 * `ci-cd.yml` publishes by moving the whole docroot aside and laying down a clean one
 * (`mv /var/www/oslsr /var/www/oslsr.bak.prev`, then a fresh directory). That is deliberate — it
 * buys one-step rollback — but it means **every hashed chunk from the previous build vanishes the
 * instant a deploy completes.** A tab still running the old `index.js` asks for a chunk hash that
 * no longer exists, gets a 404, and the dynamic import rejects. The error boundary catches it and
 * shows a generic failure, and its "Try Again" button cannot help: the file is gone.
 *
 * Quiet today, because the register has few simultaneous users. **Not quiet once enumerators keep
 * the app open across a working day** — every deploy would break the next navigation for all of
 * them, with an error message that tells them nothing.
 *
 * A missing chunk is one of the few front-end errors with an unambiguous remedy: the app on disk
 * moved, so re-fetch the app. That is safe to do automatically — but exactly once, because a
 * reload that fails the same way would loop forever, which is worse than the error page.
 * `sessionStorage` guards it, and is cleared on the first success so a later deploy in the same
 * session recovers too.
 */
const RELOAD_FLAG = 'oslrs:chunk-reload-attempted';

/** A chunk 404 surfaces differently per browser; match the shapes, not one string. */
function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) || // Chrome/Edge
    /error loading dynamically imported module/i.test(msg) || // Firefox
    /Importing a module script failed/i.test(msg) // Safari
  );
}

export function lazyWithRecovery<T extends AnyComponent>(
  factory: () => Promise<{ default: T }>,
) {
  return reactLazy(async () => {
    try {
      const mod = await factory();
      // Got here, so the current build is intact — re-arm recovery for a FUTURE deploy.
      try {
        window.sessionStorage.removeItem(RELOAD_FLAG);
      } catch {
        /* private mode — recovery still works, it just cannot re-arm */
      }
      return mod;
    } catch (err) {
      if (!isChunkLoadError(err)) throw err; // a real component error must still surface

      let alreadyTried = false;
      try {
        alreadyTried = window.sessionStorage.getItem(RELOAD_FLAG) === '1';
        window.sessionStorage.setItem(RELOAD_FLAG, '1');
      } catch {
        /* storage unavailable: fall through and reload once, unguarded */
      }

      // Second failure in a row is NOT a stale chunk — let the error boundary show it rather
      // than reload-loop a user who cannot read the page long enough to report anything.
      if (alreadyTried) throw err;

      window.location.reload();
      // Never resolves; the reload replaces the document.
      return new Promise<{ default: T }>(() => {});
    }
  });
}
