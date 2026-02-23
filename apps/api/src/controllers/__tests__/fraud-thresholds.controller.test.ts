import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ──────────────────────────────────────────────────────
const mockGetThresholdsByCategory = vi.fn();
const mockUpdateThreshold = vi.fn();

vi.mock('../../services/fraud-config.service.js', () => ({
  FraudConfigService: {
    getThresholdsByCategory: (...args: unknown[]) => mockGetThresholdsByCategory(...args),
    updateThreshold: (...args: unknown[]) => mockUpdateThreshold(...args),
  },
}));

vi.mock('pino', () => ({ default: () => ({ info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

// Import after mocks
const { FraudThresholdsController } = await import('../fraud-thresholds.controller.js');

// ── Test Helpers ───────────────────────────────────────────────────────

function makeMocks() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes: Partial<Response> = { json: jsonMock, status: statusMock };
  const mockNext: NextFunction = vi.fn();
  return { jsonMock, statusMock, mockRes, mockNext };
}

describe('FraudThresholdsController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('listThresholds', () => {
    it('returns grouped thresholds', async () => {
      const grouped = {
        gps: [{ ruleKey: 'gps_weight', thresholdValue: 25 }],
        speed: [{ ruleKey: 'speed_weight', thresholdValue: 25 }],
      };
      mockGetThresholdsByCategory.mockResolvedValue(grouped);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {} as Request;

      await FraudThresholdsController.listThresholds(mockReq, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({ data: grouped });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls next on service error', async () => {
      const error = new Error('DB error');
      mockGetThresholdsByCategory.mockRejectedValue(error);

      const { mockRes, mockNext } = makeMocks();
      const mockReq = {} as Request;

      await FraudThresholdsController.listThresholds(mockReq, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });

  describe('updateThreshold', () => {
    it('creates new version with valid input', async () => {
      const updatedConfig = { ruleKey: 'gps_weight', thresholdValue: 30, version: 2 };
      mockUpdateThreshold.mockResolvedValue(updatedConfig);

      const { jsonMock, mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { ruleKey: 'gps_weight' },
        body: { thresholdValue: 30 },
        user: { sub: 'admin-123' },
      } as unknown as Request;

      await FraudThresholdsController.updateThreshold(mockReq, mockRes as Response, mockNext);

      expect(mockUpdateThreshold).toHaveBeenCalledWith(
        'gps_weight',
        30,
        'admin-123',
        expect.objectContaining({}),
      );
      expect(jsonMock).toHaveBeenCalledWith({ data: updatedConfig });
    });

    it('calls next with 401 when no admin user', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { ruleKey: 'gps_weight' },
        body: { thresholdValue: 30 },
      } as unknown as Request;

      await FraudThresholdsController.updateThreshold(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(401);
    });

    it('calls next with 400 for invalid body', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: { ruleKey: 'gps_weight' },
        body: { thresholdValue: 'not-a-number' },
        user: { sub: 'admin-123' },
      } as unknown as Request;

      await FraudThresholdsController.updateThreshold(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });

    it('calls next with 400 when ruleKey is missing', async () => {
      const { mockRes, mockNext } = makeMocks();
      const mockReq = {
        params: {},
        body: { thresholdValue: 30 },
        user: { sub: 'admin-123' },
      } as unknown as Request;

      await FraudThresholdsController.updateThreshold(mockReq, mockRes as Response, mockNext);

      const error = (mockNext as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(error.statusCode).toBe(400);
    });
  });
});
