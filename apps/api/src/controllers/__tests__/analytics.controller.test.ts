import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { UserRole } from '@oslsr/types';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockGetDemographics = vi.fn();
const mockGetEmployment = vi.fn();
const mockGetHousehold = vi.fn();
const mockGetSkillsFrequency = vi.fn();
const mockGetTrends = vi.fn();
const mockGetRegistrySummary = vi.fn();
const mockGetPipelineSummary = vi.fn();

vi.mock('../../services/survey-analytics.service.js', () => ({
  SurveyAnalyticsService: {
    getDemographics: (...args: unknown[]) => mockGetDemographics(...args),
    getEmployment: (...args: unknown[]) => mockGetEmployment(...args),
    getHousehold: (...args: unknown[]) => mockGetHousehold(...args),
    getSkillsFrequency: (...args: unknown[]) => mockGetSkillsFrequency(...args),
    getTrends: (...args: unknown[]) => mockGetTrends(...args),
    getRegistrySummary: (...args: unknown[]) => mockGetRegistrySummary(...args),
    getPipelineSummary: (...args: unknown[]) => mockGetPipelineSummary(...args),
  },
}));

const { AnalyticsController } = await import('../analytics.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

const systemScope = { type: 'system' };

function makeMocks(queryOverrides: Record<string, string> = {}) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockReq = {
    query: queryOverrides,
    analyticsScope: systemScope,
  } as unknown as Request;
  const mockRes = { json: jsonMock, status: statusMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock, statusMock };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AnalyticsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getDemographics', () => {
    it('returns demographics in data envelope', async () => {
      const data = { genderDistribution: [], ageDistribution: [] };
      mockGetDemographics.mockResolvedValueOnce(data);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await AnalyticsController.getDemographics(mockReq, mockRes, mockNext);

      expect(mockGetDemographics).toHaveBeenCalledWith(systemScope, expect.any(Object));
      expect(jsonMock).toHaveBeenCalledWith({ data });
    });

    it('passes query params to service', async () => {
      mockGetDemographics.mockResolvedValueOnce({});
      const { mockReq, mockRes, mockNext } = makeMocks({
        lgaId: 'ibadan_north',
        dateFrom: '2026-01-01',
      });

      await AnalyticsController.getDemographics(mockReq, mockRes, mockNext);

      expect(mockGetDemographics).toHaveBeenCalledWith(
        systemScope,
        expect.objectContaining({ lgaId: 'ibadan_north', dateFrom: '2026-01-01' }),
      );
    });

    it('passes errors to next', async () => {
      const error = new Error('DB error');
      mockGetDemographics.mockRejectedValueOnce(error);
      const { mockReq, mockRes, mockNext } = makeMocks();

      await AnalyticsController.getDemographics(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('rejects invalid dateFrom with validation error', async () => {
      const { mockReq, mockRes, mockNext } = makeMocks({ dateFrom: 'not-a-date' });
      await AnalyticsController.getDemographics(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
      expect(mockGetDemographics).not.toHaveBeenCalled();
    });
  });

  describe('getEmployment', () => {
    it('returns employment stats', async () => {
      const data = { workStatusBreakdown: [] };
      mockGetEmployment.mockResolvedValueOnce(data);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await AnalyticsController.getEmployment(mockReq, mockRes, mockNext);
      expect(jsonMock).toHaveBeenCalledWith({ data });
    });

    it('passes errors to next', async () => {
      mockGetEmployment.mockRejectedValueOnce(new Error('fail'));
      const { mockReq, mockRes, mockNext } = makeMocks();
      await AnalyticsController.getEmployment(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getHousehold', () => {
    it('returns household stats', async () => {
      const data = { householdSizeDistribution: [] };
      mockGetHousehold.mockResolvedValueOnce(data);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await AnalyticsController.getHousehold(mockReq, mockRes, mockNext);
      expect(jsonMock).toHaveBeenCalledWith({ data });
    });

    it('passes errors to next', async () => {
      mockGetHousehold.mockRejectedValueOnce(new Error('fail'));
      const { mockReq, mockRes, mockNext } = makeMocks();
      await AnalyticsController.getHousehold(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getSkillsFrequency', () => {
    it('defaults to limit=20', async () => {
      mockGetSkillsFrequency.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks();

      await AnalyticsController.getSkillsFrequency(mockReq, mockRes, mockNext);

      expect(mockGetSkillsFrequency).toHaveBeenCalledWith(
        systemScope,
        expect.any(Object),
        20,
      );
    });

    it('accepts custom limit', async () => {
      mockGetSkillsFrequency.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks({ limit: '10' });

      await AnalyticsController.getSkillsFrequency(mockReq, mockRes, mockNext);

      expect(mockGetSkillsFrequency).toHaveBeenCalledWith(
        systemScope,
        expect.any(Object),
        10,
      );
    });

    it('rejects invalid limit with validation error', async () => {
      const { mockReq, mockRes, mockNext } = makeMocks({ limit: '0' });

      await AnalyticsController.getSkillsFrequency(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getTrends', () => {
    it('defaults to day granularity and 30 days', async () => {
      mockGetTrends.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks();

      await AnalyticsController.getTrends(mockReq, mockRes, mockNext);

      expect(mockGetTrends).toHaveBeenCalledWith(
        systemScope,
        expect.any(Object),
        'day',
        30,
      );
    });

    it('accepts custom granularity and days', async () => {
      mockGetTrends.mockResolvedValueOnce([]);
      const { mockReq, mockRes, mockNext } = makeMocks({ granularity: 'week', days: '90' });

      await AnalyticsController.getTrends(mockReq, mockRes, mockNext);

      expect(mockGetTrends).toHaveBeenCalledWith(
        systemScope,
        expect.any(Object),
        'week',
        90,
      );
    });

    it('rejects invalid granularity', async () => {
      const { mockReq, mockRes, mockNext } = makeMocks({ granularity: 'invalid' });

      await AnalyticsController.getTrends(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('getRegistrySummary', () => {
    it('returns registry summary in data envelope', async () => {
      const data = { totalRespondents: 100 };
      mockGetRegistrySummary.mockResolvedValueOnce(data);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await AnalyticsController.getRegistrySummary(mockReq, mockRes, mockNext);
      expect(jsonMock).toHaveBeenCalledWith({ data });
    });

    it('passes source filter', async () => {
      mockGetRegistrySummary.mockResolvedValueOnce({});
      const { mockReq, mockRes, mockNext } = makeMocks({ source: 'enumerator' });

      await AnalyticsController.getRegistrySummary(mockReq, mockRes, mockNext);
      expect(mockGetRegistrySummary).toHaveBeenCalledWith(
        systemScope,
        expect.objectContaining({ source: 'enumerator' }),
      );
    });
  });
  describe('getPipelineSummary', () => {
    it('returns pipeline summary in data envelope', async () => {
      const data = { totalSubmissions: 500, completionRate: 85, avgCompletionTimeSecs: 1200, activeEnumerators: 12 };
      mockGetPipelineSummary.mockResolvedValueOnce(data);
      const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

      await AnalyticsController.getPipelineSummary(mockReq, mockRes, mockNext);

      expect(mockGetPipelineSummary).toHaveBeenCalledWith(systemScope, expect.any(Object));
      expect(jsonMock).toHaveBeenCalledWith({ data });
    });

    it('passes errors to next', async () => {
      mockGetPipelineSummary.mockRejectedValueOnce(new Error('DB error'));
      const { mockReq, mockRes, mockNext } = makeMocks();

      await AnalyticsController.getPipelineSummary(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});

// ── Authorization Tests (403) ─────────────────────────────────────────

const { authorize } = await import('../../middleware/rbac.js');

describe('Analytics Route Authorization (403 tests)', () => {
  // Analytics endpoints allow all dashboard roles (not PUBLIC_USER)
  const allDashboardRoles = [
    UserRole.SUPER_ADMIN,
    UserRole.GOVERNMENT_OFFICIAL,
    UserRole.SUPERVISOR,
    UserRole.ENUMERATOR,
    UserRole.DATA_ENTRY_CLERK,
    UserRole.VERIFICATION_ASSESSOR,
  ];

  const analyticsAuthMiddleware = authorize(...allDashboardRoles);

  function makeAuthReq(role?: string) {
    const req = { user: role ? { sub: 'user-1', role } : undefined } as unknown as Request;
    const res = {} as unknown as Response;
    const next: NextFunction = vi.fn();
    return { req, res, next };
  }

  describe('Permitted roles', () => {
    for (const role of allDashboardRoles) {
      it(`allows ${role} access`, () => {
        const { req, res, next } = makeAuthReq(role);
        analyticsAuthMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith();
      });
    }
  });

  describe('Rejected roles (403)', () => {
    const rejectedRoles = [UserRole.PUBLIC_USER];

    for (const role of rejectedRoles) {
      it(`rejects ${role} with FORBIDDEN`, () => {
        const { req, res, next } = makeAuthReq(role);
        analyticsAuthMiddleware(req, res, next);
        expect(next).toHaveBeenCalledWith(
          expect.objectContaining({ code: 'FORBIDDEN' }),
        );
      });
    }
  });

  describe('Unauthenticated (401)', () => {
    it('rejects unauthenticated request with AUTH_REQUIRED', () => {
      const { req, res, next } = makeAuthReq(undefined);
      analyticsAuthMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'AUTH_REQUIRED' }),
      );
    });
  });
});
