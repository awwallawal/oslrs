// @vitest-environment jsdom
/**
 * Route-resolution integration test — Story 9-21.
 *
 * Mounts the REAL App.tsx route tree (`AppRoutes`) inside a MemoryRouter and
 * asserts that every documented internal navigation target (KNOWN_ROUTES)
 * resolves to a real component instead of falling through to the catch-all 404.
 *
 * Why this exists: on 2026-05-13 the operator could not log in because App.tsx
 * mounted the MFA challenge at `path="mfa-challenge"` (=> `/mfa-challenge`)
 * while useLogin.ts navigated to `/auth/mfa-challenge`. Every per-page test
 * passed because each mounted its OWN inline router, decoupled from App.tsx's
 * real mount paths (see rbac-routes.test.tsx for that anti-pattern). The bug
 * only surfaced in production. This test imports the same route tree App()
 * renders, so a registration/navigate-target mismatch fails loudly in CI.
 *
 * Tagged `[integration]` so it can be run in isolation:
 *   pnpm vitest run --test-name-pattern='\[integration\]'
 */

import * as matchers from '@testing-library/jest-dom/matchers';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

expect.extend(matchers);

import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppRoutes } from '../App';
import { AuthContext } from '../features/auth/context/AuthContext';
import {
  KNOWN_ROUTES,
  resolveTestPath,
  type KnownRoute,
  type DashboardRole,
} from './known-routes';

afterEach(() => {
  cleanup();
});

/**
 * Build an AuthContext value. With a `role` the user is authenticated as that
 * role (so dashboard routes render their nested component); without one the
 * user is unauthenticated (so PublicOnlyRoute renders its children and
 * ProtectedRoute redirects). Shape mirrors the live context (AuthProvider's
 * `value`), kept in sync with rbac-routes.test.tsx.
 */
function makeAuthValue(role?: DashboardRole) {
  const authed = Boolean(role);
  return {
    user: authed
      ? {
          id: `user-${role}`,
          email: `${role}@test.com`,
          fullName: `Test ${role}`,
          role,
          status: 'active' as const,
        }
      : null,
    accessToken: authed ? 'mock-token' : null,
    isAuthenticated: authed,
    isLoading: false,
    error: null,
    isRememberMe: false,
    requiresReAuth: false,
    reAuthAction: null,
    loginStaff: vi.fn(),
    loginPublic: vi.fn(),
    loginWithGoogle: vi.fn(),
    loginWithMagicLink: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    reAuthenticate: vi.fn(),
    cancelReAuth: vi.fn(),
    clearError: vi.fn(),
    updateActivity: vi.fn(),
    refreshUser: vi.fn(),
    confirmLogout: vi.fn().mockResolvedValue(undefined),
    unsyncedCount: 0,
    showLogoutWarning: false,
    cancelLogout: vi.fn(),
    completeStaffLoginAfterMfa: vi.fn(),
  };
}

/**
 * Mount the real App route tree at `initialEntry`. Mirrors the providers App()
 * supplies in production (QueryClient + Router + Auth) but with a MemoryRouter
 * and a controllable AuthContext so we can drive the initial path + auth state.
 *
 * `v7_relativeSplatPath` mirrors App()'s `<BrowserRouter future={...}>`
 * (App.tsx): it changes how relative paths resolve INSIDE splat routes
 * (`view-as/:role/*`, the per-section `path="*"`), so a route-RESOLUTION test
 * must opt in to exercise the same matching rules production uses. (9-21 M1.)
 *
 * `v7_startTransition` is deliberately OMITTED: it only governs how router state
 * updates are batched (wrapping them in React.startTransition) — it does NOT
 * change which route resolves. Opting in makes lazy-Suspense fallback timing
 * nondeterministic under jsdom + `waitFor` (heavy pages like WizardPage render
 * empty during the pending transition, tripping the `textContent > 50` gate).
 * Since it is orthogonal to resolution, we leave it off for a deterministic test.
 *
 * Deliberately NOT wrapped here: the production `<ErrorBoundary>` (we WANT a
 * crashing page to fail this test loudly rather than be swallowed) and
 * `<ViewAsProvider>` (mounted only by the `view-as/:role` subtree, which
 * provides its own). (Story 9-21 review L2.)
 */
const ROUTER_FUTURE = { v7_relativeSplatPath: true } as const;

