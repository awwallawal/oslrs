import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const { mockDbSelect, mockDbExecute } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbExecute: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    execute: (...args: any[]) => mockDbExecute(...args),
  },
}));

vi.mock('../../db/schema/respondents.js', () => ({
  respondents: {
    id: { name: 'id' },
    createdAt: { name: 'created_at' },
    lgaId: { name: 'lga_id' },
    source: { name: 'source' },
  },
}));

vi.mock('../../db/schema/submissions.js', () => ({
  submissions: {
    id: { name: 'id' },
    rawData: { name: 'raw_data' },
    respondentId: { name: 'respondent_id' },
  },
}));

vi.mock('../../db/schema/lgas.js', () => ({
  lgas: {
    id: { name: 'id' },
    code: { name: 'code' },
    name: { name: 'name' },
  },
}));

// ── Import SUT ──────────────────────────────────────────────────────

import { ReportService } from '../report.service.js';

// ── Chain builder ───────────────────────────────────────────────────

/**
 * Build a Drizzle-like chainable mock that resolves to the given result
 * when the chain is awaited. Every chaining method returns the same proxy.
 */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'where', 'groupBy', 'orderBy', 'limit', 'offset']) {
    chain[m] = () => chain;
  }
  // Make the chain thenable so that `await db.select(...).from(...)...` resolves
  chain.then = (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('ReportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getOverviewStats', () => {
    it('should return aggregated overview stats', async () => {
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            totalRespondents: '150',
            todayRegistrations: '5',
            yesterdayRegistrations: '8',
            lgasCovered: '12',
            enumeratorCount: '100',
            publicCount: '30',
            clerkCount: '20',
          },
        ]),
      );

      const result = await ReportService.getOverviewStats();

      expect(mockDbSelect).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        totalRespondents: 150,
        todayRegistrations: 5,
        yesterdayRegistrations: 8,
        lgasCovered: 12,
        sourceBreakdown: {
          enumerator: 100,
          public: 30,
          clerk: 20,
        },
      });
    });

    it('should return zeros when no respondents exist', async () => {
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          {
            totalRespondents: '0',
            todayRegistrations: '0',
            yesterdayRegistrations: '0',
            lgasCovered: '0',
            enumeratorCount: '0',
            publicCount: '0',
            clerkCount: '0',
          },
        ]),
      );

      const result = await ReportService.getOverviewStats();

      expect(result.totalRespondents).toBe(0);
      expect(result.todayRegistrations).toBe(0);
      expect(result.lgasCovered).toBe(0);
      expect(result.sourceBreakdown).toEqual({
        enumerator: 0,
        public: 0,
        clerk: 0,
      });
    });

    it('should handle empty result set gracefully', async () => {
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const result = await ReportService.getOverviewStats();

      expect(result.totalRespondents).toBe(0);
      expect(result.sourceBreakdown.enumerator).toBe(0);
    });
  });

  describe('getSkillsDistribution', () => {
    it('should return skills grouped with counts', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [
          { skill: 'Carpentry', count: '45' },
          { skill: 'Tailoring', count: '30' },
          { skill: 'Plumbing', count: '15' },
        ],
      });

      const result = await ReportService.getSkillsDistribution();

      expect(mockDbExecute).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ skill: 'Carpentry', count: 45 });
      expect(result[1]).toEqual({ skill: 'Tailoring', count: 30 });
      expect(result[2]).toEqual({ skill: 'Plumbing', count: 15 });
    });

    it('should return empty array when no submissions have rawData', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [] });

      const result = await ReportService.getSkillsDistribution();

      expect(result).toEqual([]);
    });

    it('should handle null skill values as Unknown', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [
          { skill: null, count: '10' },
          { skill: 'Welding', count: '5' },
        ],
      });

      const result = await ReportService.getSkillsDistribution();

      expect(result[0].skill).toBe('Unknown');
      expect(result[1].skill).toBe('Welding');
    });
  });

  describe('getLgaBreakdown', () => {
    it('should return all LGAs with respondent counts', async () => {
      mockDbExecute.mockResolvedValueOnce({
        rows: [
          { lgaCode: 'ibadan-north', lgaName: 'Ibadan North', count: '50' },
          { lgaCode: 'ibadan-south-east', lgaName: 'Ibadan South East', count: '30' },
          { lgaCode: 'ogbomosho-north', lgaName: 'Ogbomosho North', count: '0' },
        ],
      });

      const result = await ReportService.getLgaBreakdown();

      expect(mockDbExecute).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        lgaCode: 'ibadan-north',
        lgaName: 'Ibadan North',
        count: 50,
      });
      expect(result[2].count).toBe(0);
    });

    it('should return empty array when no LGAs exist', async () => {
      mockDbExecute.mockResolvedValueOnce({ rows: [] });

      const result = await ReportService.getLgaBreakdown();

      expect(result).toEqual([]);
    });
  });

  describe('getRegistrationTrends', () => {
    it('should return daily registration counts for 7 days', async () => {
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          { date: '2026-02-16', count: '10' },
          { date: '2026-02-17', count: '15' },
          { date: '2026-02-18', count: '8' },
        ]),
      );

      const result = await ReportService.getRegistrationTrends(7);

      expect(mockDbSelect).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: '2026-02-16', count: 10 });
    });

    it('should return daily registration counts for 30 days', async () => {
      mockDbSelect.mockReturnValueOnce(
        makeChain([
          { date: '2026-01-23', count: '5' },
          { date: '2026-02-22', count: '20' },
        ]),
      );

      const result = await ReportService.getRegistrationTrends(30);

      expect(mockDbSelect).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(2);
    });

    it('should return empty array when no registrations in period', async () => {
      mockDbSelect.mockReturnValueOnce(makeChain([]));

      const result = await ReportService.getRegistrationTrends(7);

      expect(result).toEqual([]);
    });
  });
});
