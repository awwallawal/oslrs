import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mock ──────────────────────────────────────────────────────

const mockGetPublicInsights = vi.fn();
const mockGetTrends = vi.fn();

vi.mock('../../services/public-insights.service.js', () => ({
  PublicInsightsService: {
    getPublicInsights: (...args: unknown[]) => mockGetPublicInsights(...args),
    getTrends: (...args: unknown[]) => mockGetTrends(...args),
  },
}));

const { PublicInsightsController } = await import('../public-insights.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

function makeMocks() {
  const jsonMock = vi.fn();
  const mockReq = {} as unknown as Request;
  const mockRes = { json: jsonMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('PublicInsightsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns public insights in data envelope', async () => {
    const data = { totalRegistered: 500, lgasCovered: 15 };
    mockGetPublicInsights.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await PublicInsightsController.getInsights(mockReq, mockRes, mockNext);

    expect(mockGetPublicInsights).toHaveBeenCalledTimes(1);
    expect(jsonMock).toHaveBeenCalledWith({ data });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('handles empty data gracefully', async () => {
    const data = { totalRegistered: 0, lgasCovered: 0, genderSplit: [], allSkills: [] };
    mockGetPublicInsights.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await PublicInsightsController.getInsights(mockReq, mockRes, mockNext);
    expect(jsonMock).toHaveBeenCalledWith({ data });
  });

  it('passes errors to next middleware', async () => {
    const error = new Error('Redis connection failed');
    mockGetPublicInsights.mockRejectedValueOnce(error);
    const { mockReq, mockRes, mockNext } = makeMocks();

    await PublicInsightsController.getInsights(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('does not require authentication', async () => {
    // Controller accepts bare request (no user, no auth)
    mockGetPublicInsights.mockResolvedValueOnce({ totalRegistered: 100 });
    const req = {} as Request; // no user property
    const jsonMock = vi.fn();
    const res = { json: jsonMock } as unknown as Response;
    const next: NextFunction = vi.fn();

    await PublicInsightsController.getInsights(req, res, next);
    expect(jsonMock).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });
});

describe('PublicInsightsController.getTrends', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns trends data in data envelope', async () => {
    const data = { dailyRegistrations: [{ date: '2026-03-01', count: 25 }], employmentByWeek: [], totalDays: 1, lastUpdated: '2026-03-13T10:00:00.000Z' };
    mockGetTrends.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await PublicInsightsController.getTrends(mockReq, mockRes, mockNext);

    expect(mockGetTrends).toHaveBeenCalledTimes(1);
    expect(jsonMock).toHaveBeenCalledWith({ data });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('passes errors to next middleware', async () => {
    const error = new Error('DB error');
    mockGetTrends.mockRejectedValueOnce(error);
    const { mockReq, mockRes, mockNext } = makeMocks();

    await PublicInsightsController.getTrends(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(error);
  });
});
