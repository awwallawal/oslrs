import { describe, it, expect, vi } from 'vitest';

const mockAuthorize = vi.hoisted(() => vi.fn((..._roles: string[]) => vi.fn((_req: unknown, _res: unknown, next: () => void) => next())));

// Mock all middleware and controllers to isolate route registration
vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../middleware/rbac.js', () => ({
  authorize: mockAuthorize,
}));
vi.mock('../../middleware/analytics-scope.js', () => ({
  resolveAnalyticsScope: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));
vi.mock('../../controllers/analytics.controller.js', () => ({
  AnalyticsController: {
    getDemographics: vi.fn(), getEmployment: vi.fn(), getHousehold: vi.fn(),
    getSkillsFrequency: vi.fn(), getTrends: vi.fn(), getRegistrySummary: vi.fn(),
    getRegistryTotals: vi.fn(), getDataHealth: vi.fn(),
    getPipelineSummary: vi.fn(), getCrossTab: vi.fn(), getSkillsInventory: vi.fn(),
    getInsights: vi.fn(), getEquity: vi.fn(), getActivationStatus: vi.fn(),
    getPolicyBrief: vi.fn(), getEnumeratorReliability: vi.fn(),
  },
}));
vi.mock('../../controllers/team-quality.controller.js', () => ({
  TeamQualityController: { getTeamQuality: vi.fn() },
}));
vi.mock('../../controllers/personal-stats.controller.js', () => ({
  PersonalStatsController: { getPersonalStats: vi.fn() },
}));
vi.mock('../../controllers/verification-analytics.controller.js', () => ({
  VerificationAnalyticsController: { getVerificationPipeline: vi.fn() },
}));

const { default: router } = await import('../analytics.routes.js');

// Capture mock calls immediately after import — mockReset: true in base config
// clears mock.calls before each test, so we must snapshot them here.
const authorizeCalls = [...mockAuthorize.mock.calls];
// Story 12-6: the RETURNED middleware for each authorize(...) call, snapshotted
// alongside the args so a route can be matched to ITS OWN call by identity.
// Matching on args alone finds whichever route called authorize with that role
// set FIRST — /insights and /equity already use the exact super_admin +
// government_official pair, so an args-only assertion passes even if the route
// under test has no authorize at all.
const authorizeResults = mockAuthorize.mock.results.map((r) => r.value);

describe('Analytics Routes', () => {
  const routes = router.stack
    .filter((layer: { route?: { path: string; methods: Record<string, boolean> } }) => layer.route)
    .map((layer: { route: { path: string; methods: Record<string, boolean> } }) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  it('registers GET /verification-pipeline route', () => {
    const vpRoute = routes.find((r: { path: string }) => r.path === '/verification-pipeline');
    expect(vpRoute).toBeDefined();
    expect(vpRoute!.methods).toContain('get');
  });

  it('verification-pipeline route is placed before parameterized routes', () => {
    const vpIndex = routes.findIndex((r: { path: string }) => r.path === '/verification-pipeline');
    const demographicsIndex = routes.findIndex((r: { path: string }) => r.path === '/demographics');
    expect(vpIndex).toBeLessThan(demographicsIndex);
  });

  it('verification-pipeline route has additional authorize middleware', () => {
    const vpLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/verification-pipeline',
    );
    // Route should have authorize middleware + handler (2+ callbacks)
    expect(vpLayer?.route?.stack?.length).toBeGreaterThanOrEqual(2);
  });

  it('verification-pipeline authorize restricts to super_admin, verification_assessor, government_official', () => {
    // Use snapshotted calls — mockReset clears mock.calls before each test
    const vpAuthorizeCall = authorizeCalls.find(
      (args: string[]) =>
        args.includes('super_admin') &&
        args.includes('verification_assessor') &&
        args.includes('government_official') &&
        !args.includes('supervisor') &&
        !args.includes('enumerator') &&
        !args.includes('data_entry_clerk'),
    );
    expect(vpAuthorizeCall).toBeDefined();
    expect(vpAuthorizeCall).toHaveLength(3);
  });

  // Story 8.6: Cross-tab route
  it('registers GET /cross-tab route', () => {
    const ctRoute = routes.find((r: { path: string }) => r.path === '/cross-tab');
    expect(ctRoute).toBeDefined();
    expect(ctRoute!.methods).toContain('get');
  });

  it('cross-tab route has per-route authorize middleware', () => {
    const ctLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/cross-tab',
    );
    expect(ctLayer?.route?.stack?.length).toBeGreaterThanOrEqual(2);
  });

  it('cross-tab authorize restricts to super_admin, government_official, supervisor (403 for enumerator/clerk/assessor)', () => {
    const ctAuthorizeCall = authorizeCalls.find(
      (args: string[]) =>
        args.includes('super_admin') &&
        args.includes('government_official') &&
        args.includes('supervisor') &&
        !args.includes('enumerator') &&
        !args.includes('data_entry_clerk') &&
        !args.includes('verification_assessor'),
    );
    expect(ctAuthorizeCall).toBeDefined();
    expect(ctAuthorizeCall).toHaveLength(3);
  });

  // Story 8.6: Skills inventory route
  it('registers GET /skills-inventory route', () => {
    const siRoute = routes.find((r: { path: string }) => r.path === '/skills-inventory');
    expect(siRoute).toBeDefined();
    expect(siRoute!.methods).toContain('get');
  });

  it('skills-inventory route has per-route authorize middleware', () => {
    const siLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/skills-inventory',
    );
    expect(siLayer?.route?.stack?.length).toBeGreaterThanOrEqual(2);
  });

  it('skills-inventory authorize restricts to super_admin, government_official, supervisor (403 for enumerator/clerk/assessor)', () => {
    const siAuthorizeCall = authorizeCalls.find(
      (args: string[]) =>
        args.includes('super_admin') &&
        args.includes('government_official') &&
        args.includes('supervisor') &&
        !args.includes('enumerator') &&
        !args.includes('data_entry_clerk') &&
        !args.includes('verification_assessor'),
    );
    expect(siAuthorizeCall).toBeDefined();
    expect(siAuthorizeCall).toHaveLength(3);
  });

  // ── Story 12-4 (AC5/AC6.3) ────────────────────────────────────────────────
  describe('registry-totals (Story 12-4)', () => {
    it('registers GET /registry-totals route', () => {
      const rtRoute = routes.find((r: { path: string }) => r.path === '/registry-totals');
      expect(rtRoute).toBeDefined();
      expect(rtRoute!.methods).toContain('get');
    });

    it('inherits the router-level RBAC chain — NO per-route authorize (AC5.2)', () => {
      // The registry total is a public figure (it is already published
      // unauthenticated on /insights), so it stays open to all dashboard roles
      // exactly like /registry-summary. A per-route authorize here would be a
      // silent narrowing of AC5.2.
      const rtLayer = router.stack.find(
        (layer: { route?: { path: string } }) => layer.route?.path === '/registry-totals',
      );
      const rsLayer = router.stack.find(
        (layer: { route?: { path: string } }) => layer.route?.path === '/registry-summary',
      );
      expect(rtLayer?.route?.stack?.length).toBe(rsLayer?.route?.stack?.length);
    });

    it('sits beside /registry-summary rather than replacing it', () => {
      // 12-5 renders BOTH (the 139 and the 76) to make the distinction legible,
      // so removing the old endpoint would break the very comparison Epic 12
      // exists to show.
      expect(routes.find((r: { path: string }) => r.path === '/registry-summary')).toBeDefined();
      expect(routes.find((r: { path: string }) => r.path === '/registry-totals')).toBeDefined();
    });
  });
});

