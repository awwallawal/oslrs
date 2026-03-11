import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

const mockGetFullPipelineData = vi.fn();

vi.mock('../../services/verification-analytics.service.js', () => ({
  VerificationAnalyticsService: {
    getFullPipelineData: (...args: unknown[]) => mockGetFullPipelineData(...args),
  },
}));

const { VerificationAnalyticsController } = await import('../verification-analytics.controller.js');

const MOCK_PIPELINE_DATA = {
  funnel: { totalSubmissions: 100, totalFlagged: 30, totalReviewed: 20, totalApproved: 15, totalRejected: 5 },
  fraudTypeBreakdown: { gpsCluster: 10, speedRun: 8, straightLining: 5, duplicateResponse: 3, offHours: 2 },
  throughputTrend: [],
  topFlaggedEnumerators: [],
  backlogTrend: [],
  rejectionReasons: [],
  avgReviewTimeMinutes: 30,
  medianTimeToResolutionDays: 2,
  dataQualityScore: { completenessRate: 90, consistencyRate: 85 },
};

function makeMocks(overrides: { query?: Record<string, string>; role?: string } = {}) {
  const jsonMock = vi.fn();
  const mockReq = {
    query: overrides.query ?? {},
    user: { sub: 'user-1', role: overrides.role ?? 'verification_assessor' },
  } as unknown as Request;
  const mockRes = { json: jsonMock } as unknown as Response;
  const mockNext: NextFunction = vi.fn();
  return { mockReq, mockRes, mockNext, jsonMock };
}

describe('VerificationAnalyticsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetFullPipelineData.mockResolvedValue(MOCK_PIPELINE_DATA);
  });

  it('returns pipeline data for assessor (200)', async () => {
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(jsonMock).toHaveBeenCalledWith({ data: MOCK_PIPELINE_DATA });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns pipeline data for super_admin (200)', async () => {
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks({ role: 'super_admin' });
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(jsonMock).toHaveBeenCalledWith({ data: MOCK_PIPELINE_DATA });
  });

  it('returns pipeline data for government_official read-only (200)', async () => {
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks({ role: 'government_official' });
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(jsonMock).toHaveBeenCalledWith({ data: MOCK_PIPELINE_DATA });
  });

  it('passes lgaId and severity filters to service', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({
      query: { lgaId: 'akinyele', severity: 'high,critical' },
    });

    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);

    expect(mockGetFullPipelineData).toHaveBeenCalledWith({
      lgaId: 'akinyele',
      severity: ['high', 'critical'],
      dateFrom: undefined,
      dateTo: undefined,
    });
  });

  it('rejects invalid LGA with 400', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({ query: { lgaId: 'invalid_lga_xyz' } });
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('rejects invalid severity with 400', async () => {
    const { mockReq, mockRes, mockNext } = makeMocks({ query: { severity: 'super_high' } });
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('returns data for empty dataset', async () => {
    mockGetFullPipelineData.mockResolvedValueOnce({
      ...MOCK_PIPELINE_DATA,
      funnel: { totalSubmissions: 0, totalFlagged: 0, totalReviewed: 0, totalApproved: 0, totalRejected: 0 },
    });
    const { mockReq, mockRes, mockNext, jsonMock } = makeMocks();
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        funnel: expect.objectContaining({ totalSubmissions: 0 }),
      }),
    }));
  });

  it('passes errors to next middleware', async () => {
    const error = new Error('DB failure');
    mockGetFullPipelineData.mockRejectedValueOnce(error);
    const { mockReq, mockRes, mockNext } = makeMocks();
    await VerificationAnalyticsController.getVerificationPipeline(mockReq, mockRes, mockNext);
    expect(mockNext).toHaveBeenCalledWith(error);
  });
});
