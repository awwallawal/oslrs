import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────
const {
  mockSelect,
  mockFrom,
  mockLeftJoin,
  mockWhere,
  mockOrderBy,
  mockLimit,
  mockGetEnumeratorIds,
  mockExecute,
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockLeftJoin: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockGetEnumeratorIds: vi.fn(),
  mockExecute: vi.fn(),
}));

// Chain builder that resolves to a configurable result
let queryResult: any[] = [];

function createChain() {
  const chain: any = {
    from: (...args: any[]) => { mockFrom(...args); return chain; },
    leftJoin: (...args: any[]) => { mockLeftJoin(...args); return chain; },
    where: (...args: any[]) => { mockWhere(...args); return chain; },
    orderBy: (...args: any[]) => { mockOrderBy(...args); return chain; },
    limit: (...args: any[]) => { mockLimit(...args); return chain; },
    then: (resolve: any) => resolve(queryResult),
    [Symbol.asyncIterator]: undefined,
  };
  chain[Symbol.toStringTag] = 'Promise';
  return chain;
}

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: any[]) => {
      mockSelect(...args);
      return createChain();
    },
    execute: (...args: any[]) => mockExecute(...args),
  },
}));

vi.mock('../team-assignment.service.js', () => ({
  TeamAssignmentService: {
    getEnumeratorIdsForSupervisor: (...args: any[]) => mockGetEnumeratorIds(...args),
  },
}));

import { RespondentService } from '../respondent.service.js';

// ── Test fixtures ────────────────────────────────────────────────────
const RESPONDENT_ID = '018e5f2a-1234-7890-abcd-111111111111';
const USER_ID = '018e5f2a-1234-7890-abcd-222222222222';

const mockRespondent = {
  id: RESPONDENT_ID,
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
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
};

const mockSubmission = {
  id: '018e5f2a-1234-7890-abcd-333333333333',
  submittedAt: new Date('2026-01-20T14:30:00Z'),
  source: 'enumerator',
  processed: true,
  processingError: null,
  enumeratorName: 'Bola Ige',
  enumeratorId: '018e5f2a-1234-7890-abcd-444444444444',
  formName: 'OSLSR Labour Survey',
  fraudDetectionId: '018e5f2a-1234-7890-abcd-555555555555',
  fraudSeverity: 'medium',
  fraudTotalScore: '3.50',
  fraudResolution: null,
};

