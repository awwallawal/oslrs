/**
 * KNOWN_ROUTES — the canonical inventory of internal navigation targets.
 *
 * Story 9-21 (route-registration integration test). Every entry here is a path
 * that production code reaches via `navigate('/x')` or `<Link to="/x">`. The
 * route-resolution integration test mounts the REAL App.tsx route tree
 * (`AppRoutes`) for each entry and asserts it resolves to a real component —
 * NOT the catch-all 404. This is the guard that the 2026-05-13 operator-MFA
 * outage (App.tsx mounted `path="mfa-challenge"` while useLogin navigated to
 * `/auth/mfa-challenge`) cannot ship again.
 *
 * Maintenance: when you add a `navigate('/new-path')` or `<Link to="/new-path">`,
 * add the target here. The grep-audit test (AC#4) FAILS CI if a static
 * navigate-target is missing from this list, so drift is caught automatically.
 *
 * Source of truth: this list was extracted by grepping the apps/web/src tsx
 * tree for static `navigate('/..')`, `to="/.."`, and `redirectTo="/.."` targets
 * (2026-06-17) and reconciled against App.tsx's actual route tree. Notably it
 * does NOT contain `/legal/terms` or `/legal/privacy` (the draft AC#2 list named
 * them, but the real routes are `/terms` and `/about/privacy`).
 *
 * SCOPE — what this list does NOT guard (Story 9-21 review L1): only STATIC,
 * literal navigation targets are inventoried and audited. Parameterized targets
 * built from template literals — `navigate(`/dashboard/.../respondent/${id}`)`,
 * `<Link to={dynamicPath}>` — are intentionally excluded (the concrete path is
 * unknown at lint time). That means detail routes like `respondent/:id` are NOT
 * covered by the drift audit; if you mis-mount one, this test will not catch it.
 * Adding `:param` route coverage would mean enumerating representative test
 * paths per dynamic target — out of scope for 9-21, noted here so the gap is
 * explicit rather than silent.
 */

// Role values mirror ProtectedRoute `allowedRoles` (see App.tsx dashboard routes).
export type DashboardRole =
  | 'super_admin'
  | 'supervisor'
  | 'enumerator'
  | 'data_entry_clerk'
  | 'verification_assessor'
  | 'government_official'
  | 'public_user';

export interface KnownRoute {
  /** The documented route (may contain `:params`). Used as the test label. */
  route: string;
  /**
   * Concrete path to mount in the test. Defaults to `route`. Required for
   * parameterized routes (`:token`, `:id`) which cannot be entered literally.
   */
  testPath?: string;
  /**
   * When set, the route is mounted with an authenticated mock user of this
   * role. Dashboard routes redirect to "/" when unauthenticated, which still
   * passes the "not 404" check but does not prove the nested component mounts —
   * so we render them authenticated to actually exercise the registration.
   */
  role?: DashboardRole;
}

/**
 * Public routes (PublicLayout / no-layout). Reached unauthenticated.
 */
const PUBLIC_ROUTES: KnownRoute[] = [
  { route: '/' },
  { route: '/about' },
  { route: '/about/initiative' },
  { route: '/about/how-it-works' },
  { route: '/about/leadership' },
  { route: '/about/partners' },
  { route: '/about/privacy' },
  { route: '/participate' },
  { route: '/participate/workers' },
  { route: '/participate/employers' },
  { route: '/support' },
  { route: '/support/faq' },
  { route: '/support/guides' },
  { route: '/support/guides/register' },
  { route: '/support/contact' },
  { route: '/support/verify-worker' },
  { route: '/terms' },
  { route: '/marketplace' },
  { route: '/marketplace/edit-request' },
  { route: '/marketplace/profile/:id', testPath: '/marketplace/profile/test-id' },
  { route: '/marketplace/edit/:token', testPath: '/marketplace/edit/test-token' },
  { route: '/insights' },
  { route: '/insights/skills' },
  { route: '/insights/trends' },
  { route: '/check-registration' },
  { route: '/verify-staff/:id', testPath: '/verify-staff/test-id' },
];

/**
 * Auth routes (AuthLayout, PublicOnlyRoute). Reached unauthenticated — the
 * PublicOnlyRoute renders children when there is no authenticated user.
 */
const AUTH_ROUTES: KnownRoute[] = [
  { route: '/login' },
  { route: '/staff/login' },
  { route: '/forgot-password' },
  { route: '/reset-password/:token', testPath: '/reset-password/test-token' },
  // The route that caused the 2026-05-13 outage. MUST resolve at `/auth/mfa-challenge`.
  { route: '/auth/mfa-challenge' },
];

/**
 * Special routes with no shared layout (own chrome). Reached unauthenticated.
 */
const SPECIAL_ROUTES: KnownRoute[] = [
  { route: '/register' },
  { route: '/register/complete' },
  { route: '/register/complete-nin' },
  { route: '/register/supplemental' },
  { route: '/auth/magic' },
  { route: '/activate/:token', testPath: '/activate/test-token' },
  { route: '/unauthorized' },
  // Legacy redirect target — reached via `redirectTo="/admin"` on /staff/login
  // (App.tsx) and the `<Navigate>` redirect chain (/admin -> /dashboard).
  // Not a page; mounts a <Navigate>, so it resolves (not a 404). (9-21 review M2.)
  { route: '/admin' },
];

/**
 * Dashboard routes — mounted with an authenticated user of the matching role so
 * the nested component actually renders (rather than redirecting to "/").
 */
const DASHBOARD_ROUTES: KnownRoute[] = [
  { route: '/dashboard', role: 'super_admin' },
  { route: '/dashboard/super-admin', role: 'super_admin' },
  { route: '/dashboard/super-admin/questionnaires', role: 'super_admin' },
  { route: '/dashboard/super-admin/staff', role: 'super_admin' },
  { route: '/dashboard/super-admin/operations', role: 'super_admin' },
  { route: '/dashboard/super-admin/view-as', role: 'super_admin' },
  { route: '/dashboard/supervisor', role: 'supervisor' },
  { route: '/dashboard/supervisor/team', role: 'supervisor' },
  { route: '/dashboard/enumerator', role: 'enumerator' },
  { route: '/dashboard/enumerator/survey', role: 'enumerator' },
  { route: '/dashboard/clerk/surveys', role: 'data_entry_clerk' },
  { route: '/dashboard/official/export', role: 'government_official' },
  { route: '/dashboard/public', role: 'public_user' },
  { route: '/dashboard/public/surveys', role: 'public_user' },
  // Story 9-61 — authenticated in-session registration wizard (edit / resume /
  // pending-NIN). Top-level ProtectedRoute (public_user), outside DashboardLayout.
  { route: '/registration/manage', role: 'public_user' },
];

export const KNOWN_ROUTES: KnownRoute[] = [
  ...PUBLIC_ROUTES,
  ...AUTH_ROUTES,
  ...SPECIAL_ROUTES,
  ...DASHBOARD_ROUTES,
];

/** The concrete path the test should navigate to for a given known route. */
export function resolveTestPath(r: KnownRoute): string {
  return r.testPath ?? r.route;
}
