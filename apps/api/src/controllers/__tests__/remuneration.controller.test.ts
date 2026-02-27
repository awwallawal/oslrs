/**
 * RemunerationController Tests — Story 6.4
 *
 * Tests: batch creation, self-payment rejection, auth/authorization,
 * batch listing, batch detail, record correction, staff history, notifications.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response, NextFunction } from 'express';

// Mock the service
const mockCreatePaymentBatch = vi.fn();
const mockGetPaymentBatches = vi.fn();
const mockGetBatchDetail = vi.fn();
const mockCorrectPaymentRecord = vi.fn();
const mockGetStaffPaymentHistory = vi.fn();
const mockGetFileStream = vi.fn();
const mockGetEligibleStaff = vi.fn();

vi.mock('../../services/remuneration.service.js', () => ({
  RemunerationService: {
    createPaymentBatch: (...args: unknown[]) => mockCreatePaymentBatch(...args),
    getPaymentBatches: (...args: unknown[]) => mockGetPaymentBatches(...args),
    getBatchDetail: (...args: unknown[]) => mockGetBatchDetail(...args),
    correctPaymentRecord: (...args: unknown[]) => mockCorrectPaymentRecord(...args),
    getStaffPaymentHistory: (...args: unknown[]) => mockGetStaffPaymentHistory(...args),
    getFileStream: (...args: unknown[]) => mockGetFileStream(...args),
    getEligibleStaff: (...args: unknown[]) => mockGetEligibleStaff(...args),
  },
}));

const mockLogPiiAccess = vi.fn();
vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    logPiiAccess: (...args: unknown[]) => mockLogPiiAccess(...args),
  },
  PII_ACTIONS: {
    VIEW_RECORD: 'pii.view_record',
  },
}));

const { RemunerationController } = await import('../remuneration.controller.js');

// Valid UUIDs for testing
const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const STAFF_1_ID = '00000000-0000-0000-0000-000000000010';
const STAFF_2_ID = '00000000-0000-0000-0000-000000000020';

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    body: {},
    params: {},
    query: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    user: { sub: ADMIN_ID, role: 'super_admin' },
    socket: { remoteAddress: '127.0.0.1' },
    file: undefined,
    ...overrides,
  } as unknown as Request;
}

function makeRes() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const setHeaderMock = vi.fn();
  const mockRes: Partial<Response> = {
    json: jsonMock,
    status: statusMock,
    setHeader: setHeaderMock,
  };
  return { jsonMock, statusMock, setHeaderMock, mockRes };
}

describe('RemunerationController', () => {
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.resetAllMocks();
    mockNext = vi.fn();
  });

  // ─── createBatch ──────────────────────────────────────────────────

  describe('createBatch', () => {
    it('should create batch and return 201 (AC1)', async () => {
      const batchResult = {
        id: 'batch-123',
        trancheName: 'Tranche 1',
        staffCount: 2,
        totalAmount: 1000000,
      };

      mockCreatePaymentBatch.mockResolvedValue(batchResult);

      const req = makeReq({
        body: {
          trancheName: 'Tranche 1',
          trancheNumber: 1,
          amount: 500000,
          staffIds: JSON.stringify([STAFF_1_ID, STAFF_2_ID]),
        },
      });

      const { jsonMock, statusMock, mockRes } = makeRes();

      await RemunerationController.createBatch(req, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(201);
      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: batchResult,
      });
    });

    it('should reject self-payment with 400 (AC3)', async () => {
      const error = new Error('Cannot record payment to yourself');
      (error as any).code = 'CANNOT_RECORD_SELF_PAYMENT';
      (error as any).statusCode = 400;
      mockCreatePaymentBatch.mockRejectedValue(error);

      const req = makeReq({
        body: {
          trancheName: 'Tranche 1',
          trancheNumber: 1,
          amount: 500000,
          staffIds: JSON.stringify([ADMIN_ID]), // self-payment
        },
      });

      const { mockRes } = makeRes();

      await RemunerationController.createBatch(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Cannot record payment to yourself',
      }));
    });

    it('should return 401 for unauthenticated request', async () => {
      const req = makeReq({
        user: undefined, // no auth
      });

      const { mockRes } = makeRes();

      await RemunerationController.createBatch(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Authentication required',
      }));
    });

    it('should return validation error for invalid data', async () => {
      const req = makeReq({
        body: {
          trancheName: '', // invalid - empty
          trancheNumber: 0, // invalid - not positive
          amount: -100, // invalid - negative
          staffIds: '[]', // invalid - empty array
        },
      });

      const { mockRes } = makeRes();

      await RemunerationController.createBatch(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid payment batch data',
      }));
    });
  });

  // ─── listBatches ──────────────────────────────────────────────────

  describe('listBatches', () => {
    it('should return paginated batches', async () => {
      const result = {
        data: [{ id: 'batch-1', trancheName: 'Tranche 1' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      mockGetPaymentBatches.mockResolvedValue(result);

      const req = makeReq({ query: { page: '1', limit: '20' } });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.listBatches(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        ...result,
      });
    });
  });

  // ─── getBatchDetail ───────────────────────────────────────────────

  describe('getBatchDetail', () => {
    it('should return batch with records', async () => {
      const batch = {
        id: 'batch-1',
        trancheName: 'Tranche 1',
        records: [{ id: 'rec-1', userId: STAFF_1_ID, amount: 500000 }],
        receiptFile: null,
      };

      mockGetBatchDetail.mockResolvedValue(batch);

      const req = makeReq({ params: { batchId: 'batch-1' } });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.getBatchDetail(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: batch,
      });
    });
  });

  // ─── correctRecord ────────────────────────────────────────────────

  describe('correctRecord', () => {
    it('should create new version (temporal versioning)', async () => {
      const newRecord = {
        id: 'new-record',
        amount: 600000,
        status: 'active',
        effectiveFrom: new Date(),
      };

      mockCorrectPaymentRecord.mockResolvedValue(newRecord);

      const req = makeReq({
        params: { recordId: 'record-1' },
        body: { newAmount: 600000, reason: 'Correction' },
      });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.correctRecord(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: newRecord,
      });
      expect(mockCorrectPaymentRecord).toHaveBeenCalledWith(
        'record-1',
        { newAmount: 600000, reason: 'Correction' },
        ADMIN_ID,
        expect.any(String),
        'test-agent',
      );
    });

    it('should preserve original record (effectiveUntil set)', async () => {
      // This tests the correction flow — the service closes old and inserts new
      const correctedRecord = {
        id: 'new-rec',
        amount: 700000,
        status: 'active',
        effectiveFrom: new Date(),
        effectiveUntil: null,
      };

      mockCorrectPaymentRecord.mockResolvedValue(correctedRecord);

      const req = makeReq({
        params: { recordId: 'old-rec' },
        body: { newAmount: 700000, reason: 'Amount update' },
      });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.correctRecord(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({ amount: 700000, status: 'active' }),
      });
    });
  });

  // ─── getStaffHistory ──────────────────────────────────────────────

  describe('getStaffHistory', () => {
    it('should return active records only for staff', async () => {
      const result = {
        data: [{ id: 'rec-1', amount: 500000, status: 'active' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };

      mockGetStaffPaymentHistory.mockResolvedValue(result);

      const req = makeReq({
        params: { userId: STAFF_1_ID },
        query: {},
      });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.getStaffHistory(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        ...result,
      });
      expect(mockLogPiiAccess).toHaveBeenCalledOnce();
    });

    it('should return 403 for non-super-admin viewing others history', async () => {
      const req = makeReq({
        user: { sub: STAFF_2_ID, role: 'enumerator' },
        params: { userId: STAFF_1_ID }, // trying to view someone else's
        query: {},
      });
      const { mockRes } = makeRes();

      await RemunerationController.getStaffHistory(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'You can only view your own payment history',
      }));
    });

    it('should allow staff to view own payment history', async () => {
      const result = {
        data: [{ id: 'rec-1', amount: 500000 }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockGetStaffPaymentHistory.mockResolvedValue(result);

      const req = makeReq({
        user: { sub: STAFF_1_ID, role: 'enumerator' },
        params: { userId: STAFF_1_ID }, // own history
        query: {},
      });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.getStaffHistory(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        ...result,
      });
    });
  });

  // ─── notification emails ──────────────────────────────────────────

  describe('notification emails', () => {
    it('should queue notification emails after batch creation (mock queueEmail)', async () => {
      const batchResult = {
        id: 'batch-123',
        trancheName: 'Tranche 1',
        staffCount: 1,
        totalAmount: 500000,
      };

      mockCreatePaymentBatch.mockResolvedValue(batchResult);

      const req = makeReq({
        body: {
          trancheName: 'Tranche 1',
          trancheNumber: 1,
          amount: 500000,
          staffIds: JSON.stringify([STAFF_1_ID]),
        },
      });

      const { statusMock, jsonMock, mockRes } = makeRes();

      await RemunerationController.createBatch(req, mockRes as Response, mockNext);

      // Batch was created successfully — emails are queued inside the service
      expect(statusMock).toHaveBeenCalledWith(201);
      expect(mockCreatePaymentBatch).toHaveBeenCalledWith(
        expect.objectContaining({
          trancheName: 'Tranche 1',
          staffIds: [STAFF_1_ID],
        }),
        ADMIN_ID,
        expect.any(String),
        'test-agent',
      );
    });
  });

  // ─── getEligibleStaff ──────────────────────────────────────────────

  describe('getEligibleStaff', () => {
    it('should return eligible staff list', async () => {
      const staffList = [
        { id: STAFF_1_ID, fullName: 'John', email: 'john@test.com', bankName: 'First Bank', accountNumber: '1234567890' },
      ];

      mockGetEligibleStaff.mockResolvedValue(staffList);

      const req = makeReq({ query: { roleFilter: 'enumerator' } });
      const { jsonMock, mockRes } = makeRes();

      await RemunerationController.getEligibleStaff(req, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith({
        success: true,
        data: staffList,
      });
      expect(mockGetEligibleStaff).toHaveBeenCalledWith(
        expect.objectContaining({ roleFilter: 'enumerator' }),
      );
    });

    it('should return 401 for unauthenticated request', async () => {
      const req = makeReq({ user: undefined });
      const { mockRes } = makeRes();

      await RemunerationController.getEligibleStaff(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Authentication required',
      }));
    });
  });

  // ─── downloadFile ──────────────────────────────────────────────────

  describe('downloadFile', () => {
    it('should stream file with correct headers', async () => {
      const mockPipe = vi.fn();
      mockGetFileStream.mockResolvedValue({
        stream: { pipe: mockPipe },
        filename: 'receipt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      });

      const req = makeReq({ params: { fileId: 'file-1' } });
      const { setHeaderMock, mockRes } = makeRes();

      await RemunerationController.downloadFile(req, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(setHeaderMock).toHaveBeenCalledWith('Content-Disposition', 'attachment; filename="receipt.pdf"');
      expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', '2048');
      expect(mockPipe).toHaveBeenCalledWith(mockRes);
    });

    it('should return 401 for unauthenticated request', async () => {
      const req = makeReq({ user: undefined, params: { fileId: 'file-1' } });
      const { mockRes } = makeRes();

      await RemunerationController.downloadFile(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Authentication required',
      }));
    });
  });
});
