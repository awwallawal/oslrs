import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { CrossTabDimension, CrossTabMeasure } from '@oslsr/types';

// ── Hoisted mocks ──────────────────────────────────────────────────────

const mockGetCrossTab = vi.fn();
const mockGetSkillsInventory = vi.fn();

vi.mock('../../services/survey-analytics.service.js', () => ({
  SurveyAnalyticsService: {
    getDemographics: vi.fn(),
    getEmployment: vi.fn(),
    getHousehold: vi.fn(),
    getSkillsFrequency: vi.fn(),
    getTrends: vi.fn(),
    getRegistrySummary: vi.fn(),
    getPipelineSummary: vi.fn(),
    getCrossTab: (...args: unknown[]) => mockGetCrossTab(...args),
    getSkillsInventory: (...args: unknown[]) => mockGetSkillsInventory(...args),
  },
}));

const { AnalyticsController } = await import('../analytics.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

const systemScope = { type: 'system' };

function makeMocks(queryOverrides: Record<string, string> = {}) {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnValue({ json: jsonMock });
  const mockReq = {
    query: queryOverrides,
    analyticsScope: systemScope,
  } as unknown as Request;
  const mockRes = { json: jsonMock, status: statusMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock, statusMock };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AnalyticsController - Cross-Tab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns cross-tab data in data envelope', async () => {
    const data = { rowLabels: ['male'], colLabels: ['employed'], cells: [[50]], totalN: 100, anySuppressed: false };
    mockGetCrossTab.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks({
      rowDim: 'gender',
      colDim: 'employmentType',
    });

    await AnalyticsController.getCrossTab(mockReq, mockRes, mockNext);

    expect(mockGetCrossTab).toHaveBeenCalledWith(
      CrossTabDimension.GENDER,
      CrossTabDimension.EMPLOYMENT_TYPE,
      CrossTabMeasure.COUNT,
      systemScope,
      expect.any(Object),
    );
    expect(jsonMock).toHaveBeenCalledWith({ data });
  });

  it('returns Zod error when rowDim === colDim', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      rowDim: 'gender',
      colDim: 'gender',
    });

    await AnalyticsController.getCrossTab(mockReq, mockRes, mockNext);

    // Zod .refine() validation error passes through next()
    expect(mockNext).toHaveBeenCalled();
    expect(mockGetCrossTab).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid dimension', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      rowDim: 'invalidDim',
      colDim: 'gender',
    });

    await AnalyticsController.getCrossTab(mockReq, mockRes, mockNext);

    // Zod validation error should be passed to next
    expect(mockNext).toHaveBeenCalled();
  });

  it('passes measure parameter to service', async () => {
    mockGetCrossTab.mockResolvedValueOnce({ rowLabels: [], colLabels: [], cells: [], totalN: 0, anySuppressed: false });
    const { mockReq, mockRes, mockNext } = makeMocks({
      rowDim: 'gender',
      colDim: 'education',
      measure: 'rowPct',
    });

    await AnalyticsController.getCrossTab(mockReq, mockRes, mockNext);

    expect(mockGetCrossTab).toHaveBeenCalledWith(
      CrossTabDimension.GENDER,
      CrossTabDimension.EDUCATION,
      CrossTabMeasure.ROW_PCT,
      systemScope,
      expect.any(Object),
    );
  });
});

describe('AnalyticsController - Skills Inventory', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns skills inventory data in data envelope', async () => {
    const data = {
      allSkills: [],
      byCategory: [],
      byLga: null,
      gapAnalysis: null,
      diversityIndex: null,
      thresholds: {
        allSkills: { met: false, currentN: 0, requiredN: 30 },
        byCategory: { met: false, currentN: 0, requiredN: 30 },
        byLga: { met: false, currentN: 0, requiredN: 20 },
        gapAnalysis: { met: false, currentN: 0, requiredN: 30 },
        diversityIndex: { met: false, currentN: 0, requiredN: 30 },
      },
    };
    mockGetSkillsInventory.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await AnalyticsController.getSkillsInventory(mockReq, mockRes, mockNext);

    expect(mockGetSkillsInventory).toHaveBeenCalledWith(systemScope, expect.any(Object));
    expect(jsonMock).toHaveBeenCalledWith({ data });
  });

  it('passes optional query params to service', async () => {
    mockGetSkillsInventory.mockResolvedValueOnce({ allSkills: [] });
    const { mockReq, mockRes, mockNext } = makeMocks({
      lgaId: 'test-lga',
      dateFrom: '2026-01-01',
    });

    await AnalyticsController.getSkillsInventory(mockReq, mockRes, mockNext);

    expect(mockGetSkillsInventory).toHaveBeenCalledWith(
      systemScope,
      expect.objectContaining({ lgaId: 'test-lga', dateFrom: '2026-01-01' }),
    );
  });
});