function renderApp({
  initialEntry,
  role,
}: {
  initialEntry: string;
  role?: DashboardRole;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]} future={ROUTER_FUTURE}>
        <AuthContext.Provider value={makeAuthValue(role) as any}>
          <AppRoutes />
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('[integration] App.tsx route registration', () => {
  it.each(KNOWN_ROUTES)(
    'resolves $route to a real component (not the 404 fallback)',
    async (r: KnownRoute) => {
      const { unmount } = renderApp({
        initialEntry: resolveTestPath(r),
        role: r.role,
      });

      /*
       * WAIT FOR THE ACTUAL SIGNAL, NOT A PROXY FOR IT.
       *
       * This used to be `body.textContent.length > 50` with a 5s timeout, and it
       * flaked three times across 2026-08-11 → 08-13 — twice as a timeout, once
       * as `AssertionError: expected 16 to be greater than 50`. Both are the same
       * event: under parallel suite load the lazy chunk needs >5s, and the
       * assertion fires while the Suspense skeleton is still on screen.
       *
       * THE BUDGET WAS THE BUG. 5s was a guess (9-21 review M3) that held until
       * the suite grew; a cold chunk under a loaded worker pool is not a defect.
       * 15s, inside a 20s per-test timeout set below, leaves headroom without
       * hiding a real hang.
       *
       * ⚠️ A SEMANTIC PREDICATE WAS TRIED FIRST AND REJECTED ON EVIDENCE — do not
       * "improve" this back into one without repeating the probe. Waiting for the
       * Suspense fallback to disappear reads better and is WRONG here: under
       * vitest the lazy import resolves within a microtask, so `<PageSkeleton>`
       * (`aria-label="Loading page"`) is already gone before waitFor's first
       * poll. Probed by inverting the assertion to `.toBeInTheDocument()` — it
       * never matched once in 15s. Such a predicate is satisfied instantly and
       * waits for nothing, which is strictly worse than a crude check that works:
       * it would have passed while the page was still blank.
       *
       * What actually renders first under load is the LAYOUT CHROME — the
       * observed failure was 16 characters of nav shell — so total text length
       * really is the only universal signal available here. KNOWN_ROUTES carries
       * no per-route content to assert on, and inventing one for 57 entries buys
       * brittleness, not truth. So: keep the crude check, give it an honest
       * budget, and make the failure explain itself.
       */
      await waitFor(
        () => {
          const len = document.body.textContent?.trim().length ?? 0;
          if (len <= 50) {
            throw new Error(
              `Route "${r.route}" has not finished rendering: ${len} chars of body text (want >50). ` +
                `Under load this is the lazy chunk still resolving behind the layout chrome — a slow ` +
                `test environment, NOT a routing defect. A genuine registration failure shows up as ` +
                `the "page not found" assertion below, or as a thrown error from the un-wrapped tree.`,
            );
          }
        },
        { timeout: 15000 },
      );

      // The route resolved to a real component, NOT the catch-all 404. If a
      // navigate-target is mounted at the wrong path in App.tsx, the router
      // falls through to PublicNotFoundPage ("Page not found") and this fails,
      // naming the offending route in the test label.
      expect(screen.queryByText(/page not found/i)).not.toBeInTheDocument();

      unmount();
    },
    // Per-test timeout raised above the 15s waitFor budget so a slow cold chunk
    // reports as a FAILED ASSERTION naming the skeleton, never as an opaque
    // "Test timed out in 10000ms" — which is how this first presented on
    // 2026-08-11 and cost a push before anyone knew what it was.
    20_000,
  );

  it('resolves an unknown path to the NotFound component (404 fallback works)', async () => {
    renderApp({ initialEntry: '/some-nonexistent-path-9-21' });

    await waitFor(() => {
      expect(screen.getByText(/page not found/i)).toBeInTheDocument();
    });
  });
});

describe('[integration] navigate-target drift guard (AC#4)', () => {
  it('every static internal navigation target across the app is in KNOWN_ROUTES', () => {
    // Load every component source as raw text. Vite resolves this glob relative
    // to THIS file, i.e. apps/web/src/**.
    const modules = import.meta.glob('../**/*.tsx', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;

    const known = new Set(KNOWN_ROUTES.map((r) => r.route));

    // Every way production code names an internal navigation target with a
    // STRING LITERAL. The 2026-05-13 outage was a `navigate('/..')` mismatch,
    // but `<Link to="/..">`, `<Navigate to="/..">`, and the `redirectTo="/.."`
    // prop on Protected/PublicOnlyRoute are the same class of risk and must be
    // kept in sync too (Story 9-21 review M2). Template literals
    // (navigate(`/x/${id}`), to={dynamicPath}) are dynamic and intentionally
    // excluded — see the parameterized-route note in known-routes.ts.
    const patterns: { label: string; re: RegExp }[] = [
      { label: 'navigate()', re: /navigate\(\s*['"](\/[^'"]*)['"]/g },
      // `\s` before `to=` avoids matching `redirectTo=`, `goto=`, etc.
      { label: 'to=', re: /\sto=\s*['"](\/[^'"]*)['"]/g },
      { label: 'redirectTo=', re: /\sredirectTo=\s*['"](\/[^'"]*)['"]/g },
    ];

    const missing: { file: string; via: string; target: string }[] = [];
    for (const [file, src] of Object.entries(modules)) {
      // Skip tests (incl. this file, which contains the regexes + examples).
      if (file.includes('/__tests__/') || /\.(test|integration)\./.test(file)) {
        continue;
      }
      for (const { label, re } of patterns) {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(src)) !== null) {
          // Compare pathname only — strip any query string / hash (e.g.
          // navigate('/register/complete?source=pending_nin') routes to
          // `/register/complete`; the query is data, not a separate route).
          const target = m[1].split(/[?#]/)[0];
          // Splat children mount under a parent route (`/admin/*`); the parent
          // (`/admin`) is the registered known route, so ignore the `/*` form.
          if (target.endsWith('/*')) continue;
          if (!known.has(target)) {
            missing.push({ file, via: label, target });
          }
        }
      }
    }

    expect(
      missing,
      `Found internal navigation targets not registered in known-routes.ts. ` +
        `Add them (and confirm App.tsx mounts them): ${JSON.stringify(missing, null, 2)}`,
    ).toEqual([]);
  });
});
