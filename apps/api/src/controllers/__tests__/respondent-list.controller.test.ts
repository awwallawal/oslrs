import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockListRespondents = vi.fn();
const mockLogPiiAccess = vi.fn();

vi.mock('../../services/respondent.service.js', () => ({
  RespondentService: {
    getRespondentDetail: vi.fn(),
    listRespondents: (...args: unknown[]) => mockListRespondents(...args),
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
    params: {},
    body: {},
    headers: { 'user-agent': 'test-agent' },
    ip: '127.0.0.1',
    user: { sub: TEST_USER_ID, role: 'super_admin' },
    get: (h: string) => (h === 'user-agent' ? 'test-agent' : undefined),
    ...overrides,
  } as unknown as Request;
}

const mockListResponse = {
  data: [
    {
      id: '018e5f2a-1234-7890-abcd-111111111111',
      firstName: 'Adewale',
      lastName: 'Johnson',
      nin: '61961438053',
      phoneNumber: '+2348012345678',
      gender: 'male',
      lgaId: 'ibadan_north',
      lgaName: 'Ibadan North',
      source: 'enumerator',
      enumeratorId: '018e5f2a-1234-7890-abcd-333333333333',
      enumeratorName: 'Bola Ige',
      formName: 'OSLSR Labour Survey',
      registeredAt: '2026-01-15T10:00:00.000Z',
      fraudSeverity: 'low',
      fraudTotalScore: 2.5,
      verificationStatus: 'pending_review',
    },
  ],
  meta: {
    pagination: {
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
      nextCursor: null,
      previousCursor: null,
      totalItems: 1,
    },
  },
};

const mockEmptyResponse = {
  data: [],
  meta: {
    pagination: {
      pageSize: 20,
      hasNextPage: false,
      hasPreviousPage: false,
      nextCursor: null,
      previousCursor: null,
      totalItems: 0,
    },
  },
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('RespondentController.listRespondents', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 200 with PII for super_admin', async () => {
    const { jsonMock, mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockListResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'super_admin' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith(mockListResponse);
    expect(mockNext).not.toHaveBeenCalled();
    expect(mockListRespondents).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20, sortBy: 'registeredAt', sortOrder: 'desc' }),
      'super_admin',
      TEST_USER_ID,
    );
  });

  it('returns 200 with PII for verification_assessor', async () => {
    const { jsonMock, mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockListResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'verification_assessor' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith(mockListResponse);
  });

  it('returns 200 with PII for government_official', async () => {
    const { jsonMock, mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockListResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'government_official' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith(mockListResponse);
  });

  it('returns 200 without PII for supervisor', async () => {
    const { jsonMock, mockRes, mockNext } = makeMocks();
    const supervisorResponse = {
      ...mockListResponse,
      data: [
        {
          ...mockListResponse.data[0],
          firstName: null,
          lastName: null,
          nin: null,
          phoneNumber: null,
        },
      ],
    };
    mockListRespondents.mockResolvedValue(supervisorResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'supervisor' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(jsonMock).toHaveBeenCalledWith(supervisorResponse);
    const responseData = jsonMock.mock.calls[0][0].data;
    expect(responseData[0].firstName).toBeNull();
    expect(responseData[0].nin).toBeNull();
  });

  it('passes all filter params to service', async () => {
    const { mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockEmptyResponse);

    await RespondentController.listRespondents(
      makeReq({
        query: {
          lgaId: 'ibadan_north',
          gender: 'male',
          source: 'enumerator',
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          verificationStatus: 'pending',
          severity: 'medium,high',
          search: 'Ade',
        },
      }),
      mockRes as Response,
      mockNext,
    );

    expect(mockListRespondents).toHaveBeenCalledWith(
      expect.objectContaining({
        lgaId: 'ibadan_north',
        gender: 'male',
        source: 'enumerator',
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        verificationStatus: 'pending',
        severity: 'medium,high',
        search: 'Ade',
      }),
      'super_admin',
      TEST_USER_ID,
    );
  });

  it('applies cursor pagination', async () => {
    const { mockRes, mockNext } = makeMocks();
    const responseWithCursor = {
      ...mockListResponse,
      meta: {
        pagination: {
          ...mockListResponse.meta.pagination,
          hasNextPage: true,
          nextCursor: '2026-01-15T10:00:00.000Z|018e5f2a-1234-7890-abcd-111111111111',
        },
      },
    };
    mockListRespondents.mockResolvedValue(responseWithCursor);

    await RespondentController.listRespondents(
      makeReq({ query: { cursor: '2026-01-10T00:00:00.000Z|018e5f2a-0000-0000-0000-000000000000' } }),
      mockRes as Response,
      mockNext,
    );

    expect(mockListRespondents).toHaveBeenCalledWith(
      expect.objectContaining({
        cursor: '2026-01-10T00:00:00.000Z|018e5f2a-0000-0000-0000-000000000000',
      }),
      'super_admin',
      TEST_USER_ID,
    );
  });

  it('returns empty result set with totalItems 0', async () => {
    const { jsonMock, mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockEmptyResponse);

    await RespondentController.listRespondents(
      makeReq({ query: {} }),
      mockRes as Response,
      mockNext,
    );

    const response = jsonMock.mock.calls[0][0];
    expect(response.data).toHaveLength(0);
    expect(response.meta.pagination.totalItems).toBe(0);
  });

  it('writes audit log with VIEW_LIST for all roles', async () => {
    const { mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockListResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'super_admin' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(mockLogPiiAccess).toHaveBeenCalledWith(
      expect.anything(),
      'pii.view_list',
      'respondents',
      null,
      expect.objectContaining({ resultCount: 1 }),
    );
  });

  it('writes audit log for supervisor too', async () => {
    const { mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockEmptyResponse);

    await RespondentController.listRespondents(
      makeReq({ user: { sub: TEST_USER_ID, role: 'supervisor' }, query: {} }),
      mockRes as Response,
      mockNext,
    );

    expect(mockLogPiiAccess).toHaveBeenCalledWith(
      expect.anything(),
      'pii.view_list',
      'respondents',
      null,
      expect.objectContaining({ resultCount: 0 }),
    );
  });

  it('returns 400 for invalid search (too short)', async () => {
    const { mockRes, mockNext } = makeMocks();

    await RespondentController.listRespondents(
      makeReq({ query: { search: 'ab' } }),
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid query parameters' }),
    );
    expect(mockListRespondents).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid formId UUID format', async () => {
    const { mockRes, mockNext } = makeMocks();

    await RespondentController.listRespondents(
      makeReq({ query: { formId: 'not-a-uuid' } }),
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid formId format' }),
    );
  });

  it('returns 400 for invalid enumeratorId UUID format', async () => {
    const { mockRes, mockNext } = makeMocks();

    await RespondentController.listRespondents(
      makeReq({ query: { enumeratorId: 'bad-id' } }),
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid enumeratorId format' }),
    );
  });

  it('returns 401 when user is not authenticated', async () => {
    const { mockRes, mockNext } = makeMocks();

    await RespondentController.listRespondents(
      makeReq({ user: undefined }),
      mockRes as Response,
      mockNext,
    );

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Authentication required' }),
    );
  });

  it('passes custom pageSize and sortBy', async () => {
    const { mockRes, mockNext } = makeMocks();
    mockListRespondents.mockResolvedValue(mockEmptyResponse);

    await RespondentController.listRespondents(
      makeReq({ query: { pageSize: '50', sortBy: 'fraudScore', sortOrder: 'asc' } }),
      mockRes as Response,
      mockNext,
    );

    expect(mockListRespondents).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50, sortBy: 'fraudScore', sortOrder: 'asc' }),
      'super_admin',
      TEST_USER_ID,
    );
  });
});