describe('RespondentService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    queryResult = [];
  });

  describe('getRespondentDetail', () => {
    it('returns full PII for authorized roles (super_admin)', async () => {
      // First call: respondent query
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else if (callCount === 2) {
          // Submissions query
          queryResult = [mockSubmission];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'super_admin',
        USER_ID,
      );

      expect(result.id).toBe(RESPONDENT_ID);
      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBe('Adewale');
      expect(result.lastName).toBe('Johnson');
      expect(result.phoneNumber).toBe('+2348012345678');
      expect(result.dateOfBirth).toBe('1990-05-15');
      expect(result.lgaName).toBe('Ibadan North');
      expect(result.source).toBe('enumerator');
    });

    it('strips PII for supervisor role', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          // Full submissions query (includes enumeratorId for scope check)
          queryResult = [mockSubmission];
        }
        return createChain();
      });
      mockGetEnumeratorIds.mockResolvedValue(['018e5f2a-1234-7890-abcd-444444444444']);

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'supervisor',
        USER_ID,
      );

      expect(result.nin).toBeNull();
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
      expect(result.phoneNumber).toBeNull();
      expect(result.dateOfBirth).toBeNull();
      // Operational fields should still be present
      expect(result.lgaId).toBe('ibadan_north');
      expect(result.lgaName).toBe('Ibadan North');
      expect(result.source).toBe('enumerator');
    });

    it('includes submission history with fraud context', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          queryResult = [mockSubmission];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'super_admin',
        USER_ID,
      );

      expect(result.submissions).toHaveLength(1);
      expect(result.submissions[0].formName).toBe('OSLSR Labour Survey');
      expect(result.submissions[0].enumeratorName).toBe('Bola Ige');
      expect(result.submissions[0].fraudSeverity).toBe('medium');
      expect(result.submissions[0].fraudTotalScore).toBe(3.5);
      expect(result.submissions[0].processed).toBe(true);
    });

    it('returns 404 for non-existent respondent', async () => {
      mockSelect.mockImplementation(() => {
        queryResult = [];
        return createChain();
      });

      await expect(
        RespondentService.getRespondentDetail(RESPONDENT_ID, 'super_admin', USER_ID),
      ).rejects.toThrow('Respondent not found');
    });

    it('enforces supervisor LGA scope — rejects out-of-scope', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          // Full submissions query — enumerator not in supervisor's team
          queryResult = [{ ...mockSubmission, enumeratorId: 'other-enumerator-id' }];
        }
        return createChain();
      });
      mockGetEnumeratorIds.mockResolvedValue(['different-enumerator-id']);

      await expect(
        RespondentService.getRespondentDetail(RESPONDENT_ID, 'supervisor', USER_ID),
      ).rejects.toThrow('Respondent not in your team scope');
    });

    it('handles respondent with no submissions', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          queryResult = [];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'super_admin',
        USER_ID,
      );

      expect(result.submissions).toHaveLength(0);
      expect(result.fraudSummary).toBeNull();
    });

    it('builds fraud summary with highest severity', async () => {
      const submission1 = { ...mockSubmission, fraudSeverity: 'low', fraudTotalScore: '1.50' };
      const submission2 = {
        ...mockSubmission,
        id: '018e5f2a-1234-7890-abcd-666666666666',
        fraudSeverity: 'high',
        fraudTotalScore: '7.50',
        fraudResolution: 'needs_investigation',
      };

      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          queryResult = [submission2, submission1];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'super_admin',
        USER_ID,
      );

      expect(result.fraudSummary).not.toBeNull();
      expect(result.fraudSummary!.highestSeverity).toBe('high');
      expect(result.fraudSummary!.flaggedSubmissionCount).toBe(2);
      expect(result.fraudSummary!.latestResolution).toBe('needs_investigation');
    });

    it('returns full PII for verification_assessor', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          queryResult = [];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'verification_assessor',
        USER_ID,
      );

      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBe('Adewale');
    });

    it('returns full PII for government_official', async () => {
      let callCount = 0;
      mockSelect.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          queryResult = [mockRespondent];
        } else {
          queryResult = [];
        }
        return createChain();
      });

      const result = await RespondentService.getRespondentDetail(
        RESPONDENT_ID,
        'government_official',
        USER_ID,
      );

      expect(result.nin).toBe('61961438053');
      expect(result.firstName).toBe('Adewale');
    });
  });

  // ── Story 5.5: listRespondents + getRespondentCount ───────────────

  describe('listRespondents', () => {
    const mockListRow = {
      id: RESPONDENT_ID,
      first_name: 'Adewale',
      last_name: 'Johnson',
      nin: '61961438053',
      phone_number: '+2348012345678',
      gender: 'male',
      lga_id: 'ibadan_north',
      lga_name: 'Ibadan North',
      source: 'enumerator',
      enumerator_id: '018e5f2a-1234-7890-abcd-444444444444',
      enumerator_name: 'Bola Ige',
      form_name: 'OSLSR Labour Survey',
      registered_at: '2026-01-15T10:00:00.000Z',
      fraud_severity: 'low',
      fraud_total_score: '2.50',
      verification_status: 'pending_review',
    };

    function setupExecute(dataRows: any[], countValue: number = 1) {
      let callCount = 0;
      mockExecute.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Data query
          return Promise.resolve({ rows: dataRows });
        } else {
          // Count query
          return Promise.resolve({ rows: [{ count: countValue }] });
        }
      });
    }

    it('returns paginated results with correct page size', async () => {
      setupExecute([mockListRow], 1);

      const result = await RespondentService.listRespondents(
        { pageSize: 20 },
        'super_admin',
        USER_ID,
      );

      expect(result.data).toHaveLength(1);
      expect(result.meta.pagination.pageSize).toBe(20);
      expect(result.meta.pagination.totalItems).toBe(1);
      expect(result.meta.pagination.hasNextPage).toBe(false);
    });

    it('returns PII fields for super_admin', async () => {
      setupExecute([mockListRow], 1);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data[0].firstName).toBe('Adewale');
      expect(result.data[0].lastName).toBe('Johnson');
      expect(result.data[0].nin).toBe('61961438053');
      expect(result.data[0].phoneNumber).toBe('+2348012345678');
    });

    it('strips PII for supervisor role', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['018e5f2a-1234-7890-abcd-444444444444']);
      setupExecute([mockListRow], 1);

      const result = await RespondentService.listRespondents({}, 'supervisor', USER_ID);

      expect(result.data[0].firstName).toBeNull();
      expect(result.data[0].lastName).toBeNull();
      expect(result.data[0].nin).toBeNull();
      expect(result.data[0].phoneNumber).toBeNull();
      // Operational fields still present
      expect(result.data[0].gender).toBe('male');
      expect(result.data[0].lgaName).toBe('Ibadan North');
    });

    it('returns empty page when supervisor has no team', async () => {
      mockGetEnumeratorIds.mockResolvedValue([]);

      const result = await RespondentService.listRespondents({}, 'supervisor', USER_ID);

      expect(result.data).toHaveLength(0);
      expect(result.meta.pagination.totalItems).toBe(0);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('detects hasNextPage when rows exceed pageSize', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        ...mockListRow,
        id: `id-${i}`,
        registered_at: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      }));
      setupExecute(rows, 50);

      const result = await RespondentService.listRespondents(
        { pageSize: 20 },
        'super_admin',
        USER_ID,
      );

      expect(result.data).toHaveLength(20);
      expect(result.meta.pagination.hasNextPage).toBe(true);
      expect(result.meta.pagination.nextCursor).not.toBeNull();
    });

    it('returns hasPreviousPage true when cursor is provided', async () => {
      setupExecute([mockListRow], 1);

      const result = await RespondentService.listRespondents(
        { cursor: '2026-01-10T00:00:00.000Z|some-id' },
        'super_admin',
        USER_ID,
      );

      expect(result.meta.pagination.hasPreviousPage).toBe(true);
    });

    it('throws validation error for malformed cursor', async () => {
      await expect(
        RespondentService.listRespondents(
          { cursor: 'invalid-no-pipe' },
          'super_admin',
          USER_ID,
        ),
      ).rejects.toThrow('Invalid cursor format');
    });

    it('throws validation error for cursor with invalid date', async () => {
      await expect(
        RespondentService.listRespondents(
          { cursor: 'not-a-date|some-id' },
          'super_admin',
          USER_ID,
        ),
      ).rejects.toThrow('Invalid cursor date');
    });

    it('maps verification_status correctly from row data', async () => {
      const rows = [
        { ...mockListRow, verification_status: 'auto_clean' },
        { ...mockListRow, id: 'id-2', verification_status: 'flagged' },
        { ...mockListRow, id: 'id-3', verification_status: 'verified' },
      ];
      setupExecute(rows, 3);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data[0].verificationStatus).toBe('auto_clean');
      expect(result.data[1].verificationStatus).toBe('flagged');
      expect(result.data[2].verificationStatus).toBe('verified');
    });

    it('extracts gender from row data', async () => {
      setupExecute([{ ...mockListRow, gender: 'female' }], 1);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data[0].gender).toBe('female');
    });

    it('handles empty result set', async () => {
      setupExecute([], 0);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data).toHaveLength(0);
      expect(result.meta.pagination.totalItems).toBe(0);
      expect(result.meta.pagination.hasNextPage).toBe(false);
      expect(result.meta.pagination.nextCursor).toBeNull();
    });

    it('parses fraud scores as floats', async () => {
      setupExecute([{ ...mockListRow, fraud_total_score: '15.75' }], 1);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data[0].fraudTotalScore).toBe(15.75);
    });

    it('handles null fraud_total_score', async () => {
      setupExecute([{ ...mockListRow, fraud_total_score: null, fraud_severity: null }], 1);

      const result = await RespondentService.listRespondents({}, 'super_admin', USER_ID);

      expect(result.data[0].fraudTotalScore).toBeNull();
      expect(result.data[0].fraudSeverity).toBeNull();
    });

    it('calls db.execute for data and count queries', async () => {
      setupExecute([mockListRow], 1);

      await RespondentService.listRespondents(
        { lgaId: 'ibadan_north', gender: 'male', source: 'enumerator' },
        'super_admin',
        USER_ID,
      );

      // Should call execute twice: data query + count query
      expect(mockExecute).toHaveBeenCalledTimes(2);
    });

    it('builds correct nextCursor format', async () => {
      const rows = Array.from({ length: 21 }, (_, i) => ({
        ...mockListRow,
        id: `id-${i}`,
        registered_at: `2026-01-${String(i + 1).padStart(2, '0')}T10:00:00.000Z`,
      }));
      setupExecute(rows, 50);

      const result = await RespondentService.listRespondents(
        { pageSize: 20 },
        'super_admin',
        USER_ID,
      );

      // Cursor = "registeredAt_ISO|id"
      expect(result.meta.pagination.nextCursor).toContain('|');
      expect(result.meta.pagination.nextCursor).toContain('2026-01-20');
      expect(result.meta.pagination.nextCursor).toContain('id-19');
    });
  });

  describe('getRespondentCount', () => {
    it('returns count from db', async () => {
      mockExecute.mockResolvedValue({ rows: [{ count: 42 }] });

      const count = await RespondentService.getRespondentCount({}, 'super_admin', USER_ID);

      expect(count).toBe(42);
    });

    it('returns 0 when supervisor has no team', async () => {
      mockGetEnumeratorIds.mockResolvedValue([]);

      const count = await RespondentService.getRespondentCount({}, 'supervisor', USER_ID);

      expect(count).toBe(0);
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('executes count query for supervisor with team', async () => {
      mockGetEnumeratorIds.mockResolvedValue(['enum-1']);
      mockExecute.mockResolvedValue({ rows: [{ count: 5 }] });

      const count = await RespondentService.getRespondentCount({}, 'supervisor', USER_ID);

      expect(count).toBe(5);
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });
  });
});
