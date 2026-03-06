import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExecute = vi.fn();

vi.mock('../../db/index.js', () => ({
  db: { execute: (...args: any[]) => mockExecute(...args) },
}));

import { ViewAsDataService } from '../view-as-data.service.js';

function makeRows(rows: Record<string, any>[]) {
  return { rows };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ViewAsDataService', () => {
  describe('getEnumeratorSummary', () => {
    it('returns submission counts scoped to LGA via respondents join', async () => {
      mockExecute
        .mockResolvedValueOnce(makeRows([{ total: '5' }]))
        .mockResolvedValueOnce(makeRows([{ today: '2' }]));

      const result = await ViewAsDataService.getDashboardSummary('enumerator', 'lga-abc');

      expect(result.role).toBe('enumerator');
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]).toEqual({ label: 'Total Submissions', value: 5, description: 'All submissions in this LGA' });
      expect(result.cards[1]).toEqual({ label: 'Today', value: 2, description: 'Submissions today' });

      // Verify queries JOIN through respondents (not direct lga_id on submissions)
      const totalQuery = mockExecute.mock.calls[0][0];
      const todayQuery = mockExecute.mock.calls[1][0];
      const totalSql = totalQuery.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(totalQuery);
      const todaySql = todayQuery.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(todayQuery);

      // Positive: must JOIN through respondents
      expect(totalSql).toContain('JOIN respondents');
      expect(todaySql).toContain('JOIN respondents');
      // Negative: must NOT query lga_id directly on submissions
      expect(totalSql).not.toContain('submissions WHERE lga_id');
      expect(todaySql).not.toContain('submissions WHERE lga_id');
    });
  });

  describe('getSupervisorSummary', () => {
    it('returns team count and submission count with correct joins', async () => {
      mockExecute
        .mockResolvedValueOnce(makeRows([{ total: '8' }]))
        .mockResolvedValueOnce(makeRows([{ total: '42' }]));

      const result = await ViewAsDataService.getDashboardSummary('supervisor', 'lga-xyz');

      expect(result.role).toBe('supervisor');
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]).toEqual({ label: 'Team Members', value: 8, description: 'Active enumerators in this LGA' });
      expect(result.cards[1]).toEqual({ label: 'Team Submissions', value: 42, description: 'Total submissions for this LGA' });

      // Positive: submission query must JOIN through respondents
      const submissionQuery = mockExecute.mock.calls[1][0];
      const submissionSql = submissionQuery.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(submissionQuery);
      expect(submissionSql).toContain('JOIN respondents');
      // Negative: must NOT query lga_id directly on submissions
      expect(submissionSql).not.toContain('submissions WHERE lga_id');
    });
  });

  describe('getClerkSummary', () => {
    it('uses correct source value "clerk" (not "data_entry_clerk")', async () => {
      mockExecute.mockResolvedValueOnce(makeRows([{ total: '15' }]));

      const result = await ViewAsDataService.getDashboardSummary('data_entry_clerk', null);

      expect(result.role).toBe('data_entry_clerk');
      expect(result.cards).toHaveLength(1);
      expect(result.cards[0]).toEqual({ label: 'Total Entries', value: 15, description: 'All data entry submissions' });

      // Verify query uses correct source enum value
      const query = mockExecute.mock.calls[0][0];
      const querySql = query.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(query);
      expect(querySql).toContain("source = ");
      expect(querySql).not.toContain("source = 'data_entry_clerk'");
    });
  });

  describe('getAssessorSummary', () => {
    it('uses resolution IS NULL instead of non-existent status column', async () => {
      mockExecute
        .mockResolvedValueOnce(makeRows([{ total: '10' }]))
        .mockResolvedValueOnce(makeRows([{ total: '25' }]));

      const result = await ViewAsDataService.getDashboardSummary('verification_assessor', null);

      expect(result.role).toBe('verification_assessor');
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]).toEqual({ label: 'Pending Reviews', value: 10, description: 'Awaiting assessment' });
      expect(result.cards[1]).toEqual({ label: 'Reviewed', value: 25, description: 'Completed assessments' });

      // Positive: must use resolution column
      const pendingQuery = mockExecute.mock.calls[0][0];
      const reviewedQuery = mockExecute.mock.calls[1][0];
      const pendingSql = pendingQuery.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(pendingQuery);
      const reviewedSql = reviewedQuery.queryChunks?.map((c: any) => c.value?.[0] ?? c).join('') ?? String(reviewedQuery);

      expect(pendingSql).toContain('resolution IS NULL');
      expect(reviewedSql).toContain('resolution IS NOT NULL');
      // Negative: must NOT reference non-existent "status" column
      expect(pendingSql).not.toContain("status = 'pending'");
      expect(reviewedSql).not.toContain("status != 'pending'");
    });
  });

  describe('getOfficialSummary', () => {
    it('returns respondent counts (no bugs, verify baseline)', async () => {
      mockExecute
        .mockResolvedValueOnce(makeRows([{ total: '100' }]))
        .mockResolvedValueOnce(makeRows([{ today: '3' }]));

      const result = await ViewAsDataService.getDashboardSummary('government_official', null);

      expect(result.role).toBe('government_official');
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0]).toEqual({ label: 'Total Respondents', value: 100, description: 'Registry total' });
      expect(result.cards[1]).toEqual({ label: 'Today Registrations', value: 3, description: 'New today' });
    });
  });

  describe('getDashboardSummary', () => {
    it('returns empty cards for unknown role', async () => {
      const result = await ViewAsDataService.getDashboardSummary('unknown_role', null);

      expect(result.role).toBe('unknown_role');
      expect(result.cards).toEqual([]);
      expect(result.recentActivity).toEqual([]);
    });

    it('returns empty cards on db error (graceful degradation)', async () => {
      mockExecute.mockRejectedValue(new Error('DB connection failed'));

      const result = await ViewAsDataService.getDashboardSummary('enumerator', 'lga-123');

      expect(result.role).toBe('enumerator');
      expect(result.cards).toEqual([]);
    });

    it('returns empty cards when field role has null lgaId', async () => {
      const enumeratorResult = await ViewAsDataService.getDashboardSummary('enumerator', null);
      expect(enumeratorResult.cards).toEqual([]);

      const supervisorResult = await ViewAsDataService.getDashboardSummary('supervisor', null);
      expect(supervisorResult.cards).toEqual([]);

      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
