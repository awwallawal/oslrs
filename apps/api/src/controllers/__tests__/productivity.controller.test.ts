/**
 * Productivity Controller Tests
 *
 * Story 5.6a: Tests for ProductivityController handlers.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('../../services/productivity.service.js', () => ({
  ProductivityService: {
    getTeamProductivity: vi.fn(),
  },
}));

vi.mock('../../services/productivity-target.service.js', () => ({
  ProductivityTargetService: {
    getActiveTargets: vi.fn(),
    updateTargets: vi.fn(),
  },
}));

vi.mock('../../services/export.service.js', () => ({
  ExportService: {
    generateCsvExport: vi.fn(),
    generatePdfReport: vi.fn(),
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    logPiiAccess: vi.fn(),
  },
  PII_ACTIONS: {
    VIEW_PRODUCTIVITY: 'pii.view_productivity',
    EXPORT_PRODUCTIVITY: 'pii.export_productivity',
  },
}));

vi.mock('../../db/index.js', () => ({
  db: {
    query: {
      lgas: { findFirst: vi.fn().mockResolvedValue({ id: 'lga-1', name: 'Ibadan North' }) },
      users: { findFirst: vi.fn().mockResolvedValue({ fullName: 'Test Supervisor' }) },
    },
  },
}));

vi.mock('pino', () => ({
  default: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { ProductivityController } from '../productivity.controller.js';
import { ProductivityService } from '../../services/productivity.service.js';
import { ProductivityTargetService } from '../../services/productivity-target.service.js';
import { ExportService } from '../../services/export.service.js';
import { AuditService } from '../../services/audit.service.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

let mockReq: Partial<Request>;
let jsonMock: ReturnType<typeof vi.fn>;
let statusMock: ReturnType<typeof vi.fn>;
let setMock: ReturnType<typeof vi.fn>;
let sendMock: ReturnType<typeof vi.fn>;
let mockRes: Partial<Response>;
let mockNext: NextFunction;

beforeEach(() => {
  vi.resetAllMocks();

  jsonMock = vi.fn();
  statusMock = vi.fn().mockReturnThis();
  setMock = vi.fn();
  sendMock = vi.fn();
  mockRes = { json: jsonMock, status: statusMock, set: setMock, send: sendMock } as Partial<Response>;
  mockNext = vi.fn();

  mockReq = {
    query: {},
    params: {},
    body: {},
    user: { sub: 'user-1', role: 'supervisor', lgaId: 'lga-1' },
  } as unknown as Partial<Request>;
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('ProductivityController', () => {
  describe('getTeamProductivity', () => {
    const mockResult = {
      rows: [{ id: 'enum-1', fullName: 'Test User', todayCount: 10, target: 25, percent: 40, status: 'on_track' }],
      summary: { totalSubmissions: 10, avgPerDay: 10, totalTarget: 25, overallPercent: 40, completedCount: 0, behindCount: 0, inactiveCount: 0 },
      totalItems: 1,
    };

    it('returns team productivity data with pagination meta', async () => {
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(ProductivityService.getTeamProductivity).toHaveBeenCalledWith(
        'user-1', // supervisor sees own team
        expect.objectContaining({ period: 'today', page: 1, pageSize: 20 }),
      );
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockResult.rows,
          summary: mockResult.summary,
          meta: expect.objectContaining({
            pagination: expect.objectContaining({ totalItems: 1 }),
          }),
        }),
      );
    });

    it('passes null supervisorId for super_admin', async () => {
      (mockReq as Record<string, unknown>).user = { sub: 'admin-1', role: 'super_admin' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(ProductivityService.getTeamProductivity).toHaveBeenCalledWith(
        null,
        expect.anything(),
      );
    });

    it('calls next with error when user is not authenticated', async () => {
      (mockReq as Record<string, unknown>).user = undefined;

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });

    it('calls next with validation error for invalid query params', async () => {
      mockReq.query = { pageSize: '999' }; // max is 100

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('logs PII access via AuditService', async () => {
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(AuditService.logPiiAccess).toHaveBeenCalledWith(
        mockReq,
        'pii.view_productivity',
        'staff_productivity',
        null,
        expect.objectContaining({ resultCount: 1 }),
      );
    });

    it('applies query param filters correctly', async () => {
      mockReq.query = { status: 'behind', search: 'john', sortBy: 'todayCount', sortOrder: 'desc' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);

      await ProductivityController.getTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(ProductivityService.getTeamProductivity).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ status: 'behind', search: 'john', sortBy: 'todayCount', sortOrder: 'desc' }),
      );
    });
  });

  describe('getTargets', () => {
    it('returns active targets', async () => {
      const mockTargets = { defaultTarget: 25, lgaOverrides: [] };
      vi.mocked(ProductivityTargetService.getActiveTargets).mockResolvedValue(mockTargets);

      await ProductivityController.getTargets(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: mockTargets });
    });

    it('calls next on error', async () => {
      vi.mocked(ProductivityTargetService.getActiveTargets).mockRejectedValue(new Error('DB error'));

      await ProductivityController.getTargets(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateTargets', () => {
    it('updates targets and returns result', async () => {
      (mockReq as Record<string, unknown>).user = { sub: 'admin-1', role: 'super_admin' };
      mockReq.body = { defaultTarget: 30 };
      const updated = { defaultTarget: 30, lgaOverrides: [] };
      vi.mocked(ProductivityTargetService.updateTargets).mockResolvedValue(updated);

      await ProductivityController.updateTargets(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(ProductivityTargetService.updateTargets).toHaveBeenCalledWith(
        { defaultTarget: 30 },
        'admin-1',
      );
      expect(jsonMock).toHaveBeenCalledWith({ data: updated });
    });

    it('rejects when no target fields provided', async () => {
      (mockReq as Record<string, unknown>).user = { sub: 'admin-1', role: 'super_admin' };
      mockReq.body = {};

      await ProductivityController.updateTargets(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('rejects unauthenticated requests', async () => {
      (mockReq as Record<string, unknown>).user = undefined;

      await ProductivityController.updateTargets(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 401 }),
      );
    });
  });

  describe('exportTeamProductivity', () => {
    const mockResult = {
      rows: [{ id: 'enum-1', fullName: 'Test User' }],
      summary: { totalSubmissions: 10, avgPerDay: 10, totalTarget: 25, overallPercent: 40, completedCount: 0, behindCount: 0, inactiveCount: 0 },
      totalItems: 1,
    };

    it('exports CSV with correct headers', async () => {
      mockReq.body = { format: 'csv', period: 'today' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);
      vi.mocked(ExportService.generateCsvExport).mockResolvedValue(Buffer.from('csv-data'));

      await ProductivityController.exportTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'text/csv; charset=utf-8' }),
      );
      expect(sendMock).toHaveBeenCalledWith(Buffer.from('csv-data'));
    });

    it('exports PDF with correct headers', async () => {
      mockReq.body = { format: 'pdf', period: 'today' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);
      vi.mocked(ExportService.generatePdfReport).mockResolvedValue(Buffer.from('pdf-data'));

      await ProductivityController.exportTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'application/pdf' }),
      );
      expect(sendMock).toHaveBeenCalledWith(Buffer.from('pdf-data'));
    });

    it('logs PII export access', async () => {
      mockReq.body = { format: 'csv', period: 'today' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);
      vi.mocked(ExportService.generateCsvExport).mockResolvedValue(Buffer.from('data'));

      await ProductivityController.exportTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(AuditService.logPiiAccess).toHaveBeenCalledWith(
        mockReq,
        'pii.export_productivity',
        'staff_productivity',
        null,
        expect.objectContaining({ format: 'csv' }),
      );
    });

    it('rejects invalid export format', async () => {
      mockReq.body = { format: 'xlsx' };

      await ProductivityController.exportTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 }),
      );
    });

    it('uses large pageSize for export (all rows)', async () => {
      mockReq.body = { format: 'csv', period: 'today' };
      vi.mocked(ProductivityService.getTeamProductivity).mockResolvedValue(mockResult);
      vi.mocked(ExportService.generateCsvExport).mockResolvedValue(Buffer.from('data'));

      await ProductivityController.exportTeamProductivity(
        mockReq as Request,
        mockRes as Response,
        mockNext,
      );

      expect(ProductivityService.getTeamProductivity).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ pageSize: 10000 }),
      );
    });
  });
});
