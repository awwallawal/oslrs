import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '@oslsr/types';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockGetOverviewStats = vi.fn();
const mockGetSkillsDistribution = vi.fn();
const mockGetLgaBreakdown = vi.fn();
const mockGetRegistrationTrends = vi.fn();

vi.mock('../../services/report.service.js', () => ({
  ReportService: {
    getOverviewStats: (...args: unknown[]) => mockGetOverviewStats(...args),
    getSkillsDistribution: (...args: unknown[]) => mockGetSkillsDistribution(...args),
    getLgaBreakdown: (...args: unknown[]) => mockGetLgaBreakdown(...args),
    getRegistrationTrends: (...args: unknown[]) => mockGetRegistrationTrends(...args),
  },
}));

// Import after mocks
const { ReportController } = await import('../report.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

function makeMocks(queryOverrides: Record<string, string> = {}) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockReq = { query: queryOverrides } as unknown as Request;
  const mockRes = { json: jsonMock, status: statusMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock, statusMock };
}

// ── Sample Data ────────────────────────────────────────────────────────

const sampleOverview = {
  totalRespondents: 150,
  todayRegistrations: 5,
  yesterdayRegistrations: 8,
  lgasCovered: 12,
  sourceBreakdown: { enumerator: 100, public: 30, clerk: 20 },
};

const sampleSkills = [
  { skill: 'Carpentry', count: 45 },
  { skill: 'Tailoring', count: 30 },
];

const sampleLga = [
  { lgaCode: 'ibadan-north', lgaName: 'Ibadan North', count: 50 },
  { lgaCode: 'ogbomosho-north', lgaName: 'Ogbomosho North', count: 0 },
];

const sampleTrends = [
  { date: '2026-02-20', count: 10 },
  { date: '2026-02-21', count: 15 },
];

// ── Tests ──────────────────────────────────────────────────────────────

describe('ReportController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getOverviewStats', () => {
    it('should return overview stats wrapped in data envelope', async () => {
      mockGetOverviewStats.mockResolvedValueOnce(sampleOverview);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getOverviewStats(mockReq, mockRes, mockNext);

      expect(mockGetOverviewStats).toHaveBeenCalledTimes(1);
      expect(jsonMock).toHaveBeenCalledWith({ data: sampleOverview });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass errors to next middleware', async () => {
      const error = new Error('DB connection failed');
      mockGetOverviewStats.mockRejectedValueOnce(error);
      const { mockReq, mockRes, mockNext } = makeMocks();

      await ReportController.getOverviewStats(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('getSkillsDistribution', () => {
    it('should return skills distribution data', async () => {
      mockGetSkillsDistribution.mockResolvedValueOnce(sampleSkills);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getSkillsDistribution(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: sampleSkills });
    });

    it('should return empty array when no skills data', async () => {
      mockGetSkillsDistribution.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getSkillsDistribution(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });
  });

  describe('getLgaBreakdown', () => {
    it('should return LGA breakdown data', async () => {
      mockGetLgaBreakdown.mockResolvedValueOnce(sampleLga);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getLgaBreakdown(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: sampleLga });
    });

    it('should handle empty LGA data', async () => {
      mockGetLgaBreakdown.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getLgaBreakdown(mockReq, mockRes, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: [] });
    });
  });

  describe('getRegistrationTrends', () => {
    it('should default to 7 days when no query param', async () => {
      mockGetRegistrationTrends.mockResolvedValueOnce(sampleTrends);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await ReportController.getRegistrationTrends(mockReq, mockRes, mockNext);

      expect(mockGetRegistrationTrends).toHaveBeenCalledWith(7);
      expect(jsonMock).toHaveBeenCalledWith({ data: sampleTrends });
    });

    it('should accept days=30 query parameter', async () => {
      mockGetRegistrationTrends.mockResolvedValueOnce(sampleTrends);
      const { mockReq, mockRes, mockNext } = makeMocks({ days: '30' });

      await ReportController.getRegistrationTrends(mockReq, mockRes, mockNext);

      expect(mockGetRegistrationTrends).toHaveBeenCalledWith(30);
    });

    it('should clamp invalid days to 7', async () => {
      mockGetRegistrationTrends.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks({ days: '90' });

      await ReportController.getRegistrationTrends(mockReq, mockRes, mockNext);

      expect(mockGetRegistrationTrends).toHaveBeenCalledWith(7);
    });

    it('should handle non-numeric days param as 7', async () => {
      mockGetRegistrationTrends.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks({ days: 'abc' });

      await ReportController.getRegistrationTrends(mockReq, mockRes, mockNext);

      expect(mockGetRegistrationTrends).toHaveBeenCalledWith(7);
    });

    it('should pass errors to next middleware', async () => {
      const error = new Error('Query timeout');
      mockGetRegistrationTrends.mockRejectedValueOnce(error);
      const { mockReq, mockRes, mockNext } = makeMocks();

      await ReportController.getRegistrationTrends(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});

// ── Authorization Tests (AC8) ─────────────────────────────────────────

/**
 * Tests that the authorize middleware used in report.routes.ts correctly
 * permits government_official and super_admin, and rejects all other roles.
 * This exercises the actual middleware function with the configured roles.
 */

const { authorize } = await import('../../middleware/rbac.js');

describe('Report Route Authorization (AC8)', () => {
  const reportAuthMiddleware = authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN);

  function makeAuthReq(role?: string) {
    const req = { user: role ? { sub: 'user-1', role } : undefined } as unknown as Request;
    const res = {} as unknown as Response;
    const next: NextFunction = vi.fn();
    return { req, res, next };
  }

  describe('Permitted roles', () => {
    it('allows government_official access', () => {
      const { req, res, next } = makeAuthReq(UserRole.GOVERNMENT_OFFICIAL);
      reportAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('allows super_admin access', () => {
      const { req, res, next } = makeAuthReq(UserRole.SUPER_ADMIN);
      reportAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Rejected roles (403)', () => {
    const rejectedRoles = [
      UserRole.ENUMERATOR,
      UserRole.SUPERVISOR,
      UserRole.DATA_ENTRY_CLERK,
      UserRole.VERIFICATION_ASSESSOR,
      UserRole.PUBLIC_USER,
    ];

    for (const role of rejectedRoles) {
      it(`rejects ${role} with FORBIDDEN`, () => {
        const { req, res, next } = makeAuthReq(role);
        reportAuthMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'FORBIDDEN' }),
        );
      });
    }
  });

  describe('Unauthenticated (401)', () => {
    it('rejects unauthenticated request with AUTH_REQUIRED', () => {
      const { req, res, next } = makeAuthReq(undefined);
      reportAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }),
      );
    });
  });
});
