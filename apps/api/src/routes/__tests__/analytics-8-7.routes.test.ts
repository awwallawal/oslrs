/**
 * Story 8.7: Analytics Routes — Insights, Equity, Activation, Policy Brief
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAuthorize = vi.hoisted(() => vi.fn((..._roles: string[]) => vi.fn((_req: unknown, _res: unknown, next: () => void) => next())));

const mockGetActivationStatus = vi.hoisted(() => vi.fn());
const mockGeneratePolicyBrief = vi.hoisted(() => vi.fn());

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
    getPipelineSummary: vi.fn(), getCrossTab: vi.fn(), getSkillsInventory: vi.fn(),
    getInsights: vi.fn(), getEquity: vi.fn(), getActivationStatus: vi.fn(),
    getPolicyBrief: vi.fn(),
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
// Mock services consumed by the real AnalyticsController (used in Gap 3-5 tests)
vi.mock('../../services/survey-analytics.service.js', () => ({
  SurveyAnalyticsService: { getActivationStatus: mockGetActivationStatus },
}));
vi.mock('../../services/policy-brief.service.js', () => ({
  PolicyBriefService: { generatePolicyBrief: mockGeneratePolicyBrief },
}));

const { default: router } = await import('../analytics.routes.js');

// Import the REAL controller for handler-level tests (Gaps 3-5)
const { AnalyticsController } = await vi.importActual<
  typeof import('../../controllers/analytics.controller.js')
>('../../controllers/analytics.controller.js');

// Snapshot authorize calls before mockReset clears them
const authorizeCalls = [...mockAuthorize.mock.calls];

describe('Story 8.7 Routes', () => {
  const routes = router.stack
    .filter((layer: { route?: { path: string } }) => layer.route)
    .map((layer: { route: { path: string; methods: Record<string, boolean> } }) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods),
    }));

  it('registers GET /insights route', () => {
    const route = routes.find((r: { path: string }) => r.path === '/insights');
    expect(route).toBeDefined();
    expect(route!.methods).toContain('get');
  });

  it('registers GET /equity route', () => {
    const route = routes.find((r: { path: string }) => r.path === '/equity');
    expect(route).toBeDefined();
    expect(route!.methods).toContain('get');
  });

  it('registers GET /activation-status route', () => {
    const route = routes.find((r: { path: string }) => r.path === '/activation-status');
    expect(route).toBeDefined();
    expect(route!.methods).toContain('get');
  });

  it('registers GET /policy-brief route', () => {
    const route = routes.find((r: { path: string }) => r.path === '/policy-brief');
    expect(route).toBeDefined();
    expect(route!.methods).toContain('get');
  });

  it('insights route restricts to super_admin and government_official', () => {
    const insightsAuth = authorizeCalls.find(
      (args: string[]) =>
        args.includes('super_admin') &&
        args.includes('government_official') &&
        args.length === 2,
    );
    expect(insightsAuth).toBeDefined();
  });

  it('activation-status has no additional per-route authorize (accessible to all dashboard roles)', () => {
    const activationLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/activation-status',
    );
    // Should have only 1 handler (no per-route authorize middleware)
    expect(activationLayer?.route?.stack?.length).toBe(1);
  });

  it('equity route has per-route authorize middleware', () => {
    const equityLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/equity',
    );
    expect(equityLayer?.route?.stack?.length).toBeGreaterThan(1);
  });

  it('policy-brief route has per-route authorize middleware', () => {
    const policyLayer = router.stack.find(
      (layer: { route?: { path: string } }) => layer.route?.path === '/policy-brief',
    );
    expect(policyLayer?.route?.stack?.length).toBeGreaterThan(1);
  });

  it('insights, equity, and policy-brief all share identical SA + GOV auth (exactly 3 calls)', () => {
    const saGovCalls = authorizeCalls.filter(
      (args: string[]) =>
        args.length === 2 &&
        args.includes('super_admin') &&
        args.includes('government_official'),
    );
    expect(saGovCalls).toHaveLength(3);
  });

  it('insights route is placed before descriptive routes', () => {
    const insightsIdx = routes.findIndex((r: { path: string }) => r.path === '/insights');
    const demographicsIdx = routes.findIndex((r: { path: string }) => r.path === '/demographics');
    expect(insightsIdx).toBeLessThan(demographicsIdx);
  });
});

// ---------------------------------------------------------------------------
// Gap 3-5: Controller-level tests for getPolicyBrief handler
// Uses the REAL AnalyticsController with mocked services.
// ---------------------------------------------------------------------------

function makeMockReqResNext(userId = 'test-user') {
  const req = {
    user: { sub: userId },
    query: {},
    analyticsScope: { type: 'system' as const },
  } as unknown as import('express').Request;

  const res = {
    setHeader: vi.fn(),
    send: vi.fn(),
    json: vi.fn(),
  } as unknown as import('express').Response;

  const next = vi.fn();

  return { req, res, next };
}

describe('getPolicyBrief controller handler (Gaps 3-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the static rate map between tests to avoid cross-test pollution
    (AnalyticsController as any).pdfRateMap.clear();
  });

  // Gap 3: 429 rate limiting — 6th call within the hour should be rejected
  it('returns 429 after 5 successful requests (rate limit)', async () => {
    mockGetActivationStatus.mockResolvedValue({ totalSubmissions: 200, features: [] });
    mockGeneratePolicyBrief.mockResolvedValue(Buffer.from('fake-pdf'));

    const { req, res, next } = makeMockReqResNext();

    // First 5 calls should succeed
    for (let i = 0; i < 5; i++) {
      await AnalyticsController.getPolicyBrief(req, res, next);
    }

    // All 5 should have succeeded (no error passed to next)
    expect(next).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledTimes(5);

    // 6th call should trigger rate limit
    await AnalyticsController.getPolicyBrief(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as any;
    expect(error.message).toMatch(/rate limit/i);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(error.statusCode).toBe(429);
  });

  // Gap 4: 400 threshold guard — insufficient submissions
  it('returns 400 when submissions < 100 (threshold guard)', async () => {
    mockGetActivationStatus.mockResolvedValue({ totalSubmissions: 50, features: [] });

    const { req, res, next } = makeMockReqResNext();

    await AnalyticsController.getPolicyBrief(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0] as any;
    expect(error.message).toMatch(/insufficient data/i);
    expect(error.code).toBe('INSUFFICIENT_DATA');
    expect(error.statusCode).toBe(400);
  });

  // Gap 5: PDF response headers on success
  it('sets Content-Type and Content-Disposition headers on successful PDF generation', async () => {
    mockGetActivationStatus.mockResolvedValue({ totalSubmissions: 200, features: [] });
    mockGeneratePolicyBrief.mockResolvedValue(Buffer.from('fake-pdf-content'));

    const { req, res, next } = makeMockReqResNext();

    await AnalyticsController.getPolicyBrief(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/^attachment; filename="oslrs-policy-brief-\d{4}-\d{2}-\d{2}\.pdf"$/),
    );
    expect(res.send).toHaveBeenCalledWith(Buffer.from('fake-pdf-content'));
  });
});
