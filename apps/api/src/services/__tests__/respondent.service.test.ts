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
} = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockFrom: vi.fn(),
  mockLeftJoin: vi.fn(),
  mockWhere: vi.fn(),
  mockOrderBy: vi.fn(),
  mockLimit: vi.fn(),
  mockGetEnumeratorIds: vi.fn(),
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
    vi.clearAllMocks();
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
});
