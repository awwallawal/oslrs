import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockGetRespondentDetail = vi.fn();
const mockLogPiiAccess = vi.fn();

vi.mock('../../services/respondent.service.js', () => ({
  RespondentService: {
    getRespondentDetail: (...args: unknown[]) => mockGetRespondentDetail(...args),
  },
}));

vi.mock('../../services/audit.service.js', () => ({
  AuditService: {
    logPiiAccess: (...args: unknown[]) => mockLogPiiAccess(...args),
  },
  PII_ACTIONS: {
    VIEW_RECORD: 'pii.view_record',
    VIEW_LIST: 'pii.view_list',
    EXPORT_CSV: 'pii.export_csv',
    EXPORT_PDF: 'pii.export_pdf',
    SEARCH_PII: 'pii.search',
  },
}));

// Import after mocks
const { RespondentController } = await import('../respondent.controller.js');

// ── Test Helpers ─────────────────────────────────────────────────────

const TEST_RESPONDENT_ID = '018e5f2a-1234-7890-abcd-111111111111';
const TEST_USER_ID = '018e5f2a-1234-7890-abcd-222222222222';

function makeMocks() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const mockRes: Partial<Response> = { json: jsonMock, status: statusMock };
  const mockNext: NextFunction = vi.fn();
  return { jsonMock, statusMock, mockRes, mockNext };
}

function makeReq(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  return {
    query: {},
    params: { id: TEST_RESPONDENT_ID },
    body: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    user: { sub: TEST_USER_ID, role: 'super_admin' },
    get: (h: string) => h === 'user-agent' ? 'test-agent' : undefined,
    ...overrides,
  } as unknown as Request;
}