/**
 * Story 12-6 — the Data-Health route.
 *
 * ⚠️ The RBAC assertion here is the load-bearing one, not the registration
 * assertion. Every other descriptive-analytics route inherits the router-wide
 * role set (all six dashboard roles); this one carries respondent PII in its
 * recovery drill, so it MUST be narrowed to the same pair /insights and /equity
 * use. A route that merely exists is not the requirement — a route that is
 * reachable by a supervisor or an enumerator would be a PII leak that passes
 * every "is it registered?" test.
 */
describe('Analytics Routes — /data-health (Story 12-6)', () => {
  const routes = router.stack
    .filter((layer: { route?: { path: string; methods: Record<string, boolean> } }) => layer.route)
    .map((layer: { route: { path: string; methods: Record<string, boolean> } }) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  it('registers GET /data-health', () => {
    const route = routes.find((r: { path: string }) => r.path === '/data-health');
    expect(route).toBeDefined();
    expect(route!.methods).toContain('get');
  });

  it('carries its own authorize middleware, not just the router-level chain', () => {
    const layer = router.stack.find(
      (l: { route?: { path: string } }) => l.route?.path === '/data-health',
    );
    expect(layer?.route?.stack?.length).toBeGreaterThanOrEqual(2);
  });

  it('restricts to super_admin + government_official ONLY (PII in the recovery drill)', () => {
    const layer = router.stack.find(
      (l: { route?: { path: string } }) => l.route?.path === '/data-health',
    ) as { route: { stack: Array<{ handle: unknown }> } } | undefined;
    expect(layer).toBeDefined();

    // Match THIS route's authorize call by the identity of the middleware it
    // actually mounted, not by its arguments. An args-only search would find
    // /insights' identical super_admin + government_official call and pass even
    // if /data-health mounted nothing — the exact "test that passes over a hole"
    // this repo keeps getting bitten by.
    const handles = new Set(layer!.route.stack.map((s) => s.handle));
    const index = authorizeResults.findIndex((mw) => handles.has(mw));
    expect(index).toBeGreaterThanOrEqual(0);

    const roles = authorizeCalls[index] as string[];
    expect(roles).toEqual(
      expect.arrayContaining(['super_admin', 'government_official']),
    );
    expect(roles).toHaveLength(2);
    // Named individually so a failure says WHICH role leaked in.
    expect(roles).not.toContain('supervisor');
    expect(roles).not.toContain('enumerator');
    expect(roles).not.toContain('data_entry_clerk');
    expect(roles).not.toContain('verification_assessor');
  });
});
