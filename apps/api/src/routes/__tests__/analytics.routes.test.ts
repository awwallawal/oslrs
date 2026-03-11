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
    getPipelineSummary: vi.fn(),
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
    // The route-level authorize call (2nd call after the router.use global authorize)
    const vpAuthorizeCall = mockAuthorize.mock.calls.find(
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
});
