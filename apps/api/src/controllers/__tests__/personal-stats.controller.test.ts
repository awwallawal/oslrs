import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Hoisted mocks
const mockGetPersonalStats = vi.fn();

vi.mock('../../services/personal-stats.service.js', () => ({
  PersonalStatsService: {
    getPersonalStats: (...args: unknown[]) => mockGetPersonalStats(...args),
  },
}));

const { PersonalStatsController } = await import('../personal-stats.controller.js');

function makeMocks(overrides: {
  query?: Record<string, string>;
  role?: string;
  sub?: string;
} = {}) {
  const jsonMock = vi.fn();
  const mockReq = {
    query: overrides.query ?? {},
    user: { sub: overrides.sub ?? 'enum-1', role: overrides.role ?? 'enumerator' },
  } as unknown as Request;
  const mockRes = { json: jsonMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock };
}

describe('PersonalStatsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetPersonalStats.mockResolvedValue({
      dailyTrend: [],
      cumulativeCount: 10,
      compositeQualityScore: 75,
    });
  });

  it('returns personal stats for enumerator', async () => {
    const data = { dailyTrend: [], cumulativeCount: 10 };
    mockGetPersonalStats.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockGetPersonalStats).toHaveBeenCalledWith('enum-1', expect.any(Object), false);
    expect(jsonMock).toHaveBeenCalledWith({ data });
  });

  it('returns personal stats for clerk with isClerk=true', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      role: 'data_entry_clerk',
      sub: 'clerk-1',
    });

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockGetPersonalStats).toHaveBeenCalledWith('clerk-1', expect.any(Object), true);
  });

  it('passes date filters to service', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      query: { dateFrom: '2026-03-01', dateTo: '2026-03-10' },
    });

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockGetPersonalStats).toHaveBeenCalledWith(
      'enum-1',
      expect.objectContaining({ dateFrom: '2026-03-01', dateTo: '2026-03-10' }),
      false,
    );
  });

  it('passes errors to next middleware', async () => {
    const error = new Error('DB error');
    mockGetPersonalStats.mockRejectedValueOnce(error);
    const { mockReq, mockRes, mockNext } = makeMocks();

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('validates invalid date format', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      query: { dateFrom: 'not-a-date' },
    });

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });

  it('uses req.user.sub as userId (never from query params)', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({ sub: 'user-specific' });

    await PersonalStatsController.getPersonalStats(mockReq, mockRes, mockNext);

    expect(mockGetPersonalStats).toHaveBeenCalledWith('user-specific', expect.any(Object), false);
  });
});
