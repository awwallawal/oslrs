import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Hoisted mocks
const mockGetTeamQuality = vi.fn();
const mockResolveEnumeratorIds = vi.fn();

vi.mock('../../services/team-quality.service.js', () => ({
  TeamQualityService: {
    getTeamQuality: (...args: unknown[]) => mockGetTeamQuality(...args),
    resolveEnumeratorIds: (...args: unknown[]) => mockResolveEnumeratorIds(...args),
  },
}));

const { TeamQualityController } = await import('../team-quality.controller.js');

function makeMocks(overrides: {
  query?: Record<string, string>;
  role?: string;
  sub?: string;
} = {}) {
  const jsonMock = vi.fn();
  const mockReq = {
    query: overrides.query ?? {},
    user: { sub: overrides.sub ?? 'sup-1', role: overrides.role ?? 'supervisor' },
  } as unknown as Request;
  const mockRes = { json: jsonMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock };
}

describe('TeamQualityController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockResolveEnumeratorIds.mockResolvedValue(['e1', 'e2']);
    mockGetTeamQuality.mockResolvedValue({ enumerators: [], teamAverages: {} });
  });

  it('returns team quality data for supervisor', async () => {
    const data = { enumerators: [{ enumeratorId: 'e1' }], teamAverages: {} };
    mockGetTeamQuality.mockResolvedValueOnce(data);
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockResolveEnumeratorIds).toHaveBeenCalledWith('sup-1');
    expect(jsonMock).toHaveBeenCalledWith({ data });
  });

  it('super admin can specify supervisorId', async () => {
    const supId = '00000000-0000-0000-0000-000000000002';
    const { mockReq, mockRes, mockNext } = makeMocks({
      role: 'super_admin',
      sub: 'admin-1',
      query: { supervisorId: supId },
    });

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockResolveEnumeratorIds).toHaveBeenCalledWith(supId);
  });

  it('super admin without supervisorId gets system-wide', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      role: 'super_admin',
      sub: 'admin-1',
    });

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockResolveEnumeratorIds).toHaveBeenCalledWith(undefined);
  });

  it('passes date filters to service', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      query: { dateFrom: '2026-03-01', dateTo: '2026-03-10' },
    });

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockGetTeamQuality).toHaveBeenCalledWith(
      ['e1', 'e2'],
      expect.objectContaining({ dateFrom: '2026-03-01', dateTo: '2026-03-10' }),
    );
  });

  it('passes errors to next middleware', async () => {
    const error = new Error('DB error');
    mockResolveEnumeratorIds.mockRejectedValueOnce(error);
    const { mockReq, mockRes, mockNext } = makeMocks();

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(error);
  });

  it('validates invalid date format', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      query: { dateFrom: 'not-a-date' },
    });

    await TeamQualityController.getTeamQuality(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
  });
});
