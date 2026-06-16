import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockGetFilteredCount = vi.fn();
const mockGetRespondentExportData = vi.fn();
const mockGetSubmissionExportData = vi.fn();
const mockGetSubmissionFilteredCount = vi.fn();
const mockGetUnifiedExportData = vi.fn();
const mockGenerateCsvExport = vi.fn();
const mockGeneratePdfReport = vi.fn();
const mockLogPiiAccess = vi.fn();
const mockGetFormSchemaById = vi.fn();
const mockListForms = vi.fn();
const mockLoggerWarn = vi.fn();

vi.mock('pino', () => ({
  default: () => ({ warn: mockLoggerWarn, info: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../services/export-query.service.js', () => ({
  ExportQueryService: {
    getFilteredCount: (...args: unknown[]) => mockGetFilteredCount(...args),
    getRespondentExportData: (...args: unknown[]) => mockGetRespondentExportData(...args),
    getSubmissionExportData: (...args: unknown[]) => mockGetSubmissionExportData(...args),
    getSubmissionFilteredCount: (...args: unknown[]) => mockGetSubmissionFilteredCount(...args),
    getUnifiedExportData: (...args: unknown[]) => mockGetUnifiedExportData(...args),
  },
  SUBMISSION_METADATA_COLUMNS: [
    { key: 'nin', header: 'NIN', width: 90 },
    { key: 'surname', header: 'Surname', width: 80 },
  ],
  UNIFIED_METADATA_COLUMNS: [
    { key: 'referenceCode', header: 'Reference Code', width: 90 },
    { key: 'dataStatus', header: 'Data Status', width: 70 },
    { key: 'nin', header: 'NIN', width: 90 },
  ],
  buildColumnsFromFormSchema: () => [
    { key: 'employment_status', header: 'Employment Status', width: 80 },
  ],
  buildChoiceMaps: () => new Map(),
  flattenRawDataRow: (rawData: Record<string, unknown>) => ({
    employment_status: String(rawData.employment_status ?? ''),
  }),
}));

vi.mock('../../services/questionnaire.service.js', () => ({
  QuestionnaireService: {
    getFormSchemaById: (...args: unknown[]) => mockGetFormSchemaById(...args),
    listForms: (...args: unknown[]) => mockListForms(...args),
  },
}));

vi.mock('../../services/export.service.js', () => ({
  ExportService: {
    generateCsvExport: (...args: unknown[]) => mockGenerateCsvExport(...args),
    generatePdfReport: (...args: unknown[]) => mockGeneratePdfReport(...args),
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
const { ExportController } = await import('../export.controller.js');

// ── Test Helpers ─────────────────────────────────────────────────────

const TEST_USER_ID = '018e5f2a-1234-7890-abcd-222222222222';

function makeMocks() {
  const jsonMock = vi.fn();
  const statusMock = vi.fn().mockReturnThis();
  const setMock = vi.fn();
  const sendMock = vi.fn();
  const mockRes: Partial<Response> = {
    json: jsonMock,
    status: statusMock,
    set: setMock,
    send: sendMock,
  };
  const mockNext: NextFunction = vi.fn();
  return { jsonMock, statusMock, setMock, sendMock, mockRes, mockNext };
}

function makeReq(overrides: Record<string, unknown> = {}): Request {
  return {
    query: { format: 'csv' },
    params: {},
    body: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    user: { sub: TEST_USER_ID, role: 'government_official' },
    get: (h: string) => h === 'user-agent' ? 'test-agent' : undefined,
    socket: { remoteAddress: '127.0.0.1' },
    ...overrides,
  } as unknown as Request;
}

const mockExportData = [
  {
    firstName: 'Adewale',
    lastName: 'Johnson',
    nin: '61961438053',
    phoneNumber: '+2348012345678',
    dateOfBirth: '1990-05-15',
    lgaName: 'Ibadan North',
    source: 'enumerator',
    registeredAt: '2026-01-15T10:00:00.000Z',
    fraudSeverity: 'medium',
    verificationStatus: 'confirmed_fraud',
  },
];

// ── Tests ─────────────────────────────────────────────────────────────

describe('ExportController', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetFilteredCount.mockResolvedValue(1);
    mockGetRespondentExportData.mockResolvedValue({ data: mockExportData, totalCount: 1 });
    mockGenerateCsvExport.mockResolvedValue(Buffer.from('csv-data'));
    mockGeneratePdfReport.mockResolvedValue(Buffer.from('pdf-data'));
  });

  describe('exportRespondents', () => {
    it('CSV export returns correct Content-Type and Content-Disposition', async () => {
      const { setMock, sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' } }),
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        }),
      );
      expect(setMock.mock.calls[0][0]['Content-Disposition']).toMatch(/^attachment; filename="oslsr-export-\d{4}-\d{2}-\d{2}\.csv"$/);
      expect(sendMock).toHaveBeenCalledWith(Buffer.from('csv-data'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('PDF export returns correct headers', async () => {
      const { setMock, sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'pdf' } }),
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'application/pdf',
          'Cache-Control': 'no-store',
          'Pragma': 'no-cache',
        }),
      );
      expect(setMock.mock.calls[0][0]['Content-Disposition']).toMatch(/^attachment; filename="oslsr-export-\d{4}-\d{2}-\d{2}\.pdf"$/);
      expect(sendMock).toHaveBeenCalledWith(Buffer.from('pdf-data'));
    });

    it('PDF rejects > 1000 rows with 400', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(1500);

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'pdf' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('PDF exports are limited to 1,000 records'),
          statusCode: 400,
        }),
      );
      expect(mockGeneratePdfReport).not.toHaveBeenCalled();
    });

    it('audit log written before response', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.export_csv',
        'respondents',
        null,
        expect.objectContaining({
          format: 'csv',
          recordCount: 1,
        }),
      );
    });

    it('audit log uses pdf action for PDF format', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'pdf' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.export_pdf',
        'respondents',
        null,
        expect.objectContaining({ format: 'pdf' }),
      );
    });

    it('200 for authorized role: government_official', async () => {
      const { sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' }, user: { sub: TEST_USER_ID, role: 'government_official' } }),
        mockRes as Response,
        mockNext,
      );

      expect(sendMock).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('200 for authorized role: super_admin', async () => {
      const { sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' }, user: { sub: TEST_USER_ID, role: 'super_admin' } }),
        mockRes as Response,
        mockNext,
      );

      expect(sendMock).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('200 for authorized role: verification_assessor', async () => {
      const { sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' }, user: { sub: TEST_USER_ID, role: 'verification_assessor' } }),
        mockRes as Response,
        mockNext,
      );

      expect(sendMock).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('filters applied to query', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({
          query: {
            format: 'csv',
            lgaId: 'ibadan-north',
            source: 'enumerator',
            severity: 'high',
          },
        }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetFilteredCount).toHaveBeenCalledWith(
        expect.objectContaining({
          lgaId: 'ibadan-north',
          source: 'enumerator',
          severity: 'high',
        }),
      );
      expect(mockGetRespondentExportData).toHaveBeenCalledWith(
        expect.objectContaining({
          lgaId: 'ibadan-north',
          source: 'enumerator',
          severity: 'high',
        }),
      );
    });

    it('empty result set returns empty CSV (not error)', async () => {
      const { sendMock, mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(0);
      mockGetRespondentExportData.mockResolvedValue({ data: [], totalCount: 0 });
      mockGenerateCsvExport.mockResolvedValue(Buffer.from('empty-csv'));

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' } }),
        mockRes as Response,
        mockNext,
      );

      expect(sendMock).toHaveBeenCalledWith(Buffer.from('empty-csv'));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('Cache-Control: no-store present in CSV response', async () => {
      const { setMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' } }),
        mockRes as Response,
        mockNext,
      );

      expect(setMock.mock.calls[0][0]['Cache-Control']).toBe('no-store');
      expect(setMock.mock.calls[0][0]['Pragma']).toBe('no-cache');
    });

    it('invalid format returns 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'xlsx' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        }),
      );
    });

    it('invalid filter values rejected by Zod', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', source: 'invalid_source' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        }),
      );
    });

    it('returns 401 when user is not authenticated', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv' }, user: undefined }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Authentication required' }),
      );
    });
  });

  describe('Export route authorization (AC#8)', () => {
    // Tests the authorize middleware directly for unauthorized roles.
    // The authorize middleware is configured in export.routes.ts:
    // authorize(UserRole.GOVERNMENT_OFFICIAL, UserRole.SUPER_ADMIN, UserRole.VERIFICATION_ASSESSOR)

    it.each([
      ['enumerator'],
      ['supervisor'],
      ['data_entry_clerk'],
      ['public_user'],
    ])('403 for unauthorized role: %s', async (role) => {
      const { authorize } = await import('../../middleware/rbac.js');
      const exportAuth = authorize(
        'government_official' as any,
        'super_admin' as any,
        'verification_assessor' as any,
      );

      const { mockRes, mockNext } = makeMocks();
      const req = makeReq({ user: { sub: TEST_USER_ID, role } });

      exportAuth(req, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }),
      );
    });
  });

  describe('getExportPreviewCount', () => {
    it('returns count for valid filters', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(42);

      await ExportController.getExportPreviewCount(
        makeReq({ query: { lgaId: 'ibadan-north' } }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 42 } });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('returns count with no filters', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(500);

      await ExportController.getExportPreviewCount(
        makeReq({ query: {} }),
        mockRes as Response,
        mockNext,
      );

      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 500 } });
    });

    it('returns 401 when user is not authenticated', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.getExportPreviewCount(
        makeReq({ query: {}, user: undefined }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Authentication required' }),
      );
    });

    it('rejects invalid filter values with 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.getExportPreviewCount(
        makeReq({ query: { source: 'invalid_source' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        }),
      );
    });

    it('rejects invalid dateFrom format with 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.getExportPreviewCount(
        makeReq({ query: { dateFrom: 'not-a-date' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
        }),
      );
    });

    it('uses getSubmissionFilteredCount for full mode with formId', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetSubmissionFilteredCount.mockResolvedValue(15);

      await ExportController.getExportPreviewCount(
        makeReq({ query: { exportType: 'full', formId: '018e5f2a-1234-7890-abcd-333333333333' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetSubmissionFilteredCount).toHaveBeenCalledWith(
        expect.objectContaining({ formId: '018e5f2a-1234-7890-abcd-333333333333' }),
      );
      expect(mockGetFilteredCount).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 15 } });
    });

    it('uses getFilteredCount for summary mode (default)', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(42);

      await ExportController.getExportPreviewCount(
        makeReq({ query: {} }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetFilteredCount).toHaveBeenCalled();
      expect(mockGetSubmissionFilteredCount).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 42 } });
    });
  });

  describe('Full Response Export Mode', () => {
    const VALID_FORM_ID = '018e5f2a-1234-7890-abcd-333333333333';
    const mockFormSchema = {
      id: 'test-form',
      title: 'Test',
      version: '1.0.0',
      status: 'published' as const,
      createdAt: '2026-01-01',
      sections: [],
      choiceLists: {},
    };

    beforeEach(() => {
      mockGetFormSchemaById.mockResolvedValue(mockFormSchema);
      mockGetSubmissionFilteredCount.mockResolvedValue(1);
      mockGetSubmissionExportData.mockResolvedValue({
        data: [{
          nin: '12345678901',
          surname: 'Test',
          firstName: 'User',
          lgaName: 'Ibadan',
          source: 'enumerator',
          submissionDate: '2026-01-15',
          enumeratorName: 'Jane Doe',
          completionTimeSeconds: '120',
          gpsLatitude: '7.38',
          gpsLongitude: '3.95',
          fraudScore: '10.0',
          fraudSeverity: 'low',
          verificationStatus: '',
          rawData: { employment_status: 'employed' },
        }],
        totalCount: 1,
      });
    });

    it('full response CSV export returns correct headers', async () => {
      const { setMock, sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'full', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          'Content-Type': 'text/csv; charset=utf-8',
        }),
      );
      expect(setMock.mock.calls[0][0]['Content-Disposition']).toMatch(/oslsr-full-export/);
      expect(sendMock).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('full response with PDF format returns 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'pdf', exportType: 'full', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'Full Response export only supports CSV format',
        }),
      );
    });

    it('full response without formId returns 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'full' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: 'formId is required for Full Response export',
        }),
      );
    });

    it('full response with non-existent formId returns 404', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetFormSchemaById.mockResolvedValue(null);

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'full', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'FORM_NOT_FOUND',
        }),
      );
    });

    it('audit log includes exportType and formId', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'full', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.export_csv',
        'submissions',
        null,
        expect.objectContaining({
          exportType: 'full',
          formId: VALID_FORM_ID,
        }),
      );
    });

    it('calls getSubmissionExportData (not getRespondentExportData) for full mode', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'full', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetSubmissionExportData).toHaveBeenCalledWith(
        expect.objectContaining({ formId: VALID_FORM_ID }),
      );
      expect(mockGetRespondentExportData).not.toHaveBeenCalled();
    });
  });

  describe('Unified Export Mode (Story 9-59)', () => {
    const VALID_FORM_ID = '018e5f2a-1234-7890-abcd-444444444444';
    const mockFormSchema = {
      id: 'test-form',
      title: 'Test',
      version: '1.0.0',
      status: 'published' as const,
      createdAt: '2026-01-01',
      sections: [],
      choiceLists: {},
    };

    const mockUnifiedRows = [
      {
        referenceCode: 'OSL-2026-ABC123',
        nin: '12345678901',
        firstName: 'User',
        lastName: 'Completed',
        dateOfBirth: '1990-01-01',
        phoneNumber: '+2348012345678',
        lgaName: 'Ibadan',
        source: 'public',
        status: 'active',
        dataStatus: 'completed',
        consentMarketplace: 'Yes',
        consentEnriched: 'No',
        registeredAt: '2026-05-01',
        submissionDate: '2026-05-02',
        totalSubmissions: '1',
        gpsLatitude: '7.38',
        gpsLongitude: '3.95',
        fraudScore: '',
        fraudSeverity: 'clean',
        verificationStatus: '',
        hasGuardian: 'No',
        questionnaireDataLost: 'No',
        deferReasonNin: '',
        rawData: { employment_status: 'employed' },
      },
      {
        referenceCode: 'OSL-2026-XYZ789',
        nin: '',
        firstName: 'User',
        lastName: 'DataLost',
        dateOfBirth: '',
        phoneNumber: '+2348099999999',
        lgaName: 'Ibadan',
        source: 'public',
        status: 'active',
        dataStatus: 'data_lost',
        consentMarketplace: 'No',
        consentEnriched: 'No',
        registeredAt: '2026-05-15',
        submissionDate: '',
        totalSubmissions: '0',
        gpsLatitude: '',
        gpsLongitude: '',
        fraudScore: '',
        fraudSeverity: '',
        verificationStatus: '',
        hasGuardian: 'No',
        questionnaireDataLost: 'Yes',
        deferReasonNin: '',
        rawData: {},
      },
    ];

    beforeEach(() => {
      mockGetFormSchemaById.mockResolvedValue(mockFormSchema);
      mockGetFilteredCount.mockResolvedValue(2);
      mockGetUnifiedExportData.mockResolvedValue({ data: mockUnifiedRows, totalCount: 2 });
    });

    it('unified CSV export returns the oslsr-unified-export filename', async () => {
      const { setMock, sendMock, mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ 'Content-Type': 'text/csv; charset=utf-8' }),
      );
      expect(setMock.mock.calls[0][0]['Content-Disposition']).toMatch(/oslsr-unified-export-\d{4}-\d{2}-\d{2}\.csv/);
      expect(sendMock).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('calls getUnifiedExportData + getFilteredCount (respondent count), not the submission queries', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetUnifiedExportData).toHaveBeenCalled();
      expect(mockGetFilteredCount).toHaveBeenCalled();
      expect(mockGetSubmissionExportData).not.toHaveBeenCalled();
      expect(mockGetRespondentExportData).not.toHaveBeenCalled();
    });

    it('unified with PDF format returns 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'pdf', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400, message: 'Unified export only supports CSV format' }),
      );
    });

    it('unified without formId returns 400', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified' } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('formId is required for Unified export'),
        }),
      );
    });

    it('unified with non-existent formId returns 404', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetFormSchemaById.mockResolvedValue(null);

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, code: 'FORM_NOT_FOUND' }),
      );
    });

    it('audit logs against respondents with exportType=unified', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockLogPiiAccess).toHaveBeenCalledWith(
        expect.anything(),
        'pii.export_csv',
        'respondents',
        null,
        expect.objectContaining({ exportType: 'unified', formId: VALID_FORM_ID, recordCount: 2 }),
      );
    });

    it('passes all respondent rows (incl. answer-less data_lost) to the CSV generator', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      const [rows] = mockGenerateCsvExport.mock.calls[0];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ dataStatus: 'completed', referenceCode: 'OSL-2026-ABC123' });
      expect(rows[1]).toMatchObject({ dataStatus: 'data_lost', referenceCode: 'OSL-2026-XYZ789' });
      // rawData must NOT leak into the flattened CSV row (it is destructured out)
      expect(rows[0]).not.toHaveProperty('rawData');
    });

    it('preview count for unified mode uses getFilteredCount (respondents), not submissions', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(139);

      await ExportController.getExportPreviewCount(
        makeReq({ query: { exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockGetFilteredCount).toHaveBeenCalled();
      expect(mockGetSubmissionFilteredCount).not.toHaveBeenCalled();
      expect(jsonMock).toHaveBeenCalledWith({ data: { count: 139 } });
    });

    it('rejects a unified export above the row ceiling with 400 (review M3)', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetFilteredCount.mockResolvedValue(50001);

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 400,
          message: expect.stringContaining('Unified export is limited to'),
        }),
      );
      expect(mockGetUnifiedExportData).not.toHaveBeenCalled();
    });

    it('warns (structured) when answers have keys absent from the chosen schema (review M1)', async () => {
      const { mockRes, mockNext } = makeMocks();
      // Schema (mocked buildColumnsFromFormSchema) only knows `employment_status`.
      // `legacy_only_field` is not a schema question nor a canonical-group variant
      // → it will be omitted from the CSV, which must be surfaced via a warning.
      mockGetUnifiedExportData.mockResolvedValue({
        data: [
          { ...mockUnifiedRows[0], rawData: { employment_status: 'employed', legacy_only_field: 'orphan' } },
        ],
        totalCount: 1,
      });

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'export.unified_unmapped_answer_keys',
          droppedKeys: expect.arrayContaining(['legacy_only_field']),
          rowsAffected: 1,
        }),
        expect.any(String),
      );
    });

    it('does NOT warn when all answer keys map to schema columns (review M1)', async () => {
      const { mockRes, mockNext } = makeMocks();
      mockGetUnifiedExportData.mockResolvedValue({
        data: [{ ...mockUnifiedRows[0], rawData: { employment_status: 'employed' } }],
        totalCount: 1,
      });

      await ExportController.exportRespondents(
        makeReq({ query: { format: 'csv', exportType: 'unified', formId: VALID_FORM_ID } }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).not.toHaveBeenCalled();
      expect(mockLoggerWarn).not.toHaveBeenCalled();
    });
  });

  describe('getPublishedForms', () => {
    it('returns published forms list', async () => {
      const { jsonMock, mockRes, mockNext } = makeMocks();
      mockListForms.mockResolvedValue({
        data: [
          { id: 'form-1', title: 'OSLSR Master v3', formId: 'oslsr_master_v3', version: '1.0.0' },
        ],
        meta: { total: 1, page: 1, pageSize: 10, totalPages: 1 },
      });

      await ExportController.getPublishedForms(
        makeReq({ query: {} }),
        mockRes as Response,
        mockNext,
      );

      expect(mockListForms).toHaveBeenCalledWith({ status: 'published', pageSize: 200 });
      expect(jsonMock).toHaveBeenCalledWith({
        data: [
          { id: 'form-1', title: 'OSLSR Master v3', formId: 'oslsr_master_v3', version: '1.0.0' },
        ],
      });
    });

    it('returns 401 when not authenticated', async () => {
      const { mockRes, mockNext } = makeMocks();

      await ExportController.getPublishedForms(
        makeReq({ query: {}, user: undefined }),
        mockRes as Response,
        mockNext,
      );

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Authentication required' }),
      );
    });
  });
});