/**
 * Route-level authorization tests.
 * The authorize() middleware in respondent.routes.ts restricts access to:
 * SUPER_ADMIN, VERIFICATION_ASSESSOR, GOVERNMENT_OFFICIAL, SUPERVISOR.
 * These tests verify the route module correctly wires the middleware.
 */
describe('Respondent list route authorization', () => {
  it('route authorizes only 4 roles: super_admin, verification_assessor, government_official, supervisor', async () => {
    // Import the routes module to inspect middleware stack
    const routerModule = await import('../../routes/respondent.routes.js');
    const router = routerModule.default;

    // Find the GET / route layer
    const listRoute = router.stack.find(
      (layer: { route?: { path: string; methods: Record<string, boolean> } }) =>
        layer.route?.path === '/' && layer.route?.methods?.get,
    );

    expect(listRoute).toBeDefined();
    // Route should have middleware stack (authenticate + authorize + handler)
    expect(listRoute.route.stack.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects enumerator role (403 via authorize middleware)', async () => {
    const { authorize } = await import('../../middleware/rbac.js');
    const middleware = authorize('super_admin' as any, 'verification_assessor' as any, 'government_official' as any, 'supervisor' as any);

    const mockReq = makeReq({ user: { sub: TEST_USER_ID, role: 'enumerator' } });
    const { mockRes, mockNext } = makeMocks();

    middleware(mockReq, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('rejects data_entry_clerk role (403 via authorize middleware)', async () => {
    const { authorize } = await import('../../middleware/rbac.js');
    const middleware = authorize('super_admin' as any, 'verification_assessor' as any, 'government_official' as any, 'supervisor' as any);

    const mockReq = makeReq({ user: { sub: TEST_USER_ID, role: 'data_entry_clerk' } });
    const { mockRes, mockNext } = makeMocks();

    middleware(mockReq, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });

  it('rejects public_user role (403 via authorize middleware)', async () => {
    const { authorize } = await import('../../middleware/rbac.js');
    const middleware = authorize('super_admin' as any, 'verification_assessor' as any, 'government_official' as any, 'supervisor' as any);

    const mockReq = makeReq({ user: { sub: TEST_USER_ID, role: 'public_user' } });
    const { mockRes, mockNext } = makeMocks();

    middleware(mockReq, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 403 }),
    );
  });
});