const mockDetailResponse = {
  id: TEST_RESPONDENT_ID,
  nin: '61961438053',
  firstName: 'Adewale',
  lastName: 'Johnson',
  phoneNumber: '+2348012345678',
  dateOfBirth: '1990-05-15',
  lgaId: 'ibadan_north',
  lgaName: 'Ibadan North',
  source: 'enumerator',
  consentMarketplace: true,
  consentEnriched: false,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  submissions: [],
  fraudSummary: null,
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('RespondentController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('getRespondentDetail', () => {
    it('returns 200 with full PII for super_admin', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'super_admin' } }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: mockDetailResponse });
      expect(mockNext).not.toHaveBeenCalled();
      expect(mockGetRespondentDetail).toHaveBeenCalledWith(
        TEST_RESPONDENT_ID,
        'super_admin',
        TEST_USER_ID,
      );
    });

    it('returns 200 with full PII for verification_assessor', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'verification_assessor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: mockDetailResponse });
    });

    it('returns 200 with full PII for government_official', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'government_official' } }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: mockDetailResponse });
    });

    it('returns 200 with stripped PII for supervisor (in-scope LGA)', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const supervisorResponse = {
        ...mockDetailResponse,
        nin: null,
        firstName: null,
        lastName: null,
        phoneNumber: null,
        dateOfBirth: null,
      };
      mockGetRespondentDetail.mockResolvedValue(supervisorResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'supervisor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: supervisorResponse });
    });

    it('returns 403 for supervisor (out-of-scope LGA) via service', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockRejectedValue(
        Object.assign(new Error('Respondent not in your team scope'), {
          name: 'AppError',
          code: 'FORBIDDEN',
          statusCode: 403,
        }),
      );

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'supervisor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Respondent not in your team scope' }),
      );
    });

    it('passes enumerator role through — RBAC authorize() middleware is the 403 guard', async () => {
      // Note: 403 for unauthorized roles (enumerator, data_entry_clerk, public_user) is enforced
      // by the authorize() middleware in respondent.routes.ts, not by the controller.
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'enumerator' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetRespondentDetail).toHaveBeenCalledWith(
        TEST_RESPONDENT_ID,
        'enumerator',
        TEST_USER_ID,
      );
    });

    it('passes data_entry_clerk role through — RBAC authorize() middleware is the 403 guard', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'data_entry_clerk' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetRespondentDetail).toHaveBeenCalledWith(
        TEST_RESPONDENT_ID,
        'data_entry_clerk',
        TEST_USER_ID,
      );
    });

    it('passes public_user role through — RBAC authorize() middleware is the 403 guard', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'public_user' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetRespondentDetail).toHaveBeenCalledWith(
        TEST_RESPONDENT_ID,
        'public_user',
        TEST_USER_ID,
      );
    });

    it('returns 404 for non-existent respondent', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockRejectedValue(
        Object.assign(new Error('Respondent not found'), {
          name: 'AppError',
          code: 'NOT_FOUND',
          statusCode: 404,
        }),
      );

      await RespondentController.getRespondentDetail(
        makeReq(),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Respondent not found' }),
      );
    });

    it('returns 400 for invalid UUID format', async () => {
      const { mockRes, mockNext } = makeMocks();

      await RespondentController.getRespondentDetail(
        makeReq({ params: { id: 'not-a-uuid' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Invalid respondent ID format' }),
      );
      expect(mockGetRespondentDetail).not.toHaveBeenCalled();
    });

    it('writes audit log for PII-authorized roles (super_admin)', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'super_admin' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.view_record',
        'respondents',
        TEST_RESPONDENT_ID,
        { lgaId: 'ibadan_north', source: 'enumerator' },
      );
    });

    it('writes audit log for verification_assessor', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'verification_assessor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledTimes(1);
    });

    it('writes audit log for government_official', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'government_official' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.view_record',
        'respondents',
        TEST_RESPONDENT_ID,
        { lgaId: 'ibadan_north', source: 'enumerator' },
      );
    });

    it('does NOT write audit log for supervisor (no PII access)', async () => {
      const { mockRes, mockNext } = makeMocks();
      const supervisorResponse = {
        ...mockDetailResponse,
        nin: null, firstName: null, lastName: null, phoneNumber: null, dateOfBirth: null,
      };
      mockGetRespondentDetail.mockResolvedValue(supervisorResponse);

      await RespondentController.getRespondentDetail(
        makeReq({ user: { sub: TEST_USER_ID, role: 'supervisor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).not.toHaveBeenCalled();
    });

    it('includes submission history in response', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      const responseWithSubmissions = {
        ...mockDetailResponse,
        submissions: [{
          id: '018e5f2a-1234-7890-abcd-333333333333',
          submittedAt: '2026-01-20T14:30:00.000Z',
          formName: 'OSLSR Labour Survey',
          source: 'enumerator',
          enumeratorName: 'Bola Ige',
          processed: true,
          processingError: null,
          fraudDetectionId: '018e5f2a-1234-7890-abcd-555555555555',
          fraudSeverity: 'medium',
          fraudTotalScore: 3.5,
          fraudResolution: null,
        }],
      };
      mockGetRespondentDetail.mockResolvedValue(responseWithSubmissions);

      await RespondentController.getRespondentDetail(
        makeReq(),
        mockRes as Response,
        mockNext,
      );

      const responseData = jsonMock.mock.calls[0][0].data;
      expect(responseData.submissions).toHaveLength(1);
      expect(responseData.submissions[0].formName).toBe('OSLSR Labour Survey');
    });

    it('handles empty submission history', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetRespondentDetail.mockResolvedValue(mockDetailResponse);

      await RespondentController.getRespondentDetail(
        makeReq(),
        mockRes as Response,
        mockNext,
      );

      const responseData = jsonMock.mock.calls[0][0].data;
      expect(responseData.submissions).toHaveLength(0);
    });

    it('returns 401 when user is not authenticated', async () => {
      const { mockRes, mockNext } = makeMocks();

      await RespondentController.getRespondentDetail(
        makeReq({ user: undefined }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Authentication required' }),
      );
    });
  });
});
